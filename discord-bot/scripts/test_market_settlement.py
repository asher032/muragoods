"""Drive the REAL /market commands through adversarial stored listing docs.

The market is the one place where a member's coins and items sit in escrow
outside their bag. Two failure modes matter more than a crash:

  1. ESCROW LOSS  — a listing gets stranded in `settling`, where no command can
     claim it, so the seller's items or coins are locked away permanently.
  2. ESCROW DUPE  — a release runs twice for one listing and hands the seller
     their items or coins back a second time.

Both were reachable: `int(doc["seller"])` ran *outside* the try in `accept`, so
one corrupt row left the listing wedged forever; and `/market remove` re-opened
the listing it had just released, so the seller could remove it repeatedly and
take the same items back each time.

This harness stubs only Mongo and the Discord objects — the command bodies,
`_release`, the sweep and the reservation rules are the real code. It asserts
the state machine, not just "no exception".
"""
import asyncio
import datetime as _dt
import logging
import sys
import types
import pathlib

# The scenarios below deliberately feed the market unusable stored values, so
# the defensive logging in the cog is expected output, not a failure signal.
logging.disable(logging.CRITICAL)

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
    # ReturnDocument must expose .AFTER/.BEFORE — economy.apply_delta reads
    # ReturnDocument.AFTER, and a bare `object` stub makes every wallet write
    # fail with AttributeError.
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

import discord  # noqa: E402
import database  # noqa: E402

database._db = None

import economy as eco  # noqa: E402
import items as itemdb  # noqa: E402
import rewards as rw  # noqa: E402
import cogs.marketplace as marketmod  # noqa: E402

GID = 1001
SELLER = 3003
BUYER = 4004
FOOD = "bread"

# Stored values that are not usable numbers. None of these may escape as an
# exception, and none may leave a listing wedged in `settling`.
JUNK = [None, "", "   ", "abc", "NaN", "1e400", "-", [], {}, object(), 1.0, "12.7"]


# ── a query subset of Mongo's, enough for the market's filters ──────────
def _get(doc, path):
    cur = doc
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None, False
        cur = cur[part]
    return cur, True


def _cmp(val, op, want) -> bool:
    """Ordered comparison for both numbers and expiresAt datetimes."""
    if isinstance(val, _dt.datetime) and isinstance(want, _dt.datetime):
        return {"$gte": val >= want, "$gt": val > want,
                "$lte": val <= want, "$lt": val < want}[op]
    if isinstance(val, _dt.datetime) or isinstance(want, _dt.datetime):
        return False
    v = eco.safe_int(val, -10**18)
    w = eco.safe_int(want, 10**18)
    return {"$gte": v >= w, "$gt": v > w, "$lte": v <= w, "$lt": v < w}[op]


def _cond(doc, key, cond):
    val, present = _get(doc, key)
    if isinstance(cond, dict) and any(k.startswith("$") for k in cond):
        for op, want in cond.items():
            if op in ("$gte", "$gt", "$lte", "$lt"):
                if not present or not _cmp(val, op, want):
                    return False
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
    if isinstance(cond, dict):
        if "$exists" in cond and present != bool(cond["$exists"]):
            return False
        return val == cond or (not present and cond is None)
    return val == cond or (not present and cond is None)


def _match(doc, query):
    for key, cond in (query or {}).items():
        if key == "$or":
            if not any(_match(doc, sub) for sub in cond):
                return False
            continue
        if not _cond(doc, key, cond):
            return False
    return True


def _apply_update(doc, update):
    for op, fields in (update or {}).items():
        if op == "$set":
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
        elif op == "$setOnInsert":
            for k, v in fields.items():
                parts, cur = k.split("."), doc
                for p in parts[:-1]:
                    cur = cur.setdefault(p, {})
                cur.setdefault(parts[-1], v)
        else:
            raise AssertionError(f"unsupported update op {op}")


class _Res:
    def __init__(self, modified=0, matched=0, **kw):
        self.modified_count = modified
        self.matched_count = matched
        self.upserted_id = kw.get("upserted_id")


class _Cur:
    def __init__(self, rows):
        self._rows = rows
    def sort(self, *_a, **_k): return self
    def skip(self, *_a): return self
    def limit(self, n): self._rows = self._rows[: n or len(self._rows)]; return self
    async def to_list(self, n=None, *_a):
        return self._rows[: n or len(self._rows)]


