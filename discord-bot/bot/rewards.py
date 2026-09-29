"""Centralized item-reward service.

Every command that can award an item calls `roll_item_reward`. No command
hardcodes a drop chance, a pool, an item id or a quantity — that is exactly
how item economies drift out of balance and how forged rewards get in.

Security model (see the anti-exploit requirements):

    command -> validate cooldown -> compute currency/XP -> roll reward
            -> resolve item from the catalog -> atomically add to inventory
            -> write an immutable transaction -> return the result

A client can only ever send a *source name* (or nothing at all). It cannot
choose the item, the rarity, the quantity, the chance or the value: those are
read from the catalog and the per-guild economy config, server-side.

Pools are DERIVED from the catalog rather than hand-listed, so an item can
never be a "reward" without existing in `items.py` first, and adding an item
to the catalog automatically makes it reward-eligible.
"""

from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any

import items as itemdb

log = logging.getLogger("bot.rewards")

#: Categories that can never be a random command reward. Containers are
#: bought or earned deliberately; handing one out at random removes the only
#: reason to buy it, and packs are pure value multipliers.
_EXCLUDED_CATEGORIES = frozenset({"loot_box", "pack"})

#: Categories that are always eligible regardless of the source, so a source
#: with a thin configured pool still has something to award.
_GENERAL_CATEGORIES = frozenset({"consumable", "trinket", "collectible", "sellable"})

#: Default per-source drop chances. These are ECONOMIC values: overridable
#: per guild through the economy config, and only the Bot Owner may change
#: them through the dashboard. Commands read them, they never define them.
DEFAULT_DROP_CHANCES: dict[str, dict[str, float]] = {
    "daily":    {"common": 0.15, "uncommon": 0.03},
    "weekly":   {"common": 0.30, "uncommon": 0.10},
    "monthly":  {"common": 0.50, "uncommon": 0.25, "rare": 0.02},
    "work":     {"common": 0.08, "uncommon": 0.02},
    "activity": {"common": 0.10, "uncommon": 0.02},
    "beg":      {"common": 0.03, "uncommon": 0.005},
    "crime":    {"common": 0.08, "uncommon": 0.02},
    "rob":      {"common": 0.10, "uncommon": 0.03},
    "quest":    {"common": 0.35, "uncommon": 0.15},
    "fish":     {"common": 0.12, "uncommon": 0.04},
    "farm":     {"common": 0.15, "uncommon": 0.05},
    "dig":      {"common": 0.22, "uncommon": 0.08, "rare": 0.01},
    "market":   {"common": 0.0, "uncommon": 0.0},
}

#: How many copies of one item a single reward may grant.
MAX_REWARD_QTY = 5

#: Rarities that may appear as a *random* command reward. Rare/Epic/Godly are
#: deliberately excluded: they are meant to come from achievements, events and
#: high-tier containers, so ordinary play never hands them out. A source that
#: explicitly opts in (see `allow_rare_sources`) may reach Rare.
RANDOM_RARITIES: tuple[str, ...] = ("common", "uncommon")

#: Sources permitted to roll a Rare item by chance.
allow_rare_sources: frozenset[str] = frozenset({"monthly", "dig"})


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Pools ──────────────────────────────────────────────────────────────
def _eligible(rarity: str, source: str | None) -> list[dict]:
    """Items of `rarity` that this `source` may award.

    An item is eligible when it is active, not a container, and either
    explicitly lists the source in its catalog `drop_sources`, or is a
    general-purpose item that any activity can turn up.
    """
    src = (source or "").strip().lower()
    out = []
    for row in itemdb.CATALOG.values():
        if not row["active"] or row["rarity"] != rarity:
            continue
        if row["category"] in _EXCLUDED_CATEGORIES:
            continue
        if src and src in row["drop_sources"]:
            out.append(row)
        elif src and row["category"] in _GENERAL_CATEGORIES:
            out.append(row)
        elif not src:
            out.append(row)
    return out


def common_pool(source: str | None = None) -> list[dict]:
    return _eligible("common", source)


def uncommon_pool(source: str | None = None) -> list[dict]:
    return _eligible("uncommon", source)


def rare_pool(source: str | None = None) -> list[dict]:
    return _eligible("rare", source)


def pool_for(rarity: str, source: str | None = None) -> list[dict]:
    rar = itemdb.normalize_rarity(rarity, "common")
    return _eligible(rar, source)


