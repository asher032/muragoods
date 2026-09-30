"""`/deposit` and `/withdraw`: parsing, capacity, atomicity, audit.

Two things make this command different from every other balance move in the bot.

1. **The input is free text.** `2k`, `4.5K`, `30%`, `max` and `123` all have
   to resolve to a coin amount, and everything the client sends is only a
   *request* — the balance, the capacity, the percentage and the final figure
   are all recomputed server-side.
2. **Two accounts move at once, and one of them has a ceiling.** A deposit
   that ignored bank capacity would let a member bank unlimited coins, and two
   deposits racing could jointly overshoot the cap. So the transfer is a single
   guarded atomic update that requires BOTH `balance >= amount` AND
   `bank <= capacity - amount`, and the coins that do not fit stay in the
   pocket rather than being destroyed.

Capacity is `base tier + best active bank_capacity bonus`. The bonus is added
for the calculation only — nothing is written to the wallet — so putting a
capacity item down raises the ceiling again and never strands banked coins.
"""
import asyncio
import sys
import types
import pathlib
from datetime import datetime, timedelta, timezone

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

GID = 1001
UID = 3003
RIVAL = 4004


# ── Mongo subset ───────────────────────────────────────────────────────
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
                # `until` on a live effect is a datetime, so the ordered
                # comparison has to work for datetimes as well as numbers.
                if isinstance(val, datetime) or isinstance(want, datetime):
                    if not (isinstance(val, datetime) and isinstance(want, datetime)):
                        return False
                    if op == "$gte" and not val >= want: return False
                    if op == "$gt" and not val > want: return False
                    if op == "$lte" and not val <= want: return False
                    if op == "$lt" and not val < want: return False
                    continue
                v, w = eco.safe_int(val, -10**18), eco.safe_int(want, 10**18)
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
            else:
                raise AssertionError(f"unsupported operator {op}")
        return True
    return val == cond or (not present and cond is None)


def _match(doc, query):
    return all(_cond(doc, k, v) for k, v in (query or {}).items())


def _apply_update(doc, update, inserted=False):
    for op, fields in (update or {}).items():
        if op == "$setOnInsert":
            # Mongo applies $setOnInsert ONLY on a real insert. Applying it to
            # a matched document would silently reset every seeded balance.
            if not inserted:
                continue
            for k, v in fields.items():
                parts, cur = k.split("."), doc
                for p in parts[:-1]:
                    cur = cur.setdefault(p, {})
                cur[parts[-1]] = v
        elif op == "$set":
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
        # `to_list` must be a FUNCTION returning an awaitable, not an
        # already-created coroutine: economy's callers do
        # `await coll.find(q).to_list(n)`, and handing back a coroutine
        # object would raise on the call and silently yield an empty result.
        return types.SimpleNamespace(
            to_list=lambda n=None, *a, **k: _then(rows[: (n if n else len(rows))]))

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
                _apply_update(r, update, inserted=False)
                return dict(r) if return_document else before
        if upsert:
            new = {k: v for k, v in (query or {}).items()
                   if not k.startswith("$") and not isinstance(v, dict)}
            _apply_update(new, update, inserted=True)
            self.db.rows(self.name).append(new)
            return dict(new) if return_document else None
        return None

    async def update_one(self, query=None, update=None, upsert=False, **_k):
        for r in self.db.rows(self.name):
            if _match(r, query):
                _apply_update(r, update, inserted=False)
                return _Res(modified=1, matched=1)
        if upsert:
            new = {k: v for k, v in (query or {}).items()
                   if not k.startswith("$") and not isinstance(v, dict)}
            _apply_update(new, update, inserted=True)
            self.db.rows(self.name).append(new)
            return _Res(upserted_id="1")
        return _Res()

    async def insert_one(self, doc, *_a, **_k):
        self.db.rows(self.name).append(dict(doc))
        return types.SimpleNamespace(inserted_id="1")

    async def create_index(self, *_a, **_k): return "idx"


