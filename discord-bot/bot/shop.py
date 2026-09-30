"""The Murashop: sections, rotation windows and limited stock.

The shop is the only place coins become items by choice rather than by luck, so
two things matter more here than anywhere else in the economy:

* **Access is a per-item property, never a per-rarity one.** Whether the shop
  sells something is `items.CATALOG[item]["shop_enabled"]` and nothing else.
  There is no rule anywhere in this module — or in `economy.buy_item` — that
  treats epic or godly differently. A rare item is not "unbuyable because it
  is rare"; it is either enabled with a price, or explicitly disabled by hand.
* **A purchase is all-or-nothing.** Stock is claimed with a guarded atomic
  update, so two members racing for the last copy cannot both win, and a
  member who cannot pay never consumes stock.

Rotation is bucket-based rather than timer-based: a section's window is
`floor(now / rotation_hours)`, so every guild rolls over at the same instant,
no cron is required, and a member arriving the moment after a rollover gets
fresh stock with no background job having to have run. Rotation selects which
items are *featured*; stock limits how many of each featured item the shop will
sell in that window. Unlimited items have no stock document at all.
"""

import logging
import time
from datetime import datetime, timedelta, timezone

import items as itemdb

log = logging.getLogger("bot.shop")

#: The four Murashop sections. `hours` is the rotation length; `stock` is
#: whether the section honours per-item limited stock at all.
SECTIONS: dict[str, dict] = {
    "coin": {"label": "🪙 Coin Shop", "hours": 4,
             "blurb": "Everyday campus supplies, food, buffs and equipment."},
    "fishing": {"label": "🎣 Fishing Shop", "hours": 4,
                "blurb": "Rods, hooks and fishing gear. Rotates every 4 hours."},
    "special": {"label": "✨ Special Shop", "hours": 6,
                "blurb": "Epic and Godly pieces, event exclusives and trophies."},
    "skin": {"label": "🎨 Skin Shop", "hours": 24,
             "blurb": "Cosmetic collectibles and trinkets. Rotates daily."},
}

DEFAULT_SECTION = "coin"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def time_left(section: str, now: datetime | None = None) -> str:
    """Human-readable time until the section's next rotation."""
    delta = window_ends_at(section, now) - (now or _now())
    seconds = max(0, int(delta.total_seconds()))
    hours, rem = divmod(seconds, 3600)
    minutes = rem // 60
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m" if minutes else "under a minute"


