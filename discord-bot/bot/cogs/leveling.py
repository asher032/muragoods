"""Leveling + economy — XP from chat, per-guild isolation, Mongo-backed."""

import logging
import random
import time
from datetime import datetime, timezone

import discord
from discord import app_commands
from discord.ext import commands

import database
import embeds

log = logging.getLogger("bot.leveling")

LEVEL_ROLES = [(5, "🎖️ Regular"), (10, "⭐ Active"), (25, "🌟 Hyper"), (50, "💎 Veteran")]
XP_COOLDOWN = 60  # seconds per message XP grant
DAILY_COOLDOWN = 86400


async def add_xp(guild_id: int, user_id: int, amount: int) -> tuple[int, int]:
    """Add XP; returns (xp, level). Level = sqrt-based curve."""
    doc = await database._db.xp.find_one_and_update(
        {"guildId": guild_id, "userId": user_id},
        {"$inc": {"xp": amount}, "$set": {"lastXp": datetime.now(timezone.utc)}},
        upsert=True, return_document=True,
    )
    xp = doc["xp"]
    level = int((xp / 100) ** 0.5)
    return xp, level


class LevelingCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._xp_bucket: dict[tuple[int, int], float] = {}

    @commands.Cog.listener()
    async def on_message(self, message: discord.Message):
        if message.author.bot or not message.guild:
            return
        key = (message.guild.id, message.author.id)
        now = time.monotonic()
        if now - self._xp_bucket.get(key, 0) < XP_COOLDOWN:
            return
        self._xp_bucket[key] = now
        try:
            old_level = (await database._db.xp.find_one(
                {"guildId": message.guild.id, "userId": message.author.id}) or {}).get("xp", 0)
            _, level = await add_xp(message.guild.id, message.author.id, random.randint(10, 25))
            if level > int((old_level / 100) ** 0.5):
                role_name = next((r for lv, r in LEVEL_ROLES if lv == level), None)
                e = embeds.embed("🎉 Level Up!",
                                 f"{message.author.mention} reached **Level {level}**!"
                                 + (f"\nNew title: **{role_name}**" if role_name else ""),
                                 color=embeds.GOLD)
                try:
                    await message.channel.send(embed=e)
                except discord.HTTPException:
                    pass
        except Exception:
            log.exception("XP grant failed")

    @app_commands.command(name="rank", description="Your level and XP in this server.")
    @app_commands.describe(user="Whose rank (default: you)")
    async def rank(self, interaction: discord.Interaction, user: discord.User | None = None):
        await interaction.response.defer()
        target = user or interaction.user
        doc = await database._db.xp.find_one(
            {"guildId": interaction.guild.id, "userId": target.id})
        xp = doc["xp"] if doc else 0
        level = int((xp / 100) ** 0.5)
        next_level_xp = (level + 1) ** 2 * 100
        title = next((r for lv, r in reversed(LEVEL_ROLES) if level >= lv), "🌱 Newcomer")
        e = embeds.embed(f"📊 {target.display_name}'s Rank",
                         f"**Level {level}** — {title}", color=embeds.INFO)
        e.add_field(name="XP", value=f"{xp} / {next_level_xp}", inline=True)
        e.add_field(name="Progress",
                    value=embeds.bar(xp, next_level_xp, width=10), inline=False)
        if target.display_avatar:
            e.set_thumbnail(url=target.display_avatar.url)
        await interaction.followup.send(embed=e)

    @app_commands.command(name="leaderboard", description="Top members by XP.")
    async def leaderboard(self, interaction: discord.Interaction):
        await interaction.response.defer()
        docs = await database._db.xp.find({"guildId": interaction.guild.id}) \
            .sort("xp", -1).to_list(10)
        if not docs:
            await interaction.followup.send("No XP earned yet — start chatting!")
            return
        medals = ["🥇", "🥈", "🥉"] + ["▫️"] * 7
        lines = []
        for i, d in enumerate(docs):
            level = int((d["xp"] / 100) ** 0.5)
            lines.append(f"{medals[i]} <@{d['userId']}> — **Level {level}** ({d['xp']} XP)")
        await interaction.followup.send(embed=embeds.embed(
            "🏆 Leaderboard", "\n".join(lines), embeds.GOLD))

    # ── Economy ───────────────────────────────────────────────────────
    async def _wallet(self, guild_id: int, user_id: int) -> dict:
        return await database._db.economy.find_one_and_update(
            {"guildId": guild_id, "userId": user_id},
            {"$setOnInsert": {"balance": 100}}, upsert=True, return_document=True,
        )

    @app_commands.command(name="balance", description="Your coin balance.")
    async def balance(self, interaction: discord.Interaction):
        wallet = await self._wallet(interaction.guild.id, interaction.user.id)
        await interaction.response.send_message(embed=embeds.embed(
            "💰 Balance", f"{interaction.user.mention} has **{wallet['balance']}** coins.",
            embeds.GOLD))

    @app_commands.command(name="daily", description="Claim your daily coins.")
    async def daily(self, interaction: discord.Interaction):
        await interaction.response.defer()
        now = datetime.now(timezone.utc)
        doc = await database._db.economy.find_one_and_update(
            {"guildId": interaction.guild.id, "userId": interaction.user.id,
             "lastDaily": {"$lt": now.replace(microsecond=0) - __import__('datetime').timedelta(hours=24)}},
            {"$inc": {"balance": 250}, "$set": {"lastDaily": now}},
            upsert=True, return_document=True,
        )
        if doc.get("lastDaily") == now:
            await interaction.followup.send(embed=embeds.ok(
                "🎁 Daily claimed!", "+**250** coins — come back tomorrow."))
        else:
            # Fallback: already claimed recently (filter didn't match).
            await interaction.followup.send(embed=embeds.embed(
                "⏳ Already claimed", "Your daily coins reset every 24 hours.", embeds.WARN))

    @app_commands.command(name="pay", description="Send coins to another member.")
    @app_commands.describe(user="Recipient", amount="How many coins")
    async def pay(self, interaction: discord.Interaction, user: discord.Member, amount: int):
        await interaction.response.defer()
        if amount < 1:
            await interaction.followup.send("Amount must be positive.", ephemeral=True)
            return
        if user.id == interaction.user.id:
            await interaction.followup.send("You can't pay yourself.", ephemeral=True)
            return
        sender = await database._db.economy.find_one(
            {"guildId": interaction.guild.id, "userId": interaction.user.id})
        if not sender or sender.get("balance", 0) < amount:
            await interaction.followup.send("Insufficient funds.", ephemeral=True)
            return
        await database._db.economy.update_one(
            {"guildId": interaction.guild.id, "userId": interaction.user.id},
            {"$inc": {"balance": -amount}})
        await database._db.economy.update_one(
            {"guildId": interaction.guild.id, "userId": user.id},
            {"$inc": {"balance": amount}}, upsert=True)
        await interaction.followup.send(embed=embeds.ok(
            "💸 Payment sent", f"{interaction.user.mention} → {user.mention}: **{amount}** coins."))

    @app_commands.command(name="shop", description="Browse the coin shop.")
    async def shop(self, interaction: discord.Interaction):
        e = embeds.embed("🛒 Server Shop", "Spend your coins!", embeds.GOLD)
        e.add_field(name="🎟️ Mystery Box key", value="500 coins — /buy mystery", inline=False)
        e.add_field(name="✨ Custom role color", value="1,500 coins — /buy color", inline=False)
        e.add_field(name="🎰 Bonus daily roll", value="300 coins — /buy dailyroll", inline=False)
        e.set_footer(text="Purchases are tracked per server • MuraStream")
        await interaction.response.send_message(embed=e)


async def setup(bot: commands.Bot):
    await bot.add_cog(LevelingCog(bot))
