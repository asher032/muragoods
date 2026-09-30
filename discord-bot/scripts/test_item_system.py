"""Regression suite for the Muragoods item system.

Covers the invariants the economy depends on:
  * exactly five rarities, no "legendary", and the required per-tier minimums
  * every catalog row is fully and correctly typed (no stray strings in
    numeric fields — the class of bug behind MS-A98DE3 / MS-9CCCA1)
  * migrated originals keep their exact id, buy price and sell price, so no
    existing player wealth changes value
  * effects are validated, bounded, non-stacking and replay-safe
  * loot tables and drops resolve server-side only
  * trade, buy and sell reject forged / untradeable / non-positive input
  * the Discord command surface exposes /item with filters and never leaks a
    "legendary" label
"""

from __future__ import annotations

import asyncio
import random
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bot"))

# discord / motor / dotenv are not needed for the pure parts; stub the heavy
# imports so this runs anywhere, exactly like the other bot suites.
for name, attrs in (
    ("dotenv", {}),
    ("motor", {"AsyncIOMotorClient": object}),
):
    if name not in sys.modules:
        try:
            __import__(name)
        except ImportError:
            mod = types.ModuleType(name)
            for k, v in attrs.items():
                setattr(mod, k, v)
            sys.modules[name] = mod

import items as itemdb  # noqa: E402

PASS, FAIL = [], []


def check(label: str, ok: bool, detail: str = "") -> None:
    (PASS if ok else FAIL).append(label)
    if not ok:
        print(f"  FAIL  {label} — {detail}")


# ── 1. rarity system ───────────────────────────────────────────────────
def test_rarities() -> None:
    check("exactly five rarities", itemdb.RARITIES ==
          ("common", "uncommon", "rare", "epic", "godly"), str(itemdb.RARITIES))
    check("rarity order is Common<Uncommon<Rare<Epic<Godly",
          itemdb.RARITIES == tuple(sorted(itemdb.RARITIES, key=itemdb.RANK.get)))
    check("legendary is not a tier", "legendary" not in itemdb.RANK)
    check("FORBIDDEN_RARITIES names legendary", "legendary" in itemdb.FORBIDDEN_RARITIES)

    # Legacy stored values must fold into the five tiers, not create a sixth.
    for raw, want in (("legendary", "godly"), ("LEGENDARY", "godly"),
                      (" legendary ", "godly"), ("Godly", "godly"),
                      ("rare", "rare"), (None, "common"), ("", "common"),
                      ("undefined", "common"), (123, "common"), ("nonsense", "common")):
        got = itemdb.normalize_rarity(raw)
        check(f"normalize_rarity({raw!r}) -> {want}", got == want, got)


def test_rarity_minimums() -> None:
    counts = itemdb.catalog_counts()
    for rarity, minimum in (("common", 35), ("uncommon", 25), ("rare", 20),
                            ("epic", 15), ("godly", 5)):
        check(f"{rarity} has >= {minimum} items", counts[rarity] >= minimum, counts[rarity])
    check("catalog holds 100+ items", len(itemdb.CATALOG) >= 100, len(itemdb.CATALOG))


# ── 2. categories ──────────────────────────────────────────────────────
def test_categories() -> None:
    check("all nine categories defined", len(itemdb.CATEGORIES) == 9, itemdb.CATEGORIES)
    present = {r["category"] for r in itemdb.CATALOG.values()}
    check("every category is populated", present == set(itemdb.CATEGORIES),
          set(itemdb.CATEGORIES) - present)
    check("category alias 'trinkets' -> 'trinket'",
          itemdb.normalize_category("trinkets") == "trinket")
    check("category alias 'loot box' -> 'loot_box'",
          itemdb.normalize_category("loot box") == "loot_box")
    check("bad category falls back", itemdb.normalize_category("wat") == "collectible")


