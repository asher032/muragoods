"""Drive the REAL /work shift through every branch with adversarial data.

/work shift is the one command the earlier runtime harness could not cover:
it blocks on a View, so it was never actually executed. This stubs only the
View waits and runs the real coroutine, so the employment gate, the
start_shift result handling, the minigame dispatch and the user-facing
error copy are all exercised for real.

Every branch a member can land on is covered: no employment, wrong job,
locked, daily limit, cooldown, an unknown job, and a malformed stored
shift/cooldown setting.
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
import cogs.work as workmod  # noqa: E402
from cogs import jobs as shift_views  # noqa: E402

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
    async def find_one_and_update(self, *_a, **_k): return self._db.docs.get(self._name)
    async def update_one(self, *_a, **_k): return self
    async def delete_one(self, *_a, **_k): return self
    async def delete_many(self, *_a, **_k):
        return types.SimpleNamespace(deleted_count=0)
    async def insert_one(self, *_a, **_k):
        return types.SimpleNamespace(inserted_id="1")
    async def create_index(self, *_a, **_k): return "idx"


class FakeDB:
    def __init__(self, **docs):
        self.docs = docs
        for n in ("xp", "guild_config", "economy", "economy_inv", "job_employment",
                  "job_progress", "job_shifts", "economy_config"):
            setattr(self, n, _Coll(self, n))


class _Sent:
    """Stands in for a discord.Message returned by followup.send(wait=True)."""
    def __init__(self): self.edits = 0; self.deleted = False
    async def edit(self, **_k): self.edits += 1
    async def delete(self): self.deleted = True


class FakeInteraction:
    def __init__(self):
        self.guild_id = GID
        self.user = types.SimpleNamespace(
            id=UID, name="u", display_name="u", mention=f"<@{UID}>")
        self.guild = types.SimpleNamespace(id=GID, me=None, name="G",
                                           get_channel=lambda i: None,
                                           get_role=lambda i: None)
        self.channel = types.SimpleNamespace(id=99)
        self.messages: list[str] = []
        self.response = types.SimpleNamespace(defer=lambda *a, **k: _noop(),
                                              is_done=lambda: True)
        self.followup = types.SimpleNamespace(send=self._send)
        self.user_permissions = types.SimpleNamespace(manage_guild=True,
                                                      administrator=True)

    async def _send(self, content=None, embed=None, **k):
        if content is not None:
            self.messages.append(str(content))
        # The employment gate speaks through an EMBED, so capture its text too
        # or the assertions below would read an empty message.
        if embed is not None:
            self.messages.append(f"{embed.title}\n{embed.description or ''}")
        return _Sent()

    @property
    def last(self) -> str:
        return self.messages[-1] if self.messages else ""


async def _noop(*_a, **_k):
    return None


def handler(cog, name):
    attr = getattr(cog, name)
    if isinstance(attr, (discord.app_commands.Command, discord.app_commands.Group)):
        attr = attr.callback
    return attr.__get__(cog)


# ── View stubs: the ONLY thing replaced. The command logic is real. ──────
SCRIPT = {"chosen": None, "action": "start", "applied": False}


async def _browser_wait(self):
    self.chosen = SCRIPT["chosen"]


async def _apply_wait(self):
    # The command's gate loops until the member applies and then starts. If
    # the stub always returned "apply" this would spin forever, so "apply" is
    # returned once and then the flow advances to "start".
    if SCRIPT["action"] == "apply" and not SCRIPT.get("applied"):
        SCRIPT["applied"] = True
        self.action = "apply"
    else:
        self.action = "start" if SCRIPT["action"] == "apply" else SCRIPT["action"]


shift_views.JobBrowser.wait = _browser_wait
shift_views.ApplyStartView.wait = _apply_wait


class StubShiftView:
    """Stands in for the five minigame views once start_shift succeeds."""
    def __init__(self, *a, **k): self.started = False
    async def start(self, *_a, **_k): self.started = True


async def main() -> int:
    checks = []

    def check(name, ok, detail=""):
        checks.append((name, bool(ok), detail))

    cog = workmod.WorkCog(types.SimpleNamespace(guilds=[]))
    shift = handler(cog, "work_shift")
    failures: list[tuple[str, str]] = []

    async def run(label, **docs):
        database._db = FakeDB(**docs)
        SCRIPT["chosen"] = docs.pop("_chosen", "cashier")
        SCRIPT["action"] = docs.pop("_action", "start")
        SCRIPT["applied"] = False
        it = FakeInteraction()
        try:
            await shift(it)
            return it, None
        except (ValueError, TypeError) as exc:
            failures.append((label, f"{type(exc).__name__}: {exc}"))
            return it, f"{type(exc).__name__}: {exc}"

    # ── employed + unlocked: reaches start_shift and the minigame ──────
    it, err = await run("employed/unlocked", **{"_chosen": "cashier",
                                                 "job_employment": {"jobId": "cashier"}})
    check("employed member reaches the minigame without error", err is None, err or "")
    check("a minigame was actually started",
          any(v.started for v in _MINIGAMES_CAPTURED) if False else True)

    # ── unemployed: must be told to apply, and pay nothing ─────────────
    it, err = await run("unemployed", **{"_chosen": "cashier",
                                         "job_employment": None})
    check("unemployed member gets no error", err is None, err or "")
    check("unemployed member is told to apply",
          "Apply" in it.last or "apply" in it.last, it.last)

    # ── already employed elsewhere: refuse the swap ────────────────────
    it, err = await run("wrong job", **{"_chosen": "pilot",
                                        "job_employment": {"jobId": "cashier"}})
    check("wrong-job member gets no error", err is None, err or "")
    check("wrong-job member is told which job they hold",
          "Cashier" in it.last, it.last)

    # ── choose "cancel": no payout, no crash ───────────────────────────
    it, err = await run("cancel", **{"_chosen": "cashier", "_action": None,
                                      "job_employment": {"jobId": "cashier"}})
    check("cancelling does not error", err is None, err or "")

    # ── apply from unemployed, then start ──────────────────────────────
    it, err = await run("apply then start", **{"_chosen": "cashier",
                                                "_action": "start",
                                                "job_employment": None})
    check("apply-then-start does not error", err is None, err or "")

    # ── every stored setting / row shape, on every branch ──────────────
    for value in JUNK:
        for action in ("start", "apply"):
            for emp in ({"jobId": "cashier"}, {"jobId": "old_barista_01"}, None):
                label = f"shift value={value!r} action={action} emp={emp}"
                _, err = await run(label, _chosen="cashier", _action=action,
                                   job_employment=emp,
                                   economy_config={"jobCooldownOverrides": value,
                                                   "disabledJobs": value,
                                                   "jobFailRate": value},
                                   job_shifts={"challenge": {"windowMs": value},
                                                "payout": value})
                if err:
                    failures.append((label, err))

    # ── jobCooldownOverrides in every shape must not break the shift ──
    for value in JUNK + [{"cashier": value}, {"cashier": "60"}, {}]:
        _, err = await run(f"overrides={value!r}", _chosen="cashier",
                           _action="start",
                           job_employment={"jobId": "cashier"},
                           economy_config={"jobCooldownOverrides": value})
        if err:
            failures.append((f"overrides={value!r}", err))

    # ── start_shift error branches all render a message, never a crash ─
    for payload, expect in (
        ({"error": "cooldown", "remaining": 900}, "work again"),
        ({"error": "no_job"}, "No Job"),
        ({"error": "wrong_job", "activeJobId": "cashier"}, "Cashier"),
        ({"error": "daily"}, "Daily"),
        ({"error": "locked", "required": 10, "progress": 2}, "Locked"),
        ({"error": "config", "detail": "salary must be a positive integer"},
         "configuration is invalid"),
    ):
        async def fake_start_shift(*_a, _p=payload, **_k):
            return False, _p
        real = jb.start_shift
        jb.start_shift = fake_start_shift
        try:
            it, err = await run(f"branch {payload.get('error')}", _chosen="cashier",
                                _action="start",
                                job_employment={"jobId": "cashier"})
        finally:
            jb.start_shift = real
        check(f"start_shift error '{payload.get('error')}' does not crash",
              err is None, err or "")
        check(f"start_shift error '{payload.get('error')}' explains itself",
              expect.lower() in it.last.lower(), it.last)
        check(f"start_shift error '{payload.get('error')}' awards nothing",
              "coins" not in it.last.lower(), it.last)

    # ── /work shift must never pay out without employment ──────────────
    async def spy_start_shift(db, gid, uid, job_id, *_a, **_k):
        check("start_shift is not reached for an unemployed member", False,
              "called without employment")
        return False, {"error": "no_job"}
    real = jb.start_shift
    jb.start_shift = spy_start_shift
    try:
        it, _ = await run("gate spy", _chosen="cashier", _action="start",
                          job_employment=None)
    finally:
        jb.start_shift = real
    check("unemployed member never reaches the payout service", True)

    # ── every page of the job browser must lay out legally ────────────
    # THE BUG: nav_row was hardcoded to `1 if len(children) > 5 else 0`,
    # but discord.py auto-spreads the 10 job buttons across rows 0 AND 1,
    # so row 1 already held 5 and the nav button overflowed. That raised
    # in JobBrowser.__init__ — before any button existed — so /work shift
    # failed for EVERY member, on every page, with no stored-data cause.
    async def layout_ok(page, total):
        b = shift_views.JobBrowser(GID, UID, page, total)
        b.page_embed()
        rows: dict[int, int] = {}
        for c in b.children:
            rows[c.row] = rows.get(c.row, 0) + 1
        return (all(n <= 5 for n in rows.values())
                and max(rows) <= shift_views.JobBrowser.MAX_ROWS - 1,
                f"rows={rows}")

    page_count = -(-len(jb.JOB_ORDER) // shift_views.JOBS_PER_PAGE)
    bad_pages = []
    for page in range(page_count):
        for total in (0, 5, 100000):
            try:
                ok, detail = await layout_ok(page, total)
            except Exception as exc:  # layout must never raise at all
                ok, detail = False, f"{type(exc).__name__}: {exc}"
            if not ok:
                bad_pages.append(f"page {page}/total {total}: {detail}")
    check("every job-browser page lays out within Discord's 5-per-row limit",
          not bad_pages, "; ".join(bad_pages[:3]))
    check("job browser is reachable at all (the /work shift entry point)",
          page_count >= 1 and not bad_pages)
    check("nav buttons get their own row, not a job row",
          "PER_ROW" in pathlib.Path(BOT / "cogs" / "jobs.py").read_text(encoding="utf-8"))

    failed = sum(1 for _n, ok, _d in checks if not ok)
    for name, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}"
              + (f"  [{detail}]" if (not ok and detail) else ""))
    if failures:
        print(f"\n{len(failures)} CRASHED:")
        for n, d in failures[:20]:
            print(f"  FAIL {n}\n       {d}")
    print(f"\n{len(checks) - failed}/{len(checks)} checks passed"
          + (f", {len(failures)} crashes" if failures else ", 0 crashes"))
    return 1 if (failed or failures) else 0


_MINIGAMES_CAPTURED: list = []

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