def all_pools(source: str | None = None) -> dict[str, list[dict]]:
    return {r: pool_for(r, source) for r in itemdb.RARITIES}


# ── Chance configuration ───────────────────────────────────────────────
def chances_for(cfg: dict | None, source: str) -> dict[str, float]:
    """Per-source drop chances, guild overrides merged over the defaults."""
    out = {r: 0.0 for r in itemdb.RARITIES}
    for rarity, value in DEFAULT_DROP_CHANCES.get(source, {}).items():
        out[itemdb.normalize_rarity(rarity)] = max(0.0, _as_float(value))
    overrides = (cfg or {}).get("itemDropChances") or {}
    src_cfg = overrides.get(source) if isinstance(overrides, dict) else None
    if isinstance(src_cfg, dict):
        for rarity, value in src_cfg.items():
            # Overrides are a config WRITE, not legacy stored data, so a
            # legacy alias is rejected rather than silently retargeted. Typing
            # "legendary" here must not quietly set the Godly rate.
            key = (rarity or "").strip().lower() if isinstance(rarity, str) else ""
            if key in itemdb.RARITIES:
                out[key] = max(0.0, min(1.0, _as_float(value)))
    return out


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if isinstance(value, bool):
            return default
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number or number in (float("inf"), float("-inf")):
        return default
    return number


# ── Reservations ───────────────────────────────────────────────────────
async def reserved_item_ids(db, guild_id: int, user_id: int) -> set[tuple[str, int]]:
    """(item_id, qty) currently locked in a live market offer.

    A reserved item must not be sellable, usable or tradeable — otherwise a
    player could take it out of circulation while it is listed. This is read
    through a defensive try/except so a missing collection degrades to "no
    reservations" rather than blocking every reward.
    """
    try:
        cur = db.economy_market.find(
            {"guildId": int(guild_id), "seller": int(user_id), "state": "open"},
            {"items": 1, "itemCount": 1})
        rows = await cur.to_list(50)
    except Exception:
        log.warning("market reservation lookup failed", exc_info=True)
        return set()
    locked: set[tuple[str, int]] = set()
    for doc in rows or []:
        for item_id, qty in (doc.get("items") or {}).items():
            if itemdb.get_item(item_id) is None:
                continue
            locked.add((item_id, max(1, _int(qty, 1))))
    return locked


def _int(value: Any, default: int = 0) -> int:
    try:
        if isinstance(value, bool):
            return default
        number = float(value)
        if number != number or number in (float("inf"), float("-inf")):
            return default
        return int(number)
    except (TypeError, ValueError, OverflowError):
        return default


# ── Idempotency ────────────────────────────────────────────────────────
async def _already_granted(db, guild_id: int, user_id: int, key: str) -> bool:
    """True when this exact reward has already been written for this user.

    Commands guard their own cooldowns atomically, so a Discord retry should
    never reach the reward roll twice. This is the belt-and-braces check for
    the paths that do not (and it is keyed, so a different roll is unaffected).

    The key lives inside the transaction's `metadata`, which is where
    `record_txn` puts it — querying the top level would never match and would
    silently disable idempotency.
    """
    if not key:
        return False
    try:
        return bool(await db.economy_tx.find_one(
            {"guildId": int(guild_id), "userId": int(user_id),
             "type": "item_reward", "metadata.rewardKey": key}))
    except Exception:
        log.warning("reward idempotency lookup failed", exc_info=True)
        return False


# ── The service ────────────────────────────────────────────────────────
async def roll_item_reward(
    db,
    guild_id: int,
    user_id: int,
    source: str,
    cfg: dict | None = None,
    rng=None,
    idempotency_key: str | None = None,
    quantity: int = 1,
) -> dict | None:
    """Roll and grant one random item reward for `source`.

    Returns a summary dict for the caller's embed, or None when nothing
    dropped. Every value in the result comes from the server; the caller must
    not be able to influence any of it.
    """
    import economy as eco

    src = (source or "").strip().lower()
    if not src or src not in DEFAULT_DROP_CHANCES:
        return None
    if await _already_granted(db, guild_id, user_id, idempotency_key or ""):
        return None

    rng = rng or random
    chances = chances_for(cfg, src)
    if not any(v > 0 for v in chances.values()):
        return None

    # Roll the rarity band.
    bands = [r for r in itemdb.RARITIES
             if chances.get(r, 0) > 0 and r in _allowed_bands(src)]
    if not bands:
        return None
    picked = rng.choices(bands, weights=[chances[r] for r in bands], k=1)[0]

    pool = pool_for(picked, src)
    if not pool:
        return None

    # Skip anything the player has reserved on the market.
    reserved = await reserved_item_ids(db, guild_id, user_id)
    candidates = [r for r in pool if (r["item_id"], quantity) not in reserved] or pool
    row = rng.choice(candidates)

    qty = max(1, min(_int(quantity, 1), MAX_REWARD_QTY))
    if not await eco.add_item(db, guild_id, user_id, row["item_id"], qty):
        return None

    await _record(db, guild_id, user_id, row, qty, src, idempotency_key)
    return {
        "item_id": row["item_id"],
        "name": row["name"],
        "rarity": row["rarity"],
        "category": row["category"],
        "quantity": qty,
        "source": src,
    }


