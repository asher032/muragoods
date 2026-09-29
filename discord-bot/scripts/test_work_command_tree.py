"""Guard the /work command tree after consolidating /jobs into /work.

Loads the REAL cogs (with the driver stubbed) and asserts the actual
registered slash-command tree, so "did we really remove /jobs" is answered
by the command tree rather than by a source scan. Also asserts the help
menu cannot advertise a command that no longer exists.
"""
import asyncio
import sys
import types
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent   # discord-bot/
BOT = ROOT / "bot"                                       # discord-bot/bot/
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

import cogs.jobs as shift_views  # noqa: E402  (views module, not a cog)
import cogs.work as workmod  # noqa: E402
import cogs.help as helpmod  # noqa: E402

checks: list[tuple[str, bool, str]] = []


def check(name, ok, detail=""):
    checks.append((name, bool(ok), detail))


def walk(cmd, prefix=""):
    """Flatten a Command/Group tree to qualified names."""
    out = []
    if isinstance(cmd, discord.app_commands.Group):
        for child in cmd.commands:
            out.extend(walk(child, f"{prefix}{cmd.name} "))
    else:
        out.append(f"{prefix}{cmd.name}")
    return out


def cog_tree(cog):
    # __cog_app_commands__ is an INSTANCE attribute assigned in Cog.__new__, so a
    # real instantiation is required. WorkCog.__init__ only stores the bot
    # reference, so this is side-effect free.
    out = []
    for cmd in cog.__cog_app_commands__:
        out.extend(walk(cmd))
    return out


async def main():
    cog = workmod.WorkCog(types.SimpleNamespace(guilds=[]))
    names = set(cog_tree(cog))

    # ── /work exists and owns the whole employment surface ────────────
    check("/work group is registered",
          "work" in {c.name for c in cog.__cog_app_commands__},
          str(sorted(n for n in names)))
    required = {"work shift", "work list", "work history", "work resign",
                "work stars", "work session", "work vacation", "work event"}
    missing = required - names
    check("all required /work subcommands exist", not missing, f"missing {sorted(missing)}")

    # ── the retired command surface must be gone ─────────────────────
    check("/jobs group is gone", "jobs" not in names,
          str(sorted(n for n in names if n.startswith("jobs"))))
    check("no /jobs.* subcommands remain", not [n for n in names if n.startswith("jobs ")])
    check("no /job group exists", "job" not in names)
    check("no /level shift exists", "level shift" not in names)
    check("no /leveling shift exists", "leveling shift" not in names)

    # ── /work shift is employment-gated ──────────────────────────────
    shift = next(c for c in cog.__cog_app_commands__ if c.name == "work")
    shift_cmd = next(c for c in shift.commands if c.name == "shift")
    src = pathlib.Path(BOT / "cogs" / "work.py").read_text(encoding="utf-8")
    body = src.split('@work.command(name="shift"', 1)[1].split("\n    @work.command", 1)[0]
    check("/work shift checks employment before starting",
          "get_employment" in body)
    check("/work shift gates the minigame behind an apply/start decision",
          "apply_for_job" in body and 'view.action == "start"' in body)
    check("start is refused when the active job differs",
          'emp != job_def["id"]' in body)
    check("reward is computed by the jobs service, not hardcoded",
          "jb.start_shift" in body and "random.randint" not in body)
    check("/work shift does not grant coins directly",
          "grant_coins" not in body)
    check("no command in /work lets a user set economic values",
          "workMin" not in body and "workMax" not in body)

    # ── the shift view module must expose what /work shift imports ────
    for attr in ("JobBrowser", "ApplyStartView", "employment_embed",
                 "OrderShiftView", "ReactionShiftView", "MemoryShiftView",
                 "ChoiceShiftView", "TimingShiftView"):
        check(f"shift view {attr} is importable", hasattr(shift_views, attr))
    check("cogs/jobs.py no longer registers a cog",
          not hasattr(shift_views, "JobsCog")
          and not hasattr(shift_views, "setup"))
    check("cogs/jobs is not in the extension list",
          '"cogs.jobs",' not in
          pathlib.Path(BOT / "main.py").read_text(encoding="utf-8"))

    # ── no stale user-facing /jobs text anywhere in the bot ───────────
    # Checked against non-docstring string LITERALS, which is where anything
    # a user can actually read lives. Docstrings are skipped: they explain the
    # /jobs -> /work migration and must still name the old command.
    import ast as _ast
    stale = []
    for f in sorted(BOT.rglob("*.py")):
        try:
            tree = _ast.parse(f.read_text(encoding="utf-8"))
        except SyntaxError:
            continue
        docstrings = set()
        for node in _ast.walk(tree):
            if isinstance(node, (_ast.Module, _ast.ClassDef, _ast.FunctionDef,
                                 _ast.AsyncFunctionDef)):
                body = getattr(node, "body", [])
                if (body and isinstance(body[0], _ast.Expr)
                        and isinstance(body[0].value, _ast.Constant)
                        and isinstance(body[0].value.value, str)):
                    docstrings.add(id(body[0].value))
        for node in _ast.walk(tree):
            if (isinstance(node, _ast.Constant)
                    and isinstance(node.value, str)
                    and id(node) not in docstrings
                    and ("/jobs" in node.value)):
                stale.append(f"{f.name}:{node.lineno}")
    check("no user-facing `/jobs` strings remain in the bot", not stale,
          ", ".join(stale))

    # ── help must not advertise a command that no longer exists ───────
    advertised = {cmd for cmd, _cat in helpmod._NAME_OVERRIDES}
    check("help does not advertise /jobs", "/jobs" not in advertised)
    check("help advertises /work", "/work" in advertised)
    check("help does not advertise /level shift", "/level shift" not in advertised)

    failed = 0
    for name, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {name}"
              + (f"  [{detail}]" if (not ok and detail) else ""))
        failed += 0 if ok else 1
    print(f"\n{len(checks) - failed}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