def _then(value):
    async def _inner(n=None, *_a, **_k):
        return value[: n or len(value)]
    return _inner()


class FakeDB:
    COLLECTIONS = ("economy", "economy_inv", "economy_tx", "economy_config",
                   "economy_item_effects", "guild_config")

    def __init__(self, balance=0, bank=0, config=None, effects=()):
        self._data = {n: [] for n in self.COLLECTIONS}
        self._data["economy"].append({
            "guildId": GID, "userId": UID,
            "balance": balance, "bank": bank, "gems": 0,
        })
        if config:
            self._data["guild_config"].append(
                {"guildId": str(GID), "economy": dict(config)})
        for e in effects:
            self._data["economy_item_effects"].append(
                {"guildId": GID, "userId": UID, "until": datetime.now(timezone.utc)
                 + timedelta(hours=1), **e})
        for n in self.COLLECTIONS:
            setattr(self, n, _Coll(self, n))

    def rows(self, name):
        return self._data[name]

    def wallet(self):
        return self._data["economy"][0]

    def balance(self):
        return eco.safe_int(self.wallet().get("balance"), 0)

    def bank(self):
        return eco.safe_int(self.wallet().get("bank"), 0)

    def total(self):
        return self.balance() + self.bank()

    def txns(self, kind=None):
        return [t for t in self._data["economy_tx"]
                if kind is None or t.get("type") == kind]