def rotation_window(section: str, now: datetime | None = None) -> int:
    """The current rotation bucket for a section.

    Bucket boundaries are wall-clock aligned, so every guild's shop rolls over
    together and the bucket can be recomputed from a timestamp alone — which is
    what makes stock survive a bot restart without any persisted state.
    """
    hours = SECTIONS[section]["hours"] if section in SECTIONS else 6
    moment = now or _now()
    return int(moment.timestamp() // (hours * 3600))


def window_ends_at(section: str, now: datetime | None = None) -> datetime:
    hours = SECTIONS[section]["hours"] if section in SECTIONS else 6
    window = rotation_window(section, now)
    return datetime.fromtimestamp((window + 1) * hours * 3600, tz=timezone.utc)


def section_for(row: dict) -> str:
    """Which section an item belongs to. Deterministic and total.

    Every catalog item lands in exactly one section, and epic/godly items are
    routed to the Special shop by rarity — as a *placement* decision, not an
    access one. They are sold there like anything else.

    Fishing is checked first so gear with a fishing effect stays in the
    Fishing shop even when it is epic, rather than being pulled into Special
    purely for being rare.
    """
    sources = row["drop_sources"]
    if "fish" in sources or "fishing_bonus" in sources or row["effect_type"] == "fishing_bonus":
        return "fishing"
    if row["rarity"] in ("epic", "godly"):
        return "special"
    if row["category"] in ("collectible", "trinket") and not row["effect_type"]:
        return "skin"
    return "coin"


def shop_items(section: str | None = None) -> list[dict]:
    """Every item the shop is allowed to sell, optionally within one section."""
    rows = [r for r in itemdb.CATALOG.values() if r["shop_enabled"] and r["active"]]
    if section:
        rows = [r for r in rows if section_for(r) == section]
    rows.sort(key=lambda r: (itemdb.RANK[r["rarity"]], r["buy_price"]))
    return rows


# ── limited stock ───────────────────────────────────────────────────────
# A stock document is only ever written for an item that HAS a limit.
# Unlimited items have no document, which keeps the collection small and makes
# "unlimited" the cheap default rather than a large counter per item.

async def _stock_doc(db, guild_id: int, row: dict) -> dict | None:
    """The live stock document for an item, seeded on first use this window."""
    limit = row.get("shop_stock")
    if limit is None:
        return None
    window = rotation_window(section_for(row))
    key = {"guildId": guild_id, "itemId": row["item_id"], "window": window}
    try:
        doc = await db.economy_shop_stock.find_one(key)
        if doc is not None:
            return doc
        return await db.economy_shop_stock.find_one_and_update(
            key, {"$setOnInsert": {**key, "remaining": int(limit),
                                   "section": section_for(row),
                                   "updatedAt": _now()}},
            upsert=True, return_document=True)
    except Exception:
        log.warning("shop stock lookup failed for %s", row.get("item_id"), exc_info=True)
        return None


async def stock_left(db, guild_id: int, item_id: str) -> int | None:
    """Remaining stock, or `None` when the item is unlimited.

    A failure to read stock returns `None` (unlimited) rather than 0, so a
    Mongo hiccup can never present the whole shop as sold out.
    """
    row = itemdb.get_item(item_id)
    if row is None or not row.get("shop_enabled"):
        return 0
    if row.get("shop_stock") is None:
        return None
    doc = await _stock_doc(db, guild_id, row)
    if doc is None:
        return None
    remaining = doc.get("remaining")
    try:
        return max(0, int(remaining))
    except (TypeError, ValueError):
        return 0


async def claim_stock(db, guild_id: int, item_id: str, qty: int) -> bool:
    """Atomically reserve `qty` from the current window's stock.

    The `$gte` guard inside the update is what makes this safe: if the last
    copy is claimed while this call is in flight, the update matches zero
    documents and returns None instead of driving stock negative.
    """
    row = itemdb.get_item(item_id)
    if row is None or not row.get("shop_enabled"):
        return False
    if row.get("shop_stock") is None:
        return True
    if qty < 1:
        return False
    doc = await _stock_doc(db, guild_id, row)
    if doc is None:
        return True
    try:
        res = await db.economy_shop_stock.update_one(
            {"guildId": guild_id, "itemId": item_id,
             "window": rotation_window(section_for(row)),
             "remaining": {"$gte": qty}},
            {"$inc": {"remaining": -qty}, "$set": {"updatedAt": _now()}})
        return bool(getattr(res, "modified_count", 0))
    except Exception:
        log.warning("shop stock claim failed for %s", item_id, exc_info=True)
        return False


async def restore_stock(db, guild_id: int, item_id: str, qty: int) -> None:
    """Give stock back when a purchase that claimed it then failed to settle."""
    row = itemdb.get_item(item_id)
    if row is None or row.get("shop_stock") is None or qty < 1:
        return
    try:
        await db.economy_shop_stock.update_one(
            {"guildId": guild_id, "itemId": item_id,
             "window": rotation_window(section_for(row))},
            {"$inc": {"remaining": qty}, "$set": {"updatedAt": _now()}})
    except Exception:
        log.warning("shop stock restore failed for %s", item_id, exc_info=True)


async def stock_map(db, guild_id: int, rows: list[dict]) -> dict[str, int | None]:
    """Stock for a page of shop rows, keyed by item id."""
    out: dict[str, int | None] = {}
    for row in rows:
        out[row["item_id"]] = await stock_left(db, guild_id, row["item_id"])
    return out
