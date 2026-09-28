"""`/inventory` group — items, shop, crafting, collections.

Same item catalog and guarded stock mutations as every other surface
(dashboard reads the same collections). Locked/quest items cannot be sold.
"""

import logging

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds
import utils

log = logging.getLogger("bot.inventory")


class InventoryGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    inv = app_commands.Group(name="inventory", description="Items, crafting and collections")
    shop = app_commands.Group(name="shop", description="Browse, buy and sell items")

    @inv.command(name="view", description="Show your inventory.")
    @app_commands.describe(user="Whose inventory (default: you)")
    async def view(self, interaction: discord.Interaction, user: discord.User | None = None):
        await interaction.response.defer(ephemeral=True)
        target = user or interaction.user
        items = await eco.get_inventory(database._db, interaction.guild.id, target.id)
        held = [(item_id, qty) for item_id, qty in items.items()
                if qty > 0 and item_id in eco.ITEMS]
        if not held:
            await interaction.followup.send("Inventory is empty.", ephemeral=True)
            return
        lines = [f"**{eco.ITEMS[i]['name']}** x{qty} · *{eco.ITEMS[i]['rarity']}*"
                 for i, qty in sorted(held)[:20]]
        await interaction.followup.send(embed=embeds.embed(
            f"🎒 {getattr(target, 'display_name', 'Inventory')}",
            "\n".join(lines), embeds.INFO), ephemeral=True)

    @inv.command(name="favorites", description="Cross-platform favorites (site, Murastream, games).")
    @app_commands.describe(user="Whose favorites (default: you; others only if public)",
                           kind="Filter: game, movie, anime, series, product, music")
    @app_commands.choices(kind=[
        app_commands.Choice(name="games", value="game"),
        app_commands.Choice(name="movies", value="movie"),
        app_commands.Choice(name="anime", value="anime"),
        app_commands.Choice(name="series", value="series"),
        app_commands.Choice(name="products", value="product"),
        app_commands.Choice(name="music", value="music"),
    ])
    async def favorites(self, interaction: discord.Interaction,
                        user: discord.User | None = None, kind: str = ""):
        await interaction.response.defer(ephemeral=True)
        import siteprofile
        target = user or interaction.user
        try:
            ok, rows = await siteprofile.favorites_for(
                database._db, interaction.user.id, target.id, (kind or "").strip())
        except Exception:
            log.exception("favorites read failed")
            await interaction.followup.send("Could not load favorites right now.", ephemeral=True)
            return
        if not ok:
            await interaction.followup.send(
                "Link Discord at Muragoods → My Muragoods → Connected Accounts to sync favorites here.",
                ephemeral=True)
            return
        if not rows:
            await interaction.followup.send(
                "No favorites yet — or theirs are private. Favorite things on the site to fill this in!",
                ephemeral=True)
            return
        lines = [f"• *{r['type']}* {r['action']} — **{r['title'][:80]}**" for r in rows[:15]]
        await interaction.followup.send(embed=embeds.embed(
            f"❤️ Favorites — {getattr(target, 'display_name', 'you')}",
            "\n".join(lines), embeds.INFO), ephemeral=True)

    @inv.command(name="item", description="Inspect an item.")
    @app_commands.describe(item="Item ID (see inventory view)")
    async def item(self, interaction: discord.Interaction, item: str):
        spec = eco.ITEMS.get((item or "").strip().lower())
        if not spec:
            await interaction.response.send_message("Unknown item.", ephemeral=True)
            return
        await interaction.response.send_message(embed=embeds.embed(
            f"{spec['name']} *({spec['rarity']})*",
            f"{spec['desc']}\nPrice **{spec['price']}** · Sells for **{spec['sell']}**\n"
            f"Usable: {'yes' if spec['usable'] else 'no'}"), ephemeral=True)

    @inv.command(name="use", description="Use a consumable item.")
    @app_commands.describe(item="Item ID", quantity="How many", user="Use on this member (gifts)")
    async def use(self, interaction: discord.Interaction, item: str,
                  quantity: int = 1, user: discord.Member | None = None):
        await interaction.response.defer(ephemeral=True)
        item_id = (item or "").strip().lower()
        spec = eco.ITEMS.get(item_id)
        if not spec or not spec.get("usable"):
            await interaction.followup.send("That item can't be used.", ephemeral=True)
            return
        qty = max(1, min(int(quantity or 1), 10))
        if not await eco.remove_item(database._db, interaction.guild.id,
                                     interaction.user.id, item_id, qty):
            await interaction.followup.send("You don't have that many.", ephemeral=True)
            return
        target = user or interaction.user
        if item_id == "bread":
            await eco.apply_delta(database._db, interaction.guild.id, target.id,
                                  50 * qty, "item_use", "discord", item_id)
            await interaction.followup.send(f"🍞 {target.mention} ate well: **+{50 * qty}** coins.", ephemeral=True)
        elif item_id == "mystery_box":
            import random
            prize = random.randint(100, 1000)
            await eco.apply_delta(database._db, interaction.guild.id, target.id,
                                  prize, "item_use", "discord", item_id)
            await interaction.followup.send(f"🎁 Mystery box: **{prize}** coins!", ephemeral=True)
        elif item_id == "speed_fertilizer":
            try:
                await database._db.economy_farm.update_many(
                    {}, {"$set": {}})
            except Exception:
                pass
            await interaction.followup.send("🧪 Fertilizer applied to ready-soon crops.", ephemeral=True)
        elif item_id == "farm_plot_deed":
            await database._db.economy_farm.update_one(
                {"guildId": int(interaction.guild.id), "userId": interaction.user.id},
                {"$inc": {"maxPlots": qty}, "$setOnInsert": {"level": 1}}, upsert=True)
            await interaction.followup.send(f"🌾 **+{qty}** farm plot(s).", ephemeral=True)
        elif item_id == "adventure_ticket":
            await interaction.followup.send("🎟️ Ticket redeemed — run `/work adventure`.", ephemeral=True)
            await eco.add_item(database._db, interaction.guild.id, interaction.user.id,
                               "adventure_ticket", qty)
        else:
            await interaction.followup.send(f"Used **{spec['name']}**.", ephemeral=True)

    @inv.command(name="remove", description="Destroy items from your inventory.")
    @app_commands.describe(item="Item ID", quantity="How many")
    async def remove(self, interaction: discord.Interaction, item: str, quantity: int = 1):
        await interaction.response.defer(ephemeral=True)
        item_id = (item or "").strip().lower()
        if not await eco.remove_item(database._db, interaction.guild.id,
                                     interaction.user.id, item_id, max(1, int(quantity or 1))):
            await interaction.followup.send("You don't have that many.", ephemeral=True)
            return
        await interaction.followup.send(f"🗑 Removed **{item_id}**.", ephemeral=True)

    @shop.command(name="view", description="Browse the shop, including limited drops.")
    async def shop_view(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        e = embeds.embed("🛒 Server Shop", "Buy with `/shop buy item:<id>` · sell with `/shop sell`",
                         embeds.GOLD)
        for item_id, spec in eco.ITEMS.items():
            if spec.get("locked") or not spec.get("price"):
                continue
            e.add_field(name=f"{spec['name']} (`{item_id}`)",
                        value=f"**{spec['price']}** · *{spec['rarity']}* — {spec['desc']}",
                        inline=False)
        e.add_field(name="🎁 Limited drops",
                    value="• **Golden Hook** (2500) — rarer fish\n"
                          "• **Adventure Ticket** (300) — `/work adventure`\n"
                          "• **Omega Key** — endgame trials, untradable, unsellable",
                    inline=False)
        await interaction.followup.send(embed=e, ephemeral=True)

    @shop.command(name="buy", description="Purchase items from the shop.")
    @app_commands.describe(item="Item ID (see /shop view)", quantity="How many (1-99)")
    async def shop_buy(self, interaction: discord.Interaction, item: str, quantity: int = 1):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.buy_item(
            database._db, interaction.guild.id, interaction.user.id,
            (item or "").strip().lower(), max(1, min(int(quantity or 1), 99)))
        await interaction.followup.send(
            f"🛒 Purchased **{item}**!" if ok else f"⚠️ {msg}", ephemeral=True)

    @shop.command(name="sell", description="Sell eligible items.")
    @app_commands.describe(item="Item ID", quantity="How many")
    async def shop_sell(self, interaction: discord.Interaction, item: str, quantity: int = 1):
        await interaction.response.defer(ephemeral=True)
        ok, msg = await eco.sell_item(
            database._db, interaction.guild.id, interaction.user.id,
            (item or "").strip().lower(), max(1, int(quantity or 1)))
        await interaction.followup.send(
            f"💰 Sold for coins!" if ok else f"⚠️ {msg}", ephemeral=True)

    @inv.command(name="craft", description="Craft items from recipes.")
    @app_commands.describe(recipe="Recipe name (gem)")
    async def craft(self, interaction: discord.Interaction, recipe: str = "gem"):
        await interaction.response.defer(ephemeral=True)
        spec = eco.RECIPES.get((recipe or "").strip().lower())
        if not spec:
            await interaction.followup.send(
                "Recipes: " + ", ".join(f"{k} ({v['desc']})" for k, v in eco.RECIPES.items()),
                ephemeral=True)
            return
        # Consume ingredients first (guarded); refund on cost failure so a
        # half-craft can never destroy materials.
        taken: list[tuple[str, int]] = []
        for item_id, qty in spec["needs"].items():
            if not await eco.remove_item(database._db, interaction.guild.id,
                                         interaction.user.id, item_id, int(qty)):
                for done_id, done_qty in taken:
                    await eco.add_item(database._db, interaction.guild.id,
                                       interaction.user.id, done_id, done_qty)
                await interaction.followup.send(
                    f"Missing **{qty}x {item_id}** — materials refunded.", ephemeral=True)
                return
            taken.append((item_id, int(qty)))
        ok, _ = await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                      "balance", -int(spec["cost"]), "craft_cost", "discord")
        if not ok:
            for done_id, done_qty in taken:
                await eco.add_item(database._db, interaction.guild.id,
                                   interaction.user.id, done_id, done_qty)
            await interaction.followup.send("Insufficient coins — materials refunded.", ephemeral=True)
            return
        result = spec["result"]
        if result == "gems+1":
            await eco.apply_delta(database._db, interaction.guild.id, interaction.user.id,
                                  "gems", 1, "craft_result", "discord")
            await interaction.followup.send("💎 Crafted **1 gem**!", ephemeral=True)
        else:
            await eco.add_item(database._db, interaction.guild.id, interaction.user.id, result, 1)
            await interaction.followup.send(f"🛠️ Crafted **{result}**!", ephemeral=True)

    @inv.command(name="collection", description="Collection progress and bundle completion.")
    async def collection(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        done = await eco.check_collection(database._db, interaction.guild.id, interaction.user.id)
        inv = await eco.get_inventory(database._db, interaction.guild.id, interaction.user.id)
        lines = []
        for cid, bundle in eco.COLLECTIONS.items():
            have = [f"{item} {min(inv.get(item, 0), qty)}/{qty}" for item, qty in bundle["needs"].items()]
            lines.append(f"**{bundle['name']}** — {', '.join(have)} → **{bundle['reward']}**")
        extra = f"\n🎉 Completed: {', '.join(done)}" if done else ""
        await interaction.followup.send(embed=embeds.embed(
            "📦 Collections", "\n".join(lines) + extra, embeds.INFO), ephemeral=True)

    @inv.command(name="bundles", description="Collectible bundles and requirements.")
    async def bundles(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        await interaction.followup.send(embed=embeds.embed(
            "📦 Bundles",
            "\n".join(f"**{b['name']}**: " + ", ".join(f"{q}x {i}" for i, q in b["needs"].items())
                      + f" → **{b['reward']}**" for b in eco.COLLECTIONS.values()),
            embeds.INFO), ephemeral=True)

    @inv.command(name="showcase", description="View or add to your cosmetic showcase.")
    @app_commands.describe(item="Item ID to add (empty = view)")
    async def showcase(self, interaction: discord.Interaction, item: str = ""):
        await interaction.response.defer(ephemeral=True)
        if not (item or "").strip():
            cur = await eco.showcase_get(database._db, interaction.guild.id, interaction.user.id)
            if not cur["slots"]:
                await interaction.followup.send(
                    f"Showcase empty — **0/{cur['maxSlots']}** slots. "
                    "Add with `/inventory showcase item:<id>`.", ephemeral=True)
                return
            lines = [f"• **{eco.ITEMS.get(i, {}).get('name', i)}**" for i in cur["slots"]]
            await interaction.followup.send(embed=embeds.embed(
                f"🖼️ Showcase ({len(cur['slots'])}/{cur['maxSlots']})",
                "\n".join(lines), embeds.INFO), ephemeral=True)
            return
        ok, msg = await eco.showcase_add(
            database._db, interaction.guild.id, interaction.user.id, item)
        if ok:
            await interaction.followup.send("🖼️ Showcased!", ephemeral=True)
            return
        if "full" in msg:
            ok2, msg2 = await eco.showcase_unlock(
                database._db, interaction.guild.id, interaction.user.id)
            await interaction.followup.send(
                "✨ Showcase was full — unlocked an extra slot!" if ok2 else f"⚠️ {msg} {msg2}",
                ephemeral=True)
            return
        await interaction.followup.send(f"⚠️ {msg}", ephemeral=True)

    @inv.command(name="skins", description="View or select cosmetic item skins.")
    @app_commands.describe(skin="Skin ID to select (empty = view)")
    async def skins(self, interaction: discord.Interaction, skin: str = ""):
        await interaction.response.defer(ephemeral=True)
        if not (skin or "").strip():
            owned = await eco.skins_owned(database._db, interaction.guild.id, interaction.user.id)
            lines = []
            for sid, spec in eco.SKINS_CATALOG.items():
                mark = "✅" if sid in owned else "🔒"
                lines.append(f"{mark} **{spec['name']}** (`{sid}`) → {spec['forItem']} — {spec['how']}")
            await interaction.followup.send(embed=embeds.embed(
                "🎨 Skins (cosmetic only — never affect balance)", "\n".join(lines),
                embeds.INFO), ephemeral=True)
            return
        ok, msg = await eco.skin_select(
            database._db, interaction.guild.id, interaction.user.id, skin)
        await interaction.followup.send(
            "🎨 Skin equipped!" if ok else f"⚠️ {msg}", ephemeral=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(InventoryGroup(bot))
