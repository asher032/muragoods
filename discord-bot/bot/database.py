"""MongoDB (motor) wrapper — one client for the process, parameterized queries only."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, ReturnDocument
import config

log = logging.getLogger("bot.db")

_client: AsyncIOMotorClient | None = None
_db = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def connect() -> None:
    global _client, _db
    if not config.MONGO_URI:
        raise RuntimeError(
            "MONGO_URI is not set — the bot needs a MongoDB database. "
            "Use the website's cluster (see README) or a free MongoDB Atlas tier."
        )
    _client = AsyncIOMotorClient(config.MONGO_URI, serverSelectionTimeoutMS=8000)
    _db = _client[config.MONGO_DB]
    await _client.admin.command("ping")

    await _db.guild_config.create_index("guildId", unique=True)
    await _db.warnings.create_index([("guildId", DESCENDING), ("userId", DESCENDING)])
    await _db.moderation_actions.create_index([("guildId", DESCENDING), ("createdAt", DESCENDING)])
    await _db.media_requests.create_index([("guildId", DESCENDING), ("title_lc", DESCENDING)])
    await _db.media_requests.create_index([("guildId", DESCENDING), ("votes", DESCENDING)])
    await _db.command_cooldowns.create_index("expiresAt", expireAfterSeconds=0)
    await _db.cases.create_index([("guildId", DESCENDING), ("caseId", DESCENDING)])
    await _db.giveaways.create_index([("guildId", DESCENDING), ("endsAt", ASCENDING)])
    await _db.suggestions.create_index([("guildId", DESCENDING), ("createdAt", DESCENDING)])
    await _db.reminders.create_index("dueAt")
    await _db.reputation.create_index([("guildId", DESCENDING), ("score", DESCENDING)])
    await _db.reaction_roles.create_index("messageId", unique=True, sparse=True)
    await _db.analytics.create_index([("guildId", DESCENDING), ("day", ASCENDING)])
    await _db.config_audit.create_index([("guildId", DESCENDING), ("at", DESCENDING)])
    log.info("Connected to MongoDB (%s)", config.MONGO_DB)


async def close() -> None:
    if _client:
        _client.close()


# ── Guild config ─────────────────────────────────────────────────────────
async def get_guild_config(guild_id: int) -> dict[str, Any]:
    doc = await _db.guild_config.find_one({"guildId": guild_id})
    return doc or {"guildId": guild_id, "channels": {}, "automod": {"enabled": False}}


async def set_guild_config(guild_id: int, update: dict[str, Any]) -> None:
    await _db.guild_config.update_one(
        {"guildId": guild_id}, {"$set": {**update, "updatedAt": _now()}}, upsert=True
    )


# ── Warnings / moderation ────────────────────────────────────────────────
async def add_warning(guild_id: int, user_id: int, moderator_id: int, reason: str) -> int:
    await _db.warnings.update_one(
        {"guildId": guild_id, "userId": user_id},
        {"$push": {"entries": {"reason": reason, "moderatorId": moderator_id, "at": _now()}}},
        upsert=True,
    )
    doc = await _db.warnings.find_one({"guildId": guild_id, "userId": user_id})
    return len(doc["entries"]) if doc else 0


async def get_warnings(guild_id: int, user_id: int) -> list[dict]:
    doc = await _db.warnings.find_one({"guildId": guild_id, "userId": user_id})
    return doc["entries"] if doc else []


async def clear_warnings(guild_id: int, user_id: int) -> bool:
    res = await _db.warnings.delete_one({"guildId": guild_id, "userId": user_id})
    return res.deleted_count > 0


async def log_action(guild_id: int, moderator_id: int, target_id: int, action: str, reason: str) -> None:
    await _db.moderation_actions.insert_one(
        {"guildId": guild_id, "moderatorId": moderator_id, "targetId": target_id,
         "action": action, "reason": reason, "createdAt": _now()}
    )


async def automod_inc_strike(guild_id: int, user_id: int, kind: str) -> int:
    """Record an automod violation; returns the strike count in the last hour."""
    window_start = _now() - timedelta(hours=1)
    await _db.automod_strikes.update_one(
        {"guildId": guild_id, "userId": user_id, "kind": kind, "at": {"$gte": window_start}},
        {"$inc": {"count": 1}, "$set": {"lastAt": _now()}},
        upsert=True,
    )
    doc = await _db.automod_strikes.find_one(
        {"guildId": guild_id, "userId": user_id, "kind": kind, "at": {"$gte": window_start}}
    )
    return doc["count"] if doc else 0


# ── Media requests (bot-side; mirrored to the website via bridge) ────────
async def add_request(guild_id: int, user_id: int, user_name: str,
                      title: str, media_type: str, tmdb_id: int | None) -> tuple[int, bool]:
    """Returns (request_id, created_new). Duplicates become votes on the existing request."""
    title_lc = title.casefold().strip()
    existing = await _db.media_requests.find_one({"guildId": guild_id, "title_lc": title_lc})
    if existing:
        await _db.media_requests.update_one(
            {"_id": existing["_id"]},
            {"$addToSet": {"voterIds": user_id}, "$inc": {"votes": 1}},
        )
        return existing["requestId"], False
    seq = await _db.counters.find_one_and_update(
        {"_id": "media_requests"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    request_id = seq["seq"]
    await _db.media_requests.insert_one(
        {"requestId": request_id, "guildId": guild_id, "title": title, "title_lc": title_lc,
         "type": media_type, "tmdbId": tmdb_id, "requestedBy": user_id,
         "requestedByName": user_name, "status": "Requested", "votes": 1,
         "voterIds": [user_id], "createdAt": _now(), "updatedAt": _now()}
    )
    return request_id, True


async def find_request(guild_id: int, request_id: int) -> dict | None:
    return await _db.media_requests.find_one({"guildId": guild_id, "requestId": request_id})


async def vote_request(guild_id: int, request_id: int, user_id: int) -> tuple[bool, int]:
    doc = await _db.media_requests.find_one({"guildId": guild_id, "requestId": request_id})
    if not doc:
        return False, 0
    if user_id in doc.get("voterIds", []):
        return False, doc["votes"]
    await _db.media_requests.update_one(
        {"_id": doc["_id"]}, {"$addToSet": {"voterIds": user_id}, "$inc": {"votes": 1}}
    )
    return True, doc["votes"] + 1


async def set_request_status(guild_id: int, request_id: int, status: str) -> bool:
    res = await _db.media_requests.update_one(
        {"guildId": guild_id, "requestId": request_id},
        {"$set": {"status": status, "updatedAt": _now()}},
    )
    return res.modified_count > 0


async def top_requests(guild_id: int, limit: int = 10) -> list[dict]:
    return await _db.media_requests.find({"guildId": guild_id}).sort("votes", DESCENDING).to_list(limit)


# ── Moderation cases ─────────────────────────────────────────────────
async def next_case_id(guild_id: int) -> int:
    seq = await _db.counters.find_one_and_update(
        {"_id": f"cases:{guild_id}"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER)
    return seq["seq"]


async def add_case(guild_id: int, target_id: int, moderator_id: int,
                   action: str, reason: str, duration: str = "") -> int:
    case_id = await next_case_id(guild_id)
    await _db.cases.insert_one({
        "guildId": guild_id, "caseId": case_id, "targetId": target_id,
        "moderatorId": moderator_id, "action": action, "reason": reason[:500],
        "duration": duration, "notes": [], "createdAt": _now(),
    })
    return case_id


async def get_case(guild_id: int, case_id: int) -> dict | None:
    return await _db.cases.find_one({"guildId": guild_id, "caseId": case_id})


async def user_cases(guild_id: int, target_id: int, limit: int = 10) -> list[dict]:
    return await _db.cases.find({"guildId": guild_id, "targetId": target_id}) \
        .sort("caseId", DESCENDING).to_list(limit)


async def add_case_note(guild_id: int, case_id: int, note: str) -> bool:
    res = await _db.cases.update_one(
        {"guildId": guild_id, "caseId": case_id},
        {"$push": {"notes": {"text": note[:300], "at": _now()}}})
    return res.modified_count > 0


# ── Reputation / achievements ────────────────────────────────────────
async def give_rep(guild_id: int, giver_id: int, target_id: int) -> tuple[bool, int]:
    """+1 rep to target; each giver can rep a person once per 24h."""
    cutoff = _now() - timedelta(hours=24)
    recent = await _db.rep_log.find_one({
        "guildId": guild_id, "giverId": giver_id, "targetId": target_id,
        "at": {"$gte": cutoff}})
    if recent:
        doc = await _db.reputation.find_one({"guildId": guild_id, "userId": target_id})
        return False, (doc or {}).get("score", 0)
    await _db.rep_log.insert_one({"guildId": guild_id, "giverId": giver_id,
                                  "targetId": target_id, "at": _now()})
    doc = await _db.reputation.find_one_and_update(
        {"guildId": guild_id, "userId": target_id},
        {"$inc": {"score": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return True, doc["score"]


async def top_rep(guild_id: int, limit: int = 10) -> list[dict]:
    return await _db.reputation.find({"guildId": guild_id}) \
        .sort("score", DESCENDING).to_list(limit)


ACHIEVEMENTS = {
    "first_words": ("💬 First Words", "Send your first message"),
    "chatterbox": ("🗣️ Chatterbox", "Reach level 5"),
    "veteran": ("💎 Veteran", "Reach level 25"),
    "rich": ("💰 Rich", "Hold 5,000 coins"),
    "beloved": ("❤️ Beloved", "Earn 10 reputation"),
    "music_fan": ("🎧 Music Fan", "Queue 10 songs"),
    "helper": ("🤝 Helper", "Claim a ticket"),
}


async def unlock_achievement(guild_id: int, user_id: int, key: str) -> bool:
    """Returns True if newly unlocked."""
    res = await _db.achievements.update_one(
        {"guildId": guild_id, "userId": user_id, "keys": {"$ne": key}},
        {"$addToSet": {"keys": key}})
    return res.modified_count > 0


async def get_achievements(guild_id: int, user_id: int) -> list[str]:
    doc = await _db.achievements.find_one({"guildId": guild_id, "userId": user_id})
    return doc["keys"] if doc else []


# ── Giveaways ────────────────────────────────────────────────────────
async def create_giveaway(guild_id: int, channel_id: int, message_id: int,
                          prize: str, host_id: int, ends_at, winners: int) -> Any:
    res = await _db.giveaways.insert_one({
        "guildId": guild_id, "channelId": channel_id, "messageId": message_id,
        "prize": prize[:200], "hostId": host_id, "endsAt": ends_at,
        "winners": max(1, min(winners, 20)), "entries": [], "ended": False,
    })
    return res.inserted_id


async def enter_giveaway(message_id: int, user_id: int) -> tuple[bool, int] | None:
    doc = await _db.giveaways.find_one({"messageId": message_id})
    if not doc or doc.get("ended"):
        return None
    if user_id in doc["entries"]:
        return False, len(doc["entries"])
    res = await _db.giveaways.update_one(
        {"messageId": message_id}, {"$addToSet": {"entries": user_id}})
    return True, len(doc["entries"]) + (1 if res.modified_count else 0)


async def due_giveaways() -> list[dict]:
    return await _db.giveaways.find({"ended": False, "endsAt": {"$lte": _now()}}).to_list(25)


async def end_giveaway(message_id: int) -> dict | None:
    doc = await _db.giveaways.find_one_and_update(
        {"messageId": message_id, "ended": False}, {"$set": {"ended": True}})
    return doc


# ── Suggestions / reports / reminders ────────────────────────────────
async def add_suggestion(guild_id: int, user_id: int, text: str) -> int:
    seq = await _db.counters.find_one_and_update(
        {"_id": f"sugg:{guild_id}"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER)
    await _db.suggestions.insert_one({
        "guildId": guild_id, "suggId": seq["seq"], "userId": user_id,
        "text": text[:500], "status": "Open", "up": 0, "down": 0, "createdAt": _now(),
    })
    return seq["seq"]


async def set_suggestion_status(guild_id: int, sugg_id: int, status: str) -> bool:
    res = await _db.suggestions.update_one(
        {"guildId": guild_id, "suggId": sugg_id}, {"$set": {"status": status}})
    return res.modified_count > 0


async def add_reminder(user_id: int, channel_id: int, text: str, due_at, recurring_hours: int = 0) -> None:
    await _db.reminders.insert_one({
        "userId": user_id, "channelId": channel_id, "text": text[:300],
        "dueAt": due_at, "recurringHours": recurring_hours,
    })


async def due_reminders() -> list[dict]:
    return await _db.reminders.find({"dueAt": {"$lte": _now()}}).to_list(50)


async def delete_reminder(reminder_id: Any) -> None:
    await _db.reminders.delete_one({"_id": reminder_id})


# ── Reaction roles / analytics / audit ───────────────────────────────
async def save_reaction_role(message_id: int, guild_id: int, role_id: int, label: str, emoji: str) -> None:
    await _db.reaction_roles.update_one(
        {"messageId": message_id},
        {"$set": {"guildId": guild_id, "roleId": role_id, "label": label[:80], "emoji": emoji}},
        upsert=True)


async def get_reaction_role(message_id: int) -> dict | None:
    return await _db.reaction_roles.find_one({"messageId": message_id})


async def track_command(guild_id: int, command: str) -> None:
    day = _now().strftime("%Y-%m-%d")
    await _db.analytics.update_one(
        {"guildId": guild_id, "day": day, "command": command[:40]},
        {"$inc": {"count": 1}}, upsert=True)


async def analytics_summary(guild_id: int, days: int = 7) -> list[dict]:
    pipeline = [
        {"$match": {"guildId": guild_id}},
        {"$group": {"_id": "$command", "total": {"$sum": "$count"}}},
        {"$sort": {"total": DESCENDING}},
        {"$limit": 12},
    ]
    return await _db.analytics.aggregate(pipeline).to_list(12)


async def audit_config_change(guild_id: int, actor: str, summary: str) -> None:
    await _db.config_audit.insert_one({
        "guildId": guild_id, "actor": actor[:60], "summary": summary[:300], "at": _now(),
    })


async def get_config_audit(guild_id: int, limit: int = 15) -> list[dict]:
    return await _db.config_audit.find({"guildId": guild_id}) \
        .sort("at", DESCENDING).to_list(limit)


# ── Cooldowns (Mongo-persisted, TTL index auto-cleans) ───────────────────
async def check_cooldown(key: str, seconds: int) -> int:
    """Returns remaining seconds if on cooldown, else 0 and starts the cooldown.
    Mongo returns datetimes as naive-UTC — always normalize before comparing."""
    now = _now()
    doc = await _db.command_cooldowns.find_one({"key": key})
    if doc:
        exp = doc["expiresAt"]
        if isinstance(exp, datetime) and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp > now:
            return int((exp - now).total_seconds()) + 1
    await _db.command_cooldowns.update_one(
        {"key": key}, {"$set": {"expiresAt": now + timedelta(seconds=seconds)}}, upsert=True
    )
    return 0
