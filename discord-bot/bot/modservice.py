"""Canonical moderation service — ONE implementation shared by Discord slash
commands AND the dashboard bridge.

Every entry point (a `/moderation ban` interaction, a dashboard Ban button)
calls the same function here, so Discord and the dashboard behave identically:
same permission checks, same hierarchy rules, same case records.

Result contract — every function returns a dict:
    {"ok": True, ...payload}                       on success
    {"ok": False, "code": <CODE>, "error": <text>} on failure

Codes (never conflated):
    BOT_NOT_IN_GUILD · BOT_MISSING_PERMISSION · TARGET_NOT_FOUND ·
    TARGET_NOT_ACTIONABLE · ROLE_HIERARCHY_ERROR · MUTEROLE_NOT_CONFIGURED ·
    DISCORD_API_ERROR · DATABASE_ERROR · INVALID_INPUT

Service functions NEVER raise for expected failures — they return a result
dict. Unexpected Discord/DB exceptions are caught at the boundary and mapped
to DISCORD_API_ERROR / DATABASE_ERROR so callers always get an answer.

User-permission mapping (WHO may invoke — enforced by cogs for Discord and
by requireGuildManage + these attrs for dashboard validation) lives in
USER_PERMISSIONS, taken from the command specification:
    ban/softban/tempban → Ban Members · mute/hardmute/unmute/warn (+warns
    management) → Manage Roles · kick → Kick Members ·
    timeout/removetimeout → Timeout Members (Moderate Members) ·
    notes → Manage Server · lockdown → Manage Channels ·
    purge/cleanup → Manage Server.
Bot-side requirements (CAN the bot execute) are checked inside each function
via BOT_PERMISSIONS and reported as BOT_MISSING_PERMISSION — never as a user
permission failure.
"""

import functools
import logging
import re
from datetime import datetime, timedelta, timezone

import discord

log = logging.getLogger("bot.modservice")

# ── Permission matrix (spec §49) ──────────────────────────────────────
# Invoker (human) permission attribute per action.
USER_PERMISSIONS: dict[str, str] = {
    "ban": "ban_members",
    "softban": "ban_members",
    "tempban": "ban_members",
    "unban": "ban_members",
    "mute": "manage_roles",
    "hardmute": "manage_roles",
    "unmute": "manage_roles",
    "warn": "manage_roles",
    "warnings": "manage_roles",
    "removewarning": "manage_roles",
    "clearwarnings": "manage_roles",
    "warning": "manage_roles",
    "kick": "kick_members",
    "timeout": "moderate_members",
    "removetimeout": "moderate_members",
    "setnote": "manage_guild",
    "viewnotes": "manage_guild",
    "removenote": "manage_guild",
    "clearnotes": "manage_guild",
    "lockdown": "manage_channels",
    "unlockdown": "manage_channels",
    "purge": "manage_guild",
    "cleanup": "manage_guild",
    # Phase 3 security actions. They change a server's protective posture, so
    # they are Manage Server, and they are listed here (rather than special-
    # cased in the route) so the ONE invoker check applies to them too.
    "raidmode": "manage_guild",
    "verification": "manage_guild",
}

# Bot-side Discord permission attribute per action (None = DB-only action).
BOT_PERMISSIONS: dict[str, str | None] = {
    "ban": "ban_members",
    "softban": "ban_members",
    "tempban": "ban_members",
    "unban": "ban_members",
    "mute": "manage_roles",
    "hardmute": "manage_roles",
    "unmute": "manage_roles",
    "warn": None,
    "warning": None,
    "kick": "kick_members",
    "timeout": "moderate_members",
    "removetimeout": "moderate_members",
    "lockdown": "manage_channels",
    "purge": "manage_messages",
}

PERM_LABELS = {
    "ban_members": "Ban Members",
    "kick_members": "Kick Members",
    "manage_roles": "Manage Roles",
    "moderate_members": "Timeout Members",
    "manage_channels": "Manage Channels",
    "manage_messages": "Manage Messages",
    "manage_guild": "Manage Server",
}


def _fail(code: str, error: str, **extra) -> dict:
    out = {"ok": False, "code": code, "error": error}
    out.update(extra)
    return out


def _refused(exc: discord.Forbidden, perm_label: str, what: str) -> dict:
    """Map a Discord 403 to the REAL cause.

    Discord's Cloudflare edge answers HTTP 403 + JSON code 40333
    ("internal network error") when it blocks the REQUEST ITSELF
    (challenged egress IP / flagged user agent) — the bot's permissions are
    irrelevant. discord.py surfaces that as Forbidden too, so the JSON code
    must be inspected first, or a network block is misreported as
    "I need <permission>".
    """
    if getattr(exc, "code", 0) == 40333:
        return _fail("DISCORD_API_ERROR",
                     "Discord's network filter blocked the request (Cloudflare) — "
                     "not a permission problem. Retry in a moment; if it persists, "
                     "this host's IP is challenged.")
    return _fail("BOT_MISSING_PERMISSION",
                 f"Discord refused {what} — I need **{perm_label}**.",
                 permission=perm_label)


def is_cloudflare_block(exc: BaseException) -> bool:
    """True when a Discord HTTP error is the Cloudflare edge blocking the
    request itself (JSON code 40333), not a permission decision."""
    return getattr(exc, "code", 0) == 40333


def describe_forbidden(exc: discord.Forbidden, perm_label: str, what: str) -> str:
    """User-facing text for a Discord 403 in cogs: Cloudflare blocks are
    reported as network blocks (never as missing permissions), genuine
    refusals keep the exact permission message. No lookup is trusted — the
    `code` comes from Discord's own response object."""
    if is_cloudflare_block(exc):
        return ("Discord's network filter blocked that request (Cloudflare) — "
                "not a permission problem. Try again in a moment.")
    return f"Discord refused {what} — I need **{perm_label}**."


async def refresh_bot_member(guild):
    """Re-resolve the bot's member object from the CURRENT guild.

    `guild.me` can go stale (role changes, partial member cache without the
    privileged members intent). Before reporting a permission as missing,
    fetch the live member once and re-evaluate. Returns the fresh member, or
    None when the refresh itself fails (caller keeps the original verdict —
    a failed lookup is never alibied into a permission claim).
    """
    try:
        me = getattr(guild, "me", None)
        me_id = getattr(me, "id", None)
        fetch = getattr(guild, "fetch_member", None)
        if me_id is None or fetch is None:
            return None
        fresh = await fetch(int(me_id))
        return fresh
    except Exception:
        return None


async def _bot_has(guild, attr: str) -> bool | None:
    """Bot's guild-level permission, with one refresh-on-deny.

    True = granted (live or cached), False = denied even after a fresh fetch,
    None = unresolvable (no member object at all — caller must NOT report a
    permission verdict from this).
    """
    me = getattr(guild, "me", None)
    if me is None:
        return None
    try:
        if bool(getattr(me.guild_permissions, attr, False)):
            return True
    except Exception:
        return None
    fresh = await refresh_bot_member(guild)
    if fresh is not None:
        try:
            if bool(getattr(fresh.guild_permissions, attr, False)):
                # Heal the cached object so the action below re-checks pass.
                try:
                    guild.me = fresh
                except Exception:
                    pass
                return True
        except Exception:
            pass
    return False


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Duration parsing ──────────────────────────────────────────────────
_DURATION_RE = re.compile(r"^\s*(\d+)\s*([mhdw]?)\s*$", re.IGNORECASE)


def parse_duration_minutes(raw: object, default: int = 10, maximum: int = 40320) -> int | None:
    """'10m'/'1h'/'7d'/'2w'/plain minutes → minutes. None when unparsable."""
    if raw is None:
        return default
    if isinstance(raw, (int, float)):
        minutes = int(raw)
    else:
        m = _DURATION_RE.match(str(raw))
        if not m:
            return None
        value = int(m.group(1))
        unit = (m.group(2) or "m").lower()
        minutes = value * {"m": 1, "h": 60, "d": 1440, "w": 10080}[unit]
    return max(1, min(minutes, maximum))


