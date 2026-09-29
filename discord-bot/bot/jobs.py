"""Jobs + work-shift minigames — ONE canonical implementation for Discord.

Catalog values (shifts/day, cooldowns, unlocks, salaries, work items) mirror
the site jobs table exactly. Challenges are generated server-side at shift
start; attempts are validated against the stored challenge at completion.
Success pays the EXACT salary (+promotion bonus); failure pays
floor(salary * fail_rate). Shifts are single-use rows (atomic consume =
replay-proof) and double as work history. Progression (promotions, firing,
resignation) is tracked per guild/user/job and never trusts the client.
"""

import logging
import random
import secrets
import time
from datetime import datetime, timezone

log = logging.getLogger("bot.jobs")


def _now():
    return datetime.now(timezone.utc)


# ── Catalog (mirrors app/lib/jobs-table.json exactly) ─────────────────────
# id, name, icon, shifts/day, cooldown min, unlock, salary, work item, game.
JOBS: dict = {
    "cashier": {"id": "cashier", "name": "Cashier", "icon": "🧾", "shiftsPerDay": 1, "cooldownMin": 43, "unlock": 0, "salary": 95000, "workItem": "Cash Register", "game": "order"},
    "delivery": {"id": "delivery", "name": "Delivery Driver", "icon": "🚚", "shiftsPerDay": 2, "cooldownMin": 46, "unlock": 10, "salary": 105000, "workItem": "Delivery Box", "game": "order"},
    "janitor": {"id": "janitor", "name": "Janitor", "icon": "🧹", "shiftsPerDay": 2, "cooldownMin": 46, "unlock": 10, "salary": 108000, "workItem": "Cleaning Cart", "game": "memory"},
    "farmer": {"id": "farmer", "name": "Farmer", "icon": "🌾", "shiftsPerDay": 2, "cooldownMin": 46, "unlock": 15, "salary": 112000, "workItem": "Seed Bag", "game": "memory"},
    "mechanic": {"id": "mechanic", "name": "Mechanic", "icon": "🔧", "shiftsPerDay": 3, "cooldownMin": 49, "unlock": 25, "salary": 135000, "workItem": "Wrench", "game": "order"},
    "photographer": {"id": "photographer", "name": "Photographer", "icon": "📸", "shiftsPerDay": 3, "cooldownMin": 49, "unlock": 35, "salary": 145000, "workItem": "Camera", "game": "memory"},
    "journalist": {"id": "journalist", "name": "Journalist", "icon": "📰", "shiftsPerDay": 3, "cooldownMin": 49, "unlock": 45, "salary": 155000, "workItem": "Notebook", "game": "memory"},
    "chef": {"id": "chef", "name": "Chef", "icon": "👨‍🍳", "shiftsPerDay": 3, "cooldownMin": 49, "unlock": 50, "salary": 165000, "workItem": "Chef Hat", "game": "order"},
    "construction": {"id": "construction", "name": "Construction Worker", "icon": "🦺", "shiftsPerDay": 3, "cooldownMin": 49, "unlock": 60, "salary": 170000, "workItem": "Hard Hat", "game": "order"},
    "firefighter": {"id": "firefighter", "name": "Firefighter", "icon": "🚒", "shiftsPerDay": 3, "cooldownMin": 49, "unlock": 70, "salary": 195000, "workItem": "Fire Helmet", "game": "choice"},
    "architect": {"id": "architect", "name": "Architect", "icon": "📐", "shiftsPerDay": 4, "cooldownMin": 52, "unlock": 90, "salary": 205000, "workItem": "Blueprint", "game": "order"},
    "designer": {"id": "designer", "name": "Graphic Designer", "icon": "🎨", "shiftsPerDay": 4, "cooldownMin": 52, "unlock": 100, "salary": 215000, "workItem": "Drawing Tablet", "game": "order"},
    "software": {"id": "software", "name": "Software Engineer", "icon": "💻", "shiftsPerDay": 4, "cooldownMin": 52, "unlock": 130, "salary": 230000, "workItem": "Laptop", "game": "choice"},
    "cybersec": {"id": "cybersec", "name": "Cybersecurity Analyst", "icon": "🛡️", "shiftsPerDay": 4, "cooldownMin": 52, "unlock": 150, "salary": 240000, "workItem": "Security Key", "game": "choice"},
    "pilot": {"id": "pilot", "name": "Pilot", "icon": "✈️", "shiftsPerDay": 5, "cooldownMin": 55, "unlock": 175, "salary": 255000, "workItem": "Pilot Wings", "game": "choice"},
    "attendant": {"id": "attendant", "name": "Flight Attendant", "icon": "🧳", "shiftsPerDay": 5, "cooldownMin": 55, "unlock": 190, "salary": 265000, "workItem": "Suitcase", "game": "timing"},
    "anchor": {"id": "anchor", "name": "News Anchor", "icon": "🎙️", "shiftsPerDay": 5, "cooldownMin": 55, "unlock": 200, "salary": 275000, "workItem": "Microphone", "game": "memory"},
    "director": {"id": "director", "name": "Film Director", "icon": "🎬", "shiftsPerDay": 5, "cooldownMin": 55, "unlock": 225, "salary": 285000, "workItem": "Director's Clapper", "game": "order"},
    "dreamitect": {"id": "dreamitect", "name": "Architect of Dreams", "icon": "🌙", "shiftsPerDay": 5, "cooldownMin": 55, "unlock": 250, "salary": 300000, "workItem": "Blueprint Scroll", "game": "choice"},
    "ceo": {"id": "ceo", "name": "CEO", "icon": "💼", "shiftsPerDay": 6, "cooldownMin": 58, "unlock": 300, "salary": 325000, "workItem": "Business Briefcase", "game": "order"},
    "astronaut": {"id": "astronaut", "name": "Astronaut", "icon": "🚀", "shiftsPerDay": 6, "cooldownMin": 58, "unlock": 350, "salary": 350000, "workItem": "Space Helmet", "game": "timing"},
    "agent": {"id": "agent", "name": "Secret Agent", "icon": "🕵️", "shiftsPerDay": 6, "cooldownMin": 58, "unlock": 400, "salary": 375000, "workItem": "Agent Badge", "game": "choice"},
    "gamedesign": {"id": "gamedesign", "name": "Game Designer", "icon": "🎮", "shiftsPerDay": 6, "cooldownMin": 58, "unlock": 450, "salary": 400000, "workItem": "Game Controller", "game": "choice"},
    "airesearch": {"id": "airesearch", "name": "AI Researcher", "icon": "🤖", "shiftsPerDay": 6, "cooldownMin": 58, "unlock": 500, "salary": 425000, "workItem": "Neural Chip", "game": "choice"},
    "meme": {"id": "meme", "name": "Meme Creator", "icon": "🐸", "shiftsPerDay": 2, "cooldownMin": 46, "unlock": 25, "salary": 120000, "workItem": "Meme Template", "game": "memory"},
    "sleeper": {"id": "sleeper", "name": "Professional Sleeper", "icon": "😴", "shiftsPerDay": 2, "cooldownMin": 46, "unlock": 30, "salary": 128000, "workItem": "Pillow", "game": "memory"},
    "fortune": {"id": "fortune", "name": "Fortune Teller", "icon": "🔮", "shiftsPerDay": 3, "cooldownMin": 49, "unlock": 75, "salary": 175000, "workItem": "Crystal Ball", "game": "memory"},
    "detective": {"id": "detective", "name": "Detective", "icon": "🔍", "shiftsPerDay": 3, "cooldownMin": 49, "unlock": 90, "salary": 205000, "workItem": "Magnifying Glass", "game": "order"},
    "magician": {"id": "magician", "name": "Magician", "icon": "🎩", "shiftsPerDay": 3, "cooldownMin": 49, "unlock": 100, "salary": 215000, "workItem": "Magic Wand", "game": "order"},
    "treasure": {"id": "treasure", "name": "Treasure Hunter", "icon": "🗺️", "shiftsPerDay": 4, "cooldownMin": 52, "unlock": 140, "salary": 245000, "workItem": "Treasure Map", "game": "timing"},
    "streamer": {"id": "streamer", "name": "Streamer", "icon": "🎥", "shiftsPerDay": 4, "cooldownMin": 52, "unlock": 150, "salary": 250000, "workItem": "Streaming Mic", "game": "memory"},
    "coach": {"id": "coach", "name": "Esports Coach", "icon": "📋", "shiftsPerDay": 4, "cooldownMin": 52, "unlock": 175, "salary": 265000, "workItem": "Coach Whistle", "game": "memory"},
    "parkop": {"id": "parkop", "name": "Theme Park Operator", "icon": "🎢", "shiftsPerDay": 5, "cooldownMin": 55, "unlock": 225, "salary": 290000, "workItem": "Park Ticket", "game": "order"},
    "superhero": {"id": "superhero", "name": "Superhero", "icon": "🦸", "shiftsPerDay": 5, "cooldownMin": 55, "unlock": 300, "salary": 350000, "workItem": "Hero Emblem", "game": "choice"},
    "timetravel": {"id": "timetravel", "name": "Time Traveler", "icon": "⏳", "shiftsPerDay": 6, "cooldownMin": 58, "unlock": 400, "salary": 400000, "workItem": "Time Machine", "game": "order"},
    "pirate": {"id": "pirate", "name": "Space Pirate", "icon": "🏴‍☠️", "shiftsPerDay": 6, "cooldownMin": 58, "unlock": 500, "salary": 450000, "workItem": "Cosmic Compass", "game": "reaction"},
    "multiverse": {"id": "multiverse", "name": "Multiverse Explorer", "icon": "🌀", "shiftsPerDay": 6, "cooldownMin": 58, "unlock": 600, "salary": 500000, "workItem": "Portal Key", "game": "reaction"},
    "reality": {"id": "reality", "name": "Reality Architect", "icon": "🧬", "shiftsPerDay": 6, "cooldownMin": 58, "unlock": 750, "salary": 600000, "workItem": "Reality Shard", "game": "reaction"},
    "dimension": {"id": "dimension", "name": "Dimension Lord", "icon": "👑", "shiftsPerDay": 6, "cooldownMin": 58, "unlock": 1000, "salary": 750000, "workItem": "Dimension Crown", "game": "reaction"},
}