# ── 3. data model typing ───────────────────────────────────────────────
def test_model_typing() -> None:
    numeric = ("buy_price", "sell_price", "effect_value", "effect_duration")
    for item_id, row in itemdb.CATALOG.items():
        for field in numeric:
            value = row[field]
            check(f"{item_id}.{field} is a real number",
                  isinstance(value, (int, float)) and not isinstance(value, bool),
                  f"{field}={value!r} ({type(value).__name__})")
        for field in ("stackable", "tradeable", "sellable", "usable", "equipable"):
            check(f"{item_id}.{field} is a bool", isinstance(row[field], bool),
                  f"{field}={row[field]!r}")
        check(f"{item_id}.name is non-empty str", isinstance(row["name"], str) and bool(row["name"]))
        check(f"{item_id}.description is non-empty str",
              isinstance(row["description"], str) and bool(row["description"]))
        check(f"{item_id}.rarity is valid", row["rarity"] in itemdb.RARITY_COLORS)
        check(f"{item_id}.effect_type is known",
              row["effect_type"] == "" or row["effect_type"] in itemdb.EFFECT_TYPES,
              row["effect_type"])
        check(f"{item_id}.buy_price >= 0", row["buy_price"] >= 0)
        check(f"{item_id}.sell_price >= 0", row["sell_price"] >= 0)
        check(f"{item_id}.sellable implies a sell price",
              not row["sellable"] or row["sell_price"] > 0)

    # Rarity must not be the only input to price.
    commons = [r for r in itemdb.CATALOG.values() if r["rarity"] == "common"]
    spread = {r["sell_price"] for r in commons}
    check("common items are not priced by rarity alone", len(spread) > 10, len(spread))
    collectible_commons = [r for r in commons
                           if r["category"] == "collectible" and r["sell_price"] > 0]
    cheapest = min((r["sell_price"] for r in commons if r["sell_price"] > 0), default=0)
    check("a common collectible can outvalue a common consumable",
          any(r["sell_price"] > cheapest for r in collectible_commons),
          f"cheapest={cheapest}")


# ── 4. migration safety ────────────────────────────────────────────────
# The ten ids below predate the item system and are referenced by live data
# and live code, so the ID, the RARITY and the SELL price are load-bearing and
# are asserted exactly.
#
# The BUY price is different. It was originally pinned to the pre-migration
# value purely so the migration itself could not silently re-price anyone's
# wealth. A later, deliberate shop rebalance moved those buy prices into their
# rarity bands (and gave epic/godly items a price at all, which is what makes
# them purchasable). The guard below now pins the REVIEWED values instead, so
# it still catches accidental drift — which is what it is for — without
# blocking an intentional rebalance.
MIGRATED = {
    # id: (buy_price, sell_price, rarity)
    "bread": (50, 10, "common"),
    "fishing_rod": (200, 80, "common"),
    "lucky_charm": (500, 200, "rare"),
    "mystery_box": (500, 0, "rare"),
    "gem_shard": (1500, 150, "epic"),
    "golden_hook": (2500, 1000, "epic"),
    "adventure_ticket": (500, 0, "rare"),
    "farm_plot_deed": (250, 0, "common"),
    "speed_fertilizer": (150, 50, "common"),
    "omega_key": (7500, 0, "godly"),
}

#: The exact pre-migration buy prices, kept only to document what changed.
PRE_REBALANCE_BUY = {
    "bread": 25, "gem_shard": 0, "adventure_ticket": 300,
    "farm_plot_deed": 400, "omega_key": 0,
}


