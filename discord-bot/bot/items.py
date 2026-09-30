"""Centralized item service for the Muragoods economy.

This module is the *single source of truth* for items. Every surface — the
Discord bot (`/item`, `/shop`, `/inventory`), the dashboard, fishing, farming,
work, quests, achievements, loot boxes, packs and trading — resolves items
through here. Nothing else may define an item, a rarity or a category.

Design rules enforced by this module:
  * Exactly five rarities, Common < Uncommon < Rare < Epic < Godly.
    There is deliberately no "legendary"; legacy callers that ask for one are
    mapped to Godly rather than silently keeping a sixth tier.
  * Item ids are stable machine-readable slugs. Display names are free text
    and are never used as identifiers.
  * All effect values are server-side and validated. A client may only ever
    send an item id + quantity; the effect, price and duration always come
    from here.
  * Rarity is *not* a price. `buy_price` / `sell_price` are set per item.
"""

from __future__ import annotations

import re
from typing import Any

# ── Rarity ────────────────────────────────────────────────────────────
# Order is meaningful: RANK is used for sorting and for loot weighting.
RARITIES: tuple[str, ...] = ("common", "uncommon", "rare", "epic", "godly")

RANK: dict[str, int] = {r: i for i, r in enumerate(RARITIES)}

RARITY_COLORS: dict[str, int] = {
    "common": 0x9CA3AF,      # gray
    "uncommon": 0x22C55E,    # green
    "rare": 0x3B82F6,        # blue
    "epic": 0xA855F7,        # purple
    "godly": 0xF59E0B,       # amber/gold
}

RARITY_EMOJI: dict[str, str] = {
    "common": "⚪", "uncommon": "🟢", "rare": "🔵", "epic": "🟣", "godly": "🟡",
}

# Rarities that were used before the five-tier system existed. Anything that
# used to be legendary is now Godly — the tier is preserved, the name is not.
LEGACY_RARITY_ALIASES: dict[str, str] = {
    "legendary": "godly",
    "mythic": "godly",
    "ultra": "epic",
    "rare+": "epic",
    "starter": "common",
    "special": "rare",
    "trash": "common",
}

#: Rarities that are explicitly forbidden in this economy.
FORBIDDEN_RARITIES: frozenset[str] = frozenset({"legendary"})


def normalize_rarity(value: Any, default: str = "common") -> str:
    """Coerce any stored rarity to a valid tier. Never raises.

    Handles `None`, `""`, `"LEGENDARY"`, `" legendary "`, ints and junk, all of
    which can arrive from Mongo because guild config and old item rows were
    written by the dashboard, older bot versions and by hand.
    """
    if not isinstance(value, str):
        return default
    key = value.strip().lower()
    if not key:
        return default
    if key in RANK:
        return key
    return LEGACY_RARITY_ALIASES.get(key, default)


def rarity_rank(value: Any) -> int:
    return RANK[normalize_rarity(value)]


# ── Categories ────────────────────────────────────────────────────────
# The nine Murabot categories. `trinkets` is the canonical key; `trinket` is
# accepted as an alias because older rows used the singular.
CATEGORIES: tuple[str, ...] = (
    "consumable",
    "collectible",
    "equipment",
    "sellable",
    "trinket",
    "loot_box",
    "pack",
    "buff",
    "debuff",
)

CATEGORY_ALIASES: dict[str, str] = {
    "trinkets": "trinket",
    "lootbox": "loot_box",
    "lootboxes": "loot_box",
    "boxes": "loot_box",
    "food": "consumable",
    "tool": "equipment",
    "charm": "equipment",
    "loot": "sellable",
    "ticket": "equipment",
    "deed": "equipment",
    "boost": "buff",
    "key": "trinket",
}

CATEGORY_EMOJI: dict[str, str] = {
    "consumable": "🍽️", "collectible": "🏅", "equipment": "🎒", "sellable": "💱",
    "trinket": "🔑", "loot_box": "📦", "pack": "🎁", "buff": "✨", "debuff": "🌀",
}

CATEGORY_LABELS: dict[str, str] = {
    "consumable": "Consumable", "collectible": "Collectible", "equipment": "Equipment",
    "sellable": "Sellable", "trinket": "Trinket", "loot_box": "Loot Box",
    "pack": "Pack", "buff": "Buff", "debuff": "Debuff",
}


def normalize_category(value: Any, default: str = "collectible") -> str:
    if not isinstance(value, str):
        return default
    key = value.strip().lower().replace("-", "_").replace(" ", "_")
    if not key:
        return default
    if key in CATEGORIES:
        return key
    return CATEGORY_ALIASES.get(key, default)


# ── Effect types ──────────────────────────────────────────────────────
# Every effect is server-side. `stackable` is deliberately False for all of
# them: re-using an item while the effect is live must refresh, not compound.
EFFECT_TYPES: tuple[str, ...] = (
    "xp_multiplier",
    "work_reward_multiplier",
    "cooldown_reduction",
    "luck_bonus",
    "fishing_bonus",
    "farm_bonus",
    "quest_bonus",
    "temporary_protection",
    "loot_bonus",
    "coin_multiplier",
    "coin_reward",
    "rob_shield",
    "bank_capacity",
)

#: Effects that grant a flat, immediate payout when the item is used, rather
#: than a timed buff. `effect_value` is the coin amount, not a percentage.
_INSTANT_EFFECTS = frozenset({"coin_reward"})

#: Effects whose value is an ABSOLUTE amount of extra bank capacity rather
#: than a percentage, so they are bounded by an absolute ceiling instead of
#: MAX_EFFECT_VALUE. A capacity item adds room; it never multiplies it.
_ABSOLUTE_EFFECTS = frozenset({"bank_capacity"})
MAX_BANK_CAPACITY_BONUS = 100_000_000

#: Effects whose value is a percentage multiplier (0.10 == +10%).
_MULTIPLIER_EFFECTS = frozenset({
    "xp_multiplier", "work_reward_multiplier", "luck_bonus", "fishing_bonus",
    "farm_bonus", "quest_bonus", "loot_bonus", "coin_multiplier",
})

#: Effects whose value is a fraction (0.25 == 25% shorter cooldown).
_FRACTION_EFFECTS = frozenset({"cooldown_reduction"})

#: Absolute ceiling for a *percentage* effect, so a bad catalog row cannot
#: wreck the economy. Instant coin payouts use MAX_COIN_REWARD instead — they
#: are an absolute amount, not a multiplier, and capping them at 1.0 would
#: silently zero out every consumable.
MAX_EFFECT_VALUE = 1.00
MAX_COIN_REWARD = 1_000_000
MAX_EFFECT_DURATION = 24 * 3600

#: Shop price bands per rarity, in coins. These are REVIEW RANGES used to
#: audit the catalog, not hard limits — an individual item may sit outside its
#: band, but the band is what the audit compares against and what the test
#: suite flags. Godly is open-ended because a godly collectible has no effect
#: and no sell value to price it against.
SHOP_BANDS: dict[str, tuple[int, int | None]] = {
    "common": (50, 250),
    "uncommon": (200, 750),
    "rare": (500, 2_000),
    "epic": (1_500, 7_500),
    "godly": (5_000, None),
}

