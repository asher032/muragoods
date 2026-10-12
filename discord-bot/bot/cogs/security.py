"""Security: anti-raid, anti-nuke, verification and reversible protection.

What changed in this phase, and why
-----------------------------------
The previous cog detected a join spike and then did three things wrong: it kept
the protection state in process memory (so a restart during a raid ended the
raid), it announced to ``guild.text_channels[0]`` (whatever channel happened to
be first, not the one the operator picked), and it referenced two helpers that
did not exist (``_raise_raid_alert``, ``_on_channel_overwrite_change``), so
mass-delete and overwrite-based nuke detection raised AttributeError into the
event dispatcher and were effectively dead. `/security lockdown` also had its
own implementation that did not save the previous overwrite, which is why its
`/security unlock` could not put anything back.

The rules now:
* protection state is STORED (``security_state``) and its expiry is a scheduled
  row, so a restart resumes the raid and the window always ends;
* alerts go to the configured moderation channel, then the moderation log
  channel, and only then fall back to a channel the bot can write to — and the
  message says which of those it used;
* every automatic action is BOUNDED and REVERSIBLE (a timeout, a verification
  level, a lockdown this service applied), recorded in the audit trail with
  ``reversible: true``, and listed by ``/security review`` for an administrator
  to accept or undo. An unverified heuristic never bans or deletes anything;
* dismissal/verification uses a real Discord interaction (a persistent button),
  and the role it grants is refused if it carries dangerous permissions unless
  the guild explicitly opted in;
* missing permissions or intents are REPORTED (commands and dashboard), never
  papered over as "enabled".
"""

from __future__ import annotations

import logging
import time
from datetime import timedelta

import discord
from discord import app_commands
from discord.ext import commands

import database
import modservice
import utils

log = logging.getLogger("bot.security")

# ── Configurable security settings (stored in guild_config.securitySettings) ─
# Every threshold and window is configurable per server. The defaults are the
# ones this server already used, so an unconfigured guild keeps its posture.
DEFAULTS: dict = {
    "antiRaidEnabled": True,
    "joinSpikeThreshold": 8,
    "joinWindowSeconds": 20,
    "minAccountAgeHours": 24,
    "raidAction": "timeout",          # timeout | kick | ban | none
    "raidTimeoutMinutes": 30,
    "raidModeMinutes": 10,
    "antiNukeEnabled": True,
    "deleteSpikeThreshold": 6,
    "deleteWindowSeconds": 30,
    # Individual anti-abuse gates. They exist as separate switches because they
    # watch different events, and because the dashboard already advertises them
    # — a toggle that is offered and then silently dropped on save is the same
    # class of lie as a rule that never runs.
    "antiChannelDeletionEnabled": True,
    "antiRoleDeletionEnabled": True,
    "antiMassBanEnabled": True,
    "antiMassKickEnabled": True,
    "antiBotEnabled": True,
    "antiWebhookEnabled": True,
    "suspiciousAccountDetectionEnabled": True,
    "memberActionSpikeThreshold": 5,
    "botJoinAction": "alert",
    "alertChannelId": "",
    "verificationEnabled": False,
    "verificationRoleId": "",
    "verificationChannelId": "",
    # Persistent roles (spec §6): restore a returning member's saved roles.
    # `restoreDangerousRoles` is the explicit opt-in required before anything
    # with a security permission is handed back automatically.
    "restoreRolesOnRejoin": True,
    "restoreDangerousRoles": False,
}

#: Bounds mirror the dashboard's own clamps (app/lib/moderation-schema.ts). The
#: node contract test asserts the two lists agree, so the dashboard can never
#: advertise a value the bot silently rewrites.
LIMITS: dict[str, tuple[int, int]] = {
    "joinSpikeThreshold": (3, 100),
    "joinWindowSeconds": (5, 600),
    "minAccountAgeHours": (0, 168),
    "raidTimeoutMinutes": (1, 40320),
    "raidModeMinutes": (1, 1440),
    "deleteSpikeThreshold": (3, 100),
    "deleteWindowSeconds": (5, 600),
}

RAID_ACTIONS = ("none", "timeout", "kick", "ban")

#: Dedupe window for join events. Discord re-delivers GUILD_MEMBER_ADD after a
#: resume, and the gateway dispatcher in main.py can hand the same event to
#: more than one handler; counting a join twice is how a small server gets
#: flagged as a raid.
JOIN_DEDUPE_SECONDS = 5.0


def _clamp(key: str, value, default: int) -> int:
    low, high = LIMITS[key]
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        return default
    return max(low, min(number, high))


class VerifyView(discord.ui.View):
    """The verification button. Persistent: it still works after a restart.

    Registered through ``bot.add_view`` in ``cog_load``, which is what makes a
    button sent weeks ago continue to function — the alternative (an ephemeral
    view created per message) dies the moment the bot restarts.
    """

    def __init__(self, cog: "SecurityCog") -> None:
        super().__init__(timeout=None)
        self.cog = cog

    @discord.ui.button(label="✅ Verify me", style=discord.ButtonStyle.success,
                       custom_id="murabot:security:verify")
    async def verify(self, interaction: discord.Interaction, _button: discord.ui.Button):
        await self.cog.handle_verify(interaction)


class SecurityCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        # In-process windows for the *detection* signals only. The resulting
        # protection STATE lives in the database; these lists are rebuilt from
        # the live gateway stream and starting empty is correct.
        self._joins: dict[int, list[float]] = {}
        self._join_seen: dict[tuple[int, int], float] = {}
        # Generic spike windows, keyed by (guild, signal) — channel deletes,
        # role deletes, bans and kicks each get their own counter so a burst of
        # one signal can never be triggered by another.
        self._spikes: dict[tuple[int, str], list[float]] = {}
        self._settings_cache: dict[int, tuple[float, dict]] = {}

    async def cog_load(self) -> None:
        try:
            self.bot.add_view(VerifyView(self))
        except Exception as exc:
            log.warning("Verification view could not be registered: %s", type(exc).__name__)

    # ── Settings ──────────────────────────────────────────────────────
    async def _settings(self, guild_id: int) -> dict:
        """Stored security settings with a short cache (60s).

        The alert channel falls back to the moderation log channel and the
        fallback is reported, so \"where did the raid alert go?\" always has an
        answer in the settings read-back.
        """
        hit = self._settings_cache.get(guild_id)
        now = time.monotonic()
        if hit and now - hit[0] < 60:
            return hit[1]
        settings = dict(DEFAULTS)
        settings["alertFallback"] = ""
        try:
            cfg = await database.get_guild_config(guild_id)
            stored = cfg.get("securitySettings") or {}
            for key, default in DEFAULTS.items():
                if key in stored:
                    settings[key] = stored[key]
            settings["moderationLogChannelId"] = str(
                (cfg.get("moderation") or {}).get("logChannelId") or "")
        except Exception:
            log.warning("Could not read securitySettings for %s — using defaults", guild_id)
            settings["moderationLogChannelId"] = ""
        for key in LIMITS:
            settings[key] = _clamp(key, settings.get(key), DEFAULTS[key])
        if str(settings.get("raidAction")) not in RAID_ACTIONS:
            settings["raidAction"] = DEFAULTS["raidAction"]
        if not settings.get("alertChannelId") and settings.get("moderationLogChannelId"):
            settings["alertChannelId"] = settings["moderationLogChannelId"]
            settings["alertFallback"] = "moderation-log-channel"
        self._settings_cache[guild_id] = (now, settings)
        return settings

    async def _alert_channel(self, guild: discord.Guild, settings: dict):
        """The channel a security alert goes to. Returns (channel, how).

        Configured channel → moderation log channel → the first channel the bot
        can actually write to. The third case is a real fallback, not a guess:
        an operator who has configured nothing still needs to hear about a raid.
        """
        for channel_id, how in ((settings.get("alertChannelId"), "configured"),
                                (settings.get("moderationLogChannelId"), "moderation-log-channel")):
            if not channel_id:
                continue
            channel = guild.get_channel(int(channel_id)) if str(channel_id).isdigit() else None
            if isinstance(channel, discord.TextChannel):
                try:
                    if channel.permissions_for(guild.me).send_messages:
                        return channel, how
                except Exception:
                    continue
        for channel in guild.text_channels:
            try:
                if channel.permissions_for(guild.me).send_messages:
                    return channel, "first-writable-channel (nothing configured)"
            except Exception:
                continue
        return None, "no-writable-channel"

    async def raise_alert(self, guild: discord.Guild, title: str, body: str,
                          settings: dict | None = None) -> str:
        """Post a security alert. Returns where it went (for the audit record).

        Was ``_raise_raid_alert`` — called by three handlers, defined nowhere.
        """
        settings = settings or await self._settings(guild.id)
        channel, how = await self._alert_channel(guild, settings)
        if channel is None:
            log.warning("Security alert in %s could not be delivered: no writable channel", guild.id)
            return "undelivered:no-writable-channel"
        try:
            await channel.send(embed=utils.base_embed(title, body))
            return f"{channel.id} ({how})"
        except discord.HTTPException as exc:
            log.warning("Security alert failed in %s (%s)", guild.id, getattr(exc, "status", "?"))
            return "undelivered:discord-refused"

    # ── Capability report (permissions + intents) ─────────────────────
    async def capabilities(self, guild: discord.Guild) -> dict:
        """What security can actually DO here — measured against live state.

        This is the honest half of \"is anti-raid on?\". A rule whose permission
        is missing is reported as not operational, with the exact permission
        name, instead of appearing armed and doing nothing.
        """
        me = getattr(guild, "me", None)
        perms = getattr(me, "guild_permissions", None)
        state = {}
        try:
            state = await database.get_security_state(guild.id)
        except Exception:
            state = {}

        def has(attr: str) -> bool:
            try:
                return bool(getattr(perms, attr, False))
            except Exception:
                return False

        intents = getattr(self.bot, "intents", None)
        checks = {
            "readAuditLog": has("view_audit_log"),
            "manageMembers": has("moderate_members"),
            "manageRoles": has("manage_roles"),
            "manageChannels": has("manage_channels"),
            "manageGuild": has("manage_guild"),
            "kickMembers": has("kick_members"),
            "banMembers": has("ban_members"),
        }
        problems: list[str] = []
        if not checks["manageMembers"]:
            problems.append("Missing **Timeout Members** — raid-mode account screening cannot time out.")
        if not checks["manageRoles"]:
            problems.append("Missing **Manage Roles** — verification roles and role restores cannot be granted.")
        if not checks["manageGuild"]:
            problems.append("Missing **Manage Guild** — anti-nuke cannot raise the verification level.")
        if not checks["readAuditLog"]:
            problems.append("Missing **View Audit Log** — anti-nuke cannot tell who deleted a channel, only that it happened.")
        if not bool(getattr(intents, "members", False)):
            problems.append("Missing **Server Members** intent — join events (and therefore raid detection) are not delivered.")
        return {
            "permissions": checks,
            "membersIntent": bool(getattr(intents, "members", False)),
            "messageContentIntent": bool(getattr(intents, "message_content", False)),
            "problems": problems,
            "operational": not problems,
            "raidMode": bool(state.get("raidMode")),
            "raidModeUntil": (state.get("raidModeUntil").isoformat()
                              if state.get("raidModeUntil") is not None else None),
            "verificationEnabled": bool(state.get("verificationEnabled")),
            "verificationRoleId": str(state.get("verificationRoleId") or ""),
            "pendingReview": int(state.get("pendingReview") or 0),
        }

    # ── Anti-raid ─────────────────────────────────────────────────────
    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        """Count join spikes, engage protection, screen brand-new accounts."""
        guild = member.guild
        settings = await self._settings(guild.id)
        now = time.monotonic()

        # Persistent roles: hand back what this member had, subject to today's
        # permissions and role hierarchy (modservice decides, and audits every
        # refusal). Done before screening so a returning member's roles are not
        # lost if the screening path also acts on them.
        if settings.get("restoreRolesOnRejoin", True):
            try:
                restored = await modservice.restore_member_roles(self.bot, database, guild, member)
                if restored.get("restored"):
                    log.info("Restored %s role(s) for %s in %s", restored["restored"],
                             member.id, guild.id)
            except Exception as exc:
                log.warning("Role restore failed for %s in %s: %s", member.id, guild.id,
                            type(exc).__name__)

        # Duplicate gateway delivery must not inflate the spike count.
        stamp = self._join_seen.get((guild.id, member.id))
        if stamp is not None and now - stamp <= JOIN_DEDUPE_SECONDS:
            return
        self._join_seen[(guild.id, member.id)] = now
        if len(self._join_seen) > 5000:
            cutoff = now - JOIN_DEDUPE_SECONDS
            self._join_seen = {k: v for k, v in self._join_seen.items() if v > cutoff}

        window = _clamp("joinWindowSeconds", settings.get("joinWindowSeconds"), DEFAULTS["joinWindowSeconds"])
        threshold = _clamp("joinSpikeThreshold", settings.get("joinSpikeThreshold"), DEFAULTS["joinSpikeThreshold"])
        recent = [t for t in self._joins.get(guild.id, []) if now - t <= window]
        recent.append(now)
        self._joins[guild.id] = recent

        active = await modservice.raid_mode_active(self.bot, database, guild.id)
        if settings.get("antiRaidEnabled", True) and len(recent) >= threshold and not active.get("active"):
            minutes = _clamp("raidModeMinutes", settings.get("raidModeMinutes"), DEFAULTS["raidModeMinutes"])
            res = await modservice.begin_raid_mode(
                self.bot, database, guild.id,
                minutes=minutes,
                reason=f"{len(recent)} joins in {window}s",
                automatic=True, source="anti-raid")
            where = await self.raise_alert(
                guild, "🚨 RAID PROTECTION ON",
                f"**{len(recent)} joins in {window}s** (threshold {threshold}).\n"
                f"Protection ends automatically in {minutes} minutes.\n"
                f"Automatic action on new accounts: **{settings.get('raidAction')}**.\n"
                "Review or undo it with `/security review`.",
                settings)
            try:
                await database.bump_pending_review(guild.id, 1)
            except Exception:
                pass
            await database.log_mod_audit(
                guild.id, "raid_trigger", moderator_id=0, target_id=member.id,
                source="anti-raid", success=bool(res.get("ok")),
                reason=f"join spike: {len(recent)}/{window}s",
                detail=where, reversible=True,
                meta={"alert": where, "minutes": str(minutes)})

        # Account-age screening while protection is active. Re-read (not
        # remembered) because the spike check above may have just armed it.
        state_active = ({"active": True} if len(recent) >= threshold
                        and settings.get("antiRaidEnabled", True)
                        else await modservice.raid_mode_active(self.bot, database, guild.id))
        if not state_active.get("active"):
            return
        action = str(settings.get("raidAction") or "timeout")
        if action == "none":
            return
        if not settings.get("suspiciousAccountDetectionEnabled", True):
            return
        min_age = _clamp("minAccountAgeHours", settings.get("minAccountAgeHours"),
                         DEFAULTS["minAccountAgeHours"])
        age = discord.utils.utcnow() - member.created_at
        if age >= timedelta(hours=min_age):
            return
        reason = f"Raid protection: account is {int(age.total_seconds() // 60)}m old (< {min_age}h)"
        if action == "timeout":
            minutes = _clamp("raidTimeoutMinutes", settings.get("raidTimeoutMinutes"),
                             DEFAULTS["raidTimeoutMinutes"])
            res = await modservice.timeout_member(self.bot, database, guild.id, member.id,
                                                 minutes, reason, 0, "anti-raid")
        elif action == "kick":
            res = await modservice.kick_member(self.bot, database, guild.id, member.id,
                                               reason, 0, "anti-raid")
        else:
            res = await modservice.ban_member(self.bot, database, guild.id, member.id,
                                              reason, 0, 0, "anti-raid")
        try:
            await database.bump_pending_review(guild.id, 1)
        except Exception:
            pass
        if not res.get("ok"):
            # Loud on purpose: a refusal is the difference between "protected"
            # and "we tried and Discord said no".
            await self.raise_alert(
                guild, "⚠️ Raid screening could not act",
                f"{member.mention} (`{member.id}`) matched the new-account rule but "
                f"**{action}** was refused:\n`{res.get('code')}` {res.get('error')}",
                settings)

    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member):
        """Leaving member: remember restorable roles (spec §6), and count kicks.

        One handler, two duties — they were briefly two methods with the same
        name, which Python silently collapses into the last one, so the role
        snapshot would have vanished.
        """
        try:
            await modservice.snapshot_member_roles(self.bot, database, member.guild, member)
        except Exception as exc:
            log.warning("Role snapshot failed for %s: %s", member.guild.id, type(exc).__name__)
        settings = await self._settings(member.guild.id)
        if not settings.get("antiMassKickEnabled", True):
            return
        actor = await self._audit_actor(member.guild, discord.AuditLogAction.kick)
        if actor is None:
            return  # a voluntary leave, not a kick
        if self.bot.user is not None and getattr(actor, "id", 0) == self.bot.user.id:
            return  # our own moderation
        window = _clamp("deleteWindowSeconds", settings.get("deleteWindowSeconds"),
                        DEFAULTS["deleteWindowSeconds"])
        threshold = int(settings.get("memberActionSpikeThreshold") or 5)
        self._prune_spikes()
        count = self._note_spike(member.guild.id, "kick", 1, window)
        if count < threshold:
            return
        await self._nuke_response(
            member.guild, "⚠️ Mass kick detected",
            f"**{count} kicks in {window}s** (threshold {threshold}).\n"
            f"Likely actor per Discord's audit log: {actor.mention} (`{actor.id}`).",
            settings, actor_id=getattr(actor, "id", 0) or 0)

    # ── Anti-nuke ─────────────────────────────────────────────────────
    def _note_spike(self, guild_id: int, signal: str, count: int, window: int) -> int:
        """Count one signal inside its window and return the running total."""
        now = time.monotonic()
        key = (guild_id, signal)
        recent = [t for t in self._spikes.get(key, []) if now - t <= window]
        recent.extend([now] * max(1, count))
        self._spikes[key] = recent
        return len(recent)

    def _prune_spikes(self) -> None:
        """Keep the window map bounded on a long-running process."""
        if len(self._spikes) <= 500:
            return
        now = time.monotonic()
        limit = max(DEFAULTS["deleteWindowSeconds"], 60)
        self._spikes = {k: v for k, v in self._spikes.items()
                        if v and now - v[-1] <= limit}

    async def _nuke_response(self, guild: discord.Guild, title: str, detail: str,
                             settings: dict, *, actor_id: int = 0) -> None:
        """Bounded, reversible response to a destructive spike.

        Raising the verification level is the least destructive effective
        measure available: it costs nobody their membership, is undone in one
        API call, and is recorded as reversible with the previous level stored
        so ``/security undo`` can restore it exactly.
        """
        previous = str(getattr(guild, "verification_level", "unknown"))
        raised = False
        try:
            await guild.edit(verification_level=discord.VerificationLevel.high,
                             reason=f"Murabot anti-nuke: {title}"[:100])
            raised = True
        except discord.Forbidden:
            detail += "\n⚠️ Could not raise the verification level (Manage Guild missing)."
        except discord.HTTPException as exc:
            detail += f"\n⚠️ Discord refused the verification-level change ({exc.status})."
        where = await self.raise_alert(guild, f"🛑 {title}", detail, settings)
        try:
            await database.log_mod_audit(
                guild.id, "anti_nuke", moderator_id=0, target_id=actor_id or 0,
                source="anti-raid", success=raised,
                reason=title, detail=f"{detail} | alert: {where}",
                reversible=raised, meta={"previousVerificationLevel": previous,
                                         "alert": where})
            await database.bump_pending_review(guild.id, 1)
        except Exception:
            pass

    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel: discord.abc.GuildChannel):
        guild = channel.guild
        settings = await self._settings(guild.id)
        if not settings.get("antiNukeEnabled", True):
            return
        if not settings.get("antiChannelDeletionEnabled", True):
            return
        window = _clamp("deleteWindowSeconds", settings.get("deleteWindowSeconds"),
                        DEFAULTS["deleteWindowSeconds"])
        threshold = _clamp("deleteSpikeThreshold", settings.get("deleteSpikeThreshold"),
                           DEFAULTS["deleteSpikeThreshold"])
        self._prune_spikes()
        count = self._note_spike(guild.id, "channel_delete", 1, window)
        if count < threshold:
            return
        actor = await self._audit_actor(guild, discord.AuditLogAction.channel_delete)
        if actor is not None and self.bot.user is not None and actor.id == self.bot.user.id:
            return  # our own cleanup
        who = f"{actor.mention} (`{actor.id}`)" if actor else "unknown (audit log unavailable)"
        await self._nuke_response(
            guild, "ANTI-NUKE: mass channel deletion",
            f"**{count} channels deleted in {window}s** (threshold {threshold}).\n"
            f"Likely actor per Discord's audit log: {who}.\n"
            "The verification level was raised; review with `/security review`.",
            settings, actor_id=getattr(actor, "id", 0) or 0)

    @commands.Cog.listener()
    async def on_guild_channel_update(self, before: discord.abc.GuildChannel,
                                      after: discord.abc.GuildChannel):
        """Overwrite changes — the quiet way to open a server up."""
        if getattr(before, "permission_overwrites", None) == getattr(after, "permission_overwrites", None):
            return
        await self._on_channel_overwrite_change(after)

    async def _on_channel_overwrite_change(self, channel) -> None:
        """Flag @everyone gains on a channel, throttled per guild."""
        guild = channel.guild
        settings = await self._settings(guild.id)
        if not settings.get("antiNukeEnabled", True):
            return
        try:
            overwrite = channel.overwrites_for(guild.default_role)
            gained = [name for name, value in (
                ("manage_channels", overwrite.manage_channels),
                ("manage_roles", overwrite.manage_roles),
                ("mention_everyone", overwrite.mention_everyone),
                ("ban_members", overwrite.ban_members),
                ("administrator", overwrite.administrator),
            ) if value is True]
        except Exception:
            return
        if not gained:
            return
        window = _clamp("deleteWindowSeconds", settings.get("deleteWindowSeconds"),
                        DEFAULTS["deleteWindowSeconds"])
        self._prune_spikes()
        count = self._note_spike(guild.id, "overwrite_change", 1, window)
        threshold = _clamp("deleteSpikeThreshold", settings.get("deleteSpikeThreshold"),
                           DEFAULTS["deleteSpikeThreshold"])
        try:
            actor = await self._audit_actor(guild, discord.AuditLogAction.channel_update)
        except Exception:
            actor = None
        detail = (f"**{channel.mention}** now grants @everyone: {', '.join(gained)}.\n"
                  f"Likely actor per Discord's audit log: "
                  f"{f'{actor.mention} (`{actor.id}`)' if actor else 'unknown'}.")
        # A single dangerous grant is reported; a cluster raises protection.
        # Reporting-only would be noise, raising on one grant would be a
        # false-positive machine — the threshold is what distinguishes them.
        if count >= threshold:
            await self._nuke_response(guild, "ANTI-NUKE: mass permission changes",
                                      detail + f"\n**{count} destructive changes in {window}s.**",
                                      settings, actor_id=getattr(actor, "id", 0) or 0)
        else:
            where = await self.raise_alert(guild, "⚠️ Channel permissions opened up", detail, settings)
            await database.log_mod_audit(
                guild.id, "permission_watch", moderator_id=0,
                target_id=getattr(channel, "id", 0), source="anti-raid", success=True,
                reason=f"@everyone gained {', '.join(gained)}",
                detail=f"alert: {where}", reversible=False)

    @commands.Cog.listener()
    async def on_guild_role_delete(self, role: discord.Role):
        """Role deletions in a burst are the other half of a nuke."""
        guild = role.guild
        settings = await self._settings(guild.id)
        if not settings.get("antiNukeEnabled", True) or not settings.get("antiRoleDeletionEnabled", True):
            return
        window = _clamp("deleteWindowSeconds", settings.get("deleteWindowSeconds"),
                        DEFAULTS["deleteWindowSeconds"])
        threshold = _clamp("deleteSpikeThreshold", settings.get("deleteSpikeThreshold"),
                           DEFAULTS["deleteSpikeThreshold"])
        self._prune_spikes()
        count = self._note_spike(guild.id, "role_delete", 1, window)
        if count < threshold:
            return
        actor = await self._audit_actor(guild, discord.AuditLogAction.role_delete)
        await self._nuke_response(
            guild, "ANTI-NUKE: mass role deletion",
            f"**{count} roles deleted in {window}s** (threshold {threshold}).\n"
            f"Likely actor per Discord's audit log: "
            f"{f'{actor.mention} (`{actor.id}`)' if actor else 'unknown'}.",
            settings, actor_id=getattr(actor, "id", 0) or 0)

    @commands.Cog.listener()
    async def on_member_ban(self, guild: discord.Guild, user: discord.User):
        """Mass bans are a nuke signal — counted, and attributed via the audit log."""
        settings = await self._settings(guild.id)
        if not settings.get("antiMassBanEnabled", True):
            return
        window = _clamp("deleteWindowSeconds", settings.get("deleteWindowSeconds"),
                        DEFAULTS["deleteWindowSeconds"])
        threshold = int(settings.get("memberActionSpikeThreshold") or 5)
        self._prune_spikes()
        count = self._note_spike(guild.id, "ban", 1, window)
        if count < threshold:
            return
        actor = await self._audit_actor(guild, discord.AuditLogAction.ban)
        if actor is not None and self.bot.user is not None and actor.id == self.bot.user.id:
            return  # our own moderation
        await self._nuke_response(
            guild, "⚠️ Mass ban detected",
            f"**{count} bans in {window}s** (threshold {threshold}).\n"
            f"Likely actor per Discord's audit log: "
            f"{f'{actor.mention} (`{actor.id}`)' if actor else 'unknown'}.",
            settings, actor_id=getattr(actor, "id", 0) or 0)

    @commands.Cog.listener()
    async def on_audit_log_entry_create(self, entry: discord.AuditLogEntry):
        """Bots added and webhooks created — reported, never destroyed.

        Discord raises no gateway event for either, so the audit log is the only
        signal. Both are reported for review rather than reversed
        automatically: a legitimate integration looking identical to a malicious
        one is exactly the case where a heuristic must not act alone.
        """
        try:
            guild = entry.guild
        except Exception:
            return
        settings = await self._settings(guild.id)
        action = entry.action
        actor = getattr(entry, "user", None)
        who = f"{actor.mention} (`{actor.id}`)" if actor else "unknown"
        if action is discord.AuditLogAction.bot_add and settings.get("antiBotEnabled", True):
            target = getattr(entry, "target", None)
            # Default is "alert". "kick" only ever happens when an operator
            # explicitly configured it: an unapproved bot is usually harmless
            # and sometimes a legitimate integration arriving late.
            mode = str(settings.get("botJoinAction") or "alert").lower()
            kicked = False
            if mode == "kick" and hasattr(target, "kick"):
                try:
                    await target.kick(reason="Anti-bot policy: unapproved bot invite")
                    kicked = True
                except Exception:
                    kicked = False
            await self.raise_alert(
                guild, "🤖 Bot added to the server",
                f"{who} added **{getattr(target, 'display_name', getattr(target, 'name', '?'))}**."
                + ("\n**It was kicked per this server's anti-bot policy.**" if kicked
                   else "\nIf you did not expect this, remove it and rotate any tokens it can reach."),
                settings)
            await database.log_mod_audit(guild.id, "bot_add_alert", moderator_id=0,
                                         target_id=getattr(target, "id", 0) or 0,
                                         source="anti-raid", success=True,
                                         reason="bot invited",
                                         detail=f"by {who}" + (" | kicked" if kicked else ""),
                                         reversible=False, meta={"kicked": str(kicked)})
        elif action in (discord.AuditLogAction.webhook_create,
                        discord.AuditLogAction.webhook_update) and settings.get("antiWebhookEnabled", True):
            target = getattr(entry, "target", None)
            await self.raise_alert(
                guild, "🪝 Webhook created or changed",
                f"{who} → **{getattr(target, 'name', 'webhook')}** "
                f"(channel <#{getattr(target, 'channel_id', 0)}>).\n"
                "Webhooks can post as anyone — review it.",
                settings)
            await database.log_mod_audit(guild.id, "webhook_alert", moderator_id=0,
                                         target_id=getattr(target, "id", 0) or 0,
                                         source="anti-raid", success=True,
                                         reason="webhook created/changed", detail=f"by {who}",
                                         reversible=False)

    @commands.Cog.listener()
    async def on_member_update(self, before: discord.Member, after: discord.Member):
        """Watch for role changes that grant power during a raid."""
        if before.roles == after.roles:
            return
        guild = after.guild
        settings = await self._settings(guild.id)
        if not settings.get("antiNukeEnabled", True):
            return
        added = [r for r in after.roles if r not in before.roles]
        dangerous = []
        for role in added:
            perms = getattr(role, "permissions", None)
            if perms is not None and bool(getattr(perms, "administrator", False)):
                dangerous.append(role.name)
        if not dangerous:
            return
        await self.raise_alert(
            guild, "⚠️ Administrator role granted",
            f"{after.mention} (`{after.id}`) received **@{', @'.join(dangerous)}** "
            f"(Administrator). Recorded for review — no action was taken automatically.",
            settings)
        await database.log_mod_audit(
            guild.id, "role_grant_watch", moderator_id=0, target_id=after.id,
            source="anti-raid", success=True,
            reason=f"Administrator granted: {', '.join(dangerous)}", reversible=False)

    async def _audit_actor(self, guild: discord.Guild, action: discord.AuditLogAction):
        try:
            entries = [e async for e in guild.audit_logs(limit=5, action=action)]
            return getattr(entries[0], "user", None) if entries else None
        except discord.Forbidden:
            return None
        except Exception:
            return None

    # ── Verification ──────────────────────────────────────────────────
    async def handle_verify(self, interaction: discord.Interaction) -> None:
        """Grant the configured verification role from a button press."""
        guild = interaction.guild
        if guild is None:
            await interaction.response.send_message("Verification only works in a server.", ephemeral=True)
            return
        state = await database.get_security_state(guild.id)
        role_id = str(state.get("verificationRoleId") or "")
        if not state.get("verificationEnabled") or not role_id:
            await interaction.response.send_message(
                "Verification is not configured on this server.", ephemeral=True)
            return
        role = guild.get_role(int(role_id)) if role_id.isdigit() else None
        if role is None:
            await interaction.response.send_message(
                "The verification role no longer exists — ask an administrator to run `/security setup`.",
                ephemeral=True)
            return
        member = interaction.user if isinstance(interaction.user, discord.Member) else None
        if member is None:
            await interaction.response.send_message("Could not resolve your member record.", ephemeral=True)
            return
        if role in member.roles:
            await interaction.response.send_message("You are already verified ✅", ephemeral=True)
            return
        try:
            if role >= guild.me.top_role:
                await interaction.response.send_message(
                    "I can't assign that role — it is at or above my highest role. "
                    "Ask an administrator to move my role higher.", ephemeral=True)
                return
        except TypeError:
            await interaction.response.send_message("Role hierarchy could not be evaluated.", ephemeral=True)
            return
        try:
            await member.add_roles(role, reason="Verification button")
        except discord.Forbidden as exc:
            await interaction.response.send_message(
                modservice.describe_forbidden(exc, "Manage Roles", "the verification role"), ephemeral=True)
            return
        except discord.HTTPException as exc:
            await interaction.response.send_message(
                f"Discord refused the role change ({exc.status}) — try again in a moment.", ephemeral=True)
            return
        await database.log_mod_audit(
            guild.id, "verify", moderator_id=0, target_id=member.id, source="verification",
            success=True, reason=f"verification role @{role.name} granted", reversible=True,
            meta={"roleId": str(role.id)})
        await interaction.response.send_message(
            f"✅ Verified — you now have **@{role.name}**.", ephemeral=True)

    # ── Commands ──────────────────────────────────────────────────────
    security_group = app_commands.Group(name="security", description="Server security controls")

    async def _require_admin(self, interaction: discord.Interaction) -> bool:
        perms = getattr(interaction.user, "guild_permissions", None)
        if bool(getattr(perms, "administrator", False)) or bool(getattr(perms, "manage_guild", False)):
            return True
        await interaction.response.send_message(
            "You need **Administrator** or **Manage Server** for this.", ephemeral=True)
        return False

    @security_group.command(name="raidmode", description="Turn raid protection on or off (Administrator).")
    @app_commands.describe(state="on or off", minutes="How long protection should last (on only)")
    @app_commands.choices(state=[
        app_commands.Choice(name="On", value="on"),
        app_commands.Choice(name="Off", value="off"),
    ])
    async def raidmode(self, interaction: discord.Interaction,
                       state: app_commands.Choice[str], minutes: int = 0):
        if not await self._require_admin(interaction):
            return
        if state.value == "off":
            res = await modservice.end_raid_mode(self.bot, database, interaction.guild.id,
                                                 reason=f"Disabled by {interaction.user}",
                                                 actor_id=interaction.user.id, source="discord")
            await interaction.response.send_message(
                embed=utils.base_embed("🟢 Raid protection OFF" if res.get("ok") else "⚠️ Failed",
                                       "New-account screening is disabled."
                                       if res.get("ok") else str(res.get("error"))))
            return
        settings = await self._settings(interaction.guild.id)
        window = _clamp("raidModeMinutes", minutes or settings.get("raidModeMinutes"),
                        DEFAULTS["raidModeMinutes"])
        res = await modservice.begin_raid_mode(
            self.bot, database, interaction.guild.id, minutes=window,
            reason=f"Enabled by {interaction.user}", automatic=False,
            actor_id=interaction.user.id, source="discord")
        if not res.get("ok"):
            await interaction.response.send_message(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.response.send_message(embed=utils.base_embed(
            "🚨 Raid protection ON",
            f"New accounts (< {settings.get('minAccountAgeHours')}h) will be "
            f"**{settings.get('raidAction')}** on join.\n"
            f"Ends automatically in {window} minutes — `/security raidmode off` stops it sooner."))

    @security_group.command(name="setup", description="Configure verification (Administrator).")
    @app_commands.describe(role="Role granted on verification", channel="Channel for the verify button",
                           enabled="Enable the verification workflow")
    async def setup(self, interaction: discord.Interaction, role: discord.Role,
                    channel: discord.TextChannel | None = None, enabled: bool = True):
        if not await self._require_admin(interaction):
            return
        problems: list[str] = []
        if role.is_default() or role.managed:
            problems.append("Pick a normal, non-integration role.")
        try:
            if role >= interaction.guild.me.top_role:
                problems.append(f"I can't assign **@{role.name}** — move my role above it.")
        except TypeError:
            problems.append("The role hierarchy could not be evaluated.")
        dangerous = [name for name in ("administrator", "manage_guild", "manage_roles", "ban_members")
                     if bool(getattr(role.permissions, name, False))]
        if dangerous:
            problems.append(
                f"**@{role.name}** carries {', '.join(dangerous)} — a verification role must not "
                "grant power. Choose a harmless role (it is auto-assigned, so nobody reviews it).")
        if problems:
            await interaction.response.send_message(
                embed=utils.base_embed("⚠️ Not configured", "\n".join(problems)), ephemeral=True)
            return
        target = channel or interaction.channel
        try:
            await database.set_security_state(
                interaction.guild.id, verificationEnabled=bool(enabled),
                verificationRoleId=str(role.id),
                verificationChannelId=str(getattr(target, "id", "")))
        except Exception as exc:
            await interaction.response.send_message(
                embed=utils.base_embed("⚠️ Failed", f"Could not store the setting ({type(exc).__name__})."),
                ephemeral=True)
            return
        await database.log_mod_audit(
            interaction.guild.id, "verification_setup", moderator_id=interaction.user.id,
            target_id=role.id, source="discord", success=True,
            reason=f"verification role @{role.name} in #{getattr(target, 'name', '?')}")
        sent = ""
        if enabled and isinstance(target, discord.TextChannel):
            try:
                await target.send(embed=utils.base_embed(
                    "✅ Verification",
                    "Press the button to get access to the server."), view=VerifyView(self))
                sent = f"\nVerify button posted in {target.mention}."
            except discord.HTTPException:
                sent = "\n⚠️ I could not post the button there (check my Send Messages permission)."
        await interaction.response.send_message(embed=utils.base_embed(
            "✅ Verification configured" if enabled else "🟢 Verification disabled",
            f"Role: **@{role.name}**" + sent), ephemeral=True)

    @security_group.command(name="status", description="Current security posture.")
    async def status(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        caps = await self.capabilities(interaction.guild)
        settings = await self._settings(interaction.guild.id)
        channel, how = await self._alert_channel(interaction.guild, settings)
        e = utils.base_embed("🔐 Security status", "")
        e.add_field(name="Raid protection",
                    value=("🔴 ACTIVE" + (f" until <t:{int(_ts(caps['raidModeUntil']))}:t>"
                                          if _ts(caps["raidModeUntil"]) else ""))
                    if caps["raidMode"] else "🟢 Off", inline=True)
        e.add_field(name="Verification",
                    value=f"✅ <@&{caps['verificationRoleId']}>" if caps["verificationEnabled"]
                    and caps["verificationRoleId"] else "🟢 Off", inline=True)
        e.add_field(name="Trigger",
                    value=f"{settings['joinSpikeThreshold']} joins / {settings['joinWindowSeconds']}s\n"
                          f"action: {settings['raidAction']}", inline=True)
        e.add_field(name="Anti-nuke",
                    value=f"{settings['deleteSpikeThreshold']} destructive changes / "
                          f"{settings['deleteWindowSeconds']}s", inline=True)
        e.add_field(name="Alerts",
                    value=(f"{channel.mention} ({how})" if channel else "⚠️ no writable channel"),
                    inline=True)
        e.add_field(name="Automated actions to review",
                    value=str(caps["pendingReview"]), inline=True)
        if caps["problems"]:
            e.add_field(name="🚨 Not operational",
                        value="\n".join(f"• {p}" for p in caps["problems"])[:1000], inline=False)
        else:
            e.add_field(name="Capabilities", value="All required permissions and intents present.",
                        inline=False)
        await interaction.followup.send(embed=e, ephemeral=True)

    @security_group.command(name="review", description="Automated actions that need review.")
    async def review(self, interaction: discord.Interaction):
        if not await self._require_admin(interaction):
            return
        await interaction.response.defer(ephemeral=True)
        rows = await database.unreviewed_auto_actions(interaction.guild.id, 10)
        if not rows:
            await interaction.followup.send(
                embed=utils.base_embed("✅ Nothing to review",
                                       "No automatic action is waiting for a decision."),
                ephemeral=True)
            return
        lines = []
        for row in rows:
            lines.append(f"`{row['id'][-6:]}` **{row['action']}** → <@{row['targetId']}> — "
                         f"{row['reason'][:80]} ({row['source']})")
        await interaction.followup.send(embed=utils.base_embed(
            "🧾 Automatic actions awaiting review",
            "\n".join(lines) + "\n\nUndo one with `/security undo <id suffix>` "
            "(the 6-character code in backticks)."), ephemeral=True)

    @security_group.command(name="undo", description="Reverse an automatic action (Administrator).")
    @app_commands.describe(action_id="The 6-character code shown by /security review")
    async def undo(self, interaction: discord.Interaction, action_id: str):
        if not await self._require_admin(interaction):
            return
        await interaction.response.defer(ephemeral=True)
        rows = await database.unreviewed_auto_actions(interaction.guild.id, 100)
        match = next((r for r in rows if r["id"].endswith(action_id.strip())), None)
        if match is None:
            await interaction.followup.send(
                "No unreviewed automatic action matches that code — run `/security review`.",
                ephemeral=True)
            return
        result = await self._reverse(interaction.guild, match, actor_id=interaction.user.id)
        await database.mark_audit_reviewed(interaction.guild.id, match["id"],
                                          note=f"undo by {interaction.user}")
        try:
            await database.bump_pending_review(interaction.guild.id, -1)
        except Exception:
            pass
        await interaction.followup.send(embed=utils.base_embed(
            "↩️ Reversed" if result.get("ok") else "⚠️ Could not reverse",
            result.get("detail") or str(result.get("error"))), ephemeral=True)

    async def _reverse(self, guild: discord.Guild, row: dict, *, actor_id: int) -> dict:
        """Undo one automated action, using the record of what it changed."""
        action = str(row.get("action", ""))
        target = int(row.get("targetId") or 0)
        meta = row.get("meta") or {}
        try:
            if action.startswith("automod_") or action in ("timeout",):
                res = await modservice.remove_timeout(
                    self.bot, database, guild.id, target,
                    f"Automated {action} reversed by an administrator", 0, "system")
                detail = ("Timeout removed." if res.get("ok")
                          else f"Nothing to remove: {res.get('error')}")
                await database.log_mod_audit(guild.id, "undo", moderator_id=actor_id,
                                             target_id=target, source="system",
                                             success=bool(res.get("ok")),
                                             reason=f"reversed {action}", detail=detail)
                return {"ok": True, "detail": detail}
            if action in ("anti_nuke",):
                previous = str(meta.get("previousVerificationLevel") or "")
                level = _verification_level(previous)
                if level is None:
                    return {"ok": False, "error": f"Stored verification level {previous!r} is unreadable"}
                try:
                    await guild.edit(verification_level=level,
                                     reason=f"Anti-nuke reversal by {actor_id}")
                except discord.Forbidden:
                    return {"ok": False, "error": "I need Manage Guild to restore the verification level."}
                except discord.HTTPException as exc:
                    return {"ok": False, "error": f"Discord refused the change ({exc.status})."}
                await database.log_mod_audit(guild.id, "undo", moderator_id=actor_id,
                                             target_id=0, source="system", success=True,
                                             reason="verification level restored",
                                             detail=f"{previous} → restored")
                return {"ok": True, "detail": f"Verification level restored to **{previous}**."}
            if action in ("ban", "automod_ban"):
                res = await modservice.unban_member(
                    self.bot, database, guild.id, target,
                    "Automated ban reversed by an administrator", 0, "system")
                return {"ok": bool(res.get("ok")),
                        "detail": "Ban reversed." if res.get("ok") else None,
                        "error": res.get("error")}
            if action == "verify":
                role_id = str(meta.get("roleId") or "")
                member = guild.get_member(target)
                role = guild.get_role(int(role_id)) if role_id.isdigit() else None
                if member is None or role is None:
                    return {"ok": False, "error": "Member or role no longer exists."}
                await member.remove_roles(role, reason=f"Verification reversed by {actor_id}")
                return {"ok": True, "detail": f"Removed **@{role.name}**."}
            if action in ("raid_trigger",):
                res = await modservice.end_raid_mode(
                    self.bot, database, guild.id, reason=f"Reversed by {actor_id}",
                    actor_id=actor_id, source="system")
                return {"ok": bool(res.get("ok")), "detail": "Raid protection ended.",
                        "error": res.get("error")}
            return {"ok": False, "error": f"Nothing to reverse for {action!r}."}
        except Exception as exc:
            return {"ok": False, "error": f"{type(exc).__name__}"}

    @security_group.command(name="lockdown", description="Lock all channels (Administrator).")
    async def lockdown(self, interaction: discord.Interaction):
        if not await self._require_admin(interaction):
            return
        await interaction.response.defer()
        # Delegates to the ONE lockdown implementation (modservice): the old
        # private copy did not save the previous overwrite, so /security unlock
        # could not restore it and every channel kept whatever was set last.
        res = await modservice.lockdown_server(
            self.bot, database, interaction.guild.id, f"Lockdown by {interaction.user}",
            actor_id=interaction.user.id, source="discord")
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(embed=utils.base_embed(
            "🔒 LOCKDOWN", f"**{len(res.get('locked') or [])}** channels locked.\n"
            "Run `/security unlock` to restore them."))

    @security_group.command(name="unlock", description="Restore channels after lockdown.")
    async def unlock(self, interaction: discord.Interaction):
        if not await self._require_admin(interaction):
            return
        await interaction.response.defer()
        res = await modservice.unlock_server(
            self.bot, database, interaction.guild.id, f"Unlock by {interaction.user}",
            actor_id=interaction.user.id, source="discord")
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(embed=utils.base_embed(
            "🔓 Unlocked", f"**{len(res.get('restored') or [])}** channels restored to the "
            "permissions they had before the lockdown."))


def _ts(iso: str | None) -> int:
    """ISO timestamp → unix seconds (0 when absent/unreadable)."""
    if not iso:
        return 0
    try:
        from datetime import datetime, timezone
        value = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return int(value.timestamp())
    except Exception:
        return 0


def _verification_level(name: str):
    """Discord verification level from its stored name (None when unknown)."""
    mapping = {
        "none": discord.VerificationLevel.none,
        "low": discord.VerificationLevel.low,
        "medium": discord.VerificationLevel.medium,
        "high": discord.VerificationLevel.high,
        "highest": discord.VerificationLevel.highest,
        "VerificationLevel.none": discord.VerificationLevel.none,
        "VerificationLevel.low": discord.VerificationLevel.low,
        "VerificationLevel.medium": discord.VerificationLevel.medium,
        "VerificationLevel.high": discord.VerificationLevel.high,
        "VerificationLevel.highest": discord.VerificationLevel.highest,
    }
    return mapping.get(str(name).strip())


async def setup(bot: commands.Bot):
    await bot.add_cog(SecurityCog(bot))