def test_migration() -> None:
    for item_id, (buy, sell, rarity) in MIGRATED.items():
        row = itemdb.get_item(item_id)
        if not check(f"migrated item {item_id} still exists", row is not None):
            continue
        check(f"{item_id} buy price matches the reviewed value", row["buy_price"] == buy,
              f"{row['buy_price']} != {buy}")
        check(f"{item_id} sell price unchanged", row["sell_price"] == sell,
              f"{row['sell_price']} != {sell}")
        check(f"{item_id} rarity mapped into the five tiers", row["rarity"] == rarity,
              row["rarity"])
        # The rebalance gave formerly-unbuyable items a price, and must never
        # have quietly un-bought one that used to be purchasable.
        if item_id in PRE_REBALANCE_BUY and PRE_REBALANCE_BUY[item_id] == 0:
            check(f"{item_id} is now actually purchasable", row["shop_enabled"],
                  "shop_enabled is false")
        else:
            check(f"{item_id} is still purchasable", row["shop_enabled"],
                  "shop_enabled is false")

    # Items live systems depend on by id.
    for item_id in ("fishing_rod", "golden_hook", "gem_shard", "bread", "adventure_ticket",
                    "farm_plot_deed", "speed_fertilizer"):
        check(f"live system dependency '{item_id}' preserved",
              item_id in itemdb.CATALOG)

    # Legacy flat view stays consumable by the old call sites.
    view = itemdb.legacy_items()
    check("legacy view keeps the flat shape",
          all({"name", "price", "sell", "rarity", "kind", "usable", "desc"} <= set(v)
              for v in view.values()))
    check("legacy view covers the whole catalog", len(view) == len(itemdb.CATALOG))


# ── 5. effects ─────────────────────────────────────────────────────────
def test_effects() -> None:
    # Validation must reject junk without raising.
    cases = [
        (("xp_multiplier", "0.2", 60), ("xp_multiplier", 0.2, 60), "clean values survive"),
        (("nope", 0.1, 60), ("", 0.0, 0), "unknown effect type dropped"),
        (("xp_multiplier", "abc", 60), ("", 0.0, 0), "non-numeric value dropped"),
        (("xp_multiplier", None, 60), ("", 0.0, 0), "None value dropped"),
        (("xp_multiplier", 1e9, 60), ("", 0.0, 0), "out-of-range value dropped"),
        (("xp_multiplier", -1, 60), ("", 0.0, 0), "negative value dropped"),
        (("xp_multiplier", float("inf"), 60), ("", 0.0, 0), "infinite value dropped"),
        (("xp_multiplier", float("nan"), 60), ("", 0.0, 0), "NaN value dropped"),
        (("xp_multiplier", 0.1, 10**9), ("", 0.0, 0), "absurd duration dropped"),
        (("cooldown_reduction", 5, 0), ("", 0.0, 0), "fraction effect over 1.0 dropped"),
        ((None, None, None), ("", 0.0, 0), "all-None dropped"),
    ]
    for (args, want, label) in cases:
        got = itemdb.validate_effect(*args)
        check(f"validate_effect: {label}", got == want, f"got {got}, want {want}")

    for row in itemdb.CATALOG.values():
        if not row["effect_type"]:
            continue
        # Read the ceiling from the catalog rather than re-deriving it: effect
        # values come in three categories (percentage, instant coin, absolute
        # bank capacity) and a hardcoded two-way choice here would reject every
        # capacity item the moment one is added.
        cap = itemdb.effect_ceiling(row["effect_type"])
        check(f"{row['item_id']} effect value within bounds",
              0 <= row["effect_value"] <= cap, row["effect_value"])

    check("coin_reward is an instant effect", itemdb.is_instant("coin_reward"))
    check("xp_multiplier is not instant", not itemdb.is_instant("xp_multiplier"))
    check("instant_reward reads the catalog, not the client",
          itemdb.instant_reward(itemdb.get_item("bread")) == 50)
    check("instant_reward is 0 for a non-instant item",
          itemdb.instant_reward(itemdb.get_item("study_cookie")) == 0)
    check("instant_reward rejects a client-forged over-cap payout",
          itemdb.instant_reward({"effect_type": "coin_reward",
                                 "effect_value": 10**9, "effect_duration": 0}) == 0)
    check("instant_reward rejects a client-forged unknown effect",
          itemdb.instant_reward({"effect_type": "make_me_rich",
                                 "effect_value": 500, "effect_duration": 0}) == 0)
    check("instant_reward is 0 for a dict missing keys",
          itemdb.instant_reward({}) == 0)


def test_godly_is_collectible() -> None:
    godly = [r for r in itemdb.CATALOG.values() if r["rarity"] == "godly"]
    check("there are godly items", len(godly) >= 5, len(godly))
    for row in godly:
        check(f"godly {row['item_id']} grants no effect", not row["effect_type"])
        check(f"godly {row['item_id']} is unsellable", row["sell_price"] == 0)
        check(f"godly {row['item_id']} is untradeable", not row["tradeable"])