#: Per-rarity default stock when an item is sold in a limited quantity.
#: `None` means unlimited.
DEFAULT_STOCK: dict[str, int | None] = {
    "common": None,
    "uncommon": None,
    "rare": 5,
    "epic": 3,
    "godly": 1,
}


def effect_ceiling(effect_type: Any) -> float:
    """The maximum legal `effect_value` for an effect type.

    Three categories, because one ceiling cannot serve all of them: percentage
    multipliers are fractions, instant coin payouts and bank-capacity bonuses
    are absolute amounts. Callers (including the test suite) should read the
    ceiling from here rather than re-deriving it, so adding a category cannot
    leave a validator and a test disagreeing about what "too large" means.
    """
    etype = effect_type.strip().lower() if isinstance(effect_type, str) else ""
    if etype in _INSTANT_EFFECTS:
        return float(MAX_COIN_REWARD)
    if etype in _ABSOLUTE_EFFECTS:
        return float(MAX_BANK_CAPACITY_BONUS)
    return float(MAX_EFFECT_VALUE)


def validate_effect(effect_type: Any, effect_value: Any, effect_duration: Any) -> tuple[str, float, int]:
    """Validate a stored/catalogued effect triple. Never raises.

    Returns `(effect_type, effect_value, effect_duration)` with the type
    dropped (→ `"", 0.0, 0`) if it is unusable, so a bad row degrades to a
    plain item instead of exploding at payout time.

    A value or duration outside its range invalidates the whole effect rather
    than being silently clamped: clamping a 10^9-second buff to 0 would turn a
    timed effect into a permanent one.
    """
    etype = effect_type.strip().lower() if isinstance(effect_type, str) else ""
    if etype not in EFFECT_TYPES:
        return "", 0.0, 0
    try:
        value = float(effect_value)
    except (TypeError, ValueError):
        return "", 0.0, 0
    if value != value or value in (float("inf"), float("-inf")):  # NaN / inf
        return "", 0.0, 0
    try:
        duration = int(effect_duration)
    except (TypeError, ValueError):
        return "", 0.0, 0
    if value < 0:
        return "", 0.0, 0
    if duration < 0 or duration > MAX_EFFECT_DURATION:
        return "", 0.0, 0
    if value > effect_ceiling(etype):
        return "", 0.0, 0
    if etype in _FRACTION_EFFECTS and value > 1:
        return "", 0.0, 0
    return etype, value, duration


# ── Item model ────────────────────────────────────────────────────────
ITEM_FIELDS: tuple[str, ...] = (
    "item_id", "name", "description", "category", "rarity",
    "buy_price", "sell_price", "stackable", "tradeable", "sellable",
    "usable", "equipable", "effect_type", "effect_value", "effect_duration",
    "drop_sources", "created_at", "updated_at",
)

_ID_RE = re.compile(r"^[a-z][a-z0-9_]{1,48}$")


class ItemError(ValueError):
    """Raised only for *programmer* errors (bad catalog row), never for user input."""


def _i(
    item_id: str,
    name: str,
    category: str,
    rarity: str,
    description: str,
    buy: int = 0,
    sell: int = 0,
    *,
    stackable: bool = True,
    tradeable: bool = True,
    sellable: bool | None = None,
    usable: bool | None = None,
    equipable: bool | None = None,
    effect_type: str | None = None,
    effect_value: float = 0.0,
    effect_duration: int = 0,
    sources: tuple[str, ...] = (),
    active: bool = True,
    shop: bool | None = None,
    stock: int | None = -1,
) -> dict:
    """Build one catalog row with every field present and correctly typed.

    `sellable` defaults to "sell_price > 0" and `usable` to "has an effect",
    so the common case stays terse but the stored row is never ambiguous.

    `shop` is the ONLY switch that decides whether the Murashop sells an item.
    It defaults to "has a buy price", but it is stored explicitly so shop
    access is never a side effect of a price being zero, and — critically — so
    it is never a side effect of an item's RARITY. A god/epic item with a real
    price is sold like any other; an item the owner does not want sold is
    marked `shop=False` by hand.

    `stock` is the per-rotation quantity, `-1` meaning "use the per-rarity
    default" and `None` meaning unlimited.
    """
    if not _ID_RE.match(item_id):
        raise ItemError(f"bad item_id: {item_id!r}")
    if normalize_rarity(rarity) not in RANK:
        raise ItemError(f"bad rarity for {item_id}: {rarity!r}")
    if normalize_category(category) not in CATEGORIES:
        raise ItemError(f"bad category for {item_id}: {category!r}")
    buy_price = max(0, int(buy or 0))
    sell_price = max(0, int(sell or 0))
    etype, evalue, edur = validate_effect(effect_type, effect_value, effect_duration)
    rarity = normalize_rarity(rarity)
    shop_enabled = (buy_price > 0) if shop is None else bool(shop)
    if shop_enabled and buy_price <= 0:
        raise ItemError(f"{item_id} is shop_enabled but has no buy price")
    if stock == -1:
        stock = DEFAULT_STOCK[rarity]
    elif stock is not None:
        stock = int(stock)
        if stock < 0:
            raise ItemError(f"bad shop stock for {item_id}: {stock}")
    return {
        "item_id": item_id,
        "name": name,
        "description": description,
        "category": normalize_category(category),
        "rarity": normalize_rarity(rarity),
        "buy_price": buy_price,
        "sell_price": sell_price,
        "stackable": bool(stackable),
        "tradeable": bool(tradeable),
        "sellable": (sell_price > 0) if sellable is None else bool(sellable),
        "usable": (bool(etype) or category == "loot_box") if usable is None else bool(usable),
        "equipable": (normalize_category(category) == "equipment") if equipable is None else bool(equipable),
        "effect_type": etype,
        "effect_value": evalue,
        "effect_duration": edur,
        "drop_sources": tuple(sources),
        "created_at": None,
        "updated_at": None,
        "active": bool(active),
        "shop_enabled": shop_enabled,
        "shop_stock": stock,
    }