class _Coll:
    """Backed by a list of dicts, one per document, mutated in place."""

    def __init__(self, db, name):
        self.db, self.name = db, name

    def find(self, query=None, *_a, **_k):
        return _Cur([r for r in self.db.rows(self.name) if _match(r, query)])

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
            new = {}
            for k, v in (query or {}).items():
                if not k.startswith("$") and not isinstance(v, dict):
                    new[k] = v
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
            # Mongo seeds an upserted doc from the filter's equality fields,
            # which is how economy_inv rows get their guildId/userId.
            new = {k: v for k, v in (query or {}).items()
                   if not k.startswith("$") and not isinstance(v, dict)}
            _apply_update(new, update)
            self.db.rows(self.name).append(new)
            return _Res(modified=0, matched=0, upserted_id="1")
        return _Res()

    async def count_documents(self, query=None, **_k):
        return sum(1 for r in self.db.rows(self.name) if _match(r, query))

    async def insert_one(self, doc, *_a, **_k):
        self.db.rows(self.name).append(dict(doc))
        return types.SimpleNamespace(inserted_id="1")

    async def delete_one(self, *_a, **_k): return _Res()
    async def delete_many(self, *_a, **_k): return types.SimpleNamespace(deleted_count=0)
    async def create_index(self, *_a, **_k): return "idx"


class FakeDB:
    """Every collection the market touches, seeded per scenario."""

    COLLECTIONS = ("economy_market", "economy", "economy_inv", "economy_tx",
                   "guild_config", "economy_config")

    def __init__(self, market=(), wallets=None, inv=None):
        self._data = {n: [] for n in self.COLLECTIONS}
        self._data["economy_market"] = [dict(d) for d in market]
        for key, bal in (wallets or {}).items():
            # key is either a user id (this guild) or a (guildId, userId) pair
            gid, uid = key if isinstance(key, tuple) else (GID, key)
            self._data["economy"].append({"guildId": gid, "userId": uid, "balance": bal})
        for uid, items in (inv or {}).items():
            self._data["economy_inv"].append({"guildId": GID, "userId": uid, "items": dict(items)})
        for n in self.COLLECTIONS:
            setattr(self, n, _Coll(self, n))

    def rows(self, name):
        return self._data[name]

    def listing(self, listing_id="L1"):
        for r in self._data["economy_market"]:
            if r.get("listingId") == listing_id:
                return r
        return None

    def balance(self, uid, gid=GID):
        for r in self._data["economy"]:
            if r.get("userId") == uid and r.get("guildId") == gid:
                return eco.safe_int(r.get("balance"), 0)
        return 0

    def bag(self, uid):
        for r in self._data["economy_inv"]:
            if r.get("userId") == uid:
                return r.get("items") or {}
        return {}


class FakeBot:
    guilds: list = []
    is_closed = lambda self: False
    async def wait_until_ready(self): return None


class _Sent:
    def __init__(self): self.edits = 0
    async def edit(self, **_k): self.edits += 1
    async def delete(self): return None


async def _noop(*_a, **_k): return None


class FakeInteraction:
    def __init__(self, uid):
        self.user = types.SimpleNamespace(id=uid, name="u", display_name="u",
                                          mention=f"<@{uid}>")
        self.guild = types.SimpleNamespace(id=GID, me=None, name="G",
                                           get_channel=lambda i: None)
        self.channel = types.SimpleNamespace(id=99)
        self.messages: list[str] = []
        self.response = types.SimpleNamespace(defer=_noop, is_done=lambda: True)
        self.followup = types.SimpleNamespace(send=self._send)

    async def _send(self, content=None, embed=None, **_k):
        if content is not None:
            self.messages.append(str(content))
        if embed is not None:
            self.messages.append(f"{embed.title}\n{embed.description or ''}")
        return _Sent()

    @property
    def last(self) -> str:
        return self.messages[-1] if self.messages else ""


def handler(cog, name):
    attr = getattr(cog, name)
    if isinstance(attr, (discord.app_commands.Command, discord.app_commands.Group)):
        attr = attr.callback
    return attr.__get__(cog)


def listing(**over):
    doc = {
        "listingId": "L1", "guildId": GID, "seller": SELLER, "buyer": None,
        "items": {FOOD: 2}, "itemCount": 2, "price": 500, "unitPrice": 250,
        "type": "items", "state": "open", "itemName": "Bread",
        "rarity": "common",
    }
    doc.update(over)
    return doc


