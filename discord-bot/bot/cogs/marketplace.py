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

import asyncio
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
SWEEP_INTERVAL_SEC = 300
SWEEP_BATCH = 50


def _now():
    return datetime.now(timezone.utc)


def _num(doc: dict, key: str, default: int = 0) -> int:
    """Read a stored listing field as an int without ever raising.

    Listing documents are written by several bot versions and can be edited by
    hand, so `price` / `itemCount` / `seller` may hold `None`, `""`, a float or
    a numeric string. A bare `int()` here would raise mid-settlement and strand
    the listing in `settling` with the seller's escrow still locked away, so
    every stored read goes through the same coercion and logs when the stored
    value was unusable.
    """
    raw = (doc or {}).get(key)
    value = eco.safe_int(raw, default)
    if raw is not None and value == default and eco.safe_int(raw, default + 1) == default:
        log.warning("market listing %s has unusable %s=%r; using %s",
                    (doc or {}).get("listingId"), key, raw, default)
    return value


class MarketCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self._sweeper = None

    market = app_commands.Group(name="market", description="Trade items and coins with other members")

    # ── background expiry ───────────────────────────────────────────────

    @commands.Cog.listener()
    async def on_ready(self):
        """Expire listings on a timer, not only when a member opens /market.

        The lazy sweep alone meant a listing could sit in `open` holding its
        seller's escrow indefinitely in a quiet guild. This costs no slash
        command slot and never blocks a user-facing coroutine.
        """
        if self._sweeper is not None:
            return
        self._sweeper = asyncio.create_task(self._sweep_loop())

    async def _sweep_loop(self):
        await self.bot.wait_until_ready()
        while not self.bot.is_closed():
            try:
                await self._sweep_expired()
            except Exception:
                log.warning("market background sweep failed", exc_info=True)
            await asyncio.sleep(SWEEP_INTERVAL_SEC)

    async def cog_unload(self):
        if self._sweeper is not None:
            self._sweeper.cancel()
            self._sweeper = None

    async def _sweep_expired(self) -> int:
        """Sweep every guild, including ones the bot has since left."""
        try:
            stale = await database._db.economy_market.find(
                {"state": "open", "expiresAt": {"$lte": _now()}}).to_list(SWEEP_BATCH)
        except Exception:
            log.warning("market expiry sweep failed", exc_info=True)
            return 0
        for doc in stale or []:
            await self._expire_one(doc)
        return len(stale or [])

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
            name = d.get("itemName") or "unknown item"
            # A single corrupt doc must not blank the whole board, so the
            # numeric fields are coerced instead of formatted raw.
            lines.append(f"`{d.get('listingId', '?')}` {who} **{name}** "
                         f"x{_num(d, 'itemCount')} — **{_num(d, 'price'):,}** coins")
        e = embeds.embed("🏪 Muragoods Market", "\n".join(lines), embeds.GOLD)
        e.set_footer(text="`/market accept listing:<id>` · `/market remove listing:<id>`")
        await interaction.followup.send(embed=e, ephemeral=True)

    @market.command(name="accept", description="Buy a listed item, or sell into a coin offer.")
    @app_commands.describe(listing="Listing ID from /market view")
    async def accept(self, interaction: discord.Interaction, listing: str):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        await self._sweep(gid)
        # Claim the listing atomically. Two members hitting accept at once must
        # not both settle the same escrow.
        doc = await database._db.economy_market.find_one_and_update(
            {"guildId": gid, "listingId": (listing or "").strip(), "state": "open"},
            {"$set": {"state": "settling", "buyer": uid, "settledAt": _now()}},
            return_document=True)
        if not doc:
            await interaction.followup.send("That listing is gone, sold or expired.", ephemeral=True)
            return

        # Everything past the state flip is inside the try: an unhandled raise
        # here used to leave the listing in `settling` forever with the
        # seller's items or coins locked in escrow and no command able to free
        # them, because only `state: "open"` listings are claimable.
        try:
            seller = _num(doc, "seller")
            price = _num(doc, "price")
            qty = _num(doc, "itemCount")
            if not seller:
                raise ValueError("listing has no usable seller")
            # Both listings are created with price >= 1 and itemCount >= 1, so a
            # value below that means the stored row is corrupt. Settling it
            # anyway is worse than failing: a zero price would hand the buyer
            # the escrowed items for nothing, and a zero count would take the
            # buyer's coins and give them no items. Refuse and release instead.
            if price < 1 or qty < 1:
                raise ValueError(f"listing has unusable price/qty ({price}/{qty})")
            if seller == uid:
                await self._release(doc, "self_accept")
                await interaction.followup.send("You can't accept your own listing.", ephemeral=True)
                return

            if doc.get("type") == "coins":
                # A coin offer is the mirror image of a sale: the poster
                # (stored as `seller`, because they opened the listing)
                # escrowed coins and wants items, and whoever accepts is
                # selling into that offer. So the items move FROM the accepter
                # TO the poster, and the escrowed coins move to the accepter.
                # This branch used to do the exact opposite, which charged the
                # buyer twice over and delivered nothing to the seller.
                moved = []
                for item_id, item_qty in (doc.get("items") or {}).items():
                    item_qty = eco.safe_int(item_qty, 0)
                    if not await eco.remove_item(database._db, gid, uid, item_id, item_qty):
                        # Put back whatever was already taken so a multi-item
                        # offer can't half-settle.
                        for done_id, done_qty in moved:
                            await eco.add_item(database._db, gid, uid, done_id, done_qty)
                        await self._release(doc, "seller_short")
                        await interaction.followup.send(
                            "You don't have those items.", ephemeral=True)
                        return
                    moved.append((item_id, item_qty))
                for item_id, item_qty in moved:
                    await eco.add_item(database._db, gid, seller, item_id, item_qty)
                await eco.apply_delta(database._db, gid, uid, "balance", price,
                                      "market_sell", "discord",
                                      {"listing": doc.get("listingId")})
                await self._close(doc, seller, uid)
                await self._log(gid, uid, ",".join((doc.get("items") or {}).keys()),
                                qty, "market_trade", doc.get("listingId", ""))
                await interaction.followup.send(embed=embeds.ok(
                    "🤝 Sold", f"You sold **{doc.get('itemName')}** for **{price:,}** coins."))
                return

            # Seller listing: buyer pays, seller is paid, items already escrowed.
            item_id = next(iter(doc.get("items") or {}), "")
            paid, _ = await eco.apply_delta(
                database._db, gid, uid, "balance", -price, "market_buy", "discord",
                {"listing": doc.get("listingId")})
            if not paid:
                await self._release(doc, "buyer_broke")
                await interaction.followup.send(
                    "You don't have enough coins — the listing was reopened.", ephemeral=True)
                return
            await eco.add_item(database._db, gid, uid, item_id, qty)
            await eco.apply_delta(database._db, gid, seller, "balance", price,
                                  "market_sell", "discord",
                                  {"listing": doc.get("listingId")})
            await self._close(doc, seller, uid)
            await self._log(gid, uid, item_id, qty, "market_trade", doc.get("listingId", ""))
            await interaction.followup.send(embed=embeds.ok(
                "🤝 Bought",
                f"**{qty}x {doc.get('itemName')}** for **{price:,}** coins."))
        except Exception:
            log.exception("market accept failed")
            await self._release(doc, "error")
            await interaction.followup.send("The trade could not be completed.", ephemeral=True)

    @market.command(name="remove", description="Take down one of your listings.")
    @app_commands.describe(listing="Listing ID from /market view")
    async def remove(self, interaction: discord.Interaction, listing: str):
        await interaction.response.defer(ephemeral=True)
        gid, uid = interaction.guild.id, interaction.user.id
        # Claim before releasing. `find_one` + release let a double-click (or
        # two tabs) return the same escrow twice; claiming flips the row out of
        # `open` in one atomic write, so only the first request can match.
        doc = await database._db.economy_market.find_one_and_update(
            {"guildId": gid, "listingId": (listing or "").strip(),
             "state": "open", "seller": uid},
            {"$set": {"state": "settling", "settledAt": _now()}}, return_document=True)
        if not doc:
            await interaction.followup.send("No open listing of yours with that ID.", ephemeral=True)
            return
        # `reopen=False`: a removed listing is voided, not put back on the
        # board. Leaving it `open` let the seller remove the same listing over
        # and over and take the items back each time.
        await self._release(doc, "removed", reopen=False)
        await interaction.followup.send(embed=embeds.ok(
            "🗑️ Listing removed", "Your reserved items and coins are back."))

    # ── internals ───────────────────────────────────────────────────────
    async def _close(self, doc, seller: int, buyer: int) -> None:
        await database._db.economy_market.update_one(
            {"listingId": doc.get("listingId")},
            {"$set": {"state": "completed", "closedAt": _now(),
                      "seller": seller, "buyer": buyer}})

    async def _release(self, doc, why: str, reopen: bool = True) -> bool:
        """Return a listing's escrow to whoever opened it. Never raises.

        `doc["seller"]` is always the opener: for an `items` listing that is
        the seller whose items are escrowed, for a `coins` listing it is the
        buyer whose coins are escrowed. Either way the escrow belongs to them.

        This is the single way locked value comes back, and it is reached from
        the exception handler in `accept` — so if it raised, the failure would
        escape the handler, the listing would stay in `settling`, and the
        escrow would be unrecoverable. Every stored read is coerced and every
        step is guarded, then the state is always advanced.
        """
        try:
            gid = _num(doc, "guildId")
            seller = _num(doc, "seller")
            if not gid or not seller:
                log.error("cannot release listing %s: guildId/seller unusable (%r)",
                          (doc or {}).get("listingId"), doc)
                await database._db.economy_market.update_one(
                    {"listingId": (doc or {}).get("listingId")},
                    {"$set": {"state": "orphaned", "released": why, "closedAt": _now()}})
                return False

            if doc.get("type") == "coins":
                # `balance` must be passed explicitly: apply_delta takes
                # (db, guild, user, field, amount, ...), so omitting it made
                # the kind string land in `amount` and raised TypeError before
                # the try block — which meant no coin-offer escrow was ever
                # returned and a failed trade stranded its listing in settling.
                await eco.apply_delta(database._db, gid, seller, "balance", _num(doc, "price"),
                                      "market_escrow_refund", "discord", {"reason": why})
            else:
                for item_id, qty in (doc.get("items") or {}).items():
                    if itemdb.get_item(item_id):
                        await eco.add_item(database._db, gid, seller, item_id,
                                           eco.safe_int(qty, 0))
            await database._db.economy_market.update_one(
                {"listingId": doc.get("listingId")},
                {"$set": {"state": "open" if reopen else "voided", "buyer": None,
                          "released": why, "closedAt": None if reopen else _now()}})
            return True
        except Exception:
            log.exception("market release failed for %s", (doc or {}).get("listingId"))
            try:
                await database._db.economy_market.update_one(
                    {"listingId": (doc or {}).get("listingId")},
                    {"$set": {"state": "orphaned", "released": why, "closedAt": _now()}})
            except Exception:
                log.exception("market orphan write failed")
            return False

    async def _expire_one(self, doc) -> bool:
        """Expire a single stale listing, claiming it atomically first.

        The release-then-mark order this replaces was racy: two sweeps could
        both read the same `open` listing and refund its escrow twice.
        """
        listing_id = (doc or {}).get("listingId")
        if not listing_id:
            return False
        try:
            claimed = await database._db.economy_market.find_one_and_update(
                {"listingId": listing_id, "state": "open"},
                {"$set": {"state": "settling", "settledAt": _now()}}, return_document=True)
        except Exception:
            log.warning("market expiry claim failed for %s", listing_id, exc_info=True)
            return False
        if not claimed:
            return False
        await self._release(claimed, "expired", reopen=False)
        try:
            await database._db.economy_market.update_one(
                {"listingId": listing_id}, {"$set": {"state": "expired"}})
        except Exception:
            log.warning("market expiry mark failed for %s", listing_id, exc_info=True)
        return True

    async def _sweep(self, guild_id: int) -> int:
        """Expire this guild's listings whose TTL has passed."""
        try:
            stale = await database._db.economy_market.find(
                {"guildId": guild_id, "state": "open",
                 "expiresAt": {"$lte": _now()}}).to_list(SWEEP_BATCH)
        except Exception:
            log.warning("market sweep failed", exc_info=True)
            return 0
        expired = 0
        for doc in (stale or []):
            if await self._expire_one(doc):
                expired += 1
        return expired

    async def _log(self, guild_id: int, user_id: int, item_id: str,
                   qty: int, kind: str, listing_id: str) -> None:
        try:
            await database._db.economy_tx.insert_one({
                "guildId": eco.safe_int(guild_id), "userId": eco.safe_int(user_id), "type": kind,
                "amount": 0, "itemId": item_id, "quantity": eco.safe_int(qty),
                "listingId": listing_id, "at": _now()})
        except Exception:
            log.warning("market txn log failed", exc_info=True)


async def setup(bot: commands.Bot):
    await bot.add_cog(MarketCog(bot))