# ── The Muragoods item catalog ────────────────────────────────────────
# 110 original items. Campus life, coffee, stationery, Murastream, Murabot,
# Murashop and the small disasters of student life. Nothing here is imported
# from another bot: names, flavour, values and drop sources are ours.
# ── Migrated originals ───────────────────────────────────────────────
# These ten ids predate the item system and are referenced by live data and
# live code: `fish_catch` checks `fishing_rod` / `golden_hook` in player
# inventories, `RECIPES` consumes `gem_shard`, and `/inventory use` still
# handles `bread`. Renaming any of them would orphan real player inventories.
#
# Migration rule: the id, buy price and sell price are preserved EXACTLY so
# no existing wealth changes value. The metadata is upgraded to the new
# model (typed category, real effect, drop sources, normalised rarity) and
# the `legendary` rarity is folded into `godly`. Conflicts between the old
# and new data model are reported rather than deleted.
_CATALOG: list[dict] = [
    _i("bread", "Bread", "consumable", "common",
       "Cafeteria toast. Reliable, filling, eaten over a keyboard.",
       50, 10, effect_type="coin_reward", effect_value=50, effect_duration=0,
       sources=("shop", "daily")),
    _i("fishing_rod", "Fishing Rod", "equipment", "common",
       "Campus-issue rod. Unlocks the better fish table.",
       200, 80, effect_type="fishing_bonus", effect_value=0.10, effect_duration=0,
       sources=("shop", "achievements")),
    _i("lucky_charm", "Lucky Charm", "equipment", "rare",
       "A four-leaf Mura. Raises activity rewards while held.",
       500, 200, effect_type="luck_bonus", effect_value=0.10, effect_duration=0,
       sources=("shop", "loot_box")),
    _i("mystery_box", "Mystery Box", "loot_box", "rare",
       "The original mystery box. Still sold. Still mysterious.",
       500, 0, sellable=False, sources=("shop", "events")),
    _i("gem_shard", "Gem Shard", "sellable", "epic",
       "Three of these and a little coin becomes a gem.",
       1500, 150, sources=("fishing_bonus", "events")),
    _i("golden_hook", "Golden Hook", "equipment", "epic",
       "The rare bite comes far more often. So does the snapped line.",
       2500, 1000, effect_type="fishing_bonus", effect_value=0.18, effect_duration=0,
       sources=("shop", "achievements")),
    _i("adventure_ticket", "Adventure Ticket", "equipment", "rare",
       "One entry to a special Muragoods activity.",
       500, 0, sellable=False, sources=("shop", "events", "achievements")),
    _i("farm_plot_deed", "Farm Plot Deed", "equipment", "common",
       "Permanent legal claim to one more patch of campus soil.",
       250, 0, sellable=False, sources=("shop", "farm", "achievements")),
    _i("speed_fertilizer", "Speed Fertilizer", "buff", "common",
       "Halves the timers on everything currently in the ground.",
       150, 50, effect_type="farm_bonus", effect_value=0.35, effect_duration=0,
       sources=("shop", "farm")),
    _i("omega_key", "Omega Key", "equipment", "godly",
       "Proof of the endgame trials. Opens nothing you can name.",
       7500, 0, sellable=False, tradeable=False, sources=("achievements", "events")),
    # Bank capacity items. The bonus applies only WHILE the item is held and
    # is never written to the wallet, so putting one down raises the ceiling
    # again but never strands coins the member has already banked.
    _i("bank_permit", "Bank Expansion Permit", "equipment", "common",
       "Lifts the cap on your bank by 5,000 while you keep it. No paperwork.",
       250, 100, effect_type="bank_capacity", effect_value=5000, effect_duration=0,
       sources=("shop", "achievements")),
    _i("vault_deed", "Vault Deed", "equipment", "rare",
       "A legal claim to a further 50,000 of banked coins. Hold on to it.",
       1800, 700, effect_type="bank_capacity", effect_value=50000, effect_duration=0,
       sources=("shop", "achievements", "events")),
]