# ── Shared guards ─────────────────────────────────────────────────────
def _guild(bot, guild_id: int):
    try:
        guild = bot.get_guild(int(guild_id))
    except (TypeError, ValueError):
        guild = None
    return guild


def _bot_perm(guild, attr: str) -> bool:
    try:
        return bool(getattr(guild.me.guild_permissions, attr, False))
    except Exception:
        return False


async def _guard_bot(guild, action: str) -> dict | None:
    """Bot installed + holds the Discord permission for `action`.

    The permission read goes through _bot_has: on a cached denial the bot
    member is re-fetched from the CURRENT guild once before reporting the
    permission missing (stale cache false-negatives), and an unresolvable
    member yields no verdict at all (a lookup failure is never alibied into
    a permission claim)."""
    if guild is None:
        return _fail("BOT_NOT_IN_GUILD", "I'm not in that server.")
    need = BOT_PERMISSIONS.get(action)
    if not need:
        return None
    has = await _bot_has(guild, need)
    if has is True:
        return None
    if has is None:
        return _fail("DISCORD_API_ERROR",
                     "I could not resolve my own member record to check "
                     "permissions — retry in a moment, do not assume denial.")
    return _fail("BOT_MISSING_PERMISSION",
                 f"I need the **{PERM_LABELS[need]}** permission for this.",
                 permission=PERM_LABELS[need])


def _guard_target(guild, member, actor_id: int) -> dict | None:
    """Target exists, is actionable, and sits below the bot (hierarchy)."""
    if member is None:
        return _fail("TARGET_NOT_FOUND", "That member is not on this server.")
    mid = getattr(member, "id", None)
    if mid == actor_id:
        return _fail("TARGET_NOT_ACTIONABLE", "You can't moderate yourself.")
    if mid == getattr(guild.me, "id", None):
        return _fail("TARGET_NOT_ACTIONABLE", "I can't moderate myself.")
    if mid == getattr(guild, "owner_id", None):
        return _fail("TARGET_NOT_ACTIONABLE", "I can't moderate the server owner.")
    if getattr(member, "bot", False):
        return _fail("TARGET_NOT_ACTIONABLE", "Bots can't be moderated this way.")
    try:
        if member.top_role >= guild.me.top_role:
            return _fail(
                "ROLE_HIERARCHY_ERROR",
                f"I can't act on {getattr(member, 'display_name', 'them')} — their highest role "
                f"**{member.top_role.name}** is at or above mine. Fix: Server Settings → Roles → "
                "drag my role higher.",
            )
    except TypeError:
        # Non-comparable roles only happen with synthetic test doubles —
        # report honestly instead of passing or crashing.
        return _fail("DISCORD_API_ERROR", "Role hierarchy could not be evaluated.")
    return None


async def _dm(member, guild_name: str, title: str, reason: str) -> bool:
    try:
        await member.send(f"**{title} — {guild_name}**\nReason: {str(reason)[:300]}")
        return True
    except Exception:
        return False


async def _record(db, guild_id: int, target_id: int, moderator_id: int,
                 action: str, reason: str, duration: str = "", source: str = "dashboard") -> int | None:
    try:
        case_id = await db.add_case(guild_id, target_id, moderator_id, action, reason, duration, source=source)
    except Exception as exc:
        log.warning("Case recording failed for %s: %s", action, type(exc).__name__)
        return None
    try:
        await db.log_action(guild_id, moderator_id, target_id, action, reason[:300])
    except Exception:
        pass
    return case_id


# ── Audit trail (spec §3) ─────────────────────────────────────────────
# Every attempt is recorded — success AND failure — because a ban that nobody
# can see fail is how a moderator ends up believing someone was banned. The
# record carries the acting moderator, the target, the source (discord /
# dashboard / automatic rule), the case it belongs to and, for temporary
# actions, when it expires. Discriminator fields stay out of it by
# construction: nothing credential-shaped is ever passed in here.
INVOKER_SOURCES: tuple[str, ...] = ("discord", "dashboard", "verification")


def _audit_source(source: str) -> str:
    value = str(source or "system").lower()
    return value if value in ("discord", "dashboard", "automod", "anti-raid",
                             "system", "verification") else "system"


async def _audit(db, guild_id: int, action: str, *, moderator_id: int | str = 0,
                 target_id: int | str = 0, source: str = "dashboard", success: bool = True,
                 reason: str = "", case_id: int | None = None,
                 expires_at: datetime | None = None, detail: str = "",
                 reversible: bool = False, meta: dict | None = None) -> None:
    """Write one audit row. Never raises: logging must not break the action."""
    try:
        await db.log_mod_audit(
            guild_id, action, moderator_id=moderator_id or 0, target_id=target_id or 0,
            source=_audit_source(source), success=success, reason=reason, case_id=case_id,
            expires_at=expires_at, detail=detail, reversible=reversible, meta=meta)
    except Exception as exc:
        log.warning("Audit write failed for %s: %s", action, type(exc).__name__)


def _reason_from(args: tuple, kwargs: dict) -> str:
    """The reason, positional or keyword.

    Most service calls pass it as the first string after the ids; purge passes
    a kind first, which is why purge records its own audit line instead of
    relying on this.
    """
    if isinstance(kwargs.get("reason"), str) and kwargs["reason"].strip():
        return str(kwargs["reason"])
    for value in args:
        if isinstance(value, str) and value.strip():
            return value
    return ""


async def _audit_attempt(db, guild_id: int, target_id: int, action: str,
                         args: tuple, kwargs: dict, res: dict) -> None:
    """One record per attempt, derived from the call and its result."""
    source = kwargs.get("source") or "dashboard"
    ok = bool(res.get("ok"))
    minutes = res.get("expiresInMinutes")
    expires = None
    if isinstance(minutes, (int, float)) and minutes > 0:
        expires = _utcnow() + timedelta(minutes=int(minutes))
    await _audit(
        db, guild_id, action,
        moderator_id=kwargs.get("actor_id") or 0,
        target_id=target_id,
        source=source,
        success=ok,
        reason=_reason_from(args, kwargs),
        case_id=res.get("caseId"),
        expires_at=expires,
        detail="" if ok else str(res.get("error") or res.get("code") or "failed"),
        # Automatic actions are reversible by requirement: an unverified
        # heuristic must never be the last word (spec §5).
        reversible=_audit_source(source) in ("automod", "anti-raid"),
        meta={"code": res.get("code") or "OK"},
    )


def audited(action: str):
    """Decorator: audit the outcome of a service call, success or failure.

    Applied to the functions whose signature is (bot, db, guild_id, target_id,
    ...) — the ones with a different shape (server-wide lockdown, purge, notes)
    write their own record, because their target is a channel or a note rather
    than a member.
    """
    def decorate(fn):
        @functools.wraps(fn)
        async def wrapper(bot, db, guild_id, target_id, *args, **kwargs):
            try:
                res = await fn(bot, db, guild_id, target_id, *args, **kwargs)
            except Exception as exc:
                await _audit_attempt(db, int(guild_id), int(target_id or 0), action, args, kwargs,
                                     {"ok": False, "code": "BOT_ERROR",
                                      "error": f"{action} raised {type(exc).__name__}"})
                raise
            await _audit_attempt(db, int(guild_id), int(target_id or 0), action, args, kwargs, res)
            return res
        return wrapper
    return decorate


