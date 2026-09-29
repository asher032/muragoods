"""CI guard: employment gating + the /level command contract.

Jobs are application-gated: an unemployed user must never open a mini-game
or receive a salary, employment is re-validated at completion (resign /
firing / job change mid-shift voids the payout), and resignation/firing
clears the active job. The /level card command must be a ROOT command with
an OPTIONAL member argument (bare `/level` = your own card), with admin
subcommands under the /leveling group and no duplicate `level` definitions.

Hermetic: bot/jobs.py is stdlib-only, so a stub async DB exercises the real
gate code. No network, no Mongo, no discord.py required.
"""

import asyncio
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bot"))

import jobs as jb  # noqa: E402  (bot/jobs.py — stdlib-only)

GID, UID = 111, 222


# ── Minimal Mongo-ish async stub ──────────────────────────────────────────
def _match(doc: dict, query: dict) -> bool:
    for key, cond in query.items():
        val = doc.get(key)
        if isinstance(cond, dict) and any(str(k).startswith("$") for k in cond):
            for op, operand in cond.items():
                if val is None and op in ("$gt", "$gte", "$lt", "$lte"):
                    return False
                if op == "$gt" and not val > operand:
                    return False
                if op == "$gte" and not val >= operand:
                    return False
                if op == "$lt" and not val < operand:
                    return False
                if op == "$lte" and not val <= operand:
                    return False
        elif val != cond:
            return False
    return True


def _apply(doc: dict, update: dict, inserting: bool = False) -> None:
    for key, val in (update.get("$set") or {}).items():
        doc[key] = val
    for key, val in (update.get("$setOnInsert") or {}).items():
        if inserting:
            doc.setdefault(key, val)
    for key, val in (update.get("$inc") or {}).items():
        doc[key] = doc.get(key, 0) + val


class _Result:
    def __init__(self, n: int):
        self.deleted_count = n


class Coll:
    def __init__(self) -> None:
        self.docs: list[dict] = []
        self.inserted = 0

    async def find_one(self, query, sort=None, **_):
        hits = [d for d in self.docs if _match(d, query)]
        if sort:
            key, direction = sort[0]
            epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
            hits = sorted(hits, key=lambda d: d.get(key) or epoch,
                          reverse=int(direction) == -1)
        return dict(hits[0]) if hits else None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        self.inserted += 1

    async def count_documents(self, query) -> int:
        return sum(1 for d in self.docs if _match(d, query))

    async def update_one(self, query, update, upsert: bool = False):
        for doc in self.docs:
            if _match(doc, query):
                _apply(doc, update)
                return
        if upsert:
            doc = {k: v for k, v in query.items() if not isinstance(v, dict)}
            _apply(doc, update, inserting=True)
            self.docs.append(doc)

    async def find_one_and_update(self, query, update,
                                  return_document: bool = False, upsert: bool = False):
        for doc in self.docs:
            if _match(doc, query):
                _apply(doc, update)
                return dict(doc) if return_document else None
        if upsert:
            doc = {k: v for k, v in query.items() if not isinstance(v, dict)}
            _apply(doc, update, inserting=True)
            self.docs.append(doc)
            return dict(doc) if return_document else None
        return None

    async def delete_one(self, query) -> _Result:
        for i, doc in enumerate(self.docs):
            if _match(doc, query):
                del self.docs[i]
                return _Result(1)
        return _Result(0)

    async def create_index(self, *_, **__):
        return None


class StubDB:
    def __init__(self) -> None:
        self.job_shifts = Coll()
        self.job_progress = Coll()
        self.job_employment = Coll()
        self.economy = Coll()


PLAYABLE = {"order", "memory", "choice"}


def _find_job() -> dict:
    """First unlock-0 job with a win/fail attempt this test can craft."""
    for jid in jb.JOB_ORDER:
        job = jb.JOBS[jid]
        if int(job["unlock"]) == 0 and job["game"] in PLAYABLE:
            return job
    raise AssertionError("no unlock-0 playable job in catalog")


def _second_job() -> dict | None:
    for jid in jb.JOB_ORDER:
        cand = jb.JOBS[jid]
        if cand["id"] != _find_job()["id"] and int(cand["unlock"]) == 0 \
                and cand["game"] in PLAYABLE:
            return cand
    return None