# The rest of the catalog is new: original Muragoods items across the nine
# categories.
_CATALOG += [
    # ── Common (38) ────────────────────────────────────────────────────
    _i("study_cookie", "Study Cookie", "consumable", "common",
       "Vanilla shortbread from the campus bakery. Cheap courage for the library.", 60, 25,
       effect_type="xp_multiplier", effect_value=0.05, effect_duration=1800, sources=("shop", "work")),
    _i("energy_soda", "Energy Soda", "consumable", "common",
       "Three sips and you remember every formula. Mostly.", 100, 40,
       effect_type="xp_multiplier", effect_value=0.08, effect_duration=1800, sources=("shop", "daily")),
    _i("trail_mix", "Trail Mix", "consumable", "common",
       "Somewhere between a snack and a roofing material.", 50, 18, sources=("shop", "quests")),
    _i("instant_noodles", "Instant Noodles", "consumable", "common",
       "Dorm-room survival. Tastes like victory.", 50, 12, sources=("shop", "work")),
    _i("vending_candy", "Vending Candy", "consumable", "common",
       "Dropped a coin at 2am and got tangerine. Regretted it by 2:04.", 50, 10, sources=("shop", "farm")),
    _i("mystery_snack", "Mystery Snack", "consumable", "common",
       "The wrapper is half the fun. The other half is luck.", 150, 65,
       effect_type="loot_bonus", effect_value=0.10, effect_duration=900, sources=("shop", "loot_box")),
    _i("campus_snack", "Campus Snack", "consumable", "common",
       "The one everyone shares during a 9am lecture. It is gone by 9:04.", 50, 14, sources=("shop", "daily")),
    _i("campus_latte", "Campus Latte", "consumable", "common",
       "Four shots, oat milk, and a lecture in the cup sleeve.", 85, 34,
       effect_type="coin_reward", effect_value=90, effect_duration=0,
       sources=("shop", "work", "daily")),
    _i("granola_bar", "Granola Bar", "consumable", "common",
       "Stuck to a textbook. Now it is a free snack and a stain.",       50, 11,
       effect_type="coin_reward", effect_value=30, effect_duration=0,
       sources=("shop", "quests", "daily")),
    _i("dorm_tea", "Dorm Tea", "consumable", "common",
       "Brewed twice. Bought once. Effective once.", 55, 16,
       effect_type="xp_multiplier", effect_value=0.06, effect_duration=1800,
       sources=("shop", "work")),

    _i("mura_pin", "Muragoods Pin", "collectible", "common",
       "A small enamel pin of the Mura mascot. Extremely collectible, structurally not load-bearing.",
       120, 55, sources=("shop", "events", "achievements")),
    _i("golden_mura_coin", "Golden Mura Coin", "collectible", "rare",
       "Struck for the campus shop launch. Heavy in a pocket for a reason.",
       1200, 1800, sources=("achievements", "events", "loot_box")),
    _i("campus_trophy", "Campus Trophy", "collectible", "rare",
       "For the team that turned a group project into a personality.", 1800, 2600,
       sources=("achievements", "events")),
    _i("tiny_mascot", "Tiny Mascot", "collectible", "common",
       "A beanbag Mura. Wins every office football match by being thrown at it.", 90, 40,
       sources=("shop", "events")),
    _i("founder_badge", "Founder Badge", "collectible", "epic",
       "Worn by the people who showed up before there was anything to show up to.",
       4500, 5200, tradeable=False, sources=("events",)),
    _i("campus_photo", "Campus Photo", "collectible", "uncommon",
       "Everyone looks terrible. That is exactly why it is worth keeping.", 200, 190,
       sources=("quests", "events")),
    _i("class_schedule", "Class Schedule", "collectible", "common",
       "A wall planner from the start of term, in March.", 50, 45, sources=("quests", "work", "daily")),
    _i("mural_sketch", "Mural Sketch", "collectible", "common",
       "Rubbing of the quad mural. Slightly smudged, entirely sentimental.", 55, 70,
       sources=("quests", "events")),
    _i("campus_magnet", "Campus Magnet", "collectible", "common",
       "Fridge-side proof of enrolment, or just a nice picture.", 50, 24,
       sources=("shop", "events", "daily")),
    _i("lost_property_tag", "Lost Property Tag", "collectible", "common",
       "Number 214. Nobody has ever claimed 214.", 50, 18, sources=("quests", "work")),

    _i("student_backpack", "Student Backpack", "equipment", "common",
       "Carries more than it should, and always one thing too many.",       250, 210,
       effect_type="loot_bonus", effect_value=0.05, effect_duration=0, sources=("shop",)),
    _i("campus_id", "Campus ID", "equipment", "common",
       "Grants access to a building, and gives it a name at the desk.", 250, 105,
       effect_type="cooldown_reduction", effect_value=0.05, effect_duration=0, sources=("shop", "quests")),
    _i("notebook_cover", "Notebook Cover", "equipment", "common",
       "Decorative. Genuinely the only reason the notes are readable.", 140, 60,
       effect_type="quest_bonus", effect_value=0.05, effect_duration=0, sources=("shop",)),
    _i("campus_hoodie", "Campus Hoodie", "equipment", "uncommon",
       "Warm, enormous, and a reliable way to lose a lecture hall on purpose.",
       600, 420, effect_type="work_reward_multiplier", effect_value=0.05, effect_duration=0, sources=("shop", "achievements")),
    _i("event_lanyard", "Event Lanyard", "equipment", "uncommon",
       "Still says MURAGOODS on it. Still works at the door.", 350, 140,
       effect_type="temporary_protection", effect_value=0.15, effect_duration=3600, sources=("events", "shop")),
    _i("campus_cap", "Campus Cap", "equipment", "common",
       "Shades the eyes, hides a bad morning, survives a mosh pit.", 200, 130,
       effect_type="luck_bonus", effect_value=0.03, effect_duration=0, sources=("shop", "events")),
    _i("book_strap", "Book Strap", "equipment", "common",
       "Stops a textbook escaping down a lecture hall staircase.", 180, 78,
       effect_type="cooldown_reduction", effect_value=0.03, effect_duration=0, sources=("shop", "quests")),

    _i("scrap_paper", "Scrap Paper", "sellable", "common",
       "The back of a lecture slide. Someone's notes on the other side.", 0, 12,
       sources=("work", "quests", "farm")),
    _i("old_notebook", "Old Notebook", "sellable", "common",
       "Two terms of notes you will never read. Weightless in value, heavy in a bag.", 0, 30,
       sources=("work", "quests")),
    _i("fresh_fish", "Fresh Fish", "sellable", "common",
       "Still warm. That is either fresh or a problem.", 0, 55, sources=("fish", "farm")),
    _i("campus_flower", "Campus Flower", "sellable", "common",
       "Picked from the courtyard beds. We are not asking questions.", 0, 22,
       sources=("farm", "quests")),
    _i("coffee_grounds", "Coffee Grounds", "sellable", "common",
       "The honest output of the campus cafe machine.", 0, 18, sources=("work", "shop")),
    _i("lecture_notes", "Lecture Notes", "sellable", "uncommon",
       "Somebody's careful handwriting, complete for once.", 0, 140, sources=("quests", "work")),
    _i("homework_page", "Homework Page", "sellable", "common",
       "One correct answer and a lot of optimism.", 0, 40, sources=("quests", "work")),
    _i("broken_charger", "Broken Charger", "sellable", "common",
       "Charges nothing. Sells, briefly, for the copper.", 0, 26, sources=("work", "quests")),
    _i("recycled_can", "Recycled Can", "sellable", "common",
       "Fizzy, then flat, then valuable. The full product lifecycle.", 0, 8,
       sources=("work", "quests", "daily")),
    _i("empty_notebook", "Empty Notebook", "sellable", "common",
       "Bought with intent. Still has the intent intact.", 0, 35, sources=("shop", "quests")),
    _i("outdated_handout", "Outdated Handout", "sellable", "common",
       "Room change three times and still gets handed out.", 0, 16, sources=("work", "quests")),

    _i("broken_pencil", "Broken Pencil", "trinket", "common",
       "Snapped at the exact moment you needed it. Everyone owns three.", 0, 20, sources=("work", "quests")),
    _i("tiny_bell", "Tiny Bell", "trinket", "common",
       "Rings when someone opens the chat. Harmless. Annoying.", 70, 30, sources=("shop", "events")),
    _i("lucky_keychain", "Lucky Keychain", "trinket", "uncommon",
       "A small Mura mascot on a swivel. Statistically meaningless, emotionally not.",
       400, 260, effect_type="luck_bonus", effect_value=0.04, effect_duration=0, sources=("shop", "loot_box")),
    _i("coffee_sleeve", "Coffee Sleeve", "trinket", "common",
       "Cardboard with a coffee stain and a memory attached.", 60, 25, sources=("work", "shop")),
    _i("mura_sticker", "Mura Sticker", "trinket", "common",
       "Sticks to a laptop and lasts exactly one term.", 55, 22, sources=("shop", "daily", "events")),
    _i("campus_highlighter", "Campus Highlighter", "trinket", "uncommon",
       "Highlights everything, so nothing stands out.", 200, 45, sources=("shop", "quests")),
    _i("clip_on_badge", "Clip-On Badge", "trinket", "uncommon",
       "Reads VISITOR in bold. Freedom.", 200, 55, sources=("events", "shop")),
    _i("paperclip_chain", "Paperclip Chain", "trinket", "common",
       "Three paperclips linked by hope and poor time management.", 50, 19, sources=("work", "quests")),
    _i("campus_eraser", "Campus Eraser", "trinket", "common",
       "Worn to a shape. Fades a little more with every exam.", 50, 14, sources=("shop", "quests")),
    _i("sticky_note_roll", "Sticky Note Roll", "trinket", "common",
       "Emergency reminders, in quantity. Never the right one.", 50, 28, sources=("work", "quests")),
    _i("mini_highlighter", "Mini Highlighter", "trinket", "uncommon",
       "A highlighter that fits in a pen case. The good idea of the year.",       200, 130,
       sources=("shop", "loot_box")),

    _i("mura_box", "Mura Box", "loot_box", "common",
       "The standard campus mystery box. Usually a snack.", 250, 150, sources=("shop", "daily", "events")),
    _i("study_box", "Study Box", "loot_box", "uncommon",
       "Stationery restock with a suspicious rattle inside.", 750, 300, sources=("shop", "achievements")),

    _i("starter_student_pack", "Starter Student Pack", "pack", "common",
       "Everything a first-year actually needs, which is mostly pens.", 250, 0, sellable=False,
       sources=("shop", "events")),
    _i("study_pack", "Study Pack", "pack", "uncommon",
       "Snacks, a notebook and one honest revision plan.", 750, 0, sellable=False, sources=("shop", "achievements")),

    _i("study_boost", "Study Boost", "buff", "uncommon",
       "An hour of pretending the reading list is short.",       750, 300,
       effect_type="xp_multiplier", effect_value=0.15, effect_duration=3600, sources=("shop", "achievements")),
    _i("xp_snack", "XP Snack", "buff", "uncommon",
       "Tastes like a textbook cover. Works like one, somehow.", 500, 220,
       effect_type="xp_multiplier", effect_value=0.10, effect_duration=1800, sources=("shop", "daily")),
    _i("double_shift_drink", "Double Shift Drink", "buff", "rare",
       "Two shifts' worth of energy in a can you will regret at 2am.",       1500, 700,
       effect_type="work_reward_multiplier", effect_value=0.20, effect_duration=3600, sources=("shop", "achievements")),
    _i("lucky_drink", "Lucky Drink", "buff", "uncommon",
       "Bright, fizzing, and statistically irrelevant until it is not.",       650, 270,
       effect_type="luck_bonus", effect_value=0.10, effect_duration=1800, sources=("shop", "loot_box")),

    _i("sleepy_token", "Sleepy Token", "debuff", "common",
       "A warm little weight. Your cooldowns will forgive you for it.", 0, 20,
       effect_type="cooldown_reduction", effect_value=0.10, effect_duration=0, sources=("work", "events")),
    _i("monday_curse", "Monday Curse", "debuff", "uncommon",
       "Everything you earn today comes with a small apology.", 0, 45,
       effect_type="work_reward_multiplier", effect_value=0.08, effect_duration=0, sources=("daily", "work", "events")),
    _i("heavy_backpack", "Heavy Backpack", "debuff", "uncommon",
       "Carries more, earns less, and will be on your shoulder all day.", 0, 55,
       effect_type="work_reward_multiplier", effect_value=0.10, effect_duration=0, sources=("work", "events")),
    _i("bad_luck_sticker", "Bad Luck Sticker", "debuff", "rare",
       "Do not peel this one off. That is the entire rule.", 0, 120,
       effect_type="luck_bonus", effect_value=0.12, effect_duration=0, sources=("loot_box", "events")),
    _i("tired_sneakers", "Tired Sneakers", "debuff", "common",
       "They have done the walk. The walk is doing them.", 0, 24,
       effect_type="work_reward_multiplier", effect_value=0.05, effect_duration=0, sources=("work", "daily")),
    _i("cursed_charging_cable", "Cursed Charging Cable", "debuff", "uncommon",
       "Charges at 2%, in bursts, only when you are not watching.", 0, 40,
       effect_type="luck_bonus", effect_value=0.06, effect_duration=0, sources=("work", "loot_box")),
    _i("spilled_latte_token", "Spilled Latte Token", "debuff", "common",
       "Proof of the 8am spill. Coins cling to it out of respect.", 0, 15,
       effect_type="work_reward_multiplier", effect_value=0.04, effect_duration=0, sources=("daily", "events")),

    # ── Uncommon (28) ──────────────────────────────────────────────────
    _i("lucky_pencil", "Lucky Pencil", "equipment", "uncommon",
       "Never breaks mid-exam. Improves quest rewards for a while.",       700, 560,
       effect_type="quest_bonus", effect_value=0.10, effect_duration=3600, sources=("shop", "achievements")),
    _i("campus_keychain", "Campus Keychain", "collectible", "uncommon",
       "Four keys, one of which opens something, probably not on campus.", 350, 230, sources=("shop", "quests")),
    _i("study_drink", "Study Drink", "consumable", "uncommon",
       "Modest, reliable, and not available in a coffin size.",       300, 165,
       effect_type="xp_multiplier", effect_value=0.12, effect_duration=2400, sources=("shop", "daily")),
    _i("fortune_coffee", "Fortune Coffee", "buff", "rare",
       "The cup says 'you will have a good day'. The coffee is doing the real work.",
       1300, 620, effect_type="luck_bonus", effect_value=0.15, effect_duration=2400, sources=("shop", "loot_box")),
    _i("explorer_backpack", "Explorer Backpack", "equipment", "uncommon",
       "Built for the campus and the field trip that went badly.", 750, 950,
       effect_type="loot_bonus", effect_value=0.10, effect_duration=0, sources=("shop", "achievements")),
    _i("pro_calculator", "Pro Calculator", "equipment", "rare",
       "Solar powered, exam-room legal, faintly intimidating.",       1900, 1500,
       effect_type="quest_bonus", effect_value=0.15, effect_duration=0, sources=("shop", "achievements")),
    _i("open_textbook", "Open Textbook", "equipment", "uncommon",
       "Left open on purpose so the chapter was ready before class.",       700, 700,
       effect_type="xp_multiplier", effect_value=0.08, effect_duration=0, sources=("quests", "achievements")),
    _i("mystery_package", "Mystery Package", "sellable", "uncommon",
       "Nobody has ever agreed on what is inside.", 0, 320, sources=("crime", "rob", "events")),
    _i("clean_notes", "Clean Notes", "sellable", "uncommon",
       "Somebody's tidy handwriting, which is rarer than it should be.", 0, 260, sources=("quests", "work")),
    _i("spare_lab_coat", "Spare Lab Coat", "sellable", "uncommon",
       "Does not fit. Smells faintly of science.", 0, 380, sources=("work", "events")),
    _i("library_receipt", "Library Receipt", "sellable", "uncommon",
       "Proof you returned it. Technically on time.", 0, 95, sources=("quests", "work")),
    _i("recycle_bin_find", "Recycle Bin Find", "sellable", "uncommon",
       "Someone's lost USB, renamed out of mercy.", 0, 210, sources=("work", "quests")),
    _i("vending_receipt", "Vending Receipt", "trinket", "uncommon",
       "Item 7. Nobody knows what item 7 is.", 200, 60, sources=("shop", "daily")),
    _i("mura_band_tee", "Mura Band Tee", "equipment", "uncommon",
       "From a band that played the student bar exactly once.",       700, 600,
       effect_type="xp_multiplier", effect_value=0.06, effect_duration=0, sources=("shop", "murastream")),
    _i("movie_ticket_stub", "Movie Ticket Stub", "collectible", "uncommon",
       "Proof you were somewhere else instead of revising.", 200, 210, sources=("murastream", "events")),
    _i("arcade_token", "Arcade Token", "collectible", "uncommon",
       "One of the last eight on the campus arcade board.", 300, 340, sources=("games", "events")),
    _i("campus_beanbag", "Campus Beanbag", "equipment", "uncommon",
       "Furniture and, briefly, a weapon.", 650, 470,
       effect_type="temporary_protection", effect_value=0.12, effect_duration=1800, sources=("shop", "events")),
    _i("library_card", "Library Card", "equipment", "uncommon",
       "Your fines record is a work of art.",       500, 300,
       effect_type="cooldown_reduction", effect_value=0.08, effect_duration=0, sources=("quests", "shop")),
    _i("campus_mystery_box", "Campus Mystery Box", "loot_box", "uncommon",
       "Bigger than the Mura Box. Worse odds, better flavour text.", 750, 400, sources=("shop", "events", "achievements")),
    _i("weekend_box", "Weekend Box", "loot_box", "uncommon",
       "Dropped on a Friday. Opened on a Sunday.", 600, 350, sources=("events", "daily")),
    _i("campus_worker_pack", "Campus Worker Pack", "pack", "uncommon",
       "Gloves, a visor and the specific exhaustion of a shift.", 750, 0, sellable=False,
       sources=("work", "achievements", "shop")),
    _i("luck_break_charm", "Luck Break Charm", "equipment", "uncommon",
       "A bent paperclip in a card sleeve. It works more than it should.",
       750, 880, effect_type="luck_bonus", effect_value=0.12, effect_duration=0, sources=("shop", "loot_box")),
    _i("bonus_roll_ticket", "Bonus Roll Ticket", "equipment", "uncommon",
       "One extra roll on a machine that is mostly luck anyway.", 450, 0, sellable=False,
       sources=("lottery", "shop", "events")),
    _i("group_project_credit", "Group Project Credit", "collectible", "uncommon",
       "You did the work. Everyone knows you did the work.",       300, 400,
       sources=("quests", "achievements")),
    _i("desk_lamp", "Desk Lamp", "equipment", "uncommon",
       "Turns a 9pm problem into a 10pm problem, but a lit one.", 700, 660,
       effect_type="xp_multiplier", effect_value=0.09, effect_duration=0, sources=("shop", "work")),
    _i("campus_mug", "Campus Mug", "collectible", "uncommon",
       "Free with the first coffee, which is the best coffee.", 300, 360, sources=("shop", "work")),
    _i("lab_coat", "Lab Coat", "equipment", "uncommon",
       "Worn by everyone in the group photo. Fits about two of you.",       750, 1000,
       effect_type="quest_bonus", effect_value=0.12, effect_duration=0, sources=("shop", "achievements")),
    _i("open_letter", "Open Letter", "collectible", "uncommon",
       "From the founder, sent to everyone, read by almost no one.", 400, 520,
       sources=("events", "achievements")),

    # ── Rare (22) ──────────────────────────────────────────────────────
    _i("golden_mura_coin_p2", "Golden Campus Token", "collectible", "rare",
       "A second coin, struck for the campus shop relaunch.", 2000, 3200, sources=("events", "achievements")),
    _i("master_student_card", "Master Student Card", "equipment", "epic",
       "Grants access to a door that is technically always unlocked.", 5000, 7400,
       tradeable=False, effect_type="xp_multiplier", effect_value=0.20, effect_duration=3600,
       sources=("achievements", "events")),
    _i("golden_campus_pass", "Golden Campus Pass", "equipment", "epic",
       "Waves at everything. Including, once, a locked door that stayed shut.",
       4800, 6800, tradeable=False, sources=("events", "achievements")),
    _i("mura_mystery_chest", "Mura Mystery Chest", "loot_box", "epic",
       "The high-tier campus box. Loud, heavy, and rarely worth the key.",
       5200, 1800, sources=("achievements", "events", "loot_box")),
    _i("legendary_koi", "Legendary Koi", "collectible", "epic",
       "Named for the myth, not the rarity. It is an Epic fish, and it knows it.",
       3200, 4200, sources=("fish",)),
    _i("roasted_coffee_bean", "Roasted Coffee Bean", "sellable", "rare",
       "Single origin, high altitude, mildly unreasonable about it.", 0, 900, sources=("work", "farm")),
    _i("exam_seat_token", "Exam Seat Token", "equipment", "rare",
       "A window seat, near the door, in writing nobody can prove.",
       1500, 760, effect_type="quest_bonus", effect_value=0.14, effect_duration=0,
       sources=("quests", "achievements")),
    _i("gaming_headset", "Gaming Headset", "equipment", "rare",
       "Turns a Murastream night into a very late Murastream night.",
       1800, 1250, effect_type="xp_multiplier", effect_value=0.10, effect_duration=0,
       sources=("shop", "murastream")),
    _i("streaming_mic", "Streaming Mic", "equipment", "rare",
       "Broadcast quality, dorm acoustics.",       1900, 1400,
       effect_type="work_reward_multiplier", effect_value=0.12, effect_duration=0,
       sources=("shop", "murastream", "achievements")),
    _i("mura_hoodie", "Muragoods Hoodie", "equipment", "rare",
       "The uniform of people who answer Discord notifications at midnight.",
       1900, 1350, effect_type="work_reward_multiplier", effect_value=0.15, effect_duration=0,
       sources=("shop", "achievements", "events")),
    _i("golden_screwdriver", "Golden Screwdriver", "equipment", "rare",
       "For the /build that has to be done before the deadline.",
       1700, 1100, effect_type="quest_bonus", effect_value=0.16, effect_duration=0,
       sources=("shop", "achievements")),
    _i("treasure_map", "Treasure Map", "equipment", "rare",
       "X marks a spot behind the engineering block. Probably.",
       1500, 850, effect_type="luck_bonus", effect_value=0.14, effect_duration=0,
       sources=("quests", "loot_box", "events")),
    _i("discord_badge", "Discord Badge", "collectible", "rare",
       "For the early days when the whole campus fit in one voice channel.",
       900, 1400, sources=("events", "achievements")),
    _i("vending_treasure", "Vending Treasure", "sellable", "rare",
       "Item 7, resolved. It was a good one.", 0, 760, sources=("work", "quests", "events")),
    _i("rare_fish_catch", "Abyssal Eel", "sellable", "rare",
       "Caught once, mostly remembered. Worth a lot to the right collector.",
       0, 1100, sources=("fish",)),
    _i("founder_letter", "Founder Letter", "collectible", "rare",
       "The original letter that started the shop. Framed, then unframed, then framed.",
       1500, 2400, sources=("events", "achievements")),
    _i("overnight_boiler", "Overnight Boiler", "equipment", "rare",
       "A pot that got left on. It is still technically soup.",       1600, 900,
       effect_type="xp_multiplier", effect_value=0.12, effect_duration=0, sources=("shop", "work")),
    _i("gold_bar_souvenir", "Gold Bar Souvenir", "sellable", "rare",
       "A bit of real gold in a display case. Zero utility, excellent shelf presence.",
       1300, 1700, sources=("events", "achievements")),
    _i("limited_mura_pin", "Limited Muragoods Pin", "collectible", "rare",
       "Only given out at the launch event. 300 made, and that is the joke.",
       1000, 2100, sources=("events",)),

    # ── Epic (16) ──────────────────────────────────────────────────────
    _i("mura_founder_pin", "Mura Founder Pin", "collectible", "epic",
       "A black-enamel founder pin. The pin the other pins are modelled on.",
       5500, 8600, sources=("events", "achievements")),
    _i("mura_relic_bundle", "Mura Relic Case", "pack", "epic",
       "Display case for the pieces that do not fit in a pocket.", 4000, 0, sellable=False,
       sources=("events",)),
    _i("founder_pack", "Founder Pack", "pack", "epic",
       "Everything from the launch, boxed, for people who were there.", 6500, 0,
       sellable=False, sources=("events", "achievements")),
    _i("lucky_student_pack", "Lucky Student Pack", "pack", "epic",
       "The good version of the starter pack. Considerably less sensible.",
       6000, 0, sellable=False, sources=("shop", "achievements")),
    _i("explorer_pack", "Explorer Pack", "pack", "epic",
       "Field kit, good lamp, better plan for the weekend.", 5200, 0, sellable=False,
       sources=("shop", "achievements")),
    _i("gold_mystery_box", "Golden Mura Box", "loot_box", "epic",
       "Gold leaf on the outside, a proper weight distribution on the inside.",
       3800, 1200, sources=("achievements", "events", "loot_box")),
    _i("lucky_break", "Lucky Break", "buff", "epic",
       "One long, very good afternoon. Everything pays a little more for an hour.",
       4800, 1900, effect_type="coin_multiplier", effect_value=0.30, effect_duration=3600,
       sources=("shop", "achievements", "loot_box")),
    _i("double_xp_pass", "Double XP Pass", "buff", "epic",
       "Redeemed against a single session. Not renewable, not stackable, not for sale twice.",
       4200, 1700, effect_type="xp_multiplier", effect_value=0.35, effect_duration=3600,
       sources=("achievements", "events")),
    _i("rob_shield_token", "Rob Shield Token", "equipment", "epic",
       "Absorbs one failed robbery attempt. Refuses to stack, on purpose.",
       3400, 1400, effect_type="rob_shield", effect_value=1.0, effect_duration=0,
       sources=("shop", "achievements", "crime")),
    _i("murastream_trophy", "Murastream Trophy", "collectible", "epic",
       "For the first year of streams nobody but a few dozen watched.",
       5000, 6400, sources=("murastream", "events")),
    _i("midnight_keepsake", "Midnight Keepsake", "collectible", "epic",
       "Awarded for staying up past the point of sense.", 4500, 5200, sources=("murastream", "achievements")),

    # ── Godly (6) ──────────────────────────────────────────────────────
]

