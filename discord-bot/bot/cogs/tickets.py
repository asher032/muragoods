"""Ticket system — config-driven private support channels with real staff workflow."""

import asyncio
import logging

import discord
from discord import app_commands
from discord.ext import commands

import database
import embeds
import utils

log = logging.getLogger("bot.tickets")


async def _ticket_config(guild_id: int) -> dict:
    cfg = await database.get_guild_config(guild_id)
    return (cfg or {}).get("tickets") or {}


class TicketControls(utils.SafeView):
    """Persistent per-ticket controls. Close keeps the channel open (locked)
    so the dashboard can reopen it; Delete is the destructive option."""

    def __init__(self, ticket_id: str, channel_id: int, creator_id: int):
        super().__init__(timeout=None)
        self.ticket_id = ticket_id
        self.channel_id = channel_id
        self.creator_id = creator_id

    def _staff_only(self, interaction: discord.Interaction) -> bool:
        perms = interaction.user.guild_permissions if hasattr(interaction.user, "guild_permissions") else None
        return bool(perms and (perms.manage_guild or perms.manage_messages or perms.administrator))

    @discord.ui.button(label="Close", style=discord.ButtonStyle.danger, emoji="🔒")
    async def close(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer()
        channel = interaction.guild.get_channel(self.channel_id)
        if not channel:
            await interaction.followup.send("Ticket channel already deleted.", ephemeral=True)
            return
        # Save transcript (log channel if configured, else DM the opener).
        try:
            msgs = [m async for m in channel.history(limit=100, oldest_first=True)]
            lines = [f"[{m.created_at:%Y-%m-%d %H:%M}] {m.author}: {m.content[:150]}"
                     for m in msgs if m.content]
            cfg = await _ticket_config(interaction.guild.id)
            transcript_channel = None
            log_id = cfg.get("transcriptChannelId")
            if log_id:
                transcript_channel = interaction.guild.get_channel(int(log_id))
            body = "\n".join(lines[:80])[:1800]
            e = embeds.embed(
                "🎟️ Ticket transcript",
                f"Ticket **{self.ticket_id}** from **{interaction.guild.name}** was closed by {interaction.user.mention}.\n\n{body}",
                embeds.INFO)
            if transcript_channel:
                await transcript_channel.send(embed=e)
            else:
                opener = interaction.guild.get_member(self.creator_id)
                if opener:
                    await opener.send(embed=e)
        except discord.HTTPException:
            log.warning("Transcript delivery failed for %s", self.ticket_id)

        # Lock: creator loses Send Messages, keeps read access.
        try:
            await channel.set_permissions(
                interaction.guild.default_role, send_messages=False, reason="Ticket closed")
            creator = interaction.guild.get_member(self.creator_id)
            if creator:
                await channel.set_permissions(
                    creator, send_messages=False, view_channel=True, reason="Ticket closed")
        except discord.Forbidden:
            await interaction.followup.send(
                "I need **Manage Channels** to lock this ticket.", ephemeral=True)
            return

        await database._db.tickets.update_one(
            {"_id": self.ticket_id},
            {"$set": {"status": "closed", "closedAt": database._now(),
                      "closedBy": interaction.user.id}})
        await interaction.followup.send(embed=embeds.embed(
            "🔒 Ticket closed",
            f"By {interaction.user.mention}. The channel is locked and kept for records — reopen via the dashboard or Delete below.",
            embeds.WARN))

    @discord.ui.button(label="Delete", style=discord.ButtonStyle.danger, emoji="🗑️")
    async def delete(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not self._staff_only(interaction):
            await interaction.response.send_message("Staff only.", ephemeral=True)
            return
        await interaction.response.send_message("Deleting channel in 5s…")
        await asyncio.sleep(5)
        try:
            await interaction.channel.delete(reason="Ticket deleted by staff")
        except discord.HTTPException:
            pass

    @discord.ui.button(label="Claim", style=discord.ButtonStyle.primary, emoji="🙋")
    async def claim(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not self._staff_only(interaction):
            await interaction.response.send_message("Staff only.", ephemeral=True)
            return
        await database._db.tickets.update_one(
            {"_id": self.ticket_id},
            {"$set": {"claimedBy": interaction.user.id, "status": "claimed"}})
        await interaction.response.send_message(
            embed=embeds.ok("🙋 Claimed", f"{interaction.user.mention} is handling this ticket."))


class TicketsCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="ticket", description="Open a private support ticket.")
    @app_commands.describe(subject="What do you need help with?")
    async def ticket(self, interaction: discord.Interaction, subject: str):
        await interaction.response.defer(ephemeral=True)
        # One open ticket per user per guild.
        existing = await database._db.tickets.find_one(
            {"guildId": interaction.guild.id, "userId": interaction.user.id,
             "status": {"$in": ["open", "claimed"]}})
        if existing:
            await interaction.followup.send(
                "You already have an open ticket — check your channels.", ephemeral=True)
            return
        cfg = await _ticket_config(interaction.guild.id)
        category = None
        if cfg.get("categoryId"):
            category = interaction.guild.get_channel(int(cfg["categoryId"]))
        category = category or discord.utils.get(interaction.guild.categories, name="Tickets")
        overwrites = {
            interaction.guild.default_role: discord.PermissionOverwrite(view_channel=False),
            interaction.user: discord.PermissionOverwrite(view_channel=True, send_messages=True),
            interaction.guild.me: discord.PermissionOverwrite(view_channel=True, send_messages=True),
        }
        # Support role from dashboard config gets full staff access.
        support_role = None
        if cfg.get("supportRoleId"):
            support_role = interaction.guild.get_role(int(cfg["supportRoleId"]))
        if support_role:
            overwrites[support_role] = discord.PermissionOverwrite(
                view_channel=True, send_messages=True)
        try:
            channel = await interaction.guild.create_text_channel(
                f"ticket-{interaction.user.name}"[:90],
                category=category, overwrites=overwrites)
        except discord.Forbidden:
            await interaction.followup.send(
                "I need **Manage Channels** to create tickets.", ephemeral=True)
            return
        ticket_id = f"t-{interaction.user.id}-{channel.id}"
        await database._db.tickets.insert_one({
            "_id": ticket_id, "guildId": interaction.guild.id,
            "userId": interaction.user.id, "channelId": channel.id,
            "subject": subject[:300], "status": "open",
            "createdAt": database._now(),
        })
        e = embeds.embed("🎟️ Support Ticket",
                         f"**Opened by:** {interaction.user.mention}\n"
                         f"**Subject:** {subject[:200]}", embeds.INFO)
        e.set_footer(text="Staff: use Close / Claim below • MuraStream")
        await channel.send(embed=e, view=TicketControls(ticket_id, channel.id, interaction.user.id))
        await interaction.followup.send(f"✅ Ticket created: {channel.mention}", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(TicketsCog(bot))
