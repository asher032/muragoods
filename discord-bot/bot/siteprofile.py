"""Website collection reads for Murabot — the shared-database half of the
unified profile, with an authenticated bridge fallback.

Two topologies, one code path:
- Same database (local dev / consolidated prod): motor reads the site's
  collections directly through the bot's existing handle.
- Split clusters (current prod): the `users` collection probe misses, and
  every helper transparently uses the secret-authed site bridge
  (`/api/discord?action=profile`) instead. No credentials in code: the
  bridge reuses BRIDGE_SECRET, and privacy is enforced identically.

Discord snowflakes arrive as ints; the website stores discordId as text,
so every lookup normalises with str(). Privacy rules (same as the site):
- own data: always visible
- someone else's game profile: only when privacy.gameProfile == 'public'
- someone else's favorites: only when privacy.favorites == 'public'
- watch history / perks / rewards: never cross-user
"""

import logging
import re

log = logging.getLogger("bot.siteprofile")

# Cached topology probe: None = unprobed, True = site collections present.
_SITE_DB: bool | None = None


def _str(uid) -> str:
    try:
        return str(int(uid))
    except (TypeError, ValueError):
        return str(uid or "")


def _email_rx(email_lc: str) -> dict:
    return {"$regex": f"^{re.escape(email_lc)}$", "$options": "i"}


async def _site_db(db) -> bool:
    """Do the site's collections live on this handle? Cached after first probe."""
    global _SITE_DB
    if _SITE_DB is not None:
        return _SITE_DB
    try:
        names = await db.list_collection_names()
        _SITE_DB = "users" in names
    except Exception as exc:
        log.warning("topology probe failed (%s) — assuming direct reads", type(exc).__name__)
        _SITE_DB = True
    return _SITE_DB


async def _bundle(db, discord_id) -> dict | None:
    """Bridge payload for one Discord id, or None (unlinked/unreachable)."""
    try:
        import bridge as bridge_mod
        data = await bridge_mod.site_profile(discord_id)
    except Exception as exc:
        log.warning("bridge profile failed: %s", type(exc).__name__)
        return None
    if isinstance(data, dict) and data.get("linked"):
        return data
    return None


async def linked_email(db, discord_id) -> str | None:
    """The shop email linked to a Discord id, or None."""
    if await _site_db(db):
        try:
            doc = await db.users.find_one(
                {"discord.discordId": _str(discord_id)}, {"email": 1})
        except Exception:
            return None
        email = (doc or {}).get("email") or ""
        return email.lower() if email else None
    data = await _bundle(db, discord_id)
    email = (data or {}).get("email") or ""
    return email.lower() if email else None


async def privacy_of(db, email_lc: str) -> dict:
    if await _site_db(db):
        try:
            doc = await db.users.find_one(
                {"email": _email_rx(email_lc)}, {"privacy": 1})
        except Exception:
            return {}
        return dict((doc or {}).get("privacy") or {})
    return {}


async def _bridge_profile(db, discord_id) -> dict | None:
    data = await _bundle(db, discord_id)
    return data.get("profile") if isinstance(data, dict) else None


def _level(total_xp: int) -> int:
    return int((max(0, total_xp) / 100) ** 0.5) + 1


async def game_summary(db, email_lc: str, discord_id=None) -> dict:
    """Totals + per-game rows + coin balance for one linked account."""
    out: dict = {"linked": True, "totalXp": 0, "totalPlays": 0,
                 "gamesPlayed": 0, "achievements": [], "coins": 0,
                 "favorites": [], "recent": [], "level": 1, "games": []}
    if not await _site_db(db):
        prof = await _bridge_profile(db, discord_id) if discord_id is not None else None
        if not prof:
            return out
        out.update({
            "totalXp": int(prof.get("totalXp", 0) or 0),
            "totalPlays": int(prof.get("totalPlays", 0) or 0),
            "gamesPlayed": int(prof.get("gamesPlayed", 0) or 0),
            "achievements": list(prof.get("achievements") or []),
            "coins": int(prof.get("coins", 0) or 0),
            "favorites": [str(f.get("title", "")) for f in (prof.get("favorites") or [])
                          if str(f.get("type", "")) == "game"][:5],
            "games": list(prof.get("games") or [])[:5],
        })
        out["level"] = _level(out["totalXp"])
        return out
    try:
        rows = await db.game_progress.find(
            {"userEmail": email_lc}).sort("lastPlayed", -1).to_list(20)
    except Exception:
        rows = []
    for row in rows or []:
        out["totalXp"] += int(row.get("xp", 0) or 0)
        out["totalPlays"] += int(row.get("plays", 0) or 0)
        for ach in row.get("achievements") or []:
            if ach not in out["achievements"]:
                out["achievements"].append(ach)
    out["gamesPlayed"] = len(rows or [])
    out["level"] = _level(out["totalXp"])
    out["games"] = [{
        "gameId": r.get("gameId"), "bestScore": int(r.get("bestScore", 0) or 0),
        "plays": int(r.get("plays", 0) or 0),
    } for r in (rows or [])[:5]]
    try:
        user = await db.users.find_one(
            {"email": _email_rx(email_lc)}, {"coinBalance": 1})
        out["coins"] = int((user or {}).get("coinBalance", 0) or 0)
    except Exception:
        pass
    try:
        favs = await db.user_preferences.find(
            {"userEmail": email_lc, "contentType": "game",
             "action": "favorite"}).sort("createdAt", -1).limit(5).to_list(5)
        out["favorites"] = [
            str((f.get("snapshot") or {}).get("title") or f.get("contentId"))
            for f in favs or []]
    except Exception:
        pass
    return out


