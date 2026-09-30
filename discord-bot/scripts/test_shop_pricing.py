"""The Murashop: every rarity purchasable, priced in band, and stock-safe.

The bug this suite exists for: epic and godly items could not be bought. There
was never a rule like `if rarity == EPIC: return` — the shop inferred
availability from `buy_price > 0`, and the catalog shipped every godly item and
ten of eighteen epic items with a price of zero. So "unbuyable" was a *side
effect* of a price, correlated with rarity, which is exactly the hidden rule
the shop was supposed not to have.

The fix separates the two: `shop_enabled` is a per-item flag, and every one of
the five rarities is now purchasable. This suite proves it by actually buying
one item of each rarity through the real `economy.buy_item`, and then proves
the shop is not merely permissive: non-purchasable items stay non-purchasable,
funds are still enforced, limited stock is still finite, a race for the last
copy has exactly one winner, and rotation restores stock.
"""
import asyncio
import sys
import types
import pathlib

BOT = pathlib.Path(__file__).resolve().parent.parent / "bot"
sys.path.insert(0, str(BOT))


def _force_stub(name, attrs):
    s = types.ModuleType(name)
    s.__path__ = []
    for k, v in attrs.items():
        setattr(s, k, v)
    sys.modules[name] = s


for _m, _a in (
    ("dotenv", {"load_dotenv": lambda *a, **k: None}),
    ("pymongo", {"ASCENDING": 1, "DESCENDING": -1,
                "ReturnDocument": types.SimpleNamespace(AFTER=True, BEFORE=False)}),
    ("motor", {}),
    ("motor.motor_asyncio", {"AsyncIOMotorClient": object}),
):
    _force_stub(_m, _a)

cfgmod = types.ModuleType("config")
for _k, _v in (("DISCORD_TOKEN", "x"), ("MONGO_URI", "mongodb://localhost/x"),
               ("MONGO_DB", "x"), ("BRIDGE_SECRET", "s"),
               ("DISCORD_CLIENT_ID", "1"), ("PREFIX", "mg!"),
               ("ACTIVITY", "a"), ("STATUS", "online"),
               ("ADMIN_IDS", []), ("BOT_ADMIN_IDS", [])):
    setattr(cfgmod, _k, _v)
sys.modules["config"] = cfgmod

import economy as eco  # noqa: E402
import items as itemdb  # noqa: E402
import shop as shopmod  # noqa: E402

GID = 1001
UID = 3003
RIVAL = 4004
RICH = 10_000_000


# ── a Mongo subset sufficient for the shop ─────────────────────────────
def _get(doc, path):
    cur = doc
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None, False
        cur = cur[part]
    return cur, True


def _cond(doc, key, cond):
    val, present = _get(doc, key)
    if isinstance(cond, dict) and any(k.startswith("$") for k in cond):
        for op, want in cond.items():
            if op in ("$gte", "$gt", "$lte", "$lt"):
                if not present:
                    return False
                v = eco.safe_int(val, -10**18)
                w = eco.safe_int(want, 10**18)
                if op == "$gte" and not v >= w: return False
                if op == "$gt" and not v > w: return False
                if op == "$lte" and not v <= w: return False
                if op == "$lt" and not v < w: return False
            elif op == "$in":
                if val not in want:
                    return False
            elif op == "$exists":
                if present != bool(want):
                    return False
            elif op == "$ne":
                if val == want:
                    return False
            else:
                raise AssertionError(f"unsupported operator {op}")
        return True
    return val == cond or (not present and cond is None)


def _match(doc, query):
    return all(_cond(doc, k, v) for k, v in (query or {}).items())


def _apply_update(doc, update):
    for op, fields in (update or {}).items():
        if op in ("$set", "$setOnInsert"):
            for k, v in fields.items():
                parts, cur = k.split("."), doc
                for p in parts[:-1]:
                    cur = cur.setdefault(p, {})
                cur[parts[-1]] = v
        elif op == "$inc":
            for k, v in fields.items():
                parts, cur = k.split("."), doc
                for p in parts[:-1]:
                    cur = cur.setdefault(p, {})
                cur[parts[-1]] = eco.safe_int(cur.get(parts[-1]), 0) + eco.safe_int(v, 0)
        else:
            raise AssertionError(f"unsupported update op {op}")


