"""Security: anti-raid join-spike detection, anti-nuke, lockdown, suspicious accounts."""

import asyncio
import logging
from datetime import timedelta

import discord
from discord import app_commands
from discord.ext import commands

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
        self._channel_deletes: dict[int, list[float]] = {}

    def _recent(self, lst: list[float], window: float, now: float) -> list[float]:
        return [t for t in lst if now - t <= window]

    # ── Anti-raid: join spike detection ───────────────────────────────
    @commands.Cog.listener()
    async def on_member_join(self, member: discord.Member):
        import time
        now = time.monotonic()
        lst = self._recent(self._joins.setdefault(member.guild.id, []), JOIN_WINDOW, now)
        lst.append(now)
        self._joins[member.guild.id] = lst

        if len(lst) >= JOIN_SPIKE and not self._raid_mode.get(member.guild.id):
            self._raid_mode[member.guild.id] = True
            e = embeds.embed(
                "🚨 RAID MODE ENABLED",
                f"**{len(lst)} joins in {JOIN_WINDOW}s** detected.\n"
                "New members with accounts younger than "
                f"{MIN_ACCOUNT_AGE_HOURS}h will be timed out.\n"
                "Run `/security raidmode off` to disable.",
                embeds.ERROR)
            for ch in member.guild.text_channels[:1]:
                try:
                    await ch.send(embed=e)
                    break
                except discord.HTTPException:
                    break
            # Auto-disable after 10 minutes.
            await asyncio.sleep(600)
            self._raid_mode[member.guild.id] = False

        # Suspicious-account screening during raid mode.
        if self._raid_mode.get(member.guild.id):
            age = discord.utils.utcnow() - member.created_at
            if age < timedelta(hours=MIN_ACCOUNT_AGE_HOURS):
                try:
                    await member.timeout(
                        discord.utils.utcnow() + timedelta(minutes=30),
                        reason="Raid mode: account too new")
                except discord.Forbidden:
                    pass

    # ── Anti-nuke: mass channel deletion detection ────────────────────
    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel):
        import time
        now = time.monotonic()
        guild = channel.guild
        lst = self._recent(self._channel_deletes.setdefault(guild.id, []), DELETE_WINDOW, now)
        lst.append(now)
        self._channel_deletes[guild.id] = lst
        if len(lst) >= DELETE_SPIKE:
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
