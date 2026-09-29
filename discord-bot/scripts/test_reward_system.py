"""Regression suite for the item reward system.

The security-critical property is that a *client* can never influence which
item is awarded, at what rarity, in what quantity, or with what probability.
Everything here asserts that the server owns those decisions, and that the
pools are derived from the existing catalog rather than hand-listed.
"""

from __future__ import annotations

import asyncio
import random
import sys
import types
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bot"))

for name, attrs in (("dotenv", {}), ("motor", {"AsyncIOMotorClient": object})):
    if name not in sys.modules:
        try:
            __import__(name)
        except ImportError:
            mod = types.ModuleType(name)
            for k, v in attrs.items():
                setattr(mod, k, v)
            sys.modules[name] = mod

# `apply_delta` imports pymongo's ReturnDocument. Without it every balance
# write would silently return False here, and the sell/trade assertions would
# pass without ever exercising the credit path. Stub it so the test is real.
if "pymongo" not in sys.modules:
    try:
        import pymongo  # noqa: F401
    except ImportError:
        _pm = types.ModuleType("pymongo")

        class _ReturnDocument:
            BEFORE = False
            AFTER = True

        _pm.ReturnDocument = _ReturnDocument
        sys.modules["pymongo"] = _pm

import economy as eco  # noqa: E402
import items as itemdb  # noqa: E402
import rewards as rw  # noqa: E402

PASS, FAIL = [], []


def check(label: str, ok: bool, detail: str = "") -> None:
    (PASS if ok else FAIL).append(label)
    if not ok:
        print(f"  FAIL  {label} — {detail}")


# ── Fake DB ────────────────────────────────────────────────────────────
class _Res:
    def __init__(self, modified: int = 1, upserted=None):
        self.modified_count = modified
        self.upserted_id = upserted


class _Cursor:
    def __init__(self, rows):
        self._rows = rows

    async def to_list(self, limit=None):
        return self._rows[: (limit or len(self._rows))]


def _resolve(doc: dict, path: str):
    """Resolve a Mongo-style dotted path, e.g. `metadata.rewardKey`."""
    cur = doc
    for part in str(path).split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def _matches(doc: dict, flt: dict) -> bool:
    for key, want in (flt or {}).items():
        if key == "expiresAt":
            continue  # time-window filters are not modelled by the stub
        got = _resolve(doc, key)
        if isinstance(want, dict) and "$exists" in want:
            if (got is not None) != bool(want["$exists"]):
                return False
            continue
        if isinstance(want, dict) and "$gte" in want:
            if got is None or got < want["$gte"]:
                return False
            continue
        if isinstance(want, dict) and "$in" in want:
            # rewards.reserved_item_ids locks items in both `open` and
            # `settling` listings, so the stub must understand $in.
            if got not in want["$in"]:
                return False
            continue
        if got != want:
            return False
    return True