JOB_ORDER = [
    "cashier", "delivery", "janitor", "farmer", "mechanic",
    "photographer", "journalist", "chef", "construction", "firefighter",
    "architect", "designer", "software", "cybersec", "pilot",
    "attendant", "anchor", "director", "dreamitect", "ceo",
    "astronaut", "agent", "gamedesign", "airesearch", "meme",
    "sleeper", "fortune", "detective", "magician", "treasure",
    "streamer", "coach", "parkop", "superhero", "timetravel",
    "pirate", "multiverse", "reality", "dimension",
]

# Job-flavored content pools (labels stay server-side in spirit: the ORDER
# ticket and memory icons are shown so shifts stay playable; answers are
# verified against the stored challenge, never trusted from the client).
ORDER_ITEMS: dict = {
    "cashier": ["Milk", "Bread", "Eggs", "Apples", "Soap", "Rice", "Juice"],
    "delivery": ["Maple St", "Oak Ave", "Pine Rd", "Cedar Ln", "Elm Dr", "Birch Way"],
    "mechanic": ["Drain oil", "Remove filter", "Fit gasket", "Torque bolts", "Refill oil", "Test engine"],
    "chef": ["Bun", "Patty", "Lettuce", "Cheese", "Sauce", "Tomato", "Onion"],
    "construction": ["Survey", "Foundation", "Framing", "Roofing", "Wiring", "Paint"],
    "architect": ["Site plan", "Floor plan", "Elevation", "Section", "Details", "Cover sheet"],
    "designer": ["Background", "Shapes", "Images", "Text", "Effects", "Export"],
    "director": ["Rehearsal", "Wide shot", "Close-up", "Retake", "Wrap", "Dailies"],
    "ceo": ["Safety review", "Payroll", "Product launch", "Marketing", "Office party", "Rebrand"],
    "detective": ["First clue", "Witness call", "Lab result", "Lineup", "Arrest", "Report"],
    "magician": ["Flourish", "Palm coin", "Misdirect", "Reveal", "Bow", "Encore"],
    "parkop": ["Inspect rails", "Test brakes", "Check restraints", "Clear platform", "Open gates", "First dispatch"],
    "timetravel": ["Stone Age", "Pyramids", "Rome", "Steam Age", "Moon Landing", "Mars Colony"],
    "gamedesign": ["Tutorial", "Level 1", "Boss", "Ending", "Credits", "DLC"],
}
MEMORY_POOLS: dict = {
    "janitor": ["🧽", "🧴", "🪣", "🧹", "🧻", "🧷", "🪠", "🧺"],
    "farmer": ["🌽", "🥕", "🍅", "🥔", "🌻", "🍓", "🥬", "🫘"],
    "photographer": ["🌄", "🐦", "🌸", "🏙️", "🌊", "🐈", "🎆", "🍂"],
    "journalist": ["🎤", "📝", "📷", "📁", "🔖", "📌", "📞", "🗞️"],
    "anchor": ["🌤️", "🏛️", "⚽", "🎬", "💹", "🚀", "🎭", "🧪"],
    "meme": ["🐸", "🐕", "😹", "👀", "💀", "🔥", "✨", "👑"],
    "sleeper": ["🌙", "⭐", "☁️", "🌊", "🦉", "🔮", "💤", "🌌"],
    "fortune": ["🌟", "🌙", "☀️", "⚡", "🌊", "🔥", "🍀", "💎"],
    "streamer": ["❤️", "🔥", "😂", "👏", "🎉", "💯", "😮", "🥳"],
    "coach": ["⬆️", "⬇️", "⬅️", "➡️", "🅰️", "🅱️", "⏺️", "⏭️"],
}
GENERIC_POOL = ["⭐", "🔶", "🔷", "🟢", "🟣", "🔺", "🔻", "⭕"]
# (question, options[4], correct-index) banks — fictional, harmless.
CHOICE_BANK: dict = {
    "firefighter": [
        ("Kitchen grease fire reported. First action?",
         ["Smother with lid", "Throw water on it", "Open all windows", "Move the pan outside"], 0),
        ("Alarm sounds during drill. You…",
         ["Guide everyone to exits", "Finish your coffee", "Take the elevator", "Hide under desk"], 0),
        ("Alarm panel shows Zone 3. You…",
         ["Investigate Zone 3 geared up", "Silence the panel", "Assume false alarm", "Leave alone"], 0),
    ],
    "software": [
        ("print(2 + 3 * 2) outputs?",
         ["8", "10", "12", "6"], 0),
        ("Which loop runs exactly 3 times? (i from 0)",
         ["while i < 3", "while i <= 3", "while i < 2", "while True"], 0),
        ("len([1, [2, 3], 4]) is?",
         ["3", "4", "2", "5"], 0),
    ],
    "cybersec": [
        ("Phishing email with a strange attachment. You…",
         ["Quarantine and report it", "Open it to check", "Forward to a friend", "Delete silently"], 0),
        ("Logins from an unknown country appear. You…",
         ["Force reset + alert user", "Ignore one alert", "Share the password", "Disable logging"], 0),
        ("USB stick found in the parking lot. You…",
         ["Hand it to security unplugged", "Plug into laptop", "Plug into a server", "Pocket it"], 0),
    ],
    "pilot": [
        ("Crosswind exceeds limits on final. You…",
         ["Go around", "Force the landing", "Speed up descent", "Turn off instruments"], 0),
        ("Engine gauge flickers amber. First step?",
         ["Run the checklist", "Ignore it", "Shut everything down", "Climb faster"], 0),
        ("Tower says hold short. You…",
         ["Stop before the runway", "Cross quickly", "Take off anyway", "Switch frequency off"], 0),
    ],
    "dreamitect": [
        ("Client dreams of flying over oceans. Design…",
         ["Open sky atriums", "Windowless bunker", "Underground maze", "Concrete box"], 0),
        ("Client fears small dark rooms. Avoid…",
         ["Cramped corridors", "Glass pavilions", "Sunlit courts", "Open lofts"], 0),
        ("Client loves sunrise light. Orient…",
         ["Bedrooms to the east", "Bedrooms to the north", "No windows", "Blackout everything"], 0),
    ],
    "agent": [
        ("Cover for a beach-resort stakeout?",
         ["Tourist photographer", "Bank guard uniform", "Firefighter gear", "Clown costume"], 0),
        ("Contact uses codeword 'harbor'. Reply…",
         ["'The tide is low'", "'Nice weather'", "'Who are you'", "'Loud and clear'"], 0),
        ("Safe house compromised. You…",
         ["Move to backup location", "Stay put", "Call the front desk", "Post about it"], 0),
    ],
    "gamedesign": [
        ("Tutorial too hard. You…",
         ["Ease level 1, teach one skill", "Add ten mechanics", "Remove the tutorial", "Make enemies faster"], 0),
        ("Players skip cutscenes. You…",
         ["Make story skippable + short", "Force 20-minute scenes", "Remove all story", "Lock skipping"], 0),
        ("Boss feedback says unfair. You…",
         ["Telegraph attacks clearly", "Double boss health", "Remove checkpoints", "Hide the boss bar"], 0),
    ],
    "airesearch": [
        ("Model overfits tiny data. First try…",
         ["More data + regularization", "Bigger model only", "Train 10x longer", "Delete validation set"], 0),
        ("Evaluation must be fair. You…",
         ["Lock a held-out test set", "Tune on the test set", "Report best seed only", "Skip evaluation"], 0),
        ("Results look too good. You…",
         ["Check for data leakage", "Publish immediately", "Hide the code", "Add more decimals"], 0),
    ],
    "superhero": [
        ("Kitten in tree vs runaway bus. First…",
         ["Stop the bus, then the kitten", "Kitten first", "Ignore both", "Take a selfie"], 0),
        ("Villain monologues mid-fight. You…",
         ["Act while they talk", "Wait politely", "Join the monologue", "Leave"], 0),
        ("Crowd filming the battle. You…",
         ["Move the fight from crowds", "Pose for cameras", "Fight harder nearby", "Sign autographs"], 0),
    ],
}

