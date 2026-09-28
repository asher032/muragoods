"""Murabot Economy engine — ONE canonical implementation for Discord slash
commands AND the dashboard bridge.

Conventions (shared with the pre-existing leveling.py coins system, which
this extends rather than replaces):
- economy docs use INT guild/user IDs (matching the existing `economy`
  collection rows written by /balance, /daily, /pay). Do NOT mix with the
  string-ID moderation collections.
- EVERY balance mutation goes through apply_delta() with a guarded atomic
  update (no read-then-write): concurrent transactions can never create
  negative balances or duplicate currency. Each mutation writes a unique
  transaction row (uuid) first-class for audit.
- Cooldowns are claimed atomically (guarded update on lastX timestamps),
  so double-clicks/double-submits cannot double-pay — the second write
  simply matches zero documents.
- Pure helpers (bet validation, safe calculator, pagination math, level
  curve) have NO database access so they are unit-testable hermetically.
"""

import ast
import logging
import operator
import random
import uuid
from datetime import datetime, timedelta, timezone

log = logging.getLogger("bot.economy")


def _now():
    return datetime.now(timezone.utc)


def _gid(guild_id) -> int:
    return int(guild_id)


def _uid(user_id) -> int:
    return int(user_id)


# ── Server configuration (guild_config.economy merged over defaults) ──
ECONOMY_DEFAULTS: dict = {
    "currencyName": "coins",
    "currencySymbol": "🪙",
    "startBalance": 100,
    "dailyAmount": 250,
    "weeklyAmount": 1500,
    "monthlyAmount": 6000,
    "workMin": 50,
    "workMax": 300,
    "begMin": 5,
    "begMax": 100,
    "workCooldownSec": 3600,
    "begCooldownSec": 300,
    "crimeCooldownSec": 1800,
    "activityCooldownSec": 600,
    "gambleMax": 10000,
    "gambleCooldownSec": 60,
    "robCooldownSec": 3600,
    "robMinTarget": 100,
    "multipliers": {},
    "disabledItems": [],
    "lotteryTicketPrice": 100,
    "lotteryMaxTickets": 10,
}


async def get_economy_config(db, guild_id: int) -> dict:
    """Per-guild economy tuning; dashboard writes the same document."""
    cfg = dict(ECONOMY_DEFAULTS)
    try:
        doc = await db.guild_config.find_one({"guildId": str(guild_id)})
        if doc and isinstance(doc.get("economy"), dict):
            for key, value in doc["economy"].items():
                if key in cfg:
                    cfg[key] = value
    except Exception:
        pass
    return cfg


# ── Wallets ───────────────────────────────────────────────────────────
_WALLET_DEFAULTS = {
    "balance": 0, "bank": 0, "gems": 0,
    "prestige": 0, "omega": 0,
    "streakDaily": 0, "streakWeekly": 0,
    "fishBuckets": 0,
}


async def get_wallet(db, guild_id: int, user_id: int) -> dict:
    """Fetch-or-create wallet. Never overwrites existing balances."""
    gid, uid = _gid(guild_id), _uid(user_id)
    start = ECONOMY_DEFAULTS["startBalance"]
    try:
        cfg = await get_economy_config(db, gid)
        start = int(cfg.get("startBalance", start))
    except Exception:
        pass
    doc = await db.economy.find_one_and_update(
        {"guildId": gid, "userId": uid},
        {"$setOnInsert": {**_WALLET_DEFAULTS, "balance": start}},
        upsert=True, return_document=True,
    )
    for key, default in _WALLET_DEFAULTS.items():
        doc.setdefault(key, default)
    return doc


def net_worth(wallet: dict) -> int:
    return int(wallet.get("balance", 0)) + int(wallet.get("bank", 0))


def economy_level(wallet: dict) -> int:
    return int((net_worth(wallet) / 1000) ** 0.5)


def prestige_multiplier(wallet: dict) -> float:
    mult = 1.0 + 0.1 * int(wallet.get("prestige", 0)) + 0.25 * int(wallet.get("omega", 0))
    return round(mult, 3)


async def record_txn(db, guild_id: int, user_id: int, kind: str, amount: int,
                     source: str = "discord", item_id: str | None = None,
                     metadata: dict | None = None) -> str:
    """Append an audited transaction row. Returns the unique transaction ID."""
    tx_id = uuid.uuid4().hex
    try:
        await db.economy_tx.insert_one({
            "txId": tx_id, "guildId": _gid(guild_id), "userId": _uid(user_id),
            "type": kind, "amount": int(amount),
            "itemId": item_id, "source": source,
            "metadata": metadata or {}, "createdAt": _now(),
        })
    except Exception as exc:
        log.warning("txn log failed: %s", type(exc).__name__)
    return tx_id


async def apply_delta(db, guild_id: int, user_id: int, field: str, amount: int,
                      kind: str, source: str = "discord",
                      metadata: dict | None = None) -> tuple[bool, dict]:
    """Atomically add `amount` (may be negative) to a wallet field.

    Negative results are refused by the guarded update itself — the write
    matches zero documents instead of creating a negative balance. Returns
    (applied, wallet-after-or-before).
    """
    gid, uid = _gid(guild_id), _uid(user_id)
    filt: dict = {"guildId": gid, "userId": uid}
    if amount < 0:
        filt[field] = {"$gte": -amount}
    try:
        from pymongo import ReturnDocument
        doc = await db.economy.find_one_and_update(
            filt, {"$inc": {field: amount}}, return_document=ReturnDocument.AFTER)
        if doc is None:
            before = await db.economy.find_one({"guildId": gid, "userId": uid}) or {}
            return False, before
        await record_txn(db, gid, uid, kind, amount, source, metadata=metadata)
        return True, doc
    except Exception as exc:
        log.warning("apply_delta failed: %s", type(exc).__name__)
        return False, {}


async def transfer(db, guild_id: int, from_id: int, to_id: int, amount: int,
                   source: str = "discord") -> tuple[bool, str]:
    """Guild-scoped pocket-to-pocket payment. Atomic debit, then credit."""
    if amount < 1:
        return False, "Amount must be positive."
    if _uid(from_id) == _uid(to_id):
        return False, "You can't pay yourself."
    ok, _ = await apply_delta(db, guild_id, from_id, "balance", -amount,
                              "transfer_out", source,
                              {"to": _uid(to_id)})
    if not ok:
        return False, "Insufficient funds."
    await apply_delta(db, guild_id, to_id, "balance", amount,
                      "transfer_in", source, {"from": _uid(from_id)})
    return True, "ok"


