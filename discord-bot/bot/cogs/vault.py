"""Murabot Economy vault — ONE top-level `/vault` group (original code).

The repo already sits at 99/100 global slash commands, so every system
below lives under a single `/vault` group (subcommands cost no extra
top-level budget): profile, showcase, skins, pets, farm, fish, friends,
lottery, leaderboards, events, trade, multipliers, advancements,
currencylog, vacation, badges, titles, collections, work and more.
All state goes through the canonical engine (bot/economy.py): atomic
transactions, guarded cooldowns, idempotent rewards. Every handler
acknowledges first (never stuck on Thinking...).
"""

import logging
import random
from datetime import datetime, timezone

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds

log = logging.getLogger("bot.vault")


# ── Shared helpers ────────────────────────────────────────────────────
async def _cfg(gid: int) -> dict:
    try:
        return await eco.get_economy_config(database._db, gid)
    except Exception:
        return dict(eco.ECONOMY_DEFAULTS)


def _fmt_remaining(sec: int) -> str:
    h, r = divmod(max(0, sec), 3600)
    return f"{h}h {r // 60}m" if h else f"{r // 60}m {r % 60}s"


class PageView(discord.ui.View):
    """Prev/Next pagination with owner check + timeout disable."""

    def __init__(self, owner_id: int, page: int, total: int, render):
        super().__init__(timeout=180.0)
        self.owner_id = owner_id
        self.page = page
        self.total = max(1, total)
        self._render = render

    async def on_timeout(self) -> None:
        for c in self.children:
            try:
                c.disabled = True
            except Exception:
                pass
        try:
            if hasattr(self, "message") and self.message is not None:
                await self.message.edit(view=self)
        except Exception:
            pass

    async def _move(self, interaction: discord.Interaction, delta: int):
        if interaction.user.id != self.owner_id:
            try:
                await interaction.response.send_message(
                    "This menu belongs to another user.", ephemeral=True)
            except Exception:
                pass
            return
        self.page = max(0, min(self.total - 1, self.page + delta))
        embed = await self._render(self.page)
        try:
            if not interaction.response.is_done():
                await interaction.response.edit_message(embed=embed, view=self)
            else:
                await interaction.edit_original_response(embed=embed, view=self)
        except discord.HTTPException:
            pass

    @discord.ui.button(label="◀ Previous", style=discord.ButtonStyle.secondary,
                       custom_id="vault:page:prev")
    async def prev(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._move(interaction, -1)

    @discord.ui.button(label="Next ▶", style=discord.ButtonStyle.secondary,
                       custom_id="vault:page:next")
    async def next(self, interaction: discord.Interaction, button: discord.ui.Button):
        await self._move(interaction, 1)


# ══════════════════════════════════════════════════════════════════════
# 👤 PROFILE + COMPARE
# ══════════════════════════════════════════════════════════════════════


class Vault(commands.Cog):
    """Single-cog home for /vault (one top-level slot for ~40 features)."""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    vault = app_commands.Group(
        name="vault", description="Murabot economy: profile, pets, farm, fish, trade, events")

    showcase = app_commands.Group(name="showcase", description="Cosmetic item showcase", parent=vault)
    skins = app_commands.Group(name="skins", description="Cosmetic item skins", parent=vault)
    pets = app_commands.Group(name="pets", description="Adopt, raise and bond with pets", parent=vault)
    farm = app_commands.Group(name="farm", description="Crops, planting and harvests", parent=vault)
    fish = app_commands.Group(name="fish", description="Fishing, equipment and buckets", parent=vault)
    friends = app_commands.Group(name="friends", description="In-game friendship system", parent=vault)
    lottery = app_commands.Group(name="lottery", description="In-game lottery (coins only)", parent=vault)
    leaderboards = app_commands.Group(name="leaderboards", description="Economy leaderboards", parent=vault)
    serverevents = app_commands.Group(name="serverevents", description="Server-wide donation events", parent=vault)
    notifications = app_commands.Group(name="notifications", description="Economy notifications", parent=vault)
    trade = app_commands.Group(name="trade", description="Secure item/currency trading", parent=vault)
    advancements = app_commands.Group(name="advancements", description="Prestige and Omega", parent=vault)
    badges = app_commands.Group(name="badges", description="Unlockable profile badges", parent=vault)
    title = app_commands.Group(name="title", description="Profile titles", parent=vault)
    work = app_commands.Group(name="work", description="Work shifts and stars", parent=vault)

    # NOTE: top-level /profile belongs to MuraStream (movie profile).
    # The economy profile lives here as /gameprofile (+ /identity view).
    @vault.command(name="profile", description="Full Murabot economy profile.")
    @app_commands.describe(user="Whose profile (default: you)")
    async def v_profile(self, interaction: discord.Interaction, user: discord.User | None = None):
        await interaction.response.defer()
        target = user or interaction.user
        gid = interaction.guild.id
        try:
            wallet = await eco.get_wallet(database._db, gid, target.id)
            cfg = await _cfg(gid)
            sym = str(cfg.get("currencySymbol", "🪙"))
            inv = await eco.get_inventory(database._db, gid, target.id)
            progress = await eco.quest_progress(database._db, gid, target.id)
            await eco.check_economy_achievements(database._db, gid, target.id)
            try:
                achv = await database._db.economy_achv.find_one(
                    {"guildId": int(gid), "userId": int(target.id)}) or {}
                achv_n = len(achv.get("done") or [])
            except Exception:
                achv_n = 0
            try:
                prof = await database._db.economy_profile.find_one(
                    {"guildId": int(gid), "userId": int(target.id)}) or {}
                title = str(prof.get("title") or "Newcomer")
                badges = list(prof.get("badges") or [])[:5]
            except Exception:
                title, badges = "Newcomer", []
            try:
                showcase = await eco.showcase_get(database._db, gid, target.id)
            except Exception:
                showcase = {"slots": []}
            try:
                pets = await database._db.economy_pets.find(
                    {"guildId": int(gid), "userId": int(target.id)}).to_list(5)
            except Exception:
                pets = []
            mult = await eco.active_multipliers(database._db, gid, target.id)
            e = embeds.embed(f"👤 {getattr(target, 'display_name', target.name)}",
                             f"**{title}**", embeds.INFO)
            try:
                if target.display_avatar:
                    e.set_thumbnail(url=target.display_avatar.url)
            except Exception:
                pass
            e.add_field(name="Balance",
                        value=f"{sym} **{int(wallet.get('balance', 0)):,}** pocket\n"
                              f"🏦 **{int(wallet.get('bank', 0)):,}** bank\n"
                              f"📊 Net **{eco.net_worth(wallet):,}** · 💎 **{int(wallet.get('gems', 0))}**",
                        inline=True)
            e.add_field(name="Progression",
                        value=f"Level **{eco.economy_level(wallet)}** · 🔥 **{int(wallet.get('prestige', 0))}** · "
                              f"🌀 **{int(wallet.get('omega', 0))}**\n"
                              f"Streak **{int(wallet.get('streakDaily', 0))}** · "
                              f"Activities **{progress.get('activities', 0)}**",
                        inline=True)
            e.add_field(name="Collections",
                        value=f"Items **{sum(1 for q in inv.values() if q > 0)}** · "
                              f"Achievements **{achv_n}/{len(eco.ACHIEVEMENTS_FULL)}**"
                              + (f"\nBadges: {' '.join(badges)}" if badges else ""),
                        inline=False)
            if showcase.get("slots"):
                names = [eco.ITEMS.get(i, {}).get("name", i) for i in showcase["slots"][:9]]
                e.add_field(name="🖼️ Showcase", value=", ".join(names), inline=False)
            if pets:
                e.add_field(name="🐾 Pets",
                            value=", ".join(f"**{p.get('name')}** Lv{int(p.get('level', 1))}" for p in pets[:5]),
                            inline=False)
            e.add_field(name="✨ Multipliers",
                        value=f"Coins x{mult['coins']} · XP x{mult['xp']} · Luck x{mult['luck']}",
                        inline=False)
            await interaction.followup.send(embed=e)
        except Exception:
            log.exception("profile failed")
            await interaction.followup.send("Could not load that profile.", ephemeral=True)

    @vault.command(name="compare", description="Compare two economy profiles (public stats only).")
    @app_commands.describe(user="Who to compare yourself against")
    async def v_compare(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer()
        if user.id == interaction.user.id or user.bot:
            await interaction.followup.send("Pick another member.", ephemeral=True)
            return
        try:
            data = await eco.compare_users(
                database._db, interaction.guild.id, interaction.user.id, user.id)
            me = data[str(int(interaction.user.id))]
            them = data[str(int(user.id))]
            rows = []
            for label, k in [("Net worth", "net"), ("Pocket", "pocket"), ("Bank", "bank"),
                             ("Gems", "gems"), ("Level", "level"), ("Items", "items"),
                             ("Activities", "activities"), ("Streak", "streak")]:
                a, b = me[k], them[k]
                mark = "🟰" if a == b else ("🟩" if a > b else "🟥")
                rows.append(f"{mark} **{label}**: you **{a:,}** vs them **{b:,}**")
            await interaction.followup.send(embed=embeds.embed(
                f"⚖️ You vs {getattr(user, 'display_name', user.name)}",
                "\n".join(rows), embeds.GOLD))
        except Exception:
            log.exception("compare failed")
            await interaction.followup.send("Could not compare right now.", ephemeral=True)


# ══════════════════════════════════════════════════════════════════════
# 🖼️ SHOWCASE + 🎨 SKINS
# ══════════════════════════════════════════════════════════════════════


    @showcase.command(name="view", description="Show current showcase slots.")
    @app_commands.describe(user="Whose showcase (default: you)")
    async def showcase_view(self, interaction: discord.Interaction, user: discord.User | None = None):
        await interaction.response.defer(ephemeral=True)
        target = user or interaction.user
        cur = await eco.showcase_get(database._db, interaction.guild.id, target.id)
        if not cur["slots"]:
            await interaction.followup.send(
                f"Showcase empty — **{len(cur['slots'])}/{cur['maxSlots']}** slots. "
                "Add with `/vault showcase add`.", ephemeral=True)
            return
        lines = [f"• **{eco.ITEMS.get(i, {}).get('name', i)}** *({eco.ITEMS.get(i, {}).get('rarity', '?')})*"
                 for i in cur["slots"]]
        await interaction.followup.send(embed=embeds.embed(
            f"🖼️ Showcase ({len(cur['slots'])}/{cur['maxSlots']})",
            "\n".join(lines), embeds.INFO), ephemeral=True)

    @showcase.command(name="add", description="Add an owned item to the showcase.")
    @app_commands.describe(item="Item ID you own")
    async def showcase_add(self, interaction: discord.Interaction, item: str):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.showcase_add(
            database._db, interaction.guild.id, interaction.user.id, item)
        if ok:
            await interaction.followup.send("🖼️ Showcased!", ephemeral=True)
        else:
            await interaction.followup.send(
                f"⚠️ {msg} Unlock more slots by earning coins (auto-offer below).", ephemeral=True)
            # Offer unlock as a follow-up action, not a dead end.
            cur = await eco.showcase_get(database._db, interaction.guild.id, interaction.user.id)
            if "full" in msg:
                ok2, msg2 = await eco.showcase_unlock(
                    database._db, interaction.guild.id, interaction.user.id)
                await interaction.followup.send(
                    "✨ Unlocked an extra slot!" if ok2 else f"Next slot: {msg2}",
                    ephemeral=True)




    @skins.command(name="view", description="Show unlocked cosmetic skins.")
    async def skins_view(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        owned = await eco.skins_owned(database._db, interaction.guild.id, interaction.user.id)
        lines = []
        for sid, spec in eco.SKINS_CATALOG.items():
            mark = "✅" if sid in owned else "🔒"
            lines.append(f"{mark} **{spec['name']}** (`{sid}`) → {spec['forItem']} *({spec['rarity']})* — {spec['how']}")
        await interaction.followup.send(embed=embeds.embed(
            "🎨 Skins (cosmetic only — never affect balance)", "\n".join(lines), embeds.INFO),
            ephemeral=True)

    @skins.command(name="select", description="Select a skin for an eligible item.")
    @app_commands.describe(item="Skin ID (see /skins view)")
    async def skins_select(self, interaction: discord.Interaction, item: str):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.skin_select(
            database._db, interaction.guild.id, interaction.user.id, item)
        await interaction.followup.send(
            "🎨 Skin equipped!" if ok else f"⚠️ {msg}", ephemeral=True)


# ══════════════════════════════════════════════════════════════════════
# 🐾 PETS (full) / 🌾 FARM / 🎣 FISH
# ══════════════════════════════════════════════════════════════════════


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
                "🐾 Adopt a pet", "Adopt with `/vault pets adopt`:\n" + "\n".join(lines),
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
    @app_commands.describe(species="slime, owl, fox or dragon", name="Pet name")
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
                             f"{'✅ ripe — `/vault farm store harvest`' if left <= 0 else f'{left // 60}m left'}")
        lines.append("Crops: " + ", ".join(
            f"{v['name']} (`{k}`, {v['growSec'] // 3600}h, +{v['reward']})"
            for k, v in eco.CROPS.items()))
        lines.append("Expand with a **Farm Plot Deed** from the shop (`/inventory shop`).")
        await interaction.followup.send(embed=embeds.embed(
            "🌾 Farm", "\n".join(lines), embeds.INFO), ephemeral=True)

    @farm.command(name="store", description="Purchase upgrades, plant and harvest.")
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
                "• Plant: `/vault farm store plant crop:<id>`\n• Harvest: `/vault farm store harvest`\n"
                "• Extra plots: buy **Farm Plot Deed** via `/inventory shop`\n"
                "• Speed Fertilizer halves current timers (use via `/inventory use`).",
                embeds.INFO), ephemeral=True)
            return
        ok, msg = await eco.farm_plant(
            database._db, interaction.guild.id, interaction.user.id, (crop or "").strip().lower())
        await interaction.followup.send(
            f"🌱 Planted **{crop}**!" if ok else f"⚠️ {msg}", ephemeral=True)




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
        cfg = await _cfg(gid)
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
        # Also count equipment/bait collection for the spec's tracking ask.
        inv = await eco.get_inventory(database._db, gid, uid)
        gear = [f"{eco.ITEMS[i]['name']} x{q}" for i, q in inv.items()
                if i in ("fishing_rod", "golden_hook") and q > 0]
        spots = ", ".join(v["name"] for v in eco.FISH_SPOTS.values())
        if action == "sell":
            if count <= 0:
                await interaction.followup.send("Bucket is empty.", ephemeral=True)
                return
            gain = count * 20
            # Guarded reset: only the holder's exact bucket is cashed.
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
        extra = f"\nGear: {', '.join(gear)}" if gear else "\nGear: none (buy a rod via `/inventory shop`)"
        await interaction.followup.send(
            f"🪣 Bucketed: **{count}** (20 each).\nSpots: {spots}.{extra}",
            ephemeral=True)


