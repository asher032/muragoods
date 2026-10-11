"""General settings: the dashboard's language, and Murabot's welcome/leave.

Run: python discord-bot/scripts/test_general_settings.py

Phase 2 of the Murabot work adds a per-server LANGUAGE plus configurable
welcome/leave notices. Two facts make that real rather than decorative, and
this suite pins both:

  * the language codes the dashboard offers are exactly the codes Murabot can
    speak — asserted across the language boundary by reading the TypeScript
    source (`app/lib/general-settings.ts`), the same way
    `test_db_architecture.py` asserts the shared Mongo variable on both sides;
  * every language declares every string, so a half-translated language cannot
    fall back to English mid-message.

It also asserts the structural half, by parsing sources instead of trusting
prose: `/config/refresh` may store only the declared general fields and may
never write the command prefix (that has one writer), the route is registered
after its handler is defined (a forward reference would abort the whole health
server — see `scripts/check_route_registration.py`), and the member notices go
through `i18n` instead of a hardcoded English sentence.
"""

from __future__ import annotations

import ast
import asyncio
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
sys.path.insert(0, str(ROOT / "bot"))

import i18n  # noqa: E402

PASSED = 0
FAILED: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    global PASSED
    if condition:
        PASSED += 1
        print(f"  ✓ {label}")
        return
    FAILED.append(label)
    print(f"  ✗ {label}" + (f"\n      {detail}" if detail else ""))


# ── The table is complete ────────────────────────────────────────────────

def test_table() -> None:
    print("\n── i18n table ──")
    codes = i18n.supported_language_codes()
    check("at least one language is declared", len(codes) > 0)
    check("the default language is declared", i18n.DEFAULT_LANGUAGE in codes)

    keys = set()
    for code, table in i18n.LANGUAGES.items():
        keys |= set(table)
    check("the table declares the join/leave strings",
          {"join.title", "join.body", "leave.title", "leave.body"} <= keys,
          f"declared keys: {sorted(keys)}")

    for code, table in i18n.LANGUAGES.items():
        missing = sorted(keys - set(table))
        check(f"{code} declares every string (no mid-message English fallback)",
              not missing, f"missing: {missing}")


# ── Resolution ───────────────────────────────────────────────────────────

def test_resolution() -> None:
    print("\n── language resolution ──")
    check("an unsupported code is refused, not silently defaulted",
          i18n.normalize_language("klingon") is None)
    check("an empty value is refused", i18n.normalize_language("") is None)
    check("a non-string is refused", i18n.normalize_language(7) is None)
    for raw, expected in [("en", "en"), ("EN", "en"), (" en ", "en"),
                          ("en-US", "en"), ("pt_BR", None)]:
        check(f"normalize_language({raw!r}) → {expected!r}",
              i18n.normalize_language(raw) == expected,
              f"got {i18n.normalize_language(raw)!r}")

    check("a guild with no language gets the default",
          i18n.resolve_language({}) == i18n.DEFAULT_LANGUAGE)
    check("a guild with a bad language gets the default, not a crash",
          i18n.resolve_language({"language": "xx"}) == i18n.DEFAULT_LANGUAGE)
    check("a guild's stored language wins",
          i18n.resolve_language({"language": "de"}) == "de")
    check("a bare code is accepted as well as a config document",
          i18n.resolve_language("es") == "es")


# ── Templates ────────────────────────────────────────────────────────────

def test_templates() -> None:
    print("\n── messages ──")
    for code in i18n.supported_language_codes():
        cfg = {"language": code}
        body = i18n.t(cfg, "join.body", user="<@1>", username="Ada",
                      server="Muragoods", member_count=42)
        check(f"{code}/join renders its placeholders and leaves no braces",
              "<@1>" in body and "{" not in body, body)
        check(f"{code}/leave title is non-empty", bool(i18n.t(cfg, "leave.title")))
        check(f"{code}/label resolves", bool(i18n.label(code)))

    check("an unknown key yields an empty string rather than raising",
          i18n.t({"language": "en"}, "nope.title") == "")

    # The operator's own words win, in whatever language they wrote them.
    check("a server's own message is used verbatim (with placeholders)",
          i18n.render_message({"language": "de"}, "Hey {user}!", "leave.body",
                              user="<@1>") == "Hey <@1>!")
    check("a whitespace-only message is treated as unset, not as a message",
          i18n.render_message({"language": "de"}, "   ", "leave.body",
                              user="<@1>") == i18n.t({"language": "de"}, "leave.body",
                                                     user="<@1>"))
    check("an unknown placeholder is left exactly as written",
          i18n.fill("{nope} {user}", {"user": "<@1>"}) == "{nope} <@1>")