def audited_any(action: str, *, target_of=None, reason_of=None):
    """Audit a service call whose signature is not (bot, db, guild_id, target_id…).

    Server-wide lockdown, channel purge and the note bookkeeping take a channel,
    a filter or a note id where the others take a member — so the target and
    the reason are supplied by the caller instead of being guessed. Everything
    else about the record is identical, which is what keeps one audit trail
    answering "who did what to whom, from where, and did it work".
    """
    target_fn = target_of or (lambda args, kwargs, res: 0)
    reason_fn = reason_of or (lambda args, kwargs, res: "")

    def decorate(fn):
        @functools.wraps(fn)
        async def wrapper(bot, db, guild_id, *args, **kwargs):
            source = kwargs.get("source") or "dashboard"
            actor = kwargs.get("actor_id") or 0
            try:
                res = await fn(bot, db, guild_id, *args, **kwargs)
            except Exception as exc:
                await _audit(db, guild_id, action, moderator_id=actor,
                             target_id=target_fn(args, kwargs, {}), source=source,
                             success=False, reason=reason_fn(args, kwargs, {}),
                             detail=f"{action} raised {type(exc).__name__}")
                raise
            minutes = res.get("expiresInMinutes")
            await _audit(
                db, guild_id, action, moderator_id=actor,
                target_id=target_fn(args, kwargs, res), source=source,
                success=bool(res.get("ok")),
                reason=reason_fn(args, kwargs, res),
                case_id=res.get("caseId"),
                expires_at=(_utcnow() + timedelta(minutes=int(minutes))
                            if isinstance(minutes, (int, float)) and minutes > 0 else None),
                detail="" if res.get("ok") else str(res.get("error") or res.get("code") or "failed"),
                reversible=_audit_source(source) in ("automod", "anti-raid"),
                meta={"code": res.get("code") or "OK"})
            return res
        return wrapper
    return decorate


# ── Invoker authorization (spec §7) ───────────────────────────────────
# The dashboard already checked "this account may manage the guild", but that
# check runs in a browser and its inputs are untrusted. The bot re-derives the
# human side from Discord itself, twice:
#   1. the invoker holds the permission THIS action needs (Manage Server is not
#      Ban Members);
#   2. the invoker OUTRANKS the target — Discord's role hierarchy, re-read from
#      the live member, so a moderator cannot punish someone above them.
async def _resolve_actor_member(guild, actor_id):
    """Live member for the acting human: cache first, then one REST fetch.

    GET /guilds/{id}/members/{user} needs no privileged intent, so this works
    even when the member cache is partial — and a permission decision is never
    made from a member we could not resolve.
    """
    try:
        cached = guild.get_member(int(actor_id))
    except Exception:
        cached = None
    if cached is not None:
        return cached
    fetch = getattr(guild, "fetch_member", None)
    if fetch is None:
        return None
    try:
        return await fetch(int(actor_id))
    except Exception:
        return None


async def _guard_invoker(guild, action: str, actor_id: int, source: str, target=None) -> dict | None:
    """Validate the HUMANS involved. None when the call may proceed."""
    if _audit_source(source) not in INVOKER_SOURCES:
        return None  # automod / anti-raid / system: there is no invoker
    try:
        actor = int(actor_id or 0)
    except (TypeError, ValueError):
        actor = 0
    if not actor:
        return _fail("INVALID_ACTOR",
                     "An action from the website must identify the signed-in moderator.")
    if target is not None and actor == int(getattr(target, "id", 0) or 0):
        return _fail("TARGET_NOT_ACTIONABLE", "You can't moderate yourself.")
    member = await _resolve_actor_member(guild, actor)
    if member is None:
        return _fail("INVALID_ACTOR",
                     "Your Discord account is not in this server — rejoin it or sign in again.")
    attr = USER_PERMISSIONS.get(action)
    if attr:
        try:
            granted = bool(getattr(member.guild_permissions, attr, False))
        except Exception:
            return _fail("DISCORD_API_ERROR",
                         "Your permissions could not be evaluated — retry in a moment.")
        if not granted:
            label = PERM_LABELS.get(attr, attr)
            return _fail("INVOKER_MISSING_PERMISSION",
                         f"You need the **{label}** permission for this.", permission=label)
    if actor == int(getattr(guild, "owner_id", 0) or 0):
        return None
    top = getattr(target, "top_role", None) if target is not None else None
    if top is not None:
        try:
            if top >= member.top_role:
                return _fail(
                    "ROLE_HIERARCHY_ERROR",
                    f"You can't act on **{getattr(target, 'display_name', 'that member')}** — their "
                    f"highest role **{top.name}** is at or above yours.")
        except TypeError:
            return _fail("DISCORD_API_ERROR", "Role hierarchy could not be evaluated.")
    return None


# ── Persistent roles (restore on rejoin, spec §6) ─────────────────────
# "Restore what they had" must never mean "silently re-grant Administrator".
# A role is kept only when Murabot could legitimately have assigned it: not
# managed by an integration, not @everyone, strictly below the bot's own top
# role, and — unless the guild explicitly opted into dangerous restores —
# carrying none of the permissions that make a role a security boundary.
DANGEROUS_ROLE_PERMS: tuple[str, ...] = (
    "administrator", "manage_guild", "manage_roles", "manage_channels",
    "manage_webhooks", "ban_members", "kick_members", "moderate_members",
    "manage_messages", "mention_everyone",
)


def role_is_restorable(role, bot_top_position: int, *, opted_in: bool = False) -> tuple[bool, str]:
    """(may restore, why not) for one role. Pure so it can be tested directly."""
    if getattr(role, "is_default", None) and role.is_default():
        return False, "everyone-role"
    if getattr(role, "managed", False):
        return False, "integration-managed"
    try:
        if int(getattr(role, "position", 0)) >= int(bot_top_position):
            return False, "at-or-above-bot"
    except (TypeError, ValueError):
        return False, "unreadable-position"
    perms = getattr(role, "permissions", None)
    if perms is not None and not opted_in:
        for name in DANGEROUS_ROLE_PERMS:
            if bool(getattr(perms, name, False)):
                return False, f"dangerous-permission:{name}"
    return True, ""


async def snapshot_member_roles(bot, db, guild, member) -> dict:
    """Remember a leaving member's restorable roles.

    Called on member removal (leave / kick / ban). Refuses to store anything
    Murabot could not hand back: the point is a working restore, not a promise.
    """
    settings = {}
    try:
        cfg = await db.get_guild_config(guild.id)
        settings = (cfg.get("moderation") or {})
    except Exception:
        settings = {}
    opted_in = bool(settings.get("restoreDangerousRoles", False))
    try:
        bot_top = guild.me.top_role.position
    except Exception:
        return {"ok": False, "code": "DISCORD_API_ERROR", "error": "Bot role position unreadable"}
    kept: list[dict] = []
    skipped: list[str] = []
    for role in list(getattr(member, "roles", []) or []):
        ok, why = role_is_restorable(role, bot_top, opted_in=opted_in)
        if ok:
            kept.append({"id": str(role.id), "name": str(getattr(role, "name", ""))})
        else:
            skipped.append(f"{getattr(role, 'name', role)} ({why})")
    try:
        await db.save_role_snapshot(guild.id, member.id, kept, opted_in=opted_in)
    except Exception as exc:
        return {"ok": False, "code": "DATABASE_ERROR", "error": type(exc).__name__}
    await _audit(db, guild.id, "role_snapshot", moderator_id=0, target_id=member.id,
                 source="system", success=True,
                 reason=f"{len(kept)} role(s) saved for restore on rejoin",
                 detail="; ".join(skipped)[:300])
    return {"ok": True, "saved": len(kept), "skipped": skipped}


async def restore_member_roles(bot, db, guild, member) -> dict:
    """Hand a rejoining member their saved roles back — within limits.

    Skips anything the bot can no longer assign (role moved above it, deleted,
    now managed) and anything that turned dangerous while they were away, and
    audits every one of those decisions so "why didn't I get my roles back"
    has an answer.
    """
    try:
        snapshot = await db.get_role_snapshot(guild.id, member.id)
    except Exception as exc:
        return {"ok": False, "code": "DATABASE_ERROR", "error": type(exc).__name__}
    if not snapshot:
        return {"ok": True, "restored": 0, "reason": "no snapshot"}
    problem = await _guard_bot(guild, "mute")  # needs Manage Roles
    if problem:
        # Do NOT drop the snapshot: a permission problem now must not erase what
        # the member is owed once the role order is fixed.
        return {**problem, "restored": 0}
    opted_in = bool(snapshot.get("optedIn"))
    try:
        bot_top = guild.me.top_role.position
    except Exception:
        return {"ok": False, "code": "DISCORD_API_ERROR", "error": "role position unreadable"}
    restored: list[str] = []
    skipped: list[str] = []
    for entry in snapshot.get("roles") or []:
        role = guild.get_role(int(entry.get("id") or 0)) if hasattr(guild, "get_role") else None
        if role is None:
            skipped.append(f"{entry.get('name') or entry.get('id')} (deleted)")
            continue
        ok, why = role_is_restorable(role, bot_top, opted_in=opted_in)
        if not ok:
            skipped.append(f"{getattr(role, 'name', role)} ({why})")
            continue
        try:
            await member.add_roles(role, reason="Persistent role restore (Murabot)")
            restored.append(str(role.id))
        except Exception:
            skipped.append(f"{getattr(role, 'name', role)} (discord refused)")
    try:
        await db.clear_role_snapshot(guild.id, member.id)
    except Exception:
        pass
    await _audit(db, guild.id, "role_restore", moderator_id=0, target_id=member.id,
                 source="system", success=bool(restored),
                 reason=f"{len(restored)} role(s) restored on rejoin",
                 detail="; ".join(skipped)[:300])
    return {"ok": True, "restored": len(restored), "skipped": skipped}


