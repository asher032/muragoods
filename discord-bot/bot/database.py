"""MongoDB (motor) wrapper — one client for the process, parameterized queries only."""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, ReturnDocument
import config

log = logging.getLogger("bot.db")

_client: AsyncIOMotorClient | None = None
_db = None

# Last connection failure. Stores only an exception CLASS NAME — never the URI,
# credentials or server hostnames — so the dashboard can explain a failed
# connection without leaking anything.
LAST_ERROR: str | None = None

_ERROR_HINTS = {
    "NotConfigured": (
        "No connection string on this host. Set MURABOT_MONGODB_URI in the "
        "service's environment (MONGO_URI / DATABASE_URL are still accepted "
        "for an unmigrated deployment)."
    ),
    "ServerSelectionTimeoutError": (
        "The cluster could not be reached within 8s. Most likely the cluster's "
        "IP access list does not include this host's egress IP — not a "
        "credentials problem. Confirm by running a read/write test from a "
        "network that is known to be allowed."
    ),
    "OperationFailure": (
        "Reached the cluster but the operation was refused — usually the user "
        "lacks rights on the target database."
    ),
    "ConfigurationError": "The connection string is malformed.",
    "InvalidName": (
        "The database NAME is invalid — not credentials, and not the network. "
        "MongoDB rejects names containing spaces, dots, slashes, \\, $ and an "
        "empty value. Check MONGO_DB on this host, or the database name after "
        "the '/' in MONGO_URI. Unsetting MONGO_DB uses the default "
        "murastream_bot."
    ),
    "InvalidURI": "The connection string is malformed.",
    "SSLError": (
        "TLS negotiation failed. Check for a proxy or firewall intercepting "
        "the connection, or a stale tls/ssl option on the string."
    ),
}


DEFAULT_DB = "murastream_bot"
# MongoDB rejects these in a database name; an empty name is equally unusable.
_INVALID_DB_CHARS = ' /\\."$*<>:|?'

# Numeric code from the driver for the last failure, when it has one. Reported
# so 'OperationFailure' can be told apart as a bad password (18) or missing
# rights (13) instead of one guess covering both.
LAST_ERROR_CODE: int | None = None

# Codes that identify the fault precisely enough to act on without guessing.
_ERROR_CODES: dict[int, str] = {
    18: ("Authentication failed: the cluster rejected the username or password in "
         "MONGO_URI. Re-enter the connection string (check the user, the password and "
         "any authSource parameter)."),
    13: ("Authenticated, but this user is not authorized on that database. Grant the "
         "Atlas user readWrite on it, or point MONGO_DB at a database it may use."),
    8000: ("Authentication failed (Atlas reported a bad credentials error). "
           "Re-check the username and password in MONGO_URI."),
}

# Which database name was actually selected, and why. Reported through
# /health so the bot and the dashboard can be compared (the dashboard resolves
# its name through mongoose, i.e. from the connection string).
DB_NAME: str = ""
DB_NAME_SOURCE: str = ""


def _db_name_from_uri(uri: str) -> str:
    """The database name embedded in the connection string, if any."""
    try:
        from urllib.parse import urlparse, unquote
        path = (urlparse(uri or "").path or "").lstrip("/")
        name = unquote(path.split("?")[0]).strip()
        if not name or any(c in name for c in _INVALID_DB_CHARS):
            return ""
        return name
    except Exception:
        return ""


def _describe_bad_db(value: str | None) -> str:
    """Explain an unusable MONGO_DB WITHOUT echoing the value.

    This text is served to the public /health endpoint, and the value has been
    a complete connection string in practice -- so echoing it published a
    database password. Only the category is reported, never the content.

    A MONGO_DB that looks like a full connection string (mongodb:// or
    mongodb+srv://) is the most common misconfiguration: the operator pasted
    the Atlas URI into the wrong variable. Detect it explicitly so the hint is
    actionable rather than a generic "not a usable database name".
    """
    raw = (value or "").strip()
    if not raw:
        return "MONGO_DB is unset"
    lowered = raw.lower()
    if lowered.startswith("mongodb://") or lowered.startswith("mongodb+srv://"):
        return (
            "MONGO_DB holds a full connection string (starts with mongodb:// or "
            "mongodb+srv://). Move it to MONGO_URI and set MONGO_DB to a database "
            "name only, such as murastream_bot."
        )
    if "://" in raw or "@" in raw:
        return (
            "MONGO_DB looks like a connection string (contains :// or @). "
            "Move it to MONGO_URI and set MONGO_DB to a database name only, "
            "such as murastream_bot."
        )
    return "MONGO_DB is not a usable database name"


def resolve_db_name() -> tuple[str, str]:
    """Choose the database name, returning (name, source).

    A configured-but-unusable name used to be logged and then used anyway, so
    the client raised `InvalidName`, the connection failed, and the whole bot
    ran with no persistence -- while the log line explaining it scrolled past.

    An invalid name cannot be honoured in any case, so falling back cannot
    overwrite working configuration. The fallback order matches the rule the
    dashboard's driver already uses (the name in the connection string), so
    both sides converge on the same database instead of drifting apart. The
    choice is always reported, never silent.
    """
    configured = (config.MONGO_DB or "").strip()
    if configured and not any(c in configured for c in _INVALID_DB_CHARS):
        return configured, "MONGO_DB"
    bad = _describe_bad_db(config.MONGO_DB)
    from_uri = _db_name_from_uri(config.MONGO_URI or "")
    if from_uri:
        return from_uri, f"MONGO_URI ({bad})"
    return DEFAULT_DB, f"default ({bad})"


def diagnostic() -> dict[str, Any]:
    """Credential-free explanation of the current database state.

    `database: offline` on its own is unactionable — it cannot distinguish a
    missing variable from an access-list rejection or bad credentials. This
    exposes just enough to act on, and deliberately no more.
    """
    if not config.MONGO_URI:
        return {"configured": False, "error_class": "NotConfigured",
                "hint": _ERROR_HINTS["NotConfigured"]}
    where = {
        "database": DB_NAME or None,
        "database_source": DB_NAME_SOURCE or None,
        "index_warnings": INDEX_WARNINGS or None,
    }
    if LAST_ERROR is None and _db is not None:
        return {"configured": True, "error_class": None, "hint": None, **where}
    if LAST_ERROR is None:
        # Configured, no failure recorded, but not connected: no attempt has
        # completed yet. Saying "connection failed" here would be a guess.
        return {"configured": True, "error_class": "NotConnected",
                "hint": "No connection attempt has completed yet.", **where}
    return {"configured": True, "error_class": LAST_ERROR,
            "code": LAST_ERROR_CODE,
            "hint": _ERROR_CODES.get(
                LAST_ERROR_CODE,
                _ERROR_HINTS.get(LAST_ERROR,
                                 "Connection failed; see service logs for the full traceback.")),
            **where}


def _now() -> datetime:
    return datetime.now(timezone.utc)


# Patterns whose contents must never leave the process in a stored error.
# A pymongo/dotenv/httpx exception routinely embeds the connection string or
# the bot token in its message, and these strings end up in a dashboard-
# readable collection, so they are masked at the point of writing.
_SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?i)\b(mongodb(?:\+srv)?://)([^:@/\s]+):([^@/\s]+)@"), r"\1\2:***@"),
    (re.compile(r"(?i)\b(postgres(?:ql)?|mysql|redis)(?:\+srv)?://([^:@/\s]+):([^@/\s]+)@"),
     r"\1://\2:***@"),
    (re.compile(r"(?i)([?&](?:password|passwd|pwd|token|api[_-]?key|secret)=)([^&\s]+)"),
     r"\1***"),
    # The value must be consumed up to end-of-line: matching only the leading
    # token would have left "Bearer <token>" sitting in plain text after the
    # replacement.
    (re.compile(r"(?im)\b(authorization|auth|x-api-key|cookie|set-cookie)"
                r"\s*[:=]\s*[^\r\n]+"), r"\1: ***"),
    (re.compile(r"(?i)\b(discord_token|client_secret|api_key|apikey|secret|"
                r"bridge_secret|password|passwd|pwd|token)\s*=\s*(\S+)"), r"\1=***"),
    # Discord bot tokens have a fixed shape, so they can be matched exactly
    # even when they appear without a nearby key name.
    (re.compile(r"\b[MNO][A-Za-z0-9_-]{23,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b"), "***"),
)


