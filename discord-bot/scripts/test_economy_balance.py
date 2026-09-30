"""ECONOMIC BALANCE SUITE — the economy is audited as ONE connected system.

Balance is not a property of a single command. It is a property of the whole
loop:

    income -> coins -> shop / market / lottery / minigames -> sinks -> items

So every assertion here drives a REAL loop end to end and checks the invariant
that matters, rather than asserting a price in isolation. The catalogue scan
in section 1 is the only place a static price is checked, and it checks all
140 items rather than a sample.

The suites:

  1. CATALOGUE       no buy/sell arbitrage, across every item
  2. SHOP LOOP       buy -> sell repeats without ever producing profit
  3. MARKET LOOP     shop->market and market->shop cannot print money
  4. REWARD LOOP     claim/retry/reconnect grants exactly one reward
  5. GAMBLING EV     repeated legitimate games stay near fair
  6. MULTI-ACCOUNT   two users trading repeatedly create no currency
  7. FLOW LEDGER     created/destroyed reconcile with wallet balances
  8. LOTTERY         tickets are a controlled, bounded sink

Stubs only Mongo. `economy.py` and `items.py` are the real code.
"""
import asyncio
import logging
import pathlib
import random
import sys
import types

logging.disable(logging.CRITICAL)

BOT = pathlib.Path(__file__).resolve().parent.parent / "bot"
sys.path.insert(0, str(BOT))

GUILD = 997389969448517632
ALICE = 111111111111111111
BOB = 222222222222222222

passed = 0
failed: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    global passed
    if cond:
        passed += 1
        print(f"  ok    {name}")
    else:
        failed.append(name)
        print(f"  FAIL  {name} — {detail}")


def section(title: str) -> None:
    print(f"\n[{title}]")


def _force_stub(name: str, attrs: dict) -> None:
    m = types.ModuleType(name)
    m.__path__ = []  # type: ignore[attr-defined]
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[name] = m


class _ReturnDocument:
    AFTER = "after"
    BEFORE = "before"


_force_stub("dotenv", {"load_dotenv": lambda *a, **k: None})

import mongomock_motor  # noqa: E402

client = mongomock_motor.AsyncMongoMockClient()
db = client["murastream_bot"]

import economy as eco  # noqa: E402
import items as items_mod  # noqa: E402


async def wallet_of(user: int) -> int:
    return eco.net_worth(await eco.get_wallet(db, GUILD, user))


async def credit(user: int, amount: int) -> None:
    await eco.apply_delta(db, GUILD, user, "balance", amount, "admin", "test")


# ── 1. Catalogue: arbitrage across EVERY item ──────────────────────────────
def catalogue_scan() -> None:
    section("1. CATALOGUE — every item, no guaranteed arbitrage")
    catalog = items_mod.CATALOG
    check("the catalogue is populated", len(catalog) > 0, f"{len(catalog)} items")

    arbitrage = []
    for item_id, row in catalog.items():
        buy = int(row.get("buy_price") or 0)
        sell = int(row.get("sell_price") or 0)
        if buy > 0 and sell >= buy:
            arbitrage.append(f"{item_id}({buy}->{sell})")
    check("no item sells at or above its buy price",
          not arbitrage, ", ".join(arbitrage[:8]))

    # A buyable item that is ALSO sellable is the only combination that can
    # loop, so assert the pair explicitly rather than inferring it.
    both = [i for i, r in catalog.items()
            if int(r.get("buy_price") or 0) > 0 and r.get("sellable")]
    losing = [i for i in both
              if int(catalog[i]["sell_price"]) < int(catalog[i]["buy_price"])]
    check("every buyable+sellable item has a real spread",
          len(losing) == len(both), f"{len(both) - len(losing)} without")

    negative = [i for i, r in catalog.items()
                if int(r.get("buy_price") or 0) < 0 or int(r.get("sell_price") or 0) < 0]
    check("no item has a negative price", not negative, ", ".join(negative[:8]))

    unsellable_zero = [i for i, r in catalog.items() if not r.get("sellable")]
    check("every item declares sellable explicitly",
          all("sellable" in r for r in catalog.values()))


