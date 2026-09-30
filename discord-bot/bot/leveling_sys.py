"""Murabot Leveling engine — ONE canonical implementation for Discord and
the dashboard bridge.

Formula (spec): XP needed for next level n = 5*n^2 + 50*n + 100.
Levels are threshold-based: total(L) = sum of need(1..L); a member's level
is the largest L with total(L) <= xp. All XP writes are atomic guarded
updates; rewards, announcements and backups are idempotent per level.
"""

import io
import logging
import os as _os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path as _Path

log = logging.getLogger("bot.leveling_sys")


def _now():
    return datetime.now(timezone.utc)


# ── Safe coercion (every value here arrives from Mongo, never from Discord) ──
# Guild config and XP rows are written by the dashboard, by older bot versions
# and by hand. That means a field typed `int` in Python can be sitting in the
# database as None, "", "undefined", a float, or a string. Every one of those
# reaches `int()`/`float()` somewhere downstream, and the previous code did
# that conversion bare, so a single malformed row turned a slash command into
# an unhandled ValueError with no indication of which field was bad. These
# helpers never raise: they return a usable default so the command degrades to
# "no XP yet" instead of erroring out.
_TRUE = {"1", "true", "yes", "on", "t", "y"}


def safe_int(value: object, default: int = 0, *, low: int | None = None,
             high: int | None = None) -> int:
    """int(value) that never raises. Floats truncate; junk returns `default`."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        out = value
    elif isinstance(value, float):
        out = int(value)
    elif isinstance(value, str):
        text = value.strip()
        try:
            out = int(text)
        except ValueError:
            try:
                number = float(text)  # "12.0" / "1e3"
            except (ValueError, OverflowError):
                out = default
            else:
                # "1e400" parses to inf, and int(inf) raises OverflowError, so
                # the non-finite check has to happen before the conversion.
                if number != number or number in (float("inf"), float("-inf")):
                    out = default
                else:
                    out = int(number)
    else:
        out = default
    if low is not None:
        out = max(low, out)
    if high is not None:
        out = min(high, out)
    return out


def safe_float(value: object, default: float = 0.0, *, low: float | None = None,
               high: float | None = None) -> float:
    """float(value) that never raises. Junk returns `default`."""
    if isinstance(value, bool):
        out = float(value)
    elif isinstance(value, (int, float)):
        try:
            out = float(value)
        except (OverflowError, ValueError):
            out = default
    elif isinstance(value, str):
        try:
            out = float(value.strip())
        except ValueError:
            out = default
    else:
        out = default
    if out != out or out in (float("inf"), float("-inf")):  # NaN / inf
        out = default
    if low is not None:
        out = max(low, out)
    if high is not None:
        out = min(high, out)
    return out


def safe_bool(value: object, default: bool = False) -> bool:
    """bool() that treats the string forms a dashboard form actually posts."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in _TRUE:
            return True
        if text in {"0", "false", "no", "off", "f", "n", ""}:
            return False
        return default
    return default


def safe_snowflake(value: object, default: int = 0) -> int:
    """Discord IDs arrive as int in Mongo and as str from the dashboard.
    Anything unparseable becomes `default` rather than raising ValueError."""
    return safe_int(value, default)


# ── Formula (pure — hermetic unit tests) ──────────────────────────────
def need_for_level(n: int) -> int:
    """XP required to go from level n-1 to level n (n >= 1)."""
    n = max(1, safe_int(n, 1))
    return 5 * n * n + 50 * n + 100


def total_for_level(level: int) -> int:
    """Cumulative XP required to HAVE reached `level`."""
    level = max(0, safe_int(level, 0))
    return sum(need_for_level(k) for k in range(1, level + 1))


def level_from_xp(xp: int) -> tuple[int, int, int]:
    """(level, xp_into_level, xp_needed_for_next). Monotonic, no gaps.

    `xp` is normalized with safe_int so a row storing XP as a string (or as
    None/absent) is still ranked instead of raising ValueError.
    """
    xp = max(0, safe_int(xp, 0))
    level = 0
    while xp >= total_for_level(level + 1):
        level += 1
        if level > 10000:
            break
    base = total_for_level(level)
    return level, xp - base, need_for_level(level + 1)