# The final Godly tier. Kept separate so the rarity stays prestigious and
# purely collectible: none of these grant a gameplay effect, and all of them
# are unsellable so they cannot leak value back into the coin economy.
_CATALOG += [
    _i("founder_seal", "Founder Seal", "collectible", "godly",
       "The stamp that opened the first account. One exists.", 9000, 0,
       tradeable=False, sources=("events",)),
    _i("first_purchase_relic", "First Purchase Relic", "collectible", "godly",
       "The very first thing ever bought in the Murashop, kept unspent since.", 6500, 0,
       tradeable=False, sources=("achievements", "events")),
    _i("murabot_prime_lens", "Murabot Prime Lens", "equipment", "godly",
       "The original optic, ground once, never replaced. It shows you nothing extra. It is simply right.",
       11000, 0, tradeable=False, equipable=True, sources=("events", "achievements")),
    _i("campus_night_sky", "Campus Night Sky", "collectible", "godly",
       "A single frame of the quad at 3am, printed once.", 8500, 0,
       tradeable=False, sources=("events",)),
    _i("the_long_odyssey", "The Long Odyssey", "collectible", "godly",
       "A quest log from the first year, every entry still open.", 12000, 0,
       tradeable=False, sources=("achievements", "events")),
    _i("mura_eternal_pin", "Mura Eternal Pin", "collectible", "godly",
       "Pins are pressed at the campus shop. This one was pressed by hand, once.",
       7000, 0, tradeable=False, sources=("events", "achievements")),
]