# ── Punishments ───────────────────────────────────────────────────────
@audited("warn")
async def warn_member(bot, db, guild_id: int, target_id: int, reason: str,
                      actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    if guild is None:
        return _fail("BOT_NOT_IN_GUILD", "I'm not in that server.")
    member = guild.get_member(int(target_id)) if hasattr(guild, "get_member") else None
    problem = _guard_target(guild, member, actor_id)
    if problem:
        return problem
    problem = await _guard_invoker(guild, "warn", actor_id, source, member)
    if problem:
        return problem
    reason = (reason or "No reason given").strip()[:300]
    try:
        count = await db.add_warning(int(guild_id), int(target_id), int(actor_id), reason)
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Warning could not be stored ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id), "warn", reason, source=source)
    dm_sent = await _dm(member, guild.name, "⚠️ Warning", reason)
    return {"ok": True, "warningCount": count, "caseId": case_id, "dmSent": dm_sent}


@audited("timeout")
async def timeout_member(bot, db, guild_id: int, target_id: int, minutes: int,
                         reason: str, actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "timeout")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    problem = _guard_target(guild, member, actor_id)
    if problem:
        return problem
    problem = await _guard_invoker(guild, "timeout", actor_id, source, member)
    if problem:
        return problem
    minutes = max(1, min(int(minutes or 10), 40320))
    reason = (reason or "No reason given").strip()[:300]
    try:
        await member.timeout(_utcnow() + timedelta(minutes=minutes), reason=reason[:150])
    except discord.Forbidden as exc:
        return _refused(exc, "Timeout Members", "the timeout")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Timeout failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id),
                            "timeout", reason, f"{minutes}m", source=source)
    dm_sent = await _dm(member, guild.name, "🔇 Timeout", f"{reason} ({minutes}m)")
    return {"ok": True, "caseId": case_id, "dmSent": dm_sent}


@audited("removetimeout")
async def remove_timeout(bot, db, guild_id: int, target_id: int, reason: str,
                         actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "removetimeout")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    problem = _guard_target(guild, member, actor_id)
    if problem:
        return problem
    problem = await _guard_invoker(guild, "removetimeout", actor_id, source, member)
    if problem:
        return problem
    try:
        if not member.is_timed_out():
            return _fail("TARGET_NOT_ACTIONABLE", "That member is not timed out.")
    except Exception:
        pass
    reason = (reason or "Timeout removed").strip()[:300]
    try:
        await member.timeout(None, reason=reason[:150])
    except discord.Forbidden as exc:
        return _refused(exc, "Timeout Members", "the action")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Remove timeout failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id),
                            "removetimeout", reason, source=source)
    return {"ok": True, "caseId": case_id}


@audited("kick")
async def kick_member(bot, db, guild_id: int, target_id: int, reason: str,
                      actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "kick")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    problem = _guard_target(guild, member, actor_id)
    if problem:
        return problem
    problem = await _guard_invoker(guild, "kick", actor_id, source, member)
    if problem:
        return problem
    reason = (reason or "No reason given").strip()[:300]
    try:
        await member.kick(reason=reason[:200])
    except discord.Forbidden as exc:
        return _refused(exc, "Kick Members", "the kick")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Kick failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id), "kick", reason, source=source)
    dm_sent = await _dm(member, guild.name, "👢 Kick", reason)
    return {"ok": True, "caseId": case_id, "dmSent": dm_sent}


@audited("ban")
async def ban_member(bot, db, guild_id: int, target_id: int, reason: str,
                     delete_days: int = 0, actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "ban")
    if problem:
        return problem
    try:
        member = guild.get_member(int(target_id))
    except Exception:
        member = None
    if member is not None:
        problem = _guard_target(guild, member, actor_id)
        if problem:
            return problem
    elif int(target_id) == int(actor_id):
        return _fail("TARGET_NOT_ACTIONABLE", "You can't moderate yourself.")
    # A banned user is often not a member, so there is no role hierarchy to
    # compare against — the invoker's own Ban Members permission is still
    # re-checked, and the bot's hierarchy guard above already covered the case
    # where they ARE still here.
    problem = await _guard_invoker(guild, "ban", actor_id, source, member)
    if problem:
        return problem
    reason = (reason or "No reason given").strip()[:300]
    delete_days = max(0, min(int(delete_days or 0), 7))
    try:
        await guild.ban(discord.Object(id=int(target_id)), reason=reason[:150],
                        delete_message_days=delete_days)
    except discord.Forbidden as exc:
        return _refused(exc, "Ban Members", "the ban")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Ban failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id), "ban", reason,
                            f"delete {delete_days}d" if delete_days else "", source=source)
    dm_sent = await _dm(member, guild.name, "🔨 Ban", reason) if member else False
    return {"ok": True, "caseId": case_id, "dmSent": dm_sent}


@audited("unban")
async def unban_member(bot, db, guild_id: int, target_id: int, reason: str,
                       actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "unban")
    if problem:
        return problem
    problem = await _guard_invoker(guild, "unban", actor_id, source, None)
    if problem:
        return problem
    reason = (reason or "Unbanned").strip()[:300]
    try:
        try:
            banned = await guild.fetch_ban(discord.Object(id=int(target_id)))
            user = banned.user
        except discord.NotFound:
            return _fail("TARGET_NOT_FOUND", "That user is not banned.")
        await guild.unban(user, reason=reason[:150])
    except discord.Forbidden as exc:
        return _refused(exc, "Ban Members", "the unban")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Unban failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id), "unban", reason, source=source)
    return {"ok": True, "caseId": case_id}


@audited("softban")
async def softban_member(bot, db, guild_id: int, target_id: int, reason: str,
                         delete_days: int = 1, actor_id: int = 0, source: str = "dashboard") -> dict:
    """Ban (clearing message history) then immediately unban."""
    banned = await ban_member(bot, db, guild_id, target_id, reason, delete_days, actor_id, source)
    if not banned.get("ok"):
        return banned
    unban = await unban_member(bot, db, guild_id, target_id, f"Softban release: {reason}"[:300],
                               actor_id, source)
    if not unban.get("ok"):
        return _fail(unban.get("code", "DISCORD_API_ERROR"),
                     f"Banned, but the release unban failed: {unban.get('error')}")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id),
                            "softban", reason, source=source)
    return {"ok": True, "caseId": case_id}


@audited("tempban")
async def tempban_member(bot, db, guild_id: int, target_id: int, reason: str,
                         delete_days: int = 0, duration_minutes: int = 60,
                         actor_id: int = 0, source: str = "dashboard") -> dict:
    """Ban now, persist an unban for later — the schedule survives restarts."""
    banned = await ban_member(bot, db, guild_id, target_id, reason, delete_days, actor_id, source)
    if not banned.get("ok"):
        return banned
    duration_minutes = max(1, min(int(duration_minutes or 60), 40320))
    try:
        await db.schedule_action(int(guild_id), "unban", int(target_id),
                                 _utcnow() + timedelta(minutes=duration_minutes),
                                 {"reason": reason[:150], "actorId": int(actor_id), "source": source})
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Banned, but the expiry could not be scheduled ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id),
                            "tempban", reason, f"{duration_minutes}m", source=source)
    return {"ok": True, "caseId": case_id, "expiresInMinutes": duration_minutes}