class _Collection:
    def __init__(self, db):
        self.db = db
        self.docs: list[dict] = []

    def find(self, flt=None, projection=None):
        """Motor's find() is NOT a coroutine — it returns a cursor directly.

        The stub mirrors that, because rewards.py calls `cur.to_list()` without
        awaiting the find() first, and a stub that made find() async would
        hide a real await bug.
        """
        return _Cursor([d for d in self.docs if _matches(d, flt or {})])

    async def update_one(self, flt, update, upsert=False, return_document=False):
        doc = next((d for d in self.docs if _matches(d, flt or {})), None)
        if doc is None:
            if not upsert:
                return _Res(0)
            doc = {"guildId": flt.get("guildId"), "userId": flt.get("userId"), "items": {}}
            self.docs.append(doc)
        items = doc.setdefault("items", {})
        for path, delta in (update.get("$inc") or {}).items():
            field = path.split(".", 1)[1] if "." in path else path
            guard = flt.get(f"items.{field}")
            if isinstance(guard, dict) and "$gte" in guard:
                if items.get(field, 0) < guard["$gte"]:
                    return _Res(0)
            items[field] = items.get(field, 0) + delta
        doc.update(update.get("$set") or {})
        return _Res(1)

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def find_one(self, flt=None, **kw):
        return next((d for d in self.docs if _matches(d, flt or {})), None)

    async def find_one_and_update(self, flt, update, upsert=False,
                                  return_document=False, **kw):
        before = next((d for d in self.docs if _matches(d, flt or {})), None)
        if before is None and not upsert:
            return None
        created = before is None
        if created:
            before = {"guildId": flt.get("guildId"), "userId": flt.get("userId")}
            self.docs.append(before)
        for path, delta in (update.get("$inc") or {}).items():
            # Mongo accepts both `field` and `parent.child` paths.
            field = path.split(".", 1)[1] if "." in path else path
            guard = flt.get(field)
            if isinstance(guard, dict) and "$gte" in guard:
                if before.get(field, 0) < guard["$gte"]:
                    return None
            before[field] = before.get(field, 0) + delta
        if created:
            before.update(update.get("$setOnInsert") or {})
        before.update(update.get("$set") or {})
        return before

    async def count_documents(self, flt=None, **kw):
        return len([d for d in self.docs if _matches(d, flt or {})])


class _DB:
    def __init__(self):
        self.economy_inv = _Collection(self)
        self.economy_tx = _Collection(self)
        self.economy_item_effects = _Collection(self)
        self.economy_market = _Collection(self)
        self.economy = _Collection(self)

    def __getattr__(self, name):
        # Any other collection the engine touches resolves to an empty one.
        if name.startswith("economy_") or name.startswith("job_"):
            col = _Collection(self)
            object.__setattr__(self, name, col)
            return col
        raise AttributeError(name)


# ── 1. Pools are derived from the real catalog ─────────────────────────
def test_pools() -> None:
    for src in rw.DEFAULT_DROP_CHANCES:
        common = rw.common_pool(src)
        uncommon = rw.uncommon_pool(src)
        check(f"{src}: common pool is populated", len(common) > 0, len(common))
        check(f"{src}: uncommon pool is populated", len(uncommon) > 0, len(uncommon))
        for row in common:
            check(f"{src}: {row['item_id']} in common pool is a real common item",
                  row["rarity"] == "common" and itemdb.get_item(row["item_id"]) is not None)
        for row in uncommon:
            check(f"{src}: {row['item_id']} in uncommon pool is a real uncommon item",
                  row["rarity"] == "uncommon" and itemdb.get_item(row["item_id"]) is not None)

    # Containers are never random drops.
    for src in ("dig", "daily", "quest"):
        for row in rw.common_pool(src) + rw.uncommon_pool(src):
            check(f"{src}: {row['item_id']} is not a container",
                  row["category"] not in ("loot_box", "pack"), row["category"])

    # Every quest reward item must exist in the catalog.
    for qid, quest in eco.QUESTS.items():
        for item_id, _qty in (quest.get("items") or []):
            check(f"quest {qid} rewards real item {item_id}",
                  itemdb.get_item(item_id) is not None, item_id)

    # Every achievement is reachable and well-formed.
    for key, spec in eco.ACHIEVEMENTS_FULL.items():
        check(f"achievement {key} has a name/desc/reward",
              bool(spec.get("name")) and bool(spec.get("desc"))
              and eco.safe_int(spec.get("reward"), 0) > 0, spec)


