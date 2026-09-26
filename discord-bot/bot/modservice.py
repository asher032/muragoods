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


def _guard_bot(guild, action: str) -> dict | None:
    """Bot installed + holds the Discord permission for `action`."""
    if guild is None:
        return _fail("BOT_NOT_IN_GUILD", "I'm not in that server.")
    need = BOT_PERMISSIONS.get(action)
    if need and not _bot_perm(guild, need):
        return _fail("BOT_MISSING_PERMISSION",
                     f"I need the **{PERM_LABELS[need]}** permission for this.",
                     permission=PERM_LABELS[need])
    return None


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


# ── Punishments ───────────────────────────────────────────────────────
async def warn_member(bot, db, guild_id: int, target_id: int, reason: str,
                      actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    if guild is None:
        return _fail("BOT_NOT_IN_GUILD", "I'm not in that server.")
    member = guild.get_member(int(target_id)) if hasattr(guild, "get_member") else None
    problem = _guard_target(guild, member, actor_id)
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


async def timeout_member(bot, db, guild_id: int, target_id: int, minutes: int,
                         reason: str, actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "timeout")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    problem = _guard_target(guild, member, actor_id)
    if problem:
        return problem
    minutes = max(1, min(int(minutes or 10), 40320))
    reason = (reason or "No reason given").strip()[:300]
    try:
        await member.timeout(_utcnow() + timedelta(minutes=minutes), reason=reason[:150])
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused the timeout — I need **Timeout Members**.",
                     permission="Timeout Members")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Timeout failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id),
                            "timeout", reason, f"{minutes}m", source=source)
    dm_sent = await _dm(member, guild.name, "🔇 Timeout", f"{reason} ({minutes}m)")
    return {"ok": True, "caseId": case_id, "dmSent": dm_sent}


async def remove_timeout(bot, db, guild_id: int, target_id: int, reason: str,
                         actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "removetimeout")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    problem = _guard_target(guild, member, actor_id)
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
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused — I need **Timeout Members**.",
                     permission="Timeout Members")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Remove timeout failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id),
                            "removetimeout", reason, source=source)
    return {"ok": True, "caseId": case_id}


async def kick_member(bot, db, guild_id: int, target_id: int, reason: str,
                      actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "kick")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    problem = _guard_target(guild, member, actor_id)
    if problem:
        return problem
    reason = (reason or "No reason given").strip()[:300]
    try:
        await member.kick(reason=reason[:200])
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused the kick — I need **Kick Members**.",
                     permission="Kick Members")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Kick failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id), "kick", reason, source=source)
    dm_sent = await _dm(member, guild.name, "👢 Kick", reason)
    return {"ok": True, "caseId": case_id, "dmSent": dm_sent}


async def ban_member(bot, db, guild_id: int, target_id: int, reason: str,
                     delete_days: int = 0, actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "ban")
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
    reason = (reason or "No reason given").strip()[:300]
    delete_days = max(0, min(int(delete_days or 0), 7))
    try:
        await guild.ban(discord.Object(id=int(target_id)), reason=reason[:150],
                        delete_message_days=delete_days)
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused the ban — I need **Ban Members**.",
                     permission="Ban Members")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Ban failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id), "ban", reason,
                            f"delete {delete_days}d" if delete_days else "", source=source)
    dm_sent = await _dm(member, guild.name, "🔨 Ban", reason) if member else False
    return {"ok": True, "caseId": case_id, "dmSent": dm_sent}


async def unban_member(bot, db, guild_id: int, target_id: int, reason: str,
                       actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "unban")
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
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused the unban — I need **Ban Members**.",
                     permission="Ban Members")
    except discord.HTTPException as exc:
        return _fail("DISCORD_API_ERROR", f"Discord API error {exc.status}.")
    except Exception as exc:
        return _fail("DISCORD_API_ERROR", f"Unban failed ({type(exc).__name__}).")
    case_id = await _record(db, int(guild_id), int(target_id), int(actor_id), "unban", reason, source=source)
    return {"ok": True, "caseId": case_id}


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


async def mute_member(bot, db, guild_id: int, target_id: int, reason: str,
                      duration_minutes: int | None = None,
                      actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "mute")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    problem = _guard_target(guild, member, actor_id)
    if problem:
        return problem
    problem, role = await _mute_role(guild, db, int(guild_id))
    if problem:
        return problem
    reason = (reason or "No reason given").strip()[:300]
    try:
        await member.add_roles(role, reason=reason[:150])
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused — I need **Manage Roles**.",
                     permission="Manage Roles")
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


async def hardmute_member(bot, db, guild_id: int, target_id: int, reason: str,
                          duration_minutes: int | None = None,
                          actor_id: int = 0, source: str = "dashboard") -> dict:
    """Mute + strip all other roles (saved for restoration)."""
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "hardmute")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    problem = _guard_target(guild, member, actor_id)
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
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused — I need **Manage Roles**.",
                     permission="Manage Roles")
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


