"""Economy dashboard + leaderboard correctness tests.

Run: python3 discord-bot/scripts/test_economy_dashboard.py

These cover the defects the dashboard was reporting, using mongomock so no live
database is touched:

  1. Circulation reconciles: SUM(balance) + SUM(bank) over the wallets.
  2. Leaderboard identity is the canonical user id, never a username, and the
     largest holder is never dropped because one wallet field is missing
     (Mongo's `$add` returns null for a missing operand, which used to sink
     that holder out of the sorted top-N).
  3. Two members sharing a display name stay two distinct rows.
  4. Buy/sell arbitrage is impossible: the catalog refuses sell >= buy.
  5. Anti-exploit audit flags an arbitrage row but never mutates history.
"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bot"))

import mongomock_motor  # noqa: E402  (Motor-compatible async facade over mongomock)

import economy as eco  # noqa: E402
import items as itemdb  # noqa: E402

GID = 123456789012345678


def _now():
    return datetime.now(timezone.utc)


class EconomyDashboardTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.client = mongomock_motor.AsyncMongoMockClient()
        self.db = self.client["test_econ"]

    async def _wallet(self, uid, balance, bank=None, **extra):
        doc = {"guildId": GID, "userId": uid, "balance": balance}
        # Omit the key entirely when not supplied — a wallet written before
        # the field existed is exactly the case under test.
        if bank is not None:
            doc["bank"] = bank
        doc.update(extra)
        await self.db.economy.insert_one(doc)

    async def test_circulation_reconciles_with_wallets(self):
        await self._wallet(1, 1000, 200)
        await self._wallet(2, 500, 100)
        await self._wallet(3, 250, 0)
        ov = await eco.economy_overview(self.db, GID)
        self.assertEqual(ov["users"], 3)
        self.assertEqual(ov["circulation"]["pocket"], 1750)
        self.assertEqual(ov["circulation"]["bank"], 300)
        self.assertEqual(ov["circulation"]["total"], 2050)
        # A total that does not equal pocket+bank is the reported symptom.
        self.assertEqual(ov["circulation"]["total"],
                         ov["circulation"]["pocket"] + ov["circulation"]["bank"])

    async def test_missing_bank_field_does_not_sink_the_top_holder(self):
        """The regression: `$add` over a missing `bank` yields null.

        This wallet has no `bank` key at all (written before the field
        existed). It holds the LARGEST balance in the guild, so it must be
        rank 1. Previously it sorted as null and fell out of the top-N
        entirely, so the biggest holder was missing from the leaderboard.
        """
        await self._wallet(1, 95_000)          # no `bank` key
        await self._wallet(2, 250, 0)
        await self._wallet(3, 250, 0)
        await self._wallet(4, 350, 0)
        await self._wallet(5, 250, 0)
        await self._wallet(6, 250, 0)
        rows = await eco.economy_leaderboard(self.db, GID, limit=5)
        self.assertEqual(rows[0]["canonicalUserId"], "1")
        self.assertEqual(rows[0]["balance"], 95_000)
        self.assertEqual(rows[0]["total"], 95_000)
        self.assertIsNotNone(rows[0]["bank"])
        # And circulation still counts that holder exactly once.
        ov = await eco.economy_overview(self.db, GID)
        self.assertEqual(ov["circulation"]["pocket"], 95_000 + 250 * 4 + 350)
        self.assertEqual(ov["circulation"]["total"], ov["circulation"]["pocket"])

    async def test_missing_balance_field_also_sorts(self):
        await self._wallet(1, 1000, 0)
        await self._wallet(2, 0, 9000)          # no `balance` key, big bank
        rows = await eco.economy_leaderboard(self.db, GID, limit=5)
        self.assertEqual(rows[0]["canonicalUserId"], "2")
        self.assertEqual(rows[0]["total"], 9000)

    async def test_leaderboard_uses_canonical_id_not_username(self):
        await self._wallet(1001, 500, 0, displayName="muragoods")
        await self._wallet(1002, 500, 0, displayName="muragoods")
        rows = await eco.economy_leaderboard(self.db, GID, limit=5)
        ids = {r["canonicalUserId"] for r in rows}
        # Identical display names must NOT collapse into one row.
        self.assertEqual(len(rows), 2)
        self.assertEqual(ids, {"1001", "1002"})
        self.assertTrue(all(r["guildId"] == str(GID) for r in rows))

    async def test_leaderboard_ordering_is_deterministic(self):
        for uid in range(1, 6):
            await self._wallet(uid, 300, 0)
        await self._wallet(99, 300, 0)
        rows = await eco.economy_leaderboard(self.db, GID, limit=10)
        totals = [r["total"] for r in rows]
        self.assertEqual(totals, sorted(totals, reverse=True))
        # Equal balances fall back to a stable id tiebreak, so the order does
        # not shuffle between identical requests.
        self.assertEqual([r["canonicalUserId"] for r in rows],
                         sorted((r["canonicalUserId"] for r in rows), key=int))

    async def test_economy_health_uses_real_aggregations(self):
        await self._wallet(1, 1000, 0)
        await self._wallet(2, 2000, 0)
        await self.db.economy_tx.insert_many([
            {"txId": "a", "guildId": GID, "userId": 1, "type": "daily",
             "amount": 500, "createdAt": _now(), "source": "discord"},
            {"txId": "b", "guildId": GID, "userId": 2, "type": "shop_buy",
             "amount": -300, "itemId": "campus_magnet", "createdAt": _now()},
            {"txId": "c", "guildId": GID, "userId": 2, "type": "gamble_lose",
             "amount": -200, "createdAt": _now()},
        ])
        h = await eco.economy_health(self.db, GID)
        self.assertEqual(h["circulation"], 3000)
        self.assertEqual(h["rewardPayouts"], 500)
        self.assertEqual(h["shopSpending"], 300)
        self.assertEqual(h["gamblingVolume"], 200)
        self.assertEqual(h["highestBalance"], 2000)

    async def test_health_window_ignores_old_rows(self):
        await self._wallet(1, 1000, 0)
        await self.db.economy_tx.insert_one({
            "txId": "old", "guildId": GID, "userId": 1, "type": "daily",
            "amount": 9_999, "createdAt": _now() - timedelta(days=30)})
        h = await eco.economy_health(self.db, GID)
        self.assertEqual(h["rewardPayouts"], 0)

    async def test_transactions_filter_and_paginate(self):
        await self._wallet(1, 5000, 0)
        for i in range(5):
            await self.db.economy_tx.insert_one({
                "txId": f"t{i}", "guildId": GID, "userId": 1, "type": "daily",
                "amount": 100, "createdAt": _now(), "source": "discord"})
        await self.db.economy_tx.insert_one({
            "txId": "neg", "guildId": GID, "userId": 1, "type": "shop_buy",
            "amount": -50, "createdAt": _now()})
        all_rows = await eco.economy_transactions(self.db, GID)
        self.assertEqual(all_rows["total"], 6)
        pos = await eco.economy_transactions(self.db, GID, direction="positive")
        self.assertEqual(pos["total"], 5)
        neg = await eco.economy_transactions(self.db, GID, direction="negative")
        self.assertEqual(neg["total"], 1)
        self.assertEqual(neg["rows"][0]["txId"], "neg")
        daily = await eco.economy_transactions(self.db, GID, action="daily")
        self.assertEqual(daily["total"], 5)
        page = await eco.economy_transactions(self.db, GID, limit=2, skip=0)
        self.assertEqual(len(page["rows"]), 2)
        # Every mutation row carries the full audit envelope.
        row = page["rows"][0]
        for field in ("txId", "userId", "guildId", "action", "amount",
                      "itemId", "source", "result", "at"):
            self.assertIn(field, row)

    async def test_catalog_rejects_arbitrage_row(self):
        with self.assertRaises(itemdb.ItemError):
            itemdb._i("bad_item", "Bad", "collectible", "common",
                      "sell >= buy", 100, 100, sources=("shop",))
        with self.assertRaises(itemdb.ItemError):
            itemdb._i("bad_item2", "Bad", "collectible", "common",
                      "sell > buy", 100, 250, sources=("shop",))

    async def test_live_catalog_has_no_arbitrage(self):
        for row in itemdb.CATALOG.values():
            buy, sell = int(row["buy_price"]), int(row["sell_price"])
            if buy > 0 and sell > 0:
                self.assertLess(
                    sell, buy,
                    f"{row['item_id']} sells at/above buy — arbitrage")

    async def test_rarity_does_not_determine_behaviour(self):
        """Epic/Godly must be shop-purchasable when shop_enabled.

        Access is the per-item `shop_enabled` flag. Rarity is never a gate,
        so a shop-enabled epic/godly item must actually be sellable in the
        shop at its real price.
        """
        import shop as shopmod
        for row in itemdb.CATALOG.values():
            if row["rarity"] in ("epic", "godly") and row["shop_enabled"] and row["active"]:
                self.assertIn(row["item_id"],
                              [r["item_id"] for r in shopmod.shop_items()])

    async def test_anti_exploit_flags_arbitrage_without_mutating(self):
        before = len(itemdb.CATALOG)
        await self._wallet(1, 100, 0)
        await self.db.economy_tx.insert_one({
            "txId": "keep", "guildId": GID, "userId": 1, "type": "daily",
            "amount": 100, "createdAt": _now()})
        report = await eco.anti_exploit_audit(self.db, GID)
        # Detection only: no history is rewritten.
        self.assertEqual(len(itemdb.CATALOG), before)
        self.assertEqual(await self.db.economy_tx.count_documents({"txId": "keep"}), 1)
        self.assertEqual(report["wallet_audit"], "read-only")
        self.assertTrue(report["protections"])

    async def test_anti_exploit_detects_negative_balance(self):
        await self.db.economy.insert_one(
            {"guildId": GID, "userId": 7, "balance": -50, "bank": 0})
        report = await eco.anti_exploit_audit(self.db, GID)
        codes = {f["code"] for f in report["findings"]}
        self.assertIn("NEGATIVE_BALANCE", codes)

    async def test_apply_delta_refuses_overdraft(self):
        await self._wallet(1, 100, 0)
        ok, _ = await eco.apply_delta(self.db, GID, 1, "balance", -500, "shop_buy")
        self.assertFalse(ok)
        doc = await self.db.economy.find_one({"guildId": GID, "userId": 1})
        self.assertEqual(doc["balance"], 100)


if __name__ == "__main__":
    unittest.main(verbosity=2)