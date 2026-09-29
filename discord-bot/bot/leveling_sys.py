"""Murabot Leveling engine — ONE canonical implementation for Discord and
the dashboard bridge.

Formula (spec): XP needed for next level n = 5*n^2 + 50*n + 100.
Levels are threshold-based: total(L) = sum of need(1..L); a member's level
is the largest L with total(L) <= xp. All XP writes are atomic guarded
updates; rewards, announcements and backups are idempotent per level.
"""

import io
import logging
import random
from datetime import datetime, timedelta, timezone

log = logging.getLogger("bot.leveling_sys")


def _now():
    return datetime.now(timezone.utc)


# ── Formula (pure — hermetic unit tests) ──────────────────────────────
def need_for_level(n: int) -> int:
    """XP required to go from level n-1 to level n (n >= 1)."""
    n = max(1, int(n))
    return 5 * n * n + 50 * n + 100


def total_for_level(level: int) -> int:
    """Cumulative XP required to HAVE reached `level`."""
    level = max(0, int(level))
    return sum(need_for_level(k) for k in range(1, level + 1))


def level_from_xp(xp: int) -> tuple[int, int, int]:
    """(level, xp_into_level, xp_needed_for_next). Monotonic, no gaps."""
    xp = max(0, int(xp))
    level = 0
    while xp >= total_for_level(level + 1):
        level += 1
        if level > 10000:
            break
    base = total_for_level(level)
    return level, xp - base, need_for_level(level + 1)


LEVEL_DEFAULTS: dict = {
    "xpMin": 15,
    "xpMax": 25,
    "xpCooldownSec": 60,
    "voiceXp": False,
    "voiceXpAmount": 10,
    "blacklistedChannels": [],
    "blacklistedRoles": [],
    "levelUpChannelId": "",
    "levelUpMessage": "{user} reached **Level {level}**!",
    "dmNotify": False,
    "rewardReplace": True,
    "announceMinLevel": 1,
    "announceMod": 0,
    "rewardOnly": False,
    "cardColor": "#5865F2",
    "cardOpacity": 1.0,
    "serverBackground": "night-campus",
    "rewards": {},
}


# ── Server card backgrounds (built-in themes, zero network) ─────────────
# The dashboard selector and /level serverbackground write one of these ids
# into cfg["serverBackground"]. There is deliberately NO URL support: old
# URL values resolve to the default (never crash, never fetch).
SERVER_CARD_DEFAULT = "night-campus"

SERVER_CARD_BACKGROUNDS: dict = {
    "night-campus": {
        "name": "Night Campus", "emoji": "🌙",
        "sky": [(10, 10, 36), (20, 20, 54), (42, 42, 94)],
        "star": (255, 255, 255), "starCount": 44, "glow": (255, 214, 10),
    },
    "deep-space": {
        "name": "Deep Space", "emoji": "🌌",
        "sky": [(2, 2, 12), (8, 8, 40), (16, 16, 72)],
        "star": (255, 255, 255), "starCount": 60, "glow": (72, 149, 239),
    },
    "mystic-forest": {
        "name": "Mystic Forest", "emoji": "🌲",
        "sky": [(4, 20, 14), (10, 42, 28), (22, 78, 48)],
        "star": (234, 255, 234), "starCount": 36, "glow": (6, 214, 160),
    },
    "neon-city": {
        "name": "Neon City", "emoji": "🏙️",
        "sky": [(13, 3, 24), (32, 10, 56), (74, 20, 92)],
        "star": (255, 233, 196), "starCount": 30, "glow": (255, 77, 216),
    },
    "fantasy-castle": {
        "name": "Fantasy Castle", "emoji": "🏰",
        "sky": [(10, 6, 24), (24, 16, 64), (52, 36, 110)],
        "star": (230, 220, 255), "starCount": 44, "glow": (150, 110, 255),
    },
    "arcade": {
        "name": "Arcade", "emoji": "🎮",
        "sky": [(18, 4, 31), (36, 16, 64), (74, 28, 96)],
        "star": (255, 214, 255), "starCount": 34, "glow": (200, 80, 255),
    },
    "sunset": {
        "name": "Sunset", "emoji": "🌅",
        "sky": [(28, 11, 38), (110, 40, 60), (214, 110, 50)],
        "star": (255, 233, 196), "starCount": 22, "glow": (255, 150, 80),
    },
    "sky": {
        "name": "Sky", "emoji": "☁️",
        "sky": [(18, 57, 94), (44, 110, 170), (110, 175, 210)],
        "star": (255, 255, 255), "starCount": 16, "glow": (255, 255, 255),
    },
    "midnight": {
        "name": "Midnight", "emoji": "🌑",
        "sky": [(2, 2, 7), (6, 6, 20), (14, 14, 36)],
        "star": (207, 224, 255), "starCount": 52, "glow": (72, 149, 239),
    },
    "muragoods": {
        "name": "Muragoods", "emoji": "✨",
        "sky": [(13, 13, 40), (40, 24, 90), (120, 30, 60)],
        "star": (255, 255, 255), "starCount": 40, "glow": (88, 101, 242),
    },
}