def _win_attempt(job: dict, ch: dict) -> dict:
    game = job["game"]
    if game == "order":
        return {"clicks": list(ch.get("answer") or []), "elapsedMs": 6000}
    if game == "memory":
        pool = ch.get("pool") or []
        return {"clicks": [pool.index(i) for i in (ch.get("icons") or [])],
                "elapsedMs": 6000}
    if game == "choice":
        return {"pick": int(ch.get("correct", 0)), "elapsedMs": 6000}
    raise AssertionError(f"add a win attempt for game {game!r}")


def _fail_attempt(job: dict, ch: dict) -> dict:
    game = job["game"]
    if game == "order":
        answer = list(ch.get("answer") or [])
        # Right length, wrong order → guaranteed failure (not too_fast).
        return {"clicks": list(reversed(answer)) if len(answer) > 1
                else [answer[0] + 1 if answer else 0], "elapsedMs": 6000}
    if game == "memory":
        return {"clicks": [0] * len(ch.get("icons") or [0]), "elapsedMs": 6000}
    if game == "choice":
        opts = ch.get("options") or [0, 1]
        wrong = [i for i in range(len(opts)) if i != int(ch.get("correct", -1))]
        return {"pick": wrong[0] if wrong else 0, "elapsedMs": 6000}
    raise AssertionError(f"add a fail attempt for game {game!r}")


