"""`/lockdown` group — channel and server lockdown (Manage Channels).

Permission mapping (resolved from the existing implementation: the current
`/lock` command requires Manage Channels, and lockdown is the same
@everyone Send-Messages deny extended to many channels):
    lockdown channel / unlock   → Manage Channels
    lockdown server / unlock    → Manage Channels
Locks deny Send Messages for @everyone; roles with explicit grants keep
working. Unlock restores EXACTLY the overwrite the lock changed (saved
state) — never unrelated administrator edits. Same modservice functions as
the dashboard bridge.
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import database
import modservice
import utils

log = logging.getLogger("bot.lockdown")


def _deny(interaction: discord.Interaction) -> str | None:
    try:
        if bool(getattr(interaction.user.guild_permissions, "manage_channels", False)):
            return None
    except Exception:
        pass
    return "You need the **Manage Channels** permission."


class LockdownGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    lockdown = app_commands.Group(name="lockdown", description="Lock and unlock channels or the server")

    @lockdown.command(name="channel", description="Lock one channel (Manage Channels).")
    @app_commands.describe(channel="Channel (current if empty)", duration="e.g. 30m, 2h (empty = stay locked)",
                           reason="Why?")
    async def lockdown_channel(self, interaction: discord.Interaction,
                               channel: discord.TextChannel | None = None,
                               duration: str = "", reason: str = "Lockdown"):
        deny = _deny(interaction)
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        target = channel or interaction.channel
        minutes = modservice.parse_duration_minutes(duration, default=None) if duration.strip() else None
        if duration.strip() and minutes is None:
            await interaction.response.send_message(
                "Duration not understood — try `30m`, `2h`, `1d`.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        try:
            res = await modservice.lockdown_channel(
                self.bot, database, interaction.guild.id, int(getattr(target, "id", 0)),
                reason, duration_minutes=minutes,
                actor_id=interaction.user.id, source="discord")
        except Exception as exc:
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", f"Lock failed ({type(exc).__name__})."),
                ephemeral=True)
            return
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(
            embed=utils.base_embed("🔒 Channel locked",
                                   f"<#{res.get('channelId')}> — members can no longer send messages."),
            ephemeral=True)

    @lockdown.command(name="unlock-channel", description="Unlock one channel (Manage Channels).")
    @app_commands.describe(channel="Channel (current if empty)")
    async def unlock_channel(self, interaction: discord.Interaction,
                             channel: discord.TextChannel | None = None):
        deny = _deny(interaction)
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        target = channel or interaction.channel
        await interaction.response.defer(ephemeral=True)
        res = await modservice.unlock_channel(
            self.bot, database, interaction.guild.id, int(getattr(target, "id", 0)),
            "Unlocked", actor_id=interaction.user.id, source="discord")
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(
            embed=utils.base_embed("🔓 Channel unlocked", "Previous permissions restored."),
            ephemeral=True)

    @lockdown.command(name="server", description="Lock all public channels (Manage Channels).")
    @app_commands.describe(duration="e.g. 1h (empty = stay locked)", reason="Why?")
    async def lockdown_server(self, interaction: discord.Interaction,
                              duration: str = "", reason: str = "Server lockdown"):
        deny = _deny(interaction)
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        minutes = modservice.parse_duration_minutes(duration, default=None) if duration.strip() else None
        if duration.strip() and minutes is None:
            await interaction.response.send_message(
                "Duration not understood — try `30m`, `2h`, `1d`.", ephemeral=True)
            return
        await interaction.response.defer()
        try:
            res = await modservice.lockdown_server(
                self.bot, database, interaction.guild.id, reason,
                duration_minutes=minutes,
                actor_id=interaction.user.id, source="discord")
        except Exception as exc:
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", f"Lockdown failed ({type(exc).__name__})."),
                ephemeral=True)
            return
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(
            embed=utils.base_embed("🔒 LOCKDOWN",
                                   f"**{len(res.get('locked') or [])}** channels locked. "
                                   "Run `/lockdown unlock-server` to restore."))

    @lockdown.command(name="unlock-server", description="Restore a server lockdown (Manage Channels).")
    async def unlock_server(self, interaction: discord.Interaction):
        deny = _deny(interaction)
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        await interaction.response.defer()
        res = await modservice.unlock_server(
            self.bot, database, interaction.guild.id, "Unlocked",
            actor_id=interaction.user.id, source="discord")
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(
            embed=utils.base_embed("🔓 Unlocked",
                                   f"**{len(res.get('restored') or [])}** channels restored."))


async def setup(bot: commands.Bot):
    await bot.add_cog(LockdownGroup(bot))