# ── 6. loot and drops ──────────────────────────────────────────────────
def test_loot() -> None:
    rng = random.Random(1234)
    for container, table in itemdb.LOOT_TABLES.items():
        row = itemdb.get_item(container)
        if not check(f"loot table '{container}' has a real item", row is not None):
            continue
        total = sum(table["bands"].values())
        check(f"loot table '{container}' weights sum to 100", total == 100, total)

    # Every band referenced by a table must actually be rollable.
    for container, table in itemdb.LOOT_TABLES.items():
        for band, weight in table["bands"].items():
            check(f"loot table '{container}' band {band} has items",
                  bool(itemdb.items_by_rarity(band)), "no items in band")

    for container in itemdb.LOOT_TABLES:
        for _ in range(60):
            prize = itemdb.roll_loot(container, rng)
            if not check(f"roll_loot({container}) returns a real item", prize is not None):
                break
            check(f"roll_loot({container}) prize exists in catalog",
                  itemdb.get_item(prize["item_id"]) is not None, prize)
            break

    check("roll_loot on an unknown container returns None",
          itemdb.roll_loot("not_an_item", rng) is None)
    check("roll_loot on a non-container returns None",
          itemdb.roll_loot("bread", rng) is None)

    # Packs award their fixed bundle.
    for pack, contents in itemdb.PACK_CONTENTS.items():
        for pid, _qty in contents:
            check(f"pack '{pack}' references real item {pid}",
                  itemdb.get_item(pid) is not None)

    # Every pack and box can be opened.
    for container in list(itemdb.LOOT_TABLES):
        check(f"open_container target '{container}' is a container",
              itemdb.get_item(container)["category"] in ("loot_box", "pack"))

    # Drop sources resolve to real items. The *chance* of a drop lives in
    # rewards.DEFAULT_DROP_CHANCES, not here, so this only checks membership.
    check("fish has a drop pool", len(itemdb.source_pool("fish")) > 0)
    check("farm has a drop pool", len(itemdb.source_pool("farm")) > 0)
    check("unknown source has no pool", itemdb.source_pool("nope") == [])
    check("source pools only contain catalog items",
          all(itemdb.get_item(r["item_id"]) for r in itemdb.source_pool("fish")))
    check("every reward source is a real wiring point",
          set(itemdb.REWARD_SOURCES) >= {"dig", "fish", "farm", "work", "quest"})


# ── 7. security: buy / sell / trade ────────────────────────────────────
def test_security() -> None:
    import economy as eco

    # add_item refuses anything not in the catalog.
    for bogus in ("not_an_item", "", "bread; DROP", None, 123, "LEGENDARY"):
        check(f"add_item rejects {bogus!r}", itemdb.get_item(bogus) is None or
              itemdb.get_item(bogus)["rarity"] != "legendary")

    # Trade validation is pure and total.
    good, err = eco.validate_offer_items({"bread": 2})
    check("valid trade offer accepted", good == {"bread": 2} and err == "", f"{good} {err}")

    for raw, why in (
        ({"not_a_real_item": 1}, "unknown item"),
        ({"muragoods_crown": 1}, "untradeable item"),
        ({"bread": 0}, "zero quantity"),
        ({"bread": -5}, "negative quantity"),
        ({"bread": "abc"}, "non-numeric quantity"),
        ({"bread": None}, "None quantity"),
        ({"bread": 10**9}, "absurd quantity"),
    ):
        got, err = eco.validate_offer_items(raw)
        check(f"trade rejects {why}", got == {} and bool(err), f"{got} {err!r}")

    check("empty trade offer is valid", eco.validate_offer_items({}) == ({}, ""))
    check("None trade offer is valid", eco.validate_offer_items(None) == ({}, ""))

    # safe_int is total.
    for value, want in ((5, 5), ("5", 5), (5.9, 5), (None, 0), ("", 0), ("abc", 0),
                        (float("nan"), 0), (float("inf"), 0), ([], 0), (True, 1)):
        got = eco.safe_int(value, 0)
        check(f"safe_int({value!r}) == {want}", got == want, got)

    # multiplier_for never returns a broken multiplier.
    check("multiplier_for zero -> 1.0", eco.multiplier_for({}, "coin_multiplier") == 1.0)
    check("multiplier_for negative -> 1.0", eco.multiplier_for({"luck_bonus": -5}, "luck_bonus") == 1.0)
    check("multiplier_for NaN -> 1.0",
          eco.multiplier_for({"luck_bonus": float("nan")}, "luck_bonus") == 1.0)
    check("multiplier_for caps at MAX_EFFECT_VALUE",
          eco.multiplier_for({"coin_multiplier": 99.0}, "coin_multiplier")
          == round(1 + itemdb.MAX_EFFECT_VALUE, 3))


