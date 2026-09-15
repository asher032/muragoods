"""MongoDB (motor) wrapper — one client for the process, parameterized queries only."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import DESCENDING, ReturnDocument

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