def redact_secrets(text: str | None) -> str:
    """Mask tokens/passwords in text destined for the Error Center.

    Best-effort by design: it must never raise, because it runs inside the
    error path. Anything it misses is preferable to breaking error reporting.
    """
    if not text:
        return ""
    out = str(text)
    for pattern, replacement in _SECRET_PATTERNS:
        try:
            out = pattern.sub(replacement, out)
        except re.error:
            continue
    return out


def _gid(guild_id: Any) -> str:
    """Discord guild IDs are stored as STRINGS everywhere.

    The website's dashboard writes `guildId` as a string — a 64-bit snowflake
    exceeds JavaScript's safe integer range, so its driver can only keep it
    lossless as text. discord.py hands the bot ints. Querying with an int
    matched nothing, so every dashboard setting silently failed to reach the
    bot (and a second, orphaned document could exist per guild). Normalising
    here guarantees exactly one document per guild, shared by both sides.
    """
    return str(guild_id)


def _error_code(exc: BaseException) -> int | None:
    """The driver's numeric error code, when it has one.

    `OperationFailure` covers both a rejected password (18) and an authorized
    user being refused a database (13), which need opposite fixes. The code
    separates them; the exception's `details` can carry request contents, so
    only the number is ever reported.
    """
    code = getattr(exc, "code", None)
    return code if isinstance(code, int) else None


async def connect() -> None:
    """Connect, recording a credential-free reason if it fails."""
    global LAST_ERROR, LAST_ERROR_CODE
    try:
        await _connect_inner()
        LAST_ERROR = None
        LAST_ERROR_CODE = None
    except Exception as exc:
        LAST_ERROR = type(exc).__name__
        LAST_ERROR_CODE = _error_code(exc)
        raise


# Indexes that could not be created on this run. Reported, not fatal.
INDEX_WARNINGS: list[str] = []


async def _ensure_indexes() -> list[str]:
    # Fold any pre-existing duplicate xp rows FIRST. The unique
    # (guildId, userId) index below cannot be created while duplicates exist,
    # and silently skipping it would leave the original race in place. Earned
    # XP is summed, never dropped.
    await _dedupe_xp_rows()
    """Create the indexes, tolerating failure on any single one.

    Index creation used to run unguarded inside the connect path, so ONE
    refused or conflicting index threw, `connect()` recorded a failure, and
    `/health` reported `database: offline` — for a database that had already
    answered a ping and could serve reads and writes perfectly well. The ping
    stays fatal because without it there is no database at all; an index is an
    optimisation, so a failure is reported instead of hiding a working
    database.
    """
    specs: list[tuple[str, str]] = [
        ("guild_config.guildId", "unique"),
        ("warnings.guildId_userId", ""),
        ("moderation_actions.guildId_createdAt", ""),
        ("media_requests.guildId_title_lc", ""),
        ("media_requests.guildId_votes", ""),
        ("command_cooldowns.expiresAt", "ttl"),
        ("cases.guildId_caseId", ""),
        ("cases.guildId_createdAt", ""),
        ("cases.guildId_targetId", ""),
        ("giveaways.guildId_endsAt", ""),
        ("suggestions.guildId_createdAt", ""),
        ("reminders.dueAt", ""),
        ("reputation.guildId_score", ""),
        ("reaction_roles.messageId", "unique_sparse"),
        ("analytics.guildId_day", ""),
        ("config_audit.guildId_at", ""),
        ("bot_errors.createdAt", ""),
        ("bot_errors.resolved", ""),
        ("keepalive.updatedAt", "ttl"),
        ("music_feedback.guildId_userId_trackKey", "unique"),
        ("music_feedback.guildId_trackKey_feedback", ""),
        ("user_notes.guildId_userId", ""),
        ("user_notes.guildId_noteId", "unique"),
        ("scheduled_actions.status_runAt", ""),
        ("lockdown_state.guildId_scope", ""),
        ("economy.guildId_balance", ""),
        ("economy.guildId_net", ""),
        ("economy_tx.guildId_createdAt", ""),
        ("economy_tx.txId", "unique"),
        ("economy_inv.guildId_userId", "unique"),
        ("economy_pets.guildId_userId", ""),
        ("economy_trades.status_expires", ""),
        ("economy_lottery.guildId_drawAt", ""),
        ("economy_quests.guildId_userId", ""),
        ("economy_collect.guildId_userId", ""),
        ("economy_achv.guildId_userId", ""),
        ("economy_notif.guildId_userId_at", ""),
        ("economy_sessions.guildId_userId", ""),
        ("economy_profile.guildId_userId", ""),
        ("economy_showcase.guildId_userId", ""),
        ("economy_skins.guildId_userId", ""),
        ("economy_boosts.guildId_userId", ""),
        ("economy_vacation.guildId_userId", ""),
        ("economy_events.guildId_status", ""),
        ("economy_farm.guildId_userId", ""),
        ("economy_social.guildId_userId", ""),
        ("economy_heist.guildId_status", ""),
        # Phase 2 systems. The adventure claim slot is UNIQUE: it is the
        # durable replay guard, so a duplicate insert has to fail at the
        # database rather than at an application check.
        ("economy_garden.guildId_userId", ""),
        ("economy_garden.guildId_userId_plots", ""),
        ("economy_adventure.guildId_userId", ""),
        ("economy_adventure_claim.guildId_userId_slot", "unique"),
        ("economy_rob_shield.guildId_userId", ""),
        ("economy_rob_audit.guildId_createdAt", ""),
        ("economy_lottery_auto.guildId_userId", ""),
        ("xp.guildId_xp", ""),
        # One XP row per (guild, user) — the uniqueness the leveling service
        # assumes. `add_xp` upserts on exactly this pair, so without this index
        # two messages in the same tick can both miss and both insert: XP then
        # splits across duplicate rows, `find_one` picks arbitrarily, and the
        # dashboard and /level disagree. `_dedupe_xp_rows` merges any existing
        # duplicates first so this can be created without losing earned XP.
        ("xp.guildId_userId", "unique"),
        ("level_events.guildId_at", ""),
        # Phase 3 — moderation & security. `mod_audit` is the behavioural log
        # the dashboard filters by action/moderator/target/date; the three
        # phase 3 indexes below it are what make each of those filters a key
        # lookup instead of a collection scan.
        ("mod_audit.guildId_at", ""),
        ("mod_audit.guildId_targetId", ""),
        ("mod_audit.guildId_moderatorId", ""),
        ("mod_audit.guildId_action", ""),
        ("automod_events.guildId_at", ""),
        # AutoMod counters: one document per (guild, user, rule). UNIQUE, and
        # that uniqueness is the point — it is what stops the same window being
        # tracked twice (which would double a member's strike count), and the
        # TTL index retires counters nobody will read again.
        ("automod_state.guildId_userId_key", "unique"),
        ("automod_state.expiresAt", "ttl"),
        # Screened-message ledger: the durable "we already processed this edit"
        # guard, so one message cannot be punished twice.
        ("automod_seen.guildId_messageId", "unique"),
        ("automod_seen.expiresAt", "ttl"),
        ("role_snapshots.guildId_userId", "unique"),
        ("security_state.guildId", "unique"),
        # SecurityModule PEP state helpers.
        ("security_pep_state.guildId_userId", "unique"),
        ("security_raid_state.guildId", "unique"),
        ("antiraid_state.guildId", "unique"),
    ]
    keys: dict[str, list] = {
        "guild_config.guildId": [("guildId", ASCENDING)],
        "xp.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "warnings.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "moderation_actions.guildId_createdAt": [("guildId", DESCENDING), ("createdAt", DESCENDING)],
        "media_requests.guildId_title_lc": [("guildId", DESCENDING), ("title_lc", DESCENDING)],
        "media_requests.guildId_votes": [("guildId", DESCENDING), ("votes", DESCENDING)],
        "command_cooldowns.expiresAt": [("expiresAt", ASCENDING)],
        "cases.guildId_caseId": [("guildId", DESCENDING), ("caseId", DESCENDING)],
        "cases.guildId_createdAt": [("guildId", DESCENDING), ("createdAt", DESCENDING)],
        "cases.guildId_targetId": [("guildId", DESCENDING), ("targetId", DESCENDING)],
        "giveaways.guildId_endsAt": [("guildId", DESCENDING), ("endsAt", ASCENDING)],
        "suggestions.guildId_createdAt": [("guildId", DESCENDING), ("createdAt", DESCENDING)],
        "reminders.dueAt": [("dueAt", ASCENDING)],
        "reputation.guildId_score": [("guildId", DESCENDING), ("score", DESCENDING)],
        "reaction_roles.messageId": [("messageId", ASCENDING)],
        "analytics.guildId_day": [("guildId", DESCENDING), ("day", ASCENDING)],
        "config_audit.guildId_at": [("guildId", DESCENDING), ("at", DESCENDING)],
        "bot_errors.createdAt": [("createdAt", DESCENDING)],
        "bot_errors.resolved": [("resolved", ASCENDING)],
        "keepalive.updatedAt": [("updatedAt", ASCENDING)],
        "music_feedback.guildId_userId_trackKey": [
            ("guildId", ASCENDING), ("userId", ASCENDING), ("trackKey", ASCENDING)],
        "music_feedback.guildId_trackKey_feedback": [
            ("guildId", ASCENDING), ("trackKey", ASCENDING), ("feedback", ASCENDING)],
        "user_notes.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "user_notes.guildId_noteId": [("guildId", DESCENDING), ("noteId", DESCENDING)],
        "scheduled_actions.status_runAt": [("status", ASCENDING), ("runAt", ASCENDING)],
        "lockdown_state.guildId_scope": [("guildId", DESCENDING), ("scope", ASCENDING)],
        "economy.guildId_balance": [("guildId", DESCENDING), ("balance", DESCENDING)],
        "economy.guildId_net": [("guildId", DESCENDING)],
        "economy_tx.guildId_createdAt": [("guildId", DESCENDING), ("createdAt", DESCENDING)],
        "economy_tx.txId": [("txId", ASCENDING)],
        "economy_inv.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        # The item event log: queried per-player for "what happened to my
        # items", and per-guild for moderation. The unique txId index lets a
        # replayed gift reference be detected without a scan.
        "item_log.guildId_createdAt": [("guildId", DESCENDING), ("createdAt", DESCENDING)],
        "item_log.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "item_log.guildId_itemId": [("guildId", DESCENDING), ("itemId", DESCENDING)],
        "economy_tx.reference": [("reference", ASCENDING)],
        "economy_pets.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_trades.status_expires": [("status", ASCENDING), ("expiresAt", ASCENDING)],
        "economy_lottery.guildId_drawAt": [("guildId", DESCENDING), ("drawAt", ASCENDING)],
        "economy_quests.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_collect.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_achv.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_notif.guildId_userId_at": [("guildId", DESCENDING), ("userId", DESCENDING), ("at", DESCENDING)],
        "economy_sessions.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_profile.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_showcase.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_skins.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_boosts.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_vacation.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_events.guildId_status": [("guildId", DESCENDING), ("status", ASCENDING)],
        "economy_farm.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_social.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_heist.guildId_status": [("guildId", DESCENDING), ("status", ASCENDING)],
        # Phase 2 systems. `economy_adventure_claim` is the durable replay
        # guard for adventure rewards: the unique slot index is what makes a
        # double claim impossible even if the cooldown guard were ever lost.
        "economy_garden.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_garden.guildId_userId_plots": [
            ("guildId", ASCENDING), ("userId", ASCENDING), ("plots.plotId", ASCENDING)],
        "economy_adventure.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_adventure_claim.guildId_userId_slot": [
            ("guildId", ASCENDING), ("userId", ASCENDING), ("slot", ASCENDING)],
        "economy_rob_shield.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "economy_rob_audit.guildId_createdAt": [("guildId", DESCENDING), ("createdAt", DESCENDING)],
        "economy_lottery_auto.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "xp.guildId_xp": [("guildId", DESCENDING), ("xp", DESCENDING)],
        "xp.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)],
        "level_events.guildId_at": [("guildId", DESCENDING), ("at", DESCENDING)],
        "mod_audit.guildId_at": [("guildId", ASCENDING), ("at", DESCENDING)],
        "mod_audit.guildId_targetId": [("guildId", ASCENDING), ("targetId", ASCENDING)],
        "mod_audit.guildId_moderatorId": [("guildId", ASCENDING), ("moderatorId", ASCENDING)],
        "mod_audit.guildId_action": [("guildId", ASCENDING), ("action", ASCENDING)],
        "automod_events.guildId_at": [("guildId", ASCENDING), ("at", DESCENDING)],
        "automod_state.guildId_userId_key": [
            ("guildId", ASCENDING), ("userId", ASCENDING), ("key", ASCENDING)],
        "automod_state.expiresAt": [("expiresAt", ASCENDING)],
        "automod_seen.guildId_messageId": [("guildId", ASCENDING), ("messageId", ASCENDING)],
        "automod_seen.expiresAt": [("expiresAt", ASCENDING)],
        "role_snapshots.guildId_userId": [("guildId", ASCENDING), ("userId", ASCENDING)],
        "security_state.guildId": [("guildId", ASCENDING)],
        # SecurityModule PEP state helpers.
        "security_pep_state.guildId_userId": [("guildId", ASCENDING), ("userId", ASCENDING)],
        "security_raid_state.guildId": [("guildId", ASCENDING)],
        "antiraid_state.guildId": [("guildId", ASCENDING)],
    }
    failures: list[str] = []
    for label, kind in specs:
        if _db is None:
            break
        collection, _, _field = label.partition(".")
        kwargs: dict[str, Any] = {}
        if kind == "unique":
            kwargs["unique"] = True
        elif kind == "unique_sparse":
            kwargs.update(unique=True, sparse=True)
        elif kind == "ttl":
            kwargs["expireAfterSeconds"] = 0
        try:
            await _db[collection].create_index(keys[label], **kwargs)
        except Exception as exc:
            failures.append(f"{label}: {type(exc).__name__}")
            log.warning("Index %s could not be created (%s): %s",
                        label, type(exc).__name__, str(exc)[:160])
    return failures