async def bank_move(db, guild_id: int, user_id: int, amount: int, direction: str) -> tuple[bool, str]:
    """deposit (pocket→bank) or withdraw (bank→pocket)."""
    if amount < 1:
        return False, "Amount must be positive."
    out_field, in_field = ("balance", "bank") if direction == "deposit" else ("bank", "balance")
    ok, _ = await apply_delta(db, guild_id, user_id, out_field, -amount,
                              f"bank_{direction}_out")
    if not ok:
        return False, "Insufficient funds."
    await apply_delta(db, guild_id, user_id, in_field, amount, f"bank_{direction}_in")
    return True, "ok"


async def claim_cooldown(db, guild_id: int, user_id: int, field: str,
                         cooldown_sec: int) -> tuple[bool, int]:
    """Atomically claim a time-gated reward slot. Returns (granted, seconds
    remaining if denied). Double submits: only the first write matches."""
    gid, uid = _gid(guild_id), _uid(user_id)
    now = _now()
    cutoff = now - timedelta(seconds=cooldown_sec)
    try:
        res = await db.economy.update_one(
            {"guildId": gid, "userId": uid,
             "$or": [{field: None}, {field: {"$lte": cutoff}}]},
            {"$set": {field: now}})
        if res.modified_count:
            return True, 0
        doc = await db.economy.find_one({"guildId": gid, "userId": uid}) or {}
        last = doc.get(field)
        if last is not None:
            if isinstance(last, datetime) and last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            remaining = int((last + timedelta(seconds=cooldown_sec) - now).total_seconds()) + 1
            return False, max(0, remaining)
        return False, cooldown_sec
    except Exception as exc:
        log.warning("claim_cooldown failed: %s", type(exc).__name__)
        return False, cooldown_sec


# ── Items / shop / inventory ──────────────────────────────────────────
ITEMS: dict[str, dict] = {
    "bread":      {"name": "Bread", "price": 25, "sell": 10, "rarity": "common", "kind": "food", "usable": True, "desc": "+50 coins when eaten"},
    "fishing_rod": {"name": "Fishing Rod", "price": 200, "sell": 80, "rarity": "common", "kind": "tool", "usable": False, "desc": "Unlocks better catches"},
    "lucky_charm": {"name": "Lucky Charm", "price": 500, "sell": 200, "rarity": "rare", "kind": "charm", "usable": False, "desc": "+10% activity rewards while held"},
    "mystery_box": {"name": "Mystery Box", "price": 500, "sell": 0, "rarity": "rare", "kind": "box", "usable": True, "desc": "Random reward inside"},
    "gem_shard":   {"name": "Gem Shard", "price": 0, "sell": 150, "rarity": "epic", "kind": "loot", "usable": False, "desc": "Crafts into gems"},
    "golden_hook": {"name": "Golden Hook", "price": 2500, "sell": 1000, "rarity": "epic", "kind": "tool", "usable": False, "desc": "Rare fish bite more often"},
    "adventure_ticket": {"name": "Adventure Ticket", "price": 300, "sell": 0, "rarity": "rare", "kind": "ticket", "usable": True, "desc": "Starts an adventure"},
    "farm_plot_deed": {"name": "Farm Plot Deed", "price": 400, "sell": 0, "rarity": "common", "kind": "deed", "usable": True, "desc": "+1 farm plot"},
    "speed_fertilizer": {"name": "Speed Fertilizer", "price": 150, "sell": 50, "rarity": "common", "kind": "boost", "usable": True, "desc": "Halves current crop timers"},
    "omega_key":   {"name": "Omega Key", "price": 0, "sell": 0, "rarity": "legendary", "kind": "key", "usable": False, "desc": "Proof of endgame trials", "locked": True},
}

RECIPES: dict[str, dict] = {
    "gem": {"needs": {"gem_shard": 3}, "cost": 200, "result": "gems+1",
            "desc": "3 Gem Shards + 200 coins → 1 gem"},
}

CROPS: dict[str, dict] = {
    "wheat":  {"name": "Wheat", "growSec": 3600, "reward": 60},
    "pumpkin": {"name": "Pumpkin", "growSec": 6 * 3600, "reward": 250},
    "moonberry": {"name": "Moonberry", "growSec": 24 * 3600, "reward": 900},
}

FISH: list[tuple[str, str, int]] = [
    ("Old Boot", "common", 10), ("Sunny", "common", 25), ("Bubbles", "common", 30),
    ("Reef King", "rare", 120), ("Abyssal Eel", "epic", 400), ("Golden Koi", "legendary", 1500),
]

PET_SPECIES: dict[str, dict] = {
    "slime": {"name": "Slime", "rarity": "common", "bonus": {"coins": 0.05}},
    "owl": {"name": "Owl", "rarity": "rare", "bonus": {"xp": 0.10}},
    "fox": {"name": "Fox", "rarity": "epic", "bonus": {"luck": 0.10, "coins": 0.05}},
    "dragon": {"name": "Dragon", "rarity": "legendary", "bonus": {"coins": 0.15, "xp": 0.15}},
}


async def get_inventory(db, guild_id: int, user_id: int) -> dict[str, int]:
    doc = await db.economy_inv.find_one(
        {"guildId": _gid(guild_id), "userId": _uid(user_id)}) or {}
    return dict(doc.get("items") or {})


async def add_item(db, guild_id: int, user_id: int, item_id: str, qty: int = 1) -> bool:
    if qty < 1 or item_id not in ITEMS:
        return False
    await db.economy_inv.update_one(
        {"guildId": _gid(guild_id), "userId": _uid(user_id)},
        {"$inc": {f"items.{item_id}": qty}}, upsert=True)
    await record_txn(db, guild_id, user_id, "item_add", qty, "discord", item_id)
    return True


async def remove_item(db, guild_id: int, user_id: int, item_id: str, qty: int = 1) -> bool:
    """Guarded removal: only succeeds while the stock covers qty (no dupes)."""
    if qty < 1:
        return False
    res = await db.economy_inv.update_one(
        {"guildId": _gid(guild_id), "userId": _uid(user_id), f"items.{item_id}": {"$gte": qty}},
        {"$inc": {f"items.{item_id}": -qty}})
    if not res.modified_count:
        return False
    await record_txn(db, guild_id, user_id, "item_remove", -qty, "discord", item_id)
    return True