# ── Role-based mute ───────────────────────────────────────────────────
async def _mute_role(guild, db, guild_id: int) -> tuple[dict | None, object | None]:
    try:
        role_id = await db.get_mute_role_id(int(guild_id))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Muterole lookup failed ({type(exc).__name__})."), None
    if not role_id:
        return _fail("MUTEROLE_NOT_CONFIGURED",
                     "No Muterole is configured. Set one in Moderation → Action policies first."), None
    role = guild.get_role(int(role_id)) if hasattr(guild, "get_role") else None
    if role is None:
        return _fail("MUTEROLE_NOT_CONFIGURED",
                     "The configured Muterole no longer exists — pick a new one in Action policies."), None
    try:
        if role >= guild.me.top_role and not getattr(guild.me.guild_permissions, "administrator", False):
            return _fail("ROLE_HIERARCHY_ERROR",
                         f"I can't assign @{role.name} — it is at or above my highest role."), None
    except TypeError:
        return _fail("DISCORD_API_ERROR", "Role hierarchy could not be evaluated."), None
    return None, role


@audited("mute")
async def mute_member(bot, db, guild_id: int, target_id: int, reason: str,
                      duration_minutes: int | None = None,
                      actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "mute")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    problem = _guard_target(guild, member, actor_id)
    if problem:
        return problem
    problem = await _guard_invoker(guild, "mute", actor_id, source, member)
    if problem:
        return problem
    problem, role = await _mute_role(guild, db, int(guild_id))
    if problem:
        return problem
    reason = (reason or "No reason given").strip()[:300]
    try:
        await member.add_roles(role, reason=reason[:150])
    except discord.Forbidden as exc:
        return _refused(exc, "Manage Roles", "the action")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Mute failed ({type(exc).__name__}).")
    dur_label = ""
    if duration_minutes:
        duration_minutes = max(1, min(int(duration_minutes), 40320))
        try:
            await db.schedule_action(int(guild_id), "unmute", int(target_id),
                                     _utcnow() + timedelta(minutes=duration_minutes),
                                     {"reason": reason[:150], "actorId": int(actor_id), "source": source})
            dur_label = f"{duration_minutes}m"
        except Exception as exc:
            return _fail("DATABASE_ERROR",
                         f"Muted, but the expiry could not be scheduled ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id),
                            "mute", reason, dur_label, source=source)
    dm_sent = await _dm(member, guild.name, "🔇 Mute", reason)
    return {"ok": True, "caseId": case_id, "dmSent": dm_sent}


@audited("hardmute")
async def hardmute_member(bot, db, guild_id: int, target_id: int, reason: str,
                          duration_minutes: int | None = None,
                          actor_id: int = 0, source: str = "dashboard") -> dict:
    """Mute + strip all other roles (saved for restoration)."""
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "hardmute")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    problem = _guard_target(guild, member, actor_id)
    if problem:
        return problem
    problem = await _guard_invoker(guild, "hardmute", actor_id, source, member)
    if problem:
        return problem
    problem, role = await _mute_role(guild, db, int(guild_id))
    if problem:
        return problem
    reason = (reason or "No reason given").strip()[:300]
    try:
        current = [r for r in list(getattr(member, "roles", []) or [])
                   if getattr(r, "id", None) != getattr(guild, "id", None)
                   and not getattr(r, "managed", False)
                   and getattr(r, "id", None) != getattr(role, "id", None)]
        saved_ids = [int(r.id) for r in current if hasattr(r, "id")]
        removable = [r for r in current if r.position < guild.me.top_role.position]
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Role evaluation failed ({type(exc).__name__}).")
    try:
        if removable:
            await member.remove_roles(*removable, reason=f"Hardmute: {reason[:100]}")
        await member.add_roles(role, reason=reason[:150])
    except discord.Forbidden as exc:
        return _refused(exc, "Manage Roles", "the action")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Hardmute failed ({type(exc).__name__}).")
    payload = {"reason": reason[:150], "actorId": int(actor_id), "source": source,
               "restoreRoles": saved_ids}
    if duration_minutes:
        duration_minutes = max(1, min(int(duration_minutes), 40320))
        payload["runAtMinutes"] = duration_minutes
        try:
            await db.schedule_action(int(guild_id), "unmute", int(target_id),
                                     _utcnow() + timedelta(minutes=duration_minutes), payload)
        except Exception as exc:
            return _fail("DATABASE_ERROR",
                         f"Hard-muted, but the expiry could not be scheduled ({type(exc).__name__}).")
    else:
        # Indefinite hardmute still needs its role snapshot restorable —
        # persist a far-future row the dispatcher ignores until unmute clears it.
        try:
            await db.schedule_action(int(guild_id), "restore_roles", int(target_id),
                                     _utcnow() + timedelta(days=3650), payload)
        except Exception:
            pass
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id),
                            "hardmute", reason,
                            f"{duration_minutes}m" if duration_minutes else "", source=source)
    dm_sent = await _dm(member, guild.name, "🔇 Hard mute", reason)
    return {"ok": True, "caseId": case_id, "dmSent": dm_sent}


@audited("unmute")
async def unmute_member(bot, db, guild_id: int, target_id: int, reason: str,
                        actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "unmute")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    if member is None:
        return _fail("TARGET_NOT_FOUND", "That member is not on this server.")
    problem = await _guard_invoker(guild, "unmute", actor_id, source, member)
    if problem:
        return problem
    problem, role = await _mute_role(guild, db, int(guild_id))
    if problem:
        return problem
    reason = (reason or "Unmuted").strip()[:300]
    # Restore roles saved by a hardmute (pending restore row for this user).
    restore_ids: list[int] = []
    try:
        for row in await db.due_scheduled_actions(_utcnow() + timedelta(days=3650)):
            if (str(row.get("guildId")) == str(guild_id)
                    and str(row.get("userId")) == str(target_id)
                    and row.get("action") in ("unmute", "restore_roles")
                    and row.get("status", "pending") == "pending"):
                for rid in (row.get("payload") or {}).get("restoreRoles") or []:
                    try:
                        restore_ids.append(int(rid))
                    except (TypeError, ValueError):
                        pass
                await db.complete_scheduled_action(row["_id"], "manual unmute")
    except Exception:
        pass
    try:
        if role in list(getattr(member, "roles", []) or []):
            await member.remove_roles(role, reason=reason[:150])
        restored = 0
        for rid in restore_ids:
            r = guild.get_role(rid) if hasattr(guild, "get_role") else None
            if r is None or getattr(r, "managed", False):
                continue
            try:
                if r.position < guild.me.top_role.position:
                    await member.add_roles(r, reason="Hardmute release")
                    restored += 1
            except (discord.Forbidden, discord.HTTPException):
                continue
    except discord.Forbidden as exc:
        return _refused(exc, "Manage Roles", "the action")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Unmute failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id),
                            "unmute", reason, source=source)
    return {"ok": True, "caseId": case_id, "rolesRestored": restored}


# ── Warning management (shared by Discord + dashboard) ────────────────
async def view_warnings(db, guild_id: int, target_id: int) -> dict:
    try:
        entries = await db.get_warnings(int(guild_id), int(target_id))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Warnings could not be loaded ({type(exc).__name__}).")
    return {"ok": True, "warnings": [
        {"reason": e.get("reason", ""), "moderatorId": str(e.get("moderatorId", "")),
         "at": e.get("at").isoformat() if hasattr(e.get("at"), "isoformat") else str(e.get("at"))}
        for e in (entries or [])]}


async def remove_warning(db, guild_id: int, target_id: int, index: int,
                         actor_id: int = 0, source: str = "dashboard") -> dict:
    try:
        ok = await db.remove_warning(int(guild_id), int(target_id), int(index))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Warning could not be removed ({type(exc).__name__}).")
    if not ok:
        return _fail("TARGET_NOT_FOUND", f"Warning #{index} does not exist.")
    await _audit(db, guild_id, "warning_remove", moderator_id=actor_id, target_id=target_id,
                 source=source, success=True, reason=f"warning #{index}")
    return {"ok": True, "removed": int(index)}