async def _dedupe_xp_rows(db=None) -> int:
    """Merge duplicate `xp` rows per (guildId, userId) before the unique index
    is created.

    Migration safety: XP is NEVER reset or deleted. Duplicate rows are folded
    into the earliest row with their XP SUMMED and the highest level kept, so a
    member keeps everything they earned. Only the redundant copies are removed.
    Runs before the index and is a no-op on a healthy database. `db` is optional
    and defaults to the connected handle; the parameter exists so the behaviour
    can be exercised against an in-process database in tests.
    """
    handle = db if db is not None else _db
    if handle is None:
        return 0
    merged = 0
    try:
        cursor = handle["xp"].aggregate([
            {"$group": {
                "_id": {"guildId": "$guildId", "userId": "$userId"},
                "ids": {"$push": "$_id"},
                "xp": {"$sum": {"$ifNull": ["$xp", 0]}},
                "level": {"$max": {"$ifNull": ["$level", 0]}},
                "messages": {"$sum": {"$ifNull": ["$messages", 0]}},
                "lastXp": {"$min": ["$lastXp", None]},
            }},
        ], allowDiskUse=True)
        async for group in cursor:
            ids = group.get("ids") or []
            if len(ids) <= 1:
                continue  # healthy row — nothing to merge
            keep = ids[0]
            await handle["xp"].update_one(
                {"_id": keep},
                {"$set": {
                    "xp": int(group.get("xp") or 0),
                    "level": int(group.get("level") or 0),
                    "messages": int(group.get("messages") or 0),
                    "lastXp": group.get("lastXp"),
                }},
            )
            stale = {"_id": {"$in": ids[1:]}}
            res = await handle["xp"].delete_many(stale)
            merged += res.deleted_count
            log.info("Merged %s duplicate xp row(s) for guild=%s user=%s",
                     res.deleted_count,
                     group["_id"].get("guildId"), group["_id"].get("userId"))
    except Exception as exc:
        # A failed dedupe must never stop startup; the unique index simply may
        # not be creatable until it is resolved, and that is logged below.
        log.warning("xp dedupe skipped (%s): %s", type(exc).__name__, str(exc)[:160])
    return merged