CATALOG: dict[str, dict] = {row["item_id"]: row for row in _CATALOG}

# Fail loudly at import time if the catalog is malformed — a broken row must
# never reach a player.
assert len(CATALOG) == len(_CATALOG), "duplicate item_id in catalog"
assert len(CATALOG) >= 100, f"catalog must hold 100+ items, found {len(CATALOG)}"

# ── Lookup helpers ────────────────────────────────────────────────────

#: Display-name (and id-prefix) lookup, for `/item <name>` autocomplete.
_ALIASES: dict[str, str] = {}
for _row in _CATALOG:
    _ALIASES[_row["item_id"]] = _row["item_id"]
    _ALIASES.setdefault(_row["name"].strip().lower(), _row["item_id"])


def get_item(item_id: Any) -> dict | None:
    """Resolve a stored/typed item id to a catalog row. Never raises."""
    if not isinstance(item_id, str):
        return None
    key = item_id.strip().lower().replace(" ", "_")
    if key in CATALOG:
        return CATALOG[key]
    return None


def resolve_item(value: Any) -> dict | None:
    """Resolve by id *or* display name, for user-facing lookups."""
    if not isinstance(value, str):
        return None
    raw = value.strip()
    row = get_item(raw)
    if row:
        return row
    return get_item(_ALIASES.get(raw.lower()))