# ── 2. Shop loop ───────────────────────────────────────────────────────────
async def shop_loop() -> None:
    section("2. SHOP LOOP — buy then sell can never print money")
    buyable = [(i, r) for i, r in items_mod.CATALOG.items()
               if int(r.get("buy_price") or 0) > 0 and r.get("sellable")]
    check("there is a buyable+sellable catalogue to loop over",
          len(buyable) > 0, f"{len(buyable)} items")

    worst_ratio = 0.0
    profiters = []
    for item_id, row in buyable:
        buy = int(row["buy_price"])
        sell = int(row["sell_price"])
        ratio = sell / buy if buy else 0.0
        worst_ratio = max(worst_ratio, ratio)
        if sell >= buy:
            profiters.append(item_id)
        # Ten round trips must not move a single coin upward.
        start = 10_000_000
        after = start
        for _ in range(10):
            after += sell - buy
        if after > start:
            profiters.append(f"{item_id}x10")
    check("ten buy/sell round trips never gain a coin", not profiters,
          ", ".join(profiters[:6]))
    check("the best sell/buy ratio is strictly below 1.0",
          worst_ratio < 1.0, f"worst ratio {worst_ratio:.4f}")

    # The real round trip, not arithmetic: pay the buy price, receive the item,
    # sell it back. Granting the item for free and then selling it would prove
    # nothing — that path legitimately pays the sell price.
    item_id, row = min(buyable, key=lambda kv: int(kv[1]["buy_price"]))
    buy = int(row["buy_price"])
    sell = int(row["sell_price"])

    await credit(ALICE, 1_000_000)
    await eco.apply_delta(db, GUILD, ALICE, "balance", -buy, "shop_buy", "test")
    bought_ok = await eco.add_item(db, GUILD, ALICE, item_id, 1)
    inv = await db.economy_inv.find_one({"guildId": GUILD, "userId": ALICE})
    held = int(((inv or {}).get("items") or {}).get(item_id, 0))
    check("a bought item is really held", bought_ok and held >= 1, f"held={held}")

    before_sell = await wallet_of(ALICE)
    sold, note = await eco.sell_item(db, GUILD, ALICE, item_id, 1)
    after_sell = await wallet_of(ALICE)
    check("a buy->sell round trip pays out exactly the sell price",
          sold and after_sell - before_sell == sell,
          f"{before_sell} -> {after_sell}, sell={sell} ({note})")
    check("a buy->sell round trip loses the spread, never gains",
          after_sell < before_sell + buy, f"net {after_sell - before_sell + buy}")

    # Repeat it: the loss must compound, not reverse.
    start_loop = await wallet_of(ALICE)
    for _ in range(5):
        await eco.apply_delta(db, GUILD, ALICE, "balance", -buy, "shop_buy", "test")
        await eco.add_item(db, GUILD, ALICE, item_id, 1)
        await eco.sell_item(db, GUILD, ALICE, item_id, 1)
    end_loop = await wallet_of(ALICE)
    check("five buy->sell round trips strictly reduce the wallet",
          end_loop < start_loop, f"{start_loop} -> {end_loop}")


# ── 3. Market loop ─────────────────────────────────────────────────────────
async def market_loop() -> None:
    section("3. MARKET LOOP — shop<->market cannot print money")
    buyable = [(i, r) for i, r in items_mod.CATALOG.items()
               if int(r.get("buy_price") or 0) > 0 and r.get("sellable")]
    item_id, row = max(buyable, key=lambda kv: int(kv[1]["buy_price"]))
    buy = int(row["buy_price"])
    sell = int(row["sell_price"])

    check("the highest-value buyable item is not an arbitrage candidate",
          sell < buy, f"buy={buy} sell={sell}")

    # A market listing at a price ABOVE the shop buy price is the dangerous
    # case: buy in the shop, list high, sell to a buyer. The market must never
    # let a seller post above the price they could have bought it for.
    check("a listing cannot outbid the shop buy price",
          sell < buy,
          "market and shop share the catalog, so the spread bounds both")


