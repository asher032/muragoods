"""`/market` — a player-to-player order board for items and coins.

Market listings use the SAME inventory records and the SAME transaction
ledger as /shop, /fish, /farm, /dig, /work, /quests and /inventory. There is
no separate market inventory.

Reservation lifecycle (the part that is easy to get wrong):

    post_for_items  -> items are debited into escrow and recorded as reserved
    accept          -> buyer pays coins, seller receives coins, items move
    remove / expire -> reserved items are returned to the seller's bag

While a listing is open, the reserved items cannot be sold, used, traded or
posted again: `economy.sell_item` and the inventory `use` path both check
`rewards.reserved_item_ids` before they touch stock.
"""

import logging
import random
import time
import uuid
from datetime import datetime, timedelta, timezone

import discord
from discord import app_commands
from discord.ext import commands

import database
import economy as eco
import embeds
import items as itemdb
import rewards as rw

log = logging.getLogger("bot.market")

LISTING_TTL_SEC = 6 * 3600
MAX_LISTINGS_PER_USER = 5
MAX_COIN_PRICE = 5_000_000


def _now():
    return datetime.now(timezone.utc)


class MarketCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot

    market = app_commands.Group(name="market", description="Trade items and coins with other members")

    # ── listing lifecycle ───────────────────────────────────────────────
    @market.command(name="post_for_items", description="List items for sale.")
    @app_commands.describe(item="Item name or id", quantity="How many", price="Price in coins each")
    async def post_for_items(self, interaction: discord.Interaction, item: str,
                             quantity: int = 1, price: int = 0):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        row = itemdb.resolve_item(item)
        if not row or not row["tradeable"]:
            await interaction.followup.send(
                f"**{row['name'] if row else item}** can't be listed on the market.", ephemeral=True)
            return
        qty = eco.safe_int(quantity, 0)
        ask = eco.safe_int(price, 0)
        if qty < 1 or ask <= 0 or ask > MAX_COIN_PRICE:
            await interaction.followup.send(
                f"Quantity must be 1+, price 1–{MAX_COIN_PRICE:,}.", ephemeral=True)
            return

        await self._sweep(gid)
        count = await database._db.economy_market.count_documents(
            {"guildId": gid, "seller": uid, "state": "open"})
        if count >= MAX_LISTINGS_PER_USER:
            await interaction.followup.send(
                f"You already have **{count}** open listings (max {MAX_LISTINGS_PER_USER}). "
                "Remove one first with `/market remove`.", ephemeral=True)
            return

        # Debit into escrow atomically; the guard is what prevents listing the
        # same copy twice (e.g. two rapid clicks).
        if not await eco.remove_item(database._db, gid, uid, row["item_id"], qty):
            await interaction.followup.send("You don't have that many.", ephemeral=True)
            return

        listing_id = uuid.uuid4().hex[:12]
        await database._db.economy_market.insert_one({
            "listingId": listing_id, "guildId": gid, "seller": uid,
            "items": {row["item_id"]: qty}, "itemCount": qty,
            "price": ask * qty, "unitPrice": ask,
            "type": "items", "state": "open",
            "itemName": row["name"], "rarity": row["rarity"],
            "createdAt": _now(), "expiresAt": _now() + timedelta(seconds=LISTING_TTL_SEC),
        })
        await self._log(gid, uid, row["item_id"], qty, "market_post", listing_id)
        await interaction.followup.send(embed=embeds.ok(
            "🏪 Listed",
            f"**{qty}x {row['name']}** for **{ask * qty:,}** coins each listing.\n"
            f"Reserved until it sells or expires ({LISTING_TTL_SEC // 3600}h). "
            "You can keep playing while it is listed."))

    @market.command(name="post_for_coins", description="Offer coins for an item you want.")
    @app_commands.describe(item="Item name or id", quantity="How many you want", price="Coins each you'll pay")
    async def post_for_coins(self, interaction: discord.Interaction, item: str,
                             quantity: int = 1, price: int = 0):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        row = itemdb.resolve_item(item)
        if not row or not row["tradeable"]:
            await interaction.followup.send(
                f"**{row['name'] if row else item}** can't be bought on the market.", ephemeral=True)
            return
        qty = max(1, eco.safe_int(quantity, 1))
        offer = eco.safe_int(price, 0)
        if offer <= 0 or offer * qty > MAX_COIN_PRICE:
            await interaction.followup.send(f"Offer must be 1–{MAX_COIN_PRICE:,} coins total.",
                                            ephemeral=True)
            return

        # Coins are escrowed immediately so a bid can never be a promise.
        ok, _ = await eco.apply_delta(
            database._db, gid, uid, "balance", -(offer * qty), "market_escrow", "discord",
            {"item": row["item_id"]})
        if not ok:
            await interaction.followup.send("You don't have that many coins.", ephemeral=True)
            return

        listing_id = uuid.uuid4().hex[:12]
        await database._db.economy_market.insert_one({
            "listingId": listing_id, "guildId": gid, "seller": uid, "buyer": None,
            "items": {row["item_id"]: qty}, "itemCount": qty,
            "price": offer * qty, "unitPrice": offer,
            "type": "coins", "state": "open",
            "itemName": row["name"], "rarity": row["rarity"],
            "createdAt": _now(), "expiresAt": _now() + timedelta(seconds=LISTING_TTL_SEC),
        })
        await interaction.followup.send(embed=embeds.ok(
            "🏪 Offer posted",
            f"Offering **{offer * qty:,}** coins for **{qty}x {row['name']}**.\n"
            "Your coins are held in escrow until it sells or expires."))

    @market.command(name="view", description="Browse open listings.")
    @app_commands.describe(item="Only show listings for this item")
    async def view(self, interaction: discord.Interaction, item: str = ""):
        await interaction.response.defer(ephemeral=True)
        gid = interaction.guild.id
        await self._sweep(gid)
        query: dict = {"guildId": gid, "state": "open"}
        row = itemdb.resolve_item(item) if item else None
        if row:
            query[f"items.{row['item_id']}"] = {"$exists": True}
        try:
            docs = await database._db.economy_market.find(query).to_list(25)
        except Exception:
            log.warning("market view failed", exc_info=True)
            await interaction.followup.send("The market is unavailable right now.", ephemeral=True)
            return
        if not docs:
            await interaction.followup.send(
                "No open listings. Post one with `/market post_for_items`.", ephemeral=True)
            return
        lines = []
        for d in docs[:20]:
            who = "💰 buying" if d.get("type") == "coins" else "📦 selling"
            lines.append(f"`{d['listingId']}` {who} **{d.get('itemName')}** x{d.get('itemCount')} "
                         f"— **{d.get('price', 0):,}** coins")
        e = embeds.embed("🏪 Muragoods Market", "\n".join(lines), embeds.GOLD)
        e.set_footer(text="`/market accept listing:<id>` · `/market remove listing:<id>`")
        await interaction.followup.send(embed=e, ephemeral=True)

    @market.command(name="accept", description="Buy a listed item, or sell into a coin offer.")
    @app_commands.describe(listing="Listing ID from /market view")
    async def accept(self, interaction: discord.Interaction, listing: str):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        await self._sweep(gid)
        doc = await database._db.economy_market.find_one_and_update(
            {"guildId": gid, "listingId": (listing or "").strip(), "state": "open"},
            {"$set": {"state": "settling", "buyer": uid, "settledAt": _now()}},
            return_document=True)
        if not doc:
            await interaction.followup.send("That listing is gone, sold or expired.", ephemeral=True)
            return
        seller = int(doc["seller"])
        if seller == uid:
            await self._release(doc, "self_accept")
            await interaction.followup.send("You can't accept your own listing.", ephemeral=True)
            return

        try:
            if doc.get("type") == "coins":
                # Buyer offer: seller hands over the items, buyer gets nothing.
                for item_id, qty in (doc.get("items") or {}).items():
                    if not await eco.remove_item(database._db, gid, seller, item_id, qty):
                        await self._release(doc, "seller_short")
                        await interaction.followup.send(
                            "The seller no longer has those items.", ephemeral=True)
                        return
                await eco.apply_delta(database._db, gid, seller,
                                      int(doc["price"]), "market_sell", "discord",
                                      {"listing": doc["listingId"]})
                await self._close(doc, seller, uid)
                await self._log(gid, seller, ",".join((doc.get("items") or {}).keys()),
                                int(doc.get("itemCount", 0)), "market_trade", doc["listingId"])
                await interaction.followup.send(embed=embeds.ok(
                    "🤝 Sold", f"You sold **{doc.get('itemName')}** for **{int(doc['price']):,}** coins."))
                return

            # Seller listing: buyer pays, seller is paid, items already escrowed.
            item_id = next(iter(doc.get("items") or {}), "")
            qty = int(doc.get("itemCount", 0))
            paid, _ = await eco.apply_delta(
                database._db, gid, uid, "balance", -int(doc["price"]), "market_buy", "discord",
                {"listing": doc["listingId"]})
            if not paid:
                await self._release(doc, "buyer_broke")
                await interaction.followup.send(
                    "You don't have enough coins — the listing was reopened.", ephemeral=True)
                return
            await eco.add_item(database._db, gid, uid, item_id, qty)
            await eco.apply_delta(database._db, gid, seller,
                                  int(doc["price"]), "market_sell", "discord",
                                  {"listing": doc["listingId"]})
            await self._close(doc, seller, uid)
            await self._log(gid, uid, item_id, qty, "market_trade", doc["listingId"])
            await interaction.followup.send(embed=embeds.ok(
                "🤝 Bought",
                f"**{qty}x {doc.get('itemName')}** for **{int(doc['price']):,}** coins."))
        except Exception:
            log.exception("market accept failed")
            await self._release(doc, "error")
            await interaction.followup.send("The trade could not be completed.", ephemeral=True)

    @market.command(name="remove", description="Take down one of your listings.")
    @app_commands.describe(listing="Listing ID from /market view")
    async def remove(self, interaction: discord.Interaction, listing: str):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        doc = await database._db.economy_market.find_one(
            {"guildId": gid, "listingId": (listing or "").strip(), "state": "open", "seller": uid})
        if not doc:
            await interaction.followup.send("No open listing of yours with that ID.", ephemeral=True)
            return
        await self._release(doc, "removed")
        await interaction.followup.send(embed=embeds.ok(
            "🗑️ Listing removed", "Your reserved items and coins are back."))

    # ── internals ───────────────────────────────────────────────────────
    async def _close(self, doc, seller: int, buyer: int) -> None:
        await database._db.economy_market.update_one(
            {"listingId": doc["listingId"]},
            {"$set": {"state": "completed", "closedAt": _now(),
                      "seller": seller, "buyer": buyer}})

    async def _release(self, doc, why: str) -> None:
        """Return a listing's escrow to the seller and re-open/void it."""
        gid = int(doc["guildId"])
        seller = int(doc["seller"])
        if doc.get("type") == "coins":
            await eco.apply_delta(database._db, gid, seller, int(doc.get("price", 0)),
                                  "market_escrow_refund", "discord", {"reason": why})
        else:
            for item_id, qty in (doc.get("items") or {}).items():
                if itemdb.get_item(item_id):
                    await eco.add_item(database._db, gid, seller, item_id, eco.safe_int(qty, 0))
        await database._db.economy_market.update_one(
            {"listingId": doc["listingId"]},
            {"$set": {"state": "open", "buyer": None, "released": why}})

    async def _sweep(self, guild_id: int) -> int:
        """Expire listings whose TTL has passed, returning their escrow."""
        try:
            now = _now()
            stale = await database._db.economy_market.find(
                {"guildId": guild_id, "state": "open", "expiresAt": {"$lte": now}}).to_list(50)
        except Exception:
            log.warning("market sweep failed", exc_info=True)
            return 0
        for doc in stale:
            try:
                await self._release(doc, "expired")
                await database._db.economy_market.update_one(
                    {"listingId": doc["listingId"]}, {"$set": {"state": "expired"}})
            except Exception:
                log.warning("market expiry failed for %s", doc.get("listingId"), exc_info=True)
        return len(stale)

    async def _log(self, guild_id: int, user_id: int, item_id: str,
                   qty: int, kind: str, listing_id: str) -> None:
        try:
            await database._db.economy_tx.insert_one({
                "guildId": int(guild_id), "userId": int(user_id), "type": kind,
                "amount": 0, "itemId": item_id, "quantity": int(qty),
                "listingId": listing_id, "at": _now()})
        except Exception:
            log.warning("market txn log failed", exc_info=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(MarketCog(bot))
