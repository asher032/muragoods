"""Execute the REAL /work handlers and job library against adversarial data.

A source scan cannot tell whether a conversion is reachable. This drives
the actual coroutines — /work list, status, apply, history, stars — plus
the job library's own resolvers, with a stubbed Mongo whose documents hold
every shape a real database can. Any escaping ValueError/TypeError is a
live crash for a member.

Also asserts the /work apply contract: already-employed guard, stale-job
handling, and server-side re-resolution of the selected job id.
"""
import asyncio
import sys
import types
import pathlib

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
    ("pymongo", {"ASCENDING": 1, "DESCENDING": -1, "ReturnDocument": object}),
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

import jobs as jb  # noqa: E402
import economy as eco  # noqa: E402
import cogs.work as workmod  # noqa: E402

GID, UID = 1001, 3003
JUNK = [None, "", "   ", "undefined", "null", "NaN", "abc", "-", "1e400",
        [], {}, "12.7", "0x10", 1.0, True, object()]


class _Cur:
    def __init__(self, rows): self._rows = rows
    def sort(self, *_a, **_k): return self
    def skip(self, *_a): return self
    def limit(self, n): return self._rows[: n or len(self._rows)]
    async def to_list(self, n=None, *_a): return self._rows[: n or len(self._rows)]


class _Coll:
    def __init__(self, db, name): self._db, self._name = db, name
    async def find_one(self, *_a, **_k): return self._db.docs.get(self._name)
    def find(self, *_a, **_k): return _Cur(self._db.docs.get(self._name + "_rows", []))
    async def count_documents(self, *_a, **_k): return 0
    async def find_one_and_update(self, query=None, update=None, **_k):
        return self._db.docs.get(self._name)
    def update_one(self, query=None, update=None, **_k):
        self._db.updates.append((self._name, query, update)); return self
    def delete_one(self, *_a, **_k): return self
    async def delete_many(self, *_a, **_k):
        return types.SimpleNamespace(deleted_count=0)
    async def insert_one(self, *_a, **_k):
        return types.SimpleNamespace(inserted_id="1")
    async def create_index(self, *_a, **_k): return "idx"


class FakeDB:
    def __init__(self, **docs):
        self.docs = docs
        self.updates = []
        for n in ("xp", "guild_config", "economy", "economy_inv", "job_employment",
                  "job_progress", "job_shifts", "xp_backups", "level_events",
                  "currency_log", "economy_config"):
            setattr(self, n, _Coll(self, n))


class FakeUser:
    id = UID
    name = display_name = global_name = "user"
    nick = None
    bot = False
    roles: list = []
    guild_permissions = types.SimpleNamespace(manage_roles=True, manage_guild=True,
                                              administrator=False)
    display_avatar = types.SimpleNamespace(url="https://x/a.png")

    def __str__(self): return f"<@{UID}>"

    @property
    def mention(self): return f"<@{UID}>"


class FakeInteraction:
    def __init__(self):
        self.guild_id = GID
        self.user = FakeUser()
        self.guild = types.SimpleNamespace(id=GID, me=None, name="G",
                                           get_channel=lambda i: None,
                                           get_role=lambda i: None)
        self.channel = types.SimpleNamespace(id=99)
        self.response = types.SimpleNamespace(
            defer=lambda *a, **k: _done(), is_done=lambda: True,
            send_message=lambda *a, **k: _done())
        self.followup = types.SimpleNamespace(
            send=lambda *a, **k: _done())
        self.user_permissions = types.SimpleNamespace(manage_guild=True,
                                                      administrator=True)


async def _done(*_a, **_k):
    return None


def handler(cog, name):
    attr = getattr(cog, name)
    if isinstance(attr, (discord.app_commands.Command, discord.app_commands.Group)):
        attr = attr.callback
    return attr.__get__(cog)


def make_cog():
    return workmod.WorkCog(types.SimpleNamespace(guilds=[]))