async def site_section_for(db, viewer_id, target_id) -> tuple[bool, str]:
    """Games field lines for /profile. Returns (show, text)."""
    try:
        temail = await linked_email(db, target_id)
    except Exception:
        return False, ""
    if not temail:
        if _str(viewer_id) == _str(target_id):
            return True, "🔗 Link Discord at Muragoods → My Muragoods to sync games here."
        return False, ""
    if _str(viewer_id) != _str(target_id):
        if await _site_db(db):
            priv = await privacy_of(db, temail)
        else:
            data = await _bundle(db, target_id)
            priv = (data or {}).get("privacy") or {}
        if priv.get("gameProfile", "public") != "public":
            return True, "🔒 Game profile is private."
    try:
        summary = await game_summary(db, temail, target_id)
    except Exception as exc:
        log.warning("site games read failed: %s", type(exc).__name__)
        return False, ""
    if not summary.get("totalPlays"):
        return True, "🎮 No site games played yet — try the Game Center."
    favs = summary.get("favorites") or []
    lines = (f"🎮 Lv**{summary['level']}** · **{summary['totalXp']:,}** XP · "
             f"**{summary['totalPlays']}** plays · 🏆 **{len(summary['achievements'])}**")
    if favs:
        lines += "\n❤️ " + ", ".join(favs[:3])
    return True, lines


async def favorites_for(db, viewer_id, target_id, content_type: str = "") -> tuple[bool, list[dict]]:
    """Cross-platform favorites. Own: all. Others': public only."""
    try:
        temail = await linked_email(db, target_id)
    except Exception:
        return False, []
    if not temail:
        return False, []
    if _str(viewer_id) != _str(target_id):
        if await _site_db(db):
            priv = await privacy_of(db, temail)
        else:
            data = await _bundle(db, target_id)
            priv = (data or {}).get("privacy") or {}
        if priv.get("favorites", "private") != "public":
            return True, []
    if not await _site_db(db):
        prof = await _bridge_profile(db, target_id)
        rows = (prof or {}).get("favorites") or []
        if content_type:
            rows = [r for r in rows if r.get("type") == content_type]
        return True, [{
            "type": r.get("type"), "action": r.get("action"),
            "title": str(r.get("title") or "?"),
        } for r in rows[:15]]
    query: dict = {"userEmail": temail}
    if content_type:
        query["contentType"] = content_type
    try:
        rows = await db.user_preferences.find(query).sort(
            "createdAt", -1).limit(15).to_list(15)
    except Exception:
        return False, []
    return True, [{
        "type": r.get("contentType"), "action": r.get("action"),
        "title": str((r.get("snapshot") or {}).get("title") or r.get("contentId")),
    } for r in rows or []]


async def watchlist_for(db, viewer_id) -> tuple[bool, list[str]]:
    """Own Murastream watchlist titles (never cross-user)."""
    try:
        temail = await linked_email(db, viewer_id)
    except Exception:
        return False, []
    if not temail:
        return False, []
    if not await _site_db(db):
        prof = await _bridge_profile(db, viewer_id)
        return True, [str(t) for t in ((prof or {}).get("watchlist") or [])[:10]]
    try:
        lib = await db.userlibraries.find_one({"email": temail})
    except Exception:
        return False, []
    items = (lib or {}).get("myList") or []
    return True, [str(i.get("title") or "?") for i in items[:10]]


async def rewards_for(db, viewer_id) -> tuple[bool, dict]:
    """Own perks + recent game rewards (never cross-user)."""
    try:
        temail = await linked_email(db, viewer_id)
    except Exception:
        return False, {}
    if not temail:
        return False, {}
    if not await _site_db(db):
        prof = await _bridge_profile(db, viewer_id)
        if not prof:
            return False, {}
        return True, {
            "coins": int(prof.get("coins", 0) or 0),
            "perks": [str(p) for p in (prof.get("perks") or [])[-5:]],
            "recent": [{
                "kind": r.get("kind"), "amount": r.get("amount"),
                "label": str(r.get("label") or "")[:60],
            } for r in (prof.get("recent") or [])],
        }
    try:
        user = await db.users.find_one(
            {"email": _email_rx(temail)}, {"perks": 1, "coinBalance": 1})
    except Exception:
        user = None
    try:
        recent = await db.game_rewards.find(
            {"userEmail": temail}).sort("createdAt", -1).limit(5).to_list(5)
    except Exception:
        recent = []
    perks = (user or {}).get("perks") or []
    return True, {
        "coins": int((user or {}).get("coinBalance", 0) or 0),
        "perks": [str(p.get("perkName") or p.get("perkId")) for p in perks[-5:]],
        "recent": [{
            "kind": r.get("kind"), "amount": r.get("amount"),
            "label": str(r.get("label") or "")[:60],
        } for r in recent or []],
    }
