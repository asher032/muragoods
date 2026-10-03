"""XP row uniqueness — the invariant the whole leveling system rests on.

`leveling_sys.add_xp` upserts on `{guildId, userId}`. Without a UNIQUE index on
that pair, two messages arriving in the same tick can both miss the selector and
both insert: XP then splits across duplicate rows, `find_one` picks one
arbitrarily, and `/level`, the dashboard and the leaderboard disagree about the
same member. That is the "Discord data and dashboard data become inconsistent"
symptom, and it was invisible because nothing enforced the pairing.

What this asserts, against an in-process Mongo (no network, no real cluster):

  1. `xp` declares a unique compound index on (guildId, userId).
  2. `_dedupe_xp_rows` merges pre-existing duplicates by SUMMING XP and keeping
     the highest level — migration safety: earned XP is never dropped.
  3. Guild isolation: the same user in two guilds keeps independent XP.
  4. A stored leveling config is never reset to defaults by a read.
  5. Level math is monotonic and XP actually persists across reads.

Hermetic by construction: mongomock-motor only, no Discord, no network.
"""
import asyncio
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent.parent
BOT_DIR = REPO / "discord-bot" / "bot"
DATABASE_PY = BOT_DIR / "database.py"

FAILURES: list[str] = []
CHECKS = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global CHECKS
    CHECKS += 1
    if condition:
        print(f"  ✓ {label}")
    else:
        print(f"  ✗ {label}{(' — ' + detail) if detail else ''}")
        FAILURES.append(label)


def section(title: str) -> None:
    print(f"\n{title}")


# ── 1. The index is declared ────────────────────────────────────────────
section("xp declares a unique compound index on (guildId, userId)")
source = DATABASE_PY.read_text(encoding="utf-8")
check("unique xp guildId+userId index is declared",
      '("xp.guildId_userId", "unique")' in source,
      "missing the unique spec — duplicates can be created again")
check("xp.guildId_userId has index key material",
      '"xp.guildId_userId": [("guildId", DESCENDING), ("userId", DESCENDING)]' in source)
check("dedupe runs before indexes are created",
      source.index("_dedupe_xp_rows()") < source.index("for label, kind in specs"),
      "dedupe must run first or the unique index cannot be created")

sys.path.insert(0, str(BOT_DIR))
import database  # noqa: E402
import leveling_sys as levels  # noqa: E402

try:
    from mongomock_motor import AsyncMongoMockClient
except ImportError:  # pragma: no cover - dependency missing
    print("\nmongomock-motor is required for this suite")
    sys.exit(1)