def _allowed_bands(source: str) -> tuple[str, ...]:
    """Rarities a random roll may reach for this source."""
    if source in allow_rare_sources:
        return RANDOM_RARITIES + ("rare",)
    return RANDOM_RARITIES


async def _record(db, guild_id, user_id, row, qty, source, key) -> None:
    """Write the immutable inventory transaction for a reward."""
    import economy as eco
    try:
        await eco.record_txn(
            db, guild_id, user_id, "item_reward", qty, f"command:{source}",
            row["item_id"],
            {"command": source, "rarity": row["rarity"], "rewardKey": key} if key else None)
    except Exception:
        log.warning("reward transaction log failed", exc_info=True)


async def grant_guaranteed(
    db,
    guild_id: int,
    user_id: int,
    item_id: str,
    quantity: int = 1,
    source: str = "guaranteed",
    idempotency_key: str | None = None,
) -> dict | None:
    """Grant a specific, deliberately-chosen item (quest/event rewards).

    The item id is resolved against the catalog, so a caller still cannot
    invent an item; it simply may name one that already exists. Used for
    "this quest awards a Lucky Pencil" style rewards, where a random roll
    would be wrong.
    """
    import economy as eco
    row = itemdb.get_item(item_id)
    if not row or not row["active"] or row["category"] in _EXCLUDED_CATEGORIES:
        return None
    if await _already_granted(db, guild_id, user_id, idempotency_key or ""):
        return None
    reserved = await reserved_item_ids(db, guild_id, user_id)
    qty = max(1, min(_int(quantity, 1), MAX_REWARD_QTY))
    if (row["item_id"], qty) in reserved:
        return None
    if not await eco.add_item(db, guild_id, user_id, row["item_id"], qty):
        return None
    await _record(db, guild_id, user_id, row, qty, source, idempotency_key)
    return {
        "item_id": row["item_id"],
        "name": row["name"],
        "rarity": row["rarity"],
        "category": row["category"],
        "quantity": qty,
        "source": source,
    }


async def reward_many(
    db, guild_id: int, user_id: int, entries, source: str,
    idempotency_key: str | None = None,
) -> list[dict]:
    """Grant a list of `(item_id, qty)` pairs, skipping ones that fail."""
    out = []
    for entry in entries or []:
        try:
            item_id, qty = entry
        except (TypeError, ValueError):
            continue
        got = await grant_guaranteed(
            db, guild_id, user_id, str(item_id), _int(qty, 1), source, idempotency_key)
        if got:
            out.append(got)
    return out


# ── Presentation ───────────────────────────────────────────────────────
def format_rewards(grants) -> str:
    """One line per item, ready to drop into an existing embed field.

    Kept here so every command renders rewards identically instead of each
    inventing its own format.
    """
    if not grants:
        return ""
    seen: dict[str, dict] = {}
    for g in grants:
        entry = seen.setdefault(g["item_id"], dict(g, quantity=0))
        entry["quantity"] += int(g.get("quantity", 1))
    lines = []
    for entry in sorted(seen.values(), key=lambda g: itemdb.RANK.get(g["rarity"], 0)):
        emoji = itemdb.CATEGORY_EMOJI.get(entry["category"], "🎁")
        lines.append(f"{emoji} **{entry['name']}** ×{entry['quantity']} "
                     f"— {itemdb.rarity_badge(entry['rarity'])}")
    return "\n".join(lines)


def reward_field(grants) -> tuple[str, str] | None:
    """(name, value) pair for an embed, or None when nothing dropped."""
    if not grants:
        return None
    return ("🎁 Item Rewards", format_rewards(grants))
