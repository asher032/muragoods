"""Moderation: warnings, kicks/bans, mutes, purge, lock, automod, setup."""

import logging
import re
from datetime import timedelta

import discord
from discord import app_commands
from discord.ext import commands

import database
import config
import utils

log = logging.getLogger("bot.moderation")

SPAM_WINDOW = 10  # seconds
SPAM_LIMIT = 6    # messages within window
MENTION_LIMIT = 8
DEFAULT_BANNED_LINKS = ("discord.gg/",)  # configurable per-guild invite blocking


class ModerationCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        # In-memory spam tracker: { (guild_id, user_id): [timestamps] }
        self._msg_times: dict[tuple[int, int], list[float]] = {}

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
        except discord.Forbidden:
            await interaction.response.send_message("I lack permission to change that role.", ephemeral=True)
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
        except discord.Forbidden:
            await interaction.response.send_message(
                "I need **Manage Channels** permission in this channel.", ephemeral=True)
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
        except discord.Forbidden:
            await interaction.response.send_message(
                "I can't change that nickname — check my role position and permissions.", ephemeral=True)
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
        await self._on_role_change(member=after)


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
        """Edited message — re-run the same automod checks."""
        if not after.guild or after.author.bot:
            return
        if before.content == after.content:
            return
        await self._automod_check(after)


    async def on_message_delete(self, message: discord.Message):
        """Deleted message — log when a mod log channel is configured."""
        if not message.guild:
            return
        await self._log_deleted_message(message)


    async def on_bulk_message_delete(self, messages: list[discord.Message]):
        """Bulk delete — log when a mod log channel is configured."""
        if not messages or not messages[0].guild:
            return
        await self._log_deleted_message(messages[0], bulk=True, count=len(messages))


    async def on_message(self, message: discord.Message):
        if message.author.bot or not message.guild:
            return
        cfg = await database.get_guild_config(message.guild.id)
        dashboard_mod = cfg.get("moderation") or {}
        legacy_automod = cfg.get("automod") or {}
        automod = {
            "enabled": dashboard_mod.get("automodEnabled", legacy_automod.get("enabled", True)),
            "blockLinks": dashboard_mod.get("antiLink", legacy_automod.get("blockLinks", False)),
            "blockInvites": dashboard_mod.get("antiInvite", False),
            "antiCaps": dashboard_mod.get("antiCaps", True),
            "mentionThreshold": int(dashboard_mod.get("mentionThreshold", MENTION_LIMIT)),
        }
        if not automod["enabled"]:
            return

        violations: list[str] = []
        # Message spam (per-user within SPAM_WINDOW) — dashboard antiSpam toggle
        if dashboard_mod.get("antiSpam", True) and not self._is_mod_msg(message):
            import time as _time
            key = (message.guild.id, message.author.id)
            now_ms = _time.monotonic()
            times = [t for t in self._msg_times.get(key, []) if now_ms - t <= SPAM_WINDOW]
            times.append(now_ms)
            self._msg_times[key] = times
            if len(times) > SPAM_LIMIT:
                violations.append("spam")
        # Mention spam
        if len(message.mentions) >= automod["mentionThreshold"]:
            violations.append("mention spam")
        # Link filtering (if enabled per guild)
        if automod["blockLinks"] and re.search(r"https?://", message.content):
            if not self._is_mod_msg(message):
                violations.append("links")
        if automod["blockInvites"] and re.search(r"(?:discord\.gg|discord(?:app)?\.com/invite)/", message.content, re.I):
            if not self._is_mod_msg(message):
                violations.append("invites")
        # Excessive caps
        letters = [c for c in message.content if c.isalpha()]
        if automod["antiCaps"] and len(letters) >= 20 and sum(c.isupper() for c in letters) / len(letters) > 0.8:
            violations.append("caps")

        if not violations:
            return
        try:
            await message.delete()
        except discord.HTTPException:
            return
        strikes = await database.automod_inc_strike(message.guild.id, message.author.id, violations[0])
        # Escalation ladder from the dashboard (warn → timeout → kick → ban)
        try:
            escalation = (dashboard_mod.get("escalation") or ["warn", "timeout", "timeout", "kick", "ban"])
            step = escalation[min(strikes - 1, len(escalation) - 1)] if strikes else "warn"
            member = message.author if isinstance(message.author, discord.Member) else None
            # Hierarchy guard: never escalate against the owner or anyone at/above the bot.
            if (member and member.id == message.guild.owner_id) or (
                    member and member.top_role >= message.guild.me.top_role):
                step = "warn"
            if member and step == "timeout" and strikes >= 2:
                from datetime import timedelta as _td
                await member.timeout(discord.utils.utcnow() + _td(minutes=10),
                                     reason=f"Automod: repeated {violations[0]}")
                await database.add_case(message.guild.id, member.id, 0, "timeout",
                                        f"Automod: repeated {violations[0]} (strike {strikes})",
                                        "10m", source="automod")
            elif member and step == "kick" and strikes >= 4:
                await member.kick(reason=f"Automod: repeated {violations[0]}")
                await database.add_case(message.guild.id, member.id, 0, "kick",
                                        f"Automod: repeated {violations[0]} (strike {strikes})",
                                        source="automod")
            elif member and step == "ban" and strikes >= 5:
                await member.ban(reason=f"Automod: repeated {violations[0]}", delete_message_days=0)
                await database.add_case(message.guild.id, member.id, 0, "ban",
                                        f"Automod: repeated {violations[0]} (strike {strikes})",
                                        source="automod")
        except discord.Forbidden:
            pass
        except discord.HTTPException:
            pass
        await message.channel.send(
            f"{message.author.mention} message removed ({violations[0]}) — strike {strikes}.",
            delete_after=5)

    def _is_mod_msg(self, message: discord.Message) -> bool:
        perms = message.author.guild_permissions if isinstance(message.author, discord.Member) else None
        return bool(perms and (perms.manage_guild or perms.moderate_members))


async def setup(bot: commands.Bot):
    await bot.add_cog(ModerationCog(bot))
