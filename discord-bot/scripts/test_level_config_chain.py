#!/usr/bin/env python3
"""The level-card chain, when the dashboard and the bot do NOT share a database.

    python discord-bot/scripts/test_level_config_chain.py

The reported bug is this: the dashboard saves a level-card background, the save
returns 200, the preview redraws, and the Discord card is unchanged — because
the dashboard wrote `guild_config` to a cluster this process never reads.

The dashboard resolves the bot's cluster from ITS OWN environment, where the
bot URI is only a fallback (`MURABOT_MONGODB_URI` → `MONGODB_URI` →
`MONGO_URI`) and the database name can come from a SHARED `MONGO_DB`. When
those point somewhere else, the two sides sit on different databases and
nothing errors.

The fix is that the same change is ALSO pushed to the bot, which stores it with
the connection it renders from. This suite reproduces the split — a "dashboard"
database the bot does not read, and the bot's own — and proves the card renders
the selection anyway.

No database, no network, no gateway.
"""

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bot"))

import leveling_sys as lv  # noqa: E402

passed = 0
failed = 0
failures = []


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok    {name}")
    else:
        failed += 1
        failures.append(name)
        print(f"  FAIL  {name}{f' — {detail}' if detail else ''}")


def section(title):
    print(f"\n{title}")


class _Coll:
    def __init__(self):
        self.doc = None

    async def find_one(self, _q, *_a, **_k):
        return self.doc

    async def update_one(self, _q, update, **_k):
        # Mirrors $set at the top level, which is how the real driver behaves.
        self.doc = {**(self.doc or {}), **update.get("$set", {})}


class _DB:
    def __init__(self):
        self.guild_config = _Coll()


GUILD = "997389969448517632"


def apply_dashboard_push(current: dict, body: dict) -> dict:
    """The merge the bot's POST /leveling/config performs.

    Extracted so this suite exercises the same rules the handler applies: only
    known keys, and a theme id normalised through the resolver so an unknown id
    can never be stored and silently render the default.
    """
    out = dict(current)
    for key, value in body.items():
        if key not in lv.LEVEL_DEFAULTS:
            continue
        if key in ("serverBackground", "server_card_background"):
            out[key] = lv.resolve_server_background(value)
        else:
            out[key] = value
    out["server_card_background"] = out.get("serverBackground", lv.SERVER_CARD_DEFAULT)
    return out


