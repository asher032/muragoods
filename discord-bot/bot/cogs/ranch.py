"""Pets, farming and fishing — short top-level groups.

`/pets` (adopt, raise, bond), `/farm` (crops, planting, harvests),
`/fish` (spots, bait, buckets). All timers use database timestamps,
never client time. Bonuses never stack (strongest per stat wins).
"""

import logging
from datetime import datetime, timezone

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds

log = logging.getLogger("bot.ranch")


class RanchGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    pets = app_commands.Group(name="pets", description="Adopt, raise and bond with pets")
    farm = app_commands.Group(name="farm", description="Crops, planting and harvests")
    fish = app_commands.Group(name="fish", description="Fishing, equipment and buckets")

    # ── Pets ──
    @pets.command(name="view", description="Display owned pets and stats.")
    async def pets_view(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            pets = await database._db.economy_pets.find(
                {"guildId": int(interaction.guild.id), "userId": interaction.user.id}).to_list(10)
        except Exception:
            pets = []
        if not pets:
            lines = [f"• **{v['name']}** (`{s}`, {v['rarity']}) — {eco.PET_ADOPT_COST.get(s, 500)} coins"
                     for s, v in eco.PET_SPECIES.items()]
            await interaction.followup.send(embed=embeds.embed(
                "🐾 Adopt a pet", "Adopt with `/pets adopt`:\n" + "\n".join(lines),
                embeds.INFO), ephemeral=True)
            return
        lines = []
        for p in pets:
            spec = eco.PET_SPECIES.get(str(p.get("species")), {})
            bonus = ", ".join(f"+{int(v * 100)}% {k}" for k, v in (spec.get("bonus") or {}).items()) or "no bonus"
            eq = " ⭐" if p.get("equipped") else ""
            lines.append(f"**{p.get('name')}**{eq} ({spec.get('name', '?')}) "
                         f"Lv{int(p.get('level', 1))} · ❤{int(p.get('happiness', 0))} · {bonus}")
        await interaction.followup.send(embed=embeds.embed(
            "🐾 Your Pets", "\n".join(lines) + "\n\nStrongest bonus per stat applies.",
            embeds.INFO), ephemeral=True)

    @pets.command(name="care", description="Interact with / care for pets.")
    async def pets_care(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.care_pet(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send(
            "🐾 Pets cared for! Happiness restored." if ok else msg, ephemeral=True)

    @pets.command(name="adopt", description="Adopt a pet (costs coins).")
    @app_commands.describe(species="Species to adopt", name="Pet name")
    @app_commands.choices(species=[
        app_commands.Choice(name="Slime (300)", value="slime"),
        app_commands.Choice(name="Owl (800)", value="owl"),
        app_commands.Choice(name="Fox (2000)", value="fox"),
        app_commands.Choice(name="Dragon (8000)", value="dragon"),
    ])
    async def pets_adopt(self, interaction: discord.Interaction, species: str, name: str = ""):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.pet_adopt(
            database._db, interaction.guild.id, interaction.user.id, species, name or species)
        await interaction.followup.send(
            f"🐾 Adopted **{(name or species)[:30]}** the {species}!" if ok else f"⚠️ {msg}",
            ephemeral=True)

    @pets.command(name="rename", description="Rename a pet.")
    @app_commands.describe(name="Current pet name", new_name="New name")
    async def pets_rename(self, interaction: discord.Interaction, name: str, new_name: str):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.pet_rename(
            database._db, interaction.guild.id, interaction.user.id, name, new_name)
        await interaction.followup.send("✏️ Renamed!" if ok else f"⚠️ {msg}", ephemeral=True)

    @pets.command(name="equip", description="Equip a pet (its bonus is highlighted).")
    @app_commands.describe(name="Pet name")
    async def pets_equip(self, interaction: discord.Interaction, name: str):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.pet_equip(database._db, interaction.guild.id, interaction.user.id, name)
        await interaction.followup.send("⭐ Equipped!" if ok else f"⚠️ {msg}", ephemeral=True)

    @pets.command(name="unequip", description="Unequip all pets.")
    async def pets_unequip(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            await database._db.economy_pets.update_many(
                {"guildId": int(interaction.guild.id), "userId": interaction.user.id},
                {"$set": {"equipped": False}})
        except Exception:
            pass
        await interaction.followup.send("Unequipped.", ephemeral=True)

    @pets.command(name="feed", description="Feed pets (costs coins, +happiness/XP).")
    async def pets_feed(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.pet_feed_play(database._db, interaction.guild.id, interaction.user.id, "feed")
        await interaction.followup.send("🍖 Pets fed!" if ok else f"⚠️ {msg}", ephemeral=True)

    @pets.command(name="play", description="Play with pets (costs coins, +happiness/XP).")
    async def pets_play(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.pet_feed_play(database._db, interaction.guild.id, interaction.user.id, "play")
        await interaction.followup.send("🧸 Playtime!" if ok else f"⚠️ {msg}", ephemeral=True)

    @pets.command(name="release", description="Release a pet (irreversible).")
    @app_commands.describe(name="Pet name")
    async def pets_release(self, interaction: discord.Interaction, name: str):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.pet_release(database._db, interaction.guild.id, interaction.user.id, name)
        await interaction.followup.send("🌿 Released." if ok else f"⚠️ {msg}", ephemeral=True)

    # ── Farm ──
    @farm.command(name="view", description="View and manage farms.")
    async def farm_view(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        state = await eco.farm_state(database._db, interaction.guild.id, interaction.user.id)
        now = datetime.now(timezone.utc)
        lines = [f"Plots **{len(state['plots'])}/{state['maxPlots']}** · Level **{state['level']}**"]
        for plot in state["plots"]:
            crop = eco.CROPS.get(plot.get("crop"), {})
            ready = plot.get("readyAt")
            if isinstance(ready, datetime):
                if ready.tzinfo is None:
                    ready = ready.replace(tzinfo=timezone.utc)
                left = int((ready - now).total_seconds())
                lines.append(f"• {crop.get('name', '?')}: "
                             f"{'✅ ripe — `/farm store harvest`' if left <= 0 else f'{left // 60}m left'}")
        lines.append("Crops: " + ", ".join(
            f"{v['name']} (`{k}`, {v['growSec'] // 3600}h, +{v['reward']})"
            for k, v in eco.CROPS.items()))
        lines.append("Expand with a **Farm Plot Deed** from `/shop view`.")
        await interaction.followup.send(embed=embeds.embed(
            "🌾 Farm", "\n".join(lines), embeds.INFO), ephemeral=True)

    @farm.command(name="store", description="Plant, harvest and manage the farm store.")
    @app_commands.describe(action="plant, harvest or info", crop="Crop ID for plant")
    @app_commands.choices(action=[
        app_commands.Choice(name="plant", value="plant"),
        app_commands.Choice(name="harvest", value="harvest"),
        app_commands.Choice(name="info", value="info"),
    ])
    async def farm_store(self, interaction: discord.Interaction, action: str, crop: str = "wheat"):
        await interaction.response.defer(ephemeral=True)
        if action == "harvest":
            total, count = await eco.farm_harvest(
                database._db, interaction.guild.id, interaction.user.id)
            await eco.session_track(database._db, interaction.guild.id,
                                    interaction.user.id, earned=total)
            await interaction.followup.send(
                f"🌾 Harvested **{count}** for **{total}** coins!" if count else "Nothing ripe yet.",
                ephemeral=True)
            return
        if action == "info":
            await interaction.followup.send(embed=embeds.embed(
                "🌾 Farm store",
                "• Plant: `/farm store plant crop:<id>`\n• Harvest: `/farm store harvest`\n"
                "• Extra plots: buy **Farm Plot Deed** via `/shop view`\n"
                "• Speed Fertilizer halves current timers (use via `/inventory use`).",
                embeds.INFO), ephemeral=True)
            return
        ok, msg = await eco.farm_plant(
            database._db, interaction.guild.id, interaction.user.id, (crop or "").strip().lower())
        await interaction.followup.send(
            f"🌱 Planted **{crop}**!" if ok else f"⚠️ {msg}", ephemeral=True)

    # ── Fish ──
    @fish.command(name="catch", description="Catch fish (rods, spots and bait help).")
    @app_commands.describe(spot="Where to fish", bait="Bait to use")
    @app_commands.choices(
        spot=[app_commands.Choice(name=v["name"], value=k) for k, v in eco.FISH_SPOTS.items()],
        bait=[app_commands.Choice(name="No bait", value="none"),
              app_commands.Choice(name="Bread Crumb (10)", value="crumb"),
              app_commands.Choice(name="Glow Grub (60)", value="glow_grub"),
              app_commands.Choice(name="Moon Minnow (200)", value="moon_minnow")],
    )
    async def fish_catch(self, interaction: discord.Interaction, spot: str = "pond", bait: str = "none"):
        await interaction.response.defer()
        gid, uid = interaction.guild.id, interaction.user.id
        cfg = await eco.get_economy_config(database._db, gid)
        granted, _ = await eco.claim_cooldown(
            database._db, gid, uid, "lastFish", int(cfg.get("activityCooldownSec", 600)))
        if not granted:
            await interaction.followup.send("The water needs time to settle.", ephemeral=True)
            return
        spot_spec = eco.FISH_SPOTS.get(spot or "pond", eco.FISH_SPOTS["pond"])
        if spot_spec.get("needs"):
            inv = await eco.get_inventory(database._db, gid, uid)
            if inv.get(spot_spec["needs"], 0) < 1:
                await interaction.followup.send(
                    f"The {spot_spec['name']} needs a **{eco.ITEMS[spot_spec['needs']]['name']}**.",
                    ephemeral=True)
                return
        bait_mult = 1.0
        if bait and bait != "none" and bait in eco.BAITS:
            price = int(eco.BAITS[bait]["price"])
            ok, _ = await eco.apply_delta(database._db, gid, uid, "balance", -price,
                                          "bait_cost", "discord")
            if ok:
                bait_mult = 1.0 + float(eco.BAITS[bait]["luck"])
        name, rarity, value = await eco.fish_catch(database._db, gid, uid)
        value = int(value * float(spot_spec.get("bonus", 1.0)) * bait_mult)
        await eco.session_track(database._db, gid, uid, earned=0, items=1)
        await eco.check_economy_achievements(database._db, gid, uid)
        await interaction.followup.send(embed=embeds.embed(
            "🎣 Catch!",
            f"**{name}** *({rarity})* at **{spot_spec['name']}** — "
            f"bucketed (value **{value}**).", embeds.INFO))

    @fish.command(name="buckets", description="Manage caught fish and sell them.")
    @app_commands.describe(action="view or sell")
    @app_commands.choices(action=[
        app_commands.Choice(name="view", value="view"),
        app_commands.Choice(name="sell", value="sell"),
    ])
    async def fish_buckets(self, interaction: discord.Interaction, action: str = "view"):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        wallet = await eco.get_wallet(database._db, gid, uid)
        count = int(wallet.get("fishBuckets", 0))
        inv = await eco.get_inventory(database._db, gid, uid)
        gear = [f"{eco.ITEMS[i]['name']} x{q}" for i, q in inv.items()
                if i in ("fishing_rod", "golden_hook") and q > 0]
        spots = ", ".join(v["name"] for v in eco.FISH_SPOTS.values())
        if action == "sell":
            if count <= 0:
                await interaction.followup.send("Bucket is empty.", ephemeral=True)
                return
            gain = count * 20
            try:
                res = await database._db.economy.update_one(
                    {"guildId": int(gid), "userId": int(uid), "fishBuckets": {"$gte": count}},
                    {"$set": {"fishBuckets": 0}, "$inc": {"balance": gain}})
                if not res.modified_count:
                    await interaction.followup.send("Bucket changed — try again.", ephemeral=True)
                    return
            except Exception:
                await interaction.followup.send("Could not sell right now.", ephemeral=True)
                return
            await eco.record_txn(database._db, gid, uid, "fish_sell", gain, "discord")
            await eco.session_track(database._db, gid, uid, earned=gain)
            await interaction.followup.send(
                f"🪣 Sold **{count}** fish for **{gain}**!", ephemeral=True)
            return
        extra = f"\nGear: {', '.join(gear)}" if gear else "\nGear: none (buy a rod via `/shop view`)"
        await interaction.followup.send(
            f"🪣 Bucketed: **{count}** (20 each).\nSpots: {spots}.{extra}",
            ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(RanchGroup(bot))