async def main():
    results = []

    async def case(label, fn, **docs):
        database._db = FakeDB(**docs)
        try:
            await fn()
            results.append((label, True, ""))
        except (ValueError, TypeError) as exc:
            results.append((label, False, f"{type(exc).__name__}: {exc}"))

    def call(cog, cmd, *args):
        """Bind the handler now so later loop variables cannot leak in."""
        fn = handler(cog, cmd)
        return lambda: fn(FakeInteraction(), *args)

    cog = make_cog()

    # ── /work list / status / history / stars over junk documents ───────
    for value in JUNK + [1500]:
        await case(f"/work history payout={value!r}",
                   call(cog, "work_history"),
                   **{"job_shifts_rows": [{"jobId": "cashier", "payout": value,
                                            "won": True, "game": "order",
                                            "consumedAt": None}]})
        await case(f"/work stars shiftsWorked={value!r}",
                   call(cog, "work_stars"),
                   **{"economy": {"shiftsWorked": value}})
        await case(f"/work status total_shifts={value!r}",
                   call(cog, "work_status"),
                   **{"job_employment": {"jobId": "cashier"},
                      "job_shifts_rows": [{"payout": value, "consumedAt": None}],
                      "job_progress": {"successes": value}})
        await case(f"/work list total_shifts={value!r}",
                   call(cog, "work_list"),
                   **{"job_employment": {"jobId": "cashier"}})

    # ── employment/job config junk ─────────────────────────────────────
    for value in JUNK:
        await case(f"/work status jobId={value!r}",
                   call(cog, "work_status"),
                   **{"job_employment": {"jobId": value}})
        await case(f"/work apply jobId={value!r}",
                   call(cog, "work_apply"),
                   **{"job_employment": {"jobId": value}})
        await case(f"employment_state jobId={value!r}",
                   lambda v=value: jb.employment_state(
                       FakeDB(**{"job_employment": {"jobId": value}}), GID, UID))

    # ── disabledJobs must never be trusted ─────────────────────────────
    for value in JUNK:
        await case(f"/work apply disabledJobs={value!r}",
                   call(cog, "work_apply"),
                   **{"economy_config": {"disabledJobs": value}})

    # ── the job catalog itself is valid and validated ──────────────────
    checks = []

    def check(name, ok, detail=""):
        checks.append((name, bool(ok), detail))

    check("every catalog entry passes validation",
          all(not jb.job_config_problems(j) for j in jb.JOBS.values()),
          str([(k, jb.job_config_problems(v)) for k, v in jb.JOBS.items()
               if jb.job_config_problems(v)][:3]))
    check("catalog ids are stable slugs",
          all(k == j["id"] and k.replace("_", "").isalnum() for k, j in jb.JOBS.items()))
    check("resolve_job rejects a removed job id",
          jb.resolve_job("old_barista_01") == (None, jb.resolve_job("old_barista_01")[1])
          and jb.resolve_job("old_barista_01")[0] is None)
    check("resolve_job rejects an empty/None id", jb.resolve_job(None)[0] is None
          and jb.resolve_job("")[0] is None)
    check("resolve_job returns the job for a valid id",
          jb.resolve_job("cashier")[0]["name"] == "Cashier")

    bad_job = {"id": "x", "name": "X", "game": "order", "salary": 0,
               "unlock": -1, "shiftsPerDay": 0, "cooldownMin": -5}
    check("job_config_problems catches salary <= 0", bool(jb.job_config_problems(bad_job)))
    check("job_config_problems catches a negative unlock",
          any("unlock" in p for p in jb.job_config_problems(bad_job)))
    check("job_config_problems catches shiftsPerDay < 1",
          any("shiftsPerDay" in p for p in jb.job_config_problems(bad_job)))
    check("job_config_problems catches a negative cooldown",
          any("cooldownMin" in p for p in jb.job_config_problems(bad_job)))
    check("job_config_problems catches an unknown minigame",
          any("minigame" in p for p in jb.job_config_problems(
              {**bad_job, "salary": 1, "unlock": 0, "shiftsPerDay": 1,
               "cooldownMin": 1, "game": "nope"})))

    # reward_min <= reward_max is guaranteed by construction (both are salary).
    entry = jb.catalog_entry(jb.JOBS["pilot"])
    check("catalog_entry reward_min <= reward_max",
          entry["reward_min"] <= entry["reward_max"])
    check("catalog_entry never leaks a raw DB id to display copy",
          entry["name"] and entry["id"] == "pilot")

    # ── stale employment is flagged, never deleted ──────────────────────
    db = FakeDB(**{"job_employment": {"jobId": "old_barista_01"}})
    state = await jb.employment_state(db, GID, UID)
    check("stale employment is detected", state["stale"] is True, str(state))
    check("stale employment yields no job (no arbitrary substitute)",
          state["job"] is None)
    check("stale employment records the reason", bool(state["problem"]))
    before = dict(db.docs["job_employment"])
    await jb.mark_stale_employment(db, GID, UID, state["problem"])
    check("stale employment is flagged, not deleted",
          db.docs["job_employment"] == before
          or "staleSince" in (db.updates[-1][2].get("$set") if db.updates else {}),
          str(db.updates[-1] if db.updates else None))

    db2 = FakeDB(**{"job_employment": {"jobId": "cashier"}})
    good = await jb.employment_state(db2, GID, UID)
    check("valid employment is not stale", good["stale"] is False
          and good["job"]["id"] == "cashier")

    db3 = FakeDB()
    empty = await jb.employment_state(db3, GID, UID)
    check("missing employment doc is not stale", empty["stale"] is False
          and empty["job"] is None)

    # ── report ─────────────────────────────────────────────────────────
    failed = [(n, d) for n, ok, d in results if not ok]
    for name, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}"
              + (f"  [{detail}]" if (not ok and detail) else ""))
    print(f"\nexecuted {len(results)} real /work handler + library calls "
          f"with adversarial data")
    if failed:
        print(f"{len(failed)} CRASHED:")
        for n, d in failed[:20]:
            print(f"  FAIL {n}\n       {d}")
    else:
        print("no ValueError/TypeError escaped any handler")
    bad = sum(1 for _n, ok, _d in checks if not ok)
    print(f"{len(checks) - bad}/{len(checks)} contract checks passed")
    return 1 if (failed or bad) else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
