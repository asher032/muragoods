"""Ticket system — private support channels with close/claim controls."""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import database
import embeds
import utils

log = logging.getLogger("bot.tickets")


class TicketControls(utils.SafeView):
    def __init__(self, ticket_id: str, channel_id: int):
        super().__init__(timeout=None)  # persistent controls
        self.ticket_id = ticket_id
        self.channel_id = channel_id

    @discord.ui.button(label="Close", style=discord.ButtonStyle.danger, emoji="🔒")
    async def close(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer()
        channel = interaction.guild.get_channel(self.channel_id)
        if not channel:
            await interaction.followup.send("Ticket channel already deleted.", ephemeral=True)
            return
        # Simple transcript: last 50 messages to the opener via DM.
        try:
            msgs = [m async for m in channel.history(limit=50)]
            lines = [f"[{m.created_at:%Y-%m-%d %H:%M}] {m.author}: {m.content[:120]}"
                     for m in reversed(msgs) if m.content]
            opener_id = int(self.ticket_id.split("-")[1])
            opener = interaction.guild.get_member(opener_id)
            if opener:
                await opener.send(
                    embed=embeds.embed("🎟️ Ticket transcript",
                                       f"Ticket from **{interaction.guild.name}** was closed.\n\n"
                                       + "\n".join(lines[:40])[:1800],
                                       embeds.INFO))
        except discord.HTTPException:
            pass
        await database._db.tickets.update_one(
            {"_id": self.ticket_id}, {"$set": {"status": "closed"}})
        await interaction.followup.send(embed=embeds.embed(
            "🔒 Ticket closed", "Transcript sent to the opener. Deleting channel in 5s…"))
        import asyncio
        await asyncio.sleep(5)
        try:
            await channel.delete(reason="Ticket closed")
        except discord.HTTPException:
            pass

    @discord.ui.button(label="Claim", style=discord.ButtonStyle.primary, emoji="🙋")
    async def claim(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not interaction.user.guild_permissions.manage_messages:
            await interaction.response.send_message("Staff only.", ephemeral=True)
            return
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
            {"guildId": interaction.guild.id, "userId": interaction.user.id, "status": "open"})
        if existing:
            await interaction.followup.send(
                "You already have an open ticket — check your channels.", ephemeral=True)
            return
        category = discord.utils.get(interaction.guild.categories, name="Tickets")
        overwrites = {
            interaction.guild.default_role: discord.PermissionOverwrite(view_channel=False),
            interaction.user: discord.PermissionOverwrite(view_channel=True, send_messages=True),
            interaction.guild.me: discord.PermissionOverwrite(view_channel=True, send_messages=True),
        }
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
        })
        e = embeds.embed("🎟️ Support Ticket",
                         f"**Opened by:** {interaction.user.mention}\n"
                         f"**Subject:** {subject[:200]}", embeds.INFO)
        e.set_footer(text="Staff: use Close / Claim below • MuraStream")
        await channel.send(embed=e, view=TicketControls(ticket_id, channel.id))
        await interaction.followup.send(f"✅ Ticket created: {channel.mention}", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(TicketsCog(bot))