async def buy_item(db, guild_id: int, user_id: int, item_id: str, qty: int = 1) -> tuple[bool, str]:
    item = ITEMS.get(item_id)
    if not item:
        return False, "Unknown item."
    if item.get("locked"):
        return False, "That item can't be bought."
    if qty < 1 or qty > 99:
        return False, "Quantity must be 1–99."
    try:
        cfg = await get_economy_config(db, guild_id)
        if item_id in (cfg.get("disabledItems") or []):
            return False, "That item is disabled on this server."
    except Exception:
        pass
    total = int(item["price"]) * qty
    ok, _ = await apply_delta(db, guild_id, user_id, "balance", -total, "shop_buy", "discord", item_id)
    if not ok:
        return False, "Insufficient funds."
    await add_item(db, guild_id, user_id, item_id, qty)
    return True, "ok"


async def sell_item(db, guild_id: int, user_id: int, item_id: str, qty: int = 1) -> tuple[bool, str]:
    item = ITEMS.get(item_id)
    if not item:
        return False, "Unknown item."
    if int(item.get("sell", 0)) <= 0:
        return False, "That item can't be sold."
    if qty < 1 or qty > 99:
        return False, "Quantity must be 1–99."
    if not await remove_item(db, guild_id, user_id, item_id, qty):
        return False, "You don't have that many."
    await apply_delta(db, guild_id, user_id, "balance", int(item["sell"]) * qty,
                      "shop_sell", "discord", item_id)
    return True, "ok"


# ── Rewards with pet/config multipliers (non-stacking: best bonus wins) ─
async def active_bonuses(db, guild_id: int, user_id: int) -> dict:
    """Max-only pet bonuses + prestige multiplier + configured multipliers."""
    mult = {"coins": 1.0, "xp": 1.0, "luck": 1.0}
    try:
        wallet = await get_wallet(db, guild_id, user_id)
        mult["coins"] *= prestige_multiplier(wallet)
        pets = await db.economy_pets.find(
            {"guildId": _gid(guild_id), "userId": _uid(user_id)}).to_list(10)
        best: dict[str, float] = {}
        for pet in pets or []:
            spec = PET_SPECIES.get(str(pet.get("species") or ""), {})
            for key, value in (spec.get("bonus") or {}).items():
                best[key] = max(best.get(key, 0.0), float(value))
        for key, value in best.items():
            if key in mult:
                mult[key] = round(mult[key] * (1.0 + value), 3)
        cfg = await get_economy_config(db, guild_id)
        for key, value in (cfg.get("multipliers") or {}).items():
            if key in mult:
                try:
                    mult[key] = round(mult[key] * float(value), 3)
                except (TypeError, ValueError):
                    pass
    except Exception:
        pass
    return mult


async def grant_coins(db, guild_id: int, user_id: int, base: int, kind: str,
                      source: str = "discord") -> tuple[int, dict]:
    """Apply configured + pet multipliers, credit, log. Returns (final, bonuses)."""
    bonuses = await active_bonuses(db, guild_id, user_id)
    final = max(0, int(base * bonuses.get("coins", 1.0)))
    ok, _ = await apply_delta(db, guild_id, user_id, "balance", final, kind, source)
    if not ok:  # wallet missing entirely — create then retry once
        await get_wallet(db, guild_id, user_id)
        ok, _ = await apply_delta(db, guild_id, user_id, "balance", final, kind, source)
    return (final if ok else 0), bonuses


# ── Minigames (pure outcome functions — hermetic unit tests) ───────────
def validate_bet(balance: int, bet: int, cfg: dict) -> tuple[bool, str]:
    try:
        minimum, maximum = 10, int(cfg.get("gambleMax", 10000))
    except Exception:
        minimum, maximum = 10, 10000
    if bet < minimum:
        return False, f"Minimum bet is {minimum}."
    if bet > maximum:
        return False, f"Maximum bet is {maximum}."
    if bet > balance:
        return False, "Insufficient funds."
    return True, "ok"


def play_slots(bet: int, rng=None) -> tuple[int, str]:
    rng = rng or random
    symbols = ["🍒", "🍋", "🔔", "⭐", "💎"]
    reels = [rng.choice(symbols) for _ in range(3)]
    label = " | ".join(reels)
    if reels[0] == reels[1] == reels[2]:
        mult = 10 if reels[0] == "💎" else 5
        return bet * mult, label
    if reels[0] == reels[1] or reels[1] == reels[2]:
        return bet, label
    return -bet, label


def play_cointoss(bet: int, guess: str, rng=None) -> tuple[int, str]:
    rng = rng or random
    guess = (guess or "").strip().lower()
    if guess not in ("heads", "tails", "h", "t"):
        raise ValueError("Pick heads or tails.")
    want_heads = guess in ("heads", "h")
    landed_heads = rng.random() < 0.5
    won = (want_heads == landed_heads)
    return (bet if won else -bet), ("heads" if landed_heads else "tails")


def play_highlow(bet: int, guess: str, rng=None) -> tuple[int, str]:
    rng = rng or random
    guess = (guess or "").strip().lower()
    if guess not in ("high", "low", "h", "l"):
        raise ValueError("Pick high or low.")
    roll = rng.randint(1, 100)
    won = (roll > 50) if guess in ("high", "h") else (roll < 50)
    if roll == 50:
        return 0, f"rolled {roll} — push, bet returned"
    return (bet if won else -bet), f"rolled {roll}"