async def main() -> None:
    client = AsyncMongoMockClient()
    db = client["test"]

    # ── 2. Duplicate rows are merged, never lost ─────────────────────────
    section("Existing duplicate xp rows are merged without losing XP")
    await db.xp.insert_many([
        {"guildId": 1, "userId": 7, "xp": 100, "level": 2, "messages": 3},
        {"guildId": 1, "userId": 7, "xp": 250, "level": 4, "messages": 5},
        {"guildId": 1, "userId": 7, "xp": 50, "level": 1, "messages": 1},
    ])
    merged = await database._dedupe_xp_rows(db)
    rows = [d async for d in db.xp.find({"guildId": 1, "userId": 7})]
    check("duplicate rows were merged", merged == 2, f"merged={merged}")
    check("exactly one row remains for (guild, user)", len(rows) == 1, f"rows={len(rows)}")
    check("XP is SUMMED, not discarded or overwritten",
          bool(rows) and rows[0].get("xp") == 400, f"xp={rows[0].get('xp') if rows else None}")
    check("highest level is kept",
          bool(rows) and rows[0].get("level") == 4, f"level={rows[0].get('level') if rows else None}")

    section("The dedupe is idempotent and leaves healthy data alone")
    again = await database._dedupe_xp_rows(db)
    check("second run merges nothing", again == 0, f"merged={again}")
    after = [d async for d in db.xp.find({"guildId": 1, "userId": 7})]
    check("XP unchanged on re-run", bool(after) and after[0].get("xp") == 400)

    # ── 3. Multi-server isolation ────────────────────────────────────────
    section("The same user in two guilds keeps independent XP")
    await db.xp.delete_many({})
    xp_a, lvl_a, _, up_a = await levels.add_xp(db, 111, 7, 500)
    xp_b, lvl_b, _, up_b = await levels.add_xp(db, 222, 7, 20)
    check("guild A XP is its own", xp_a == 500, f"got {xp_a}")
    check("guild B XP is its own", xp_b == 20, f"got {xp_b}")
    check("same user id does not leak across guilds", xp_a != xp_b)
    reread_a = await db.xp.find_one({"guildId": 111, "userId": 7})
    reread_b = await db.xp.find_one({"guildId": 222, "userId": 7})
    check("guild A row holds 500", bool(reread_a) and reread_a.get("xp") == 500)
    check("guild B row holds 20", bool(reread_b) and reread_b.get("xp") == 20)

    section("add_xp accumulates instead of overwriting")
    await levels.add_xp(db, 111, 7, 100)
    await levels.add_xp(db, 111, 7, 100)
    accumulated = await db.xp.find_one({"guildId": 111, "userId": 7})
    check("XP accumulates to 700", bool(accumulated) and accumulated.get("xp") == 700,
          f"got {accumulated.get('xp') if accumulated else None}")
    check("still exactly one row for (guild, user)",
          await db.xp.count_documents({"guildId": 111, "userId": 7}) == 1)

    # ── 4. Defaults never reset a saved setting ─────────────────────────
    section("get_level_config never resets a stored value to the default")
    await db.guild_config.insert_one({
        "guildId": "111",
        "leveling": {
            "server_card_background": "frog-pond",
            "xpMax": 33,
            "levelUpChannelId": "999",
            "levelUpMessage": "{user} is level {level}",
        },
    })
    cfg = await levels.get_level_config(db, 111)
    check("stored background survives the read",
          cfg.get("server_card_background") == "frog-pond",
          f"got {cfg.get('server_card_background')!r}")
    check("legacy alias resolves to the same theme",
          levels.get_level_card_background(cfg, guild_id=111) == "frog-pond")
    check("stored xpMax survives", cfg.get("xpMax") == 33, f"got {cfg.get('xpMax')!r}")
    check("stored level-up channel survives", cfg.get("levelUpChannelId") == "999")
    check("stored level-up message survives",
          cfg.get("levelUpMessage") == "{user} is level {level}")

    section("A guild with no stored config still gets defaults")
    fresh = await levels.get_level_config(db, 999)
    check("defaults are applied when nothing is stored",
          fresh.get("server_card_background") == levels.SERVER_CARD_DEFAULT)

    # ── 5. Level math is monotonic ───────────────────────────────────────
    section("Level math is monotonic and consistent")
    previous = -1
    monotonic = True
    for amount in (1, 10, 50, 100, 400, 800, 2000, 5000):
        lvl, into, need = levels.level_from_xp(amount)
        if lvl < previous:
            monotonic = False
        previous = lvl
    check("level never decreases as XP grows", monotonic)
    lvl_a, _, _ = levels.level_from_xp(500)
    lvl_b, _, _ = levels.level_from_xp(700)
    check("700 XP is at least the level of 500 XP", lvl_b >= lvl_a)
    zero_lvl, zero_into, zero_need = levels.level_from_xp(0)
    check("0 XP is level 0 with a sane bar",
          zero_lvl == 0 and zero_need > 0 and 0 <= zero_into <= zero_need,
          f"lvl={zero_lvl} into={zero_into} need={zero_need}")

    client.close()


asyncio.run(main())

print()
if FAILURES:
    print(f"{len(FAILURES)} failure(s) of {CHECKS} checks: {', '.join(FAILURES)}")
    sys.exit(1)
print(f"xp uniqueness: all {CHECKS} checks passed "
      "(unique index, lossless dedupe, guild isolation, defaults never reset)")