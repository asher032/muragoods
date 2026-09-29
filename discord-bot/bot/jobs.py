"""Jobs + work-shift minigames — ONE canonical implementation for Discord.

Mirrors the site Jobs catalog (same ids, same payouts, same currency: the
guild wallet). Challenges are generated server-side at shift start; attempts
are validated against the stored challenge at completion. Payouts are rolled
server-side. Shifts are single-use rows (atomic consume = replay-proof) and
double as work history.
"""

import logging
import random
import secrets
import time
from datetime import datetime, timezone

log = logging.getLogger("bot.jobs")


def _now():
    return datetime.now(timezone.utc)


# ── Catalog (same numbers as the site Jobs page) ─────────────────────────
JOBS: dict = {
    "fastfood": {
        "id": "fastfood", "name": "Fast Food Worker", "icon": "🍔",
        "desc": "Serve customers in order and complete your shift.",
        "difficulty": "Easy", "game": "order",
        "payMin": 150000, "payMax": 220000, "failMin": 40000, "failMax": 80000,
        "steps": 4, "timeSec": 30, "windowMs": 0,
    },
    "warehouse": {
        "id": "warehouse", "name": "Warehouse Worker", "icon": "📦",
        "desc": "Stop the forklift beacon inside the target zone.",
        "difficulty": "Medium", "game": "timing",
        "payMin": 180000, "payMax": 260000, "failMin": 50000, "failMax": 90000,
        "steps": 1, "timeSec": 20, "windowMs": 140,
    },
    "cafe": {
        "id": "cafe", "name": "Café Worker", "icon": "☕",
        "desc": "Memorize the drink order, then remake it exactly.",
        "difficulty": "Easy", "game": "memory",
        "payMin": 140000, "payMax": 210000, "failMin": 35000, "failMax": 75000,
        "steps": 3, "timeSec": 30, "windowMs": 0,
    },
    "technician": {
        "id": "technician", "name": "Computer Technician", "icon": "💻",
        "desc": "React the instant the diagnostic light turns green.",
        "difficulty": "Hard", "game": "reaction",
        "payMin": 200000, "payMax": 300000, "failMin": 60000, "failMax": 110000,
        "steps": 1, "timeSec": 20, "windowMs": 900,
    },
    "gametester": {
        "id": "gametester", "name": "Game Tester", "icon": "🎮",
        "desc": "Pick the correct build before the timer runs out.",
        "difficulty": "Hard", "game": "choice",
        "payMin": 220000, "payMax": 320000, "failMin": 70000, "failMax": 120000,
        "steps": 6, "timeSec": 12, "windowMs": 0,
    },
}

MEMORY_ICONS = ["☕", "🍩", "🥐", "🧋", "🍰", "🥤", "🍪", "🥧"]
CHOICE_BUILDS = ["v1.0-stable", "v1.1-beta", "v1.2-rc", "v2.0-alpha", "v2.1-nightly", "v3.0-stable"]

JOB_ORDER = ["fastfood", "warehouse", "cafe", "technician", "gametester"]
DEFAULT_JOB_COOLDOWN_SEC = 3600
FAIL_REASONS = {
    "timeout": "you ran out of time",
    "wrong_order": "you clicked the buttons in the wrong order",
    "too_fast": "the shift finished impossibly fast",
    "incomplete": "you did not finish the shift",
    "wrong_build": "you shipped the wrong build",
    "bad_pick": "you did not pick a valid build",
    "outside_zone": "you stopped outside the target zone",
    "instant": "you stopped the beacon instantly",
    "early": "you jumped the gun before green",
    "slow": "you reacted too slowly",
    "inhuman": "you reacted impossibly fast",
    "wrong_memory": "you entered the sequence incorrectly",
}


def _rng():
    return random.SystemRandom()