async def _connect_inner() -> None:
    global _client, _db
    if not config.MONGO_URI:
        raise RuntimeError(
            "MURABOT_MONGODB_URI is not set — the bot needs its own MongoDB "
            "cluster. The variable NAME is the contract the dashboard also "
            "resolves, so setting it makes both point at the same cluster."
        )
    # Reject an invalid database name with a precise message. Previously this
    # surfaced only as `database: offline`, which sent the reader looking for a
    # missing variable or a network problem when the actual fault was the name.
    global DB_NAME, DB_NAME_SOURCE
    DB_NAME, DB_NAME_SOURCE = resolve_db_name()
    if DB_NAME_SOURCE != "MONGO_DB":
        log.warning(
            "Using database %r (%s). Set MONGO_DB on this host to choose it "
            "explicitly; the dashboard resolves its own name from its "
            "connection string, and the two must match.",
            DB_NAME, DB_NAME_SOURCE,
        )
    # One client for the whole process, shared by every collection access.
    # The pool bounds are explicit so a burst of command traffic multiplexes
    # over a handful of sockets instead of opening a connection per in-flight
    # operation, and idle sockets are reaped so a long-lived idle bot does not
    # sit on a cluster that has rotated its IP allowlist.
    _client = AsyncIOMotorClient(
        config.MONGO_URI,
        serverSelectionTimeoutMS=8000,
        connectTimeoutMS=8000,
        socketTimeoutMS=20000,
        maxPoolSize=50,
        minPoolSize=1,
        maxIdleTimeMS=60000,
        waitQueueTimeoutMS=5000,
        retryWrites=True,
        appname="murabot",
    )
    _db = _client[DB_NAME]
    await _client.admin.command("ping")

    global INDEX_WARNINGS
    INDEX_WARNINGS = await _ensure_indexes()
    # Log the RESOLVED name, never config.MONGO_DB: that variable has held a
    # full connection string (password included) on a real deployment.
    log.info("Connected to MongoDB (%s, via %s)%s", DB_NAME,
             config.MONGO_URI_SOURCE or "unset",
             f" — {len(INDEX_WARNINGS)} index warning(s)" if INDEX_WARNINGS else "")


async def close() -> None:
    if _client:
        _client.close()


# ── Guild config ─────────────────────────────────────────────────────────
def _require_db():
    """Return the database handle, or raise a clear error when offline.

    Without this, a failed connect() surfaces later as a bare
    `AttributeError: 'NoneType' object has no attribute 'guild_config'`,
    which misdirects every investigation. Callers on hot paths
    (e.g. get_guild_prefix on EVERY message) already fall back gracefully.
    """
    if _db is None:
        raise ConnectionError(
            f"database unavailable ({LAST_ERROR or 'not connected'})")
    return _db


async def get_guild_config(guild_id: int) -> dict[str, Any]:
    doc = await _require_db().guild_config.find_one({"guildId": _gid(guild_id)})
    return doc or {"guildId": _gid(guild_id), "channels": {}, "automod": {"enabled": False}}


async def set_guild_config(guild_id: int, update: dict[str, Any]) -> None:
    await _require_db().guild_config.update_one(
        {"guildId": _gid(guild_id)}, {"$set": {**update, "updatedAt": _now()}}, upsert=True
    )


async def get_guild_prefix(guild_id: int) -> str | None:
    """The guild's custom command prefix, or None when it was never set.

    Reads the same document the dashboard writes, so a prefix changed on the
    website is the prefix the bot uses — with no per-guild crossover.
    """
    doc = await _require_db().guild_config.find_one({"guildId": _gid(guild_id)}, {"prefix": 1})
    if not doc:
        return None
    prefix = doc.get("prefix")
    if isinstance(prefix, str) and prefix.strip():
        return prefix.strip()
    return None


async def set_guild_prefix(guild_id: int, prefix: str) -> None:
    """Persist a dashboard-pushed prefix into the bot's own store."""
    clean = str(prefix or "").strip()[:10]
    if not clean:
        return
    await _require_db().guild_config.update_one(
        {"guildId": _gid(guild_id)},
        {"$set": {"prefix": clean, "updatedAt": _now()}}, upsert=True)


# ── Warnings / moderation ────────────────────────────────────────────────
async def add_warning(guild_id: int, user_id: int, moderator_id: int, reason: str) -> int:
    await _db.warnings.update_one(
        {"guildId": _gid(guild_id), "userId": user_id},
        {"$push": {"entries": {"reason": reason, "moderatorId": moderator_id, "at": _now()}}},
        upsert=True,
    )
    doc = await _db.warnings.find_one({"guildId": _gid(guild_id), "userId": user_id})
    return len(doc["entries"]) if doc else 0


async def get_warnings(guild_id: int, user_id: int) -> list[dict]:
    doc = await _db.warnings.find_one({"guildId": _gid(guild_id), "userId": user_id})
    return doc["entries"] if doc else []


async def clear_warnings(guild_id: int, user_id: int) -> bool:
    res = await _db.warnings.delete_one({"guildId": _gid(guild_id), "userId": user_id})
    return res.deleted_count > 0


async def log_action(guild_id: int, moderator_id: int, target_id: int, action: str, reason: str) -> None:
    await _db.moderation_actions.insert_one(
        {"guildId": _gid(guild_id), "moderatorId": moderator_id, "targetId": target_id,
         "action": action, "reason": reason, "createdAt": _now()}
    )


async def automod_inc_strike(guild_id: int, user_id: int, kind: str) -> int:
    """Record an automod violation; returns the strike count in the last hour."""
    window_start = _now() - timedelta(hours=1)
    await _db.automod_strikes.update_one(
        {"guildId": _gid(guild_id), "userId": user_id, "kind": kind, "at": {"$gte": window_start}},
        {"$inc": {"count": 1}, "$set": {"lastAt": _now()}},
        upsert=True,
    )
    doc = await _db.automod_strikes.find_one(
        {"guildId": _gid(guild_id), "userId": user_id, "kind": kind, "at": {"$gte": window_start}}
    )
    return doc["count"] if doc else 0


# ── Media requests (bot-side; mirrored to the website via bridge) ────────
async def add_request(guild_id: int, user_id: int, user_name: str,
                      title: str, media_type: str, tmdb_id: int | None) -> tuple[int, bool]:
    """Returns (request_id, created_new). Duplicates become votes on the existing request."""
    title_lc = title.casefold().strip()
    existing = await _db.media_requests.find_one({"guildId": _gid(guild_id), "title_lc": title_lc})
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
        {"requestId": request_id, "guildId": _gid(guild_id), "title": title, "title_lc": title_lc,
         "type": media_type, "tmdbId": tmdb_id, "requestedBy": user_id,
         "requestedByName": user_name, "status": "Requested", "votes": 1,
         "voterIds": [user_id], "createdAt": _now(), "updatedAt": _now()}
    )
    return request_id, True


async def find_request(guild_id: int, request_id: int) -> dict | None:
    return await _db.media_requests.find_one({"guildId": _gid(guild_id), "requestId": request_id})


async def vote_request(guild_id: int, request_id: int, user_id: int) -> tuple[bool, int]:
    doc = await _db.media_requests.find_one({"guildId": _gid(guild_id), "requestId": request_id})
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
        {"guildId": _gid(guild_id), "requestId": request_id},
        {"$set": {"status": status, "updatedAt": _now()}},
    )
    return res.modified_count > 0


async def top_requests(guild_id: int, limit: int = 10) -> list[dict]:
    return await _db.media_requests.find({"guildId": _gid(guild_id)}).sort("votes", DESCENDING).to_list(limit)


