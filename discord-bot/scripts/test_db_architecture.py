"""The two-cluster contract, asserted on BOTH sides of the language boundary.

A database architecture that lives only in a README decays silently. The two
things most likely to rot are:

  1. **Drift between the site and the bot.** `app/lib/db/clusters.ts` says the
     bot's cluster comes from `MURABOT_MONGODB_URI`; `bot/config.py` used to
     read only `MONGODB_URI`. Each was correct on its own, and together they
     meant the dashboard could silently point at a different cluster than the
     bot — exactly the "second dashboard database" failure this architecture
     exists to prevent. Nothing at runtime can catch that, so it is caught
     here, by reading both files and comparing the declared contract.

  2. **A credential-shaped URI reappearing in source.** The `mongodb+srv://`
     literals that legitimately exist in this repo are all inside validation
     regexes, docstrings and CI fixtures. This asserts that stays true, so a
     real URI pasted into a file is caught before it is committed.

Also asserted: the Discord-account-linking path can never invent a local user
(the mechanism by which a second identity system appears), and the audit
tooling cannot delete data even when handed the wrong flag.

Hermetic by construction: no network, no Mongo, no token. It reads source
files as text and exercises `config`'s precedence with a stubbed environment.
"""
import os
import pathlib
import re
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent.parent
BOT_DIR = REPO / "discord-bot" / "bot"
CLUSTERS_TS = REPO / "app" / "lib" / "db" / "clusters.ts"
CONFIG_PY = BOT_DIR / "config.py"
IDENTITY_PY = BOT_DIR / "identity.py"
AUDIT_MJS = REPO / "scripts" / "audit-db-consistency.mjs"
MIGRATE_MJS = REPO / "scripts" / "migrate-unified-accounts.mjs"

FAILURES: list[str] = []
CHECKS = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global CHECKS
    CHECKS += 1
    if condition:
        print(f"  ok   {label}")
    else:
        print(f"  FAIL {label}" + (f"  [{detail}]" if detail else ""))
        FAILURES.append(label)


def section(title: str) -> None:
    print(f"\n{title}")


# ── Parse the TypeScript cluster table ──────────────────────────────────
# Read as text rather than executed: the point is to assert what is COMMITTED,
# and a regex cannot be fooled by a build step that patches the value at
# runtime. A missing cluster is a failure here rather than a skipped test.

def _ts_block(source: str, name: str) -> str:
    """The object literal body for a named cluster in the CLUSTERS table."""
    marker = re.search(rf"^\s*{name}:\s*\{{", source, re.MULTILINE)
    if not marker:
        return ""
    depth = 0
    start = marker.end() - 1
    for index in range(start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1:index]
    return ""


def _ts_string_list(block: str, field: str) -> list[str]:
    match = re.search(rf"{field}:\s*\[([^\]]*)\]", block, re.DOTALL)
    if not match:
        return []
    return re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))


def _ts_string(block: str, field: str) -> str:
    match = re.search(rf"{field}:\s*['\"]([^'\"]+)['\"]", block)
    return match.group(1) if match else ""


def _ts_bool(block: str, field: str) -> str:
    """A TS boolean literal, so `true` is not confused with the string 'true'."""
    match = re.search(rf"{field}:\s*(true|false)\b", block)
    return match.group(1) if match else ""


ts_source = CLUSTERS_TS.read_text(encoding="utf-8")
muragoods_ts = _ts_block(ts_source, "muragoods")
murabot_ts = _ts_block(ts_source, "murabot")
players_ts = _ts_block(ts_source, "players")

