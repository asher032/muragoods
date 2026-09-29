"""Execute real /level-family handlers against adversarial stored data.

This is deliberately NOT a source scan. It imports the cog and calls the
coroutine the way discord.py does, with a stubbed interaction and a stubbed
Mongo whose documents hold the values a real database can hold. Any
ValueError/TypeError that escapes is a live crash for a user.
"""
import asyncio, sys, types, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bot"))

# ── Stub the driver/config modules before the cog imports them ───────────
# These are replaced UNCONDITIONALLY, never merged into a real module: this
# suite must behave identically whether or not motor/pymongo are installed,
# and it must never mutate a genuinely imported module's __path__.
def _force_stub(name: str, attrs: dict) -> None:
    s = types.ModuleType(name)
    s.__path__ = []  # type: ignore[attr-defined]
    s.__spec__ = None
    for k, v in attrs.items():
        setattr(s, k, v)
    sys.modules[name] = s


for _m, _a in (
    ("dotenv", {"load_dotenv": lambda *a, **k: None}),
    ("pymongo", {"ASCENDING": 1, "DESCENDING": -1, "ReturnDocument": object}),
    ("motor", {}),
    ("motor.motor_asyncio", {"AsyncIOMotorClient": object}),
):
    _force_stub(_m, _a)

cfgmod = types.ModuleType("config")
for k, v in (("DISCORD_TOKEN", "x"), ("MONGO_URI", "mongodb://localhost/x"),
             ("MONGO_DB", "x"), ("BRIDGE_SECRET", "s"), ("DISCORD_CLIENT_ID", "1"),
             ("PREFIX", "mg!"), ("ACTIVITY", "a"), ("STATUS", "online"),
             ("ADMIN_IDS", []), ("BOT_ADMIN_IDS", [])):
    setattr(cfgmod, k, v)
sys.modules["config"] = cfgmod

import discord  # noqa: E402  (real discord.py, so decorators run for real)
import database  # noqa: E402
import leveling_sys as levels  # noqa: E402
import cogs.leveling as cogmod  # noqa: E402

GID, UID = 1001, 3003

# Values a stored document can legitimately hold.
JUNK = [None, "", "   ", "undefined", "null", "NaN", "abc", "-", "1e400", [], {},
        "12.7", "0x10", 1.0, True]


class _Cur:
    def __init__(self, rows): self._rows = rows
    def sort(self, *_a, **_k): return self
    def skip(self, *_a): return self
    def limit(self, n): return self
    async def to_list(self, n=None, *_a): return self._rows[: n or len(self._rows)]


class _Coll:
    def __init__(self, db, name): self._db, self._name = db, name
    async def find_one(self, *_a, **_k): return self._db.docs.get(self._name)
    def find(self, *_a, **_k): return _Cur(self._db.docs.get(self._name + "_rows", []))
    async def count_documents(self, *_a, **_k): return 3
    def update_one(self, *_a, **_k): return self
    async def delete_one(self, *_a, **_k): return types.SimpleNamespace(deleted_count=1)
    async def delete_many(self, *_a, **_k): return types.SimpleNamespace(deleted_count=1)
    async def find_one_and_update(self, query=None, update=None, **kw):
        """motor's is awaitable and returns the document; mirror that."""
        doc = self._db.docs.get(self._name) or {}
        doc = dict(doc)
        inc = (update or {}).get("$inc") or {}
        for k, v in inc.items():
            doc[k] = (doc.get(k) or 0) + v
        return doc

    async def insert_one(self, *_a, **_k): return types.SimpleNamespace(inserted_id="1")

    def aggregate(self, _pipeline=None):
        return _Cur(self._db.docs.get(self._name + "_rows", []))

    def update_many(self, *_a, **_k): return self
    async def find_one_and_delete(self, *_a, **_k):
        return self._db.docs.get(self._name)


class FakeDB:
    def __init__(self, **docs):
        self.docs = docs
        for n in ("xp", "guild_config", "economy", "economy_inv",
                  "xp_backups", "level_events", "currency_log"):
            setattr(self, n, _Coll(self, n))


class FakeMember:
    id = UID
    name = "user"
    display_name = "user"
    managed = False
    roles: list = []
    guild_permissions = types.SimpleNamespace(manage_roles=True, manage_guild=True,
                                              administrator=False)
    def __len__(self): return 1
    def __str__(self): return f"<@{UID}>"

    @property
    def mention(self): return f"<@{UID}>"
    display_avatar = types.SimpleNamespace(url="https://x/avatar.png")
    name = "user"
    bot = False


class FakeResponse:
    def __init__(self): self.done = False
    async def defer(self, *_a, **_k): self.done = True
    async def send_message(self, *_a, **_k): self.done = True


class FakeFollowup:
    def __init__(self): self.sent = []
    async def send(self, *a, **k): self.sent.append((a, k))


