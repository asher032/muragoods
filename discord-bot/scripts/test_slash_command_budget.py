"""CI guard: the global slash-command budget.

Discord allows at most 100 top-level GLOBAL slash commands per application,
and discord.py raises CommandLimitReached while loading cogs once the 101st
registers — which silently kills a whole cog (we lost leveling this way).
Count every @app_commands.command(name=...) across cogs and fail while there
is still headroom, so growth forces conscious consolidation (groups, aliases
into options) instead of a production outage.

Limit: 100 (Discord's hard cap). Warn threshold: 95.
"""

import re
import sys
from pathlib import Path

HARD_LIMIT = 100
WARN_AT = 95

ROOT = Path(__file__).resolve().parent.parent / "bot" / "cogs"


def main() -> int:
    total = 0
    per_cog: dict[str, list[str]] = {}
    for path in sorted(ROOT.glob("*.py")):
        src = path.read_text(encoding="utf-8")
        cmds = re.findall(r'@app_commands\.command\(name="([^"]+)"', src)
        # Duplicate names across cogs would ALSO kill loading
        # (CommandAlreadyRegistered takes down the whole cog).
        per_cog[path.name] = cmds
        total += len(cmds)
    seen: dict[str, str] = {}
    dupes: list[str] = []
    for cog, cmds in per_cog.items():
        for name in cmds:
            if name in seen:
                dupes.append(f"{name!r} in {seen[name]} and {cog}")
            else:
                seen[name] = cog
    print(f"slash commands total: {total} (limit {HARD_LIMIT})")
    for cog, cmds in per_cog.items():
        print(f"  {cog}: {len(cmds)}")
    failed = False
    if dupes:
        print("DUPLICATE command names (each kills a cog at load):")
        for d in dupes:
            print(f"  - {d}")
        failed = True
    if total > HARD_LIMIT:
        print(f"FAIL: {total} > {HARD_LIMIT} — Discord will refuse the excess and cogs will fail to load.")
        failed = True
    elif total >= WARN_AT:
        print(f"WARNING: only {HARD_LIMIT - total} slots left — consolidate before adding commands.")
    if not failed:
        print("slash command budget OK")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