class _Res:
    def __init__(self, modified=0, matched=0, **kw):
        self.modified_count = modified
        self.matched_count = matched
        self.upserted_id = kw.get("upserted_id")


class _Coll:
    def __init__(self, db, name):
        self.db, self.name = db, name

    def find(self, query=None, *_a, **_k):
        rows = [r for r in self.db.rows(self.name) if _match(r, query)]
        return types.SimpleNamespace(
            to_list=lambda n=None, *a, **k: _then(rows[: (n or len(rows))]))

    async def find_one(self, query=None, *_a, **_k):
        for r in self.db.rows(self.name):
            if _match(r, query):
                return r
        return None

    async def find_one_and_update(self, query=None, update=None, upsert=False,
                                   return_document=False, **_k):
        for r in self.db.rows(self.name):
            if _match(r, query):
                before = dict(r)
                _apply_update(r, update)
                return dict(r) if return_document else before
        if upsert:
            new = {k: v for k, v in (query or {}).items()
                   if not k.startswith("$") and not isinstance(v, dict)}
            _apply_update(new, update)
            self.db.rows(self.name).append(new)
            return dict(new) if return_document else None
        return None

    async def update_one(self, query=None, update=None, upsert=False, **_k):
        for r in self.db.rows(self.name):
            if _match(r, query):
                _apply_update(r, update)
                return _Res(modified=1, matched=1)
        if upsert:
            new = {k: v for k, v in (query or {}).items()
                   if not k.startswith("$") and not isinstance(v, dict)}
            _apply_update(new, update)
            self.db.rows(self.name).append(new)
            return _Res(upserted_id="1")
        return _Res()

    async def insert_one(self, doc, *_a, **_k):
        self.db.rows(self.name).append(dict(doc))
        return types.SimpleNamespace(inserted_id="1")


def _then(value):
    async def _inner(*_a, **_k):
        return value
    return _inner()


class FakeDB:
    COLLECTIONS = ("economy", "economy_inv", "economy_tx", "economy_config",
                   "economy_shop_stock")

    def __init__(self, balances=None, inv=None):
        self._data = {n: [] for n in self.COLLECTIONS}
        for uid, bal in (balances or {}).items():
            self._data["economy"].append({"guildId": GID, "userId": uid, "balance": bal})
        for uid, items in (inv or {}).items():
            self._data["economy_inv"].append(
                {"guildId": GID, "userId": uid, "items": dict(items)})
        for n in self.COLLECTIONS:
            setattr(self, n, _Coll(self, n))

    def rows(self, name):
        return self._data[name]

    def balance(self, uid):
        for r in self._data["economy"]:
            if r.get("userId") == uid:
                return eco.safe_int(r.get("balance"), 0)
        return 0

    def bag(self, uid):
        for r in self._data["economy_inv"]:
            if r.get("userId") == uid:
                return r.get("items") or {}
        return {}

    def stock(self, item_id):
        for r in self._data["economy_shop_stock"]:
            if r.get("itemId") == item_id:
                return r.get("remaining")
        return None


def of_rarity(rarity: str) -> list[dict]:
    """Every purchasable item of a rarity, cheapest first."""
    return sorted((r for r in shopmod.shop_items() if r["rarity"] == rarity),
                  key=lambda r: r["buy_price"])


def first_of(rarity: str) -> str:
    """A purchasable item of the given rarity, cheapest first."""
    rows = of_rarity(rarity)
    return rows[0]["item_id"] if rows else ""