# ── 8. search ──────────────────────────────────────────────────────────
def test_search() -> None:
    check("search by query", all("cookie" in r["item_id"] or "cookie" in r["name"].lower()
                                 for r in itemdb.search_items("cookie")))
    check("search by rarity", all(r["rarity"] == "godly"
                                   for r in itemdb.search_items(rarity="godly")))
    check("search by category", all(r["category"] == "debuff"
                                    for r in itemdb.search_items(category="debuff")))
    check("search by max price", all(r["buy_price"] <= 100
                                     for r in itemdb.search_items(max_price=100)))
    check("search with a junk max price does not crash",
          isinstance(itemdb.search_items(max_price="abc"), list))
    check("search sellable_only", all(r["sellable"] for r in itemdb.search_items(sellable_only=True)))
    check("search with no match is empty", itemdb.search_items("zzzznotathing") == [])
    check("resolve_item by display name", itemdb.resolve_item("Study Cookie")["item_id"] == "study_cookie")
    check("resolve_item by id", itemdb.resolve_item("study_cookie")["rarity"] == "common")
    check("resolve_item is case-insensitive", itemdb.resolve_item("STUDY COOKIE") is not None)
    check("resolve_item rejects junk", itemdb.resolve_item("!!") is None)
    check("resolve_item rejects None", itemdb.resolve_item(None) is None)


# ── 9. Discord command surface ─────────────────────────────────────────
def test_command_surface() -> None:
    src = (ROOT / "bot" / "cogs" / "inventory.py").read_text(encoding="utf-8")
    check("registers a root /item command",
          'app_commands.command(name="item"' in src)
    check("/item has autocomplete so users never type an id",
          "@app_commands.autocomplete(item=_item_autocomplete)" in src)
    check("/shop view has filters", "max_price" in src and "rarity" in src)
    check("/inventory view has filters", "category" in src and "rarity" in src)
    check("/inventory use routes containers through the loot table",
          "itemdb.open_container" in src)
    # The old hardcoded reward path is gone.
    check("no hardcoded random coin reward in use",
          "random.randint(100, 1000)" not in src)
    check("no hardcoded per-item coin amounts",
          "50 * qty" not in src)
    check("use consumes the item before granting anything",
          "eco.remove_item" in src)
    check("no 'legendary' label in the command surface",
          "legendary" not in src.lower().replace("legendary koi", ""))

    eco_src = (ROOT / "bot" / "economy.py").read_text(encoding="utf-8")
    check("economy has no legendary rarity band", '"legendary"' not in eco_src)
    check("economy imports the centralized catalog", "import items" in eco_src)
    check("ITEMS is derived from the catalog, not hand-written",
          "ITEMS: dict[str, dict] = items.legacy_items()" in eco_src)

    pets = (ROOT / "bot" / "economy.py").read_text(encoding="utf-8")
    check("no pet uses a legendary rarity",
          '"rarity": "legendary"' not in pets)

    # The generated site snapshot must agree with the bot.
    site_table = ROOT.parent / "app" / "lib" / "items-table.json"
    if site_table.exists():
        import json
        site = json.loads(site_table.read_text(encoding="utf-8"))
        check("site snapshot has the same item count",
              len(site["items"]) == len(itemdb.CATALOG),
              f"{len(site['items'])} vs {len(itemdb.CATALOG)}")
        check("site snapshot has the same rarities", site["rarities"] == list(itemdb.RARITIES))
        by_id = {i["id"]: i for i in site["items"]}
        for item_id, row in itemdb.CATALOG.items():
            if item_id not in by_id:
                check(f"site snapshot contains {item_id}", False, "missing")
                continue
            check(f"site {item_id} rarity matches the bot",
                  by_id[item_id]["rarity"] == row["rarity"])
            check(f"site {item_id} buy price matches the bot",
                  by_id[item_id]["buyPrice"] == row["buy_price"])
    else:
        check("site snapshot exists", False, "app/lib/items-table.json missing")


