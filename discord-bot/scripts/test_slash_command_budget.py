"""CI guard: the global slash-command budget.

Discord allows at most 100 top-level GLOBAL slash commands per application —
and a GROUP counts as one of them (roots + groups = tree size). discord.py
raises CommandLimitReached while loading cogs once the 101st registers,
which silently kills a whole cog (we lost leveling this way: the real tree
hit 102 once /level was added and cogs.leveling failed to load in prod).

Count EVERY top-level registration — `@app_commands.command(name=...)` AND
`app_commands.Group(name=...)`, including multi-line definitions — and fail
while there is still headroom. Duplicate names across cogs kill loading the
same way (CommandAlreadyRegistered takes down the whole cog).

Limit: 100 (Discord's hard cap). Warn threshold: 97.
"""

import re
import sys
from pathlib import Path

HARD_LIMIT = 100
WARN_AT = 97

ROOT = Path(__file__).resolve().parent.parent / "bot" / "cogs"

ROOT_RE = re.compile(r'@app_commands\.command\(\s*name="([^"]+)"')
GROUP_RE = re.compile(r'app_commands\.Group\(\s*name="([^"]+)"')


def main() -> int:
    total = 0
    per_cog: dict[str, list[str]] = {}
    for path in sorted(ROOT.glob("*.py")):
        src = path.read_text(encoding="utf-8")
        roots = ROOT_RE.findall(src)
        groups = GROUP_RE.findall(src)
        # Both are added to the tree at cog load — both count.
        cmds = roots + groups
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