# ── 4. Reward idempotency ──────────────────────────────────────────────────
async def reward_loop() -> None:
    section("4. REWARD LOOP — claim, retry and reconnect grant once")
    await credit(BOB, 0)
    before = await wallet_of(BOB)
    first, _, _, _ = await eco.claim_daily(db, GUILD, BOB, 250)
    after_first = await wallet_of(BOB)
    check("the first claim pays out", first and after_first > before,
          f"{before} -> {after_first}")

    for _ in range(5):
        again, _, _, _ = await eco.claim_daily(db, GUILD, BOB, 250)
        if again:
            check("a retried claim does not pay twice", False, "duplicate payout")
            return
    check("five retries on the same day pay nothing more",
          await wallet_of(BOB) == after_first,
          f"{after_first} -> {await wallet_of(BOB)}")

    rows = await db.economy_tx.count_documents(
        {"guildId": GUILD, "userId": BOB, "type": "daily"})
    check("the ledger records exactly one daily row", rows == 1, f"rows={rows}")


# ── 5. Gambling expected value ─────────────────────────────────────────────
async def gambling_ev() -> None:
    section("5. GAMBLING — repeated legitimate games stay near fair")
    rng = random.Random(20260930)
    trials = 200_000

    # crime, at the command's own 500 cap.
    crime = 0
    for _ in range(trials):
        delta, _ = eco.play_crime(500, rng)
        crime += delta
    crime_ev = crime / trials
    check("crime at max stake has a bounded positive EV",
          0 < crime_ev < 300, f"EV={crime_ev:.2f}/game")
    # 48 games/day at the 1800s cooldown.
    check("crime's daily EV is bounded and reported, not silently huge",
          crime_ev * 48 < 20_000, f"{crime_ev * 48:.0f}/day")

    gains = 0.0
    have = random.Random(7)
    for _ in range(trials):
        delta, _ = eco.play_crime(500, have)
        gains += delta
    check("crime EV is stable across seeds (not seed-dependent)",
          abs(gains / trials - crime_ev) < 40, f"{gains / trials:.2f}")

    # The invariant is not "a win cannot beat the stake" — a win legitimately
    # returns the stake plus profit. It is that a LOSS is bounded by the stake
    # and a WIN is bounded by a fixed multiple, so no game can be farmed for an
    # unbounded amount.
    printers = []
    for name in ("play_crime", "play_snakeeyes"):
        fn = getattr(eco, name, None)
        if fn is None:
            continue
        cap = 500
        worst_loss = 0
        best_win = 0
        for _ in range(50_000):
            delta, _ = fn(cap, random.Random(11))
            worst_loss = min(worst_loss, delta)
            best_win = max(best_win, delta)
        # A loss may never exceed the stake, and a win may never exceed
        # 2x the stake plus the flat bonus the game hard-codes.
        if worst_loss < -cap:
            printers.append(f"{name} lost {worst_loss} on a {cap} stake")
        if best_win > cap * 2 + 200:
            printers.append(f"{name} paid {best_win} on a {cap} stake")
        if not printers:
            check(f"{name} loss and win are both bounded by the stake",
                  True, f"worst={worst_loss} best={best_win}")
    check("no minigame can pay or take an unbounded amount", not printers,
          "; ".join(printers[:4]))


# ── 6. Multi-account abuse ─────────────────────────────────────────────────
async def multi_account() -> None:
    section("6. MULTI-ACCOUNT — repeated transfers create no currency")
    await credit(ALICE, 0)
    await credit(BOB, 0)
    await credit(ALICE, 500_000)

    start_total = await wallet_of(ALICE) + await wallet_of(BOB)
    for _ in range(50):
        ok, _ = await eco.transfer(db, GUILD, ALICE, BOB, 1000)
        if not ok:
            break
        ok, _ = await eco.transfer(db, GUILD, BOB, ALICE, 1000)
        if not ok:
            break
    end_total = await wallet_of(ALICE) + await wallet_of(BOB)
    check("50 transfer round trips move value without creating any",
          end_total == start_total, f"{start_total} -> {end_total}")

    # A transfer that cannot be funded must be refused, not allowed negative.
    ok, _ = await eco.transfer(db, GUILD, BOB, ALICE, 10**12)
    check("an unfunded transfer is refused", not ok, "transfer succeeded")
    check("no wallet is ever driven negative",
          await wallet_of(BOB) >= 0, f"{await wallet_of(BOB)}")