def resolve_server_background(value: object) -> str:
    """Canonical theme id, or the default. Old URL values (and any junk)
    resolve to the default: never crash, never fetch."""
    if isinstance(value, str) and value in SERVER_CARD_BACKGROUNDS:
        return value
    return SERVER_CARD_DEFAULT


def server_background_meta(theme_id: str) -> dict:
    return SERVER_CARD_BACKGROUNDS.get(theme_id) or SERVER_CARD_BACKGROUNDS[SERVER_CARD_DEFAULT]


def render_card_background(theme_id: str, w: int = 900, h: int = 260):
    """Generate the card backdrop internally (Pillow). Deterministic per
    theme: gradient sky + seeded stars + accent glow + vignette."""
    from PIL import Image, ImageDraw  # type: ignore
    import random as _random
    import zlib as _zlib
    t = server_background_meta(resolve_server_background(theme_id))
    stops = t["sky"]
    img = Image.new("RGBA", (w, h), stops[0] + (255,))
    top = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_top = ImageDraw.Draw(top)
    for y in range(h):
        f = y / max(1, h - 1)
        if f < 0.5:
            g = f * 2.0
            a, b = stops[0], stops[1]
        else:
            g = (f - 0.5) * 2.0
            a, b = stops[1], stops[2]
        draw_top.line([(0, y), (w, y)],
                      fill=(int(a[0] + (b[0] - a[0]) * g),
                            int(a[1] + (b[1] - a[1]) * g),
                            int(a[2] + (b[2] - a[2]) * g), 255))
    img = Image.alpha_composite(img, top)
    rng = _random.Random(_zlib.crc32(resolve_server_background(theme_id).encode()))
    draw = ImageDraw.Draw(img)
    sr, sg, sb = t["star"]
    for _ in range(int(t.get("starCount", 40))):
        x, y = rng.uniform(0, w), rng.uniform(0, h * 0.8)
        r = rng.choice([1, 1, 1, 2])
        alpha = rng.randint(60, 200)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(sr, sg, sb, alpha))
    gr, gg, gb = t["glow"]
    glow_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow_layer).ellipse(
        [int(w * 0.55), int(h * 0.35), w + 60, h + 60],
        fill=(gr, gg, gb, 46))
    img = Image.alpha_composite(img, glow_layer)
    vig = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_v = ImageDraw.Draw(vig)
    for y in range(h):
        a = int(90 * (y / max(1, h - 1)) ** 1.6)
        draw_v.line([(0, y), (w, y)], fill=(0, 0, 0, a))
    return Image.alpha_composite(img, vig)