def search_items(query: str = "", category: str = "", rarity: str = "",
                 max_price: Any = None, sellable_only: bool = False) -> list[dict]:
    """Filtered, sorted search used by `/item search`, `/shop` and the dashboard."""
    rows = [r for r in CATALOG.values() if r["active"]]
    if category:
        cat = normalize_category(category, "")
        if cat:
            rows = [r for r in rows if r["category"] == cat]
    if rarity:
        rar = normalize_rarity(rarity, "")
        if rar:
            rows = [r for r in rows if r["rarity"] == rar]
    if max_price is not None:
        try:
            cap = int(max_price)
            rows = [r for r in rows if r["buy_price"] <= cap]
        except (TypeError, ValueError):
            pass
    if sellable_only:
        rows = [r for r in rows if r["sellable"]]
    if query:
        q = query.strip().lower()
        rows = [r for r in rows
                if q in r["item_id"] or q in r["name"].lower() or q in r["description"].lower()]
    return sorted(rows, key=lambda r: (RANK[r["rarity"]], r["buy_price"], r["name"]))


def items_by_rarity(rarity: Any) -> list[dict]:
    rar = normalize_rarity(rarity, "common")
    return sorted((r for r in CATALOG.values() if r["rarity"] == rar),
                  key=lambda r: r["name"])


def catalog_counts() -> dict[str, int]:
    counts = {r: 0 for r in RARITIES}
    for row in CATALOG.values():
        counts[row["rarity"]] += 1
    return counts


def rarity_badge(rarity: Any) -> str:
    rar = normalize_rarity(rarity)
    return f"{RARITY_EMOJI[rar]} {rar.title()}"


def is_instant(effect_type: Any) -> bool:
    return isinstance(effect_type, str) and effect_type.strip().lower() in _INSTANT_EFFECTS


def instant_reward(row: dict) -> int:
    """Flat coin payout for a one-shot consumable, validated server-side."""
    if not row or not is_instant(row.get("effect_type")):
        return 0
    etype, value, _ = validate_effect(row.get("effect_type"), row.get("effect_value"), 0)
    return int(value) if etype in _INSTANT_EFFECTS else 0