# ── Moderation cases ─────────────────────────────────────────────────
async def next_case_id(guild_id: int) -> int:
    seq = await _db.counters.find_one_and_update(
        {"_id": f"cases:{guild_id}"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER)
    return seq["seq"]


async def add_case(guild_id: int, target_id: int, moderator_id: int,
                   action: str, reason: str, duration: str = "",
                   source: str = "discord") -> int:
    """Record a moderation case. `source` is one of discord|dashboard|automod|
    anti-raid|verification|system — callers must say where the action
    originated so the dashboard and bot never show disconnected histories for
    the same guild.

    `anti-raid` and `verification` are separate on purpose: an operator
    reviewing automated damage needs to tell a raid response apart from an
    AutoMod rule fire, and both apart from a human."""
    if source not in ("discord", "dashboard", "automod", "anti-raid",
                      "verification", "system"):
        source = "discord"
    case_id = await next_case_id(guild_id)
    # IDs stored as strings: Mongo $regex (used by dashboard search) only
    # matches string fields, so int IDs would silently break case search.
    await _db.cases.insert_one({
        "guildId": _gid(guild_id), "caseId": case_id, "targetId": str(target_id),
        "moderatorId": str(moderator_id), "action": action, "reason": reason[:500],
        "duration": duration, "notes": [], "source": source, "status": "active",
        "createdAt": _now(), "updatedAt": _now(),
    })
    return case_id


async def get_case(guild_id: int, case_id: int) -> dict | None:
    return await _db.cases.find_one({"guildId": _gid(guild_id), "caseId": case_id})


async def user_cases(guild_id: int, target_id: int, limit: int = 10) -> list[dict]:
    return await _db.cases.find({"guildId": _gid(guild_id), "targetId": str(target_id)}) \
        .sort("caseId", DESCENDING).to_list(limit)


async def add_case_note(guild_id: int, case_id: int, note: str) -> bool:
    res = await _db.cases.update_one(
        {"guildId": _gid(guild_id), "caseId": case_id},
        {"$push": {"notes": {"text": note[:300], "at": _now()}},
         "$set": {"updatedAt": _now()}})
    return res.modified_count > 0


async def update_case(guild_id: int, case_id: int, *,
                      reason: str | None = None,
                      status: str | None = None) -> bool:
    """Edit a case's reason or open/close it. Every change bumps updatedAt;
    the original record is never rewritten silently — notes carry history."""
    update: dict = {"updatedAt": _now()}
    if reason is not None:
        update["reason"] = reason[:500]
    if status is not None:
        if status not in ("active", "closed"):
            return False
        update["status"] = status
    res = await _db.cases.update_one(
        {"guildId": _gid(guild_id), "caseId": case_id}, {"$set": update})
    return res.modified_count > 0


async def remove_warning(guild_id: int, user_id: int, index: int) -> bool:
    """Remove a single warning by 1-based position. Returns False when the
    position does not exist."""
    if index < 1:
        return False
    doc = await _db.warnings.find_one({"guildId": _gid(guild_id), "userId": user_id})
    if not doc or not doc.get("entries"):
        return False
    entries = doc["entries"]
    if index > len(entries):
        return False
    removed = entries.pop(index - 1)
    await _db.warnings.update_one(
        {"guildId": _gid(guild_id), "userId": user_id},
        {"$set": {"entries": entries}})
    return removed is not None


async def guild_cases(guild_id: int, *, action: str = "", source: str = "",
                      status: str = "", search: str = "", limit: int = 100,
                      before: int = 0) -> list[dict]:
    """Guild-scoped case list for the dashboard. Filters are exact matches;
    search matches target/moderator IDs as substrings. Always scoped by
    guildId first — cross-guild reads are impossible by construction."""
    query: dict = {"guildId": _gid(guild_id)}
    if action:
        query["action"] = action
    if source:
        query["source"] = source
    if status:
        query["status"] = status
    if before > 0:
        query["caseId"] = {"$lt": before}
    if search:
        s = str(search)[:25]
        ors: list[dict] = [{"targetId": {"$regex": s}},
                           {"moderatorId": {"$regex": s}}]
        # Older cases stored int IDs (regex never matches ints) — also try
        # numeric equality so history written before the string normalization
        # stays searchable.
        if s.isdigit():
            ors.extend([{"targetId": int(s)}, {"moderatorId": int(s)}])
        query["$or"] = ors
    return await _db.cases.find(query).sort("caseId", DESCENDING).to_list(limit)


async def guild_mod_stats(guild_id: int) -> dict:
    """Counts for the moderation overview: totals by action, today/week
    windows, open cases, warning entries. Single collection, guild-scoped."""
    gid = _gid(guild_id)
    now = _now()
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)
    by_action = {}
    async for row in _db.cases.aggregate([
        {"$match": {"guildId": gid}},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
    ]):
        by_action[str(row["_id"])] = int(row["count"])
    today = await _db.cases.count_documents({"guildId": gid, "createdAt": {"$gte": day_ago}})
    week = await _db.cases.count_documents({"guildId": gid, "createdAt": {"$gte": week_ago}})
    open_cases = await _db.cases.count_documents({"guildId": gid, "status": "active"})
    warn_docs = await _db.warnings.find({"guildId": gid}, {"entries": 1}).to_list(5000)
    warnings = sum(len(d.get("entries") or []) for d in warn_docs)
    return {
        "byAction": by_action,
        "today": today,
        "week": week,
        "openCases": open_cases,
        "warnings": warnings,
        "total": sum(by_action.values()),
    }


# ── Moderation & security audit trail (Phase 3) ───────────────────────────
# One behavioural record per ATTEMPT — success and failure alike. This is
# Murabot's own log and it is deliberately not a copy of Discord's audit log:
# Discord can say "member X was banned", but it cannot say "this failed",
# "this came from the dashboard", "an automatic rule did it" or "this expires
# at 18:40". The dashboard shows both, labelled, instead of presenting one as
# the other.
AUDIT_SOURCES = ("discord", "dashboard", "automod", "anti-raid", "system", "verification")


def _as_dt(value: Any) -> datetime | None:
    """Accept a datetime or an ISO-8601 string (what the dashboard sends).

    Anything else is None — an unparsable date filter must widen the query, not
    silently match nothing, because "0 results" and "a broken filter" look
    identical to an operator.
    """
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value.strip():
        text = value.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


async def log_mod_audit(guild_id: int, action: str, *,
                        moderator_id: int | str = 0, target_id: int | str = 0,
                        source: str = "system", success: bool = True,
                        reason: str = "", case_id: int | None = None,
                        expires_at: Any = None, detail: str = "",
                        reversible: bool = False, meta: dict | None = None) -> str | None:
    """Record one moderation attempt. Returns the audit id (or None).

    Fields are clamped rather than rejected: an audit write must never be the
    reason an action reports failure, and a too-long reason must not lose the
    record. Credentials never reach this function — see ``redact_secrets``,
    which the caller-facing paths use for anything user-supplied.
    """
    src = str(source or "system").lower()
    if src not in AUDIT_SOURCES:
        src = "system"
    expires = _as_dt(expires_at)
    doc = {
        "guildId": _gid(guild_id),
        "action": str(action or "unknown")[:60],
        "moderatorId": str(moderator_id or 0),
        "targetId": str(target_id or 0),
        "source": src,
        "success": bool(success),
        "reason": redact_secrets(str(reason or "")[:500]),
        "detail": redact_secrets(str(detail or "")[:500]),
        "caseId": int(case_id) if case_id else None,
        "expiresAt": expires,
        "reversible": bool(reversible),
        "meta": {k: redact_secrets(str(v)[:200]) for k, v in (meta or {}).items()},
        "at": _now(),
    }
    try:
        res = await _require_db().mod_audit.insert_one(doc)
        return str(res.inserted_id)
    except Exception as exc:
        log.warning("Mod audit write failed for %s: %s", action, type(exc).__name__)
        return None


async def query_mod_audit(guild_id: int, *, action: str = "", moderator_id: str = "",
                          target_id: str = "", source: str = "", success: Any = None,
                          since: Any = None, until: Any = None,
                          limit: int = 50, skip: int = 0) -> dict:
    """Filtered, paginated read of the moderation audit trail.

    Every filter is applied inside the query and the guild is always part of
    it, so no filter combination can widen the read to another server. The
    returned ``total`` is the count BEFORE pagination, which is what a
    paginator needs to be honest about "page 2 of 7".
    """
    query: dict[str, Any] = {"guildId": _gid(guild_id)}
    if action:
        query["action"] = str(action)[:60]
    if moderator_id:
        query["moderatorId"] = str(moderator_id)
    if target_id:
        query["targetId"] = str(target_id)
    if source:
        src = str(source).lower()[:20]
        query["source"] = src
    if success is not None and success != "":
        query["success"] = bool(success)
    span: dict[str, datetime] = {}
    start = _as_dt(since)
    end = _as_dt(until)
    if start:
        span["$gte"] = start
    if end:
        span["$lte"] = end
    if span:
        query["at"] = span
    limit = max(1, min(int(limit or 50), 200))
    skip = max(0, int(skip or 0))
    coll = _require_db().mod_audit
    total = await coll.count_documents(query)
    cur = coll.find(query).sort("at", DESCENDING).skip(skip).limit(limit)
    rows = await cur.to_list(limit)
    return {"total": int(total), "entries": [_audit_out(r) for r in rows]}


def _audit_out(row: dict) -> dict:
    """JSON-safe projection. Dates become ISO strings so the dashboard never
    has to guess a format, and Mongo's _id is stringified rather than shipped
    raw (a paginator uses it; a template should never print it)."""
    return {
        "id": str(row.get("_id", "")),
        "guildId": str(row.get("guildId", "")),
        "action": str(row.get("action", "")),
        "moderatorId": str(row.get("moderatorId", "")),
        "targetId": str(row.get("targetId", "")),
        "source": str(row.get("source", "")),
        "success": bool(row.get("success", True)),
        "reason": str(row.get("reason", "")),
        "detail": str(row.get("detail", "")),
        "caseId": row.get("caseId"),
        "expiresAt": row["expiresAt"].isoformat() if isinstance(row.get("expiresAt"), datetime) else None,
        "reversible": bool(row.get("reversible", False)),
        "meta": row.get("meta") or {},
        "at": row["at"].isoformat() if isinstance(row.get("at"), datetime) else str(row.get("at")),
    }