async def get_level_config(db, guild_id: int) -> dict:
    """Per-guild leveling tuning; the dashboard writes the same document."""
    cfg = dict(LEVEL_DEFAULTS)
    try:
        doc = await db.guild_config.find_one({"guildId": str(guild_id)})
        if doc and isinstance(doc.get("leveling"), dict):
            stored = doc["leveling"]
            for key, value in stored.items():
                if key in cfg:
                    cfg[key] = value
            # Backward compatibility with the pre-spec dashboard keys.
            if "xpPerMessage" in stored and "xpMax" not in stored:
                try:
                    cfg["xpMax"] = max(1, min(int(stored["xpPerMessage"]), 100))
                except (TypeError, ValueError):
                    pass
            if "xpCooldown" in stored and "xpCooldownSec" not in stored:
                try:
                    cfg["xpCooldownSec"] = max(5, min(int(stored["xpCooldown"]), 3600))
                except (TypeError, ValueError):
                    pass
            if "xpChannelId" in stored and not stored.get("levelUpChannelId"):
                cfg["levelUpChannelId"] = str(stored.get("xpChannelId") or "")
            merged_rewards = dict(cfg.get("rewards") or {})
            for legacy in ("reward5", "reward10", "reward25", "reward50", "reward100"):
                if stored.get(legacy) and legacy[6:] not in merged_rewards:
                    merged_rewards[legacy[6:]] = str(stored[legacy])
            cfg["rewards"] = merged_rewards
    except Exception:
        pass
    if not isinstance(cfg.get("blacklistedChannels"), list):
        cfg["blacklistedChannels"] = []
    if not isinstance(cfg.get("blacklistedRoles"), list):
        cfg["blacklistedRoles"] = []
    if not isinstance(cfg.get("rewards"), dict):
        cfg["rewards"] = {}
    # Server card background is a built-in theme id. Legacy URL values are
    # ignored (default) rather than fetched — never crash on old configs.
    cfg["serverBackground"] = resolve_server_background(cfg.get("serverBackground"))
    return cfg


def member_excluded(member_roles: list, channel_id: int, cfg: dict) -> str | None:
    """Why a message earns no XP (None = eligible). Pure function."""
    try:
        if str(channel_id) in {str(c) for c in (cfg.get("blacklistedChannels") or [])}:
            return "channel blacklisted"
        banned = {str(r) for r in (cfg.get("blacklistedRoles") or [])}
        for role in member_roles or []:
            if str(getattr(role, "id", role)) in banned:
                return "role blacklisted"
    except Exception:
        return "check failed"
    return None


async def add_xp(db, guild_id: int, user_id: int, amount: int) -> tuple[int, int, int, bool]:
    """Atomically add XP (clamped >= 0 total). Returns (xp, level, into, leveled_up).

    `leveled_up` compares against the stored level so repeat calls cannot
    double-announce: the stored level only moves forward on real crossings.
    """
    gid, uid = int(guild_id), int(user_id)
    amount = max(0, int(amount))
    doc = await db.xp.find_one_and_update(
        {"guildId": gid, "userId": uid},
        {"$inc": {"xp": amount}, "$set": {"lastXp": _now()},
         "$setOnInsert": {"level": 0}},
        upsert=True, return_document=True,
    )
    xp = max(0, int(doc.get("xp", 0)))
    if xp != doc.get("xp", 0):
        await db.xp.update_one({"_id": doc["_id"]}, {"$set": {"xp": xp}})
    level, into, _ = level_from_xp(xp)
    old_level = int(doc.get("level", 0) or 0)
    leveled = level > old_level
    if leveled:
        await db.xp.update_one({"_id": doc["_id"]}, {"$set": {"level": level}})
    return xp, level, into, leveled


async def set_xp(db, guild_id: int, user_id: int, xp: int) -> tuple[int, int]:
    xp = max(0, min(int(xp), 10_000_000))
    level, _, _ = level_from_xp(xp)
    await db.xp.update_one(
        {"guildId": int(guild_id), "userId": int(user_id)},
        {"$set": {"xp": xp, "level": level, "lastXp": _now()}}, upsert=True)
    return xp, level