# ── The dashboard speaks the same languages ──────────────────────────────

def test_dashboard_agreement() -> None:
    print("\n── dashboard agreement ──")
    ts_path = REPO / "app" / "lib" / "general-settings.ts"
    check("the dashboard declares the general-settings schema",
          ts_path.exists(), str(ts_path))
    if not ts_path.exists():
        return
    ts = ts_path.read_text(encoding="utf-8")
    declared = set(re.findall(r"code:\s*'([a-z]{2})'", ts))
    check("the dashboard offers exactly the languages Murabot speaks",
          declared == set(i18n.supported_language_codes()),
          f"dashboard: {sorted(declared)} vs bot: {sorted(i18n.supported_language_codes())}")
    check("the dashboard's default language matches the bot's",
          re.search(r"DEFAULT_LANGUAGE\s*=\s*'([a-z]{2})'", ts)
          and re.search(r"DEFAULT_LANGUAGE\s*=\s*'([a-z]{2})'", ts).group(1)
          == i18n.DEFAULT_LANGUAGE)
    check("the dashboard accepts the same placeholders",
          all("{" + name + "}" in ts for name in i18n.PLACEHOLDERS),
          f"missing: {[n for n in i18n.PLACEHOLDERS if '{' + n + '}' not in ts]}")


# ── The bridge endpoint ──────────────────────────────────────────────────

def test_bridge_endpoint() -> None:
    print("\n── /config/refresh ──")
    src = (ROOT / "bot" / "main.py").read_text(encoding="utf-8")
    tree = ast.parse(src)

    handler_line = None
    for node in ast.walk(tree):
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "config_refresh":
            handler_line = node.lineno
    check("main.py defines the config_refresh handler", handler_line is not None)

    if handler_line is not None:
        register = re.search(r'app\.router\.add_post\("/config/refresh",\s*config_refresh\)', src)
        check("the route is registered", register is not None)
        check("the route is registered AFTER its handler is defined",
              register is not None and src[:register.start()].count("\n") + 1 > handler_line,
              "a forward reference aborts _health_server() and the bot serves nothing")

    block = src[src.find("GENERAL_CONFIG_FIELDS = ("):]
    block = block[:block.find(")\n") + 1]
    fields = set(re.findall(r'"([a-zA-Z]+)"', block))
    check("the endpoint declares exactly the general fields it may store",
          fields == {"language", "welcomeChannelId", "welcomeMessage",
                     "leaveChannelId", "leaveMessage"},
          f"declared: {sorted(fields)}")
    check("the endpoint never writes the command prefix (one writer only)",
          "prefix" not in fields and "router.add_post(\"/config/refresh\"" in src)
    check("the endpoint answers with a read-back of stored values, not an echo",
          '"general": {key: stored.get(key) for key in GENERAL_CONFIG_FIELDS}' in src)
    check("an unsupported language is refused with a specific code",
          'INVALID_LANGUAGE' in src)


# ── The member notices ───────────────────────────────────────────────────

def test_member_notices() -> None:
    print("\n── welcome / leave notices ──")
    src = (ROOT / "bot" / "cogs" / "community.py").read_text(encoding="utf-8")
    check("community imports the language table", re.search(r"^import i18n$", src, re.M) is not None)
    check("a join notice exists", "async def on_member_join" in src)
    check("the leave notice exists", "async def on_member_remove" in src)
    check("both notices render through i18n",
          src.count('i18n.render_message(cfg, custom_message') == 1
          and "i18n.t(cfg, f\"{kind}.title\")" in src)
    check("the join notice reads welcomeChannelId",
          'cfg.get("welcomeChannelId")' in src)
    check("the leave notice reads leaveChannelId",
          'cfg.get("leaveChannelId")' in src)
    check("the old hardcoded English leave sentence is gone",
          "left {member.guild.name}." not in src)
    check("the operator's own message is preferred over the default",
          'cfg.get("welcomeMessage")' in src and 'cfg.get("leaveMessage")' in src)
    check("a failed config read cannot break the gateway event",
          src.count("log.warning(\"Welcome config lookup failed\"") == 1
          and src.count("log.warning(\"Leave config lookup failed\"") == 1)


# ── Persistence ─────────────────────────────────────────────────────────

class _StubResult:
    """The two attributes `set_guild_config`'s caller path can observe."""

    def __init__(self, matched: int, upserted) -> None:
        self.matched_count = matched
        self.upserted_id = upserted