def generate_challenge(job: dict, now_ms: int) -> dict:
    """Server-side challenge. The expected answer stays in the shift row."""
    deadline = now_ms + max(5, int(job.get("timeSec", 20))) * 1000
    game = job.get("game")
    rng = _rng()
    if game == "order":
        seq = list(range(1, int(job.get("steps", 4)) + 1))
        rng.shuffle(seq)
        return {"game": "order", "sequence": seq, "deadlineAt": deadline}
    if game == "memory":
        icons = [rng.choice(MEMORY_ICONS) for _ in range(int(job.get("steps", 3)))]
        return {"game": "memory", "icons": icons, "deadlineAt": deadline}
    if game == "choice":
        opts = rng.sample(CHOICE_BUILDS, min(int(job.get("steps", 6)), len(CHOICE_BUILDS)))
        return {"game": "choice", "options": opts,
                "correct": rng.randrange(len(opts)), "deadlineAt": deadline}
    if game == "timing":
        period = 2000
        width = max(60, int(job.get("windowMs", 140)))
        lo = rng.randrange(0, period - width)
        return {"game": "timing", "zone": [lo, lo + width],
                "periodMs": period, "deadlineAt": deadline}
    if game == "reaction":
        delay = 1500 + rng.randrange(2500)
        return {"game": "reaction", "delayMs": delay,
                "windowMs": int(job.get("windowMs", 900)),
                "goAt": now_ms + delay, "deadlineAt": deadline}
    return {"game": "order", "sequence": [1], "deadlineAt": deadline}


def validate_attempt(job: dict, ch: dict, attempt: dict, now_ms: int) -> tuple[bool, str]:
    """Validate an attempt against the stored challenge. Pure logic."""
    ch = ch or {}
    attempt = attempt or {}
    if now_ms > int(ch.get("deadlineAt", 0) or 0):
        return False, FAIL_REASONS["timeout"]
    try:
        elapsed = max(0, int(attempt.get("elapsedMs", 0) or 0))
    except (TypeError, ValueError):
        elapsed = 0
    game = job.get("game")
    if game == "order":
        expected = sorted(ch.get("sequence") or [])
        clicks = attempt.get("clicks") or []
        try:
            clicks = [int(c) for c in clicks]
        except (TypeError, ValueError):
            return False, FAIL_REASONS["wrong_order"]
        if len(clicks) != len(expected):
            return False, FAIL_REASONS["incomplete"]
        if elapsed < len(expected) * 350:
            return False, FAIL_REASONS["too_fast"]
        for i, want in enumerate(expected):
            if clicks[i] != want:
                return False, FAIL_REASONS["wrong_order"]
        return True, "order complete"
    if game == "memory":
        want = ch.get("icons") or []
        clicks = attempt.get("clicks") or []
        try:
            clicks = [int(c) for c in clicks]
        except (TypeError, ValueError):
            return False, FAIL_REASONS["wrong_memory"]
        if len(clicks) != len(want):
            return False, FAIL_REASONS["incomplete"]
        if elapsed < len(want) * 350:
            return False, FAIL_REASONS["too_fast"]
        for i, icon in enumerate(want):
            idx = clicks[i]
            if idx < 0 or idx >= len(MEMORY_ICONS) or MEMORY_ICONS[idx] != icon:
                return False, FAIL_REASONS["wrong_memory"]
        return True, "order remade perfectly"
    if game == "choice":
        options = ch.get("options") or []
        try:
            pick = int(attempt.get("pick"))
        except (TypeError, ValueError):
            return False, FAIL_REASONS["bad_pick"]
        if pick < 0 or pick >= len(options):
            return False, FAIL_REASONS["bad_pick"]
        if pick != int(ch.get("correct", -1)):
            return False, FAIL_REASONS["wrong_build"]
        return True, "correct build shipped"
    if game == "timing":
        zone = ch.get("zone") or [0, 0]
        period = int(ch.get("periodMs", 2000) or 2000)
        if elapsed < 200:
            return False, FAIL_REASONS["instant"]
        pos = elapsed % period
        if zone[0] <= pos <= zone[1]:
            return True, "beacon stopped in the zone"
        return False, FAIL_REASONS["outside_zone"]
    if game == "reaction":
        if attempt.get("reactedEarly"):
            return False, FAIL_REASONS["early"]
        go_at = int(ch.get("goAt", 0) or 0)
        reaction = now_ms - go_at
        if reaction < 80:
            return False, FAIL_REASONS["inhuman"]
        if reaction > int(ch.get("windowMs", 900) or 900):
            return False, FAIL_REASONS["slow"]
        return True, f"reacted in {reaction}ms"
    return False, FAIL_REASONS["incomplete"]


def roll_payout(job: dict, won: bool, rng=None) -> int:
    rng = rng or _rng()
    lo = int(job["payMin"] if won else job["failMin"])
    hi = int(job["payMax"] if won else job["failMax"])
    return rng.randint(lo, hi)


def fmt_coins(n: int) -> str:
    return f"⏣ {max(0, int(n)):,}"


def fmt_duration(total_sec: int) -> str:
    s = max(0, int(total_sec))
    return f"{s // 3600:02d}:{(s % 3600) // 60:02d}:{s % 60:02d}"