# ── AutoMod state (windows, cooldowns, screened messages) ────────────────
async def automod_hit(guild_id: int, user_id: int, key: str, window_seconds: int) -> int:
    """Count one event inside a DB-backed sliding window; return the count.

    Two steps on purpose: an increment that only matches a LIVE window, then a
    reset-or-insert. The reset is guarded by the unique index, so a race
    between two processes cannot create a second counter — the loser gets a
    duplicate-key error, retries the increment, and the count stays correct
    instead of forking.
    """
    now = _now()
    window = max(1, int(window_seconds or 60))
    deadline = now + timedelta(seconds=window)
    coll = _require_db().automod_state
    base = {"guildId": _gid(guild_id), "userId": str(user_id), "key": str(key)[:120]}
    live = await coll.update_one({**base, "expiresAt": {"$gte": now}}, {"$inc": {"count": 1}})
    if live.matched_count:
        doc = await coll.find_one(base)
        return int((doc or {}).get("count", 1))
    try:
        await coll.update_one(base, {"$set": {"count": 1, "windowStart": now,
                                                "expiresAt": deadline}}, upsert=True)
        return 1
    except Exception:
        # Lost a race with another process that just reset the window: count
        # the event against the window it created instead of dropping it.
        again = await coll.update_one(base, {"$inc": {"count": 1}})
        if again.matched_count:
            doc = await coll.find_one(base)
            return int((doc or {}).get("count", 1))
        return 1


async def automod_cooldown(guild_id: int, user_id: int, seconds: int) -> int:
    """Arm a per-member cooldown and return the seconds still remaining.

    A cooldown of 0 disarms it. The first call returns the armed window and a
    violation inside it returns the remainder — the caller decides whether
    "still cooling down" means skip the punishment or skip the counter.
    """
    seconds = max(0, int(seconds or 0))
    coll = _require_db().automod_state
    base = {"guildId": _gid(guild_id), "userId": str(user_id), "key": "cooldown"}
    now = _now()
    if seconds <= 0:
        await coll.delete_one(base)
        return 0
    deadline = now + timedelta(seconds=seconds)
    doc = await coll.find_one(base)
    if doc and isinstance(doc.get("expiresAt"), datetime) and doc["expiresAt"] > now:
        return int((doc["expiresAt"] - now).total_seconds())
    await coll.update_one(base, {"$set": {"count": 1, "windowStart": now,
                                           "expiresAt": deadline}}, upsert=True)
    return seconds


async def automod_seen_message(guild_id: int, message_id: int, digest: str,
                               ttl_seconds: int = 7200) -> bool:
    """True when this message CONTENT was already screened before.

    Edits re-enter the scanner and a delete/insert race can deliver the same
    message twice; without this ledger a member can be punished twice for one
    message. The stored hash matters: an edit that changes the text IS a new
    message and is screened again.
    """
    if not message_id:
        return False
    coll = _require_db().automod_seen
    key = {"guildId": _gid(guild_id), "messageId": str(message_id)}
    try:
        res = await coll.update_one(
            key,
            {"$setOnInsert": {"hash": str(digest)[:64], "at": _now(),
                               "expiresAt": _now() + timedelta(seconds=ttl_seconds)}},
            upsert=True,
        )
    except Exception:
        # Duplicate-key on a concurrent insert means somebody else is (or just)
        # screened it — treat it as already seen, which is the safe direction.
        return True
    if res.upserted_id is not None:
        return False
    doc = await coll.find_one(key)
    if doc and str(doc.get("hash")) == str(digest):
        return True
    # Same message id, different text: it was edited, which is a NEW message.
    # Re-arm the ledger with the new hash and screen it.
    await coll.update_one(key, {"$set": {"hash": str(digest)[:64], "at": _now(),
                                           "expiresAt": _now() + timedelta(seconds=ttl_seconds)}})
    return False


async def log_automod_event(guild_id: int, *, rule: str, member_id: int | str,
                            action: str, reason: str, detail: str = "",
                            channel_id: int | str = "", message_id: int | str = "",
                            strikes: int = 0, source: str = "automod") -> None:
    """Record what a rule decided, including the "rule could not run" skips.

    A rule that fires is recorded through ``log_mod_audit`` as well; this feed
    exists for the per-guild AutoMod traffic view (what matched, what was
    ignored and why) without turning the audit trail into a message log.
    """
    try:
        await _require_db().automod_events.insert_one({
            "guildId": _gid(guild_id),
            "rule": str(rule)[:40],
            "userId": str(member_id or 0),
            "action": str(action)[:20],
            "reason": redact_secrets(str(reason or "")[:300]),
            "detail": redact_secrets(str(detail or "")[:300]),
            "channelId": str(channel_id or ""),
            "messageId": str(message_id or ""),
            "strikes": int(strikes or 0),
            "source": str(source)[:20],
            "at": _now(),
        })
    except Exception as exc:
        log.warning("AutoMod event write failed: %s", type(exc).__name__)


async def automod_recent_counts(guild_id: int, hours: int = 24) -> dict:
    """Per-rule firing counts for the last N hours (the AutoMod summary)."""
    since = _now() - timedelta(hours=max(1, min(int(hours or 24), 720)))
    out: dict[str, int] = {}
    try:
        cur = _require_db().automod_events.find(
            {"guildId": _gid(guild_id), "at": {"$gte": since}}, {"rule": 1})
        async for row in cur:
            name = str(row.get("rule", "unknown"))
            out[name] = out.get(name, 0) + 1
    except Exception:
        return {}
    return out


