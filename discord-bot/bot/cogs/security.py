"""Security: anti-raid join-spike detection, anti-nuke, lockdown, suspicious accounts."""

import asyncio
import logging
import time
from datetime import timedelta

import discord
from discord import app_commands
from discord.ext import commands

import database
import embeds

log = logging.getLogger("bot.security")

JOIN_SPIKE = 8          # joins within window to trigger raid mode
JOIN_WINDOW = 20        # seconds
DELETE_SPIKE = 6        # channel deletions within window = nuke attempt
DELETE_WINDOW = 30
MIN_ACCOUNT_AGE_HOURS = 24  # flag newer accounts during raid mode


class SecurityCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._joins: dict[int, list[float]] = {}       # guild_id -> join timestamps
        self._raid_mode: dict[int, bool] = {}          # guild_id -> active
        self._raid_until: dict[int, float] = {}        # guild_id -> auto-disable time
        self._raid_tasks: set[asyncio.Task] = set()
        self._channel_deletes: dict[int, list[float]] = {}
        self._settings_cache: dict[int, tuple[float, dict]] = {}  # guild -> (loaded_at, settings)

    async def _settings(self, guild_id: int) -> dict:
        """Dashboard securitySettings with a 60s cache — never hardcode what the owner configured."""
        hit = self._settings_cache.get(guild_id)
        now = time.monotonic()
        if hit and now - hit[0] < 60:
            return hit[1]
        defaults = {
            "antiRaidEnabled": True,
            "joinSpikeThreshold": JOIN_SPIKE,
            "antiNukeEnabled": True,
            "minAccountAgeHours": MIN_ACCOUNT_AGE_HOURS,
        }
        try:
            cfg = await database.get_guild_config(guild_id)
            sec = cfg.get("securitySettings") or {}
            settings = {**defaults, **{k: v for k, v in sec.items() if k in defaults}}
        except Exception:
            log.warning("Could not load securitySettings for %s — using defaults", guild_id)
            settings = defaults
        self._settings_cache[guild_id] = (now, settings)
        return settings

    def _recent(self, lst: list[float], window: float, now: float) -> list[float]:
        return [t for t in lst if now - t <= window]

    # ── Anti-raid: join spike detection ───────────────────────────────
    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        now = time.monotonic()
        settings = await self._settings(member.guild.id)
        threshold = int(settings.get("joinSpikeThreshold") or JOIN_SPIKE)
        min_age_h = int(settings.get("minAccountAgeHours") or MIN_ACCOUNT_AGE_HOURS)
        lst = self._recent(self._joins.setdefault(member.guild.id, []), JOIN_WINDOW, now)
        lst.append(now)
        self._joins[member.guild.id] = lst

        # Auto-expire raid mode (non-blocking — checked on every join).
        if self._raid_mode.get(member.guild.id) and now >= self._raid_until.get(member.guild.id, 0):
            self._raid_mode[member.guild.id] = False

        if (settings.get("antiRaidEnabled", True) and len(lst) >= threshold
                and not self._raid_mode.get(member.guild.id)):
            self._raid_mode[member.guild.id] = True
            self._raid_until[member.guild.id] = now + 600
            e = embeds.embed(
                "🚨 RAID MODE ENABLED",
                f"**{len(lst)} joins in {JOIN_WINDOW}s** detected.\n"
                "New members with accounts younger than "
                f"{min_age_h}h will be timed out.\n"
                "Run `/security raidmode off` to disable.",
                embeds.ERROR)
            for ch in member.guild.text_channels[:1]:
                try:
                    await ch.send(embed=e)
                    break
                except discord.HTTPException:
                    break

        # Suspicious-account screening during raid mode.
        if self._raid_mode.get(member.guild.id):
            age = discord.utils.utcnow() - member.created_at
            if age < timedelta(hours=min_age_h):
                try:
                    await member.timeout(
                        discord.utils.utcnow() + timedelta(minutes=30),
                        reason="Raid mode: account too new")
                except discord.Forbidden:
                    pass

    # ── Anti-nuke: mass channel deletion detection ────────────────────
    # ── Security-relevant guild events ─────────────────────────────────────
    @commands.Cog.listener()
    async def on_member_remove(self, member: discord.Member):
        """Member left — feed join-spike detector as a removal event so raid-mode
        that was primed by joins does not stay armed indefinitely."""
        now = time.monotonic()
        self._joins.setdefault(member.guild.id, []).append(now)


    @commands.Cog.listener()
    async def on_member_ban(self, guild: discord.Guild, user: discord.User):
        """Ban event — clear any pending raid-mode auto-disable so the incident is
        visible in logs rather than silently expiring while the server is under
        active protection."""
        self._raid_until.pop(guild.id, None)


    @commands.Cog.listener()
    async def on_member_unban(self, guild: discord.Guild, user: discord.User):
        """Unban event — nothing destructive here, but logged for audit continuity
        when the security module is active."""
        pass


    @commands.Cog.listener()
    async def on_message_delete(self, message: discord.Message):
        """Single message deletion — if admins want delete-logging, the owning
        cog (moderation) owns that; security cares about delete SPIKES."""
        now = time.monotonic()
        self._channel_deletes.setdefault(message.channel.id, []).append(now)
        deletes = self._recent(self._channel_deletes[message.channel.id], DELETE_WINDOW, now)
        if len(deletes) >= DELETE_SPIKE:
            await self._raise_raid_alert(member.guild, f"Mass message deletion detected in {message.channel.mention}")


    @commands.Cog.listener()
    async def on_bulk_message_delete(self, messages: list[discord.Message]):
        """Bulk delete is a stronger nuke signal than single-message deletes."""
        now = time.monotonic()
        if not messages:
            return
        channel_id = messages[0].channel.id
        self._channel_deletes.setdefault(channel_id, []).extend([now] * len(messages))
        deletes = self._recent(self._channel_deletes[channel_id], DELETE_WINDOW, now)
        if len(deletes) >= DELETE_SPIKE:
            guild = messages[0].guild
            await self._raise_raid_alert(guild, f"Bulk message deletion detected ({len(messages)} messages)")


    @commands.Cog.listener()
    async def on_guild_channel_create(self, channel):
        """New channel created — relevant when anti-nuke is watching for destructive
        channel churn; creation alone is not a nuke signal."""
        pass


    @commands.Cog.listener()
    async def on_guild_channel_update(self, before, after):
        """Channel renamed/permission-overwrite changed — relevant to anti-nuke
        channel-protection paths."""
        if before.permission_overwrites != after.permission_overwrites:
            await self._on_channel_overwrite_change(after)


    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel):
        now = time.monotonic()
        guild = channel.guild
        settings = await self._settings(guild.id)
        if not settings.get("antiNukeEnabled", True):
            return
        threshold = max(3, int(settings.get("joinSpikeThreshold") or DELETE_SPIKE))
        lst = self._recent(self._channel_deletes.setdefault(guild.id, []), DELETE_WINDOW, now)
        lst.append(now)
        self._channel_deletes[guild.id] = lst
        if len(lst) >= threshold:
            audit = [entry async for entry in guild.audit_logs(limit=3, action=discord.AuditLogAction.channel_delete)]
            actor = audit[0].user if audit else None
            if actor and actor.id == self.bot.user.id:
                return  # our own cleanup
            try:
                await guild.edit(verification_level=discord.VerificationLevel.high,
                                 reason="Emergency protection: mass channel deletion")
            except discord.Forbidden:
                pass
            for ch in guild.text_channels[:1]:
                try:
                    await ch.send(embed=embeds.embed(
                        "🛑 ANTI-NUKE TRIGGERED",
                        f"**{len(lst)} channels deleted in {DELETE_WINDOW}s**"
                        + (f" by {actor.mention}" if actor else "") +
                        "\nVerification level raised to HIGH. Review immediately.",
                        embeds.ERROR))
                    break
                except discord.HTTPException:
                    break

    # ── Commands ──────────────────────────────────────────────────────
    security_group = app_commands.Group(name="security", description="Server security controls")

    @security_group.command(name="raidmode", description="Toggle raid mode manually (Administrator).")
    @app_commands.describe(state="on or off")
    @app_commands.choices(state=[
        app_commands.Choice(name="On", value="on"),
        app_commands.Choice(name="Off", value="off"),
    ])
    async def raidmode(self, interaction: discord.Interaction, state: app_commands.Choice[str]):
        await interaction.response.defer()
        if not interaction.user.guild_permissions.administrator:
            await interaction.followup.send("Administrator only.", ephemeral=True)
            return
        self._raid_mode[interaction.guild.id] = state.value == "on"
        self._raid_until[interaction.guild.id] = time.monotonic() + 600 if state.value == "on" else 0
        await interaction.followup.send(embed=embeds.embed(
            "🚨 Raid mode **ON**" if state.value == "on" else "🟢 Raid mode **OFF**",
            "New accounts will be timed out on join." if state.value == "on"
            else "Join screening disabled.",
            embeds.ERROR if state.value == "on" else embeds.OK))

    @security_group.command(name="lockdown", description="Lock all public channels (Administrator).")
    async def lockdown(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not interaction.user.guild_permissions.administrator:
            await interaction.followup.send("Administrator only.", ephemeral=True)
            return
        locked = 0
        for ch in interaction.guild.text_channels:
            perms = ch.permissions_for(interaction.guild.me)
            if not perms.manage_channels:
                continue
            overwrite = ch.overwrites_for(interaction.guild.default_role)
            if overwrite.send_messages is False:
                continue
            overwrite.send_messages = False
            try:
                await ch.set_permissions(interaction.guild.default_role,
                                         overwrite=overwrite, reason="Lockdown")
                locked += 1
            except discord.Forbidden:
                continue
        await interaction.followup.send(embed=embeds.embed(
            "🔒 LOCKDOWN", f"**{locked}** channels locked.\nRun `/security unlock` to restore.",
            embeds.WARN))

    @security_group.command(name="unlock", description="Unlock channels after lockdown.")
    async def unlock(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if not interaction.user.guild_permissions.administrator:
            await interaction.followup.send("Administrator only.", ephemeral=True)
            return
        unlocked = 0
        for ch in interaction.guild.text_channels:
            perms = ch.permissions_for(interaction.guild.me)
            if not perms.manage_channels:
                continue
            overwrite = ch.overwrites_for(interaction.guild.default_role)
            if overwrite.send_messages is not False:
                continue
            overwrite.send_messages = None
            try:
                await ch.set_permissions(interaction.guild.default_role,
                                         overwrite=overwrite, reason="Lockdown lift")
                unlocked += 1
            except discord.Forbidden:
                continue
        await interaction.followup.send(embed=embeds.ok(
            "🔓 Unlocked", f"**{unlocked}** channels restored."))

    @security_group.command(name="status", description="Current security posture.")
    async def status(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        raid = self._raid_mode.get(interaction.guild.id, False)
        e = embeds.embed("🔐 Security Status", color=embeds.SEC)
        e.add_field(name="Raid mode", value="🔴 ACTIVE" if raid else "🟢 Off", inline=True)
        e.add_field(name="Anti-raid auto-trigger",
                    value=f"{JOIN_SPIKE} joins / {JOIN_WINDOW}s", inline=True)
        e.add_field(name="Anti-nuke", value=f"{DELETE_SPIKE} deletes / {DELETE_WINDOW}s", inline=True)
        await interaction.followup.send(embed=e, ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(SecurityCog(bot))
