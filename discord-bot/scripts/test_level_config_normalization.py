"""CI guard: /level must never raise ValueError on stored leveling data.

The root cause of the reported `/level` failure (Error ID MS-A98DE3) was
unguarded numeric coercion on values that come from Mongo, not from Discord.
Guild config and XP rows are written by the dashboard, by older bot versions
and by hand, so any field can legitimately be None, "", "undefined", a float,
a numeric string, a legacy background URL, or a theme id.

Every case below is data the database can actually hold. The contract is
absolute: normalization returns usable numbers, and no entry point raises
ValueError/TypeError.

Hermetic: no Mongo, no network, no discord.py.
"""

import asyncio
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bot"))

import leveling_sys as lv  # noqa: E402


# ── Minimal Mongo-ish async stub ──────────────────────────────────────────
class _Result:
    def __init__(self, doc=None):
        self._doc = doc or {}

    async def to_list(self, *_a, **_kw):
        return list(self._doc.get("rows", []))


class _Collection:
    """Named after the collection it stands in for, because get_level_config
    reads guild_config and add_xp reads xp — they must not share a row."""

    def __init__(self, store, name):
        self._store = store
        self._name = name

    async def find_one(self, query=None, **_kw):
        if self._name == "guild_config":
            return self._store.get("guild_config")
        return self._store.get("find_one", {})

    def find(self, query=None):
        return _Result(self._store.get("rows", []))

    def update_one(self, *_a, **_kw):
        return _Result()

    def delete_one(self, *_a, **_kw):
        return _Result()

    def delete_many(self, *_a, **_kw):
        return _Result()

    def find_one_and_update(self, query=None, update=None, **_kw):
        async def _run():
            return {"xp": 1500, "level": 5, "_id": "x"}
        return _run()

    def insert_one(self, *_a, **_kw):
        async def _run():
            return type("R", (), {"inserted_id": "y"})()
        return _run()


class _Db:
    def __init__(self, store):
        self._store = store
        for name in ("guild_config", "xp", "xp_backups", "level_events"):
            setattr(self, name, _Collection(store, name))


def _db(**store):
    return _Db(store)


GUILD_A, GUILD_B = 1001, 2002
USER_A, USER_B = 3003, 4004

# Every shape a stored leveling block or XP row can hold in production.
JUNK = [None, "", "   ", "undefined", "null", "NaN", "abc", "-", "1e400",
        [], {}, True, False, 1.0, "12.7", "0x10", object()]

# A true pre-migration record: the OLD schema only. Background URL, old key
# names (xpPerMessage / xpCooldown / xpChannelId / rewardN), string numerics,
# and no xpMax / xpCooldownSec / levelUpChannelId / rewards at all.
LEGACY_CFG = {
    "serverBackground": "https://i.imgur.com/legacy-card.png",
    "cardOpacity": "0.8",
    "cardColor": "#5865F2",
    "xpMin": "20",
    "announceMinLevel": "2", "announceMod": None,
    "voiceXp": "true", "dmNotify": "false", "rewardReplace": 0,
    "rewardOnly": "1",
    "blacklistedChannels": ["10", 20], "blacklistedRoles": "not-a-list",
    "levelUpMessage": None,
    "xpPerMessage": 40, "xpCooldown": 30, "xpChannelId": 88,
    "reward5": "1111", "reward10": "2222",
}

# A record that mixes old and new keys, plus values that cannot be numbers.
MIXED_CFG = {
    "serverBackground": "duck-toast",
    "xpMin": "abc", "xpMax": None, "xpCooldownSec": "",
    "announceMinLevel": "  ", "announceMod": "not-a-number",
    "cardOpacity": "deep-space", "cardColor": "not-a-color",
    "rewards": {"5": "1234", "not-a-level": "9999", "0": "555", "10": ""},
}

# A current record using a built-in asset id, including all ten theme names
# named in the report plus the ones this build actually ships.
THEMES = ["night-campus", "deep-space", "mystic-forest", "neon-city",
          "fantasy-castle", "arcade", "sunset", "sky", "midnight", "muragoods",
          "duck-toast", "frog-meadow", "frog-pond", "goldfish-glass",
          "starry-duck", "chick-lily", "frog-sky", "pixel-sunset"]