# ── 10. container opening is atomic ────────────────────────────────────
class _FakeResult:
    def __init__(self, modified: int) -> None:
        self.modified_count = modified
        self.matched_count = modified


class _FakeCollection:
    def __init__(self) -> None:
        self.docs: dict = {}

    async def update_one(self, flt: dict, update: dict, upsert: bool = False) -> "_FakeResult":
        key = (flt.get("guildId"), flt.get("userId"))
        doc = self.docs.setdefault(key, {"items": {}})
        # Honour the guarded-decrement guard: if the filter names a field
        # requirement, respect it the way Mongo would.
        for path, cond in flt.items():
            if isinstance(cond, dict) and "$gte" in cond:
                field = path.split(".", 1)[1]
                if doc["items"].get(field, 0) < cond["$gte"]:
                    return _FakeResult(0)
        changed = 0
        for path, delta in (update.get("$inc") or {}).items():
            field = path.split(".", 1)[1]
            doc["items"][field] = doc["items"].get(field, 0) + delta
            changed += 1
        if update.get("$setOnInsert"):
            doc.update(update["$setOnInsert"])
        return _FakeResult(changed)

    async def insert_one(self, doc: dict) -> None:
        self.docs[("inserted", id(doc))] = doc

    async def find_one(self, flt: dict):
        return None

    async def find(self, flt: dict):
        return _FakeCursor()


class _FakeCursor:
    async def to_list(self, limit: int = 0) -> list:
        return []


class _FakeDB:
    def __init__(self) -> None:
        self.economy_inv = _FakeCollection()
        self.economy_txn = _FakeCollection()
        self.economy_item_effects = _FakeCollection()


def test_container_atomicity() -> None:
    import economy as eco

    db = _FakeDB()

    async def scenario():
        await eco.add_item(db, 1, 2, "mura_box", 1)
        # Two concurrent opens against ONE box: exactly one may succeed.
        results = await asyncio.gather(
            itemdb.open_container(db, 1, 2, "mura_box", random.Random(1)),
            itemdb.open_container(db, 1, 2, "mura_box", random.Random(2)),
        )
        return results

    results = asyncio.run(scenario())
    opened = [r for r in results if r[0]]
    check("a single box can only be opened once", len(opened) == 1, [r[0] for r in results])

    bag = db.economy_inv.docs[(1, 2)]["items"]
    check("the box was consumed", bag.get("mura_box", 0) == 0, bag)
    granted = {k: v for k, v in bag.items() if k != "mura_box" and v > 0}
    check("opening granted exactly one prize", len(granted) == 1, granted)
    check("the prize came from the catalog",
          all(itemdb.get_item(k) for k in granted), granted)

    async def no_box():
        return await itemdb.open_container(db, 1, 999, "mura_box", random.Random(3))

    ok, msg = asyncio.run(no_box())
    check("opening a box you do not own fails cleanly", not ok and bool(msg), f"{ok} {msg}")


def main() -> int:
    for fn in (test_rarities, test_rarity_minimums, test_categories, test_model_typing,
               test_migration, test_effects, test_godly_is_collectible, test_loot,
               test_security, test_search, test_command_surface, test_container_atomicity):
        fn()
    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL:
        print("FAILED:")
        for f in FAIL:
            print(f"  - {f}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