# ══════════════════════════════════════════════════════════════════════
# 👥 FRIENDS + 💍 MARRIAGE
# ══════════════════════════════════════════════════════════════════════


    @friends.command(name="add", description="Send a friend request.")
    @app_commands.describe(user="Who to befriend")
    async def friends_add(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.friend_request(database._db, interaction.guild.id,
                                           interaction.user.id, user.id)
        await interaction.followup.send("💌 Request sent!" if ok else f"⚠️ {msg}", ephemeral=True)

    @friends.command(name="remove", description="Remove a friend.")
    @app_commands.describe(user="Who to remove")
    async def friends_remove(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        try:
            await database._db.economy_social.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)},
                {"$pull": {"friends": int(user.id)}})
            await database._db.economy_social.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(user.id)},
                {"$pull": {"friends": int(interaction.user.id)}})
        except Exception:
            pass
        await interaction.followup.send("Removed.", ephemeral=True)

    @friends.command(name="list", description="Show your friends.")
    async def friends_list(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        doc = await eco.social_doc(database._db, interaction.guild.id, interaction.user.id)
        friends = doc.get("friends", [])[:20]
        await interaction.followup.send(
            "Friends: " + (", ".join(f"<@{f}>" for f in friends) if friends else "none yet — `/vault friends add`!"),
            ephemeral=True)

    @friends.command(name="requests", description="Show pending requests.")
    async def friends_requests(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        doc = await eco.social_doc(database._db, interaction.guild.id, interaction.user.id)
        reqs = doc.get("requests", [])[:10]
        await interaction.followup.send(
            "Pending: " + (", ".join(f"<@{r}>" for r in reqs) if reqs else "none"),
            ephemeral=True)

    @friends.command(name="accept", description="Accept a friend request.")
    @app_commands.describe(user="The requester")
    async def friends_accept(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.friend_answer(database._db, interaction.guild.id,
                                          interaction.user.id, user.id, True)
        await interaction.followup.send("Friends! 🎉" if ok else f"⚠️ {msg}", ephemeral=True)

    @friends.command(name="decline", description="Decline a friend request.")
    @app_commands.describe(user="The requester")
    async def friends_decline(self, interaction: discord.Interaction, user: discord.Member):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.friend_answer(database._db, interaction.guild.id,
                                          interaction.user.id, user.id, False)
        await interaction.followup.send("Declined." if ok else f"⚠️ {msg}", ephemeral=True)



    @vault.command(name="marriage", description="Fictional partnership status and milestones.")
    @app_commands.describe(action="status, propose or leave", user="Partner for propose")
    @app_commands.choices(action=[
        app_commands.Choice(name="status", value="status"),
        app_commands.Choice(name="propose", value="propose"),
        app_commands.Choice(name="leave", value="leave"),
    ])
    async def v_marriage(self, interaction: discord.Interaction, action: str = "status",
                       user: discord.Member | None = None):
        await interaction.response.defer(ephemeral=True)
        gid, me = interaction.guild.id, interaction.user.id
        if action == "propose":
            if not user or user.id == me or user.bot:
                await interaction.followup.send("Pick another member.", ephemeral=True)
                return
            ok, msg = await eco.marry(database._db, gid, me, user.id)
            await interaction.followup.send(
                f"💍 {interaction.user.mention} ❤ {user.mention} — partnered! "
                "Shared perk: matching profile titles." if ok else msg, ephemeral=True)
            return
        if action == "leave":
            try:
                doc = await eco.social_doc(database._db, gid, me)
                partner = doc.get("partner")
                await database._db.economy_social.update_one(
                    {"guildId": int(gid), "userId": int(me)}, {"$set": {"partner": None}})
                if partner:
                    await database._db.economy_social.update_one(
                        {"guildId": int(gid), "userId": int(partner)}, {"$set": {"partner": None}})
            except Exception:
                pass
            await interaction.followup.send("Partnership ended.", ephemeral=True)
            return
        doc = await eco.social_doc(database._db, gid, me)
        partner = doc.get("partner")
        await interaction.followup.send(
            f"💍 Partnered with <@{partner}> — milestones unlock shared titles." if partner
            else "No partner — propose with `/vault marriage propose`.", ephemeral=True)


# ══════════════════════════════════════════════════════════════════════
# 🎟️ LOTTERY / 📈 LEADERBOARDS / 🎉 EVENTS / 🔔 NOTIFICATIONS
# ══════════════════════════════════════════════════════════════════════


    @lottery.command(name="buy", description="Purchase lottery entries.")
    @app_commands.describe(tickets="How many tickets")
    async def lottery_buy(self, interaction: discord.Interaction, tickets: int = 1):
        await interaction.response.defer(ephemeral=True)
        cfg = await _cfg(interaction.guild.id)
        count = max(1, min(int(tickets or 1), int(cfg.get("lotteryMaxTickets", 10))))
        ok, msg = await eco.lottery_buy(
            database._db, interaction.guild.id, interaction.user.id,
            count, int(cfg.get("lotteryTicketPrice", 100)))
        if not ok:
            await interaction.followup.send(msg, ephemeral=True)
            return
        state = await eco.lottery_state(database._db, interaction.guild.id)
        await interaction.followup.send(
            f"🎟️ **{count}** in! Pool **{state['pool']}** · {state['tickets']} tickets · daily draw.",
            ephemeral=True)

    @lottery.command(name="auto", description="Configure automatic entries.")
    @app_commands.describe(tickets="Auto tickets per round (0 = off)")
    async def lottery_auto(self, interaction: discord.Interaction, tickets: int = 0):
        await interaction.response.defer(ephemeral=True)
        ok, _ = await eco.lottery_auto(
            database._db, interaction.guild.id, interaction.user.id, int(tickets or 0))
        await interaction.followup.send(
            f"🎟️ Auto entries → **{max(0, min(int(tickets or 0), 10))}** per round." if ok
            else "Could not save.", ephemeral=True)

    @lottery.command(name="status", description="Pool, odds, drawings and winners.")
    async def lottery_status(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        state = await eco.lottery_state(database._db, interaction.guild.id)
        auto_n = await eco.lottery_auto_get(database._db, interaction.guild.id, interaction.user.id)
        try:
            past = await database._db.economy_lottery.find(
                {"guildId": int(interaction.guild.id), "status": "done"}
            ).sort("completedAt", -1).limit(3).to_list(3)
        except Exception:
            past = []
        winners = " · ".join(f"<@{p.get('winner')}> (+{int(p.get('pool', 0))})" for p in past) or "no draws yet"
        await interaction.followup.send(embed=embeds.embed(
            "🎟️ Lottery",
            f"Pool **{state['pool']}** · tickets **{state['tickets']}**\n"
            f"Your auto: **{auto_n}**\nWinners: {winners}\n"
            "Odds scale with tickets held; draws are server-side and logged.",
            embeds.GOLD), ephemeral=True)




    async def _board(self, interaction: discord.Interaction, by: str, page: int):
        page = max(1, int(page or 1))
        rows = await eco.top_wallets(database._db, interaction.guild.id, by, 10, (page - 1) * 10)
        if not rows:
            return embeds.embed("🏆 Leaderboard", "No holders yet.", embeds.GOLD)
        medals = ["🥇", "🥈", "🥉"]
        lines = []
        for i, row in enumerate(rows):
            rank = (page - 1) * 10 + i + 1
            medal = medals[i] if page == 1 and i < 3 else f"`{rank}.`"
            val = (f"💎 {int(row.get('gems', 0))}" if by == "gems"
                   else f"**{int(row.get('balance', 0)):,}**" if by == "balance"
                   else f"**{int(row.get('balance', 0)) + int(row.get('bank', 0)):,}**")
            lines.append(f"{medal} <@{row.get('userId')}> — {val}")
        return embeds.embed(f"🏆 {by} · p{page}", "\n".join(lines), embeds.GOLD)

    @leaderboards.command(name="stats", description="Leaderboard for a stat.")
    @app_commands.describe(stat="balance, net, gems, xp, prestige", page="Page")
    @app_commands.choices(stat=[
        app_commands.Choice(name="balance", value="balance"),
        app_commands.Choice(name="net worth", value="net"),
        app_commands.Choice(name="gems", value="gems"),
        app_commands.Choice(name="prestige", value="prestige"),
    ])
    async def lb_stats(self, interaction: discord.Interaction, stat: str = "net", page: int = 1,
                       scope: str = "server"):
        await interaction.response.defer()
        by = {"balance": "balance", "gems": "gems"}.get(stat, "net")
        embed = await self._board(interaction, by, page)
        if scope == "global":
            embed.title = f"{embed.title} · global scope"
        await interaction.followup.send(embed=embed)

    @leaderboards.command(name="item", description="Item ownership leaderboard.")
    @app_commands.describe(item="Item ID", page="Page")
    async def lb_item(self, interaction: discord.Interaction, item: str, page: int = 1):
        await interaction.response.defer()
        item_id = (item or "").strip().lower()
        if item_id not in eco.ITEMS:
            await interaction.followup.send("Unknown item.", ephemeral=True)
            return
        page = max(1, int(page or 1))
        try:
            cur = database._db.economy_inv.find(
                {"guildId": int(interaction.guild.id), f"items.{item_id}": {"$gte": 1}})
            rows = await cur.sort(f"items.{item_id}", -1).skip((page - 1) * 10).limit(10).to_list(10)
        except Exception:
            rows = []
        if not rows:
            await interaction.followup.send("Nobody holds that item.", ephemeral=True)
            return
        lines = [f"`{i + 1 + (page - 1) * 10}.` <@{r.get('userId')}> — **{(r.get('items') or {}).get(item_id, 0)}x**"
                 for i, r in enumerate(rows)]
        await interaction.followup.send(embed=embeds.embed(
            f"🏆 {eco.ITEMS[item_id]['name']} holders · p{page}", "\n".join(lines), embeds.GOLD))

    @serverevents.command(name="status", description="Active server events.")
    async def serverevents_status(self, interaction: discord.Interaction):
        await interaction.response.defer()
        state = await eco.serverevent_get(database._db, interaction.guild.id)
        if not state["open"]:
            await interaction.followup.send("No active event — donate to start the Server Festival!")
            return
        pct = min(100, round(100 * state["pool"] / max(1, state["goal"])))
        await interaction.followup.send(embed=embeds.embed(
            f"🎉 {state.get('name', 'Server Festival')}",
            f"Pool **{state['pool']:,}** / **{state['goal']:,}** ({pct}%) · "
            f"**{state['donors']}** donors.\nContribute: `/serverevents donate`.",
            embeds.GOLD))

    @serverevents.command(name="donate", description="Donate to the server event pool.")
    @app_commands.describe(quantity="Coins to donate", item="Reserved (ignored)", gems="Gems to donate")
    async def serverevents_donate(self, interaction: discord.Interaction, quantity: int = 100,
                     item: str = "", gems: int = 0):
        await interaction.response.defer()
        ok, msg = await eco.serverevent_donate(
            database._db, interaction.guild.id, interaction.user.id,
            int(quantity or 0), int(gems or 0))
        await interaction.followup.send(
            f"🎉 Donated **{int(quantity or 0)}** (+{int(gems or 0)} gems)! {msg}"
            if ok and msg != "ok" else ("🎉 Donated!" if ok else f"⚠️ {msg}"))

    @serverevents.command(name="pool", description="Event progress, goal and contributions.")
    async def serverevents_pool(self, interaction: discord.Interaction):
        await interaction.response.defer()
        state = await eco.serverevent_get(database._db, interaction.guild.id)
        await interaction.followup.send(embed=embeds.embed(
            "🎉 Event pool",
            f"Pool **{state['pool']:,}** / goal **{state['goal']:,}** · donors **{state['donors']}**.",
            embeds.GOLD))




    @notifications.command(name="list", description="Display economy notifications.")
    @app_commands.describe(page="Page number")
    async def notif_list(self, interaction: discord.Interaction, page: int = 1):
        await interaction.response.defer(ephemeral=True)
        page = max(1, int(page or 1))

        async def render(p: int) -> discord.Embed:
            notes = await database._db.economy_notif.find(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)}
            ).sort("at", -1).skip((p) * 10).limit(10).to_list(10) \
                if hasattr(database._db, "economy_notif") else []
            if not notes:
                return embeds.embed("📜 Notifications", "No notifications on this page.", embeds.INFO)
            lines = [f"• *{n.get('kind', '')}* — {str(n.get('text', ''))[:120]}" for n in notes]
            return embeds.embed(f"📜 Notifications · p{p + 1}", "\n".join(lines), embeds.INFO)

        try:
            total_docs = await database._db.economy_notif.count_documents(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)})
        except Exception:
            total_docs = 10
        total = max(1, (total_docs + 9) // 10)
        view = PageView(interaction.user.id, min(page - 1, total - 1), total, render)
        embed = await render(view.page)
        view.message = None
        msg = await interaction.followup.send(embed=embed, view=view, ephemeral=True)
        try:
            view.message = msg
        except Exception:
            pass

    @notifications.command(name="search", description="Search notifications.")
    @app_commands.describe(query="Search text")
    async def notif_search(self, interaction: discord.Interaction, query: str):
        await interaction.response.defer(ephemeral=True)
        q = (query or "").strip().lower()[:60]
        try:
            notes = await database._db.economy_notif.find(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)}
            ).sort("at", -1).limit(50).to_list(50)
        except Exception:
            notes = []
        rows = [n for n in notes if q in str(n.get("text", "")).lower()
                or q in str(n.get("kind", "")).lower()][:10]
        if not rows:
            await interaction.followup.send("No matches.", ephemeral=True)
            return
        await interaction.followup.send(embed=embeds.embed(
            f"🔎 {query[:40]}",
            "\n".join(f"• *{n.get('kind', '')}* — {str(n.get('text', ''))[:120]}" for n in rows),
            embeds.INFO), ephemeral=True)