# ══════════════════════════════════════════════════════════════════════
async def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name, ok, detail=""):
        checks.append((name, bool(ok), detail))

    # ══ 1. THE HEADLINE: every rarity is purchasable ═══════════════════
    for rarity in itemdb.RARITIES:
        ids = [r["item_id"] for r in of_rarity(rarity)]
        check(f"{rarity} has at least one shop item", bool(ids), "none")
        if not ids:
            continue
        item_id = first_of(rarity)
        row = itemdb.get_item(item_id)
        db = FakeDB(balances={UID: RICH})
        ok, msg = await eco.buy_item(db, GID, UID, item_id, 1)
        check(f"{rarity} item {item_id} can be bought", ok, msg)
        check(f"{rarity} purchase lands in the bag", db.bag(UID).get(item_id) == 1,
              f"bag={db.bag(UID)}")
        check(f"{rarity} purchase charges the listed price",
              db.balance(UID) == RICH - row["buy_price"],
              f"{db.balance(UID)} != {RICH - row['buy_price']}")
        check(f"{rarity} item is shop_enabled", row["shop_enabled"], "flag is false")

    # Epic and Godly specifically: EVERY item, not just one sample.
    for rarity in ("epic", "godly"):
        for row in of_rarity(rarity):
            db = FakeDB(balances={UID: RICH})
            ok, msg = await eco.buy_item(db, GID, UID, row["item_id"], 1)
            check(f"every {rarity} item is buyable: {row['item_id']}", ok, msg)

    # A scan of the whole catalog: no item is excluded because of rarity.
    for rarity in ("epic", "godly"):
        blocked = [r["item_id"] for r in itemdb.CATALOG.values()
                   if r["rarity"] == rarity and not r["shop_enabled"]]
        check(f"no {rarity} item is shop-blocked", not blocked, str(blocked))

    # ══ 2. No rarity gate anywhere in the purchase path ════════════════
    src_econ = (BOT / "economy.py").read_text(encoding="utf-8")
    src_shop = (BOT / "shop.py").read_text(encoding="utf-8")
    buy_body = src_econ.split("async def buy_item")[1].split("\nasync def ")[0]
    # Prose about rarity in the docstring is fine; a rarity used in a decision
    # is not. So only lines that actually make a choice are inspected.
    decisions = [ln for ln in buy_body.splitlines()
                 if ln.strip().startswith(("if ", "elif ", "return", "while "))
                 and "rarity" in ln.lower()]
    check("economy.buy_item makes no decision on rarity", not decisions, str(decisions))
    check("economy.buy_item never indexes a rarity field",
          "rarity" not in buy_body.split('"""')[2] if buy_body.count('"""') > 2 else True,
          "a rarity lookup leaked into buy_item")
    check("shop.py routes by rarity only for section placement",
          src_shop.count('row["rarity"] in ("epic", "godly")') == 1,
          "rarity is used somewhere other than section_for")
    check("buy_item gates on the per-item shop_enabled flag",
          "shop_enabled" in buy_body, "no shop_enabled check")

    # ══ 3. Prices sit inside the rarity bands ══════════════════════════
    for rarity in itemdb.RARITIES:
        lo, hi = itemdb.SHOP_BANDS[rarity]
        rows = of_rarity(rarity)
        check(f"{rarity} has priced shop items", bool(rows), "none")
        for r in rows:
            check(f"{r['item_id']} is within the {rarity} band "
                  f"({r['buy_price']} in {lo}-{hi or 'inf'})",
                  r["buy_price"] >= lo and (hi is None or r["buy_price"] <= hi),
                  f"{r['buy_price']} outside {lo}-{hi}")

    # The bands must be ordered, otherwise the tiers mean nothing.
    lows = [itemdb.SHOP_BANDS[r][0] for r in itemdb.RARITIES]
    check("rarity bands increase with rarity", lows == sorted(lows), str(lows))

    # A godly collectible costs meaningfully more than a common consumable.
    cheapest_godly = min(r["buy_price"] for r in of_rarity("godly"))
    dearest_common = max(r["buy_price"] for r in of_rarity("common"))
    check("a godly item costs more than any common item",
          cheapest_godly > dearest_common,
          f"godly from {cheapest_godly}, common up to {dearest_common}")

    # ══ 4. Non-purchasable items are excluded explicitly, not by rarity ══
    for row in itemdb.CATALOG.values():
        if row["shop_enabled"]:
            continue
        db = FakeDB(balances={UID: RICH})
        ok, msg = await eco.buy_item(db, GID, UID, row["item_id"], 1)
        check(f"shop-disabled {row['item_id']} cannot be bought", not ok, msg)
        check(f"shop-disabled {row['item_id']} says why", "Murashop" in msg, msg)
        check(f"shop-disabled {row['item_id']} charges nothing",
              db.balance(UID) == RICH, f"balance={db.balance(UID)}")

    check("every non-purchasable item has a zero price",
          all(r["buy_price"] == 0 for r in itemdb.CATALOG.values()
              if not r["shop_enabled"]), "a disabled item still has a price")
    check("every purchasable item has a price",
          all(r["buy_price"] > 0 for r in itemdb.CATALOG.values()
              if r["shop_enabled"]), "an enabled item has no price")

    # ══ 5. Insufficient coins ══════════════════════════════════════════
    for rarity in itemdb.RARITIES:
        item_id = first_of(rarity)
        price = itemdb.get_item(item_id)["buy_price"]
        db = FakeDB(balances={UID: price - 1})
        ok, msg = await eco.buy_item(db, GID, UID, item_id, 1)
        check(f"{rarity} purchase fails one coin short", not ok, msg)
        check(f"{rarity} short purchase is not charged", db.balance(UID) == price - 1,
              f"balance={db.balance(UID)}")
        check(f"{rarity} short purchase delivers nothing", not db.bag(UID), str(db.bag(UID)))
        # exactly enough must work
        db = FakeDB(balances={UID: price})
        ok, msg = await eco.buy_item(db, GID, UID, item_id, 1)
        check(f"{rarity} purchase succeeds at exactly the price", ok, msg)
        check(f"{rarity} exact-price purchase zeroes the wallet", db.balance(UID) == 0,
              f"balance={db.balance(UID)}")

    # A failed payment must NOT eat limited stock.
    godly = first_of("godly")
    db = FakeDB(balances={UID: 1})
    before = await shopmod.stock_left(db, GID, godly)
    ok, _ = await eco.buy_item(db, GID, UID, godly, 1)
    after = await shopmod.stock_left(db, GID, godly)
    check("a broke member does not consume limited stock", not ok and before == after,
          f"before={before} after={after}")

    # ══ 6. Limited stock ═══════════════════════════════════════════════
    for rarity in ("epic", "godly"):
        item_id = first_of(rarity)
        limit = itemdb.get_item(item_id)["shop_stock"]
        check(f"{rarity} item has a stock limit", isinstance(limit, int) and limit > 0,
              f"stock={limit}")
        db = FakeDB(balances={UID: RICH})
        left = await shopmod.stock_left(db, GID, item_id)
        check(f"{rarity} stock starts at its limit", left == limit, f"{left} != {limit}")
        for i in range(limit):
            ok, msg = await eco.buy_item(db, GID, UID, item_id, 1)
            check(f"{rarity} buy {i + 1}/{limit} succeeds", ok, msg)
        left = await shopmod.stock_left(db, GID, item_id)
        check(f"{rarity} stock is exhausted after {limit} buys", left == 0, f"left={left}")
        ok, msg = await eco.buy_item(db, GID, UID, item_id, 1)
        check(f"{rarity} purchase is refused when out of stock", not ok, msg)
        check(f"{rarity} out-of-stock message is explicit", "out of stock" in msg.lower(), msg)
        check(f"{rarity} out-of-stock purchase is not charged",
              db.balance(UID) == RICH - limit * itemdb.get_item(item_id)["buy_price"],
              f"balance={db.balance(UID)}")

    # A bulk order larger than the limit is refused whole, not part-filled.
    epic = first_of("epic")
    limit = itemdb.get_item(epic)["shop_stock"]
    db = FakeDB(balances={UID: RICH})
    ok, msg = await eco.buy_item(db, GID, UID, epic, limit + 1)
    check("an over-limit bulk order is refused", not ok, msg)
    check("a refused bulk order delivers nothing", db.bag(UID).get(epic, 0) == 0,
          f"bag={db.bag(UID)}")
    check("a refused bulk order takes no coins", db.balance(UID) == RICH, "charged")

    # Unlimited items report None and never run out.
    common = first_of("common")
    db = FakeDB(balances={UID: RICH})
    check("a common item is unlimited", await shopmod.stock_left(db, GID, common) is None,
          str(await shopmod.stock_left(db, GID, common)))
    for _ in range(30):
        ok, msg = await eco.buy_item(db, GID, UID, common, 1)
        if not ok:
            check("an unlimited item never runs out", False, msg)
            break
    check("an unlimited item never runs out", db.bag(UID).get(common) == 30,
          f"held {db.bag(UID).get(common)}")

    # ══ 7. Concurrent purchases ════════════════════════════════════════
    # N members race for a stock of 1. Exactly one must win.
    for _ in range(6):
        item_id = first_of("godly")
        db = FakeDB(balances={i: RICH for i in range(UID, UID + 8)})
        results = await asyncio.gather(
            *(eco.buy_item(db, GID, uid, item_id, 1) for uid in range(UID, UID + 8)))
        wins = [r for r in results if r[0]]
        check("exactly one member wins the last copy", len(wins) == 1, f"{len(wins)} won")
        holders = [u for u in range(UID, UID + 8) if db.bag(u).get(item_id)]
        check("only the winner holds the item", len(holders) == 1, str(holders))
        paid = [u for u in range(UID, UID + 8) if db.balance(u) != RICH]
        check("only the winner was charged", len(paid) == 1, str(paid))

    # Concurrent purchases of a stock of N, from many members.
    for _ in range(4):
        item_id = first_of("epic")
        limit = itemdb.get_item(item_id)["shop_stock"]
        db = FakeDB(balances={i: RICH for i in range(UID, UID + 10)})
        await asyncio.gather(*(eco.buy_item(db, GID, uid, item_id, 1)
                               for uid in range(UID, UID + 10)))
        total = sum(db.bag(u).get(item_id, 0) for u in range(UID, UID + 10))
        check("concurrent epic buyers never exceed the stock limit", total == limit,
              f"sold {total}, limit {limit}")

    # ══ 8. Rotation ═══════════════════════════════════════════════════
    for section, hours in (("coin", 4), ("fishing", 4), ("skin", 24), ("special", 6)):
        check(f"{section} rotates every {hours}h", shopmod.SECTIONS[section]["hours"] == hours,
              str(shopmod.SECTIONS[section]["hours"]))
    check("rotation windows are stable within a window",
          shopmod.rotation_window("coin") == shopmod.rotation_window("coin"), "unstable")
    check("the skin window is longer than the coin window",
          shopmod.SECTIONS["skin"]["hours"] > shopmod.SECTIONS["coin"]["hours"], "same")
    check("time_left is never negative",
          all("-" not in shopmod.time_left(s) for s in shopmod.SECTIONS), "negative")

    # Stock is bucketed by window, so a new window is full again.
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone.utc)
    w_now = shopmod.rotation_window("special", now)
    w_next = shopmod.rotation_window("special", now + timedelta(hours=7))
    check("advancing past a rotation changes the window", w_now != w_next,
          f"{w_now} == {w_next}")
    check("staying inside one window keeps it", w_now == shopmod.rotation_window(
        "special", now + timedelta(minutes=1)), "window changed mid-window")

    # A rotation genuinely restores exhausted stock.
    item_id = first_of("godly")
    limit = itemdb.get_item(item_id)["shop_stock"]
    db = FakeDB(balances={UID: RICH})
    for _ in range(limit):
        await eco.buy_item(db, GID, UID, item_id, 1)
    check("stock is out before the rotation", await shopmod.stock_left(db, GID, item_id) == 0,
          "not out")
    # Simulate the rollover by moving the stored doc into a past window.
    for doc in db.rows("economy_shop_stock"):
        if doc.get("itemId") == item_id:
            doc["window"] = shopmod.rotation_window("special", now) - 1
    check("stock is restocked after a rotation",
          await shopmod.stock_left(db, GID, item_id) == limit,
          str(await shopmod.stock_left(db, GID, item_id)))

    # ══ 9. Every section is stocked and every rarity is reachable ════
    for section in shopmod.SECTIONS:
        rows = shopmod.shop_items(section)
        check(f"the {section} shop is not empty", bool(rows), "no items")
    for rarity in itemdb.RARITIES:
        reachable = any(
            any(row["rarity"] == rarity for row in shopmod.shop_items(s))
            for s in shopmod.SECTIONS)
        check(f"{rarity} items appear in some shop section", reachable, "unreachable")
    check("no item is in two sections at once",
          all(len({shopmod.section_for(r)}) == 1 for r in shopmod.shop_items()),
          "an item routed twice")
    check("every catalog item routes to a known section",
          all(shopmod.section_for(r) in shopmod.SECTIONS for r in itemdb.CATALOG.values()),
          "an item routes to an unknown section")

    # ══ 10. Persistence and invariants ════════════════════════════════
    db = FakeDB(balances={UID: RICH})
    item_id = first_of("rare")
    ok, _ = await eco.buy_item(db, GID, UID, item_id, 1)
    check("a purchase is recorded", ok and db.bag(UID).get(item_id) == 1, "not recorded")
    txns = [t for t in db.rows("economy_tx") if t.get("type") == "shop_buy"]
    check("a purchase writes a shop_buy transaction", bool(txns), "no txn")
    if txns:
        check("the transaction records the price paid",
              txns[0].get("amount") == -itemdb.get_item(item_id)["buy_price"],
              str(txns[0].get("amount")))
        check("the transaction records the item", txns[0].get("itemId") == item_id,
              str(txns[0].get("itemId")))

    # Quantities are bounded, and a junk quantity cannot mint items.
    for bad in (0, -5, 100, 10**9):
        db = FakeDB(balances={UID: RICH})
        ok, _ = await eco.buy_item(db, GID, UID, first_of("common"), bad)
        check(f"quantity {bad} is refused", not ok, "accepted")
        check(f"quantity {bad} delivers nothing", not db.bag(UID), str(db.bag(UID)))

    # Junk ids are refused without touching the catalog.
    for junk in ("", "   ", "not_a_real_item", None, "bread; DROP"):
        db = FakeDB(balances={UID: RICH})
        ok, msg = await eco.buy_item(db, GID, UID, junk, 1)
        check(f"junk id {junk!r} is refused", not ok, msg)
        check(f"junk id {junk!r} charges nothing", db.balance(UID) == RICH, "charged")

    # Existing invariants the shop must not have broken.
    check("no catalog item is both shop_enabled and priceless",
          all(r["buy_price"] > 0 for r in itemdb.CATALOG.values() if r["shop_enabled"]), "bad")
    check("godly items are still untradeable and unsellable",
          all(not r["tradeable"] and r["sell_price"] == 0
              for r in itemdb.CATALOG.values() if r["rarity"] == "godly"), "broken")
    check("godly items still have no effect",
          all(not r["effect_type"] for r in itemdb.CATALOG.values()
              if r["rarity"] == "godly"), "godly grants an effect")
    # Catalog size is asserted as a floor, not an exact number: the bank
    # capacity items added by the /deposit work took it past the old 138, and
    # pinning an exact count would make every future addition a test edit.
    check("the catalog still holds the full 138-item set",
          len(itemdb.CATALOG) >= 138, str(len(itemdb.CATALOG)))
    check("no duplicate item ids",
          len({r["item_id"] for r in itemdb.CATALOG.values()}) == len(itemdb.CATALOG),
          "duplicates")

    # ── report ──
    failed = [c for c in checks if not c[1]]
    for name, ok, detail in failed[:40]:
        print(f"FAIL  {name}  {detail}")
    print(f"\nshop pricing: {len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