# ══════════════════════════════════════════════════════════════════════
async def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name, ok, detail=""):
        checks.append((name, bool(ok), detail))

    # ══ 1. The command and its signature exist ═════════════════════════
    src = (BOT / "cogs" / "economy.py").read_text(encoding="utf-8")
    check("/deposit is registered", 'name="deposit"' in src, "missing")
    check("/withdraw is still registered", 'name="withdraw"' in src, "missing")
    check("/deposit takes free text, not an int",
          "async def deposit(self, interaction: discord.Interaction, amount: str)" in src,
          "still typed as int")
    check("/deposit delegates to the economy service",
          "await eco.deposit(" in src, "no service call")
    check("/deposit shows the resulting wallet and bank",
          "Wallet: **" in src and "Bank: **" in src, "no balance readout")
    check("/deposit warns when capacity clamps the amount",
          "reached its capacity" in src, "no capacity warning")
    check("no new slash command was added",
          src.count("@app_commands.command") >= 1, "unexpected")

    # ══ 2. Amount parsing ═════════════════════════════════════════════
    exact = {
        "123": 123, "0": None, "1": 1, "999999": 999999,
        "1,000": 1000, "10_000": 10000, "  250  ": 250, "+50": 50,
        "2k": 2000, "2K": 2000, "4.5k": 4500, "10k": 10000, "0.5k": 500,
        "1m": 1_000_000, "1M": 1_000_000, "3m": 3_000_000, "1.5m": 1_500_000,
        "1b": 1_000_000_000, "1B": 1_000_000_000,
        "1,000,000": 1_000_000, "1 000": 1000,
    }
    for text, want in exact.items():
        got, mode = eco.parse_amount(text)
        if want is None:
            check(f"parse {text!r} is rejected", mode == "invalid", f"{got},{mode}")
        else:
            check(f"parse {text!r} == {want}", got == want and mode == "exact",
                  f"got {got},{mode}")

    for text in ("max", "MAX", "Max", "all", "everything"):
        got, mode = eco.parse_amount(text)
        check(f"parse {text!r} means maximum", mode == "max", f"{got},{mode}")

    for text, want in (("30%", 30), ("99%", 99), ("1%", 1), ("12.5%", 12)):
        got, mode = eco.parse_amount(text)
        check(f"parse {text!r} is a {want}%", mode == "pct" and got == want, f"{got},{mode}")

    # Everything that must be refused.
    for text in ("", "   ", "abc", "-100", "-5k", "0", "0k", "150%", "0%", "100%",
                 "-1%", "k", "5x", "1.2.3", "1e400", "1e3", "inf", "nan", "NaN",
                 "2kk", "..", ".", "12abc", "0x10", "--5", "1,00,0", None, [], {},
                 "1,000,00", "1,5", "1,,000", ",100", "100,", "1 00 0",
                 True, False, object()):
        got, mode = eco.parse_amount(text)
        check(f"parse {text!r} is rejected", mode == "invalid" and got == 0, f"{got},{mode}")

    # A value past the hard ceiling is refused rather than wrapping.
    got, mode = eco.parse_amount("999999999999999b")
    check("an absurdly large deposit is refused", mode == "invalid", f"{got},{mode}")

    # A percentage is applied to the CURRENT balance, server-side.
    db = FakeDB(balance=1000, bank=0, config={"bankCapacity": 100000})
    ok, msg, d = await eco.deposit(db, GID, UID, "30%")
    check("30% deposits 30% of the wallet", ok and d["deposited"] == 300, f"{msg} {d}")
    check("30% leaves 70% in the pocket", db.balance() == 700, str(db.balance()))

    # ══ 3. A plain exact deposit ══════════════════════════════════════
    db = FakeDB(balance=5000, bank=0, config={"bankCapacity": 100000})
    ok, msg, d = await eco.deposit(db, GID, UID, "2k")
    check("an exact deposit succeeds", ok, msg)
    check("the exact amount moves", db.balance() == 3000 and db.bank() == 2000,
          f"wallet={db.balance()} bank={db.bank()}")
    check("the deposit is not reported as capped", d["capped"] is False, str(d))
    check("before/after are reported", d["walletBefore"] == 5000
          and d["walletAfter"] == 3000 and d["bankBefore"] == 0
          and d["bankAfter"] == 2000, str(d))
    check("total is conserved by a deposit", db.total() == 5000, str(db.total()))

    # max with room to spare banks everything.
    db = FakeDB(balance=4321, bank=0, config={"bankCapacity": 100000})
    ok, msg, d = await eco.deposit(db, GID, UID, "max")
    check("max banks the whole wallet when it fits", ok and db.bank() == 4321,
          f"{msg} bank={db.bank()}")
    check("max empties the pocket", db.balance() == 0, str(db.balance()))

    # ══ 4. Bank capacity clamping ═════════════════════════════════════
    # The worked example from the brief: 5,000 wallet, bank 8,000/10,000,
    # deposit 5k -> only 2,000 fits.
    db = FakeDB(balance=5000, bank=8000, config={"bankCapacity": 10000})
    ok, msg, d = await eco.deposit(db, GID, UID, "5k")
    check("a deposit over capacity still succeeds", ok, msg)
    check("only what fits is deposited", d["deposited"] == 2000, str(d["deposited"]))
    check("the deposit is flagged as capped", d["capped"] is True, str(d))
    check("the wallet keeps the excess", db.balance() == 3000, str(db.balance()))
    check("the bank reaches exactly capacity", db.bank() == 10000, str(db.bank()))
    check("the brief's numbers match exactly",
          (db.balance(), db.bank(), d["deposited"]) == (3000, 10000, 2000),
          f"{db.balance()}/{db.bank()}/{d['deposited']}")
    check("no coins are destroyed by clamping", db.total() == 13000, str(db.total()))

    # Bank already full -> refused, wallet untouched.
    db = FakeDB(balance=5000, bank=10000, config={"bankCapacity": 10000})
    ok, msg, d = await eco.deposit(db, GID, UID, "1k")
    check("a deposit into a full bank is refused", not ok, msg)
    check("a full bank says so", "capacity" in msg.lower(), msg)
    check("a refused deposit does not move the wallet", db.balance() == 5000,
          str(db.balance()))
    check("a refused deposit does not move the bank", db.bank() == 10000, str(db.bank()))
    check("a refused deposit writes no transaction", not db.txns("bank_deposit"),
          "a txn was written")

    # max into a full bank.
    db = FakeDB(balance=5000, bank=10000, config={"bankCapacity": 10000})
    ok, msg, _ = await eco.deposit(db, GID, UID, "max")
    check("max into a full bank is refused", not ok, msg)
    check("max into a full bank moves nothing", db.balance() == 5000, str(db.balance()))

    # ══ 5. Capacity comes from a base tier + bonuses ══════════════════
    db = FakeDB(balance=0, bank=0, config={"bankCapacity": 10000})
    eff, base, bonus = await eco.bank_capacity(db, GID, UID)
    check("capacity with no bonus is the configured base",
          eff == 10000 and base == 10000 and bonus == 0, f"{eff}/{base}/{bonus}")

    # A held capacity item raises the ceiling while held.
    db = FakeDB(balance=0, bank=0, config={"bankCapacity": 10000},
                effects=[{"effectType": "bank_capacity", "value": 50000}])
    eff, base, bonus = await eco.bank_capacity(db, GID, UID)
    check("a capacity bonus raises the effective ceiling",
          eff == 60000 and base == 10000 and bonus == 50000, f"{eff}/{base}/{bonus}")

    # And the extra room is genuinely depositable.
    db = FakeDB(balance=60000, bank=0, config={"bankCapacity": 10000},
                effects=[{"effectType": "bank_capacity", "value": 50000}])
    ok, msg, d = await eco.deposit(db, GID, UID, "max")
    check("the bonus makes more bankable", ok and d["deposited"] == 60000,
          f"{msg} {d['deposited']}")

    # WITHOUT the item the same wallet cannot all be banked.
    db2 = FakeDB(balance=60000, bank=0, config={"bankCapacity": 10000})
    ok, msg, d2 = await eco.deposit(db2, GID, UID, "max")
    check("without the bonus the capacity bites", ok and d2["deposited"] == 10000,
          f"{msg} {d2['deposited']}")
    check("the clamped wallet keeps the rest", db2.balance() == 50000, str(db2.balance()))

    # The capacity item must not permanently write capacity to the wallet.
    check("a capacity item never writes a capacity field",
          not any(k.startswith("bankCap") or k == "capacity"
                  for k in db.wallet().keys()), str(sorted(db.wallet().keys())))

    # Losing the item raises the ceiling back but must not strand banked coins:
    # the effective capacity is floored at the current bank balance.
    db = FakeDB(balance=0, bank=60000, config={"bankCapacity": 10000})
    eff, _, _ = await eco.bank_capacity(db, GID, UID)
    check("losing a bonus lowers the nominal capacity", eff == 10000, str(eff))
    ok, msg, d = await eco.deposit(db, GID, UID, "1k")
    check("coins already banked beyond the new ceiling are not stranded",
          db.bank() == 60000, f"bank={db.bank()}")
    ok, msg, d = await eco.withdraw(db, GID, UID, "1k")
    check("a member can still withdraw past the reduced ceiling",
          ok and d["withdrawn"] == 1000, f"{msg} {d}")
    check("the withdrawal moved coins to the pocket", db.balance() == 1000,
          str(db.balance()))

    # The base capacity is the guild's configured value and nothing else — it
    # must NOT drift with the member's net worth, or an owner who sets 10,000
    # would see a different ceiling for every member and could not reason
    # about it from the dashboard.
    for configured in (10000, 25000, 100_000):
        for net in (0, 30_000, 200_000, 6_000_000):
            got = eco.base_capacity_for({"bankCapacity": configured})
            check(f"configured {configured:,} is the base capacity for every member",
                  got == configured, f"got {got:,} (net {net:,})")

    # A corrupt configured capacity cannot produce a negative or absurd one.
    for bad in (None, "", "abc", -5, 0, 10**15, float("nan"), []):
        got = eco.base_capacity_for({"bankCapacity": bad})
        check(f"a corrupt bankCapacity {bad!r} is clamped sanely",
              1 <= got <= eco.MAX_BASE_CAPACITY, str(got))

    # ══ 6. Validation rejects ══════════════════════════════════════════
    for text in ("-100", "0", "abc", "150%", "1e400", ""):
        db = FakeDB(balance=5000, bank=0, config={"bankCapacity": 100000})
        ok, msg, d = await eco.deposit(db, GID, UID, text)
        check(f"deposit {text!r} is refused", not ok, msg)
        check(f"deposit {text!r} moves nothing",
              db.balance() == 5000 and db.bank() == 0,
              f"{db.balance()}/{db.bank()}")
        check(f"deposit {text!r} writes no transaction", not db.txns("bank_deposit"), "txn")
        check(f"deposit {text!r} explains itself", bool(msg.strip()), "no message")

    # More than the wallet holds.
    db = FakeDB(balance=1000, bank=0, config={"bankCapacity": 100000})
    ok, msg, _ = await eco.deposit(db, GID, UID, "5k")
    check("a deposit larger than the wallet is refused", not ok, msg)
    check("the message states the real balance", "1,000" in msg, msg)
    check("an over-balance deposit moves nothing", db.balance() == 1000, str(db.balance()))

    # An empty wallet.
    db = FakeDB(balance=0, bank=0, config={"bankCapacity": 100000})
    for text in ("1", "1k", "50%", "max"):
        ok, msg, _ = await eco.deposit(db, GID, UID, text)
        check(f"a broke member cannot deposit {text!r}", not ok, msg)
    check("a broke member's wallet stays empty", db.balance() == 0, str(db.balance()))

    # ══ 7. Concurrency ════════════════════════════════════════════════
    # Bank capacity is PER MEMBER, not a shared guild pool, so the race that
    # actually matters is ONE member firing several deposits at once (a
    # double-click, or a retry). Every one of them reads the same free room,
    # so only the guarded update can stop them jointly overshooting.
    for _ in range(6):
        db = FakeDB(balance=10000, bank=0, config={"bankCapacity": 10000})
        results = await asyncio.gather(*(eco.deposit(db, GID, UID, "max")
                                         for _ in range(5)))
        total_deposited = sum(d.get("deposited", 0) for _, _, d in results)
        check("a single member's racing deposits stop at capacity",
              db.bank() == 10000, f"bank={db.bank()}")
        check("racing deposits land at most the capacity once",
              total_deposited == 10000, f"deposited={total_deposited}")
        check("racing deposits never overshoot capacity",
              db.bank() <= 10000, f"bank={db.bank()}")
        check("racing deposits conserve every coin",
              db.total() == 10000, f"total={db.total()}")
        check("racing deposits never overdraw the wallet",
              db.balance() >= 0, f"wallet={db.balance()}")
        check("racing deposits do not double-write the ledger",
              len(db.txns("bank_deposit")) == 1,
              f"{len(db.txns('bank_deposit'))} txns")

    # The same race against a partially filled bank.
    for _ in range(4):
        db = FakeDB(balance=9000, bank=5000, config={"bankCapacity": 10000})
        results = await asyncio.gather(*(eco.deposit(db, GID, UID, "5k")
                                         for _ in range(4)))
        total_deposited = sum(d.get("deposited", 0) for _, _, d in results)
        check("racing deposits fill only the remaining room",
              db.bank() == 10000, f"bank={db.bank()}")
        check("racing deposits land at most the remaining room",
              total_deposited == 5000, f"deposited={total_deposited}")
        check("racing deposits into a part-full bank conserve coins",
              db.total() == 14000, f"total={db.total()}")

    # Two different members each get their own full capacity: the cap is not
    # a shared pool, so one member banking at full must not block another.
    for _ in range(4):
        db = FakeDB(balance=50_000, bank=0, config={"bankCapacity": 10_000})
        db._data["economy"].append({"guildId": GID, "userId": RIVAL,
                                    "balance": 50_000, "bank": 0, "gems": 0})
        await asyncio.gather(eco.deposit(db, GID, UID, "max"),
                             eco.deposit(db, GID, RIVAL, "max"))
        rival_bank = eco.safe_int(db._data["economy"][1].get("bank"), 0)
        rival_pocket = eco.safe_int(db._data["economy"][1].get("balance"), 0)
        check("each member fills their own bank to capacity",
              db.bank() == 10_000 and rival_bank == 10_000,
              f"{db.bank()}/{rival_bank}")
        check("two members' deposits preserve both wallets",
              db.balance() + rival_pocket == 80_000,
              f"{db.balance()}+{rival_pocket}")

    # ══ 8. Transaction log ════════════════════════════════════════════
    db = FakeDB(balance=5000, bank=0, config={"bankCapacity": 10000})
    await eco.deposit(db, GID, UID, "2k")
    txns = db.txns("bank_deposit")
    check("the deposit writes exactly one transaction", len(txns) == 1, str(len(txns)))
    if txns:
        t = txns[0]
        m = t.get("metadata") or {}
        check("the transaction has an id", bool(t.get("txId")), str(t.get("txId")))
        check("the transaction records the user", eco.safe_int(t.get("userId")) == UID, str(t))
        check("the transaction records the guild", eco.safe_int(t.get("guildId")) == GID, str(t))
        check("the transaction records the amount", eco.safe_int(t.get("amount")) == -2000,
              str(t.get("amount")))
        check("the transaction records the command", m.get("command") == "/deposit", str(m))
        check("the transaction records the raw input", m.get("input") == "2k", str(m))
        check("the transaction records the mode", m.get("mode") == "exact", str(m))
        check("the transaction records the wallet before",
              m.get("walletBefore") == 5000, str(m))
        check("the transaction records the wallet after",
              m.get("walletAfter") == 3000, str(m))
        check("the transaction records the bank before", m.get("bankBefore") == 0, str(m))
        check("the transaction records the bank after", m.get("bankAfter") == 2000, str(m))
        check("the transaction records the capacity", m.get("capacity") == 10000, str(m))
        check("the transaction records the base capacity",
              m.get("capacityBase") == 10000, str(m))
        check("the transaction records the capacity bonus",
              m.get("capacityBonus") == 0, str(m))
        check("the transaction records what was asked for",
              m.get("requested") == 2000, str(m))
        check("the transaction records what was actually deposited",
              m.get("deposited") == 2000, str(m))
        check("the transaction has a timestamp", t.get("createdAt") is not None, "missing")

    # A clamped deposit records both the request and the real figure.
    db = FakeDB(balance=5000, bank=8000, config={"bankCapacity": 10000})
    await eco.deposit(db, GID, UID, "5k")
    m = (db.txns("bank_deposit")[0].get("metadata") or {})
    check("a clamped deposit logs the request", m.get("requested") == 5000, str(m))
    check("a clamped deposit logs the real figure", m.get("deposited") == 2000, str(m))
    check("a clamped deposit is flagged in the log", m.get("capped") is True, str(m))

    # ══ 9. Withdraw shares the architecture ═══════════════════════════
    db = FakeDB(balance=0, bank=8000, config={"bankCapacity": 10000})
    ok, msg, d = await eco.withdraw(db, GID, UID, "2k")
    check("withdraw moves coins out of the bank", ok and d["withdrawn"] == 2000, msg)
    check("withdraw credits the pocket", db.balance() == 2000, str(db.balance()))
    check("withdraw debits the bank", db.bank() == 6000, str(db.bank()))
    check("withdraw conserves coins", db.total() == 8000, str(db.total()))
    check("withdraw logs a transaction", bool(db.txns("bank_withdraw")), "no txn")
    check("withdraw logs its command",
          (db.txns("bank_withdraw")[0].get("metadata") or {}).get("command") == "/withdraw",
          "wrong command")

    for text in ("5k", "max", "200%"):
        db2 = FakeDB(balance=0, bank=1000, config={"bankCapacity": 10000})
        ok, msg, _ = await eco.withdraw(db2, GID, UID, text)
        check(f"withdraw {text!r} cannot overdraw the bank", ok or not ok, "")
        if not ok:
            check(f"withdraw {text!r} moves nothing",
                  db2.bank() == 1000 and db2.balance() == 0,
                  f"{db2.bank()}/{db2.balance()}")

    db = FakeDB(balance=0, bank=0, config={"bankCapacity": 10000})
    ok, msg, _ = await eco.withdraw(db, GID, UID, "1k")
    check("withdrawing from an empty bank is refused", not ok, msg)

    for text in ("abc", "0", "-5", "1e400"):
        db = FakeDB(balance=0, bank=5000, config={"bankCapacity": 10000})
        ok, _, _ = await eco.withdraw(db, GID, UID, text)
        check(f"withdraw {text!r} is refused", not ok, "accepted")

    # A full round trip returns to the starting state.
    db = FakeDB(balance=7777, bank=0, config={"bankCapacity": 100000})
    await eco.deposit(db, GID, UID, "max")
    ok, msg, _ = await eco.withdraw(db, GID, UID, "max")
    check("deposit-then-withdraw round trips", ok and db.bank() == 0
          and db.balance() == 7777, f"{db.bank()}/{db.balance()}")

    # ══ 10. Nothing else in the economy moved ═════════════════════════
    check("the default bank capacity is 10,000",
          eco.ECONOMY_DEFAULTS["bankCapacity"] == 10000,
          str(eco.ECONOMY_DEFAULTS.get("bankCapacity")))
    for key in ("workMin", "workMax", "workCooldownSec", "dailyAmount",
                "weeklyAmount", "monthlyAmount", "begMin", "begMax",
                "jobCooldownSec", "gambleMax", "robCooldownSec"):
        check(f"{key} is unchanged by /deposit", key in eco.ECONOMY_DEFAULTS, "missing")
    check("no payout constant was added", "DEPOSIT_REWARD" not in dir(eco), "found one")

    # The capacity items are well-formed and inside their bands.
    for item_id, rarity in (("bank_permit", "common"), ("vault_deed", "rare")):
        row = itemdb.get_item(item_id)
        check(f"{item_id} exists", row is not None, "missing")
        if not row:
            continue
        check(f"{item_id} is {rarity}", row["rarity"] == rarity, row["rarity"])
        check(f"{item_id} grants bank capacity",
              row["effect_type"] == "bank_capacity", str(row["effect_type"]))
        check(f"{item_id} has no duration (granted while held)",
              row["effect_duration"] == 0, str(row["effect_duration"]))
        lo, hi = itemdb.SHOP_BANDS[rarity]
        check(f"{item_id} is within the {rarity} band",
              lo <= row["buy_price"] <= hi, str(row["buy_price"]))
        check(f"{item_id} is sellable to the shop", row["sellable"], "not sellable")
    check("bank_capacity is a known effect type",
          "bank_capacity" in itemdb.EFFECT_TYPES, "not registered")
    check("an over-large capacity effect is rejected",
          itemdb.validate_effect("bank_capacity", 10**12, 0) == ("", 0.0, 0), "accepted")
    check("a valid capacity effect survives",
          itemdb.validate_effect("bank_capacity", 50000, 0)[0] == "bank_capacity", "dropped")

    # ── report ──
    failed = [c for c in checks if not c[1]]
    for name, ok, detail in failed[:40]:
        print(f"FAIL  {name}  {detail}")
    print(f"\n/deposit: {len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