DEFAULT_FAIL_RATE = 0.3
PROMO_EVERY = 10
PROMO_STEP = 0.02
PROMO_CAP = 10
FIRED_STREAK = 5


def _rng():
    return random.SystemRandom()


def _tier(job: dict) -> int:
    unlock = int(job.get("unlock", 0) or 0)
    if unlock >= 300:
        return 2
    if unlock >= 100:
        return 1
    return 0


def job_params(job: dict) -> dict:
    t = _tier(job)
    game = job.get("game")
    if game == "order":
        return {"steps": min(6, 4 + t), "timeSec": 30}
    if game == "memory":
        return {"steps": min(5, 3 + t), "timeSec": 30}
    if game == "choice":
        return {"options": 4, "timeSec": 10 if t >= 2 else 12}
    if game == "timing":
        return {"windowMs": max(80, 160 - t * 20),
                "periodMs": 1800 + (sum(map(ord, job["id"])) % 5) * 100,
                "timeSec": 20}
    if game == "reaction":
        return {"windowMs": max(600, 900 - t * 100), "timeSec": 20}
    return {"steps": 4, "timeSec": 20}


def fail_rate_for(cfg: dict) -> float:
    try:
        rate = float(cfg.get("jobFailRate", DEFAULT_FAIL_RATE))
    except (TypeError, ValueError):
        rate = DEFAULT_FAIL_RATE
    return max(0.05, min(0.9, rate))