async def clear_warnings(db, guild_id: int, target_id: int, actor_id: int = 0,
                         source: str = "dashboard") -> dict:
    try:
        cleared = await db.clear_warnings(int(guild_id), int(target_id))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Warnings could not be cleared ({type(exc).__name__}).")
    await _audit(db, guild_id, "warning_clear", moderator_id=actor_id, target_id=target_id,
                 source=source, success=True, reason="record cleaned")
    return {"ok": True, "cleared": bool(cleared)}


# ── User notes (Manage Server, DB-only — no Discord permission needed) ─
async def set_note(db, guild_id: int, target_id: int, text: str, actor_id: int = 0,
                   source: str = "dashboard") -> dict:
    text = (text or "").strip()[:1000]
    if not text:
        return _fail("INVALID_INPUT", "Note text is required.")
    try:
        note_id = await db.add_user_note(int(guild_id), int(target_id), int(actor_id), text)
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Note could not be saved ({type(exc).__name__}).")
    await _audit(db, guild_id, "note_add", moderator_id=actor_id, target_id=target_id,
                 source=source, success=True, reason=text,
                 meta={"noteId": str(note_id)})
    return {"ok": True, "noteId": note_id}


async def view_notes(db, guild_id: int, target_id: int) -> dict:
    try:
        notes = await db.get_user_notes(int(guild_id), int(target_id))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Notes could not be loaded ({type(exc).__name__}).")
    return {"ok": True, "notes": [
        {"noteId": n.get("noteId"), "text": n.get("text", ""),
         "moderatorId": str(n.get("moderatorId", "")),
         "createdAt": n.get("createdAt").isoformat() if hasattr(n.get("createdAt"), "isoformat") else str(n.get("createdAt"))}
        for n in (notes or [])]}


async def remove_note(db, guild_id: int, note_id: int, actor_id: int = 0,
                      source: str = "dashboard") -> dict:
    try:
        ok = await db.remove_user_note(int(guild_id), int(note_id))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Note could not be removed ({type(exc).__name__}).")
    if not ok:
        return _fail("TARGET_NOT_FOUND", f"Note #{note_id} does not exist in this server.")
    await _audit(db, guild_id, "note_remove", moderator_id=actor_id, source=source,
                 success=True, reason=f"note #{note_id}")
    return {"ok": True, "removed": int(note_id)}


async def clear_notes(db, guild_id: int, target_id: int, actor_id: int = 0,
                      source: str = "dashboard") -> dict:
    try:
        count = await db.clear_user_notes(int(guild_id), int(target_id))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Notes could not be cleared ({type(exc).__name__}).")
    await _audit(db, guild_id, "note_clear", moderator_id=actor_id, target_id=target_id,
                 source=source, success=True, reason=f"{count} note(s) cleared")
    return {"ok": True, "cleared": int(count)}


# ── Lockdown ──────────────────────────────────────────────────────────
def _text_channels(guild):
    try:
        channels = list(getattr(guild, "text_channels", []) or [])
    except Exception:
        channels = []
    return channels


def _everyone_overwrite(channel, guild):
    try:
        return channel.overwrites_for(guild.default_role)
    except Exception:
        return None


@audited("lockdown")
async def lockdown_channel(bot, db, guild_id: int, channel_id: int, reason: str,
                           duration_minutes: int | None = None,
                           actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "lockdown")
    if problem:
        return problem
    problem = await _guard_invoker(guild, "lockdown", actor_id, source, None)
    if problem:
        return problem
    channel = guild.get_channel(int(channel_id)) if hasattr(guild, "get_channel") else None
    if channel is None or getattr(channel, "type", None) not in (None, discord.ChannelType.text,
                                                                  discord.ChannelType.news,
                                                                  discord.ChannelType.forum):
        # get_channel may return voice/stage — only text-like channels lock.
        if channel is not None and str(getattr(channel, "type", "")).lower() not in (
                "text", "news", "forum", "textchannel", "newschannel", "forumchannel"):
            return _fail("TARGET_NOT_FOUND", "That channel cannot be locked (text channels only).")
    try:
        if guild.me is None:
            return _fail("DISCORD_API_ERROR",
                         "I could not resolve my own member record in that server — "
                         "retry in a moment, do not assume denial.")
        allowed = channel.permissions_for(guild.me).manage_channels
        if not allowed:
            # The cached member can go stale (role changes, partial member
            # cache): re-resolve from the CURRENT guild once before
            # reporting the permission missing.
            fresh = await refresh_bot_member(guild)
            if fresh is not None:
                try:
                    allowed = channel.permissions_for(fresh).manage_channels
                except Exception:
                    pass
        if not allowed:
            return _fail("BOT_MISSING_PERMISSION",
                         f"I need **Manage Channels** in #{getattr(channel, 'name', '?')}.",
                         permission="Manage Channels")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Permission check failed ({type(exc).__name__}).")
    overwrite = _everyone_overwrite(channel, guild)
    if overwrite is None:
        return _fail("DISCORD_API_ERROR", "Channel overwrites are unavailable.")
    reason = (reason or "Lockdown").strip()[:300]
    previous = {"send_messages": overwrite.send_messages}
    try:
        await db.save_lockdown_state(int(guild_id), "channel", int(channel_id), previous)
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Lockdown state could not be stored ({type(exc).__name__}).")
    try:
        overwrite.send_messages = False
        await channel.set_permissions(guild.default_role, overwrite=overwrite,
                                      reason=f"Lockdown: {reason[:100]}")
    except discord.Forbidden as exc:
        return _refused(exc, "Manage Channels", "the action there")
    except (discord.HTTPException, Exception) as exc:
        return _fail("DISCORD_API_ERROR", f"Lock failed ({type(exc).__name__}).")
    dur_label = ""
    if duration_minutes:
        duration_minutes = max(1, min(int(duration_minutes), 40320))
        try:
            await db.schedule_action(int(guild_id), "unlock_channel", 0,
                                     _utcnow() + timedelta(minutes=duration_minutes),
                                     {"channelId": int(channel_id), "actorId": int(actor_id), "source": source})
            dur_label = f"{duration_minutes}m"
        except Exception as exc:
            return _fail("DATABASE_ERROR",
                         f"Locked, but auto-unlock could not be scheduled ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(channel_id), int(actor_id),
                            "lockdown", f"#{getattr(channel, 'name', channel_id)}: {reason}",
                            dur_label, source=source)
    return {"ok": True, "caseId": case_id, "channelId": str(channel_id)}


@audited("unlock")
async def unlock_channel(bot, db, guild_id: int, channel_id: int, reason: str,
                         actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "lockdown")
    if problem:
        return problem
    problem = await _guard_invoker(guild, "unlockdown", actor_id, source, None)
    if problem:
        return problem
    channel = guild.get_channel(int(channel_id)) if hasattr(guild, "get_channel") else None
    if channel is None:
        return _fail("TARGET_NOT_FOUND", "That channel no longer exists.")
    overwrite = _everyone_overwrite(channel, guild)
    if overwrite is None:
        return _fail("DISCORD_API_ERROR", "Channel overwrites are unavailable.")
    try:
        state = await db.get_lockdown_state(int(guild_id), "channel", int(channel_id))
    except Exception:
        state = None
    restore = (state or {}).get("previous") or {}
    try:
        overwrite.send_messages = restore.get("send_messages", None)
        await channel.set_permissions(guild.default_role, overwrite=overwrite,
                                      reason=f"Unlock: {(reason or '')[:100]}")
    except discord.Forbidden as exc:
        return _refused(exc, "Manage Channels", "the action there")
    except (discord.HTTPException, Exception) as exc:
        return _fail("DISCORD_API_ERROR", f"Unlock failed ({type(exc).__name__}).")
    try:
        await db.clear_lockdown_state(int(guild_id), "channel", int(channel_id))
        # Cancel a pending auto-unlock for the same channel.
        for row in await db.due_scheduled_actions(_utcnow() + timedelta(days=3650)):
            payload = row.get("payload") or {}
            if (str(row.get("guildId")) == str(guild_id) and row.get("action") == "unlock_channel"
                    and str(payload.get("channelId")) == str(channel_id)):
                await db.complete_scheduled_action(row["_id"], "manual unlock")
    except Exception:
        pass
    case_id = await _record(db, int(guild_id), int(channel_id), int(actor_id),
                            "unlock", f"#{getattr(channel, 'name', channel_id)}", source=source)
    return {"ok": True, "caseId": case_id}


