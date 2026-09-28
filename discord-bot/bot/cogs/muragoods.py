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

    @app_commands.command(name="games", description="Your Muragoods game profile (shared with the site).")
    async def games(self, interaction: discord.Interaction):
        await interaction.response.defer()
        import database
        import siteprofile
        try:
            email = await siteprofile.linked_email(database._db, interaction.user.id)
        except Exception:
            email = None
        if not email:
            e = utils.base_embed(
                "🎮 Games",
                "Link Discord at Muragoods → My Muragoods → Connected Accounts, "
                "then this command shows your shared game profile.")
            view = discord.ui.View()
            view.add_item(utils.site_link_button("🎮 Game Center", f"{config.MURASTREAM_URL}/games", "🎮"))
            await interaction.followup.send(embed=e, view=view)
            return
        try:
            summary = await siteprofile.game_summary(database._db, email)
        except Exception:
            log.exception("games profile read failed")
            await interaction.followup.send("Could not load your game profile right now.", ephemeral=True)
            return
        e = utils.base_embed(
            "🎮 YOUR MURAGOODS GAME PROFILE",
            f"Level **{summary['level']}** · **{summary['totalXp']:,}** XP\n"
            f"🪙 **{summary['coins']:,}** Coins · 🏆 **{len(summary['achievements'])}** Achievements · "
            f"🎯 **{summary['totalPlays']}** Games Played")
        top = summary.get("games") or []
        if top:
            e.add_field(name="Recent games",
                        value="\n".join(f"• **{g['gameId']}** — best {g['bestScore']}, {g['plays']} plays" for g in top[:5]),
                        inline=False)
        if summary.get("favorites"):
            e.add_field(name="❤️ Favorite", value=" · ".join(summary["favorites"][:5]), inline=False)
        view = discord.ui.View()
        view.add_item(utils.site_link_button("🎮 Game Center", f"{config.MURASTREAM_URL}/games", "🎮"))
        await interaction.followup.send(embed=e, view=view)

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

    @app_commands.command(name="rewards", description="Your perks and recent game rewards (shared).")
    async def rewards(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        import database
        import siteprofile
        try:
            ok, data = await siteprofile.rewards_for(database._db, interaction.user.id)
        except Exception:
            log.exception("rewards read failed")
            await interaction.followup.send("Could not load rewards right now.", ephemeral=True)
            return
        if not ok:
            embed = utils.base_embed("🎁 Rewards", (
                "Link Discord at Muragoods → My Muragoods → Connected Accounts to see "
                "your perks and game rewards here.\n\nRedeem points on Muragoods:\n"
                "🍪 Snacks • 🍕 Food • 🎮 Game plays • 🎁 Mystery Boxes"))
            view = discord.ui.View()
            view.add_item(utils.site_link_button("🎁 Redeem now", f"{config.MURASTREAM_URL}/hub", "🎁"))
            await interaction.followup.send(embed=embed, view=view, ephemeral=True)
            return
        lines = [f"🪙 Site coins **{data['coins']:,}**"]
        if data["perks"]:
            lines.append("🎁 Perks: " + ", ".join(data["perks"]))
        for r in data["recent"]:
            lines.append(f"• *{r['kind']}* {r['amount']:+} — {r['label']}")
        embed = utils.base_embed("🎁 Your Rewards", "\n".join(lines) or "No rewards yet — play in the Game Center!")
        view = discord.ui.View()
        view.add_item(utils.site_link_button("🎮 Game Center", f"{config.MURASTREAM_URL}/games", "🎮"))
        await interaction.followup.send(embed=embed, view=view, ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(MuragoodsCog(bot))