async def display_name_for(guild, user_id) -> tuple[str, int]:
    """(display name, user id) for leaderboard lines, resolved LIVE from the
    guild so nickname changes show up with no database edits.

    Precedence: server nickname → display name → username → "Unknown User".
    Never raises and never exposes anything but the name; the numeric id is
    returned alongside only so callers can keep Discord mentions working.
    """
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return "Unknown User", 0
    member = None
    try:
        member = guild.get_member(uid)
    except Exception:
        member = None
    if member is None and hasattr(guild, "fetch_member"):
        try:
            member = await guild.fetch_member(uid)
        except Exception:
            member = None
    if member is None:
        return "Unknown User", uid
    name = (getattr(member, "nick", None)
            or getattr(member, "display_name", None)
            or getattr(member, "name", None)
            or getattr(member, "global_name", None)
            or "Unknown User")
    return str(name), uid


#: The asset used when a guild has never chosen one. Declared BEFORE
#: LEVEL_DEFAULTS because that dict now derives its two background keys from it
#: — defining it afterwards would make LEVEL_DEFAULTS a NameError at import,
#: and a second literal here is how the two defaults drift apart again.
SERVER_CARD_DEFAULT = "duck-toast"

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
    # CANONICAL field. This is the name the dashboard documents, the one
    # POST /leveling/config writes as the source of truth, the one
    # GET /leveling/background reports as `field`, and the one the renderer
    # resolves. It MUST be a key here: `get_level_config` only copies stored
    # keys that exist in LEVEL_DEFAULTS, so a name missing from this dict is
    # dropped on every read and the card silently falls back to the default.
    # That is exactly the bug this entry fixes.
    "server_card_background": SERVER_CARD_DEFAULT,
    # Legacy alias, still written so existing readers keep working. It is
    # normalised to the canonical value on every read, so the two can never
    # disagree — there is one source of truth, not two competing ones.
    "serverBackground": SERVER_CARD_DEFAULT,
    "rewards": {},
}


# ── Server card backgrounds (imported picture assets, zero network) ───
# The dashboard selector and /leveling serverbackground write one of these ids
# into cfg["serverBackground"]. There is deliberately NO URL support and NO
# generated-theme fallback: legacy theme ids and old URL values resolve to
# the default asset. The bot mirrors the site's
# public/images/level-backgrounds/ files locally (Render deploys only
# discord-bot/, so the site copy is unreachable at runtime).
_LEVEL_BG_DIR = _Path(__file__).resolve().parent / "assets" / "level_backgrounds"

#: Set MURA_LEVEL_CARD_DEBUG=1 to log which theme each rendered card used.
#: Level cards are rendered on demand and are rare, so one diagnostic line per
#: card is cheap and is the only way to tell "the selection is being ignored"
#: apart from "the render failed" in production. Set to 0 to silence.
_DEBUG_CARD_BACKGROUND = str(_os.environ.get("MURA_LEVEL_CARD_DEBUG", "1")).strip() not in ("", "0", "false", "False")

SERVER_CARD_BACKGROUNDS: dict = {
    "duck-toast": {
        "name": "Duck & Toast", "emoji": "🍞", "file": "duck-toast.jpg",
    },
    "frog-meadow": {
        "name": "Meadow Friend", "emoji": "🌱", "file": "frog-meadow.jpg",
    },
    "frog-pond": {
        "name": "Lily Pond", "emoji": "🪷", "file": "frog-pond.jpg",
    },
    "goldfish-glass": {
        "name": "Goldfish Glow", "emoji": "🐠", "file": "goldfish-glass.jpg",
    },
    "starry-duck": {
        "name": "Starry Companion", "emoji": "🌌", "file": "starry-duck.jpg",
    },
    "chick-lily": {
        "name": "Lily Rest", "emoji": "🐤", "file": "chick-lily.jpg",
    },
    "frog-sky": {
        "name": "Sky Gaze", "emoji": "🐸", "file": "frog-sky.jpg",
    },
    "pixel-sunset": {
        "name": "Pixel Sunset", "emoji": "🌅", "file": "pixel-sunset.jpg",
    },
}


