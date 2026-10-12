"""Moderation: warnings, kicks/bans, mutes, purge, lock, automod, setup.

AutoMod note — the handler below is a REAL discord.py listener
(``@commands.Cog.listener()``). It used not to be: the method was named
``on_message`` but never registered, and the bot's event dispatcher in
``main.py`` has no ``on_message`` forwarding, so no rule ever ran. Discord
still delivered commands because ``commands.Bot.on_message`` (the class
method) does the prefix dispatch — which is exactly why the silence looked
like "nothing to report". Any future event handler here must be decorated, or
main.py must forward to it explicitly; the two mechanisms are not the same
and a missing decorator fails silently.
"""

import logging
from datetime import timedelta

import discord
from discord import app_commands
from discord.ext import commands

import automod
import database
import config
import utils
import modservice

log = logging.getLogger("bot.moderation")

#: Severity order used when the escalation ladder and a rule's own action
#: disagree. The STRICTER wins: escalation may raise a punishment but never
#: quietly lower one the operator configured.
ACTION_ORDER = ("none", "delete", "warn", "timeout", "kick", "ban")


class ModerationCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        # AutoMod counters live in Mongo (see automod.MongoAutomodState): the
        # in-process dict this replaces made every restart a clean slate for
        # whoever was mid-spam-window.
        self._state = automod.MongoAutomodState(database)

    # NOTE: flat /warn /warnings /kick /ban /timeout /clear /lock commands
    # were consolidated into the /moderation, /purge and /lockdown groups
    # (cogs/modgroup.py, purge.py, lockdown.py). Discord allows max 100
    # top-level global commands — groups carry unlimited subcommands in ONE
    # slot. Both paths call the same modservice functions.

    @staticmethod
    def _member_guard(interaction: discord.Interaction, user) -> str | None:
        """Validate a moderation target. Returns an error message or None.
        Handles unresolvable members (discord.py passes a raw str) and
        self-targets — these must never crash before the interaction acks."""
        if isinstance(user, str) or not hasattr(user, "id"):
            return "That user couldn't be resolved — try picking them from the mention autocomplete."
        if user.id == interaction.user.id:
            return "You can't moderate yourself."
        if getattr(user, "bot", False):
            return "Bots can't be moderated this way."
        return None

    @staticmethod
    def _hierarchy_guard(interaction: discord.Interaction, user) -> str | None:
        """Discord role hierarchy: a moderator may only act on members whose
        highest role is strictly below their own highest role. The guild
        owner outranks everyone. Returns an error message or None."""
        if not isinstance(user, discord.Member):
            return None  # unresolvable targets handled by _member_guard
        if interaction.user.id == interaction.guild.owner_id:
            return None
        if user.id == interaction.guild.owner_id:
            return "You can't moderate the server owner."
        if user.top_role >= interaction.user.top_role:
            return (f"You can't moderate {user.mention} — their highest role "
                    f"**{user.top_role.name}** is at or above yours.")
        return None

    async def _log(self, guild: discord.Guild, embed: discord.Embed) -> None:
        cfg = await database.get_guild_config(guild.id)
        moderation = cfg.get("moderation") or {}
        channel_id = moderation.get("logChannelId") or (cfg.get("channels") or {}).get("logs")
        if not channel_id:
            return
        channel = guild.get_channel(int(channel_id))
        if isinstance(channel, discord.TextChannel):
            try:
                await channel.send(embed=embed)
            except discord.HTTPException:
                pass

    async def _case_and_log(self, interaction: discord.Interaction, user, action: str,
                            reason: str, duration: str = "") -> int | None:
        """Record a case + persist action + send to the mod-log channel.
        Returns the case ID (or None). Never raises — logging must not break
        the moderation action itself."""
        case_id = None
        try:
            case_id = await database.add_case(
                interaction.guild.id, user.id, interaction.user.id, action,
                reason, duration)
        except Exception:
            log.warning("Case recording failed for %s in %s", action, interaction.guild.id)
        await database.log_action(interaction.guild.id, interaction.user.id, user.id, action, reason[:300])
        e = utils.base_embed(
            f"📋 Case #{case_id}" if case_id else f"📋 {action}",
            f"**Action:** {action.upper()}\n**Target:** {user.mention} (`{user.id}`)\n"
            f"**Moderator:** {interaction.user.mention}\n**Reason:** {reason[:300]}"
            + (f"\n**Duration:** {duration}" if duration else ""))
        e.timestamp = discord.utils.utcnow()
        await self._log(interaction.guild, e)
        return case_id

    async def _dm_target(self, user, guild: discord.Guild, action: str, reason: str) -> None:
        """Best-effort DM notification. Closed DMs must never fail the action.
        Per-guild DM toggles (moderation.dmNotifications) decide which actions
        notify; unset means notify."""
        try:
            cfg = await database.get_guild_config(guild.id)
            dm_cfg = ((cfg.get("moderation") or {}).get("dmNotifications")) or {}
            key = {"warning": "warn", "timeout": "timeout", "kick": "kick", "ban": "ban"}.get(action, action)
            if dm_cfg.get(key, True) is False:
                return
        except Exception:
            pass
        try:
            await user.send(embed=utils.base_embed(
                f"✉️ You received a {action} in {guild.name}",
                f"Reason: {reason[:300]}\nIf you believe this is a mistake, contact the staff."))
        except (discord.Forbidden, discord.HTTPException):
            pass

    @staticmethod
    def _warn_thresholds(cfg: dict) -> list[dict]:
        """Per-guild warning escalation ladder. Each entry: {count, action,
        durationMinutes}. Defaults preserve the historical 3 → 60m timeout."""
        raw = ((cfg.get("moderation") or {}).get("warnThresholds")) or []
        cleaned: list[dict] = []
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            try:
                count = int(entry.get("count", 0))
            except (TypeError, ValueError):
                continue
            action = str(entry.get("action") or "timeout").lower()
            if count < 1 or action not in ("timeout", "kick", "ban"):
                continue
            try:
                duration = max(1, min(int(entry.get("durationMinutes", 60)), 40320))
            except (TypeError, ValueError):
                duration = 60
            cleaned.append({"count": count, "action": action, "durationMinutes": duration})
        cleaned.sort(key=lambda e: e["count"])
        return cleaned or [{"count": 3, "action": "timeout", "durationMinutes": 60}]

    async def _apply_warn_thresholds(self, interaction: discord.Interaction,
                                     user: discord.Member, count: int) -> None:
        """Run every newly-reached escalation step. Hierarchy re-checked per
        step; a blocked step aborts louder steps without failing the warn."""
        cfg = await database.get_guild_config(interaction.guild.id)
        bot_top = interaction.guild.me.top_role
        for step in self._warn_thresholds(cfg):
            if step["count"] != count:
                continue
            if user.top_role >= bot_top:
                await interaction.followup.send(
                    embed=utils.base_embed("⚠️ Escalation blocked",
                                           f"{user.mention} reached {count} warnings, but their role "
                                           f"is at or above mine — move my role higher to enforce it."))
                return
            try:
                if step["action"] == "timeout":
                    await user.timeout(
                        discord.utils.utcnow() + timedelta(minutes=step["durationMinutes"]),
                        reason=f"{count} warnings (guild escalation policy)")
                    await database.add_case(
                        interaction.guild.id, user.id, interaction.user.id, "timeout",
                        f"Escalation: {count} warnings", f"{step['durationMinutes']}m", source="system")
                    await interaction.followup.send(
                        embed=utils.base_embed("🛡️ Escalation",
                                               f"{user.mention} reached {count} warnings — timed out "
                                               f"for {step['durationMinutes']} minutes."))
                elif step["action"] == "kick":
                    await user.kick(reason=f"{count} warnings (guild escalation policy)")
                    await database.add_case(
                        interaction.guild.id, user.id, interaction.user.id, "kick",
                        f"Escalation: {count} warnings", source="system")
                    await interaction.followup.send(
                        embed=utils.base_embed("🛡️ Escalation",
                                               f"{user.mention} reached {count} warnings — kicked."))
                elif step["action"] == "ban":
                    await user.ban(reason=f"{count} warnings (guild escalation policy)",
                                   delete_message_days=0)
                    await database.add_case(
                        interaction.guild.id, user.id, interaction.user.id, "ban",
                        f"Escalation: {count} warnings", source="system")
                    await interaction.followup.send(
                        embed=utils.base_embed("🛡️ Escalation",
                                               f"{user.mention} reached {count} warnings — banned."))
            except discord.Forbidden:
                await interaction.followup.send(
                    embed=utils.base_embed("⚠️ Escalation failed",
                                           "I lack permission to carry out the escalation step."))

    # ── Warnings ──────────────────────────────────────────────────────
    # Flat /warn /warnings /clearwarnings /removewarning → /moderation group
    # (cogs/modgroup.py). Escalation (_apply_warn_thresholds) stays here and
    # is invoked by the group command, so behavior is unchanged.

    # NOTE: /case and /cases already exist in the community cog (moderation
    # history lookup). They are intentionally NOT duplicated here — a second
    # registration would kill this whole cog at load (CommandAlreadyRegistered)
    # and Discord allows max 100 global slash commands per application.

    # ── Role tools ────────────────────────────────────────────────────
    @staticmethod
    def _role_guard(interaction: discord.Interaction, role) -> str | None:
        """Roles the bot may manage: real role, not @everyone, not managed,
        strictly below the bot's top role (and below the moderator's, unless
        they own the server)."""
        if not isinstance(role, discord.Role):
            return "That role couldn't be resolved — try the autocomplete."
        if role.id == interaction.guild.id:
            return "The @everyone role can't be managed."
        if role.managed:
            return f"**@{role.name}** is managed by an integration and can't be assigned manually."
        me_top = interaction.guild.me.top_role
        if role >= me_top:
            return (f"I can't manage **@{role.name}** — it is at or above my highest role "
                    f"**{me_top.name}**. Fix: Server Settings → Roles → drag my role higher.")
        if interaction.user.id != interaction.guild.owner_id:
            mod_top = interaction.user.top_role if isinstance(interaction.user, discord.Member) else None
            if mod_top is not None and role >= mod_top:
                return (f"You can't manage **@{role.name}** — it is at or above your highest role.")
        return None

    @app_commands.command(name="role", description="Add, remove, or inspect a role.")
    @app_commands.describe(action="add, remove, or info", user="Member (add/remove)",
                           role="Role to manage or inspect")
    @app_commands.choices(action=[
        app_commands.Choice(name="add", value="add"),
        app_commands.Choice(name="remove", value="remove"),
        app_commands.Choice(name="info", value="info"),
    ])
    async def role_cmd(self, interaction: discord.Interaction,
                       action: app_commands.Choice[str], role: discord.Role,
                       user: discord.Member | None = None):
        if not interaction.user.guild_permissions.manage_roles:
            await interaction.response.send_message("You need Manage Roles permission.", ephemeral=True)
            return
        err = self._role_guard(interaction, role)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        if action.value == "info":
            members = len(role.members)
            await interaction.response.send_message(embed=utils.base_embed(
                f"🎭 @{role.name}",
                f"**Position:** {role.position}\n**Members:** {members}\n"
                f"**Color:** {role.color}\n**Managed:** {'yes (integration)' if role.managed else 'no'}"),
                ephemeral=True)
            return
        if user is None or isinstance(user, str) or not hasattr(user, "id"):
            await interaction.response.send_message(
                "Pick a member for add/remove — try the mention autocomplete.", ephemeral=True)
            return
        if user.id == interaction.guild.owner_id:
            await interaction.response.send_message("You can't change the server owner's roles.", ephemeral=True)
            return
        try:
            if action.value == "add":
                await user.add_roles(role, reason=f"By {interaction.user}")
            else:
                await user.remove_roles(role, reason=f"By {interaction.user}")
        except discord.Forbidden as exc:
            await interaction.response.send_message(
                modservice.describe_forbidden(exc, "Manage Roles", "that role change"),
                ephemeral=True)
            return
        await database.add_case(interaction.guild.id, user.id, interaction.user.id,
                                f"role_{action.value}",
                                f"{role.name} ({role.id})", source="discord")
        await interaction.response.send_message(
            embed=utils.base_embed("🎭 Role updated",
                                   f"**@{role.name}** {'added to' if action.value == 'add' else 'removed from'} {user.mention}."))

    # ── Kick / ban / unban ────────────────────────────────────────────
    # Flat /kick /ban /unban → /moderation group (cogs/modgroup.py), which
    # calls the same modservice functions as the dashboard bridge.

    # ── Mute / unmute ─────────────────────────────────────────────────
    # NOTE: /mute and /unmute were removed as separate commands — they were
    # exact duplicates of /timeout and /untimeout, and Discord allows a
    # maximum of 100 global slash commands per application. Use /timeout and
    # /untimeout instead (the dashboard Timeout buttons are unchanged).
    # NOTE: /mute and /unmute were removed as separate commands — they were
    # exact duplicates of /timeout and /untimeout, and Discord allows a
    # maximum of 100 global slash commands per application (exceeding it kills
    # whole cogs at load). Use /timeout and /untimeout instead.

    # ── Explicit timeout names ──────────────────────────────────────────
    # Flat /timeout /untimeout → /moderation timeout|removetimeout
    # (cogs/modgroup.py) via the shared service.

    # ── Slowmode / nick ─────────────────────────────────────────────
    @app_commands.command(name="slowmode", description="Set channel slowmode (Manage Channels).")
    @app_commands.describe(seconds="0 to disable, max 21600")
    async def slowmode(self, interaction: discord.Interaction, seconds: int):
        if not interaction.user.guild_permissions.manage_channels:
            await interaction.response.send_message("You need Manage Channels permission.", ephemeral=True)
            return
        seconds = max(0, min(seconds, 21600))
        try:
            await interaction.channel.edit(slowmode_delay=seconds,
                                           reason=f"By {interaction.user}")
        except discord.Forbidden as exc:
            await interaction.response.send_message(
                modservice.describe_forbidden(exc, "Manage Channels", "that slowmode change"),
                ephemeral=True)
            return
        await self._log(interaction.guild, utils.base_embed(
            "🐌 Slowmode changed",
            f"{interaction.channel.mention} → **{seconds}s** by {interaction.user.mention}"))
        await interaction.response.send_message(
            f"🐌 Slowmode set to **{seconds}s**." if seconds else "🐌 Slowmode disabled.")

    @app_commands.command(name="nick", description="Change a member's nickname (Manage Nicknames).")
    @app_commands.describe(user="Member to rename", nickname="New nickname (empty to reset)")
    async def nick(self, interaction: discord.Interaction, user: discord.Member, nickname: str = ""):
        if not interaction.user.guild_permissions.manage_nicknames:
            await interaction.response.send_message("You need Manage Nicknames permission.", ephemeral=True)
            return
        err = self._member_guard(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        try:
            await user.edit(nick=nickname[:32] or None, reason=f"By {interaction.user}")
        except discord.Forbidden as exc:
            await interaction.response.send_message(
                modservice.describe_forbidden(exc, "Manage Nicknames", "that nickname change"),
                ephemeral=True)
            return
        await self._log(interaction.guild, utils.base_embed(
            "✏️ Nickname changed",
            f"{user.mention} → **{nickname[:32] or '(reset)'}** by {interaction.user.mention}"))
        await interaction.response.send_message(
            embed=utils.base_embed("✏️ Nickname changed",
                                   f"{user.mention} → **{nickname[:32] or '(reset to username)'}**"))

    # ── Clear / lock ──────────────────────────────────────────────────
    # Flat /clear → /purge all|bot|… (cogs/purge.py); flat /lock /unlock →
    # /lockdown channel|unlock-channel (cogs/lockdown.py), which additionally
    # store pre-lock state and support durations. Same Discord behaviors.

    # ── Permission audit ─────────────────────────────────────────────
    @app_commands.command(name="permissionaudit",
                          description="Audit what this bot can do here and flag anything risky.")
    @app_commands.checks.has_permissions(manage_guild=True)
    async def permissionaudit(self, interaction: discord.Interaction):
        """Server-wide bot permission audit: what was granted vs. what the
        bot actually needs, with plain-language risk flags."""
        await interaction.response.defer(ephemeral=True)
        me = interaction.guild.me
        perms = me.guild_permissions

        # What the bot NEEDS (aligned with config.invite_url least-privilege grant)
        needed = {
            "view_channel": "See channels", "send_messages": "Send messages",
            "embed_links": "Rich embeds", "attach_files": "Transcripts/files",
            "read_message_history": "Tickets/automod context", "connect": "Join voice",
            "speak": "Play music", "use_application_commands": "Slash commands",
            "moderate_members": "Timeouts (/mute, raid screening)",
        }
        # Powerful grants that deserve a flag if present
        risky = {
            "administrator": ("HIGH", "Full access to everything — overrides all other limits."),
            "manage_roles": ("MEDIUM", "Can assign/rename/delete roles."),
            "manage_webhooks": ("MEDIUM", "Can read messages via webhooks; can be abused to spam."),
            "manage_guild": ("MEDIUM", "Can change server settings and invites."),
            "manage_channels": ("LOW", "Needed for /lock, /unlock, lockdown, ticket channels."),
            "manage_messages": ("LOW", "Needed for /clear and automod message deletion."),
            "ban_members": ("LOW", "Needed for /ban, /unban and automod escalation."),
            "kick_members": ("LOW", "Needed for /kick and automod escalation."),
            "mention_everyone": ("MEDIUM", "Can ping @everyone — spam risk."),
        }

        lines: list[str] = []
        for perm, label in needed.items():
            lines.append(f"{'✅' if getattr(perms, perm, False) else '❌'} {label}")

        flags: list[str] = []
        for perm, (level, why) in risky.items():
            if getattr(perms, perm, False):
                flags.append(f"**{level}** · `{perm}` — {why}")

        role_position_ok = True
        warnings: list[str] = []
        top = me.top_role
        if top.is_default():
            role_position_ok = False
            warnings.append("Bot has NO roles — it cannot kick/ban/timeout anyone above @everyone.")
        # Concrete hierarchy impact: how many members can the bot actually act on?
        moderatable = 0
        blocked = 0
        for m in interaction.guild.members:
            if m.bot or m.id == interaction.guild.owner_id:
                continue
            if m.top_role < top:
                moderatable += 1
            else:
                blocked += 1
        total_humans = moderatable + blocked
        if blocked and total_humans:
            pct = round(blocked * 100 / total_humans)
            warnings.append(
                f"Role hierarchy: **{blocked}/{total_humans} human members ({pct}%)** are at or "
                f"above the bot's role — kick/ban/timeout will FAIL for them. "
                f"Fix: Server Settings → Roles → drag **{top.name}** higher.")

        counts = (
            f"**Role position:** {top.position} of {len(interaction.guild.roles) - 1}\n"
            f"**Members it can moderate:** {moderatable}/{total_humans} humans\n"
            f"**Owner-granted by role:** {top.name or '@everyone'}"
        )

        e = utils.base_embed(
            "🔍 Bot Permission Audit",
            f"Bot: {me.mention} • Audited <t:{int(discord.utils.utcnow().timestamp())}:R>\n\n"
            + "\n".join(lines))
        e.add_field(name="Role / scope", value=counts, inline=False)
        if flags:
            e.add_field(name=f"⚠️ Extra grants flagged ({len(flags)})",
                        value="\n".join(flags)[:1000], inline=False)
        else:
            e.add_field(name="⚠️ Extra grants", value="None — least-privilege setup 🎉", inline=False)
        if warnings:
            e.add_field(name="🚨 Problems", value="\n".join(warnings)[:1000], inline=False)
        e.set_footer(text="Remove unneeded grants in Server Settings → Roles → Bot role")
        await interaction.followup.send(embed=e, ephemeral=True)

    # NOTE: /setup was removed — channel configuration lives in the dashboard
    # (ModuleSettings selectors), which validates and syncs it. Keeping a
    # slash duplicate costs one of only 100 global command slots.

    # ── Welcome + automod events ──────────────────────────────────────
    @commands.Cog.listener()
    async def on_member_update(self, before: discord.Member, after: discord.Member):
        """Member metadata changed — roles / nickname / permissions-relevant state."""
        if before.roles == after.roles:
            return
        await self._on_role_change(member=after, before=before)

    async def _on_role_change(self, member: discord.Member, before: discord.Member | None = None) -> None:
        """Log a role change to the mod-log channel.

        This method was CALLED but never defined, so every role change raised
        AttributeError inside the listener and discord.py swallowed it — role
        changes were invisible, including the ones a raid makes.
        """
        try:
            added = [r for r in member.roles if before is None or r not in before.roles]
            removed = [r for r in (before.roles if before else []) if r not in member.roles]
            if not added and not removed:
                return
            parts = []
            if added:
                parts.append("added " + ", ".join(f"**@{r.name}**" for r in added))
            if removed:
                parts.append("removed " + ", ".join(f"**@{r.name}**" for r in removed))
            await self._log(member.guild, utils.base_embed(
                "🎭 Roles changed", f"{member.mention} (`{member.id}`) — " + "; ".join(parts)))
        except Exception:
            log.warning("Role-change logging failed in %s", getattr(member.guild, "id", "?"))

    def automod_availability(self) -> dict:
        """Can AutoMod actually run on this process? Measured, not assumed.

        Without the Message Content intent Discord does not deliver guild
        message content (and does not dispatch MESSAGE_CREATE for guilds at
        all), so the honest answer is "unavailable", with the exact remediation
        — never a green "AutoMod enabled" badge over a scanner that cannot see
        a single message.
        """
        intents = getattr(self.bot, "intents", None)
        has_content = bool(getattr(intents, "message_content", False))
        return {
            "messageContentIntent": has_content,
            "membersIntent": bool(getattr(intents, "members", False)),
            "operational": has_content,
            "code": None if has_content else "AUTOMOD_UNAVAILABLE_NO_MESSAGE_CONTENT",
            "message": ("Message Content intent is enabled — rules are evaluated on every message."
                        if has_content else
                        "AutoMod is NOT running: enable the Message Content intent in the "
                        "Discord developer portal (Bot → Privileged Gateway Intents). Without "
                        "it Discord sends no guild message content and no rule can be evaluated."),
        }


    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        cfg = await database.get_guild_config(member.guild.id)
        welcome = cfg.get("welcome") or {}
        channel_id = welcome.get("channelId") or (cfg.get("channels") or {}).get("welcome")
        if welcome and not welcome.get("enabled", False):
            return
        if not channel_id:
            return
        channel = member.guild.get_channel(int(channel_id))
        if not isinstance(channel, discord.TextChannel):
            return
        message = str(welcome.get("message") or "Hey {user} — welcome to {server}!")
        for variable, value in {
            "{user}": member.mention,
            "{username}": member.display_name,
            "{server}": member.guild.name,
            "{membercount}": str(member.guild.member_count or 0),
            "{userid}": str(member.id),
        }.items():
            message = message.replace(variable, value)
        embed = utils.base_embed("🎬 Welcome to MuraStream!", message)
        auto_role_id = welcome.get("autoRoleId")
        if auto_role_id:
            role = member.guild.get_role(int(auto_role_id))
            if role:
                try:
                    await member.add_roles(role, reason="Dashboard welcome auto-role")
                except discord.HTTPException:
                    log.warning("Could not assign welcome role %s in %s", auto_role_id, member.guild.id)
        view = discord.ui.View()
        view.add_item(utils.site_link_button("🎬 MuraStream", config.MURASTREAM_URL, "▶️"))
        view.add_item(utils.site_link_button("🍔 Muragoods", f"{config.MURASTREAM_URL}/hub", "🍔"))
        view.add_item(utils.site_link_button("📖 Help", f"{config.MURASTREAM_URL}/murastream", "📖"))
        try:
            await channel.send(embed=embed, view=view)
        except discord.HTTPException:
            pass

    @commands.Cog.listener()
    async def on_message_edit(self, before: discord.Message, after: discord.Message):
        """Edited message — re-run the SAME checks on the new text.

        The dedupe ledger in the engine makes this safe: re-screening the
        identical content is a no-op, while an edit that ADDS a blocked word or
        a link is caught, which the previous in-memory strike counter could not
        tell apart.
        """
        if not after.guild or after.author.bot:
            return
        if before.content == after.content:
            return
        await self._automod_check(after)

    @commands.Cog.listener()
    async def on_message_delete(self, message: discord.Message):
        """Deleted message — logged when a mod-log channel is configured."""
        if not message.guild or message.author.bot:
            return
        await self._log_deleted_message(message)

    @commands.Cog.listener()
    async def on_bulk_message_delete(self, messages: list[discord.Message]):
        """Bulk delete — one entry with the count, not one per message."""
        if not messages or not messages[0].guild:
            return
        await self._log_deleted_message(messages[0], bulk=True, count=len(messages))

    async def _log_deleted_message(self, message: discord.Message, *, bulk: bool = False,
                                   count: int = 1) -> None:
        """Report a deletion to the mod log, with WHO did it when Discord says.

        Missing entirely before this phase: both callers referenced a method
        that did not exist, so delete logging raised AttributeError into the
        event dispatcher (and one of the two handlers was not registered at
        all). The content is truncated and never trusted as the whole story —
        Discord's own audit entry is what identifies the deleter when the
        member cache has no author (a bot delete, for instance).
        """
        try:
            author = getattr(message, "author", None)
            content = str(getattr(message, "content", "") or "")[:400]
            title = (f"🗑️ Bulk delete — {count} messages" if bulk else "🗑️ Message deleted")
            who = f"{author.mention} (`{author.id}`)" if author else "unknown author"
            fields = [f"**Author:** {who}", f"**Channel:** {getattr(message.channel, 'mention', '?')}"]
            if content:
                fields.append(f"**Content:** {content}")
            actor = await self._audit_actor(message.guild, discord.AuditLogAction.message_delete)
            if actor:
                fields.append(f"**Deleted by:** {actor.mention} (`{actor.id}`) — per Discord audit log")
            else:
                fields.append("**Deleted by:** unknown (Discord audit log has no recent entry — "
                              "the author or a bot may have removed it)")
            await self._log(message.guild, utils.base_embed(title, "\n".join(fields)))
        except Exception:
            log.warning("Delete logging failed in %s", getattr(message, "guild", None))

    async def _audit_actor(self, guild: discord.Guild, action: discord.AuditLogAction):
        """Who performed an action, per DISCORD's audit log (or None).

        Kept separate from Murabot's own audit trail on purpose: Discord's log
        cannot say "this expired", "this failed" or "an automatic rule did it",
        and Murabot's cannot say "a human clicked delete in the client". The
        dashboard shows them as two labelled sources rather than merging them.
        """
        try:
            entries = [e async for e in guild.audit_logs(limit=5, action=action)]
            if not entries:
                return None
            newest = entries[0]
            return getattr(newest, "user", None)
        except Exception:
            return None

    async def on_message(self, message: discord.Message):
        """Registered listener? See the module docstring — it is now."""
        await self._automod_check(message)

    # ── AutoMod ───────────────────────────────────────────────────────
    async def _automod_check(self, message: discord.Message) -> dict:
        """Screen one message through the shared engine and act on its verdict.

        Returns the decision (also used by the bridge's dry-run/status calls).
        The engine owns the RULES; this method owns the Discord side effects and
        the audit trail, and it never reports success for an action Discord
        refused.
        """
        if message.author.bot or not message.guild:
            return {"violation": False, "skip": automod.SKIP_NO_GUILD}
        try:
            cfg = await database.get_guild_config(message.guild.id)
        except Exception as exc:
            log.warning("AutoMod config read failed for %s: %s",
                        message.guild.id, type(exc).__name__)
            return {"violation": False, "skip": "config_unavailable"}
        norm = automod.normalize_config(cfg.get("moderation"), cfg.get("automod"))
        availability = self.automod_availability()
        try:
            decision = await automod.evaluate(
                message, norm, self._state,
                has_message_content=availability["messageContentIntent"])
        except automod.AutomodUnavailable as exc:
            # Honest, once per guild: the rule set is fine, Discord is not
            # delivering the text. Reported through /health and the dashboard.
            log.warning("AutoMod cannot run in %s: %s", message.guild.id, exc.code)
            return {"violation": False, "skip": exc.code,
                    "error": str(exc), "code": exc.code}
        except Exception as exc:
            log.warning("AutoMod evaluation failed in %s: %s",
                        message.guild.id, type(exc).__name__)
            return {"violation": False, "skip": "evaluation_failed"}

        if not decision.violation:
            if decision.skip not in (automod.SKIP_CLEAN, None):
                log.debug("AutoMod skipped in %s: %s", message.guild.id, decision.skip)
            return decision.as_dict()

        await self._apply_automod(message, norm, decision)
        return decision.as_dict()

    async def _apply_automod(self, message: discord.Message, cfg: dict,
                             decision: automod.Decision) -> None:
        """Carry out an AutoMod verdict: delete, punish, notify, log, audit."""
        member = message.author if isinstance(message.author, discord.Member) else None
        guild = message.guild
        severity = {
            "none": 0, "delete": 1, "warn": 2, "timeout": 3, "kick": 4, "ban": 5,
        }
        step = decision.action if decision.action in severity else "delete"
        ladder = list(cfg.get("escalation") or [])
        if ladder and member is not None:
            candidate = ladder[min(max(decision.strikes, 1) - 1, len(ladder) - 1)]
            if severity.get(candidate, 0) > severity.get(step, 0):
                step = candidate
        # Never let an automatic rule touch someone the bot outranks only on
        # paper: the service re-checks the hierarchy and returns a refusal,
        # which becomes the recorded outcome (a visible failure, not a lie).
        deleted = False
        if severity.get(step, 1) >= 1 or decision.action == "delete":
            try:
                await message.delete()
                deleted = True
            except discord.HTTPException as exc:
                log.info("AutoMod could not delete a message in %s (%s)",
                         guild.id, getattr(exc, "status", "?"))
        result: dict = {"ok": True}
        if member is not None and step in ("warn", "timeout", "kick", "ban"):
            reason = f"AutoMod {decision.rule}: {decision.reason}"[:300]
            minutes = int(decision.duration_minutes or 10)
            if step == "warn":
                result = await modservice.warn_member(self.bot, database, guild.id, member.id,
                                                      reason, 0, "automod")
            elif step == "timeout":
                result = await modservice.timeout_member(self.bot, database, guild.id, member.id,
                                                         minutes, reason, 0, "automod")
            elif step == "kick":
                result = await modservice.kick_member(self.bot, database, guild.id, member.id,
                                                      reason, 0, "automod")
            else:
                result = await modservice.ban_member(self.bot, database, guild.id, member.id,
                                                     reason, 0, 0, "automod")
        try:
            await database.log_automod_event(
                guild.id, rule=decision.rule, member_id=getattr(member, "id", 0),
                action=step, reason=decision.reason, detail=decision.detail,
                channel_id=getattr(message.channel, "id", ""), message_id=message.id,
                strikes=decision.strikes, source="automod")
        except Exception:
            pass
        if not member or step == "delete" or step == "none":
            # No member punishment was attempted — the audit still records the
            # rule fire, because "the message was deleted" is an action.
            await database.log_mod_audit(
                guild.id, f"automod_{decision.rule}", moderator_id=0,
                target_id=getattr(member, "id", 0) or 0, source="automod", success=True,
                reason=decision.reason, detail=decision.detail,
                reversible=True, meta={"delete": str(deleted), "strikes": str(decision.strikes)})
        embed = utils.base_embed(
            f"🤖 AutoMod · {decision.rule}",
            f"**Member:** {getattr(member, 'mention', 'unknown')} (`{getattr(member, 'id', 0)}`)\n"
            f"**Channel:** {getattr(message.channel, 'mention', '?')}\n"
            f"**Matched:** {decision.reason}\n**Strikes:** {decision.strikes}\n"
            f"**Action:** {step}" + ("" if result.get("ok") else
                                     f"\n**Failed:** {result.get('error')}"))
        await self._log(guild, embed)
        if cfg.get("notifyUser", True):
            try:
                await message.channel.send(
                    f"{getattr(member, 'mention', '')} message removed "
                    f"({decision.rule}) — strike {decision.strikes}.",
                    delete_after=5)
            except discord.HTTPException:
                pass
        if decision.strikes and cfg.get("cooldownSeconds"):
            # Only armed after a real violation, so the cooldown suppresses
            # repeat PUNISHMENTS without hiding the violation itself.
            await automod.apply_cooldown(cfg, self._state, guild.id, getattr(member, "id", 0))

    def _is_mod_msg(self, message: discord.Message) -> bool:
        return automod.is_staff_member(getattr(message, "author", None))


async def setup(bot: commands.Bot):
    await bot.add_cog(ModerationCog(bot))