@audited_any("lockdown", reason_of=lambda args, kwargs, res: (args[0] if args else kwargs.get("reason") or "server lockdown"))
async def lockdown_server(bot, db, guild_id: int, reason: str,
                          duration_minutes: int | None = None,
                          actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "lockdown")
    if problem:
        return problem
    problem = await _guard_invoker(guild, "lockdown", actor_id, source, None)
    if problem:
        return problem
    reason = (reason or "Server lockdown").strip()[:300]
    locked: list[str] = []
    skipped: list[str] = []
    for channel in _text_channels(guild):
        try:
            if not channel.permissions_for(guild.me).manage_channels:
                skipped.append(str(getattr(channel, "id", "?")))
                continue
            overwrite = _everyone_overwrite(channel, guild)
            if overwrite is None or overwrite.send_messages is False:
                continue  # already locked or unreadable — leave untouched
            await db.save_lockdown_state(int(guild_id), "server", int(channel.id),
                                         {"send_messages": overwrite.send_messages})
            overwrite.send_messages = False
            await channel.set_permissions(guild.default_role, overwrite=overwrite,
                                          reason=f"Server lockdown: {reason[:100]}")
            locked.append(str(channel.id))
        except (discord.Forbidden, discord.HTTPException):
            skipped.append(str(getattr(channel, "id", "?")))
        except Exception:
            skipped.append(str(getattr(channel, "id", "?")))
    if duration_minutes:
        duration_minutes = max(1, min(int(duration_minutes), 40320))
        try:
            await db.schedule_action(int(guild_id), "unlock_server", 0,
                                     _utcnow() + timedelta(minutes=duration_minutes),
                                     {"actorId": int(actor_id), "source": source})
        except Exception as exc:
            return _fail("DATABASE_ERROR",
                         f"Locked {len(locked)} channels, but auto-unlock could not be scheduled "
                         f"({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), 0, int(actor_id), "lockdown",
                            f"Server lockdown ({len(locked)} channels): {reason}",
                            f"{duration_minutes}m" if duration_minutes else "", source=source)
    return {"ok": True, "caseId": case_id, "locked": locked, "skipped": skipped}


@audited_any("unlock", reason_of=lambda args, kwargs, res: (args[0] if args else kwargs.get("reason") or "server unlock"))
async def unlock_server(bot, db, guild_id: int, reason: str,
                        actor_id: int = 0, source: str = "dashboard") -> dict:
    """Restore ONLY channels this service locked (saved state) — never
    unrelated administrator overwrites."""
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "lockdown")
    if problem:
        return problem
    problem = await _guard_invoker(guild, "unlockdown", actor_id, source, None)
    if problem:
        return problem
    restored: list[str] = []
    for channel in _text_channels(guild):
        try:
            state = await db.get_lockdown_state(int(guild_id), "server", int(channel.id))
        except Exception:
            state = None
        if not state:
            continue
        try:
            if not channel.permissions_for(guild.me).manage_channels:
                continue
            overwrite = _everyone_overwrite(channel, guild)
            if overwrite is None:
                continue
            overwrite.send_messages = (state.get("previous") or {}).get("send_messages", None)
            await channel.set_permissions(guild.default_role, overwrite=overwrite,
                                          reason=f"Lockdown lift: {(reason or '')[:100]}")
            restored.append(str(channel.id))
            await db.clear_lockdown_state(int(guild_id), "server", int(channel.id))
        except (discord.Forbidden, discord.HTTPException, Exception):
            continue
    try:
        for row in await db.due_scheduled_actions(_utcnow() + timedelta(days=3650)):
            if (str(row.get("guildId")) == str(guild_id) and row.get("action") == "unlock_server"):
                await db.complete_scheduled_action(row["_id"], "manual unlock")
    except Exception:
        pass
    case_id = await _record(db, int(guild_id), 0, int(actor_id),
                            "unlock", f"Server unlock ({len(restored)} channels restored)",
                            source=source)
    return {"ok": True, "caseId": case_id, "restored": restored}


# ── Purge ─────────────────────────────────────────────────────────────
_URL_RE = re.compile(r"https?://", re.IGNORECASE)
_EMOJI_RE = re.compile(r"<a?:\w+:\d+>", re.IGNORECASE)


def _purge_match(kind: str, msg, user_id: int | None, text: str) -> bool:
    try:
        if getattr(msg, "pinned", False):
            return False  # purge ignores pinned; cleanup passes include_pinned
        author = getattr(msg, "author", None)
        is_bot = bool(getattr(author, "bot", False))
        content = str(getattr(msg, "content", "") or "")
        if kind == "bot":
            return is_bot
        if kind == "human":
            return not is_bot
        if kind == "user":
            return author is not None and int(getattr(author, "id", -1)) == int(user_id or -1)
        if kind == "contains":
            return text.lower() in content.lower() if text else False
        if kind == "embeds":
            return bool(getattr(msg, "embeds", None))
        if kind == "emoji":
            return bool(_EMOJI_RE.search(content))
        if kind == "files":
            return bool([a for a in (getattr(msg, "attachments", None) or [])
                         if not str(getattr(a, "content_type", "") or "").startswith("image/")])
        if kind == "images":
            has_image_attach = any(
                str(getattr(a, "content_type", "") or "").startswith("image/")
                for a in (getattr(msg, "attachments", None) or []))
            has_image_embed = any(
                getattr(getattr(e, "image", None), "url", None) or getattr(getattr(e, "thumbnail", None), "url", None)
                for e in (getattr(msg, "embeds", None) or []))
            return bool(has_image_attach or has_image_embed)
        if kind == "links":
            return bool(_URL_RE.search(content))
        if kind == "mentions":
            return bool(getattr(msg, "mentions", None)) or "@everyone" in content or "@here" in content
        return True  # "all"
    except Exception:
        return False


@audited_any(
    "purge",
    target_of=lambda args, kwargs, res: (args[0] if args else kwargs.get("channel_id") or 0),
    reason_of=lambda args, kwargs, res: f"{(args[1] if len(args) > 1 else kwargs.get('kind')) or 'all'} "
                                        f"purge ×{args[2] if len(args) > 2 else kwargs.get('count') or 0}")
async def purge_messages(bot, db, guild_id: int, channel_id: int, kind: str, count: int,
                         user_id: int | None = None, text: str = "",
                         include_pinned: bool = False,
                         actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = await _guard_bot(guild, "purge")
    if problem:
        return problem
    problem = await _guard_invoker(guild, "purge", actor_id, source, None)
    if problem:
        return problem
    kind = (kind or "all").lower()
    if kind not in ("bot", "contains", "user", "all", "embeds", "emoji", "files",
                    "images", "links", "mentions", "human"):
        return _fail("INVALID_INPUT", f"Unknown purge kind: {kind}.")
    count = max(1, min(int(count or 1), 100))
    channel = guild.get_channel(int(channel_id)) if hasattr(guild, "get_channel") else None
    if channel is None:
        return _fail("TARGET_NOT_FOUND", "That channel no longer exists.")
    try:
        perms = channel.permissions_for(guild.me)
        if not perms.manage_messages or not perms.read_message_history:
            return _fail("BOT_MISSING_PERMISSION",
                         "I need **Manage Messages** + **Read History** there.",
                         permission="Manage Messages")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Permission check failed ({type(exc).__name__}).")
    if kind == "user" and not user_id:
        return _fail("INVALID_INPUT", "A member is required for user purge.")
    if kind == "contains" and not (text or "").strip():
        return _fail("INVALID_INPUT", "Search text is required for contains purge.")

    matched: list = []
    scanned = 0
    try:
        async for msg in channel.history(limit=500):
            scanned += 1
            if include_pinned or not getattr(msg, "pinned", False):
                if _purge_match(kind, msg, user_id, (text or "").strip()):
                    matched.append(msg)
                    if len(matched) >= count:
                        break
    except discord.Forbidden as exc:
        return _refused(exc, "Read History", "history access")
    except (discord.HTTPException, Exception) as exc:
        return _fail("DISCORD_API_ERROR", f"History scan failed ({type(exc).__name__}).")

    deleted = 0
    try:
        # Bulk delete works for <14d messages; fall back to single deletes.
        while matched:
            batch = matched[:100]
            matched = matched[100:]
            try:
                await channel.delete_messages(batch)
                deleted += len(batch)
            except Exception:
                for msg in batch:
                    try:
                        await msg.delete()
                        deleted += 1
                    except Exception:
                        continue
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Delete failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(channel_id), int(actor_id),
                            "cleanup" if include_pinned else "purge",
                            f"{kind} purge: {deleted} deleted (scanned {scanned})",
                            source=source)
    return {"ok": True, "deleted": deleted, "scanned": scanned, "caseId": case_id}


