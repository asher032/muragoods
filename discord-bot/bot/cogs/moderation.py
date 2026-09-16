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

    def _is_mod(self, interaction: discord.Interaction) -> bool:
        perms = interaction.user.guild_permissions
        return perms.manage_guild or perms.moderate_members or perms.ban_members or perms.kick_members

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

    # ── Warnings ──────────────────────────────────────────────────────
    @app_commands.command(name="warn", description="Warn a member.")
    @app_commands.describe(user="Member to warn", reason="Why?")
    async def warn(self, interaction: discord.Interaction, user: discord.Member, reason: str):
        if not self._is_mod(interaction):
            await interaction.response.send_message("Moderators only.", ephemeral=True)
            return
        err = self._member_guard(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        count = await database.add_warning(interaction.guild.id, user.id, interaction.user.id, reason[:300])
        await database.log_action(interaction.guild.id, interaction.user.id, user.id, "warn", reason[:300])
        await interaction.response.send_message(
            embed=utils.base_embed("⚠️ Warning issued",
                                   f"{user.mention} — warning **#{count}**\nReason: {reason}"))
        if count >= 3:
            try:
                await user.timeout(discord.utils.utcnow() + timedelta(minutes=60),
                                   reason="3 warnings (automod escalation)")
                await interaction.followup.send(
                    embed=utils.base_embed("🛡️ Escalation", f"{user.mention} reached 3 warnings — muted for 1 hour."))
            except discord.Forbidden:
                await interaction.followup.send(
                    embed=utils.base_embed("⚠️ Escalation failed",
                                           "I lack permission to timeout this member."))

    @app_commands.command(name="warnings", description="Show a member's warnings.")
    async def warnings(self, interaction: discord.Interaction, user: discord.Member):
        if isinstance(user, str) or not hasattr(user, "id"):
            await interaction.response.send_message(
                "That user couldn't be resolved — try the mention autocomplete.", ephemeral=True)
            return
        entries = await database.get_warnings(interaction.guild.id, user.id)
        if not entries:
            await interaction.response.send_message(f"{user.mention} has a clean record ✨")
            return
        lines = [f"**{i}.** {e['reason']} — <@{e['moderatorId']}>" for i, e in enumerate(entries, 1)]
        await interaction.response.send_message(
            embed=utils.base_embed(f"⚠️ Warnings — {user.display_name}", "\n".join(lines)))

    @app_commands.command(name="clearwarnings", description="Clear a member's warnings.")
    async def clearwarnings(self, interaction: discord.Interaction, user: discord.Member):
        if not self._is_mod(interaction):
            await interaction.response.send_message("Moderators only.", ephemeral=True)
            return
        if isinstance(user, str) or not hasattr(user, "id"):
            await interaction.response.send_message(
                "That user couldn't be resolved — try the mention autocomplete.", ephemeral=True)
            return
        ok = await database.clear_warnings(interaction.guild.id, user.id)
        await interaction.response.send_message(
            embed=utils.base_embed("🧹 Warnings cleared" if ok else "ℹ️ Nothing to clear",
                                   f"{user.mention}'s record is now clean." if ok else f"{user.mention} had no warnings."))

    # ── Kick / ban ────────────────────────────────────────────────────
    @app_commands.command(name="kick", description="Kick a member.")
    async def kick(self, interaction: discord.Interaction, user: discord.Member, reason: str = "No reason given"):
        if not interaction.user.guild_permissions.kick_members:
            await interaction.response.send_message("You need Kick Members permission.", ephemeral=True)
            return
        err = self._member_guard(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        if user.top_role >= interaction.guild.me.top_role:
            await interaction.response.send_message("I can't kick someone with a role at or above mine.", ephemeral=True)
            return
        try:
            await user.kick(reason=f"By {interaction.user}: {reason[:200]}")
        except discord.Forbidden:
            await interaction.response.send_message("I lack permission to kick that member.", ephemeral=True)
            return
        await database.log_action(interaction.guild.id, interaction.user.id, user.id, "kick", reason[:300])
        await interaction.response.send_message(embed=utils.base_embed("👢 Kicked", f"{user.mention} — {reason}"))

    @app_commands.command(name="ban", description="Ban a member.")
    async def ban(self, interaction: discord.Interaction, user: discord.Member, reason: str = "No reason given"):
        if not interaction.user.guild_permissions.ban_members:
            await interaction.response.send_message("You need Ban Members permission.", ephemeral=True)
            return
        err = self._member_guard(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        if user.top_role >= interaction.guild.me.top_role:
            await interaction.response.send_message("I can't ban someone with a role at or above mine.", ephemeral=True)
            return
        try:
            await user.ban(reason=f"By {interaction.user}: {reason[:200]}", delete_message_days=0)
        except discord.Forbidden:
            await interaction.response.send_message("I lack permission to ban that member.", ephemeral=True)
            return
        await database.log_action(interaction.guild.id, interaction.user.id, user.id, "ban", reason[:300])
        await interaction.response.send_message(embed=utils.base_embed("🔨 Banned", f"{user.mention} — {reason}"))

    @app_commands.command(name="unban", description="Unban a user by ID.")
    async def unban(self, interaction: discord.Interaction, user_id: str):
        if not interaction.user.guild_permissions.ban_members:
            await interaction.response.send_message("You need Ban Members permission.", ephemeral=True)
            return
        try:
            user = await self.bot.fetch_user(int(user_id))
            await interaction.guild.unban(user)
        except (ValueError, discord.NotFound):
            await interaction.response.send_message("User not found in the ban list.", ephemeral=True)
            return
        except discord.Forbidden:
            await interaction.response.send_message("I lack permission to unban.", ephemeral=True)
            return
        await interaction.response.send_message(embed=utils.base_embed("✅ Unbanned", f"<@{user_id}> can rejoin."))

    # ── Mute / unmute ─────────────────────────────────────────────────
    @app_commands.command(name="mute", description="Timeout a member.")
    @app_commands.describe(user="Member to mute", minutes="Duration (default 10)")
    async def mute(self, interaction: discord.Interaction, user: discord.Member, minutes: int = 10):
        if not interaction.user.guild_permissions.moderate_members:
            await interaction.response.send_message("You need Moderate Members permission.", ephemeral=True)
            return
        err = self._member_guard(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        minutes = max(1, min(minutes, 40320))  # 28-day max
        try:
            await user.timeout(discord.utils.utcnow() + timedelta(minutes=minutes),
                               reason=f"By {interaction.user}")
        except discord.Forbidden:
            await interaction.response.send_message("I lack permission to timeout that member.", ephemeral=True)
            return
        await database.log_action(interaction.guild.id, interaction.user.id, user.id, "mute", f"{minutes}m")
        await interaction.response.send_message(
            embed=utils.base_embed("🔇 Muted", f"{user.mention} for **{minutes}** minutes."))

    @app_commands.command(name="unmute", description="Remove a member's timeout.")
    async def unmute(self, interaction: discord.Interaction, user: discord.Member):
        if not interaction.user.guild_permissions.moderate_members:
            await interaction.response.send_message("You need Moderate Members permission.", ephemeral=True)
            return
        err = self._member_guard(interaction, user)
        if err:
            await interaction.response.send_message(err, ephemeral=True)
            return
        try:
            await user.timeout(None, reason=f"By {interaction.user}")
        except discord.Forbidden:
            await interaction.response.send_message("I lack permission.", ephemeral=True)
            return
        await interaction.response.send_message(embed=utils.base_embed("🔊 Unmuted", f"{user.mention} can speak again."))

    # ── Clear / lock ──────────────────────────────────────────────────
    @app_commands.command(name="clear", description="Delete recent messages in this channel.")
    @app_commands.describe(amount="How many (1–100)")
    async def clear(self, interaction: discord.Interaction, amount: int):
        if not interaction.user.guild_permissions.manage_messages:
            await interaction.response.send_message("You need Manage Messages permission.", ephemeral=True)
            return
        amount = max(1, min(int(amount or 0), 100))
        await interaction.response.defer(ephemeral=True)
        try:
            deleted = await interaction.channel.purge(limit=amount)
        except discord.Forbidden:
            await interaction.followup.send(
                "I need **Manage Messages** permission in this channel to purge.", ephemeral=True)
            return
        await interaction.followup.send(f"🧹 Deleted {len(deleted)} messages.", ephemeral=True)

    @app_commands.command(name="lock", description="Lock this channel (stop members sending).")
    async def lock(self, interaction: discord.Interaction):
        if not interaction.user.guild_permissions.manage_channels:
            await interaction.response.send_message("You need Manage Channels permission.", ephemeral=True)
            return
        try:
            overwrite = interaction.channel.overwrites_for(interaction.guild.default_role)
            overwrite.send_messages = False
            await interaction.channel.set_permissions(interaction.guild.default_role, overwrite=overwrite)
        except discord.Forbidden:
            await interaction.response.send_message(
                "I need **Manage Channels** permission here to lock.", ephemeral=True)
            return
        await self._log(interaction.guild, utils.base_embed(
            "🔒 Channel locked", f"{interaction.channel.mention} by {interaction.user.mention}"))
        await interaction.response.send_message("🔒 Channel locked.")

    @app_commands.command(name="unlock", description="Unlock this channel.")
    async def unlock(self, interaction: discord.Interaction):
        if not interaction.user.guild_permissions.manage_channels:
            await interaction.response.send_message("You need Manage Channels permission.", ephemeral=True)
            return
        try:
            overwrite = interaction.channel.overwrites_for(interaction.guild.default_role)
            overwrite.send_messages = None
            await interaction.channel.set_permissions(interaction.guild.default_role, overwrite=overwrite)
        except discord.Forbidden:
            await interaction.response.send_message(
                "I need **Manage Channels** permission here to unlock.", ephemeral=True)
            return
        await self._log(interaction.guild, utils.base_embed(
            "🔓 Channel unlocked", f"{interaction.channel.mention} by {interaction.user.mention}"))
        await interaction.response.send_message("🔓 Channel unlocked.")

    # ── Setup ─────────────────────────────────────────────────────────
    @app_commands.command(name="setup", description="Configure bot channels (admins).")
    @app_commands.describe(channel_type="Which channel to set", channel="The channel")
    @app_commands.choices(channel_type=[
        app_commands.Choice(name="Welcome channel", value="welcome"),
        app_commands.Choice(name="Logs channel", value="logs"),
        app_commands.Choice(name="Movie requests channel", value="requests"),
        app_commands.Choice(name="Music commands channel", value="music"),
    ])
    async def setup(self, interaction: discord.Interaction,
                    channel_type: app_commands.Choice[str], channel: discord.TextChannel):
        if not interaction.user.guild_permissions.manage_guild:
            await interaction.response.send_message("You need Manage Server permission.", ephemeral=True)
            return
        if isinstance(channel, str) or not hasattr(channel, "id"):
            await interaction.response.send_message(
                "That channel couldn't be resolved — try the autocomplete.", ephemeral=True)
            return
        cfg = await database.get_guild_config(interaction.guild.id)
        channels = cfg.get("channels") or {}
        channels[channel_type.value] = channel.id
        await database.set_guild_config(interaction.guild.id, {"channels": channels})
        await interaction.response.send_message(
            embed=utils.base_embed("⚙️ Setup saved", f"{channel_type.name} → {channel.mention}"))

    # ── Welcome + automod events ──────────────────────────────────────
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
            if member and step == "timeout" and strikes >= 2:
                from datetime import timedelta as _td
                await member.timeout(discord.utils.utcnow() + _td(minutes=10),
                                     reason=f"Automod: repeated {violations[0]}")
            elif member and step == "kick" and strikes >= 4:
                await member.kick(reason=f"Automod: repeated {violations[0]}")
            elif member and step == "ban" and strikes >= 5:
                await member.ban(reason=f"Automod: repeated {violations[0]}", delete_message_days=0)
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
