"""Fun commands — polished embeds, zero external dependencies."""

import logging
import random
import time

import discord
from discord import app_commands
from discord.ext import commands

import embeds

log = logging.getLogger("bot.fun")

EIGHT_BALL = [
    "It is certain.", "It is decidedly so.", "Without a doubt.", "Yes — definitely.",
    "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.",
    "Yes.", "Signs point to yes.", "Reply hazy — try again.", "Ask again later.",
    "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.",
    "Don't count on it.", "My reply is no.", "My sources say no.",
    "Outlook not so good.", "Very doubtful.",
]


class FunCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(name="8ball", description="Ask the magic 8-ball.")
    @app_commands.describe(question="Your yes/no question")
    async def eight_ball(self, interaction: discord.Interaction, question: str):
        e = embeds.embed("🎱 Magic 8-Ball", color=embeds.INFO)
        e.add_field(name="Question", value=question[:200], inline=False)
        e.add_field(name="Answer", value=f"**{random.choice(EIGHT_BALL)}**", inline=False)
        e.set_thumbnail(url="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3b1.png")
        await interaction.response.send_message(embed=e)

    @app_commands.command(name="coinflip", description="Flip a coin.")
    async def coinflip(self, interaction: discord.Interaction):
        result = random.choice(["Heads", "Tails"])
        emoji = "🪙" if result == "Heads" else "🌑"
        await interaction.response.send_message(embed=embeds.embed(
            "🪙 Coin Flip", f"{emoji} **{result}**!", embeds.GOLD))

    @app_commands.command(name="roll", description="Roll dice (e.g. 2d20, d6).")
    @app_commands.describe(dice="Dice notation like 2d20 or d6")
    async def roll(self, interaction: discord.Interaction, dice: str = "d20"):
        dice = dice.lower().strip()
        try:
            count, sides = (dice.split("d") + [""])[:2]
            count = int(count) if count else 1
            sides = int(sides)
            if not 1 <= count <= 25 or not 2 <= sides <= 1000:
                raise ValueError
        except ValueError:
            await interaction.response.send_message(
                "Use dice notation like `2d20` or `d6`.", ephemeral=True)
            return
        rolls = [random.randint(1, sides) for _ in range(count)]
        total = sum(rolls)
        detail = ", ".join(str(r) for r in rolls) if count > 1 else ""
        e = embeds.embed("🎲 Roll", color=embeds.INFO)
        e.add_field(name="Dice", value=f"{count}d{sides}", inline=True)
        e.add_field(name="Total", value=f"**{total}**", inline=True)
        if detail:
            e.add_field(name="Rolls", value=detail[:300], inline=False)
        await interaction.response.send_message(embed=e)

    @app_commands.command(name="choose", description="Let the bot choose between options.")
    @app_commands.describe(options="Options separated by commas")
    async def choose(self, interaction: discord.Interaction, options: str):
        parts = [p.strip() for p in options.split(",") if p.strip()]
        if len(parts) < 2:
            await interaction.response.send_message("Give me at least two options.", ephemeral=True)
            return
        pick = random.choice(parts)
        await interaction.response.send_message(embed=embeds.embed(
            "🤔 I choose…", f"**{pick[:200]}**", embeds.GOLD))

    @app_commands.command(name="poll", description="Create a reaction poll.")
    @app_commands.describe(question="Poll question", options="Optional comma-separated options (else 👍/👎)")
    async def poll(self, interaction: discord.Interaction, question: str, options: str | None = None):
        await interaction.response.send_message(embed=embeds.embed(
            "📊 Poll", f"**{question[:250]}**", embeds.INFO))
        msg = await interaction.original_response()
        if options:
            parts = [p.strip() for p in options.split(",") if p.strip()][:10]
            emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"]
            body = "\n".join(f"{emojis[i]} {p[:60]}" for i, p in enumerate(parts))
            e = embeds.embed("📊 Poll", f"**{question[:200]}**\n\n{body}", embeds.INFO)
            await msg.edit(embed=e)
            for i in range(len(parts)):
                await msg.add_reaction(emojis[i])
        else:
            await msg.add_reaction("👍")
            await msg.add_reaction("👎")

    @app_commands.command(name="avatar", description="Show a user's avatar.")
    @app_commands.describe(user="Whose avatar (default: you)")
    async def avatar(self, interaction: discord.Interaction, user: discord.User | None = None):
        target = user or interaction.user
        e = embeds.embed(f"🖼️ {target.display_name}'s avatar", color=embeds.INFO)
        e.set_image(url=target.display_avatar.url)
        await interaction.response.send_message(embed=e)

    @app_commands.command(name="userinfo", description="Info about a user.")
    @app_commands.describe(user="Whose info (default: you)")
    async def userinfo(self, interaction: discord.Interaction, user: discord.User | None = None):
        target = user or interaction.user
        member = interaction.guild.get_member(target.id) if interaction.guild else None
        e = embeds.embed("👤 User Info", color=embeds.GOLD)
        e.set_thumbnail(url=target.display_avatar.url)
        e.add_field(name="Username", value=str(target), inline=True)
        e.add_field(name="ID", value=f"`{target.id}`", inline=True)
        if member:
            e.add_field(name="Joined server",
                        value=f"<t:{int(member.joined_at.timestamp())}:R>" if member.joined_at else "—",
                        inline=True)
        e.add_field(name="Account created",
                    value=f"<t:{int(target.created_at.timestamp())}:R>", inline=True)
        if member and member.roles[1:]:
            top_roles = list(reversed(member.roles[1:]))[:15]
            roles = " ".join(r.mention for r in top_roles)
            e.add_field(name=f"Roles ({len(member.roles)-1})", value=roles[:1024], inline=False)
        await interaction.response.send_message(embed=e)

    @app_commands.command(name="serverinfo", description="Info about this server.")
    async def serverinfo(self, interaction: discord.Interaction):
        g = interaction.guild
        if not g:
            await interaction.response.send_message("Server-only command.", ephemeral=True)
            return
        e = embeds.embed(f"🏰 {g.name}", color=embeds.GOLD)
        if g.icon:
            e.set_thumbnail(url=g.icon.url)
        e.add_field(name="Members", value=str(g.member_count), inline=True)
        e.add_field(name="Channels", value=str(len(g.channels)), inline=True)
        e.add_field(name="Roles", value=str(len(g.roles)), inline=True)
        e.add_field(name="Owner", value=f"<@{g.owner_id}>" if g.owner_id else "—", inline=True)
        e.add_field(name="Created", value=f"<t:{int(g.created_at.timestamp())}:D>", inline=True)
        e.add_field(name="Boost level", value=str(g.premium_tier), inline=True)
        await interaction.response.send_message(embed=e)


async def setup(bot: commands.Bot):
    await bot.add_cog(FunCog(bot))
