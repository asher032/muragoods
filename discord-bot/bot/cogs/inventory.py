"""`/inventory` group — items, shop, crafting, collections.

Same item catalog and guarded stock mutations as every other surface
(dashboard reads the same collections). Locked/quest items cannot be sold.
"""

import logging
from typing import Any

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds
import items as itemdb
import shop as shopmod
import rewards as rw
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
    if row["shop_enabled"] and row["buy_price"]:
        buy = f"**{row['buy_price']:,}** coins"
    else:
        buy = "Not sold in the Murashop"
    sell = f"**{row['sell_price']:,}** coins" if row["sellable"] else "Not sellable"
    stock = row.get("shop_stock")
    flags = " · ".join(filter(None, [
        (f"📦 {stock} per rotation" if stock is not None else "📦 Unlimited stock")
        if row["shop_enabled"] else "",
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


#: The Murashop sections live in `bot/shop.py` so the rotation and stock rules
#: have one owner. They are re-exported here because the command's choice list
#: and the help text are the shop's public surface.
SHOP_SECTIONS: dict[str, str] = {k: v["label"] for k, v in shopmod.SECTIONS.items()}


def _stock_text(remaining: int | None) -> str:
    """Stock line for a shop row. `None` means unlimited."""
    if remaining is None:
        return "♾️ Unlimited"
    if remaining <= 0:
        return "❌ Out of stock"
    return f"📦 Stock: {remaining}"


def _shop_line(row: dict, remaining: int | None) -> str:
    """One shop row: name, icon, rarity, description, price, stock."""
    return (f"**{row['buy_price']:,}** coins · "
            f"{itemdb.CATEGORY_LABELS[row['category']]} — {row['description']}\n"
            f"{_stock_text(remaining)}")


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

    @app_commands.command(name="items", description="Browse the whole Muragoods item catalog.")
    @app_commands.describe(category="Filter by category", rarity="Filter by rarity",
                           source="Only items that can come from this source",
                           tradeable="Only tradeable items", owned="Only items you own",
                           query="Search item names")
    @app_commands.choices(category=_CATEGORY_CHOICES, rarity=_RARITY_CHOICES)
    @app_commands.choices(source=[app_commands.Choice(name=s, value=s)
                                  for s in itemdb.REWARD_SOURCES])
    async def items_browse(self, interaction: discord.Interaction, category: str = "",
                           rarity: str = "", source: str = "", tradeable: bool | None = None,
                           owned: bool | None = None, query: str = ""):
        await interaction.response.defer(ephemeral=True)
        found = itemdb.search_items(query, category, rarity)
        if source:
            found = [r for r in found if source in r["drop_sources"]]
        if tradeable is not None:
            found = [r for r in found if r["tradeable"] == tradeable]
        if owned is not None:
            bag = await eco.get_inventory(database._db, interaction.guild.id, interaction.user.id)
            held = {k for k, v in (bag or {}).items() if eco.safe_int(v) > 0}
            found = [r for r in found if (r["item_id"] in held) == owned]
        if not found:
            await interaction.followup.send("No items match those filters.", ephemeral=True)
            return
        e = embeds.embed("📖 Muragoods Encyclopedia",
                         f"**{len(found)}** of {len(itemdb.CATALOG)} items · "
                         "`/item <name>` for a full page", embeds.INFO)
        for rar in itemdb.RARITIES:
            rows = [r for r in found if r["rarity"] == rar]
            if not rows:
                continue
            names = ", ".join(r["name"] for r in rows[:20])
            more = f" … +{len(rows) - 20}" if len(rows) > 20 else ""
            e.add_field(name=f"{itemdb.rarity_badge(rar)} · {len(rows)}",
                        value=f"{names}{more}", inline=False)
        await interaction.followup.send(embed=e, ephemeral=True)

    @app_commands.command(name="collection", description="Your collectible progress by rarity and bundle.")
    async def collection_progress(self, interaction: discord.Interaction):
        """One collection view: rarity discovery AND the legacy bundle rewards.

        This replaces `/inventory collection` and `/inventory bundles`, which
        were near-duplicates of each other and sat against Discord's 100-command
        cap. Both showed the same `COLLECTIONS` table.
        """
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        bag = await eco.get_inventory(database._db, gid, uid)
        held = {k for k, v in (bag or {}).items()
                if eco.safe_int(v) > 0 and itemdb.get_item(k) is not None}
        e = embeds.embed("📚 Muragoods Collection",
                         f"**{len(held)}** unique items discovered. "
                         "Duplicate copies do not count twice.", embeds.GOLD)
        for rar in itemdb.RARITIES:
            total = len(itemdb.items_by_rarity(rar))
            have = len([i for i in held if itemdb.get_item(i)["rarity"] == rar])
            e.add_field(name=itemdb.rarity_badge(rar),
                        value=f"{have} / {total} discovered", inline=True)
        if eco.COLLECTIONS:
            done = await eco.check_collection(database._db, gid, uid)
            lines = []
            for _cid, bundle in eco.COLLECTIONS.items():
                have_txt = ", ".join(
                    f"{itemdb.get_item(i)['name'] if itemdb.get_item(i) else i} "
                    f"{min(eco.safe_int(bag.get(i)), eco.safe_int(q))}/{eco.safe_int(q)}"
                    for i, q in (bundle.get("needs") or {}).items())
                lines.append(f"**{bundle['name']}** — {have_txt} → **{bundle['reward']}**")
            e.add_field(name="🎁 Bundles", value="\n".join(lines), inline=False)
            if done:
                e.add_field(name="Completed", value=", ".join(done), inline=False)
        await interaction.followup.send(embed=e, ephemeral=True)

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

        # A reserved market listing must not be consumable either — otherwise a
        # player could burn the very copy they put up for sale. Checked BEFORE
        # the decrement, so there is no remove-then-restore window.
        reserved = await rw.reserved_item_ids(
            database._db, interaction.guild.id, interaction.user.id)
        if (item_id, qty) in reserved or any(i == item_id for i, _ in reserved):
            await interaction.followup.send(
                "📌 That item is reserved on the market — take the listing down first "
                "with `/market remove`.", ephemeral=True)
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

    @shop.command(name="view", description="Browse the Murashop.")
    @app_commands.describe(section="Shop section", category="Filter by category",
                           rarity="Filter by rarity", query="Search item names",
                           max_price="Maximum price")
    @app_commands.choices(category=_CATEGORY_CHOICES, rarity=_RARITY_CHOICES)
    @app_commands.choices(section=[
        app_commands.Choice(name=s, value=s) for s in SHOP_SECTIONS])
    async def shop_view(self, interaction: discord.Interaction, section: str = "",
                        category: str = "", rarity: str = "", query: str = "",
                        max_price: int | None = None):
        await interaction.response.defer(ephemeral=True)
        gid = interaction.guild.id
        # `shop_enabled` is the only gate. Rarity is never one — epic and
        # godly items are listed and sold exactly like everything else.
        rows = [r for r in shopmod.shop_items(section)
                if (not category or r["category"] == category)
                and (not rarity or r["rarity"] == itemdb.normalize_rarity(rarity, ""))
                and (not query or query.lower() in r["name"].lower())
                and (max_price is None or r["buy_price"] <= max_price)]
        if not rows:
            await interaction.followup.send(
                "No items match those filters — try `/shop view` with no filters.",
                ephemeral=True)
            return
        stock = await shopmod.stock_map(db=database._db, guild_id=gid, rows=rows[:20])
        label = SHOP_SECTIONS.get(section, "All Sections")
        blurb = shopmod.SECTIONS.get(section, {}).get("blurb", "")
        resets = ""
        if section:
            resets = f"\n🔄 Rotates in {shopmod.time_left(section)}"
        e = embeds.embed(f"🛒 Murashop — {label}",
                         f"{blurb}{resets}".strip(),
                         embeds.GOLD)
        for row in rows[:20]:
            e.add_field(name=f"{itemdb.rarity_badge(row['rarity'])} {row['name']}",
                        value=_shop_line(row, stock.get(row["item_id"])),
                        inline=False)
        e.set_footer(text=f"{min(len(rows), 20)} of {len(rows)} items · "
                          f"buy with `/shop buy item:<name>`")
        await interaction.followup.send(embed=e, ephemeral=True)

    @shop.command(name="buy", description="Purchase items from the shop.")
    @app_commands.describe(item="Item name or id (see /shop view)", quantity="How many (1-99)")
    @app_commands.autocomplete(item=_item_autocomplete)
    async def shop_buy(self, interaction: discord.Interaction, item: str, quantity: int = 1):
        await interaction.response.defer(ephemeral=True)
        # The price, stock and item are all resolved server-side; the client
        # only ever sends a name and a quantity.
        row = itemdb.resolve_item(item)
        if not row:
            await interaction.followup.send("Unknown item — try `/shop view`.", ephemeral=True)
            return
        qty = max(1, min(eco.safe_int(quantity, 1), 99))
        ok, msg = await eco.buy_item(
            database._db, interaction.guild.id, interaction.user.id, row["item_id"], qty)
        if not ok:
            await interaction.followup.send(f"⚠️ {msg}", ephemeral=True)
            return
        left = await shopmod.stock_left(database._db, interaction.guild.id, row["item_id"])
        stock_note = "" if left is None else f"\n{_stock_text(left)} for this rotation."
        await interaction.followup.send(embed=embeds.ok(
            f"🛒 Bought {row['name']}",
            f"**×{qty}** for **{row['buy_price'] * qty:,}** coins.{stock_note}\n"
            f"Added to `/inventory`."))

    @shop.command(name="sell", description="Sell eligible items.")
    @app_commands.describe(item="Item name or id", quantity="How many")
    @app_commands.autocomplete(item=_item_autocomplete)
    async def shop_sell(self, interaction: discord.Interaction, item: str, quantity: int = 1):
        await interaction.response.defer(ephemeral=True)
        row = itemdb.resolve_item(item)
        if not row:
            await interaction.followup.send("Unknown item — try `/inventory view`.", ephemeral=True)
            return
        qty = max(1, min(eco.safe_int(quantity, 1), 99))
        ok, msg = await eco.sell_item(
            database._db, interaction.guild.id, interaction.user.id, row["item_id"], qty)
        if not ok:
            await interaction.followup.send(f"⚠️ {msg}", ephemeral=True)
            return
        await interaction.followup.send(embed=embeds.ok(
            f"💰 Sold {row['name']}",
            f"**×{qty}** for **{row['sell_price'] * qty:,}** coins."))

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