class FakeUser:
    """Enough of discord.User/Member for the display paths these handlers use."""
    id = UID
    name = "user"
    global_name = "user"
    display_name = "user"
    nick = None
    bot = False
    roles: list = []
    guild_permissions = types.SimpleNamespace(manage_roles=True, manage_guild=True,
                                              administrator=False)
    display_avatar = types.SimpleNamespace(url="https://x/avatar.png")

    def __str__(self): return f"<@{UID}>"

    @property
    def mention(self): return f"<@{UID}>"


class FakeInteraction:
    def __init__(self, guild_id=GID, user_id=UID):
        self.guild_id = guild_id
        self.user = FakeUser()
        self.guild = types.SimpleNamespace(id=guild_id, me=None, name="G",
                                           get_channel=lambda i: None,
                                           get_role=lambda i: None)
        self.channel = types.SimpleNamespace(id=99)
        self.response = FakeResponse()
        self.followup = FakeFollowup()
        self.user_permissions = types.SimpleNamespace(manage_guild=True,
                                                      administrator=True)


def make_cog():
    cog = object.__new__(cogmod.LevelingCog)      # skip __init__ (starts task loop)
    cog.bot = types.SimpleNamespace(guilds=[])
    cog._xp_bucket = {}
    return cog


def handler(cog, name):
    """Resolve a cog attribute to the plain coroutine function.

    @app_commands.command / @group.command replace the method with a
    Command object, so the attribute is not directly callable. .callback is
    the undecorated function.
    """
    attr = getattr(cog, name)
    if isinstance(attr, (discord.app_commands.Command,
                         discord.app_commands.Group)):
        attr = attr.callback
        if attr is None:                            # a Group: no callable body
            raise AttributeError(f"{name} is a group, not a command")
    return attr.__get__(cog)


async def run_case(label, fn, **docs):
    database._db = FakeDB(**docs)
    try:
        await fn()
        return True, ""
    except (ValueError, TypeError) as exc:
        return False, f"{type(exc).__name__}: {exc}"


async def main():
    cog = make_cog()
    cases = []

    # /level with an XP row holding every junk shape in turn.
    for value in JUNK + [1500, "1500", 0, -5]:
        cases.append((f"/level xp={value!r}",
                      run_case("x", lambda v=value: handler(cog, "level_card")(
                          FakeInteraction(), None), **{"xp": {"xp": v}})))

    # /level with a whole stored guild config of junk.
    for value in JUNK:
        for field in ("cardOpacity", "cardColor", "serverBackground"):
            def _card(v=value, f=field):
                return handler(cog, "level_card")(FakeInteraction(), None)
            cases.append((f"/level {field}={value!r}",
                          run_case("x", _card,
                          **{"guild_config": {"leveling": {field: value}}})))

    # /rank
    for value in JUNK + [1500]:
        cases.append((f"/rank xp={value!r}",
                      run_case("x", lambda v=value: handler(cog, "rank")(
                          FakeInteraction(), None), **{"xp": {"xp": v}})))

    # Leaderboards: xp board and the economy boards.
    for value in JUNK + [1500]:
        cases.append((f"/level leaderboard xp row={value!r}",
                      run_case("x", lambda v=value: handler(cog, "level_board")(
                          FakeInteraction(), 1),
                      **{"xp_rows": [{"xp": v, "userId": UID}]})))
        cases.append((f"/leaderboard stats net row={value!r}",
                      run_case("x", lambda v=value: handler(cog, "board_stats")(
                          FakeInteraction(), "net", 1, "server"),
                      **{"economy_rows": [{"balance": v, "bank": v,
                                            "userId": UID}]})))
        cases.append((f"/leaderboard stats gems row={value!r}",
                      run_case("x", lambda v=value: handler(cog, "board_stats")(
                          FakeInteraction(), "gems", 1, "server"),
                      **{"economy_rows": [{"gems": v, "userId": UID}]})))

    # /balance and the fallback branch that re-reads the wallet.
    for value in JUNK + [100]:
        cases.append((f"/balance wallet={value!r}",
                      run_case("x", lambda v=value: handler(cog, "balance")(
                          FakeInteraction(), None, False),
                      **{"economy": {"balance": v, "bank": v}})))

    # /leveling config + log
    for value in JUNK:
        cases.append((f"/leveling config announceMod={value!r}",
                      run_case("x", lambda v=value: handler(cog, "level_config")(
                          FakeInteraction()),
                      **{"guild_config": {"leveling": {"announceMod": v,
                                                      "xpMin": v, "xpMax": v}}})))

    results = []
    for name, coro in cases:
        ok, detail = await coro
        results.append((name, ok, detail))

    failed = [(n, d) for n, ok, d in results if not ok]

    print(f"executed {len(results)} real handler invocations with adversarial data")
    if failed:
        print(f"\n{len(failed)} CRASHED:")
        for name, detail in failed:
            print(f"  FAIL {name}\n       {detail}")
        return 1
    print("no ValueError/TypeError escaped any handler")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