async def main() -> int:
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append((name, ok, detail))

    db = StubDB()
    job = _find_job()
    other = _second_job()

    # 1. Unemployed → no shift, no mini-game.
    ok, payload = await jb.start_shift(db, GID, UID, job["id"])
    check("unemployed start refused (no_job)",
          not ok and payload.get("error") == "no_job", str(payload))
    check("no shift row created for unemployed", db.job_shifts.inserted == 0)

    # 2. Application → employed → shift opens.
    ok, res = await jb.apply_for_job(db, GID, UID, job["id"])
    check("application accepted", ok and res.get("changed") is True, str(res))
    check("employment stored", await jb.get_employment(db, GID, UID) == job["id"])
    ok, payload = await jb.start_shift(db, GID, UID, job["id"])
    check("employed start opens a shift", ok and bool(payload.get("token")),
          str(payload))
    token = payload.get("token", "")
    ch = payload.get("challenge") or {}
    ok, payload = await jb.start_shift(db, GID, UID, job["id"])
    check("second live shift refused", not ok, str(payload))

    # 3. Resign mid-shift → completion pays NOTHING (shift stays spent-safe).
    ok, res = await jb.resign(db, GID, UID, job["id"])
    check("resign reports unemployment", ok and res.get("unemployed") is True,
          str(res))
    check("employment cleared by resign",
          await jb.get_employment(db, GID, UID) is None)

    paid_amounts: list[int] = []

    async def credit(amount: int):
        paid_amounts.append(amount)
        return amount, {}

    ok, res = await jb.complete_shift(db, GID, UID, token,
                                      _win_attempt(job, ch), credit)
    check("no salary without an active job",
          not ok and "no longer have a job" in str(res.get("error")),
          str(res))
    check("credit never called while unemployed", paid_amounts == [])

    # 4. Re-apply → same shift completes and pays EXACTLY once.
    ok, _ = await jb.apply_for_job(db, GID, UID, job["id"])
    check("re-application accepted", ok)
    ok, res = await jb.complete_shift(db, GID, UID, token,
                                      _win_attempt(job, ch), credit)
    check("employed completion pays", ok and res.get("won") is True, str(res))
    check("paid exactly once", len(paid_amounts) == 1
          and paid_amounts[0] == jb.success_payout(job, 0), str(paid_amounts))
    ok, res = await jb.complete_shift(db, GID, UID, token,
                                      _win_attempt(job, ch), credit)
    check("replay refused (no double pay)", not ok, str(res))
    check("still paid exactly once", len(paid_amounts) == 1)

    # 5. Employed in another job → only THAT job can be worked.
    if other is not None:
        ok, _ = await jb.apply_for_job(db, GID, UID, other["id"])
        check("switch to second job", ok)
        ok, payload = await jb.start_shift(db, GID, UID, job["id"])
        check("wrong job refused (wrong_job)",
              not ok and payload.get("error") == "wrong_job", str(payload))
        ok, _ = await jb.apply_for_job(db, GID, UID, job["id"])
        check("switch back", ok)

    # 6. Firing (5 straight failures) clears employment. Fresh "day" of
    # shift history first so daily/cooldown limits cannot mask the gate.
    db.job_shifts.docs.clear()
    db.job_progress.docs = [d for d in db.job_progress.docs
                            if not (d.get("jobId") == job["id"]
                                    and d.get("userId") == UID)]
    seed = 4  # FIRED_STREAK - 1 consecutive fails already on record
    db.job_progress.docs.append({
        "guildId": GID, "userId": UID, "jobId": job["id"],
        "successes": 0, "fails": seed, "totalShifts": seed,
        "consecutiveFails": seed, "firedCount": 0,
    })
    ok, payload = await jb.start_shift(db, GID, UID, job["id"])
    check("shift opens before firing", ok, str(payload))
    if ok:
        ok, res = await jb.complete_shift(db, GID, UID, payload["token"],
                                          _fail_attempt(job, payload["challenge"]),
                                          credit)
        check("failing shift completes with loss",
              ok and res.get("won") is False and res.get("fired") is True,
              str(res))
        check("fired → employment cleared",
              await jb.get_employment(db, GID, UID) is None)
        ok, payload = await jb.start_shift(db, GID, UID, job["id"])
        check("fired user cannot start shifts",
              not ok and payload.get("error") == "no_job", str(payload))

    # ── /level command contract (source scan) ─────────────────────────────
    cogs = ROOT / "bot" / "cogs"
    leveling_src = (cogs / "leveling.py").read_text(encoding="utf-8")
    check("admin group renamed to /leveling",
          'app_commands.Group(name="leveling"' in leveling_src
          and 'app_commands.Group(name="level"' not in leveling_src)
    check("/level is a ROOT command",
          '@app_commands.command(name="level"' in leveling_src)
    check("member option is optional (default = invoker)",
          re.search(r'@app_commands\.command\(name="level".*?'
                    r'member: discord\.Member \| None = None',
                    leveling_src, re.S) is not None)
    check("old /level member subcommand removed",
          '@level.command(name="member"' not in leveling_src)
    roots: dict[str, str] = {}
    dupes: list[str] = []
    for path in sorted(cogs.glob("*.py")):
        for name in re.findall(r'@app_commands\.command\(name="([^"]+)"',
                               path.read_text(encoding="utf-8")):
            if name in roots:
                dupes.append(f"{name}: {roots[name]} + {path.name}")
            roots[name] = path.name
    check("no duplicate root 'level' command", "level" not in roots or
          roots.get("level") == "leveling.py", str(dupes))
    check("no duplicate command names", not dupes, str(dupes))

    # ── Level card readability layer (source scan) ───────────────────────
    leveling_sys = (ROOT / "bot" / "leveling_sys.py").read_text(encoding="utf-8")
    check("card background gets a luminance-scaled shade overlay",
          "ImageStat" in leveling_sys and "shade_alpha" in leveling_sys)
    check("card text drawn with an outline (text stroke)",
          leveling_sys.count("stroke_width") >= 3)
    check("progress bar outlined for contrast",
          "rounded_rectangle((220, 165, 840, 200), radius=14, outline=" in leveling_sys)
    check("no hardcoded background URL added to the card renderer",
          "https://" not in leveling_sys)

    # Gates wired into the command layer (not just the library).
    jobs_cog = (cogs / "jobs.py").read_text(encoding="utf-8")
    work_cog = (cogs / "work.py").read_text(encoding="utf-8")
    check("jobs cog applies employment before shifting",
          "get_employment" in jobs_cog and "apply_for_job" in jobs_cog)
    check("work cog gates /work shift on employment",
          "get_employment" in work_cog)

    failed = 0
    for name, ok_flag, detail in checks:
        print(f"{'PASS' if ok_flag else 'FAIL'}  {name}"
              + (f"  [{detail}]" if (not ok_flag and detail) else ""))
        if not ok_flag:
            failed += 1
    print(f"\n{len(checks) - failed}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