# ── Persistence (motor, same style as economy.py) ─────────────────────────
async def _coll(db):
    return db.job_shifts


async def cooldown_remaining(db, guild_id: int, user_id: int, cooldown_sec: int) -> int:
    """Seconds until the next shift may start (from last COMPLETED shift)."""
    try:
        coll = await _coll(db)
        doc = await coll.find_one(
            {"guildId": int(guild_id), "userId": int(user_id), "consumed": True},
            sort=[("consumedAt", -1)])
        if doc and doc.get("consumedAt"):
            last = doc["consumedAt"]
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            wait = int((last.timestamp() + cooldown_sec - time.time())) + 1
            return max(0, wait)
    except Exception:
        pass
    return 0


async def start_shift(db, guild_id: int, user_id: int, job_id: str,
                      cooldown_sec: int) -> tuple[bool, dict]:
    """Open a shift (no payout). Returns (ok, shift-or-error)."""
    job = JOBS.get(str(job_id or ""))
    if not job:
        return False, {"error": "Unknown job."}
    gid, uid = int(guild_id), int(user_id)
    remaining = await cooldown_remaining(db, gid, uid, cooldown_sec)
    if remaining > 0:
        return False, {"error": "cooldown", "remaining": remaining}
    try:
        coll = await _coll(db)
        live = await coll.find_one({"guildId": gid, "userId": uid,
                                    "consumed": False,
                                    "expiresAt": {"$gt": _now()}})
        if live:
            return False, {"error": "You already have a shift running — finish it first."}
        now_ms = int(time.time() * 1000)
        challenge = generate_challenge(job, now_ms)
        token = f"job_{secrets.token_hex(16)}"
        await coll.insert_one({
            "token": token, "guildId": gid, "userId": uid,
            "jobId": job["id"], "game": job["game"], "challenge": challenge,
            "payMin": job["payMin"], "payMax": job["payMax"],
            "failMin": job["failMin"], "failMax": job["failMax"],
            "createdAt": _now(),
            "expiresAt": datetime.fromtimestamp(
                (challenge["deadlineAt"] + 15000) / 1000, tz=timezone.utc),
            "consumed": False, "consumedAt": None,
            "won": None, "payout": None, "reason": "",
        })
        return True, {"token": token, "job": job, "challenge": challenge}
    except Exception:
        log.exception("start_shift failed")
        return False, {"error": "Could not open a shift — try again."}


async def complete_shift(db, guild_id: int, user_id: int, token: str,
                         attempt: dict, credit) -> tuple[bool, dict]:
    """Atomically consume + validate + pay. `credit(amount)` persists the
    payout (lets tests inject a fake wallet). Returns (ok, result-or-error)."""
    gid, uid = int(guild_id), int(user_id)
    try:
        coll = await _coll(db)
        doc = await coll.find_one_and_update(
            {"token": str(token or ""), "guildId": gid, "userId": uid,
             "consumed": False, "expiresAt": {"$gt": _now()}},
            {"$set": {"consumed": True, "consumedAt": _now()}},
            return_document=True)
        if not doc:
            return False, {"error": "Shift expired, already completed, or not yours."}
        job = JOBS.get(doc.get("jobId") or "")
        if not job:
            return False, {"error": "Unknown job on this shift."}
        won, reason = validate_attempt(job, doc.get("challenge") or {},
                                       attempt or {}, int(time.time() * 1000))
        payout = roll_payout(job, won)
        await coll.update_one({"token": doc["token"]},
                              {"$set": {"won": won, "payout": payout, "reason": reason}})
        paid, bonuses = await credit(payout)
        try:
            await db.economy.update_one(
                {"guildId": gid, "userId": uid}, {"$inc": {"shiftsWorked": 1}})
        except Exception:
            pass
        return True, {"won": won, "reason": reason, "payout": payout,
                      "paid": paid, "bonuses": bonuses, "job": job}
    except Exception:
        log.exception("complete_shift failed")
        return False, {"error": "Could not complete the shift — try again."}


async def history(db, guild_id: int, user_id: int, limit: int = 10) -> list[dict]:
    try:
        coll = await _coll(db)
        cur = coll.find({"guildId": int(guild_id), "userId": int(user_id),
                         "consumed": True}).sort("consumedAt", -1).limit(max(1, min(limit, 25)))
        return await cur.to_list(max(1, min(limit, 25)))
    except Exception:
        return []