def resolve_server_background(value: object) -> str:
    """Canonical asset id, or the default. Legacy theme ids, old URL values
    (and any junk) resolve to the default: never crash, never fetch."""
    if isinstance(value, str) and value in SERVER_CARD_BACKGROUNDS:
        return value
    return SERVER_CARD_DEFAULT


def coerce_server_background(canonical: object, legacy: object) -> str:
    """Reconcile the canonical field and its legacy alias into ONE theme id.

    The canonical `server_card_background` wins whenever it holds a theme we
    recognise. The alias is consulted only when the canonical field is absent,
    empty, or a value that no longer exists — which is what keeps a guild saved
    by an older dashboard build (or by hand) rendering its selection instead of
    reverting to the default.

    Both fields are then written back with this same value, so the two can never
    drift apart and no reader can observe a disagreement between them.
    """
    for candidate in (canonical, legacy):
        if isinstance(candidate, str) and candidate in SERVER_CARD_BACKGROUNDS:
            return candidate
    return SERVER_CARD_DEFAULT


def server_background_meta(theme_id: str) -> dict:
    return SERVER_CARD_BACKGROUNDS.get(theme_id) or SERVER_CARD_BACKGROUNDS[SERVER_CARD_DEFAULT]


# ── The one resolver every level card goes through ─────────────────────
# The dashboard writes `cfg["serverBackground"]`; `/level`, the automatic
# level-up card, and any future card must all read it through HERE. Each call
# site resolving its own default is how a selected background ended up applied
# to `/level` but not to level-ups.
#
# `source` is carried only for the debug line, so a mismatch between what the
# dashboard shows and what a card rendered can be traced to a guild id and a
# theme id without exposing anything sensitive.
def get_level_card_background(cfg: dict, *, guild_id: int | None = None,
                              source: str = "database") -> str:
    """Resolve the theme id for this guild's level cards.

    Falls back to the default ONLY when the guild has never chosen one (or
    chose one that no longer exists) — a valid selection is never replaced.

    Reads BOTH stored spellings. `server_card_background` is the documented
    name and is the source of truth; `serverBackground` is the legacy alias the
    dashboard has always written. `normalize_level_config` keeps the two in
    sync, so by the time a config reaches here they agree and the ordering
    below only matters for a dict assembled by hand.
    """
    stored = cfg or {}
    raw = stored.get("server_card_background")
    if raw is None:
        raw = stored.get("serverBackground")
    theme = coerce_server_background(
        stored.get("server_card_background"), stored.get("serverBackground"))
    if raw is not None and raw != theme:
        # The stored value is not a theme we know. Fall back rather than crash,
        # and ALWAYS report it: a silent fallback here is indistinguishable
        # from the dashboard setting having no effect.
        print(f"INVALID_LEVEL_BACKGROUND_THEME guild_id={guild_id} "
              f"invalidThemeId={raw!r} defaultTheme={theme}")
    return theme


async def resolve_level_background(db, guild_id: int, *, cfg: dict | None = None,
                                   source: str = "database") -> str:
    """THE background resolver. Every level card goes through this.

    1. Reads the guild's live configuration (no cache — a dashboard save is
       visible on the very next `/level`, with no bot restart and no
       redeploy; see `get_level_config`, which queries Mongo on every call).
    2. Reads the canonical `server_card_background` field.
    3. Resolves the theme id to the real asset, verifying the file is present.
    4. Returns the theme id the renderer must draw.

    `cfg` may be passed when the caller already read the configuration, to
    avoid a second query; it is still routed through this function so there is
    exactly one resolution path.

    Emits the diagnostic block immediately before the background is drawn, so a
    mismatch between what the dashboard shows and what Discord renders can be
    traced to a guild id and a theme id. It prints a guild id and a theme id —
    never a token, URI or other secret.
    """
    config = cfg if isinstance(cfg, dict) else await get_level_config(db, guild_id)
    theme = get_level_card_background(config, guild_id=guild_id, source=source)
    meta = server_background_meta(theme)
    asset_name = str(meta.get("file") or "")
    asset_path = _LEVEL_BG_DIR / asset_name
    if _DEBUG_CARD_BACKGROUND:
        print(f"LEVEL CARD RENDER:\n"
              f"  guildId = {guild_id}\n"
              f"  configuredBackground = {config.get('server_card_background')!r}\n"
              f"  resolvedBackground = {theme} (asset={asset_name}, "
              f"present={asset_path.is_file()})\n"
              f"  renderer = render_level_card (source={source})")
    if not asset_path.is_file():
        # A missing asset produced a flat dark card indistinguishable from
        # "the setting does nothing". Always report, never silently substitute.
        print(f"LEVEL_BACKGROUND_ASSET_ERROR theme={theme} "
              f"asset={_LEVEL_BG_DIR.name}/{asset_name}")
    return theme


