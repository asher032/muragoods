"""Muragoods features in Discord: food, letters, games, points, rewards."""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import bridge
import config
import database
import utils

log = logging.getLogger("bot.muragoods")


def menu_view() -> discord.ui.View:
    view = discord.ui.View()
    view.add_item(utils.site_link_button("🍔 Open Muragoods", f"{config.MURASTREAM_URL}/hub", "🍔"))
    view.add_item(utils.site_link_button("💌 Letters", f"{config.MURASTREAM_URL}/hub", "💌"))
    view.add_item(utils.site_link_button("🎮 Games", f"{config.MURASTREAM_URL}/hub", "🎮"))
    return view


class MuragoodsCog(commands.Cog):
    """Muragoods menus — the real interaction happens on the website."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="food", description="Muragoods food menu.")
    @app_commands.choices(section=[
        app_commands.Choice(name="Food", value="food"),
        app_commands.Choice(name="Drinks", value="drinks"),
        app_commands.Choice(name="Snacks", value="snacks"),
    ])
    async def food(self, interaction: discord.Interaction, section: app_commands.Choice[str] | None = None):
        icon = {"food": "🍕", "drinks": "☕", "snacks": "🍪"}.get(section.value if section else "food", "🍕")
        embed = utils.base_embed(
            f"{icon} Muragoods — {section.name if section else 'Menu'}",
            "Browse and order from the full menu on Muragoods.")
        embed.add_field(name="How it works", value=(
            "Points earned on the site and here can be spent in the Muragoods hub.\n"
            "Tap the buttons below to open the menu."
        ), inline=False)
        await interaction.response.send_message(embed=embed, view=menu_view())

    @app_commands.command(name="letters", description="Send and read letters on Muragoods.")
    async def letters(self, interaction: discord.Interaction):
        embed = utils.base_embed(
            "💌 Letters",
            "Write heartfelt letters and send them to friends through Muragoods.\n"
            "Letters are private between sender and recipient.")
        view = discord.ui.View()
        view.add_item(utils.site_link_button("💌 Open Letters", f"{config.MURASTREAM_URL}/hub", "💌"))
        await interaction.response.send_message(embed=embed, view=view)

    @app_commands.command(name="games", description="Play Muragoods games (Mystery Box & more).")
    async def games(self, interaction: discord.Interaction):
        embed = utils.base_embed(
            "🎮 Games",
            "Mystery Box, Untold Words and more — play on Muragoods and earn points.")
        embed.add_field(name="🎮 Mystery Box", value="Spend coins, win prizes — on the site.", inline=True)
        view = discord.ui.View()
        view.add_item(utils.site_link_button("🎮 Play now", f"{config.MURASTREAM_URL}/play/mysterybox", "🎮"))
        view.add_item(utils.site_link_button("🍔 All games", f"{config.MURASTREAM_URL}/hub", "🍔"))
        await interaction.response.send_message(embed=embed, view=view)

    @app_commands.command(name="points", description="How MuraPoints work.")
    async def points(self, interaction: discord.Interaction):
        remaining = await database.check_cooldown(f"points:{interaction.user.id}", 60)
        if remaining:
            await interaction.response.send_message(
                embed=utils.base_embed("⏳ Already checked recently", f"Try again in {remaining}s."), ephemeral=True)
            return
        embed = utils.base_embed("⭐ MuraPoints", (
            "Earn points through activity and events:\n"
            "• Daily check-ins on the site\n"
            "• Watching content\n"
            "• Community events and games\n\n"
            "Points never expire and can be spent on food, games and rewards."
        ))
        view = discord.ui.View()
        view.add_item(utils.site_link_button("⭐ View my points", f"{config.MURASTREAM_URL}/account/my-space", "⭐"))
        await interaction.response.send_message(embed=embed, view=view)

    @app_commands.command(name="rewards", description="Redeem rewards with your points.")
    async def rewards(self, interaction: discord.Interaction):
        embed = utils.base_embed("🎁 Rewards", (
            "Redeem your points on Muragoods:\n"
            "🍪 Snacks • 🍕 Food • 🎮 Game plays • 🎁 Mystery Boxes"
        ))
        view = discord.ui.View()
        view.add_item(utils.site_link_button("🎁 Redeem now", f"{config.MURASTREAM_URL}/hub", "🎁"))
        await interaction.response.send_message(embed=embed, view=view)


async def setup(bot: commands.Bot):
    await bot.add_cog(MuragoodsCog(bot))