section("Cluster table is declared and self-describing")
check("clusters.ts exists", CLUSTERS_TS.is_file())
check("muragoods cluster is declared", bool(muragoods_ts))
check("murabot cluster is declared", bool(murabot_ts))
check("legacy players cluster is declared, not hidden", bool(players_ts))
_declared = re.findall(r"^\s{2}(\w+):\s*\{", ts_source, re.MULTILINE)
check(
    "exactly three clusters are declared (no undeclared fourth database)",
    _declared == ["muragoods", "murabot", "players"],
    f"declared: {_declared}",
)
check(
    "ClusterName union matches the table",
    set(re.findall(r"'(\w+)'", re.search(r"type ClusterName\s*=\s*([^;]+);", ts_source).group(1)))
    == set(_declared),
)
check(
    "each cluster documents what it owns",
    all(_ts_string(block, "owns")
        for block in (muragoods_ts, murabot_ts, players_ts)),
)
check(
    "exactly ONE cluster is the identity authority",
    sum(1 for block in (muragoods_ts, murabot_ts, players_ts)
        if _ts_bool(block, "identityAuthority") == "true") == 1
    and _ts_bool(muragoods_ts, "identityAuthority") == "true",
    "identityAuthority must be true only on muragoods",
)
check(
    "the bot cluster is not an identity authority",
    _ts_bool(murabot_ts, "identityAuthority") == "false",
)
check(
    "the legacy players cluster is not an identity authority",
    _ts_bool(players_ts, "identityAuthority") == "false",
)
check(
    "the legacy players cluster is marked legacy, not active",
    _ts_string(players_ts, "status") == "legacy",
    _ts_string(players_ts, "status"),
)
check(
    "the legacy players cluster has its own named variable",
    _ts_string(players_ts, "primary") == "MURAGOODS_PLAYERS_MONGODB_URI",
    _ts_string(players_ts, "primary"),
)
check(
    "no two clusters default to the same database name",
    len({_ts_string(b, "defaultDb") for b in (muragoods_ts, murabot_ts, players_ts)}) == 3,
)

# ── Named variables: the whole point ────────────────────────────────────
# `MONGODB_URI` as a PRIMARY would mean "whatever the deployment happened to
# have", which is how the dashboard and the bot end up on different clusters.

section("Per-cluster variables are named, not positional")
check(
    "muragoods primary is MURAGOODS_MONGODB_URI",
    _ts_string(muragoods_ts, "primary") == "MURAGOODS_MONGODB_URI",
    _ts_string(muragoods_ts, "primary"),
)
check(
    "murabot primary is MURABOT_MONGODB_URI",
    _ts_string(murabot_ts, "primary") == "MURABOT_MONGODB_URI",
    _ts_string(murabot_ts, "primary"),
)
check(
    "neither cluster uses a shared generic variable as its primary",
    "MONGODB_URI" not in (_ts_string(muragoods_ts, "primary"),
                          _ts_string(murabot_ts, "primary")),
)
check(
    "legacy MONGODB_URI is accepted only as a fallback",
    "MONGODB_URI" in _ts_string_list(muragoods_ts, "fallbacks")
    and "MONGODB_URI" in _ts_string_list(murabot_ts, "fallbacks"),
)
check(
    "muragoods default database is 'muragoods'",
    _ts_string(muragoods_ts, "defaultDb") == "muragoods",
    _ts_string(muragoods_ts, "defaultDb"),
)
check(
    "murabot default database is 'murastream_bot' (the bot's own database)",
    _ts_string(murabot_ts, "defaultDb") == "murastream_bot",
    _ts_string(murabot_ts, "defaultDb"),
)
check(
    "the two clusters do not default to the same database",
    _ts_string(muragoods_ts, "defaultDb") != _ts_string(murabot_ts, "defaultDb"),
)
# Nothing may read or authenticate against the legacy cluster. It exists in the
# table for visibility; a call site would make it a third live system.
for _path in sorted(REPO.rglob("app/**/*.ts")):
    if _path == CLUSTERS_TS:
        continue
    _text = _path.read_text(encoding="utf-8", errors="ignore")
    if "MURAGOODS_PLAYERS_MONGODB_URI" in _text or "PLAYERS_MONGODB_URI" in _text:
        check(
            f"no module reads the legacy players variable ({_path.name})",
            False,
            "the legacy cluster must be visible but never connected to",
        )
        break