def new_cog():
    return marketmod.MarketCog(FakeBot())


# ══════════════════════════════════════════════════════════════════════
async def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name, ok, detail=""):
        checks.append((name, bool(ok), detail))

    accept = handler(new_cog(), "accept")
    remove = handler(new_cog(), "remove")
    view = handler(new_cog(), "view")

    async def drive(fn, db, uid, *args, **kw):
        """Run a real command; return (interaction, raised-exception-or-None)."""
        database._db = db
        it = FakeInteraction(uid)
        try:
            await fn(it, *args, **kw)
            return it, None
        except BaseException as exc:  # noqa: BLE001 - the point is to catch all
            return it, exc

    # ══ 1. ESCROW LOSS: corrupt stored values must never wedge a listing ══
    for field in ("seller", "guildId", "price", "itemCount", "itemName", "rarity",
                  "listingId", "items", "type", "createdAt", "expiresAt"):
        for junk in JUNK:
            db = FakeDB(market=[listing(**{field: junk})],
                        wallets={SELLER: 10, BUYER: 100_000})
            it, exc = await drive(accept, db, BUYER, "L1")
            doc = db.listing("L1") or {}
            state = doc.get("state")
            check(f"accept survives junk {field}={junk!r}",
                  exc is None, f"{type(exc).__name__ if exc else ''}: {exc or ''}")
            check(f"accept never strands {field}={junk!r} in settling",
                  state != "settling", f"state={state}")
            # A listing that fell out of `open` must have given the escrow back,
            # unless it was fully settled.
            if state in ("open", "voided", "orphaned", "expired"):
                check(f"accept returns escrow for junk {field}={junk!r}",
                      db.balance(SELLER) >= 10 or state == "orphaned",
                      f"balance={db.balance(SELLER)} state={state}")

    # ══ 2. _release is total: a failing write must not escape ══
    for junk in JUNK:
        cog = new_cog()
        database._db = FakeDB(wallets={SELLER: 10})
        doc = listing(price=junk, type="coins")
        try:
            ok = await cog._release(doc, "test")
            check(f"_release survives price={junk!r}", isinstance(ok, bool),
                  f"returned {ok!r}")
        except BaseException as exc:  # noqa: BLE001
            check(f"_release survives price={junk!r}", False,
                  f"{type(exc).__name__}: {exc}")

    # a release that cannot even write its state must still not raise
    class ExplodingDB(FakeDB):
        def __init__(self, **kw):
            super().__init__(**kw)
            self.boom = 0

        def rows(self, name):
            if name == "economy_market":
                self.boom += 1
                if self.boom > 1:
                    raise RuntimeError("mongo down")
            return super().rows(name)

    cog = new_cog()
    edb = ExplodingDB(wallets={SELLER: 10})
    database._db = edb
    try:
        await cog._release(listing(type="coins"), "test")
        check("_release survives a failing state write", True)
    except BaseException as exc:  # noqa: BLE001
        check("_release survives a failing state write", False, f"{type(exc).__name__}: {exc}")

    # ══ 3. ESCROW DUPE: /market remove must not be repeatable ══
    # The items were debited into escrow when the listing was posted, so the
    # seller's bag starts empty. A correct release ends with exactly 2 back.
    db = FakeDB(market=[listing()], inv={SELLER: {}})
    it, exc = await drive(remove, db, SELLER, "L1")
    check("remove succeeds", exc is None and "removed" in it.last.lower(),
          f"{exc or ''} | {it.last}")
    check("remove voids the listing", db.listing("L1")["state"] == "voided",
          f"state={db.listing('L1')['state']}")
    check("remove returns the items once", db.bag(SELLER).get(FOOD) == 2,
          f"bag={db.bag(SELLER)}")

    before = db.bag(SELLER).get(FOOD, 0)
    for _ in range(5):
        it, exc = await drive(remove, db, SELLER, "L1")
        check("repeat remove is rejected", exc is None and "no open listing" in it.last.lower(),
              f"{exc or ''} | {it.last}")
    check("repeat remove cannot duplicate items",
          db.bag(SELLER).get(FOOD, 0) == before,
          f"bag={db.bag(SELLER)} before={before}")

    # concurrent removes: exactly one may return the escrow
    for _ in range(5):
        db = FakeDB(market=[listing()], inv={SELLER: {}})
        database._db = db
        cog = new_cog()
        rm = handler(cog, "remove")
        results = await asyncio.gather(
            *(drive(rm, db, SELLER, "L1") for _ in range(4)), return_exceptions=True)
        check("concurrent removes do not raise",
              all(r[1] is None for r in results if isinstance(r, tuple)),
              str([r[1] for r in results if isinstance(r, tuple)]))
        check("concurrent removes return the escrow exactly once",
              db.bag(SELLER).get(FOOD) == 2, f"bag={db.bag(SELLER)}")

    # concurrent accepts: the buyer may only ever be charged once
    for _ in range(5):
        db = FakeDB(market=[listing()], wallets={SELLER: 0, BUYER: 100_000},
                    inv={BUYER: {}})
        database._db = db
        cog = new_cog()
        ac = handler(cog, "accept")
        await asyncio.gather(*(drive(ac, db, BUYER, "L1") for _ in range(4)),
                             return_exceptions=True)
        check("concurrent accepts charge the buyer once",
              db.balance(BUYER) == 100_000 - 500, f"balance={db.balance(BUYER)}")
        check("concurrent accepts credit the seller once",
              db.balance(SELLER) == 500, f"balance={db.balance(SELLER)}")
        check("concurrent accepts complete the listing",
              db.listing("L1")["state"] == "completed", f"state={db.listing('L1')['state']}")

    # ══ 4. Concurrent expiry must not double-refund ══
    for _ in range(5):
        db = FakeDB(market=[listing(type="coins", price=700)],
                    wallets={SELLER: 0, BUYER: 100_000})
        database._db = db
        cog = new_cog()
        doc = db.listing("L1")
        await asyncio.gather(*(cog._expire_one(doc) for _ in range(4)),
                             return_exceptions=True)
        check("concurrent expiry refunds escrow once",
              db.balance(SELLER) == 700, f"balance={db.balance(SELLER)}")
        check("concurrent expiry marks the listing expired",
              db.listing("L1")["state"] == "expired", f"state={db.listing('L1')['state']}")

    # ══ 5. Happy paths still settle correctly ══
    db = FakeDB(market=[listing()], wallets={SELLER: 0, BUYER: 100_000}, inv={BUYER: {}})
    it, exc = await drive(accept, db, BUYER, "L1")
    check("items listing settles", exc is None and "bought" in it.last.lower(),
          f"{exc or ''} | {it.last}")
    check("buyer is charged the price", db.balance(BUYER) == 100_000 - 500,
          f"balance={db.balance(BUYER)}")
    check("seller is paid the price", db.balance(SELLER) == 500, f"balance={db.balance(SELLER)}")
    check("buyer receives the items", db.bag(BUYER).get(FOOD) == 2, f"bag={db.bag(BUYER)}")
    check("listing is completed", db.listing("L1")["state"] == "completed",
          f"state={db.listing('L1')['state']}")

    db = FakeDB(market=[listing(type="coins", price=700)], wallets={SELLER: 0, BUYER: 5},
                inv={BUYER: {FOOD: 2}})
    it, exc = await drive(accept, db, BUYER, "L1")
    check("coin offer settles", exc is None and "sold" in it.last.lower(),
          f"{exc or ''} | {it.last}")
    check("coin offer pays the accepter who sold the items",
          db.balance(BUYER) == 5 + 700, f"balance={db.balance(BUYER)}")
    check("coin offer delivers the items to the buyer",
          db.bag(SELLER).get(FOOD) == 2, f"buyer bag={db.bag(SELLER)}")
    check("coin offer empties the accepter's bag", db.bag(BUYER).get(FOOD, 0) == 0,
          f"seller bag={db.bag(BUYER)}")

    # buyer cannot afford -> listing reopens, escrow intact
    db = FakeDB(market=[listing()], wallets={SELLER: 0, BUYER: 10}, inv={BUYER: {}})
    it, exc = await drive(accept, db, BUYER, "L1")
    check("broke buyer is told", exc is None and "reopened" in it.last.lower(),
          f"{exc or ''} | {it.last}")
    check("broke buyer is not charged", db.balance(BUYER) == 10, f"balance={db.balance(BUYER)}")
    check("broke buyer reopens the listing", db.listing("L1")["state"] == "open",
          f"state={db.listing('L1')['state']}")

    # self-accept is refused and the listing reopens
    db = FakeDB(market=[listing()], inv={SELLER: {}})
    it, exc = await drive(accept, db, SELLER, "L1")
    check("self-accept is refused", exc is None and "own listing" in it.last.lower(),
          f"{exc or ''} | {it.last}")
    check("self-accept reopens the listing", db.listing("L1")["state"] == "open",
          f"state={db.listing('L1')['state']}")
    check("self-accept does not pay the seller", db.balance(SELLER) == 0,
          f"balance={db.balance(SELLER)}")

    # ══ 6. /market view must render a board containing corrupt rows ══
    db = FakeDB(market=[listing(price=j) for j in JUNK])
    it, exc = await drive(view, db, BUYER, "")
    check("view survives a board of corrupt prices", exc is None,
          f"{type(exc).__name__ if exc else ''}: {exc or ''}")
    db = FakeDB(market=[listing(itemCount=j, itemName=j) for j in JUNK])
    it, exc = await drive(view, db, BUYER, "")
    check("view survives corrupt counts and names", exc is None,
          f"{type(exc).__name__ if exc else ''}: {exc or ''}")

    # ══ 7. Background expiry sweeps every guild, not just the caller's ══
    past = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(hours=1)
    for _ in range(3):
        db = FakeDB(market=[listing(listingId="A", type="coins", price=100,
                                    expiresAt=past, guildId=GID, seller=SELLER),
                            listing(listingId="B", type="coins", price=200,
                                    expiresAt=past, guildId=9999, seller=SELLER)],
                    wallets={SELLER: 0, (9999, SELLER): 0})
        database._db = db
        cog = new_cog()
        n = await cog._sweep_expired()
        check("background sweep reports both listings", n == 2, f"n={n}")
        check("background sweep expires the other guild's listing",
              db.listing("B")["state"] == "expired", f"state={db.listing('B')['state']}")
        check("background sweep refunds this guild's escrow",
              db.balance(SELLER) == 100, f"balance={db.balance(SELLER)}")
        check("background sweep refunds the other guild's escrow",
              db.balance(SELLER, 9999) == 200, f"balance={db.balance(SELLER, 9999)}")

    # an unexpired listing must be left alone
    far = _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(hours=5)
    db = FakeDB(market=[listing(expiresAt=far)], inv={SELLER: {}})
    database._db = db
    cog = new_cog()
    n = await cog._sweep_expired()
    check("background sweep leaves a live listing alone",
          n == 0 and db.listing("L1")["state"] == "open", f"n={n}")
    check("background sweep does not touch a live listing's escrow",
          db.bag(SELLER).get(FOOD, 0) == 0, f"bag={db.bag(SELLER)}")

    # an expired items listing must be returned to the seller's bag
    db = FakeDB(market=[listing(expiresAt=past)], inv={SELLER: {}})
    database._db = db
    cog = new_cog()
    n = await cog._sweep_expired()
    check("background sweep expires an items listing", n == 1, f"n={n}")
    check("background sweep returns escrowed items",
          db.bag(SELLER).get(FOOD) == 2, f"bag={db.bag(SELLER)}")
    check("background sweep voids the expired listing",
          db.listing("L1")["state"] == "expired", f"state={db.listing('L1')['state']}")

    # ══ 8. A settling listing keeps its items reserved ══
    database._db = FakeDB(market=[listing(state="settling")])
    locked = await rw.reserved_item_ids(database._db, GID, SELLER)
    check("a settling listing still reserves its items", (FOOD, 2) in locked, f"locked={locked}")
    database._db = FakeDB(market=[listing(state="open")])
    locked = await rw.reserved_item_ids(database._db, GID, SELLER)
    check("an open listing reserves its items", (FOOD, 2) in locked, f"locked={locked}")
    database._db = FakeDB(market=[listing(state="voided")])
    locked = await rw.reserved_item_ids(database._db, GID, SELLER)
    check("a voided listing reserves nothing", locked == set(), f"locked={locked}")

    # ══ 9. The sweeper task is cancellable and starts only once ══
    cog = new_cog()
    check("sweeper starts unset", cog._sweeper is None)
    await cog.cog_unload()  # must be safe before it ever started
    check("cog_unload before start is safe", cog._sweeper is None)

    # ── report ──
    failed = [c for c in checks if not c[1]]
    for name, ok, detail in failed[:40]:
        print(f"FAIL  {name}  {detail}")
    print(f"\nmarket settlement: {len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
