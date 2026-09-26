"""`/purge` group — filtered message deletion (Manage Server).

Kinds: bot · contains · user · all · embeds · emoji · files · images ·
links · mentions · human. `purge` ignores pinned messages; the standalone
`/moderation cleanup` targets bot messages. Same modservice functions as the
dashboard bridge.
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import database
import modservice
import utils

log = logging.getLogger("bot.purge")

KINDS = ("bot", "contains", "user", "all", "embeds", "emoji", "files",
         "images", "links", "mentions", "human")


def _deny(interaction: discord.Interaction) -> str | None:
    try:
        if bool(getattr(interaction.user.guild_permissions, "manage_guild", False)):
            return None
    except Exception:
        pass
    return "You need the **Manage Server** permission."


class PurgeGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    purge = app_commands.Group(name="purge", description="Delete filtered message batches")

    async def _do(self, interaction: discord.Interaction, kind: str,
                  channel: discord.TextChannel | None, count: int,
                  user: discord.Member | None = None, text: str = "") -> None:
        deny = _deny(interaction)
        if deny:
            await interaction.response.send_message(deny, ephemeral=True)
            return
        target = channel or interaction.channel
        channel_id = getattr(target, "id", 0)
        if kind == "user" and (isinstance(user, str) or not hasattr(user, "id")):
            await interaction.response.send_message(
                "Pick a member for user purge — try the mention autocomplete.", ephemeral=True)
            return
        if kind == "contains" and not (text or "").strip():
            await interaction.response.send_message(
                "Search text is required for contains purge.", ephemeral=True)
            return
        await interaction.response.defer(ephemeral=True)
        try:
            res = await modservice.purge_messages(
                self.bot, database, interaction.guild.id, int(channel_id), kind,
                max(1, min(int(count or 20), 100)),
                user_id=getattr(user, "id", None),
                text=(text or "").strip(),
                actor_id=interaction.user.id, source="discord")
        except Exception as exc:
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", f"Purge failed ({type(exc).__name__})."),
                ephemeral=True)
            return
        if not res.get("ok"):
            await interaction.followup.send(
                embed=utils.base_embed("⚠️ Failed", str(res.get("error"))), ephemeral=True)
            return
        await interaction.followup.send(
            embed=utils.base_embed("🧹 Purged",
                                   f"**{res.get('deleted', 0)}** {kind} messages removed "
                                   f"(scanned {res.get('scanned', 0)})."),
            ephemeral=True)

    @purge.command(name="bot", description="Delete bot messages (Manage Server).")
    @app_commands.describe(channel="Channel (current if empty)", count="How many (1–100)")
    async def purge_bot(self, interaction: discord.Interaction, count: int = 20,
                        channel: discord.TextChannel | None = None):
        await self._do(interaction, "bot", channel, count)

    @purge.command(name="contains", description="Delete messages containing text (Manage Server).")
    @app_commands.describe(text="Substring to match", count="How many (1–100)",
                           channel="Channel (current if empty)")
    async def purge_contains(self, interaction: discord.Interaction, text: str, count: int = 20,
                             channel: discord.TextChannel | None = None):
        await self._do(interaction, "contains", channel, count, text=text)

    @purge.command(name="user", description="Delete one member's messages (Manage Server).")
    @app_commands.describe(user="Member", count="How many (1–100)",
                           channel="Channel (current if empty)")
    async def purge_user(self, interaction: discord.Interaction, user: discord.Member,
                         count: int = 20, channel: discord.TextChannel | None = None):
        await self._do(interaction, "user", channel, count, user=user)

    @purge.command(name="all", description="Delete recent messages (Manage Server).")
    @app_commands.describe(count="How many (1–100)", channel="Channel (current if empty)")
    async def purge_all(self, interaction: discord.Interaction, count: int = 20,
                        channel: discord.TextChannel | None = None):
        await self._do(interaction, "all", channel, count)

    @purge.command(name="embeds", description="Delete messages with embeds (Manage Server).")
    async def purge_embeds(self, interaction: discord.Interaction, count: int = 20,
                           channel: discord.TextChannel | None = None):
        await self._do(interaction, "embeds", channel, count)

    @purge.command(name="emoji", description="Delete messages with custom emoji (Manage Server).")
    async def purge_emoji(self, interaction: discord.Interaction, count: int = 20,
                          channel: discord.TextChannel | None = None):
        await self._do(interaction, "emoji", channel, count)

    @purge.command(name="files", description="Delete messages with file attachments (Manage Server).")
    async def purge_files(self, interaction: discord.Interaction, count: int = 20,
                          channel: discord.TextChannel | None = None):
        await self._do(interaction, "files", channel, count)

    @purge.command(name="images", description="Delete messages with images (Manage Server).")
    async def purge_images(self, interaction: discord.Interaction, count: int = 20,
                           channel: discord.TextChannel | None = None):
        await self._do(interaction, "images", channel, count)

    @purge.command(name="links", description="Delete messages with links (Manage Server).")
    async def purge_links(self, interaction: discord.Interaction, count: int = 20,
                          channel: discord.TextChannel | None = None):
        await self._do(interaction, "links", channel, count)

    @purge.command(name="mentions", description="Delete messages with mentions (Manage Server).")
    async def purge_mentions(self, interaction: discord.Interaction, count: int = 20,
                             channel: discord.TextChannel | None = None):
        await self._do(interaction, "mentions", channel, count)

    @purge.command(name="human", description="Delete non-bot messages (Manage Server).")
    async def purge_human(self, interaction: discord.Interaction, count: int = 20,
                          channel: discord.TextChannel | None = None):
        await self._do(interaction, "human", channel, count)


async def setup(bot: commands.Bot):
    await bot.add_cog(PurgeGroup(bot))