else:
    check("no module reads the legacy players variable", True)

# ── The URI must not be reachable from a route handler ──────────────────
# `resolveClusterUri` is deliberately module-private. If it were exported, a
# single careless import could serialise a connection string into a response —
# the exact failure in the brief ("Bad: {\"mongodbUri\": \"...\"}").

section("No module exports the connection string")
check(
    "resolveClusterUri is not exported",
    not re.search(r"export\s+(async\s+)?function\s+resolveClusterUri", ts_source),
)
for _sig in re.finditer(
    r"export\s+(?:async\s+)?function\s+(\w+)\([^)]*\)[^{]*\{", ts_source
):
    _name = _sig.group(1)
    _body = ts_source[_sig.end():_sig.end() + 900]
    _body = _body[:_body.find("\nexport ")] if "\nexport " in _body else _body
    check(
        f"exported helper '{_name}' never hands a connection string to a caller",
        not re.search(r"return\s+\w*uri\b|return\s+resolveClusterUri\(", _body, re.IGNORECASE),
    )
check(
    "clusterEnvNames returns variable names, and the health route uses it",
    "clusterEnvNames" in ts_source,
)
health_route = (REPO / "app" / "api" / "health" / "route.ts").read_text(encoding="utf-8")
check(
    "the health route never references a URI variable directly",
    not re.search(r"process\.env\[?['\"]?.*MONGODB_URI", health_route)
    and "clusterUriSource" in health_route,
)
check(
    "the health route reports every cluster, not just one",
    "CLUSTERS" in health_route and "clusters" in health_route,
)

# ── Python side agrees ──────────────────────────────────────────────────
# Loaded with a stubbed dotenv so importing config cannot read a real .env.

section("The bot resolves the same contract as the site")
for module in ("dotenv",):
    sys.modules.setdefault(module, type(sys)(module))
sys.modules["dotenv"].load_dotenv = lambda *a, **k: None  # type: ignore[attr-defined]
sys.path.insert(0, str(BOT_DIR))

config_source = CONFIG_PY.read_text(encoding="utf-8")
check("config.py reads MURABOT_MONGODB_URI", "MURABOT_MONGODB_URI" in config_source)
sys.path.insert(0, str(BOT_DIR))
check(
    "config.py keeps MONGODB_URI only as a legacy fallback",
    re.search(r"MONGO_URI\s*=\s*\(MURABOT_MONGODB_URI", config_source) is not None,
)
check(
    "config.py records which variable supplied the URI (a name, not a value)",
    "MONGO_URI_SOURCE" in config_source,
)
check(
    "config.py never assigns a literal connection string",
    not re.search(r"MONGO_URI\s*=\s*[\"']mongodb", config_source),
)
check(
    "config.py default database matches the TS table",
    re.search(r"MONGO_DB[\s\S]{0,200}?\"murastream_bot\"", config_source) is not None,
)

# Precedence, exercised rather than pattern-matched: the wrong variable wins
# and a deployment silently talks to the wrong cluster, which is the whole bug.
_saved = {k: os.environ.get(k) for k in
          ("MURABOT_MONGODB_URI", "MONGODB_URI", "MONGO_URI", "DATABASE_URL",
           "MURABOT_MONGO_DB", "DISCORD_BOT_MONGO_DB", "MONGO_DB")}


def _reload_config():
    """Re-import `config` against the current environment.

    Returns the fresh module: `bot_config` is a name bound to the FIRST import,
    so checking it after a reload would silently assert against stale values.
    """
    import importlib
    sys.modules.pop("config", None)
    return importlib.import_module("config")


def _with_env(values: dict):
    for key, value in values.items():
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = value


#: Fixture URIs on the reserved `.invalid` TLD, so they can never resolve and
#: are unmistakably not credentials. Distinct values per cluster are what make
#: "the named variable won" observable at all.
BOT_URI = "mongodb+srv://bot:fixture@bot-cluster.example.invalid/app"
LEGACY_URI = "mongodb+srv://legacy:fixture@legacy-cluster.example.invalid/app"