def play_roulette(bet: int, pick: str, rng=None) -> tuple[int, str]:
    rng = rng or random
    pick = (pick or "").strip().lower()
    roll = rng.randint(0, 36)
    if pick.isdigit() and int(pick) == roll:
        return bet * 35, f"landed {roll} — straight up!"
    red = {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
    if pick in ("red", "r") and roll in red:
        return bet, f"landed {roll} red"
    if pick in ("black", "b", "bl") and roll != 0 and roll not in red:
        return bet, f"landed {roll} black"
    if pick in ("even", "e") and roll != 0 and roll % 2 == 0:
        return bet, f"landed {roll} even"
    if pick in ("odd", "o") and roll % 2 == 1:
        return bet, f"landed {roll} odd"
    if pick not in ("red", "r", "black", "b", "bl", "even", "e", "odd", "o") and not pick.isdigit():
        raise ValueError("Pick red/black/even/odd or a number 0–36.")
    return -bet, f"landed {roll}"


def play_blackjack_hand(rng=None) -> tuple[list[int], list[int], str]:
    """Simplified blackjack: returns (player, dealer, outcome). Pure logic."""
    rng = rng or random
    deck = [min(v, 10) for v in range(1, 14)] * 4
    rng.shuffle(deck)

    def value(hand):
        total, aces = sum(hand), hand.count(1)
        while total > 21 and aces:
            total -= 10
            aces -= 1
        return total

    player, dealer = [deck.pop(), deck.pop()], [deck.pop(), deck.pop()]
    while value(player) < 17:
        player.append(deck.pop())
    while value(dealer) < 17:
        dealer.append(deck.pop())
    pv, dv = value(player), value(dealer)
    if pv > 21:
        outcome = "bust"
    elif dv > 21 or pv > dv:
        outcome = "win"
    elif pv == dv:
        outcome = "push"
    else:
        outcome = "lose"
    return player, dealer, outcome


def play_snakeeyes(bet: int, rng=None) -> tuple[int, str]:
    rng = rng or random
    d1, d2 = rng.randint(1, 6), rng.randint(1, 6)
    if d1 == 1 and d2 == 1:
        return bet * 10, f"🐍 SNAKE EYES ({d1},{d2})"
    if d1 == d2:
        return bet * 2, f"doubles ({d1},{d2})"
    if d1 + d2 in (7, 11):
        return bet, f"({d1},{d2}) = {d1 + d2}"
    return -bet, f"({d1},{d2}) = {d1 + d2}"


def play_scratch(rng=None) -> tuple[int, str, list[str]]:
    rng = rng or random
    icons = ["🍒", "⭐", "💎", "🔔", "🍋", "7️⃣"]
    grid = [rng.choice(icons) for _ in range(9)]
    lines = [grid[0:3], grid[3:6], grid[6:9]]
    win = any(len(set(row)) == 1 for row in lines)
    win = win or grid[0] == grid[4] == grid[8] or grid[2] == grid[4] == grid[6]
    reward = rng.randint(20, 200) if win else 0
    rows = [" ".join(row) for row in lines]
    return reward, ("WIN" if win else "no match"), rows


# ── Safe calculator (AST whitelist — never eval) ───────────────────────
_SAFE_BINOPS = {ast.Add: operator.add, ast.Sub: operator.sub,
                ast.Mult: operator.mul, ast.Div: operator.truediv,
                ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod,
                ast.Pow: operator.pow}
_SAFE_UNARY = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_SAFE_FUNCS = {"abs": abs, "round": round, "min": min, "max": max, "sqrt": __import__("math").sqrt}


def safe_calculate(expression: str):
    """Evaluate simple math safely. Raises ValueError on anything else."""
    if not expression or len(expression) > 200:
        raise ValueError("Empty or too long.")

    def _eval(node):
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in _SAFE_BINOPS:
            return _SAFE_BINOPS[type(node.op)](_eval(node.left), _eval(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _SAFE_UNARY:
            return _SAFE_UNARY[type(node.op)](_eval(node.operand))
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) \
                and node.func.id in _SAFE_FUNCS and not node.keywords:
            return _SAFE_FUNCS[node.func.id](*[_eval(a) for a in node.args])
        raise ValueError("Unsupported expression.")

    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise ValueError(f"Invalid expression: {exc}") from exc
    try:
        result = _eval(tree)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Cannot evaluate: {type(exc).__name__}") from exc
    if isinstance(result, float) and (result != result or result in (float("inf"), float("-inf"))):
        raise ValueError("Non-finite result.")
    return round(result, 6) if isinstance(result, float) else result


# ── Leaderboards (indexed, paginated, never full-table in memory) ──────
async def top_wallets(db, guild_id: int, by: str = "net", limit: int = 10, skip: int = 0) -> list[dict]:
    """Top holders by net (balance+bank), balance, gems or level-ish prestige."""
    limit = max(1, min(limit, 25))
    pipeline: list[dict] = [{"$match": {"guildId": _gid(guild_id)}}]
    if by == "gems":
        pipeline.append({"$sort": {"gems": -1}})
    elif by == "balance":
        pipeline.append({"$sort": {"balance": -1}})
    else:
        pipeline.append({"$addFields": {"_net": {"$add": ["$balance", "$bank"]}}})
        pipeline.append({"$sort": {"_net": -1}})
    pipeline.append({"$skip": max(0, skip)})
    pipeline.append({"$limit": limit})
    return await db.economy.aggregate(pipeline).to_list(limit)


async def economy_overview(db, guild_id: int) -> dict:
    """Dashboard overview: users, circulation, DAU, top holders, recent txns."""
    gid = _gid(guild_id)
    day_ago = _now() - timedelta(hours=24)
    users = await db.economy.count_documents({"guildId": gid})
    circ = await db.economy.aggregate([
        {"$match": {"guildId": gid}},
        {"$group": {"_id": None, "pocket": {"$sum": "$balance"}, "bank": {"$sum": "$bank"}}},
    ]).to_list(1)
    dau = await db.economy_tx.distinct("userId", {"guildId": gid, "createdAt": {"$gte": day_ago}})
    txns = await db.economy_tx.count_documents({"guildId": gid})
    top = await top_wallets(db, gid, "net", 5)
    recent = await db.economy_tx.find({"guildId": gid}).sort("createdAt", -1).limit(10).to_list(10)
    pocket = (circ[0].get("pocket") if circ else 0) or 0
    bank = (circ[0].get("bank") if circ else 0) or 0
    return {
        "users": users,
        "circulation": {"pocket": pocket, "bank": bank, "total": pocket + bank},
        "dau": len(dau),
        "transactions": txns,
        "top": [{"userId": str(t.get("userId")), "balance": int(t.get("balance", 0)),
                 "bank": int(t.get("bank", 0))} for t in top],
        "recent": [{"type": t.get("type"), "amount": t.get("amount"),
                    "at": t.get("createdAt").isoformat() if hasattr(t.get("createdAt"), "isoformat") else str(t.get("createdAt"))}
                   for t in recent],
    }


# ── Quests / collections / achievements progress ──────────────────────
QUESTS: dict[str, dict] = {
    "earner":   {"name": "Earner", "desc": "Hold 5,000 net worth", "target": 5000,
                 "check": "net", "reward": 500},
    "grinder":  {"name": "Grinder", "desc": "Complete 25 rewarded activities", "target": 25,
                 "check": "activities", "reward": 750},
    "collector": {"name": "Collector", "desc": "Own 10 distinct items", "target": 10,
                  "check": "items", "reward": 750},
    "loyal":    {"name": "Loyal", "desc": "Reach a 7-day daily streak", "target": 7,
                 "check": "streak", "reward": 1000},
}

COLLECTIONS: dict[str, dict] = {
    "starter": {"name": "Starter Set", "needs": {"bread": 5, "fishing_rod": 1}, "reward": 300},
    "angler": {"name": "Angler Set", "needs": {"golden_hook": 1, "fishing_rod": 1}, "reward": 1500},
}

TITLES: dict[str, dict] = {
    "newcomer": {"name": "Newcomer", "how": "Everyone starts here"},
    "wealthy": {"name": "Wealthy", "how": "Reach 10,000 net worth"},
    "legend": {"name": "Legend", "how": "Prestige at least once"},
    "omega": {"name": "Ω Omega", "how": "Reach Omega tier"},
}


async def quest_progress(db, guild_id: int, user_id: int) -> dict:
    gid, uid = _gid(guild_id), _uid(user_id)
    wallet = await get_wallet(db, gid, uid)
    inv = await get_inventory(db, gid, uid)
    acts = await db.economy_tx.count_documents(
        {"guildId": gid, "userId": uid, "type": {"$in": ["daily", "weekly", "work", "beg", "activity"]}})
    return {
        "net": net_worth(wallet),
        "activities": acts,
        "items": sum(1 for qty in inv.values() if qty > 0),
        "streak": int(wallet.get("streakDaily", 0)),
    }


async def check_quests(db, guild_id: int, user_id: int) -> list[str]:
    """Award newly-completed quests + linked achievements. Returns quest IDs."""
    gid, uid = _gid(guild_id), _uid(user_id)
    progress = await quest_progress(db, gid, uid)
    doc = await db.economy_quests.find_one({"guildId": gid, "userId": uid}) or {}
    done = set(doc.get("done") or [])
    newly = []
    for qid, quest in QUESTS.items():
        if qid in done:
            continue
        if progress.get(quest["check"], 0) >= quest["target"]:
            done.add(qid)
            newly.append(qid)
            await apply_delta(db, gid, uid, "balance", int(quest["reward"]),
                              "quest_reward", "discord", {"quest": qid})
    if newly:
        await db.economy_quests.update_one(
            {"guildId": gid, "userId": uid}, {"$set": {"done": sorted(done)}}, upsert=True)
    return newly


async def check_collection(db, guild_id: int, user_id: int) -> list[str]:
    """Complete finished bundles (guarded claim: exactly-once)."""
    gid, uid = _gid(guild_id), _uid(user_id)
    doc = await db.economy_collect.find_one({"guildId": gid, "userId": uid}) or {}
    done = set(doc.get("done") or [])
    newly = []
    inv = await get_inventory(db, gid, uid)
    for cid, bundle in COLLECTIONS.items():
        if cid in done:
            continue
        if all(inv.get(item, 0) >= qty for item, qty in bundle["needs"].items()):
            res = await db.economy_collect.update_one(
                {"guildId": gid, "userId": uid, "done": {"$ne": cid}},
                {"$addToSet": {"done": cid}}, upsert=True)
            if res.modified_count or res.upserted_id is not None:
                # Re-verify ownership at claim time to avoid double-spend races
                # handing out rewards twice.
                fresh = await get_inventory(db, gid, uid)
                if all(fresh.get(item, 0) >= qty for item, qty in bundle["needs"].items()):
                    for item, qty in bundle["needs"].items():
                        await remove_item(db, gid, uid, item, qty)
                    await apply_delta(db, gid, uid, "balance", int(bundle["reward"]),
                                      "collection_reward", "discord", {"bundle": cid})
                    newly.append(cid)
    return newly


# ── Pets ──────────────────────────────────────────────────────────────
async def adopt_pet(db, guild_id: int, user_id: int, species: str, name: str) -> tuple[bool, str]:
    if species not in PET_SPECIES:
        return False, "Unknown species."
    gid, uid = _gid(guild_id), _uid(user_id)
    count = await db.economy_pets.count_documents({"guildId": gid, "userId": uid})
    if count >= 5:
        return False, "You already care for 5 pets."
    await db.economy_pets.insert_one({
        "guildId": gid, "userId": uid, "species": species,
        "name": str(name or PET_SPECIES[species]["name"])[:30],
        "level": 1, "xp": 0, "happiness": 100,
        "lastCare": _now(), "createdAt": _now(),
    })
    return True, "ok"


async def care_pet(db, guild_id: int, user_id: int) -> tuple[bool, str]:
    gid, uid = _gid(guild_id), _uid(user_id)
    pets = await db.economy_pets.find({"guildId": gid, "userId": uid}).to_list(10)
    if not pets:
        return False, "You have no pets yet."
    now = _now()
    for pet in pets:
        last = pet.get("lastCare") or now
        if isinstance(last, datetime) and last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        hours = max(0.0, (now - last).total_seconds() / 3600)
        happiness = max(0, min(100, int(pet.get("happiness", 100) - hours * 2 + 25)))
        xp_gain = 10 if happiness >= 50 else 2
        await db.economy_pets.update_one(
            {"_id": pet["_id"]},
            {"$set": {"happiness": happiness, "lastCare": now},
             "$inc": {"xp": xp_gain}})
    return True, "ok"


# ── Farm ──────────────────────────────────────────────────────────────
async def farm_state(db, guild_id: int, user_id: int) -> dict:
    gid, uid = _gid(guild_id), _uid(user_id)
    doc = await db.economy_farm.find_one({"guildId": gid, "userId": uid}) or {}
    plots = doc.get("plots") or []
    return {"plots": plots, "maxPlots": int(doc.get("maxPlots", 2)), "level": int(doc.get("level", 1))}


async def farm_plant(db, guild_id: int, user_id: int, crop_id: str) -> tuple[bool, str]:
    if crop_id not in CROPS:
        return False, "Unknown crop."
    gid, uid = _gid(guild_id), _uid(user_id)
    state = await farm_state(db, gid, uid)
    live = [p for p in state["plots"] if p.get("readyAt")]
    if len(live) >= state["maxPlots"]:
        return False, "No empty plots (buy deeds to expand)."
    ready_at = _now() + timedelta(seconds=CROPS[crop_id]["growSec"])
    await db.economy_farm.update_one(
        {"guildId": gid, "userId": uid},
        {"$push": {"plots": {"crop": crop_id, "readyAt": ready_at}},
         "$setOnInsert": {"maxPlots": 2, "level": 1}}, upsert=True)
    return True, "ok"


async def farm_harvest(db, guild_id: int, user_id: int) -> tuple[int, int]:
    """Harvest ripe crops. Returns (coins, count). DB timestamps only."""
    gid, uid = _gid(guild_id), _uid(user_id)
    state = await farm_state(db, gid, uid)
    now = _now()
    ripe, waiting = [], []
    for plot in state["plots"]:
        ready = plot.get("readyAt")
        if isinstance(ready, datetime):
            if ready.tzinfo is None:
                ready = ready.replace(tzinfo=timezone.utc)
            (ripe if ready <= now else waiting).append(plot)
        else:
            waiting.append(plot)
    if not ripe:
        return 0, 0
    total = sum(int(CROPS[p["crop"]]["reward"]) for p in ripe if p.get("crop") in CROPS)
    await db.economy_farm.update_one(
        {"guildId": gid, "userId": uid}, {"$set": {"plots": waiting}})
    if total:
        await apply_delta(db, gid, uid, "balance", total, "farm_harvest", "discord")
    return total, len(ripe)


# ── Fishing ───────────────────────────────────────────────────────────
async def fish_catch(db, guild_id: int, user_id: int, rng=None) -> tuple[str, str, int]:
    """Returns (fish_name, rarity, value). Equipment shifts rarity weights."""
    rng = rng or random
    gid, uid = _gid(guild_id), _uid(user_id)
    inv = await get_inventory(db, gid, uid)
    weights = [70, 20, 8, 2]
    if inv.get("golden_hook", 0) > 0:
        weights = [45, 30, 18, 7]
    elif inv.get("fishing_rod", 0) > 0:
        weights = [60, 25, 12, 3]
    table = [FISH[0], FISH[1], FISH[2], FISH[3], FISH[4], FISH[5]]
    pool = table[:4] + table[4:] if sum(weights) else table
    # Weighted pick across rarity bands.
    bands = [("common", 3), ("rare", 1), ("epic", 1), ("legendary", 1)]
    flat, band_weights = [], []
    for (band, count), weight in zip(bands, weights):
        for fish in [f for f in FISH if f[1] == band][:count]:
            flat.append(fish)
            band_weights.append(weight / max(1, len([f for f in FISH if f[1] == band][:count])))
    name, rarity, value = rng.choices(flat, weights=band_weights, k=1)[0]
    await db.economy_inv.update_one(
        {"guildId": gid, "userId": uid},
        {"$inc": {"fishBuckets": 1}}, upsert=True)
    await record_txn(db, gid, uid, "fish_catch", value, "discord", None, {"fish": name})
    return name, rarity, value


# ── Lottery (DB-driven draws survive restarts) ────────────────────────
async def lottery_state(db, guild_id: int) -> dict:
    gid = _gid(guild_id)
    doc = await db.economy_lottery.find_one(
        {"guildId": gid, "status": "open", "drawAt": {"$gt": _now()}})
    if doc:
        return {"open": True, "drawAt": doc["drawAt"],
                "pool": int(doc.get("pool", 0)),
                "tickets": sum((doc.get("tickets") or {}).values())}
    return {"open": False, "drawAt": None, "pool": 0, "tickets": 0}


async def lottery_buy(db, guild_id: int, user_id: int, count: int, ticket_price: int) -> tuple[bool, str]:
    if count < 1:
        return False, "Buy at least 1 ticket."
    gid, uid = _gid(guild_id), _uid(user_id)
    cfg_count = max(1, count)
    total = ticket_price * cfg_count
    ok, _ = await apply_delta(db, gid, uid, "balance", -total, "lottery_buy", "discord")
    if not ok:
        return False, "Insufficient funds."
    now = _now()
    # Lazily open a round; exactly one open round per guild (upsert guard).
    await db.economy_lottery.update_one(
        {"guildId": gid, "status": "open", "drawAt": {"$gt": now}},
        {"$setOnInsert": {"drawAt": now + timedelta(hours=24), "pool": 0, "tickets": {}}},
        upsert=True)
    await db.economy_lottery.update_one(
        {"guildId": gid, "status": "open", "drawAt": {"$gt": now}},
        {"$inc": {"pool": total, f"tickets.{uid}": cfg_count}})
    await maybe_draw_lottery(db, gid)
    return True, "ok"


async def maybe_draw_lottery(db, guild_id: int, rng=None) -> dict | None:
    """Draw any due round. Atomic status flip: exactly one winner ever."""
    rng = rng or random
    gid = _gid(guild_id)
    now = _now()
    res = await db.economy_lottery.find_one_and_update(
        {"guildId": gid, "status": "open", "drawAt": {"$lte": now}},
        {"$set": {"status": "drawing"}})
    if not res:
        return None
    tickets = res.get("tickets") or {}
    entries = [(user, n) for user, n in tickets.items() if n > 0]
    pool = int(res.get("pool", 0))
    if not entries or pool <= 0:
        await db.economy_lottery.update_one(
            {"_id": res["_id"]}, {"$set": {"status": "void"}})
        return {"winner": None, "pool": pool}
    bag = [user for user, n in entries for _ in range(min(n, 100))]
    winner = int(rng.choice(bag))
    await apply_delta(db, gid, winner, "balance", pool, "lottery_win", "system")
    await db.economy_lottery.update_one(
        {"_id": res["_id"]},
        {"$set": {"status": "done", "winner": winner, "completedAt": now}})
    return {"winner": winner, "pool": pool}


# ── Trades (state machine with lazy expiry) ───────────────────────────
TRADE_TTL_SEC = 300


async def trade_create(db, guild_id: int, a_id: int, b_id: int,
                       a_offer: dict, b_wants: dict | None = None) -> str:
    """Create a trade in Created state. Offers lock funds/items at accept."""
    trade_id = uuid.uuid4().hex[:12]
    await db.economy_trades.insert_one({
        "tradeId": trade_id, "guildId": _gid(guild_id),
        "a": _uid(a_id), "b": _uid(b_id),
        "aOffer": {"coins": max(0, int(a_offer.get("coins", 0))),
                   "items": dict(a_offer.get("items") or {})},
        "bOffer": {"coins": 0, "items": {}},
        "state": "created",
        "expiresAt": _now() + timedelta(seconds=TRADE_TTL_SEC),
        "createdAt": _now(),
    })
    return trade_id


async def trade_expire_sweep(db, guild_id: int) -> int:
    res = await db.economy_trades.update_many(
        {"guildId": _gid(guild_id), "state": {"$in": ["created", "offered", "accepted"]},
         "expiresAt": {"$lte": _now()}},
        {"$set": {"state": "expired"}})
    return res.modified_count


async def trade_accept(db, guild_id: int, trade_id: str, user_id: int,
                       b_offer: dict) -> tuple[bool, str]:
    """Counterparty accepts: lock BOTH sides' funds/items atomically."""
    await trade_expire_sweep(db, guild_id)
    doc = await db.economy_trades.find_one(
        {"guildId": _gid(guild_id), "tradeId": trade_id, "state": "created"})
    if not doc:
        return False, "Trade not found or expired."
    if _uid(user_id) != int(doc["b"]):
        return False, "Only the invited user can accept."
    a, b = int(doc["a"]), int(doc["b"])
    a_coins = int((doc.get("aOffer") or {}).get("coins", 0))
    b_coins = max(0, int((b_offer or {}).get("coins", 0)))
    b_items = dict((b_offer or {}).get("items") or {})
    # Lock A's offer: guarded debit, else abort (no partial state).
    if a_coins:
        ok, _ = await apply_delta(db, guild_id, a, "balance", -a_coins,
                                  "trade_lock", "discord", {"trade": trade_id})
        if not ok:
            return False, "Offerer can no longer cover their coins."
    for item, qty in (doc.get("aOffer") or {}).get("items", {}).items():
        if not await remove_item(db, guild_id, a, item, int(qty)):
            if a_coins:
                await apply_delta(db, guild_id, a, "balance", a_coins,
                                  "trade_unlock", "discord", {"trade": trade_id})
            return False, f"Offerer no longer has {qty}x {item}."
    if b_coins:
        ok, _ = await apply_delta(db, guild_id, b, "balance", -b_coins,
                                  "trade_lock", "discord", {"trade": trade_id})
        if not ok:
            await _trade_unlock_a(db, guild_id, doc)
            return False, "You can't cover your coin offer."
    for item, qty in b_items.items():
        if not await remove_item(db, guild_id, b, item, int(qty)):
            await _trade_unlock_a(db, guild_id, doc)
            if b_coins:
                await apply_delta(db, guild_id, b, "balance", b_coins,
                                  "trade_unlock", "discord", {"trade": trade_id})
            return False, f"You don't have {qty}x {item}."
    await db.economy_trades.update_one(
        {"_id": doc["_id"], "state": "created"},
        {"$set": {"state": "accepted",
                  "bOffer": {"coins": b_coins, "items": {k: int(v) for k, v in b_items.items()}},
                  "expiresAt": _now() + timedelta(seconds=TRADE_TTL_SEC)}})
    return True, "ok"


async def _trade_unlock_a(db, guild_id: int, doc: dict) -> None:
    a = int(doc["a"])
    a_coins = int((doc.get("aOffer") or {}).get("coins", 0))
    if a_coins:
        await apply_delta(db, guild_id, a, "balance", a_coins,
                          "trade_unlock", "discord", {"trade": doc.get("tradeId")})
    for item, qty in (doc.get("aOffer") or {}).get("items", {}).items():
        await add_item(db, guild_id, a, item, int(qty))


async def trade_confirm(db, guild_id: int, trade_id: str, user_id: int) -> tuple[bool, str]:
    """Both sides confirm → swap locked assets. Idempotent completion."""
    await trade_expire_sweep(db, guild_id)
    res = await db.economy_trades.find_one_and_update(
        {"guildId": _gid(guild_id), "tradeId": trade_id, "state": "accepted"},
        {"$set": {"state": "completed", "completedAt": _now()}})
    if not res:
        return False, "Trade not found, expired, or already completed."
    a, b = int(res["a"]), int(res["b"])
    a_offer, b_offer = res.get("aOffer") or {}, res.get("bOffer") or {}
    if int(a_offer.get("coins", 0)):
        await apply_delta(db, guild_id, b, "balance", int(a_offer["coins"]),
                          "trade_complete", "discord", {"trade": trade_id})
    if int(b_offer.get("coins", 0)):
        await apply_delta(db, guild_id, a, "balance", int(b_offer["coins"]),
                          "trade_complete", "discord", {"trade": trade_id})
    for item, qty in a_offer.get("items", {}).items():
        await add_item(db, guild_id, b, item, int(qty))
    for item, qty in b_offer.get("items", {}).items():
        await add_item(db, guild_id, a, item, int(qty))
    return True, "ok"


async def trade_cancel(db, guild_id: int, trade_id: str, user_id: int) -> tuple[bool, str]:
    await trade_expire_sweep(db, guild_id)
    doc = await db.economy_trades.find_one(
        {"guildId": _gid(guild_id), "tradeId": trade_id,
         "state": {"$in": ["created", "offered", "accepted"]}})
    if not doc:
        return False, "Trade not found or already settled."
    if _uid(user_id) not in (int(doc["a"]), int(doc["b"])):
        return False, "Not your trade."
    if doc["state"] == "accepted":
        await _trade_unlock_a(db, guild_id, doc)
        b, b_offer = int(doc["b"]), doc.get("bOffer") or {}
        if int(b_offer.get("coins", 0)):
            await apply_delta(db, guild_id, b, "balance", int(b_offer["coins"]),
                              "trade_unlock", "discord", {"trade": trade_id})
        for item, qty in b_offer.get("items", {}).items():
            await add_item(db, guild_id, b, item, int(qty))
    await db.economy_trades.update_one(
        {"_id": doc["_id"]}, {"$set": {"state": "cancelled"}})
    return True, "ok"


# ── Friends / marriage ────────────────────────────────────────────────
async def social_doc(db, guild_id: int, user_id: int) -> dict:
    doc = await db.economy_social.find_one(
        {"guildId": _gid(guild_id), "userId": _uid(user_id)}) or {}
    doc.setdefault("friends", [])
    doc.setdefault("requests", [])
    doc.setdefault("blocked", [])
    doc.setdefault("partner", None)
    return doc


async def friend_request(db, guild_id: int, from_id: int, to_id: int) -> tuple[bool, str]:
    if _uid(from_id) == _uid(to_id):
        return False, "That's yourself."
    target = await social_doc(db, guild_id, to_id)
    if _uid(from_id) in target.get("blocked", []):
        return False, "Request could not be sent."
    if _uid(from_id) in target.get("friends", []):
        return False, "Already friends."
    await db.economy_social.update_one(
        {"guildId": _gid(guild_id), "userId": _uid(to_id)},
        {"$addToSet": {"requests": _uid(from_id)}}, upsert=True)
    return True, "ok"


async def friend_answer(db, guild_id: int, user_id: int, other_id: int, accept: bool) -> tuple[bool, str]:
    gid, uid, oid = _gid(guild_id), _uid(user_id), _uid(other_id)
    res = await db.economy_social.update_one(
        {"guildId": gid, "userId": uid, "requests": oid},
        {"$pull": {"requests": oid}})
    if not res.modified_count:
        return False, "No pending request."
    if accept:
        await db.economy_social.update_one(
            {"guildId": gid, "userId": uid}, {"$addToSet": {"friends": oid}}, upsert=True)
        await db.economy_social.update_one(
            {"guildId": gid, "userId": oid}, {"$addToSet": {"friends": uid}}, upsert=True)
    return True, "ok"


async def marry(db, guild_id: int, a_id: int, b_id: int) -> tuple[bool, str]:
    if _uid(a_id) == _uid(b_id):
        return False, "That's yourself."
    gid = _gid(guild_id)
    a = await social_doc(db, gid, a_id)
    b = await social_doc(db, gid, b_id)
    if a.get("partner") or b.get("partner"):
        return False, "One of you is already partnered."
    for uid in (_uid(a_id), _uid(b_id)):
        partner = _uid(b_id) if uid == _uid(a_id) else _uid(a_id)
        await db.economy_social.update_one(
            {"guildId": gid, "userId": uid},
            {"$set": {"partner": partner}}, upsert=True)
    return True, "ok"


# ── Notifications / sessions ──────────────────────────────────────────
async def notify(db, guild_id: int, user_id: int, kind: str, text: str) -> None:
    try:
        await db.economy_notif.insert_one({
            "guildId": _gid(guild_id), "userId": _uid(user_id),
            "kind": kind[:30], "text": str(text)[:300], "at": _now(), "read": False,
        })
        await db.economy_notif.delete_many({
            "_id": {"$nin": [d["_id"] for d in await db.economy_notif.find(
                {"guildId": _gid(guild_id), "userId": _uid(user_id)})
                .sort("at", -1).limit(50).to_list(50)]}})
    except Exception:
        pass


async def session_start(db, guild_id: int, user_id: int) -> None:
    await db.economy_sessions.update_one(
        {"guildId": _gid(guild_id), "userId": _uid(user_id), "active": True},
        {"$setOnInsert": {"earned": 0, "spent": 0, "items": 0, "xp": 0,
                          "activities": 0, "startedAt": _now()}},
        upsert=True)


async def session_track(db, guild_id: int, user_id: int, **deltas) -> None:
    allowed = {k: int(v) for k, v in deltas.items()
               if k in ("earned", "spent", "items", "xp", "activities")}
    if allowed:
        await db.economy_sessions.update_one(
            {"guildId": _gid(guild_id), "userId": _uid(user_id), "active": True},
            {"$inc": allowed})


async def session_end(db, guild_id: int, user_id: int) -> dict | None:
    doc = await db.economy_sessions.find_one_and_update(
        {"guildId": _gid(guild_id), "userId": _uid(user_id), "active": True},
        {"$set": {"active": False, "endedAt": _now()}})
    return doc


# ── Prestige / omega ──────────────────────────────────────────────────
async def prestige_preview(db, guild_id: int, user_id: int) -> tuple[bool, str, dict]:
    wallet = await get_wallet(db, guild_id, user_id)
    level = economy_level(wallet)
    if level < 25:
        return False, "Reach level 25 first.", {}
    info = {"level": level, "resets": "pocket, bank, items, pets progress",
            "keeps": "achievements, badges, titles",
            "bonus": "+10% coin rewards forever (stacks)"}
    return True, "ok", info


async def prestige_apply(db, guild_id: int, user_id: int) -> tuple[bool, str]:
    ok, _, info = await prestige_preview(db, guild_id, user_id)
    if not ok:
        return False, info if isinstance(info, str) else "Not eligible."
    gid, uid = _gid(guild_id), _uid(user_id)
    await db.economy.update_one(
        {"guildId": gid, "userId": uid},
        {"$set": {"balance": 0, "bank": 0}, "$inc": {"prestige": 1},
         "$unset": {"streakDaily": "", "streakWeekly": ""}})
    await db.economy_inv.delete_one({"guildId": gid, "userId": uid})
    await record_txn(db, gid, uid, "prestige", 0, "discord")
    return True, "ok"


async def omega_apply(db, guild_id: int, user_id: int) -> tuple[bool, str]:
    wallet = await get_wallet(db, guild_id, user_id)
    if int(wallet.get("prestige", 0)) < 3 or economy_level(wallet) < 50:
        return False, "Requires prestige 3 and level 50."
    gid, uid = _gid(guild_id), _uid(user_id)
    await db.economy.update_one(
        {"guildId": gid, "userId": uid},
        {"$set": {"balance": 0, "bank": 0, "prestige": 0}, "$inc": {"omega": 1}})
    await db.economy_inv.delete_one({"guildId": gid, "userId": uid})
    await record_txn(db, gid, uid, "omega", 0, "discord")
    return True, "ok"