# ── Scheduled-action dispatcher (survives restarts) ───────────────────
#: Failures worth retrying: the row goes back to `pending` and the next sweep
#: tries again. A permanent refusal (the channel is gone, the user is not
#: banned) is NOT retried forever — it is recorded and closed.
RETRYABLE_CODES = ("DISCORD_API_ERROR", "DATABASE_ERROR", "BOT_MISSING_PERMISSION")
MAX_SCHEDULED_ATTEMPTS = 5


async def run_due(bot, db) -> dict:
    """Execute due scheduled rows exactly once each: unban / unmute (+role
    restore) / unlock_channel / unlock_server / raid-mode expiry.

    Idempotency is enforced by CLAIMING the row first (pending → running is
    atomic), so two overlapping sweeps — or a restart mid-sweep — can never
    perform the same expiry twice. A transient Discord failure is handed back
    for retry; a permanent one is closed with its reason recorded.
    """
    try:
        rows = await db.due_scheduled_actions()
    except Exception as exc:
        return {"ok": False, "code": "DATABASE_ERROR", "error": type(exc).__name__}
    done = 0
    retried = 0
    for row in rows:
        try:
            claimed = await db.claim_scheduled_action(row.get("_id"))
        except Exception:
            claimed = None
        if not claimed:
            continue  # another sweep owns it (or it is already finished)
        gid = claimed.get("guildId")
        action = claimed.get("action")
        uid = claimed.get("userId")
        payload = claimed.get("payload") or {}
        attempts = int(claimed.get("attempts") or 0)
        try:
            if action == "unban":
                res = await unban_member(bot, db, int(gid), int(uid),
                                         "Temporary ban expired", 0, "system")
            elif action in ("unmute", "restore_roles"):
                res = await unmute_member(bot, db, int(gid), int(uid),
                                          "Mute expired", 0, "system")
            elif action == "unlock_channel":
                res = await unlock_channel(bot, db, int(gid), int(payload.get("channelId") or 0),
                                           "Scheduled unlock", 0, "system")
            elif action == "unlock_server":
                res = await unlock_server(bot, db, int(gid), "Scheduled unlock", 0, "system")
            elif action == "disable_raid_mode":
                res = await end_raid_mode(bot, db, int(gid), reason="Protection window expired")
            elif action == "restore_roles_on_rejoin":
                # Members who left while muted: their snapshot is restorable
                # through the join path, so the row is informational only.
                res = {"ok": True}
            else:
                res = {"ok": False, "code": "INVALID_INPUT",
                       "error": f"unknown scheduled action {action}"}
        except Exception as exc:
            res = {"ok": False, "code": "BOT_ERROR", "error": type(exc).__name__}
        code = str(res.get("code") or "")
        if res.get("ok"):
            done += 1
            await db.release_scheduled_action(claimed["_id"], "ok")
            continue
        if code in RETRYABLE_CODES and attempts + 1 < MAX_SCHEDULED_ATTEMPTS:
            retried += 1
            await db.release_scheduled_action(
                claimed["_id"], f"{code}: {res.get('error')}", retry=True)
            await _audit(db, int(gid), action, moderator_id=0, target_id=uid,
                         source="system", success=False,
                         reason="scheduled action retry",
                         detail=f"{code}: {res.get('error')}"[:300])
            continue
        await db.release_scheduled_action(
            claimed["_id"], f"{code or 'FAILED'}: {res.get('error')}"[:200])
        await _audit(db, int(gid), action, moderator_id=0, target_id=uid,
                     source="system", success=False,
                     reason="scheduled action gave up",
                     detail=f"{code}: {res.get('error')}"[:300])
    return {"ok": True, "processed": done, "retried": retried, "due": len(rows)}


# ── Anti-raid state (shared with the security cog) ────────────────────
async def begin_raid_mode(bot, db, guild_id: int, *, minutes: int = 10, reason: str = "",
                          automatic: bool = True, actor_id: int = 0,
                          source: str = "anti-raid") -> dict:
    """Turn protection ON and STORE it, along with its own expiry.

    Stored because "raid mode is on" has to survive a restart, and because the
    automatic expiry is a scheduled row: the same dispatcher that lifts a temp
    ban lifts the protection window, so recovery is guaranteed even if the bot
    restarts during the raid.
    """
    minutes = max(1, min(int(minutes or 10), 1440))
    until = _utcnow() + timedelta(minutes=minutes)
    try:
        await db.set_security_state(int(guild_id), raidMode=True, raidModeUntil=until,
                                    raidTriggeredAt=_utcnow(), raidReason=reason[:200],
                                    raidAuto=bool(automatic))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Raid mode could not be stored ({type(exc).__name__}).")
    try:
        await db.schedule_action(int(guild_id), "disable_raid_mode", 0, until,
                                 {"reason": reason[:150], "actorId": int(actor_id),
                                  "source": source})
    except Exception as exc:
        return _fail("DATABASE_ERROR",
                     f"Raid mode is ON but the expiry could not be scheduled "
                     f"({type(exc).__name__}) — turn it off manually.")
    await _audit(db, guild_id, "raidmode_on", moderator_id=actor_id, target_id=0,
                 source=source, success=True, reason=reason or "raid protection enabled",
                 expires_at=until, reversible=True)
    return {"ok": True, "until": until.isoformat(), "minutes": minutes}


async def end_raid_mode(bot, db, guild_id: int, *, reason: str = "", actor_id: int = 0,
                        source: str = "anti-raid") -> dict:
    """Turn protection OFF, cancel its expiry and record the recovery."""
    try:
        await db.set_security_state(int(guild_id), raidMode=False, raidModeUntil=None)
        for row in await db.pending_scheduled_actions(int(guild_id), action="disable_raid_mode"):
            await db.release_scheduled_action(row["_id"], "raid mode ended")
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Raid mode could not be cleared ({type(exc).__name__}).")
    await _audit(db, guild_id, "raidmode_off", moderator_id=actor_id, target_id=0,
                 source=source, success=True, reason=reason or "raid protection lifted")
    return {"ok": True}


async def raid_mode_active(bot, db, guild_id: int) -> dict:
    """Read the stored protection state, expiring it honestly when it lapsed.

    A stale ``raidMode: true`` whose window has passed is reported as OFF and
    repaired, rather than left to keep timing out new members forever because
    the process that armed it died before the expiry ran.
    """
    try:
        state = await db.get_security_state(int(guild_id))
    except Exception as exc:
        return {"active": False, "unknown": True, "error": type(exc).__name__}
    if not state.get("raidMode"):
        return {"active": False, "until": None, "automatic": False}
    until = state.get("raidModeUntil")
    if isinstance(until, datetime) and until <= _utcnow():
        await end_raid_mode(bot, db, int(guild_id), reason="Protection window had already expired")
        return {"active": False, "until": None, "expired": True}
    return {"active": True, "until": until.isoformat() if isinstance(until, datetime) else None,
            "automatic": bool(state.get("raidAuto")), "reason": state.get("raidReason", "")}