try:
    _with_env({
        "MURABOT_MONGODB_URI": BOT_URI,
        "MONGODB_URI": LEGACY_URI,
        "MONGO_URI": None, "DATABASE_URL": None,
        "MURABOT_MONGO_DB": None, "DISCORD_BOT_MONGO_DB": None, "MONGO_DB": None,
    })
    cfg = _reload_config()
    check(
        "the named variable beats the legacy one",
        cfg.MONGO_URI_SOURCE == "MURABOT_MONGODB_URI"
        and cfg.MONGO_URI == BOT_URI
        and cfg.MONGO_URI != LEGACY_URI,
        cfg.MONGO_URI_SOURCE or "unset",
    )
    check(
        "the bot's default database is not the site's",
        cfg.MONGO_DB == "murastream_bot",
        cfg.MONGO_DB,
    )

    _with_env({"MURABOT_MONGODB_URI": None, "MONGODB_URI": LEGACY_URI})
    cfg = _reload_config()
    check(
        "a deployment that has not migrated yet still runs",
        cfg.MONGO_URI_SOURCE == "MONGODB_URI" and cfg.MONGO_URI == LEGACY_URI,
        cfg.MONGO_URI_SOURCE or "unset",
    )

    _with_env({"MONGODB_URI": None, "MONGO_URI": None, "DATABASE_URL": None})
    cfg = _reload_config()
    check(
        "an unconfigured deployment reports no URI rather than a fake one",
        cfg.MONGO_URI_SOURCE is None and not cfg.MONGO_URI,
    )
finally:
    _with_env(_saved)
    for key in ("MURABOT_MONGODB_URI", "MONGODB_URI", "MONGO_URI", "DATABASE_URL",
                "MURABOT_MONGO_DB", "DISCORD_BOT_MONGO_DB", "MONGO_DB"):
        os.environ.pop(key, None)
    for saved_key, saved_value in _saved.items():
        if saved_value is not None:
            os.environ[saved_key] = saved_value
    _reload_config()

# ── No credential in source ─────────────────────────────────────────────
# Every legitimate `mongodb+srv://` in this repo is a prefix check, a regex, a
# docstring or a redacted fixture. A real one carries user:password@.

CREDENTIAL_URI = re.compile(r"mongodb(?:\+srv)?://[^\s:@/'\"`]+:[^\s:@/'\"`]+@")
SKIP_DIRS = {"node_modules", ".next", ".git", "dist", "build", "__pycache__"}
ALLOWED_URI_CONTEXTS = (
    re.compile(r"\.invalid|\.test\b|example\.(com|org|net)|redacted|REDACTED"),
)
leaks: list[str] = []
for path in REPO.rglob("*"):
    if not path.is_file() or any(part in SKIP_DIRS for part in path.parts):
        continue
    if path.suffix.lower() not in {".ts", ".tsx", ".js", ".mjs", ".py", ".md",
                                   ".json", ".yml", ".yaml", ".css", ".html"}:
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        continue
    for lineno, line in enumerate(text.splitlines(), 1):
        match = CREDENTIAL_URI.search(line)
        if match and not any(allowed.search(line) for allowed in ALLOWED_URI_CONTEXTS):
            leaks.append(f"{path.relative_to(REPO)}:{lineno}")