async def set_level(db, guild_id: int, user_id: int, level: int) -> tuple[int, int]:
    level = max(0, min(int(level), 100))
    xp = total_for_level(level)
    await db.xp.update_one(
        {"guildId": int(guild_id), "userId": int(user_id)},
        {"$set": {"xp": xp, "level": level, "lastXp": _now()}}, upsert=True)
    return xp, level


async def reset_member(db, guild_id: int, user_id: int) -> bool:
    res = await db.xp.delete_one({"guildId": int(guild_id), "userId": int(user_id)})
    return res.deleted_count > 0


async def backup_guild(db, guild_id: int) -> int:
    """Snapshot all XP rows (capped). Returns entry count."""
    gid = int(guild_id)
    rows = await db.xp.find({"guildId": gid}).to_list(20000)
    entries = [{"userId": r.get("userId"), "xp": int(r.get("xp", 0)),
                "level": int(r.get("level", 0) or 0)} for r in rows]
    await db.xp_backups.insert_one(
        {"guildId": gid, "takenAt": _now(), "entries": entries})
    await db.xp_backups.delete_many({
        "_id": {"$nin": [d["_id"] for d in await db.xp_backups.find({"guildId": gid})
                         .sort("takenAt", -1).limit(3).to_list(3)]},
        "guildId": gid})
    return len(entries)


async def reset_guild(db, guild_id: int) -> int:
    await backup_guild(db, guild_id)
    res = await db.xp.delete_many({"guildId": int(guild_id)})
    return res.deleted_count


async def restore_guild(db, guild_id: int) -> tuple[bool, int]:
    """Restore the most recent backup (idempotent per backup doc)."""
    gid = int(guild_id)
    snap = await db.xp_backups.find({"guildId": gid}).sort("takenAt", -1).limit(1).to_list(1)
    if not snap:
        return False, 0
    snap = snap[0]
    if snap.get("restored"):
        return True, 0
    for entry in snap.get("entries") or []:
        try:
            await db.xp.update_one(
                {"guildId": gid, "userId": int(entry["userId"])},
                {"$set": {"xp": int(entry.get("xp", 0)),
                          "level": int(entry.get("level", 0) or 0)}},
                upsert=True)
        except Exception:
            continue
    await db.xp_backups.update_one({"_id": snap["_id"]}, {"$set": {"restored": True}})
    return True, len(snap.get("entries") or [])


async def log_level_up(db, guild_id: int, user_id: int, old: int, new: int) -> None:
    try:
        await db.level_events.insert_one({
            "guildId": int(guild_id), "userId": int(user_id),
            "oldLevel": old, "newLevel": new, "at": _now()})
    except Exception:
        pass


async def recent_level_ups(db, guild_id: int, limit: int = 10) -> list[dict]:
    try:
        cur = db.level_events.find({"guildId": int(guild_id)}).sort("at", -1).limit(limit)
        return await cur.to_list(limit)
    except Exception:
        return []


async def top_xp(db, guild_id: int, limit: int = 10, skip: int = 0) -> list[dict]:
    limit = max(1, min(limit, 25))
    try:
        cur = db.xp.find({"guildId": int(guild_id)}).sort("xp", -1).skip(max(0, skip)).limit(limit)
        return await cur.to_list(limit)
    except Exception:
        return []


def should_announce(level: int, cfg: dict, has_reward: bool) -> bool:
    if level < int(cfg.get("announceMinLevel", 1) or 1):
        return False
    mod = int(cfg.get("announceMod", 0) or 0)
    if mod > 1 and level % mod != 0:
        return False
    if cfg.get("rewardOnly") and not has_reward:
        return False
    return True