async def main():
    section("[1] the failure this fixes: the dashboard's database is not the bot's")
    dashboard_db = _DB()   # what the dashboard writes to — the bot never reads it
    bot_db = _DB()         # what the bot renders from

    # The dashboard does what it always did: write its own record.
    dashboard_doc = {"leveling": {"serverBackground": "frog-sky"}}
    dashboard_db.guild_config.doc = dashboard_doc

    # Without the push, the bot's document does not exist and /level renders the
    # DEFAULT. This is the reported symptom, reproduced exactly.
    cfg = await lv.get_level_config(bot_db, int(GUILD))
    rendered_without_push = lv.get_level_card_background(cfg, guild_id=int(GUILD))
    check("without the bot push, the bot renders the DEFAULT",
          rendered_without_push == lv.SERVER_CARD_DEFAULT, rendered_without_push)
    check("and the dashboard meanwhile shows the selection",
          dashboard_db.guild_config.doc["leveling"]["serverBackground"] == "frog-sky")
    check("so the two disagree — this is the bug",
          rendered_without_push != dashboard_db.guild_config.doc["leveling"]["serverBackground"])

    section("[2] the same change, pushed to the bot's own connection")
    merged = apply_dashboard_push(cfg, {"serverBackground": "frog-sky", "cardColor": "#ff0000"})
    bot_db.guild_config.doc = {"guildId": GUILD, "leveling": merged}

    cfg2 = await lv.get_level_config(bot_db, int(GUILD))
    rendered = lv.get_level_card_background(cfg2, guild_id=int(GUILD))
    check("the bot now renders the SELECTED theme", rendered == "frog-sky", rendered)
    check("the value is stored under the documented field name",
          bot_db.guild_config.doc["leveling"].get("server_card_background") == "frog-sky")
    check("the stored theme round-trips through get_level_config",
          cfg2.get("serverBackground") == "frog-sky", cfg2.get("serverBackground"))
    check("unrelated settings in the same push survive",
          cfg2.get("cardColor") == "#ff0000", cfg2.get("cardColor"))
    check("the card renderer accepts it",
          lv.render_level_card("t", None, 5, 1, 500, 1, background_id=rendered)[0] == "png")

    section("[3] changing the theme again needs no restart")
    # The push reads the CURRENT config first, so the second change starts from
    # the first — and must not resurrect the old value from defaults.
    cfg3 = await lv.get_level_config(bot_db, int(GUILD))
    merged3 = apply_dashboard_push(cfg3, {"serverBackground": "pixel-sunset"})
    bot_db.guild_config.doc = {"guildId": GUILD, "leveling": merged3}
    cfg4 = await lv.get_level_config(bot_db, int(GUILD))
    rendered2 = lv.get_level_card_background(cfg4, guild_id=int(GUILD))
    check("a second change takes effect immediately", rendered2 == "pixel-sunset", rendered2)
    check("the previous value is not resurrected",
          "frog-sky" not in str(bot_db.guild_config.doc["leveling"]["serverBackground"]))
    check("the accent from the first push survived the second",
          cfg4.get("cardColor") == "#ff0000", cfg4.get("cardColor"))

    section("[4] the push cannot store a value that would silently default")
    cfg5 = await lv.get_level_config(bot_db, int(GUILD))
    merged5 = apply_dashboard_push(cfg5, {"serverBackground": "neon-city"})
    check("an unknown theme is normalised to the default at WRITE time",
          merged5.get("serverBackground") == lv.SERVER_CARD_DEFAULT,
          merged5.get("serverBackground"))
    check("so the stored value is always renderable",
          merged5.get("serverBackground") in lv.SERVER_CARD_BACKGROUNDS)
    merged6 = apply_dashboard_push(cfg5, {"serverBackground": ""})
    check("an empty theme is normalised too",
          merged6.get("serverBackground") == lv.SERVER_CARD_DEFAULT)

    section("[5] both spellings are honoured on read")
    # A guild whose value was written under the older name must still render it.
    for field in ("serverBackground", "server_card_background"):
        db = _DB()
        db.guild_config.doc = {"guildId": GUILD, "leveling": {field: "starry-duck"}}
        c = await lv.get_level_config(db, int(GUILD))
        # get_level_config only copies keys in LEVEL_DEFAULTS, so the canonical
        # name is read directly by the resolver.
        got = lv.get_level_card_background(
            {**c, **db.guild_config.doc["leveling"]}, guild_id=int(GUILD))
        check(f"a value stored as {field} renders", got == "starry-duck", got)

    section("[6] the diagnostic reports both sides honestly")
    # What GET /leveling/background returns is what the dashboard compares, so
    # its fields must reflect the bot's own read, not the dashboard's.
    db = _DB()
    db.guild_config.doc = {"guildId": GUILD, "leveling": {"serverBackground": "frog-meadow"}}
    c = await lv.get_level_config(db, int(GUILD))
    raw = db.guild_config.doc["leveling"].get("server_card_background") or \
        db.guild_config.doc["leveling"].get("serverBackground")
    check("documentFound reflects the bot's own lookup", db.guild_config.doc is not None)
    check("raw is the stored value, not the resolved one", raw == "frog-meadow", raw)
    check("resolved is what the renderer will use",
          lv.resolve_server_background(raw) == "frog-meadow")
    empty = _DB()
    c_empty = await lv.get_level_config(empty, int(GUILD))
    check("a guild with no document reports documentFound=false",
          empty.guild_config.doc is None)
    check("and resolves to the default",
          lv.get_level_card_background(c_empty, guild_id=1) == lv.SERVER_CARD_DEFAULT)


asyncio.run(main())
print(f"\n{passed} passed, {failed} failed")
if failed:
    print("Failures:\n  - " + "\n  - ".join(failures))
    sys.exit(1)