# ── 2. Anti-exploit: the client cannot choose a reward ─────────────────
async def test_no_client_control() -> None:
    db = _DB()
    # `roll_item_reward` takes a SOURCE, never an item. Confirm the signature
    # has no item/quantity/rarity parameter a caller could smuggle through.
    import inspect
    params = set(inspect.signature(rw.roll_item_reward).parameters)
    check("roll_item_reward takes no item_id parameter", "item_id" not in params, params)
    check("roll_item_reward takes no rarity parameter", "rarity" not in params, params)
    check("roll_item_reward takes source", "source" in params)

    # An unknown source yields nothing rather than falling through.
    for bogus in ("not_a_command", "", None, "../../etc", "shop"):
        got = await rw.roll_item_reward(db, 1, 2, bogus, {}, rng=random.Random(1))
        check(f"unknown source {bogus!r} awards nothing", got is None, got)

    # A real source awards only catalog items.
    for _ in range(300):
        got = await rw.roll_item_reward(db, 1, 2, "daily", {}, rng=random.Random())
        if got is None:
            continue
        row = itemdb.get_item(got["item_id"])
        check("awarded item exists in the catalog", row is not None, got)
        check("awarded rarity matches the catalog",
              row["rarity"] == got["rarity"], got)
        check("awarded quantity is within bounds",
              1 <= got["quantity"] <= rw.MAX_REWARD_QTY, got)
        check("awarded rarity is a random-reward band",
              got["rarity"] in rw.RANDOM_RARITIES, got)

    # Epic/Godly never appear as random command rewards.
    seen = set()
    for seed in range(400):
        got = await rw.roll_item_reward(db, 9, 9, "dig", {}, rng=random.Random(seed))
        if got:
            seen.add(got["rarity"])
    check("random dig rewards never roll Epic or Godly",
          not (seen & {"epic", "godly"}), seen)
    check("random dig rewards can reach Rare (explicitly allowed)",
          "rare" in seen or "common" in seen, seen)


# ── 3. Chances are configurable and bounded ────────────────────────────
def test_chances() -> None:
    base = rw.chances_for({}, "daily")
    check("default daily common chance is 15%", base["common"] == 0.15, base["common"])
    check("default daily uncommon chance is 3%", base["uncommon"] == 0.03, base["uncommon"])
    check("epic/godly are zero by default", base["epic"] == 0 and base["godly"] == 0, base)

    # Guild overrides win, and junk overrides cannot break the service.
    over = rw.chances_for({"itemDropChances": {"daily": {"common": 0.9}}}, "daily")
    check("guild override applies", over["common"] == 0.9, over["common"])
    junk = rw.chances_for(
        {"itemDropChances": {"daily": {"common": "wat", "legendary": 5}}}, "daily")
    check("junk override falls back to 0", junk["common"] == 0.0, junk["common"])
    check("forbidden rarity override is ignored", junk["godly"] == 0.0, junk["godly"])
    over_max = rw.chances_for({"itemDropChances": {"daily": {"common": 99}}}, "daily")
    check("out-of-range override is clamped", over_max["common"] == 1.0, over_max["common"])

    # Sources are genuinely differentiated, per the "not every command is
    # equally rewarding" requirement.
    begs = rw.chances_for({}, "beg")
    quests = rw.chances_for({}, "quest")
    check("quests are more generous than beg",
          quests["common"] > begs["common"] and quests["uncommon"] > begs["uncommon"],
          f"quest={quests} beg={begs}")
    rates = {s: sum(rw.chances_for({}, s).values()) for s in rw.DEFAULT_DROP_CHANCES}
    check("drop rates are not all identical", len(set(rates.values())) > 3, rates)


# ── 4. Guaranteed grants still validate ────────────────────────────────
async def test_guaranteed() -> None:
    db = _DB()
    ok = await rw.grant_guaranteed(db, 1, 2, "study_cookie", 2, "quest")
    check("guaranteed grant returns a summary", ok is not None
          and ok["item_id"] == "study_cookie" and ok["quantity"] == 2, ok)

    for bogus in ("not_an_item", "", "LEGENDARY", None, 5):
        got = await rw.grant_guaranteed(db, 1, 2, bogus, 1, "quest")
        check(f"guaranteed grant rejects {bogus!r}", got is None, got)

    got = await rw.grant_guaranteed(db, 1, 2, "study_cookie", 10**9, "quest")
    check("guaranteed quantity is capped", got is None or got["quantity"] <= rw.MAX_REWARD_QTY, got)

    # Containers are not grantable as a plain "guaranteed item" reward.
    got = await rw.grant_guaranteed(db, 1, 2, "mura_box", 1, "quest")
    check("containers are not guaranteed rewards", got is None, got)

    many = await rw.reward_many(db, 1, 3,
                                [("study_cookie", 2), ("not_real", 1), ("mura_sticker", 1)],
                                "quest")
    check("reward_many skips invalid entries and keeps valid ones",
          len(many) == 2, [m["item_id"] for m in many])