# ── Loot tables ───────────────────────────────────────────────────────
# Weights are per-band and sum to 100 within each table. A band with no
# matching items is skipped rather than crashing a roll.
LOOT_TABLES: dict[str, dict] = {
    "mura_box": {"label": "Mura Box", "bands": {"common": 85, "uncommon": 13, "rare": 2}},
    "campus_mystery_box": {"label": "Campus Mystery Box",
                            "bands": {"common": 55, "uncommon": 33, "rare": 10, "epic": 2}},
    "study_box": {"label": "Study Box",
                  "bands": {"common": 45, "uncommon": 35, "rare": 15, "epic": 5}},
    "weekend_box": {"label": "Weekend Box",
                    "bands": {"common": 50, "uncommon": 30, "rare": 15, "epic": 4, "godly": 1}},
    "mystery_box": {"label": "Mystery Box",
                    "bands": {"common": 30, "uncommon": 35, "rare": 25, "epic": 9, "godly": 1}},
    "mura_mystery_chest": {"label": "Mura Mystery Chest",
                           "bands": {"uncommon": 20, "rare": 40, "epic": 33, "godly": 7}},
    "gold_mystery_box": {"label": "Golden Mura Box",
                         "bands": {"rare": 35, "epic": 50, "godly": 15}},
    "starter_student_pack": {"label": "Starter Student Pack",
                             "bands": {"common": 80, "uncommon": 20}},
    "study_pack": {"label": "Study Pack",
                   "bands": {"common": 40, "uncommon": 40, "rare": 20}},
    "campus_worker_pack": {"label": "Campus Worker Pack",
                           "bands": {"common": 25, "uncommon": 45, "rare": 25, "epic": 5}},
    "lucky_student_pack": {"label": "Lucky Student Pack",
                           "bands": {"uncommon": 35, "rare": 40, "epic": 22, "godly": 3}},
    "explorer_pack": {"label": "Explorer Pack",
                      "bands": {"uncommon": 40, "rare": 35, "epic": 22, "godly": 3}},
}

#: Loot boxes that can award another item, keyed by the box's item_id.
_LOOT_BOXES = {i for i, r in CATALOG.items() if r["category"] == "loot_box"}

#: Packs award a fixed, server-side bundle rather than a random roll.
PACK_CONTENTS: dict[str, tuple[tuple[str, int], ...]] = {
    "starter_student_pack": (("study_cookie", 2), ("mura_sticker", 1), ("scrap_paper", 1),
                             ("broken_pencil", 1), ("mura_box", 1)),
    "study_pack": (("study_drink", 2), ("notebook_cover", 1), ("study_box", 1),
                   ("campus_highlighter", 1), ("energy_soda", 2)),
    "campus_worker_pack": (("campus_hoodie", 1), ("coffee_sleeve", 2), ("outdated_handout", 1),
                           ("campus_mystery_box", 1), ("fortune_coffee", 1)),
    "lucky_student_pack": (("lucky_keychain", 1), ("study_boost", 2), ("lucky_drink", 2),
                           ("weekend_box", 1), ("mura_founder_pin", 1)),
    "explorer_pack": (("explorer_backpack", 1), ("treasure_map", 1), ("desk_lamp", 1),
                      ("campus_mystery_box", 1), ("gold_mystery_box", 1)),
    "mura_relic_bundle": (("mura_founder_pin", 1), ("murastream_trophy", 1), ("midnight_keepsake", 1)),
    "founder_pack": (("founder_badge", 1), ("founder_letter", 1), ("mura_hoodie", 1),
                     ("gold_mystery_box", 1)),
}


#: Which activities can award an item at all. The *probability* of a drop
#: lives in `rewards.DEFAULT_DROP_CHANCES` — chances are economic values and
#: have exactly one owner, so the bot and the dashboard can never disagree.
#: This set only records that a source is wired up at all.
REWARD_SOURCES: tuple[str, ...] = (
    "fish", "farm", "work", "activity", "beg", "crime", "rob",
    "quest", "dig", "daily", "weekly", "monthly", "market",
)


def source_pool(source: str) -> list[dict]:
    """Every active item an activity can award, per its catalog drop_sources.

    This reads the item definitions themselves; it does not carry its own
    chances. `rewards.roll_item_reward` is what actually grants items.
    """
    key = (source or "").strip().lower()
    if not key:
        return []
    return [r for r in CATALOG.values() if r["active"] and key in r["drop_sources"]]


def _weighted_band(rng, bands: dict[str, int]) -> str | None:
    usable = {b: w for b, w in bands.items() if w > 0 and items_by_rarity(b)}
    if not usable:
        return None
    names = list(usable)
    weights = [usable[n] for n in names]
    return rng.choices(names, weights=weights, k=1)[0]


def roll_loot(item_id: str, rng=None) -> dict | None:
    """Roll a loot box or pack. Server-side only — never takes a probability
    from a caller. Returns `{item_id, rarity, source}` or None."""
    import random
    rng = rng or random
    row = get_item(item_id)
    if not row:
        return None

    if row["category"] == "pack":
        contents = PACK_CONTENTS.get(item_id)
        if not contents:
            return None
        choices = [c for c in contents if c[1] > 0 and get_item(c[0])]
        if not choices:
            return None
        return {"item_id": rng.choice(choices)[0], "rarity": None, "source": item_id}

    table = LOOT_TABLES.get(item_id)
    if not table:
        return None
    band = _weighted_band(rng, table["bands"])
    if band is None:
        return None
    pool = [r for r in items_by_rarity(band)
            if r["category"] not in ("loot_box", "pack") or r["item_id"] in ("mystery_box",)]
    if not pool:
        pool = items_by_rarity(band)
    if not pool:
        return None
    return {"item_id": rng.choice(pool)["item_id"], "rarity": band, "source": item_id}


async def open_container(db, guild_id, user_id, item_id: str, rng=None) -> tuple[bool, object]:
    """Consume one container server-side and grant its contents.

    `economy.remove_item` is a guarded atomic decrement, so a double click, a
    Discord retry or two tabs open at once can never double-open the same box.
    Returns `(ok, granted)` where granted is a list of `(item_id, qty)`.
    """
    import economy as eco
    row = get_item(item_id)
    if not row or row["category"] not in ("loot_box", "pack"):
        return False, "That isn't a container."

    # Packs are a fixed bundle; boxes roll a band first. Compute the grant
    # list *before* consuming, so a misconfigured table can never eat the box.
    if item_id in PACK_CONTENTS:
        bundle = [(pid, qty) for pid, qty in PACK_CONTENTS[item_id]
                  if qty > 0 and get_item(pid)]
        if not bundle:
            return False, "That pack has nothing configured inside it."
    else:
        prize = roll_loot(item_id, rng)
        if not prize:
            return False, "That container has nothing configured inside it."
        bundle = [(prize["item_id"], 1)]

    if not await eco.remove_item(db, guild_id, user_id, item_id, 1):
        return False, "You don't have one of those."

    for pid, qty in bundle:
        await eco.add_item(db, guild_id, user_id, pid, qty)
    return True, bundle


# ── Legacy compatibility for economy.ITEMS ───────────────────────────
# Older call sites read the flat shape `{"name","price","sell","rarity",
# "kind","usable","desc","locked"}`. Projecting the catalog onto that shape
# keeps every existing consumer working while there is still exactly one
# place items are defined.
def legacy_view(row: dict) -> dict:
    return {
        "name": row["name"],
        "price": row["buy_price"],
        "sell": row["sell_price"],
        "rarity": row["rarity"],
        "kind": row["category"],
        "category": row["category"],
        "usable": row["usable"],
        "desc": row["description"],
        "tradeable": row["tradeable"],
        "effect_type": row["effect_type"],
        "effect_value": row["effect_value"],
        "effect_duration": row["effect_duration"],
        "locked": (not row["buy_price"] or not row["sell_price"]) and not row["sellable"],
    }


def legacy_items() -> dict[str, dict]:
    return {i: legacy_view(r) for i, r in CATALOG.items()}