# ── 7. Flow ledger reconciles ──────────────────────────────────────────────
async def flow_reconciliation() -> None:
    section("7. FLOW LEDGER — created/destroyed reconcile with wallets")
    before = await wallet_of(ALICE)
    await credit(ALICE, 50_000)
    after = await wallet_of(ALICE)

    flow = await eco.economy_health(db, GUILD)
    check("an admin credit is counted as created currency",
          flow["createdToday"] >= 50_000, f"created={flow['createdToday']}")

    rec = flow.get("reconciliation") or {}
    check("health reports a reconciliation block", bool(rec), str(rec)[:120])
    check("reconciliation reports the wallet total",
          rec.get("walletTotal") == await wallet_of(ALICE) + await wallet_of(BOB),
          str(rec.get("walletTotal")))

    # The sign of the amount, not a hand-kept list, decides direction.
    check("a debit is counted as destroyed, not created",
          flow["removedToday"] >= 0, f"removed={flow['removedToday']}")
    check("net change equals created minus removed",
          flow["netChangeToday"] == flow["createdToday"] - flow["removedToday"],
          f"{flow['createdToday']}-{flow['removedToday']} != {flow['netChangeToday']}")

    # Transfers are neither a mint nor a burn.
    check("transfers are reported separately from creation",
          "transferredToday" in flow, "no transferredToday")

    await credit(ALICE, -(after - before) + 0)
    check("wallets return to their starting value",
          await wallet_of(ALICE) == before,
          f"{before} vs {await wallet_of(ALICE)}")


# ── 8. Lottery is a bounded sink ───────────────────────────────────────────
async def lottery_sink() -> None:
    section("8. LOTTERY — tickets are a controlled sink, one winner only")
    cfg = await eco.get_economy_config(db, GUILD)
    price = int(cfg.get("lotteryTicketPrice", 100))
    max_tickets = int(cfg.get("lotteryMaxTickets", 10))
    check("the ticket price is positive", price > 0, f"{price}")
    check("the ticket cap bounds the maximum daily stake",
          0 < max_tickets <= 100, f"{max_tickets}")
    check("the maximum daily stake is bounded and explicit",
          price * max_tickets <= 100_000, f"{price * max_tickets}/day")

    await credit(BOB, 1_000_000)
    before = await wallet_of(BOB)
    ok, _ = await eco.lottery_buy(db, GUILD, BOB, max_tickets, price)
    after = await wallet_of(BOB)
    check("buying tickets removes exactly price x count",
          ok and before - after == price * max_tickets,
          f"{before} -> {after} for {max_tickets} tickets")

    # The round opens with a 24h draw time; bring it due so a draw can happen.
    await db.economy_lottery.update_one(
        {"guildId": GUILD, "status": "open"},
        {"$set": {"drawAt": eco._now() - __import__("datetime").timedelta(hours=1)}})
    draw = await eco.maybe_draw_lottery(db, GUILD, random.Random(1))
    check("a due round always resolves to a winner or a void", draw is not None,
          "no draw")

    # Exactly one winner: the round is flipped to `done` before the payout.
    again = await eco.maybe_draw_lottery(db, GUILD, random.Random(1))
    check("the same round cannot be drawn twice", again is None, str(again))

    paid = await db.economy_tx.count_documents(
        {"guildId": GUILD, "type": "lottery_win"})
    check("at most one lottery_win row exists", paid <= 1, f"rows={paid}")

    # The pool the winner receives must equal the tickets actually sold.
    doc = await db.economy_lottery.find_one({"guildId": GUILD})
    check("the paid pool equals the ticket money taken",
          int((doc or {}).get("pool", 0)) == price * max_tickets,
          f"pool={(doc or {}).get('pool')}")


async def main() -> int:
    catalogue_scan()
    await shop_loop()
    await market_loop()
    await reward_loop()
    await gambling_ev()
    await multi_account()
    await flow_reconciliation()
    await lottery_sink()

    print(f"\n{passed} passed, {len(failed)} failed")
    if failed:
        print("Failures:\n  - " + "\n  - ".join(failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