# ── Reputation / achievements ────────────────────────────────────────
async def give_rep(guild_id: int, giver_id: int, target_id: int) -> tuple[bool, int]:
    """+1 rep to target; each giver can rep a person once per 24h."""
    cutoff = _now() - timedelta(hours=24)
    recent = await _db.rep_log.find_one({
        "guildId": _gid(guild_id), "giverId": giver_id, "targetId": target_id,
        "at": {"$gte": cutoff}})
    if recent:
        doc = await _db.reputation.find_one({"guildId": _gid(guild_id), "userId": target_id})
        return False, (doc or {}).get("score", 0)
    await _db.rep_log.insert_one({"guildId": _gid(guild_id), "giverId": giver_id,
                                  "targetId": target_id, "at": _now()})
    doc = await _db.reputation.find_one_and_update(
        {"guildId": _gid(guild_id), "userId": target_id},
        {"$inc": {"score": 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    return True, doc["score"]


async def top_rep(guild_id: int, limit: int = 10) -> list[dict]:
    return await _db.reputation.find({"guildId": _gid(guild_id)}) \
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
        {"guildId": _gid(guild_id), "userId": user_id, "keys": {"$ne": key}},
        {"$addToSet": {"keys": key}})
    return res.modified_count > 0


async def get_achievements(guild_id: int, user_id: int) -> list[str]:
    doc = await _db.achievements.find_one({"guildId": _gid(guild_id), "userId": user_id})
    return doc["keys"] if doc else []


# ── Giveaways ────────────────────────────────────────────────────────
async def create_giveaway(guild_id: int, channel_id: int, message_id: int,
                          prize: str, host_id: int, ends_at, winners: int) -> Any:
    res = await _db.giveaways.insert_one({
        "guildId": _gid(guild_id), "channelId": channel_id, "messageId": message_id,
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


async def last_ended_giveaway(channel_id: int) -> dict | None:
    return await _db.giveaways.find_one(
        {"channelId": channel_id, "ended": True}).sort("endsAt", DESCENDING)


# ── Suggestions / reports / reminders ────────────────────────────────
async def add_suggestion(guild_id: int, user_id: int, text: str) -> int:
    seq = await _db.counters.find_one_and_update(
        {"_id": f"sugg:{guild_id}"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER)
    await _db.suggestions.insert_one({
        "guildId": _gid(guild_id), "suggId": seq["seq"], "userId": user_id,
        "text": text[:500], "status": "Open", "up": 0, "down": 0, "createdAt": _now(),
    })
    return seq["seq"]


async def set_suggestion_status(guild_id: int, sugg_id: int, status: str) -> bool:
    res = await _db.suggestions.update_one(
        {"guildId": _gid(guild_id), "suggId": sugg_id}, {"$set": {"status": status}})
    return res.modified_count > 0


async def vote_suggestion(guild_id: int, sugg_id: int, user_id: int, up: bool) -> tuple[int, int]:
    """One vote per user per suggestion. Returns (up_count, down_count)."""
    field = "votersUp" if up else "votersDown"
    other = "votersDown" if up else "votersUp"
    # Atomic single-write vote: the update matches only when the user has NOT
    # already voted on this side, so concurrent double-votes are impossible and
    # flipping a vote moves it atomically (addToSet + pull in one shot).
    await _db.suggestions.update_one(
        {"guildId": _gid(guild_id), "suggId": sugg_id, field: {"$ne": user_id}},
        {"$addToSet": {field: user_id}, "$pull": {other: user_id}})
    doc = await _db.suggestions.find_one({"guildId": _gid(guild_id), "suggId": sugg_id})
    if not doc:
        return 0, 0
    return len(doc.get("votersUp", [])), len(doc.get("votersDown", []))


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
        {"$set": {"guildId": _gid(guild_id), "roleId": role_id, "label": label[:80], "emoji": emoji}},
        upsert=True)


async def get_reaction_role(message_id: int) -> dict | None:
    return await _db.reaction_roles.find_one({"messageId": message_id})


async def track_command(guild_id: int, command: str) -> None:
    day = _now().strftime("%Y-%m-%d")
    await _db.analytics.update_one(
        {"guildId": _gid(guild_id), "day": day, "command": command[:40]},
        {"$inc": {"count": 1}}, upsert=True)


async def analytics_summary(guild_id: int, days: int = 7) -> list[dict]:
    pipeline = [
        {"$match": {"guildId": _gid(guild_id)}},
        {"$group": {"_id": "$command", "total": {"$sum": "$count"}}},
        {"$sort": {"total": DESCENDING}},
        {"$limit": 12},
    ]
    return await _db.analytics.aggregate(pipeline).to_list(12)


async def audit_config_change(guild_id: int, actor: str, summary: str) -> None:
    await _db.config_audit.insert_one({
        "guildId": _gid(guild_id), "actor": actor[:60], "summary": summary[:300], "at": _now(),
    })


async def get_config_audit(guild_id: int, limit: int = 15) -> list[dict]:
    return await _db.config_audit.find({"guildId": _gid(guild_id)}) \
        .sort("at", DESCENDING).to_list(limit)


# ── Error relay (bot → website → dashboard Error Center) ────────────────
async def record_bot_error(source: str, message: str, *, guild_id: int | None = None,
                           command: str | None = None, severity: str = "error",
                           detail: str | None = None,
                           error_id: str | None = None,
                           user_id: int | None = None,
                           subcommand: str | None = None,
                           exc_type: str | None = None,
                           exc_message: str | None = None,
                           file: str | None = None,
                           line: int | None = None,
                           traceback_text: str | None = None) -> str | None:
    """Store a bot-side error in the shared cluster for the dashboard.
    Never raises — telemetry must never take down a command.

    `error_id` is the MS-XXXXXX the user is shown in Discord. It is persisted
    so the Error Center can be searched by that ID — previously the ID existed
    only in the chat message, so a user reporting "MS-A98DE3" could not be
    matched to any stored traceback.

    Every free-text field is passed through `redact_secrets` first: a
    traceback can embed a connection string or token in a pymongo/config
    exception, and the Error Center is dashboard-readable.
    """
    try:
        doc = {
            "source": source[:40],
            "message": redact_secrets(message)[:500],
            "severity": severity,
            "command": (command or "")[:60],
            "subcommand": (subcommand or "")[:60],
            "errorId": (error_id or "")[:20],
            "guildId": str(guild_id) if guild_id else "",
            "userId": str(user_id) if user_id else "",
            "exceptionType": (exc_type or "")[:80],
            "exceptionMessage": redact_secrets(exc_message)[:500],
            "file": (file or "")[:200],
            "line": line if isinstance(line, int) else None,
            "traceback": redact_secrets(traceback_text)[:4000],
            "detail": redact_secrets(detail)[:2000],
            "resolved": False,
            "createdAt": _now(),
        }
        res = await _db.bot_errors.insert_one(doc)
        return str(res.inserted_id)
    except Exception:
        log.debug("record_bot_error failed (non-fatal)")
        return None


async def keepalive_record(ok: bool, latency_ms: int, status_code: int,
                           detail: str = "") -> None:
    """Append a keep-alive health check result (rolling window, capped doc)."""
    try:
        entry = {"ok": ok, "latencyMs": latency_ms, "status": status_code,
                 "detail": detail[:200], "at": _now()}
        await _db.keepalive.update_one(
            {"_id": "current"},
            {"$set": {"last": entry, "updatedAt": _now()},
             "$push": {"history": {"$each": [entry], "$slice": -200}}},
            upsert=True)
    except Exception:
        log.debug("keepalive_record failed (non-fatal)")


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


# ── Mute role ─────────────────────────────────────────────────────────
async def get_mute_role_id(guild_id: int) -> int | None:
    """The guild's configured Muterole (moderation.muteRoleId), or None.

    Mute/hardmute/unmute are role-based and REQUIRE this to exist — the
    service returns MUTEROLE_NOT_CONFIGURED (never a permission error) when
    it is missing. The dashboard sets it through the normal config save."""
    try:
        cfg = await get_guild_config(guild_id)
        raw = ((cfg.get("moderation") or {}).get("muteRoleId") or "")
        rid = int(str(raw).strip())
        return rid if rid > 0 else None
    except (TypeError, ValueError):
        return None
    except Exception:
        return None


async def set_mute_role_id(guild_id: int, role_id: int | None) -> None:
    cfg = await get_guild_config(guild_id)
    moderation = dict(cfg.get("moderation") or {})
    if role_id:
        moderation["muteRoleId"] = str(int(role_id))
    else:
        moderation.pop("muteRoleId", None)
    await set_guild_config(guild_id, {"moderation": moderation})


# ── User notes ────────────────────────────────────────────────────────
async def _next_note_id(guild_id: int) -> int:
    seq = await _require_db().counters.find_one_and_update(
        {"_id": f"notes:{guild_id}"}, {"$inc": {"seq": 1}},
        upsert=True, return_document=ReturnDocument.AFTER)
    return seq["seq"]


async def add_user_note(guild_id: int, user_id: int, moderator_id: int, text: str) -> int:
    """Staff-only notebook entry for a user. Guild-scoped; noteIds are unique
    per guild. Works for users who already left (no Discord lookup)."""
    note_id = await _next_note_id(guild_id)
    await _require_db().user_notes.insert_one({
        "guildId": _gid(guild_id), "noteId": note_id, "userId": str(user_id),
        "moderatorId": str(moderator_id), "text": str(text or "")[:1000],
        "createdAt": _now(),
    })
    return note_id


async def get_user_notes(guild_id: int, user_id: int, limit: int = 50) -> list[dict]:
    cur = _require_db().user_notes.find(
        {"guildId": _gid(guild_id), "userId": str(user_id)}).sort("noteId", ASCENDING).limit(limit)
    return await cur.to_list(limit)


async def remove_user_note(guild_id: int, note_id: int) -> bool:
    """Guild ownership is enforced in the query — a note from another guild
    can never be touched through this path."""
    res = await _require_db().user_notes.delete_one(
        {"guildId": _gid(guild_id), "noteId": int(note_id)})
    return res.deleted_count > 0


async def clear_user_notes(guild_id: int, user_id: int) -> int:
    res = await _require_db().user_notes.delete_many(
        {"guildId": _gid(guild_id), "userId": str(user_id)})
    return res.deleted_count


# ── Scheduled moderation (survives restarts) ──────────────────────────
async def schedule_action(guild_id: int, action: str, user_id: int,
                          run_at: datetime, payload: dict | None = None) -> str:
    """Persist a future action (unban / unmute / restore_roles /
    unlock_channel / unlock_server). The dispatcher picks up due rows, so a
    restart never loses a pending expiry."""
    res = await _require_db().scheduled_actions.insert_one({
        "guildId": _gid(guild_id), "action": action, "userId": str(user_id),
        "runAt": run_at, "payload": payload or {}, "status": "pending",
        "createdAt": _now(),
    })
    return str(res.inserted_id)


async def due_scheduled_actions(now: datetime | None = None) -> list[dict]:
    cur = _require_db().scheduled_actions.find(
        {"status": "pending", "runAt": {"$lte": now or _now()}}).sort("runAt", ASCENDING).limit(50)
    return await cur.to_list(50)


async def complete_scheduled_action(doc_id: Any, result: str) -> None:
    from bson import ObjectId
    try:
        oid = doc_id if isinstance(doc_id, ObjectId) else ObjectId(str(doc_id))
    except Exception:
        return
    await _require_db().scheduled_actions.update_one(
        {"_id": oid},
        {"$set": {"status": "done", "result": str(result)[:200], "completedAt": _now()}})


# ── Lockdown state (restore exactly what WE changed) ──────────────────
async def save_lockdown_state(guild_id: int, scope: str, channel_id: int | None,
                              previous: dict) -> None:
    """Remember the pre-lockdown overwrite so unlock restores it instead of
    blindly clearing whatever an admin set meanwhile."""
    await _require_db().lockdown_state.update_one(
        {"guildId": _gid(guild_id), "scope": scope,
         "channelId": str(channel_id or "")},
        {"$set": {"previous": previous, "lockedAt": _now()}}, upsert=True)


async def get_lockdown_state(guild_id: int, scope: str, channel_id: int | None = None) -> dict | None:
    return await _require_db().lockdown_state.find_one(
        {"guildId": _gid(guild_id), "scope": scope, "channelId": str(channel_id or "")})


async def clear_lockdown_state(guild_id: int, scope: str, channel_id: int | None = None) -> None:
    await _require_db().lockdown_state.delete_one(
        {"guildId": _gid(guild_id), "scope": scope, "channelId": str(channel_id or "")})


async def claim_scheduled_action(doc_id: Any) -> dict | None:
    """Atomically take ownership of a due action. None when somebody else has it.

    This is what makes the expiry dispatcher idempotent. Previously the loop
    read the due rows, performed each action, and only THEN marked the row done:
    two overlapping sweeps (or a restart between the unban and the write) could
    run the same unban twice. ``find_one_and_update`` from pending → running is
    atomic, so exactly one caller ever gets the row.
    """
    from bson import ObjectId
    try:
        oid = doc_id if isinstance(doc_id, ObjectId) else ObjectId(str(doc_id))
    except Exception:
        return None
    doc = await _require_db().scheduled_actions.find_one_and_update(
        {"_id": oid, "status": "pending"},
        {"$set": {"status": "running", "claimedAt": _now()}},
        return_document=ReturnDocument.AFTER,
    )
    return doc


async def release_scheduled_action(doc_id: Any, result: str, *, retry: bool = False) -> None:
    """Finish a claimed action — or hand it back for a retry.

    ``retry`` returns the row to ``pending`` so a transient Discord outage is
    retried on the next sweep instead of being recorded as a completed failure.
    """
    from bson import ObjectId
    try:
        oid = doc_id if isinstance(doc_id, ObjectId) else ObjectId(str(doc_id))
    except Exception:
        return
    if retry:
        await _require_db().scheduled_actions.update_one(
            {"_id": oid, "status": "running"},
            {"$set": {"status": "pending", "lastError": str(result)[:200]},
             "$inc": {"attempts": 1}})
        return
    await _require_db().scheduled_actions.update_one(
        {"_id": oid},
        {"$set": {"status": "done", "result": str(result)[:200], "completedAt": _now()}})


async def pending_scheduled_actions(guild_id: int, *, action: str = "") -> list[dict]:
    """Pending rows for one guild — the dashboard's "what is about to happen"
    list, and how a manual unmute finds the role snapshot waiting for it."""
    query: dict[str, Any] = {"guildId": _gid(guild_id), "status": {"$in": ["pending", "running"]}}
    if action:
        query["action"] = action
    cur = _require_db().scheduled_actions.find(query).sort("runAt", ASCENDING).limit(200)
    return await cur.to_list(200)


# ── Persistent roles (restore on rejoin) ──────────────────────────────
# Only roles Murabot is WILLING to restore are stored: unmanaged, not
# @everyone, strictly below the bot's own top role, and — unless the guild
# explicitly opted in — nothing carrying a dangerous permission. "Restore what
# they had" must never mean "silently re-grant Administrator".
async def save_role_snapshot(guild_id: int, user_id: int, roles: list[dict],
                             *, opted_in: bool = False) -> int:
    """Store a member's restorable roles. Returns how many were kept."""
    rows = []
    for entry in roles or []:
        rid = entry.get("id")
        if not rid:
            continue
        rows.append({"id": str(rid), "name": str(entry.get("name") or "")[:100],
                     "dangerous": bool(entry.get("dangerous", False))})
    await _require_db().role_snapshots.update_one(
        {"guildId": _gid(guild_id), "userId": str(user_id)},
        {"$set": {"roles": rows, "optedIn": bool(opted_in), "capturedAt": _now()}},
        upsert=True,
    )
    return len(rows)


async def get_role_snapshot(guild_id: int, user_id: int) -> dict | None:
    return await _require_db().role_snapshots.find_one(
        {"guildId": _gid(guild_id), "userId": str(user_id)})


async def clear_role_snapshot(guild_id: int, user_id: int) -> None:
    await _require_db().role_snapshots.delete_one(
        {"guildId": _gid(guild_id), "userId": str(user_id)})


# ── Security posture (anti-raid / verification state) ─────────────────
# Stored, not in memory: a raid that is under way when the process restarts
# must still be under way afterwards, and a temporary protection window must
# still expire on time. This is the difference between "we turned raid mode on"
# and "raid mode is on".
async def get_security_state(guild_id: int) -> dict:
    """Current security state, defaulted when nothing is stored yet."""
    doc = await _require_db().security_state.find_one({"guildId": _gid(guild_id)}) or {}
    return {
        "guildId": _gid(guild_id),
        "raidMode": bool(doc.get("raidMode", False)),
        "raidModeUntil": doc.get("raidModeUntil"),
        "raidTriggeredAt": doc.get("raidTriggeredAt"),
        "raidReason": str(doc.get("raidReason") or ""),
        "raidAuto": bool(doc.get("raidAuto", False)),
        "verificationEnabled": bool(doc.get("verificationEnabled", False)),
        "verificationRoleId": str(doc.get("verificationRoleId") or ""),
        "verificationChannelId": str(doc.get("verificationChannelId") or ""),
        "lastReviewAt": doc.get("lastReviewAt"),
        "pendingReview": int(doc.get("pendingReview", 0)),
    }


async def set_security_state(guild_id: int, **fields: Any) -> None:
    """Patch stored security state. Unknown keys are ignored by callers, not here."""
    allowed = {"raidMode", "raidModeUntil", "raidTriggeredAt", "raidReason", "raidAuto",
               "verificationEnabled", "verificationRoleId", "verificationChannelId",
               "lastReviewAt", "pendingReview"}
    update = {k: v for k, v in fields.items() if k in allowed}
    if not update:
        return
    update["updatedAt"] = _now()
    await _require_db().security_state.update_one(
        {"guildId": _gid(guild_id)}, {"$set": update}, upsert=True)


async def bump_pending_review(guild_id: int, delta: int) -> int:
    """Count automated actions an administrator has not reviewed yet."""
    doc = await _require_db().security_state.find_one_and_update(
        {"guildId": _gid(guild_id)},
        {"$inc": {"pendingReview": int(delta)}, "$set": {"updatedAt": _now()}},
        upsert=True, return_document=ReturnDocument.AFTER,
    )
    value = int((doc or {}).get("pendingReview", 0))
    if value < 0:
        await _require_db().security_state.update_one(
            {"guildId": _gid(guild_id)}, {"$set": {"pendingReview": 0}})
        return 0
    return value


async def unreviewed_auto_actions(guild_id: int, limit: int = 25) -> list[dict]:
    """Automated (anti-raid / anti-nuke / AutoMod) actions nobody has reviewed.

    Every automated punishment is reversible by design: this is the list an
    administrator works through, and it is why an unverified heuristic is never
    allowed to apply something permanent without a human seeing it.
    """
    cur = _require_db().mod_audit.find({
        "guildId": _gid(guild_id),
        "source": {"$in": ["anti-raid", "automod"]},
        "reversible": True,
        "reviewedAt": {"$exists": False},
    }).sort("at", DESCENDING).limit(max(1, min(int(limit or 25), 100)))
    return [_audit_out(r) for r in await cur.to_list(100)]


async def mark_audit_reviewed(guild_id: int, audit_id: Any, note: str = "") -> bool:
    """Mark one automated action as reviewed (read-and-accepted or undone)."""
    from bson import ObjectId
    try:
        oid = audit_id if isinstance(audit_id, ObjectId) else ObjectId(str(audit_id))
    except Exception:
        return False
    res = await _require_db().mod_audit.update_one(
        {"_id": oid, "guildId": _gid(guild_id)},
        {"$set": {"reviewedAt": _now(), "reviewNote": redact_secrets(str(note or "")[:300])}},
    )
    return res.modified_count > 0