def render_message(template: str, user_mention: str, level: int, xp: int) -> str:
    try:
        return str(template or "").format(
            user=user_mention, level=level, xp=xp)[:500] or f"{user_mention} reached **Level {level}**!"
    except Exception:
        return f"{user_mention} reached **Level {level}**!"


# ── Level card (Pillow PNG; graceful text fallback without it) ─────────
def render_level_card(username: str, avatar_bytes: bytes | None, level: int,
                      xp_into: int, xp_need: int, rank: int,
                      accent: str = "#5865F2", opacity: float = 1.0,
                      background_bytes: bytes | None = None,
                      background_id: str | None = None) -> tuple[str, bytes | None]:
    """Returns (kind, payload): ('png', bytes) or ('text', fallback-text).

    Backdrop precedence: explicit `background_bytes` (e.g. a member's own
    image) first, then the built-in `background_id` theme (server default),
    then the plain base. Never raises: without Pillow (or on any render
    error) callers get a styled text card instead of a crash.
    """
    progress = min(1.0, max(0.0, (xp_into / xp_need) if xp_need else 0.0))
    try:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore
    except Exception:
        bar = "▰" * int(progress * 18) + "▱" * (18 - int(progress * 18))
        return ("text",
                f"**{username}** — Level **{level}** (rank #{rank})\n"
                f"{xp_into}/{xp_need} XP {bar}".encode("utf-8", "replace"))
    try:
        import io as _io
        W, H = 900, 260
        base = Image.new("RGBA", (W, H), (24, 24, 30, 255))
        backdrop = None
        if background_bytes:
            try:
                backdrop = Image.open(_io.BytesIO(background_bytes)).convert("RGBA").resize((W, H))
            except Exception:
                backdrop = None
        if backdrop is None and background_id:
            try:
                backdrop = render_card_background(background_id, W, H)
            except Exception:
                backdrop = None
        if backdrop is not None:
            if opacity < 1.0:
                overlay = Image.new("RGBA", (W, H), (18, 18, 24, int(255 * (1.0 - opacity))))
                backdrop = Image.alpha_composite(backdrop, overlay)
            base = backdrop
        draw = ImageDraw.Draw(base)
        try:
            font_big = ImageFont.truetype("arial.ttf", 56)
            font_small = ImageFont.truetype("arial.ttf", 30)
        except Exception:
            font_big = ImageFont.load_default()
            font_small = ImageFont.load_default()
        if avatar_bytes:
            try:
                avatar = Image.open(_io.BytesIO(avatar_bytes)).convert("RGBA").resize((150, 150))
                mask = Image.new("L", (150, 150), 0)
                ImageDraw.Draw(mask).ellipse((0, 0, 150, 150), fill=255)
                base.paste(avatar, (40, 55), mask)
            except Exception:
                pass
        try:
            r, g, b = int(accent[1:3], 16), int(accent[3:5], 16), int(accent[5:7], 16)
        except Exception:
            r, g, b = 88, 101, 242
        draw.text((220, 40), username[:24], font=font_big, fill=(255, 255, 255, 255))
        draw.text((220, 110), f"LEVEL {level}   •   RANK #{rank}", font=font_small,
                  fill=(r, g, b, 255))
        draw.rounded_rectangle((220, 165, 840, 200), radius=14, fill=(255, 255, 255, 40))
        draw.rounded_rectangle((220, 165, 220 + int(620 * progress), 200), radius=14,
                               fill=(r, g, b, 255))
        draw.text((220, 210), f"{xp_into} / {xp_need} XP", font=font_small,
                  fill=(200, 200, 200, 255))
        buf = _io.BytesIO()
        base.convert("RGB").save(buf, format="PNG")
        return ("png", buf.getvalue())
    except Exception:
        bar = "▰" * int(progress * 18) + "▱" * (18 - int(progress * 18))
        return ("text",
                f"**{username}** — Level **{level}** (rank #{rank})\n"
                f"{xp_into}/{xp_need} XP {bar}".encode("utf-8", "replace"))