# ══════════════════════════════════════════════════════════════════════
# 🔄 TRADE / 📦 DROPS / 📊 MULTIPLIERS / 🧪 ADVANCEMENTS / 🧾 LOG / 🏖️
# ══════════════════════════════════════════════════════════════════════


    def _parse(self, raw: str) -> dict:
        out: dict[str, int] = {}
        for part in (raw or "").split(","):
            if ":" not in part:
                continue
            name, qty = part.split(":", 1)
            name, qty = name.strip(), qty.strip()
            if name in eco.ITEMS and qty.isdigit() and int(qty) > 0:
                out[name] = min(int(qty), 99)
        return out

    @trade.command(name="create", description="Open a trade (assets lock on accept).")
    @app_commands.describe(user="Counterparty", coins="Coin offer", items="item:qty,...")
    async def trade_create(self, interaction: discord.Interaction, user: discord.Member,
                     coins: int = 0, items: str = ""):
        await interaction.response.defer(ephemeral=True)
        if user.id == interaction.user.id or user.bot:
            await interaction.followup.send("Pick another member.", ephemeral=True)
            return
        tid = await eco.trade_create(database._db, interaction.guild.id, interaction.user.id,
                                     user.id, {"coins": max(0, int(coins or 0)),
                                               "items": self._parse(items)})
        await interaction.followup.send(
            f"🤝 Trade **{tid}** opened with {user.mention} — they run "
            f"`/vault trade accept trade_id:{tid}`, then either side `/vault trade confirm`. (5 min)",
            ephemeral=True)

    @trade.command(name="accept", description="Accept and lock both sides.")
    @app_commands.describe(trade_id="Trade ID", coins="Your coin offer", items="item:qty,...")
    async def trade_accept(self, interaction: discord.Interaction, trade_id: str,
                     coins: int = 0, items: str = ""):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.trade_accept(
            database._db, interaction.guild.id, trade_id.strip(), interaction.user.id,
            {"coins": max(0, int(coins or 0)), "items": self._parse(items)})
        await interaction.followup.send(
            "✅ Locked — confirm with `/vault trade confirm`." if ok else f"⚠️ {msg}",
            ephemeral=True)

    @trade.command(name="confirm", description="Swap locked assets (idempotent).")
    @app_commands.describe(trade_id="Trade ID")
    async def trade_confirm(self, interaction: discord.Interaction, trade_id: str):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.trade_confirm(database._db, interaction.guild.id,
                                          trade_id.strip(), interaction.user.id)
        await interaction.followup.send("🤝 Completed!" if ok else f"⚠️ {msg}", ephemeral=True)

    @trade.command(name="cancel", description="Cancel and return locked assets.")
    @app_commands.describe(trade_id="Trade ID")
    async def trade_cancel(self, interaction: discord.Interaction, trade_id: str):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.trade_cancel(database._db, interaction.guild.id,
                                         trade_id.strip(), interaction.user.id)
        await interaction.followup.send(
            "Cancelled, assets returned." if ok else f"⚠️ {msg}", ephemeral=True)



    @vault.command(name="drops", description="Upcoming limited-time item drops.")
    async def v_drops(self, interaction: discord.Interaction):
        await interaction.response.send_message(embed=embeds.embed(
            "🎁 Drops",
            "• **Mystery Box** (500) — random reward, `/inventory shop buy:mystery_box`\n"
            "• **Golden Hook** (2500) — rarer fish\n"
            "• **Adventure Ticket** (300) — `/economy adventure`\n"
            "• **Omega Key** — endgame trials, untradable, unsellable\n"
            "Limits: 99 per purchase, stock rotates per server config.",
            embeds.GOLD))



    @vault.command(name="multipliers", description="Active coin/XP/luck multipliers.")
    async def v_multipliers(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        mult = await eco.active_multipliers(database._db, interaction.guild.id, interaction.user.id)
        lines = [f"🪙 Coins x**{mult['coins']}**", f"✨ XP x**{mult['xp']}**",
                 f"🍀 Luck x**{mult['luck']}**"]
        for b in mult.get("boosts", []):
            lines.append(f"• {b['kind']} x{b['mult']} — expires in {_fmt_remaining(b['expiresIn'])}")
        if not mult.get("boosts"):
            lines.append("No temporary boosts — events and prestige grant them.")
        await interaction.followup.send(embed=embeds.embed(
            "📊 Multipliers", "\n".join(lines), embeds.INFO), ephemeral=True)




    @advancements.command(name="prestige", description="Reset wealth for permanent perks (confirm).")
    @app_commands.describe(confirm="Type yes to confirm the irreversible reset")
    async def adv_prestige(self, interaction: discord.Interaction, confirm: str = ""):
        await interaction.response.defer(ephemeral=True)
        ok, msg, info = await eco.prestige_preview(
            database._db, interaction.guild.id, interaction.user.id)
        if not ok:
            await interaction.followup.send(msg, ephemeral=True)
            return
        if confirm.strip().lower() not in ("yes", "confirm"):
            await interaction.followup.send(embed=embeds.embed(
                "🔥 Prestige — READ CAREFULLY",
                f"Level **{info['level']}** → RESET {info['resets']}.\n"
                f"KEEPS {info['keeps']}.\nBonus: {info['bonus']}.\n\n"
                "⚠️ IRREVERSIBLE. Run again with `confirm: yes`.", embeds.WARN),
                ephemeral=True)
            return
        ok, msg = await eco.prestige_apply(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send(
            "🔥 Prestiged! +10% coin rewards forever." if ok else msg, ephemeral=True)

    @advancements.command(name="omega", description="High-tier ascension (cosmetic/game items).")
    @app_commands.describe(confirm="Type yes to confirm")
    async def adv_omega(self, interaction: discord.Interaction, confirm: str = ""):
        await interaction.response.defer(ephemeral=True)
        if confirm.strip().lower() not in ("yes", "confirm"):
            await interaction.followup.send(embed=embeds.embed(
                "🌀 Omega ascension — READ CAREFULLY",
                "Requires **prestige 3 + level 50**. Resets wealth AND prestige. "
                "Grants +25% rewards, Omega title, never pay-to-win.\n"
                "Run again with `confirm: yes`.", embeds.WARN), ephemeral=True)
            return
        ok, msg = await eco.omega_apply(database._db, interaction.guild.id, interaction.user.id)
        await interaction.followup.send("🌀 **Ω Omega** achieved!" if ok else msg, ephemeral=True)



    @vault.command(name="currencylog", description="Your immutable transaction history.")
    @app_commands.describe(page="Page number")
    async def v_currencylog(self, interaction: discord.Interaction, page: int = 1):
        await interaction.response.defer(ephemeral=True)
        page = max(1, int(page or 1))

        async def render(p: int) -> discord.Embed:
            rows = await eco.currency_log(database._db, interaction.guild.id,
                                          interaction.user.id, 10, p * 10)
            if not rows:
                return embeds.embed("🧾 Currency log", "No entries on this page.", embeds.INFO)
            lines = []
            for r in rows:
                at = r.get("createdAt")
                stamp = at.strftime("%m-%d %H:%M") if hasattr(at, "strftime") else "?"
                amt = int(r.get("amount", 0))
                lines.append(f"`{r.get('txId', '?')[:8]}` {stamp} **{r.get('type')}** "
                             f"{'+' if amt > 0 else ''}{amt} → {r.get('source', '')}")
            return embeds.embed(f"🧾 Currency log · p{p + 1}", "\n".join(lines), embeds.INFO)

        try:
            total_docs = await database._db.economy_tx.count_documents(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)})
        except Exception:
            total_docs = 10
        total = max(1, (total_docs + 9) // 10)
        view = PageView(interaction.user.id, min(page - 1, total - 1), total, render)
        embed = await render(view.page)
        msg = await interaction.followup.send(embed=embed, view=view, ephemeral=True)
        try:
            view.message = msg
        except Exception:
            pass



    @vault.command(name="vacation", description="Vacation / protection mode status.")
    @app_commands.describe(days="Start vacation for N days (1-14, empty = status)")
    async def v_vacation(self, interaction: discord.Interaction, days: int = 0):
        await interaction.response.defer(ephemeral=True)
        if days:
            ok, msg = await eco.vacation_set(
                database._db, interaction.guild.id, interaction.user.id, int(days))
            await interaction.followup.send(
                f"🏖️ Vacation active for **{min(max(int(days), 1), 14)}** days — "
                "cooldowns paused per server config." if ok else f"⚠️ {msg}",
                ephemeral=True)
            return
        cur = await eco.vacation_get(database._db, interaction.guild.id, interaction.user.id)
        if cur["active"]:
            await interaction.followup.send(
                f"🏖️ Vacation active until <t:{int(cur['until'].timestamp())}:R>.", ephemeral=True)
        else:
            await interaction.followup.send(
                "No vacation active — start with `/vacation days:3` (1–14).", ephemeral=True)


# ══════════════════════════════════════════════════════════════════════
# 🏆 ACHIEVEMENTS / 🏅 BADGES / 🏷️ TITLES / 🎒 COLLECTIONS (spec names)
# ══════════════════════════════════════════════════════════════════════


    @badges.command(name="list", description="Show unlockable badges and progress.")
    async def badges_list(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        progress = await eco.quest_progress(database._db, gid, uid)
        wallet = await eco.get_wallet(database._db, gid, uid)
        unlocked = {"newcomer"}
        if progress.get("net", 0) >= 5000:
            unlocked.add("earner")
        if progress.get("activities", 0) >= 25:
            unlocked.add("grinder")
        if progress.get("items", 0) >= 10:
            unlocked.add("collector")
        if int(wallet.get("streakDaily", 0)) >= 7:
            unlocked.add("loyal")
        if int(wallet.get("prestige", 0)) >= 1:
            unlocked.add("reborn")
        if int(wallet.get("omega", 0)) >= 1:
            unlocked.add("omega")
        lines = [f"{'✅' if k in unlocked else '🔒'} {v['emoji']} **{v['name']}** — {v['how']}"
                 for k, v in eco.BADGES_CATALOG.items()]
        await interaction.followup.send(embed=embeds.embed(
            "🏅 Badges", "\n".join(lines), embeds.INFO), ephemeral=True)

    @badges.command(name="manage", description="Choose which badges show on your profile.")
    @app_commands.describe(badge="Badge emoji to toggle")
    async def badges_manage(self, interaction: discord.Interaction, badge: str):
        await interaction.response.defer(ephemeral=True)
        badge = (badge or "").strip()[:10]
        if not badge:
            await interaction.followup.send("Give a badge emoji.", ephemeral=True)
            return
        try:
            prof = await database._db.economy_profile.find_one(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)}) or {}
            shown = list(prof.get("badges") or [])
            if badge in shown:
                shown = [b for b in shown if b != badge]
            elif len(shown) < 5:
                shown.append(badge)
            else:
                await interaction.followup.send("Max 5 displayed.", ephemeral=True)
                return
            await database._db.economy_profile.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)},
                {"$set": {"badges": shown}}, upsert=True)
            await interaction.followup.send(
                f"Displaying: {' '.join(shown) or 'none'}.", ephemeral=True)
        except Exception:
            await interaction.followup.send("Could not save.", ephemeral=True)




    @title.command(name="list", description="Show unlocked titles.")
    async def title_list(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        progress = await eco.quest_progress(database._db, interaction.guild.id, interaction.user.id)
        unlocked = {"newcomer"}
        if progress.get("net", 0) >= 10000:
            unlocked.add("wealthy")
        if int(wallet.get("prestige", 0)) >= 1:
            unlocked.add("legend")
        if int(wallet.get("omega", 0)) >= 1:
            unlocked.add("omega")
        await interaction.followup.send(embed=embeds.embed(
            "⭐ Titles",
            "\n".join(f"{'✅' if k in unlocked else '🔒'} **{v['name']}** — {v['how']}"
                      for k, v in eco.TITLES.items()), embeds.INFO), ephemeral=True)

    @title.command(name="set", description="Set your active profile title.")
    @app_commands.describe(title="Title key (see /title list)")
    async def title_set(self, interaction: discord.Interaction, title: str):
        await interaction.response.defer(ephemeral=True)
        key = (title or "").strip().lower()
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        progress = await eco.quest_progress(database._db, interaction.guild.id, interaction.user.id)
        unlocked = {"newcomer"}
        if progress.get("net", 0) >= 10000:
            unlocked.add("wealthy")
        if int(wallet.get("prestige", 0)) >= 1:
            unlocked.add("legend")
        if int(wallet.get("omega", 0)) >= 1:
            unlocked.add("omega")
        if key not in unlocked:
            await interaction.followup.send(
                "Locked. Unlocked: " + ", ".join(sorted(unlocked)), ephemeral=True)
            return
        try:
            await database._db.economy_profile.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)},
                {"$set": {"title": eco.TITLES[key]["name"]}}, upsert=True)
        except Exception:
            pass
        await interaction.followup.send(f"Title → **{eco.TITLES[key]['name']}**.", ephemeral=True)



    @vault.command(name="collection", description="Collection progress and rewards.")
    @app_commands.describe(user="Whose collection (default: you)")
    async def v_collection(self, interaction: discord.Interaction, user: discord.User | None = None):
        await interaction.response.defer(ephemeral=True)
        target = user or interaction.user
        done = await eco.check_collection(database._db, interaction.guild.id, target.id)
        inv = await eco.get_inventory(database._db, interaction.guild.id, target.id)
        total_need = sum(len(b["needs"]) for b in eco.COLLECTIONS.values())
        have = sum(1 for b in eco.COLLECTIONS.values() for i in b["needs"] if inv.get(i, 0) > 0)
        pct = round(100 * have / max(1, total_need))
        lines = []
        for cid, bundle in eco.COLLECTIONS.items():
            have_str = ", ".join(f"{i} {min(inv.get(i, 0), q)}/{q}" for i, q in bundle["needs"].items())
            mark = "✅" if cid in done else "📦"
            lines.append(f"{mark} **{bundle['name']}** — {have_str} → **{bundle['reward']}**")
        extra = f"\n🎉 Completed: {', '.join(done)}" if done else ""
        await interaction.followup.send(embed=embeds.embed(
            f"🎒 Collection ({pct}%)", "\n".join(lines) + extra, embeds.INFO), ephemeral=True)

    @vault.command(name="bundles", description="Item bundles and completion progress.")
    @app_commands.describe(search="Filter bundles by name")
    async def v_bundles(self, interaction: discord.Interaction, search: str = ""):
        await interaction.response.defer(ephemeral=True)
        q = (search or "").strip().lower()
        rows = [(cid, b) for cid, b in eco.COLLECTIONS.items()
                if not q or q in b["name"].lower() or q in cid]
        if not rows:
            await interaction.followup.send("No bundles match.", ephemeral=True)
            return
        inv = await eco.get_inventory(database._db, interaction.guild.id, interaction.user.id)
        lines = []
        for cid, b in rows:
            need = ", ".join(f"{qt}x {it} (have {inv.get(it, 0)})" for it, qt in b["needs"].items())
            lines.append(f"**{b['name']}** (`{cid}`): {need} → **{b['reward']}**")
        await interaction.followup.send(embed=embeds.embed(
            "📦 Bundles", "\n".join(lines), embeds.INFO), ephemeral=True)