class _StubCollection:
    """A driver stub: the `$set`/upsert semantics, nothing more.

    Deliberately NOT a mock of the functions under test — `database.set_guild_config`
    and `get_guild_config` run for real against this, so a change from `$set` to a
    document replacement (which would silently drop every other field the bot
    stores in the same document) fails here.
    """

    def __init__(self) -> None:
        self.docs: list[dict] = []

    async def find_one(self, filt: dict | None = None, projection: dict | None = None):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in (filt or {}).items()):
                return dict(doc)
        return None

    async def update_one(self, filt: dict, update: dict, upsert: bool = False):
        for doc in self.docs:
            if all(doc.get(k) == v for k, v in (filt or {}).items()):
                doc.update(update.get("$set", {}))
                return _StubResult(1, None)
        if not upsert:
            return _StubResult(0, None)
        created = dict(filt or {})
        created.update(update.get("$set", {}))
        self.docs.append(created)
        return _StubResult(0, "new")


class _StubDb:
    def __init__(self) -> None:
        self.guild_config = _StubCollection()


def test_persistence() -> None:
    """What the dashboard writes is what Murabot reads and applies.

    Self-contained on purpose: the assertions drive the REAL
    `database.set_guild_config` / `get_guild_config` through a driver stub, so
    this suite needs no other test module to be present in the repository.
    """
    print("\n── persistence round trip ──")
    try:
        import database as db  # noqa: PLC0415
    except Exception as exc:  # pragma: no cover - dependency missing
        check("the database layer can be loaded for the round-trip test", False, str(exc)[:200])
        return

    guild = "123456789012345678"

    async def write_then_read() -> dict:
        db._db = _StubDb()
        # Two separate saves, the way the dashboard writes: the general fields
        # first, then the messages. A merge that replaced the document would
        # lose the channels.
        await db.set_guild_config(guild, {"language": "de", "welcomeChannelId": "42",
                                          "leaveChannelId": "43"})
        await db.set_guild_config(guild, {"welcomeMessage": "Hallo {user}", "leaveMessage": ""})
        return await db.get_guild_config(guild)

    cfg = asyncio.run(write_then_read())
    check("the stored configuration reads back for the right guild",
          cfg.get("guildId") == guild, str(cfg.get("guildId")))
    check("the saved language is the language Murabot will speak",
          i18n.resolve_language(cfg) == "de", str(cfg.get("language")))
    check("a second save does not drop fields written by the first",
          cfg.get("welcomeChannelId") == "42" and cfg.get("leaveChannelId") == "43")
    check("the operator's own message is used verbatim, with placeholders filled",
          i18n.render_message(cfg, cfg.get("welcomeMessage"), "join.body",
                              user="<@1>", username="Ada", server="S",
                              member_count=3) == "Hallo <@1>")
    check("an empty message falls back to the localized default",
          i18n.render_message(cfg, cfg.get("leaveMessage"), "leave.body", user="<@1>")
          == i18n.t(cfg, "leave.body", user="<@1>"))
    check("the notice title follows the stored language, not English",
          i18n.t(cfg, "join.title") == i18n.LANGUAGES["de"]["join.title"])

    async def write_unsupported() -> dict:
        db._db = _StubDb()
        # A hand-edited document must not break the member-join path.
        await db.set_guild_config(guild, {"language": "klingon"})
        return await db.get_guild_config(guild)

    bad = asyncio.run(write_unsupported())
    check("an unsupported language stored by hand resolves to the default",
          i18n.resolve_language(bad) == i18n.DEFAULT_LANGUAGE)
    check("and its notices still render",
          bool(i18n.t(bad, "join.title")) and bool(i18n.t(bad, "leave.body", user="<@1>")))

    # A guild with no document at all is the common case for a server that has
    # never been configured — the notices must still work, from the defaults.
    async def read_missing() -> dict:
        db._db = _StubDb()
        return await db.get_guild_config(guild)

    fresh = asyncio.run(read_missing())
    check("a guild that was never configured reads back defaults, not an error",
          fresh.get("guildId") == guild)
    check("and its notices render from the default language",
          i18n.resolve_language(fresh) == i18n.DEFAULT_LANGUAGE
          and "<@1>" in i18n.t(fresh, "join.body", user="<@1>"))


def main() -> int:
    test_table()
    test_resolution()
    test_templates()
    test_dashboard_agreement()
    test_bridge_endpoint()
    test_member_notices()
    test_persistence()
    print(f"\n{PASSED} passed, {len(FAILED)} failed")
    if FAILED:
        print("FAILED:")
        for label in FAILED:
            print(f"  - {label}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