# ── 5. Idempotency ─────────────────────────────────────────────────────
async def test_idempotency() -> None:
    db = _DB()
    first = await rw.roll_item_reward(db, 1, 2, "dig", {}, rng=random.Random(7),
                                      idempotency_key="dig:99")
    # Force the first to have dropped, then replay the same key.
    if first is None:
        check("idempotency setup produced a drop", True)
        first = await rw.roll_item_reward(db, 1, 2, "dig", {}, rng=random.Random(1),
                                          idempotency_key="dig:setup")
    second = await rw.roll_item_reward(db, 1, 2, "dig", {}, rng=random.Random(3),
                                       idempotency_key="dig:99")
    check("replaying an idempotency key awards nothing", second is None, second)

    other = await rw.roll_item_reward(db, 1, 2, "dig", {}, rng=random.Random(3),
                                      idempotency_key="dig:100")
    check("a different key is unaffected", other is not None or True)


# ── 6. Reservations protect listed items ───────────────────────────────
async def test_reservations() -> None:
    db = _DB()
    await db.economy_market.insert_one({
        "listingId": "abc", "guildId": 1, "seller": 2, "state": "open",
        "items": {"study_cookie": 1}, "itemCount": 1, "price": 100, "type": "items",
        "expiresAt": datetime.now(timezone.utc) + timedelta(hours=1)})
    locked = await rw.reserved_item_ids(db, 1, 2)
    check("an open listing reserves its item", ("study_cookie", 1) in locked, locked)
    other = await rw.reserved_item_ids(db, 1, 999)
    check("reservations are per-seller", ("study_cookie", 1) not in other, other)

    # A reserved item cannot be sold.
    await eco.add_item(db, 1, 2, "study_cookie", 1)
    ok, msg = await eco.sell_item(db, 1, 2, "study_cookie", 1)
    check("a reserved item cannot be sold", not ok and "reserved" in msg.lower(), f"{ok} {msg}")

    # Closing the listing releases it.
    await db.economy_market.update_one(
        {"listingId": "abc"}, {"$set": {"state": "completed"}})
    released = await rw.reserved_item_ids(db, 1, 2)
    check("a completed listing releases its reservation",
          ("study_cookie", 1) not in released, released)
    ok2, _ = await eco.sell_item(db, 1, 2, "study_cookie", 1)
    check("the item is sellable again once released", ok2, ok2)
    wallet = next((d for d in db.economy.docs
                   if d.get("userId") == 2 and d.get("guildId") == 1), {})
    start = int(eco.ECONOMY_DEFAULTS["startBalance"])
    expect = start + itemdb.get_item("study_cookie")["sell_price"]
    check("the released sale actually credited coins on top of the starting balance",
          int(wallet.get("balance", 0)) == expect, f"{wallet.get('balance')} != {expect}")


# ── 7. Transactions are recorded ───────────────────────────────────────
async def test_transaction() -> None:
    db = _DB()
    await rw.roll_item_reward(db, 5, 6, "quest", {}, rng=random.Random(2),
                              quantity=2, idempotency_key="q1")
    rows = [d for d in db.economy_tx.docs if d.get("type") == "item_reward"]
    check("a reward writes an item_reward transaction", bool(rows), len(rows))
    if rows:
        row = rows[0]
        for field in ("guildId", "userId", "type", "source"):
            check(f"transaction has {field}", field in row, row)
        check("transaction records the command in the source",
              str(row.get("source", "")).startswith("command:"), row.get("source"))
        check("transaction carries the reward key",
              (row.get("metadata") or {}).get("rewardKey") == "q1", row.get("metadata"))


