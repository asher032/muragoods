"""`/ranch` group — pets, farming and fishing with nested subgroups.

Subcommands do not consume top-level slash budget (only `/ranch` counts).
All timers use database timestamps, never client time.
"""

import logging
import random

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds
import utils

log = logging.getLogger("bot.ranch")


class RanchGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    ranch = app_commands.Group(name="ranch", description="Pets, farming and fishing")
    pets = app_commands.Group(name="pets", description="Adopt and care for pets", parent=ranch)
    farm = app_commands.Group(name="farm", description="Plots, crops and harvests", parent=ranch)
    fish = app_commands.Group(name="fish", description="Catch and buckets", parent=ranch)

    # ── Pets ──
    @pets.command(name="view", description="View your pets and their bonuses.")
    async def pets_view(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            pets = await database._db.economy_pets.find(
                {"guildId": int(interaction.guild.id), "userId": interaction.user.id}).to_list(10)
        except Exception:
            pets = []
        if not pets:
            species = ", ".join(f"{s} ({v['rarity']})" for s, v in eco.PET_SPECIES.items())
            await interaction.followup.send(
                f"No pets yet — species: {species}. Adoption opens with `/ranch pets care` once earned via events.",
                ephemeral=True)
            return
        lines = []
        for pet in pets:
            spec = eco.PET_SPECIES.get(str(pet.get("species")), {})
            bonus = ", ".join(f"+{int(v * 100)}% {k}" for k, v in (spec.get("bonus") or {}).items())
            lines.append(f"**{pet.get('name')}** ({spec.get('rarity', '?')}) "
                         f"Lv{int(pet.get('level', 1))} · ❤{int(pet.get('happiness', 0))} · {bonus}")
        await interaction.followup.send(embed=embeds.embed(
            "🐾 Your Pets", "\n".join(lines) + "\n\nStrongest bonus per stat applies (no stacking).",
            embeds.INFO), ephemeral=True)

    @pets.command(name="care", description="Care for pets (restores happiness, grants XP).")
    async def pets_care(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.care_pet(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send(
            "🐾 Pets cared for! Happiness restored." if ok else msg, ephemeral=True)

    # ── Farm ──
    @farm.command(name="view", description="View plots and crop timers.")
    async def farm_view(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        state = await eco.farm_state(database._db, interaction.guild.id, interaction.user.id)
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        lines = [f"Plots: **{len(state['plots'])}/{state['maxPlots']}** · Level **{state['level']}**"]
        for plot in state["plots"]:
            crop = eco.CROPS.get(plot.get("crop"), {})
            ready = plot.get("readyAt")
            if isinstance(ready, datetime):
                if ready.tzinfo is None:
                    ready = ready.replace(tzinfo=timezone.utc)
                left = int((ready - now).total_seconds())
                lines.append(f"• {crop.get('name', '?')}: "
                             f"{'✅ ripe — harvest with `/ranch farm store`' if left <= 0 else f'{left // 60}m left'}")
        lines.append("Crops: " + ", ".join(
            f"{v['name']} ({v['growSec'] // 3600}h, +{v['reward']})" for v in eco.CROPS.values()))
        await interaction.followup.send(embed=embeds.embed(
            "🌾 Farm", "\n".join(lines), embeds.INFO), ephemeral=True)

    @farm.command(name="store", description="Plant, harvest and manage the farm store.")
    @app_commands.describe(action="plant or harvest", crop="Crop ID for plant")
    @app_commands.choices(action=[
        app_commands.Choice(name="plant", value="plant"),
        app_commands.Choice(name="harvest", value="harvest"),
    ])
    async def farm_store(self, interaction: discord.Interaction, action: str, crop: str = "wheat"):
        await interaction.response.defer(ephemeral=True)
        if action == "harvest":
            total, count = await eco.farm_harvest(database._db, interaction.guild.id, interaction.user.id)
            await interaction.followup.send(
                f"🌾 Harvested **{count}** crops for **{total}** coins!" if count else "Nothing ripe yet.",
                ephemeral=True)
            return
        ok, msg = await eco.farm_plant(
            database._db, interaction.guild.id, interaction.user.id, (crop or "").strip().lower())
        await interaction.followup.send(
            f"🌱 Planted **{crop}**!" if ok else f"⚠️ {msg}", ephemeral=True)

    # ── Fish ──
    @fish.command(name="catch", description="Cast a line (rods improve rarity).")
    async def fish_catch(self, interaction: discord.Interaction):
        await interaction.response.defer()
        name, rarity, value = await eco.fish_catch(
            database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send(embed=embeds.embed(
            "🎣 Catch!",
            f"**{name}** *({rarity})* — bucketed (sell value **{value}**).",
            embeds.INFO))

    @fish.command(name="buckets", description="View and sell bucketed fish.")
    @app_commands.describe(action="view or sell")
    @app_commands.choices(action=[
        app_commands.Choice(name="view", value="view"),
        app_commands.Choice(name="sell", value="sell"),
    ])
    async def fish_buckets(self, interaction: discord.Interaction, action: str = "view"):
        await interaction.response.defer(ephemeral=True)
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        count = int(wallet.get("fishBuckets", 0))
        if action == "sell":
            if count <= 0:
                await interaction.followup.send("Bucket is empty.", ephemeral=True)
                return
            gain = count * 20
            await database._db.economy.update_one(
                {"guildId": int(interaction.guild.id), "userId": interaction.user.id},
                {"$set": {"fishBuckets": 0}, "$inc": {"balance": gain}})
            await eco.record_txn(database._db, interaction.guild.id, interaction.user.id,
                                 "fish_sell", gain, "discord")
            await interaction.followup.send(f"🪣 Sold **{count}** bucketed fish for **{gain}**!", ephemeral=True)
            return
        await interaction.followup.send(f"🪣 Bucketed fish: **{count}** (20 coins each).", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(RanchGroup(bot))