def fail_payout(salary: int, rate: float) -> int:
    return max(1, int(int(salary) * max(0.05, min(0.9, float(rate)))))


def promo_level(successes: int) -> int:
    return max(0, min(PROMO_CAP, int(successes or 0) // PROMO_EVERY))


def success_payout(job: dict, successes: int) -> int:
    return int(int(job["salary"]) * (1 + promo_level(successes) * PROMO_STEP))


def generate_challenge(job: dict, now_ms: int) -> dict:
    p = job_params(job)
    deadline = now_ms + max(5, int(p.get("timeSec", 20))) * 1000
    game = job.get("game")
    rng = _rng()
    if game == "order":
        items = list(ORDER_ITEMS.get(job["id"], ["Alpha", "Beta", "Gamma", "Delta"]))
        items = items[:max(2, int(job_params(job).get("steps", 4)))]
        order = list(range(len(items)))
        rng.shuffle(order)
        # shown[pos] = label on button pos; answer[step] = pos to tap.
        shown = [items[i] for i in order]
        answer = [order.index(i) for i in range(len(items))]
        return {"game": "order", "labels": shown, "ticket": items,
                "answer": answer, "deadlineAt": deadline}
    if game == "memory":
        pool = list(MEMORY_POOLS.get(job["id"], GENERIC_POOL))
        seq = [rng.randrange(len(pool)) for _ in range(int(p.get("steps", 3)))]
        return {"game": "memory", "icons": [pool[i] for i in seq],
                "pool": pool, "deadlineAt": deadline}
    if game == "choice":
        bank = list(CHOICE_BANK.get(job["id"], [("Pick the right answer?", ["A", "B", "C", "D"], 0)]))
        q, options, correct = rng.choice(bank)
        order = list(range(len(options)))
        rng.shuffle(order)
        return {"game": "choice", "question": q,
                "options": [options[i] for i in order],
                "correct": order.index(correct), "deadlineAt": deadline}
    if game == "timing":
        period = int(p.get("periodMs", 2000))
        width = max(60, int(p.get("windowMs", 140)))
        lo = rng.randrange(0, period - width)
        return {"game": "timing", "zone": [lo, lo + width],
                "periodMs": period, "deadlineAt": deadline}
    if game == "reaction":
        delay = 1500 + rng.randrange(2500)
        return {"game": "reaction", "delayMs": delay,
                "windowMs": int(p.get("windowMs", 900)),
                "goAt": now_ms + delay, "deadlineAt": deadline}
    return {"game": "order", "labels": ["A"], "ticket": ["A"],
            "answer": [0], "deadlineAt": deadline}


FAIL_REASONS = {
    "timeout": "you ran out of time",
    "wrong_order": "you clicked the buttons in the wrong order",
    "too_fast": "the shift finished impossibly fast",
    "incomplete": "you did not finish the shift",
    "wrong_answer": "you picked the wrong answer",
    "bad_pick": "you did not pick a valid answer",
    "outside_zone": "you stopped outside the target zone",
    "instant": "you stopped the meter instantly",
    "early": "you jumped the gun before green",
    "slow": "you reacted too slowly",
    "inhuman": "you reacted impossibly fast",
    "wrong_memory": "you entered the sequence incorrectly",
}


def validate_attempt(job: dict, ch: dict, attempt: dict, now_ms: int) -> tuple[bool, str]:
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
        answer = ch.get("answer") or []
        clicks = attempt.get("clicks") or []
        try:
            clicks = [int(c) for c in clicks]
        except (TypeError, ValueError):
            return False, FAIL_REASONS["wrong_order"]
        if len(clicks) != len(answer):
            return False, FAIL_REASONS["incomplete"]
        if elapsed < len(answer) * 350:
            return False, FAIL_REASONS["too_fast"]
        for i, want in enumerate(answer):
            if clicks[i] != want:
                return False, FAIL_REASONS["wrong_order"]
        return True, "order complete"
    if game == "memory":
        want = ch.get("icons") or []
        pool = ch.get("pool") or GENERIC_POOL
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
            if idx < 0 or idx >= len(pool) or pool[idx] != icon:
                return False, FAIL_REASONS["wrong_memory"]
        return True, "sequence reproduced perfectly"
    if game == "choice":
        options = ch.get("options") or []
        try:
            pick = int(attempt.get("pick"))
        except (TypeError, ValueError):
            return False, FAIL_REASONS["bad_pick"]
        if pick < 0 or pick >= len(options):
            return False, FAIL_REASONS["bad_pick"]
        if pick != int(ch.get("correct", -1)):
            return False, FAIL_REASONS["wrong_answer"]
        return True, "correct call"
    if game == "timing":
        zone = ch.get("zone") or [0, 0]
        period = int(ch.get("periodMs", 2000) or 2000)
        if elapsed < 200:
            return False, FAIL_REASONS["instant"]
        pos = elapsed % period
        if zone[0] <= pos <= zone[1]:
            return True, "meter stopped in the zone"
        return False, FAIL_REASONS["outside_zone"]
    if game == "reaction":
        if attempt.get("reactedEarly"):
            return False, FAIL_REASONS["early"]
        reaction = now_ms - int(ch.get("goAt", 0) or 0)
        if reaction < 80:
            return False, FAIL_REASONS["inhuman"]
        if reaction > int(ch.get("windowMs", 900) or 900):
            return False, FAIL_REASONS["slow"]
        return True, f"reacted in {reaction}ms"
    return False, FAIL_REASONS["incomplete"]


def fmt_coins(n: int) -> str:
    return f"⏣ {max(0, int(n)):,}"


def fmt_duration(total_sec: int) -> str:
    s = max(0, int(total_sec))
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{sec:02d}" if h else f"{m:02d}:{sec:02d}"


# ── Persistence (motor, same style as economy.py) ─────────────────────────
def _day_start_utc() -> datetime:
    now = _now()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


async def total_completed(db, guild_id: int, user_id: int) -> int:
    try:
        return await db.job_shifts.count_documents(
            {"guildId": int(guild_id), "userId": int(user_id), "consumed": True})
    except Exception:
        return 0


async def today_count(db, guild_id: int, user_id: int, job_id: str) -> int:
    try:
        return await db.job_shifts.count_documents(
            {"guildId": int(guild_id), "userId": int(user_id),
             "jobId": str(job_id), "consumed": True,
             "consumedAt": {"$gte": _day_start_utc()}})
    except Exception:
        return 0


async def last_completed_at(db, guild_id: int, user_id: int, job_id: str):
    try:
        doc = await db.job_shifts.find_one(
            {"guildId": int(guild_id), "userId": int(user_id),
             "jobId": str(job_id), "consumed": True},
            sort=[("consumedAt", -1)])
        return doc.get("consumedAt") if doc else None
    except Exception:
        return None


async def get_progress(db, guild_id: int, user_id: int, job_id: str) -> dict:
    try:
        doc = await db.job_progress.find_one(
            {"guildId": int(guild_id), "userId": int(user_id), "jobId": str(job_id)})
        return doc or {}
    except Exception:
        return {}


async def start_shift(db, guild_id: int, user_id: int, job_id: str,
                      cooldown_overrides: dict | None = None,
                      disabled: set | None = None) -> tuple[bool, dict]:
    """Open a shift (no payout). Enforces unlocks, daily limits, per-job
    cooldowns and one live shift. Returns (ok, shift-or-error)."""
    job = JOBS.get(str(job_id or ""))
    if not job:
        return False, {"error": "Unknown job."}
    if disabled and job["id"] in disabled:
        return False, {"error": "That job is currently closed."}
    gid, uid = int(guild_id), int(user_id)
    total = await total_completed(db, gid, uid)
    if total < int(job["unlock"]):
        return False, {"error": "locked", "required": int(job["unlock"]), "progress": total}
    if await today_count(db, gid, uid, job["id"]) >= int(job["shiftsPerDay"]):
        return False, {"error": "daily", "today": int(job["shiftsPerDay"]),
                       "limit": int(job["shiftsPerDay"])}
    cd_sec = job["cooldownMin"] * 60
    if cooldown_overrides and job["id"] in cooldown_overrides:
        try:
            cd_sec = max(60, min(86400, int(cooldown_overrides[job["id"]])))
        except (TypeError, ValueError):
            pass
    last = await last_completed_at(db, gid, uid, job["id"])
    if last is not None:
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        wait = int(last.timestamp() + cd_sec - time.time()) + 1
        if wait > 0:
            return False, {"error": "cooldown", "remaining": wait, "cooldownSec": cd_sec}
    try:
        live = await db.job_shifts.find_one({"guildId": gid, "userId": uid,
                                             "consumed": False,
                                             "expiresAt": {"$gt": _now()}})
        if live:
            return False, {"error": "You already have a shift running — finish it first."}
        now_ms = int(time.time() * 1000)
        challenge = generate_challenge(job, now_ms)
        token = f"job_{secrets.token_hex(16)}"
        await db.job_shifts.insert_one({
            "token": token, "guildId": gid, "userId": uid,
            "jobId": job["id"], "game": job["game"], "challenge": challenge,
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
                         attempt: dict, credit, fail_rate: float = DEFAULT_FAIL_RATE
                         ) -> tuple[bool, dict]:
    """Atomically consume + validate + pay. Returns (ok, result-or-error)."""
    gid, uid = int(guild_id), int(user_id)
    try:
        doc = await db.job_shifts.find_one_and_update(
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
        prog = await db.job_progress.find_one_and_update(
            {"guildId": gid, "userId": uid, "jobId": job["id"]},
            {"$setOnInsert": {"successes": 0, "fails": 0, "totalShifts": 0,
                              "consecutiveFails": 0, "firedCount": 0}},
            upsert=True, return_document=True) or {}
        successes = int(prog.get("successes", 0) or 0)
        payout = success_payout(job, successes) if won else fail_payout(int(job["salary"]), fail_rate)
        fired = False
        if won:
            await db.job_progress.update_one(
                {"guildId": gid, "userId": uid, "jobId": job["id"]},
                {"$inc": {"successes": 1, "totalShifts": 1},
                 "$set": {"consecutiveFails": 0, "updatedAt": _now()}})
        else:
            consecutive = int(prog.get("consecutiveFails", 0) or 0) + 1
            if consecutive >= FIRED_STREAK:
                fired = True
                await db.job_progress.update_one(
                    {"guildId": gid, "userId": uid, "jobId": job["id"]},
                    {"$set": {"successes": 0, "consecutiveFails": 0, "updatedAt": _now()},
                     "$inc": {"fails": 1, "totalShifts": 1, "firedCount": 1}})
            else:
                await db.job_progress.update_one(
                    {"guildId": gid, "userId": uid, "jobId": job["id"]},
                    {"$inc": {"fails": 1, "totalShifts": 1},
                     "$set": {"consecutiveFails": consecutive, "updatedAt": _now()}})
        await db.job_shifts.update_one(
            {"token": doc["token"]},
            {"$set": {"won": won, "payout": payout, "reason": reason}})
        paid, bonuses = await credit(payout)
        try:
            await db.economy.update_one(
                {"guildId": gid, "userId": uid}, {"$inc": {"shiftsWorked": 1}})
        except Exception:
            pass
        fresh = await get_progress(db, gid, uid, job["id"])
        return True, {"won": won, "reason": reason, "payout": payout,
                      "paid": paid, "bonuses": bonuses, "job": job,
                      "fired": fired,
                      "promoLevel": promo_level(int(fresh.get("successes", 0) or 0))}
    except Exception:
        log.exception("complete_shift failed")
        return False, {"error": "Could not complete the shift — try again."}


async def resign(db, guild_id: int, user_id: int, job_id: str) -> tuple[bool, dict]:
    """Leave a job: promotion progress resets (history is kept)."""
    job = JOBS.get(str(job_id or ""))
    if not job:
        return False, {"error": "Unknown job."}
    try:
        res = await db.job_progress.delete_one(
            {"guildId": int(guild_id), "userId": int(user_id), "jobId": job["id"]})
        return True, {"resigned": res.deleted_count > 0,
                      "message": f"Resigned from {job['name']} — promotion progress reset."}
    except Exception:
        return False, {"error": "Could not resign — try again."}


async def history(db, guild_id: int, user_id: int, limit: int = 10) -> list[dict]:
    try:
        cur = db.job_shifts.find({"guildId": int(guild_id), "userId": int(user_id),
                                  "consumed": True}).sort("consumedAt", -1).limit(max(1, min(limit, 25)))
        return await cur.to_list(max(1, min(limit, 25)))
    except Exception:
        return []