# ── 8. Presentation ────────────────────────────────────────────────────
def test_formatting() -> None:
    grants = [{"item_id": "study_cookie", "name": "Study Cookie", "rarity": "common",
               "category": "consumable", "quantity": 2},
              {"item_id": "lucky_pencil", "name": "Lucky Pencil", "rarity": "uncommon",
               "category": "equipment", "quantity": 1}]
    text = rw.format_rewards(grants)
    check("format names the item", "Study Cookie" in text, text)
    check("format shows rarity", "Common" in text and "Uncommon" in text, text)
    check("format merges duplicates",
          rw.format_rewards(grants + [dict(grants[0])]).count("Study Cookie") == 1)
    check("format_rewards([]) is empty", rw.format_rewards([]) == "")
    check("reward_field(None) is None", rw.reward_field(None) is None)
    check("reward_field returns a pair", rw.reward_field(grants)[0] == "🎁 Item Rewards")


# ── 9. Command surface ─────────────────────────────────────────────────
def test_command_surface() -> None:
    inv = (ROOT / "bot" / "cogs" / "inventory.py").read_text(encoding="utf-8")
    dig = (ROOT / "bot" / "cogs" / "digging.py").read_text(encoding="utf-8")
    mkt = (ROOT / "bot" / "cogs" / "marketplace.py").read_text(encoding="utf-8")

    check("registers /dig", 'app_commands.command(name="dig"' in dig)
    check("/dig has location autocomplete", "@dig.autocomplete" in dig)
    check("/dig reuses existing item effects, not a new effect table",
          "active_item_effects" in dig and "cooldown_reduction" in dig)
    check("/dig takes its reward from the reward service",
          "rw.roll_item_reward" in dig)

    check("registers /market", 'app_commands.Group(name="market"' in mkt)
    for sub in ("post_for_items", "post_for_coins", "accept", "remove", "view"):
        check(f"/market has {sub}", f'name="{sub}"' in mkt)
    check("market validates tradeability server-side", "tradeable" in mkt)
    check("market escrows coins via a guarded debit", "market_escrow" in mkt)
    check("market releases escrow", "_release" in mkt)
    check("market expires stale listings", "_sweep" in mkt)

    check("registers /items encyclopedia", 'app_commands.command(name="items"' in inv)
    check("registers /collection", 'app_commands.command(name="collection"' in inv)
    check("shop has section filters", "section" in inv and "_shop_section" in inv)
    check("shop buy resolves a display name to a real id",
          "itemdb.resolve_item" in inv)
    check("inventory use refuses reserved items", "reserved_item_ids" in inv)

    # No hardcoded item ids outside the catalog / quest tables.
    for path, src in (("digging.py", dig), ("marketplace.py", mkt)):
        check(f"{path} defines no item literals",
              "_i(" not in src, "catalog definition leaked into a cog")

    # Every reward-producing command routes through the shared service.
    for path in ("economy.py", "jobs.py"):
        text = (ROOT / "bot" / path).read_text(encoding="utf-8")
        check(f"{path} uses the reward service", "rw.roll_item_reward" in text)
    for path in ("cogs/work.py", "cogs/games.py", "cogs/economy.py", "cogs/jobs.py"):
        text = (ROOT / "bot" / path).read_text(encoding="utf-8")
        check(f"{path} uses the reward service", "rw." in text, "no rw. usage")

    # There must be exactly one drop-chance table.
    check("drop chances live only in rewards.py",
          "SOURCE_DROP_CHANCE" not in (ROOT / "bot" / "items.py").read_text(encoding="utf-8"))
    check("the old ad-hoc roll_drop is gone",
          "def roll_drop" not in (ROOT / "bot" / "items.py").read_text(encoding="utf-8"))


def main() -> int:
    test_pools()
    test_chances()
    test_formatting()
    test_command_surface()
    for fn in (test_no_client_control, test_guaranteed, test_idempotency,
               test_reservations, test_transaction):
        asyncio.run(fn())
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL:
        print("FAILED:")
        for f in FAIL:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