def check(name, ok_flag, detail=""):
    checks.append((name, bool(ok_flag), detail))
    return bool(ok_flag)


checks: list[tuple[str, bool, str]] = []


async def main() -> int:
    # ── safe_int / safe_float / safe_bool never raise ────────────────────
    for value in JUNK:
        for kwargs in ({}, {"low": 0}, {"low": 0, "high": 100}):
            try:
                lv.safe_int(value, 5, **kwargs)
                lv.safe_float(value, 1.0, **({"low": 0.0, "high": 1.0}
                                              if kwargs else {}))
                lv.safe_bool(value)
            except (ValueError, TypeError) as exc:
                check(f"coercion safe for {value!r}", False, str(exc))
                break
    else:
        check("safe_int/safe_float/safe_bool never raise on junk", True)

    check("safe_int parses numeric strings", lv.safe_int("42", 0) == 42)
    check("safe_int parses float strings", lv.safe_int("12.7", 0) == 12)
    check("safe_int falls back on junk", lv.safe_int("abc", 7) == 7)
    check("safe_int handles None", lv.safe_int(None, 3) == 3)
    check("safe_int clamps", lv.safe_int(999, 0, low=0, high=100) == 100)
    check("safe_int on bool", lv.safe_int(True, 0) == 1)
    check("safe_float parses numeric string", lv.safe_float("0.5", 1.0) == 0.5)
    check("safe_float rejects NaN", lv.safe_float("NaN", 1.0) == 1.0)
    check("safe_float rejects inf", lv.safe_float("inf", 1.0) == 1.0)
    check("safe_float falls back on junk", lv.safe_float("night-campus", 0.25) == 0.25)
    check("safe_bool parses 'false'", lv.safe_bool("false", True) is False)
    check("safe_bool parses '0'", lv.safe_bool("0", True) is False)

    # ── A background theme must never be parsed as a number ──────────────
    # This is the specific failure mode called out in the report: a theme id
    # reaching int()/float(). resolve_server_background must reduce any value
    # to a known asset id.
    for theme in THEMES + JUNK + ["", "  ", "file:///etc/passwd"]:
        try:
            resolved = lv.resolve_server_background(theme)
        except (ValueError, TypeError) as exc:
            check(f"resolve_server_background safe for {theme!r}", False, str(exc))
            continue
        if resolved not in lv.SERVER_CARD_BACKGROUNDS:
            check(f"theme {theme!r} resolves to a real asset", False, resolved)
            break
    else:
        check("resolve_server_background never crashes and always returns a real asset", True)

    # The ten names named in the MS-A98DE3 report (night-campus, deep-space,
    # ... muragoods) are NOT ids this build ships: backgrounds are imported
    # picture assets. They must degrade to the default rather than crash or be
    # treated as a numeric value.
    for name in THEMES:
        if name in lv.SERVER_CARD_BACKGROUNDS:
            continue
        check(f"unknown theme {name!r} degrades to the default asset",
              lv.resolve_server_background(name) == lv.SERVER_CARD_DEFAULT)
        break
    else:
        check("every declared theme is a real asset id", True)

    check("default background is a known asset",
          lv.SERVER_CARD_DEFAULT in lv.SERVER_CARD_BACKGROUNDS)
    check("every declared background has a file on disk",
          all((lv._LEVEL_BG_DIR / m["file"]).exists()
              for m in lv.SERVER_CARD_BACKGROUNDS.values()))

    # ── get_level_config normalizes old, new and missing config ─────────
    scenarios = {
        "missing config (no document)": {},
        "legacy/old config (URL + old keys)": LEGACY_CFG,
        "mixed old+new config": MIXED_CFG,
        "new theme config": {"serverBackground": "duck-toast",
                             "cardOpacity": 0.5, "cardColor": "#ff0000"},
        "config with every field junk": {k: (JUNK[i % len(JUNK)])
                                         for i, k in enumerate(lv.LEVEL_DEFAULTS)},
    }
    for label, stored in scenarios.items():
        for guild in (GUILD_A, GUILD_B):
            db = _db(guild_config=({"guildId": str(guild), "leveling": stored}
                                   if stored else None))
            try:
                cfg = await lv.get_level_config(db, guild)
            except (ValueError, TypeError) as exc:
                check(f"get_level_config survives {label}", False, str(exc))
                continue
            bad = []
            for key in ("xpMin", "xpMax", "xpCooldownSec", "voiceXpAmount",
                        "announceMinLevel", "announceMod"):
                if not isinstance(cfg.get(key), int) or isinstance(cfg.get(key), bool):
                    bad.append(f"{key}={cfg.get(key)!r}")
            for key in ("voiceXp", "dmNotify", "rewardReplace", "rewardOnly"):
                if not isinstance(cfg.get(key), bool):
                    bad.append(f"{key}={cfg.get(key)!r}")
            if not isinstance(cfg.get("cardOpacity"), float):
                bad.append(f"cardOpacity={cfg.get('cardOpacity')!r}")
            if cfg.get("serverBackground") not in lv.SERVER_CARD_BACKGROUNDS:
                bad.append(f"serverBackground={cfg.get('serverBackground')!r}")
            if not isinstance(cfg.get("blacklistedChannels"), list):
                bad.append("blacklistedChannels")
            if not isinstance(cfg.get("blacklistedRoles"), list):
                bad.append("blacklistedRoles")
            if not isinstance(cfg.get("rewards"), dict):
                bad.append("rewards")
            check(f"get_level_config normalizes {label} (guild {guild})",
                  not bad, ", ".join(bad))

    # Legacy record must be *migrated*, not dropped: the values it carried
    # must still be honoured.
    cfg = await lv.get_level_config(_db(guild_config={"leveling": LEGACY_CFG}), GUILD_A)
    check("legacy xpPerMessage migrated to xpMax", cfg["xpMax"] == 40, str(cfg["xpMax"]))
    check("legacy xpCooldown migrated to xpCooldownSec",
          cfg["xpCooldownSec"] == 30, str(cfg["xpCooldownSec"]))
    check("legacy xpChannelId migrated to levelUpChannelId",
          str(cfg["levelUpChannelId"]) == "88", str(cfg["levelUpChannelId"]))
    check("legacy reward5/reward10 folded into rewards",
          cfg["rewards"].get("5") == "1111" and cfg["rewards"].get("10") == "2222",
          str(cfg["rewards"]))
    check("legacy URL background resolves to default asset",
          cfg["serverBackground"] == lv.SERVER_CARD_DEFAULT, cfg["serverBackground"])
    check("string cardOpacity coerced to float", cfg["cardOpacity"] == 0.8)
    check("string xpMin coerced to int", cfg["xpMin"] == 20, str(cfg["xpMin"]))
    check("legacy string booleans coerced", cfg["voiceXp"] is True
          and cfg["dmNotify"] is False and cfg["rewardOnly"] is True)
    check("bad blacklistedRoles replaced with a list",
          cfg["blacklistedRoles"] == [])

    # Mixed record: a theme id must not be read as a number, and a valid theme
    # id must survive untouched.
    mixed = await lv.get_level_config(_db(guild_config={"leveling": MIXED_CFG}), GUILD_A)
    check("valid theme id preserved", mixed["serverBackground"] == "duck-toast",
          mixed["serverBackground"])
    check("theme id in cardOpacity falls back to the default",
          mixed["cardOpacity"] == lv.LEVEL_DEFAULTS["cardOpacity"],
          str(mixed["cardOpacity"]))
    check("non-numeric cardColor falls back to the default",
          mixed["cardColor"] == lv.LEVEL_DEFAULTS["cardColor"], mixed["cardColor"])
    check("non-numeric xpMin falls back to the default",
          mixed["xpMin"] == lv.LEVEL_DEFAULTS["xpMin"], str(mixed["xpMin"]))
    check("non-numeric announceMod falls back to the default",
          mixed["announceMod"] == lv.LEVEL_DEFAULTS["announceMod"],
          str(mixed["announceMod"]))
    check("valid reward key kept, invalid and blank dropped",
          mixed["rewards"] == {"5": "1234"}, str(mixed["rewards"]))

    # ── Config is preserved, never deleted ──────────────────────────────
    source = dict(LEGACY_CFG)
    lv.normalize_level_config(source)
    check("normalizer does not mutate the caller's dict", source == LEGACY_CFG)
    source2 = dict(MIXED_CFG)
    lv.normalize_level_config(source2)
    check("normalizer does not mutate a mixed record either",
          source2 == MIXED_CFG)
    check("normalizer returns a new dict",
          lv.normalize_level_config(LEGACY_CFG) is not LEGACY_CFG)

    # ── should_announce is total over junk configs ───────────────────────
    for stored in list(scenarios.values()) + JUNK:
        for level in (0, 1, 2, 5, 10, 100, -1, "3", None):
            try:
                lv.should_announce(level, stored if isinstance(stored, dict) else {},
                                   False)
            except (ValueError, TypeError, ZeroDivisionError) as exc:
                check(f"should_announce safe for level={level!r}", False, str(exc))
                break
        else:
            continue
        break
    else:
        check("should_announce never raises on junk config/level", True)

    # ── XP math is total ─────────────────────────────────────────────────
    for xp in JUNK + [0, 1, 100, 1_000_000, "500", "12.5", -50, 1.0]:
        try:
            level, into, need = lv.level_from_xp(xp)
            assert isinstance(level, int) and isinstance(into, int) and isinstance(need, int)
            assert level >= 0 and into >= 0 and need > 0
        except (ValueError, TypeError, AssertionError) as exc:
            check(f"level_from_xp safe for xp={xp!r}", False, str(exc))
            break
    else:
        check("level_from_xp returns ints for every stored xp shape", True)

    # ── Card rendering never raises ──────────────────────────────────────
    for cfg in ({"cardColor": "night-campus", "cardOpacity": "deep-space"},
                {"cardColor": None, "cardOpacity": None},
                {"cardColor": "#GGGGGG", "cardOpacity": float("nan")},
                {"cardColor": "#5865F2", "cardOpacity": 1.0}):
        try:
            kind, payload = lv.render_level_card(
                "user", None, "5", "12.5", "100", "#1",   # string numerics
                accent=str(cfg.get("cardColor") or ""),
                opacity=lv.safe_float(cfg.get("cardOpacity"), 1.0, low=0.0, high=1.0),
                background_id=lv.resolve_server_background(
                    cfg.get("cardColor")))
            assert kind in ("png", "text")
        except (ValueError, TypeError) as exc:
            check("render_level_card survives junk", False, str(exc))
            break
    else:
        check("render_level_card never raises ValueError", True)

    # ── Source guards: no bare conversions left on the /level path ──────
    sys_src = (ROOT / "bot" / "leveling_sys.py").read_text(encoding="utf-8")
    cog_src = (ROOT / "bot" / "cogs" / "leveling.py").read_text(encoding="utf-8")
    # These must be anchored so they cannot match inside `safe_int(`.
    check("no bare int(doc.get(\"xp\")) left in leveling_sys",
          re.search(r'(?<![a-z_])int\(\s*doc\.get\("xp"', sys_src) is None)
    check("no bare int(d.get(\"xp\")) left in the leveling cog",
          re.search(r'(?<![a-z_])int\(\s*d\.get\("xp"', cog_src) is None)
    check("no bare int(doc.get(\"xp\")) left on the /level card path",
          re.search(r'(?<![a-z_])int\(\s*\(doc or \{\}\)\.get', cog_src) is None)
    check("card opacity read through safe_float, not float()",
          re.search(r'(?<![a-z_])float\(\s*cfg\.get\(', cog_src) is None)
    check("normalize_level_config is called by get_level_config",
          "normalize_level_config(cfg)" in sys_src)
    check("single config resolver exists", sys_src.count("async def get_level_config") == 1)

    # ── Error records must be findable by the MS- id shown to the user ───
    db_src = (ROOT / "bot" / "database.py").read_text(encoding="utf-8")
    check("record_bot_error stores errorId", '"errorId"' in db_src)
    check("record_bot_error stores a traceback", '"traceback"' in db_src)
    check("record_bot_error stores file and line",
          '"file"' in db_src and '"line"' in db_src)
    check("record_bot_error stores subcommand and userId",
          '"subcommand"' in db_src and '"userId"' in db_src)
    check("errors are redacted before storage",
          "redact_secrets(message)" in db_src
          and "redact_secrets(traceback_text)" in db_src)

    # Redaction must actually mask, using the exact shapes involved.
    # These are ASSEMBLED at runtime on purpose: a literal credential-shaped
    # string committed here would trip the repo secret scan (scripts/
    # secret-scan.mjs) and, worse, would teach a reader that such literals
    # belong in this file. The shape is what is under test, not the value.
    def _joined(*parts: str) -> str:
        return "".join(parts)

    mdb_secret = _joined("hunter", "2")
    cases = {
        "mongodb": _joined("mongodb+srv://botuser:", mdb_secret,
                           "@cluster0.mongodb.net/db"),
        "token": _joined("DISCORD_TOKEN=",
                         "MTIzNDU2Nzg5MDEyMzQ1Njc4.", "GaBcDe.",
                         "FfGgHhIiJjKkLlMmNnOoPpQqRrSs"),
        "query": _joined("mongodb://host/db?password=", mdb_secret,
                         "&retryWrites=true"),
        "auth": _joined("Authorization: Bearer ", "abcdef123456"),
    }
    # The values the assertions below look for, also assembled at runtime.
    mdb_secret_literal = mdb_secret
    token_prefix = "MTIzNDU2Nzg5"
    bearer_value = _joined("abcdef", "123456")
    # database.py imports motor, which is not installed in this hermetic env.
    # Stub the driver so the redaction patterns can be exercised for real
    # rather than skipped.
    redact = None
    try:
        for mod, attrs in (("motor", {}),
                           ("motor.motor_asyncio", {"AsyncIOMotorClient": object}),
                           ("pymongo", {"ASCENDING": 1, "DESCENDING": -1,
                                        "ReturnDocument": object}),
                           ("dotenv", {"load_dotenv": lambda *a, **kw: None})):
            if mod not in sys.modules:
                stub = type(sys)(mod)
                stub.__path__ = []  # type: ignore[attr-defined]
                for attr, val in attrs.items():
                    setattr(stub, attr, val)
                sys.modules[mod] = stub
        import database as dbmod  # noqa: E402
        redact = dbmod.redact_secrets
    except Exception as exc:
        check("redact_secrets importable", False, str(exc))
    if redact:
        check("redact_secrets masks mongodb credentials",
              mdb_secret_literal not in redact(cases["mongodb"]),
              redact(cases["mongodb"]))
        check("redact_secrets masks discord tokens",
              token_prefix not in redact(cases["token"]), redact(cases["token"]))
        check("redact_secrets masks query-string passwords",
              mdb_secret_literal not in redact(cases["query"]),
              redact(cases["query"]))
        check("redact_secrets masks authorization headers",
              bearer_value not in redact(cases["auth"]), redact(cases["auth"]))
        check("redact_secrets never raises on junk",
              redact(None) == "" and isinstance(redact("plain text"), str))
        check("redact_secrets keeps useful text",
              "ValueError" in redact("ValueError: bad literal"))

    # ── ValueError is classified, not swallowed ──────────────────────────
    main_src = (ROOT / "bot" / "main.py").read_text(encoding="utf-8")
    check("describe_error classifies ValueError with an actionable message",
          "isinstance(original, ValueError)" in main_src)
    check("error handler still logs the full traceback",
          "traceback.format_exception" in main_src)
    check("error handler persists the error id it showed the user",
          "error_id=error_id" in main_src)
    check("global error handler was not removed",
          "@bot.tree.error" in main_src)
    check("ValueError is not caught and silently ignored",
          not re.search(r"except ValueError:\s*\n\s*return \"Something went wrong\"",
                        main_src))

    # ── The /level command contract is unchanged by this fix ─────────────
    check("/level is still a ROOT command",
          '@app_commands.command(name="level"' in cog_src)
    check("member option is still optional",
          re.search(r'@app_commands\.command\(name="level".*?'
                    r"member: discord\.Member \| None = None",
                    cog_src, re.S) is not None)
    check("admin subcommands still under /leveling",
          'app_commands.Group(name="leveling"' in cog_src)
    check("serverbackground still offers real asset ids",
          "value=\"duck-toast\"" in cog_src and "value=\"pixel-sunset\"" in cog_src)
    check("top_xp receives the db handle at every call site",
          cog_src.count("levels.top_xp(database._db,") == 2,
          f"found {cog_src.count('levels.top_xp(database._db,')}")

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