def render_card_background(theme_id: str, w: int = 900, h: int = 260):
    """Backdrop from an imported picture asset (local file, zero network).
    Cover-fit (scale to fill, center-crop — never stretch) plus a
    readability overlay (dark gradient, bottom-weighted) so card text stays
    legible on any artwork. Missing/unreadable file → dark solid fallback."""
    from PIL import Image, ImageDraw  # type: ignore
    base = Image.new("RGBA", (w, h), (20, 20, 28, 255))
    resolved = resolve_server_background(theme_id)
    meta = server_background_meta(resolved)
    asset_name = str(meta.get("file") or "")
    asset_path = _LEVEL_BG_DIR / asset_name
    if _DEBUG_CARD_BACKGROUND:
        print(f"LEVEL CARD RENDER: theme={resolved} asset={asset_name} "
              f"assetPresent={asset_path.is_file()}")
    try:
        art = Image.open(asset_path).convert("RGBA")
        scale = max(w / max(1, art.width), h / max(1, art.height))
        art = art.resize((max(1, int(art.width * scale)), max(1, int(art.height * scale))))
        left = max(0, (art.width - w) // 2)
        top = max(0, (art.height - h) // 2)
        art = art.crop((left, top, left + w, top + h))
        base = Image.alpha_composite(base, art)
    except Exception as exc:
        # NEVER swallow this. A missing or unreadable asset produced a flat dark
        # card that is indistinguishable from "the background setting does
        # nothing" — which is exactly the bug this diagnostic exists to expose.
        print(f"LEVEL_BACKGROUND_ASSET_ERROR theme={resolved} "
              f"asset={_LEVEL_BG_DIR.name}/{asset_name} detail={type(exc).__name__}")
    shade = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shade)
    for y in range(h):
        f = y / max(1, h - 1)
        a = int(90 + 80 * (f ** 1.4))
        draw.line([(0, y), (w, y)], fill=(8, 8, 14, min(255, a)))
    return Image.alpha_composite(base, shade)


async def get_level_config(db, guild_id: int) -> dict:
    """Per-guild leveling tuning; the dashboard writes the same document."""
    cfg = dict(LEVEL_DEFAULTS)
    try:
        doc = await db.guild_config.find_one({"guildId": str(guild_id)})
        if doc and isinstance(doc.get("leveling"), dict):
            stored = doc["leveling"]
            # Promote the legacy alias into the canonical field BEFORE the
            # whitelist merge below. Order matters: that merge only copies keys
            # already present in LEVEL_DEFAULTS, and LEVEL_DEFAULTS carries a
            # DEFAULT for `server_card_background`. Promoting afterwards would
            # therefore be too late — the stored legacy value would lose to the
            # default, and a guild saved by an older dashboard build would
            # render the default background.
            if (stored.get("server_card_background") is None
                    and stored.get("serverBackground") is not None):
                stored = {**stored,
                          "server_card_background": stored.get("serverBackground")}
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
    # Re-type every field. Merging defaults above only covers ABSENT keys, so a
    # present-but-wrongly-typed value (dashboard wrote 0, an old record holds a
    # URL, a hand edit holds a theme id) still reached int()/float() downstream.
    cfg = normalize_level_config(cfg)
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
    gid, uid = safe_int(guild_id, 0), safe_int(user_id, 0)
    amount = max(0, safe_int(amount, 0))
    doc = await db.xp.find_one_and_update(
        {"guildId": gid, "userId": uid},
        {"$inc": {"xp": amount}, "$set": {"lastXp": _now()},
         "$setOnInsert": {"level": 0}},
        upsert=True, return_document=True,
    )
    xp = max(0, safe_int(doc.get("xp", 0), 0))
    if xp != doc.get("xp", 0):
        await db.xp.update_one({"_id": doc["_id"]}, {"$set": {"xp": xp}})
    level, into, _ = level_from_xp(xp)
    old_level = safe_int(doc.get("level", 0), 0)
    leveled = level > old_level
    if leveled:
        await db.xp.update_one({"_id": doc["_id"]}, {"$set": {"level": level}})
    return xp, level, into, leveled


async def set_xp(db, guild_id: int, user_id: int, xp: int) -> tuple[int, int]:
    xp = max(0, min(safe_int(xp, 0), 10_000_000))
    level, _, _ = level_from_xp(xp)
    await db.xp.update_one(
        {"guildId": safe_int(guild_id, 0), "userId": safe_int(user_id, 0)},
        {"$set": {"xp": xp, "level": level, "lastXp": _now()}}, upsert=True)
    return xp, level


async def set_level(db, guild_id: int, user_id: int, level: int) -> tuple[int, int]:
    level = max(0, min(safe_int(level, 0), 100))
    xp = total_for_level(level)
    await db.xp.update_one(
        {"guildId": safe_int(guild_id, 0), "userId": safe_int(user_id, 0)},
        {"$set": {"xp": xp, "level": level, "lastXp": _now()}}, upsert=True)
    return xp, level


async def reset_member(db, guild_id: int, user_id: int) -> bool:
    res = await db.xp.delete_one(
        {"guildId": safe_int(guild_id, 0), "userId": safe_int(user_id, 0)})
    return res.deleted_count > 0


async def backup_guild(db, guild_id: int) -> int:
    """Snapshot all XP rows (capped). Returns entry count."""
    gid = safe_int(guild_id, 0)
    rows = await db.xp.find({"guildId": gid}).to_list(20000)
    entries = [{"userId": r.get("userId"), "xp": safe_int(r.get("xp", 0), 0),
                "level": safe_int(r.get("level", 0), 0)} for r in rows]
    await db.xp_backups.insert_one(
        {"guildId": gid, "takenAt": _now(), "entries": entries})
    await db.xp_backups.delete_many({
        "_id": {"$nin": [d["_id"] for d in await db.xp_backups.find({"guildId": gid})
                         .sort("takenAt", -1).limit(3).to_list(3)]},
        "guildId": gid})
    return len(entries)


async def reset_guild(db, guild_id: int) -> int:
    await backup_guild(db, guild_id)
    res = await db.xp.delete_many({"guildId": safe_int(guild_id, 0)})
    return res.deleted_count


async def restore_guild(db, guild_id: int) -> tuple[bool, int]:
    """Restore the most recent backup (idempotent per backup doc)."""
    gid = safe_int(guild_id, 0)
    snap = await db.xp_backups.find({"guildId": gid}).sort("takenAt", -1).limit(1).to_list(1)
    if not snap:
        return False, 0
    snap = snap[0]
    if snap.get("restored"):
        return True, 0
    for entry in snap.get("entries") or []:
        try:
            await db.xp.update_one(
                {"guildId": gid, "userId": safe_int(entry.get("userId"), 0)},
                {"$set": {"xp": safe_int(entry.get("xp", 0), 0),
                          "level": safe_int(entry.get("level", 0), 0)}},
                upsert=True)
        except Exception:
            continue
    await db.xp_backups.update_one({"_id": snap["_id"]}, {"$set": {"restored": True}})
    return True, len(snap.get("entries") or [])


async def log_level_up(db, guild_id: int, user_id: int, old: int, new: int) -> None:
    try:
        await db.level_events.insert_one({
            "guildId": safe_int(guild_id, 0), "userId": safe_int(user_id, 0),
            "oldLevel": safe_int(old, 0), "newLevel": safe_int(new, 0), "at": _now()})
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


def normalize_level_config(cfg: dict) -> dict:
    """Coerce a guild's stored leveling block into the types the math expects.

    This is the single gate every consumer of guild leveling config goes
    through. `get_level_config` already merged defaults in, but merging only
    fills in *absent* keys — a key that IS present with the wrong type (the
    dashboard's `Number(x) || 0` writes 0, older records hold URLs, a hand edit
    holds a theme id) sailed straight through into `int()`/`float()`. Every
    field is re-typed here so the calculation layer below can treat the values
    as numbers without re-checking them at each call site.
    """
    out = dict(cfg) if isinstance(cfg, dict) else {}
    defaults = LEVEL_DEFAULTS

    # Numeric tuning.
    out["xpMin"] = safe_int(out.get("xpMin"), defaults["xpMin"], low=1, high=100)
    out["xpMax"] = safe_int(out.get("xpMax"), defaults["xpMax"], low=1, high=100)
    if out["xpMax"] < out["xpMin"]:
        out["xpMax"] = out["xpMin"]
    out["xpCooldownSec"] = safe_int(out.get("xpCooldownSec"),
                                   defaults["xpCooldownSec"], low=5, high=3600)
    out["voiceXpAmount"] = safe_int(out.get("voiceXpAmount"),
                                    defaults["voiceXpAmount"], low=0, high=1000)
    out["announceMinLevel"] = safe_int(out.get("announceMinLevel"),
                                       defaults["announceMinLevel"], low=1, high=10000)
    out["announceMod"] = safe_int(out.get("announceMod"), defaults["announceMod"],
                                  low=0, high=10000)
    # Booleans. A dashboard form posts "true"/"false"/1/0, not real bools.
    for key in ("voiceXp", "dmNotify", "rewardReplace", "rewardOnly"):
        out[key] = safe_bool(out.get(key), defaults[key])

    # Text.
    for key in ("levelUpMessage", "levelUpChannelId", "cardColor"):
        value = out.get(key)
        out[key] = value.strip()[:300] if isinstance(value, str) else defaults[key]
    # Only a #rrggbb accent is meaningful; render_level_card falls back safely
    # anyway, but keeping junk out of the config means the card and the
    # /leveling config view can never disagree.
    if not _is_hex_color(out["cardColor"]):
        out["cardColor"] = defaults["cardColor"]
    out["cardOpacity"] = safe_float(out.get("cardOpacity"), defaults["cardOpacity"],
                                   low=0.0, high=1.0)

    # Collections.
    for key in ("blacklistedChannels", "blacklistedRoles"):
        value = out.get(key)
        out[key] = [str(v) for v in value] if isinstance(value, list) else []

    # Level rewards: {level_str: role_id_str}. Level keys are parsed with
    # safe_int so a non-numeric key can never crash a lookup by level.
    raw_rewards = out.get("rewards")
    rewards: dict[str, str] = {}
    if isinstance(raw_rewards, dict):
        for level_key, role_id in raw_rewards.items():
            level = safe_int(level_key, 0)
            if level > 0 and isinstance(role_id, (str, int)) and str(role_id).strip():
                rewards[str(level)] = str(role_id).strip()
    out["rewards"] = rewards

    # Server card background is an imported asset id — never a number, never a
    # URL. The canonical field and its legacy alias are reconciled into ONE
    # value and written back to BOTH, so:
    #   - a record saved under either spelling renders its selection, and
    #   - a consumer reading either field sees the same theme.
    # Writing only one of them is what let the two systems compete: a write
    # that populated the alias left the canonical field stale, and a read that
    # preferred the canonical field then showed the previous background.
    theme = coerce_server_background(
        out.get("server_card_background"), out.get("serverBackground"))
    out["server_card_background"] = theme
    out["serverBackground"] = theme
    return out


def _is_hex_color(value: object) -> bool:
    if not isinstance(value, str) or not value.startswith("#") or len(value) != 7:
        return False
    try:
        int(value[1:], 16)
    except ValueError:
        return False
    return True


def should_announce(level: int, cfg: dict, has_reward: bool) -> bool:
    """Whether a level-up crossing should be announced. Reads the normalized
    config, so every value here is already a real number."""
    level = safe_int(level, 0)
    if level < safe_int(cfg.get("announceMinLevel"), 1, low=1):
        return False
    mod = safe_int(cfg.get("announceMod"), 0, low=0)
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

    Backdrop precedence: explicit `background_bytes` (a member's own image)
    first, then the server's imported-asset `background_id`, then the plain
    base. Never raises: without Pillow (or on any render error) callers get
    a styled text card instead of a crash.
    """
    # Normalize every input here. These arrive from the DB (xp_into/xp_need)
    # and from guild config (accent/opacity), and the previous bare
    # `xp_into / xp_need` raised ValueError on a string row.
    level = safe_int(level, 0)
    rank = safe_int(rank, 0)
    xp_into = max(0, safe_int(xp_into, 0))
    xp_need = max(0, safe_int(xp_need, 0))
    opacity = safe_float(opacity, 1.0, low=0.0, high=1.0)
    accent = accent if _is_hex_color(accent) else LEVEL_DEFAULTS["cardColor"]
    progress = min(1.0, max(0.0, (xp_into / xp_need) if xp_need else 0.0))
    # Resolve the theme HERE, not only at the call sites. An unrecognised,
    # empty or missing id must fall back to the server's default BACKDROP, and
    # a falsy value used to skip the artwork entirely and render a plain card —
    # which looks exactly like "the background setting does nothing".
    #
    # There is deliberately NO way to ask for a backdropless card: a missing
    # theme and a request for "no theme" are indistinguishable here, and
    # guessing wrong renders a blank card. A member's own picture still wins,
    # because `background_bytes` is applied before this backdrop.
    background_id = resolve_server_background(background_id)
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
            # Readability shade (photographic art only — never the flat base):
            # scale darkness to the artwork's own luminance so bright imports
            # get real contrast while dark imports stay visible, then stroke
            # all text below. Keeps the selected picture, guarantees legibility.
            try:
                from PIL import ImageStat as _ImageStat  # type: ignore
                lum = float(_ImageStat.Stat(backdrop.convert("L")).mean[0])
            except Exception:
                lum = 60.0
            shade_alpha = int(max(70, min(170, 190 - lum)))
            read = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            rdraw = ImageDraw.Draw(read)
            for y in range(H):
                f = y / max(1, H - 1)
                a = int(shade_alpha * (0.75 + 0.45 * (f ** 1.3)))
                rdraw.line([(0, y), (W, y)], fill=(8, 8, 14, min(255, a)))
            base = Image.alpha_composite(base, read)
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
                draw = ImageDraw.Draw(base)
                draw.ellipse((40, 55, 190, 205), outline=(255, 255, 255, 110), width=3)
            except Exception:
                pass
        try:
            r, g, b = int(accent[1:3], 16), int(accent[3:5], 16), int(accent[5:7], 16)
        except (ValueError, IndexError, TypeError):
            r, g, b = 88, 101, 242
        draw.text((220, 40), username[:24], font=font_big, fill=(255, 255, 255, 255),
                  stroke_width=2, stroke_fill=(0, 0, 0, 200))
        draw.text((220, 110), f"LEVEL {level}   •   RANK #{rank}", font=font_small,
                  fill=(r, g, b, 255), stroke_width=2, stroke_fill=(0, 0, 0, 200))
        draw.rounded_rectangle((220, 165, 840, 200), radius=14, outline=(0, 0, 0, 160), width=2)
        draw.rounded_rectangle((220, 165, 840, 200), radius=14, fill=(255, 255, 255, 40))
        draw.rounded_rectangle((220, 165, 220 + int(620 * progress), 200), radius=14,
                               fill=(r, g, b, 255))
        draw.text((220, 210), f"{xp_into} / {xp_need} XP", font=font_small,
                  fill=(200, 200, 200, 255), stroke_width=2, stroke_fill=(0, 0, 0, 200))
        buf = _io.BytesIO()
        base.convert("RGB").save(buf, format="PNG")
        return ("png", buf.getvalue())
    except Exception:
        bar = "▰" * int(progress * 18) + "▱" * (18 - int(progress * 18))
        return ("text",
                f"**{username}** — Level **{level}** (rank #{rank})\n"
                f"{xp_into}/{xp_need} XP {bar}".encode("utf-8", "replace"))