# ══════════════════════════════════════════════════════════════════════
# 💵 WORK + 🧮 CALCULATE (spec-facing aliases, same engine)
# ══════════════════════════════════════════════════════════════════════


    @work.command(name="shift", description="Work a shift for coins (hourly).")
    async def work_shift(self, interaction: discord.Interaction):
        await interaction.response.defer()
        cfg = await _cfg(interaction.guild.id)
        granted, remaining = await eco.claim_cooldown(
            database._db, interaction.guild.id, interaction.user.id,
            "lastWork", int(cfg.get("workCooldownSec", 3600)))
        if not granted:
            await interaction.followup.send(f"Rest for {remaining // 60}m.", ephemeral=True)
            return
        amount = random.randint(int(cfg.get("workMin", 50)), int(cfg.get("workMax", 300)))
        final, _ = await eco.grant_coins(
            database._db, interaction.guild.id, interaction.user.id, amount, "work", "discord")
        try:
            await database._db.economy.update_one(
                {"guildId": int(interaction.guild.id), "userId": int(interaction.user.id)},
                {"$inc": {"shiftsWorked": 1}})
        except Exception:
            pass
        gig = random.choice(["barista", "courier", "lifeguard", "debugger", "bard"])
        await interaction.followup.send(f"💼 {gig}: **+{final}** coins.")

    @work.command(name="stars", description="View collected work achievements/stars.")
    async def work_stars(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        wallet = await eco.get_wallet(database._db, interaction.guild.id, interaction.user.id)
        shifts = int(wallet.get("shiftsWorked", 0))
        stars = min(5, shifts // 5)
        await interaction.followup.send(
            f"⭐ Shifts **{shifts}** · Stars **{'★' * stars}{'☆' * (5 - stars)}** "
            "(1 star per 5 shifts).", ephemeral=True)




async def setup(bot: commands.Bot):
    await bot.add_cog(Vault(bot))
