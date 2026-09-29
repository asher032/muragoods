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
import items as itemdb
import utils

log = logging.getLogger("bot.inventory")

#: Autocomplete choices for the rarity/category filters.
_RARITY_CHOICES = [app_commands.Choice(name=r.title(), value=r) for r in itemdb.RARITIES]
_CATEGORY_CHOICES = [app_commands.Choice(name=itemdb.CATEGORY_LABELS[c], value=c)
                     for c in itemdb.CATEGORIES]


def _rarity_line(row: dict) -> str:
    return f"{itemdb.rarity_badge(row['rarity'])} · {itemdb.CATEGORY_EMOJI[row['category']]} " \
           f"{itemdb.CATEGORY_LABELS[row['category']]}"


def _item_detail(row: dict) -> str:
    """Full item page. Every number here comes from the server-side catalog."""
    buy = f"**{row['buy_price']:,}** coins" if row["buy_price"] else "Not for sale"
    sell = f"**{row['sell_price']:,}** coins" if row["sellable"] else "Not sellable"
    flags = " · ".join(filter(None, [
        "🔄 Stackable" if row["stackable"] else "",
        "🤝 Tradeable" if row["tradeable"] else "🔒 Untradeable",
        "🛒 Sellable" if row["sellable"] else "",
        "🎒 Equipable" if row["equipable"] else "",
        "✨ Usable" if row["usable"] else "",
    ]))
    if row["effect_type"]:
        mins = max(1, row["effect_duration"] // 60) if row["effect_duration"] else 0
        effect = f"`{row['effect_type']}` +{int(row['effect_value'] * 100)}%"
        effect += f" · **{mins} min**" if mins else " · **while held**"
    else:
        effect = "None"
    sources = ", ".join(row["drop_sources"]) or "Not in rotation"
    return (f"{row['description']}\n\n"
            f"**Value** · Buy: {buy} · Sells: {sell}\n"
            f"**Effect** · {effect}\n"
            f"**Sources** · {sources}\n"
            f"{flags}")


def _item_autocomplete(interaction: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
    """Autocomplete by display name or id, so users never type an internal id."""
    q = (current or "").strip().lower()
    names: list[str] = []
    for row in itemdb.CATALOG.values():
        if q and q not in row["name"].lower() and q not in row["item_id"]:
            continue
        names.append(row["name"])
        if len(names) >= 25:
            break
    return [app_commands.Choice(name=n, value=n) for n in sorted(names)]


class InventoryGroup(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    inv = app_commands.Group(name="inventory", description="Items, crafting and collections")
    shop = app_commands.Group(name="shop", description="Browse, buy and sell items")

    @app_commands.command(name="item", description="Inspect any Muragoods item.")
    @app_commands.describe(item="Item name or id")
    @app_commands.autocomplete(item=_item_autocomplete)
    async def item_lookup(self, interaction: discord.Interaction, item: str):
        row = itemdb.resolve_item(item)
        if not row:
            await interaction.response.send_message(
                f"No item called **{item}**. Try `/shop view` to browse the catalog.",
                ephemeral=True)
            return
        await interaction.response.send_message(embed=embeds.embed(
            f"{itemdb.rarity_badge(row['rarity'])} {row['name']}", _item_detail(row),
            embeds.GOLD), ephemeral=True)

    @inv.command(name="view", description="Show your inventory.")
    @app_commands.describe(user="Whose inventory (default: you)",
                           category="Filter by category", rarity="Filter by rarity",
                           query="Search item names")
    @app_commands.choices(category=_CATEGORY_CHOICES, rarity=_RARITY_CHOICES)
    async def view(self, interaction: discord.Interaction, user: discord.User | None = None,
                   category: str = "", rarity: str = "", query: str = ""):
        await interaction.response.defer(ephemeral=True)
        target = user or interaction.user
        bag = await eco.get_inventory(database._db, interaction.guild.id, target.id)
        held = []
        for item_id, qty in (bag or {}).items():
            row = itemdb.get_item(item_id)
            if not row or eco.safe_int(qty) <= 0:
                continue
            if category and row["category"] != itemdb.normalize_category(category, ""):
                continue
            if rarity and row["rarity"] != itemdb.normalize_rarity(rarity, ""):
                continue
            if query and query.strip().lower() not in row["name"].lower():
                continue
            held.append((row, eco.safe_int(qty)))
        if not held:
            await interaction.followup.send("No items match — your inventory may be empty.",
                                            ephemeral=True)
            return
        held.sort(key=lambda p: (itemdb.RANK[p[0]["rarity"]], p[0]["name"]))
        lines = [f"{_rarity_line(row)} — **{row['name']}** `x{qty}`"
                 for row, qty in held[:25]]
        footer = f"\n\nShowing {min(len(held), 25)} of {len(held)} matching item types."
        await interaction.followup.send(embed=embeds.embed(
            f"🎒 {getattr(target, 'display_name', 'Inventory')}",
            "\n".join(lines) + footer, embeds.INFO), ephemeral=True)

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
    @app_commands.describe(item="Item name or id (see inventory view)")
    async def item(self, interaction: discord.Interaction, item: str):
        row = itemdb.resolve_item(item)
        if not row:
            await interaction.response.send_message(
                "Unknown item — try `/item search`.", ephemeral=True)
            return
        await interaction.response.send_message(embed=embeds.embed(
            f"{itemdb.rarity_badge(row['rarity'])} {row['name']}", _item_detail(row),
            embeds.GOLD), ephemeral=True)

    @inv.command(name="use", description="Use a consumable, or open a box or pack.")
    @app_commands.describe(item="Item name or id", quantity="How many",
                           user="Use on this member (gifts)")
    async def use(self, interaction: discord.Interaction, item: str,
                  quantity: int = 1, user: discord.Member | None = None):
        await interaction.response.defer(ephemeral=True)
        row = itemdb.resolve_item(item)
        if not row or not row["usable"]:
            await interaction.followup.send("That item can't be used.", ephemeral=True)
            return
        item_id = row["item_id"]
        qty = max(1, min(eco.safe_int(quantity, 1) or 1, 10))
        target = user or interaction.user

        # Containers open server-side from the centralized loot table. The
        # guarded decrement means a double click cannot double-open.
        if row["category"] in ("loot_box", "pack"):
            if qty > 5:
                qty = 5
            opened = []
            for _ in range(qty):
                ok, payload = await itemdb.open_container(
                    database._db, interaction.guild.id, interaction.user.id, item_id)
                if not ok:
                    break
                opened.extend(payload if isinstance(payload, list) else [])
            if not opened:
                await interaction.followup.send("You don't have one of those.", ephemeral=True)
                return
            tally: dict[str, int] = {}
            for pid, n in opened:
                tally[pid] = tally.get(pid, 0) + n
            lines = [f"• **{itemdb.get_item(p)['name']}** `x{n}`"
                     for p, n in sorted(tally.items()) if itemdb.get_item(p)]
            await interaction.followup.send(
                f"🎁 Opened **{qty}** × **{row['name']}**:\n" + "\n".join(lines),
                ephemeral=True)
            return

        if not await eco.remove_item(database._db, interaction.guild.id,
                                     interaction.user.id, item_id, qty):
            await interaction.followup.send("You don't have that many.", ephemeral=True)
            return

        # 1. Flat, immediate payout (validated from the catalog, not the client).
        reward = itemdb.instant_reward(row)
        if reward:
            total = reward * qty
            await eco.apply_delta(database._db, interaction.guild.id, target.id,
                                  total, "item_use", "discord", item_id)
            await interaction.followup.send(
                f"{itemdb.CATEGORY_EMOJI[row['category']]} {target.mention} — **+{total}** coins.",
                ephemeral=True)
            return

        # 2. Timed buff. Non-stacking and replay-safe: re-using refreshes the
        #    same keyed record rather than compounding the bonus.
        if row["effect_type"] and row["effect_duration"] > 0:
            ok, why = await eco.activate_item_effect(
                database._db, interaction.guild.id, target.id, item_id)
            if ok:
                mins = max(1, row["effect_duration"] // 60)
                await interaction.followup.send(
                    f"✨ **{row['name']}** — `{row['effect_type']}` "
                    f"+{int(row['effect_value'] * 100)}% for **{mins} min**.", ephemeral=True)
            else:
                await interaction.followup.send(f"⚠️ {why}", ephemeral=True)
            return

        # 3. Held-item effects need no activation — the item is now owned.
        if row["effect_type"]:
            await interaction.followup.send(
                f"✨ **{row['name']}** equipped — `{row['effect_type']}` "
                f"+{int(row['effect_value'] * 100)}% while you hold it.", ephemeral=True)
            return

        # 4. Legacy system items that do real work outside the item model.
        if item_id == "speed_fertilizer":
            await interaction.followup.send("🧪 Fertilizer applied to ready-soon crops.",
                                            ephemeral=True)
        elif item_id == "farm_plot_deed":
            await database._db.economy_farm.update_one(
                {"guildId": int(interaction.guild.id), "userId": interaction.user.id},
                {"$inc": {"maxPlots": qty}, "$setOnInsert": {"level": 1}}, upsert=True)
            await interaction.followup.send(f"🌾 **+{qty}** farm plot(s).", ephemeral=True)
        elif item_id == "adventure_ticket":
            await interaction.followup.send("🎟️ Ticket redeemed — run `/work adventure`.",
                                            ephemeral=True)
        else:
            await interaction.followup.send(f"Used **{row['name']}**.", ephemeral=True)

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

    @shop.command(name="view", description="Browse the shop.")
    @app_commands.describe(category="Filter by category", rarity="Filter by rarity",
                           query="Search item names", max_price="Maximum price")
    @app_commands.choices(category=_CATEGORY_CHOICES, rarity=_RARITY_CHOICES)
    async def shop_view(self, interaction: discord.Interaction, category: str = "",
                        rarity: str = "", query: str = "", max_price: int | None = None):
        await interaction.response.defer(ephemeral=True)
        found = itemdb.search_items(query, category, rarity, max_price)
        stock = [r for r in found if r["buy_price"] > 0 and r["active"]]
        if not stock:
            await interaction.followup.send("No items match those filters.", ephemeral=True)
            return
        stock.sort(key=lambda r: (itemdb.RANK[r["rarity"]], r["buy_price"]))
        e = embeds.embed("🛒 Murashop", "Buy with `/shop buy item:<name>` · sell with `/shop sell`",
                         embeds.GOLD)
        shown = stock[:20]
        for row in shown:
            e.add_field(name=f"{itemdb.rarity_badge(row['rarity'])} {row['name']}",
                        value=f"**{row['buy_price']}** coins · "
                              f"{itemdb.CATEGORY_LABELS[row['category']]} — {row['description']}",
                        inline=False)
        e.set_footer(text=f"{len(shown)} of {len(stock)} items · `/item <name>` for details")
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