async def unmute_member(bot, db, guild_id: int, target_id: int, reason: str,
                        actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "unmute")
    if problem:
        return problem
    member = guild.get_member(int(target_id))
    if member is None:
        return _fail("TARGET_NOT_FOUND", "That member is not on this server.")
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
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused — I need **Manage Roles**.",
                     permission="Manage Roles")
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


async def remove_warning(db, guild_id: int, target_id: int, index: int) -> dict:
    try:
        ok = await db.remove_warning(int(guild_id), int(target_id), int(index))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Warning could not be removed ({type(exc).__name__}).")
    if not ok:
        return _fail("TARGET_NOT_FOUND", f"Warning #{index} does not exist.")
    return {"ok": True, "removed": int(index)}


async def clear_warnings(db, guild_id: int, target_id: int) -> dict:
    try:
        cleared = await db.clear_warnings(int(guild_id), int(target_id))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Warnings could not be cleared ({type(exc).__name__}).")
    return {"ok": True, "cleared": bool(cleared)}


# ── User notes (Manage Server, DB-only — no Discord permission needed) ─
async def set_note(db, guild_id: int, target_id: int, text: str, actor_id: int = 0) -> dict:
    text = (text or "").strip()[:1000]
    if not text:
        return _fail("INVALID_INPUT", "Note text is required.")
    try:
        note_id = await db.add_user_note(int(guild_id), int(target_id), int(actor_id), text)
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Note could not be saved ({type(exc).__name__}).")
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


async def remove_note(db, guild_id: int, note_id: int) -> dict:
    try:
        ok = await db.remove_user_note(int(guild_id), int(note_id))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Note could not be removed ({type(exc).__name__}).")
    if not ok:
        return _fail("TARGET_NOT_FOUND", f"Note #{note_id} does not exist in this server.")
    return {"ok": True, "removed": int(note_id)}


async def clear_notes(db, guild_id: int, target_id: int) -> dict:
    try:
        count = await db.clear_user_notes(int(guild_id), int(target_id))
    except Exception as exc:
        return _fail("DATABASE_ERROR", f"Notes could not be cleared ({type(exc).__name__}).")
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


async def lockdown_channel(bot, db, guild_id: int, channel_id: int, reason: str,
                           duration_minutes: int | None = None,
                           actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "lockdown")
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
        if not channel.permissions_for(guild.me).manage_channels:
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
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused — I need **Manage Channels** there.",
                     permission="Manage Channels")
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


async def unlock_channel(bot, db, guild_id: int, channel_id: int, reason: str,
                         actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "lockdown")
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
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused — I need **Manage Channels** there.",
                     permission="Manage Channels")
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


async def lockdown_server(bot, db, guild_id: int, reason: str,
                          duration_minutes: int | None = None,
                          actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "lockdown")
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


async def unlock_server(bot, db, guild_id: int, reason: str,
                        actor_id: int = 0, source: str = "dashboard") -> dict:
    """Restore ONLY channels this service locked (saved state) — never
    unrelated administrator overwrites."""
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "lockdown")
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


async def purge_messages(bot, db, guild_id: int, channel_id: int, kind: str, count: int,
                         user_id: int | None = None, text: str = "",
                         include_pinned: bool = False,
                         actor_id: int = 0, source: str = "dashboard") -> dict:
    guild = _guild(bot, guild_id)
    problem = _guard_bot(guild, "purge")
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
    except discord.Forbidden:
        return _fail("BOT_MISSING_PERMISSION", "Discord refused history access.",
                     permission="Read History")
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
async def run_due(bot, db) -> dict:
    """Execute due scheduled rows: unban / unmute (+role restore) /
    unlock_channel / unlock_server. Runs every minute from the bot loop."""
    try:
        rows = await db.due_scheduled_actions()
    except Exception as exc:
        return {"ok": False, "code": "DATABASE_ERROR", "error": type(exc).__name__}
    done = 0
    for row in rows:
        gid = row.get("guildId")
        action = row.get("action")
        uid = row.get("userId")
        payload = row.get("payload") or {}
        try:
            if action == "unban":
                res = await unban_member(bot, db, int(gid), int(uid),
                                         f"Temporary ban expired", 0, "system")
            elif action in ("unmute", "restore_roles"):
                res = await unmute_member(bot, db, int(gid), int(uid),
                                          "Mute expired", 0, "system")
            elif action == "unlock_channel":
                res = await unlock_channel(bot, db, int(gid), int(payload.get("channelId") or 0),
                                           "Scheduled unlock", 0, "system")
            elif action == "unlock_server":
                res = await unlock_server(bot, db, int(gid), "Scheduled unlock", 0, "system")
            else:
                res = {"ok": False, "error": f"unknown scheduled action {action}"}
            await db.complete_scheduled_action(
                row["_id"], "ok" if res.get("ok") else str(res.get("error", "failed"))[:200])
            if res.get("ok"):
                done += 1
        except Exception as exc:
            try:
                await db.complete_scheduled_action(row["_id"], f"exception {type(exc).__name__}")
            except Exception:
                pass
    return {"ok": True, "processed": done, "due": len(rows)}