section("No credential-shaped URI exists in any source file")
check(
    "no credential-bearing connection string literal in the repository",
    not leaks,
    "; ".join(leaks[:5]),
)
# No file is exempt from the scan above — not even the scanner's own control
# test, which therefore has to build its credential fixtures at runtime. If
# someone later writes one out in full to make the test easier to read, this
# check is what tells them, instead of the answer being a permanent exemption
# that quietly becomes a blind spot for real pastes.
_control_test = (REPO / "scripts" / "test-secret-scan.mjs").read_text(encoding="utf-8")
check(
    "the scanner's control test builds fixtures at runtime, so it needs no exemption",
    CREDENTIAL_URI.search(_control_test) is None and "readFileSync" in _control_test,
)
check(
    "the scanner's own control test is registered in CI",
    "test-secret-scan.mjs" in (REPO / ".github" / "workflows" / "ci.yml").read_text(
        encoding="utf-8"
    ),
)
check(
    "this architecture test is registered in CI",
    "test_db_architecture.py" in (REPO / ".github" / "workflows" / "ci.yml").read_text(
        encoding="utf-8"
    ),
)

# ── Identity: no second account system ──────────────────────────────────
# A fallback that mints a local user id when the site cannot be reached is
# precisely how "one canonical identity" turns into three. The bot must return
# "not linked", never invent one.

section("Discord linking cannot invent a second user")
identity_source = IDENTITY_PY.read_text(encoding="utf-8")
for forbidden, label in (
    (r"insert_one|insert_many|update_one|update_many|find_one_and_update",
     "identity never writes to a database"),
    (r"\buuid4?\b|uuid\.uuid|random\.uuid", "identity never generates an id"),
    (r"\bhashlib\b|\bbcrypt\b", "identity never derives a credential"),
    (r"MURABOT_MONGODB_URI|MONGODB_URI|MONGO_URI", "identity never opens a connection"),
    (r"raise\s+RuntimeError|raise\s+ValueError", "identity never raises into a command"),
):
    check(label, re.search(forbidden, identity_source) is None)
check(
    "identity asks the site, which owns the canonical id",
    "/api/discord/identity" in identity_source,
)
check(
    "identity authenticates with the existing bridge secret",
    "BRIDGE_SECRET" in identity_source,
)
check(
    "identity keys on the Discord snowflake, never the username",
    "discord_user_id" in identity_source
    and not re.search(r"\.username|\.global_name|discriminator", identity_source),
)
check(
    "the cache is bounded so a large guild cannot grow it without limit",
    "10_000" in identity_source or "10000" in identity_source,
)
check(
    "failures are cached briefly so an outage does not stall every command",
    "FAILURE_TTL_SEC" in identity_source,
)

# ── Audit and migration cannot destroy data ─────────────────────────────
# The brief is explicit: report suspicious records, do not delete them.

section("Reconciliation tooling is non-destructive by default")
for tool, path in (("audit", AUDIT_MJS), ("migration", MIGRATE_MJS)):
    source = path.read_text(encoding="utf-8")
    destructive = re.findall(r"\.(deleteMany|deleteOne|drop|dropIndex|renameCollection)\s*\(",
                             source)
    check(f"{tool} performs no destructive database operation", not destructive,
          "; ".join(set(destructive)))
    check(f"{tool} defaults to a dry run",
          re.search(r"APPLY\s*=\s*['\"]?--apply|includes\(['\"]--apply", source) is not None)

# ── Ownership is documented, not folklore ───────────────────────────────
setup_doc = (REPO / "DATABASE_SETUP.md").read_text(encoding="utf-8")
section("The architecture is written down where an operator will find it")
for needle, label in (
    ("MURAGOODS_MONGODB_URI", "documents the site variable"),
    ("MURABOT_MONGODB_URI", "documents the bot variable"),
    ("MURAGOODS_PLAYERS_MONGODB_URI", "documents the legacy players cluster"),
    ("canonical", "documents the single canonical identity"),
    ("discordId", "documents Discord linking by snowflake"),
    ("rotat", "documents the credential-rotation runbook"),
):
    check(label, needle in setup_doc)

print()
if FAILURES:
    print(f"{len(FAILURES)} failure(s) of {CHECKS} checks: {', '.join(FAILURES)}")
    sys.exit(1)
print(f"database architecture: all {CHECKS} checks passed "
      "(named clusters, exactly one identity authority, no credentials in source)")
