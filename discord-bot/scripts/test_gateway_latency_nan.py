"""Regression guard: Discord gateway latency must never crash a caller.

Root cause of the pf11 outage (2026-09-25): ``discord.Client.latency`` is
**NaN** until the gateway completes its first heartbeat, and NaN is truthy in
Python. The old guard ``round(bot.latency * 1000) if bot.latency else 0``
therefore raised ``ValueError: cannot convert float NaN to integer`` inside
``/health``; Render's 10-second health probe then marked every instance
unhealthy (``update_failed`` → zero instances behind the edge → bot OFFLINE
while the service itself looked "live").

Hermetic: no network, no Discord, no Motor — only stdlib. Run:

    python discord-bot/scripts/test_gateway_latency_nan.py
"""

import math
import re
import sys
from pathlib import Path

BOT_DIR = Path(__file__).resolve().parents[1] / "bot"
sys.path.insert(0, str(BOT_DIR))

from gateway_util import gateway_latency_ms  # noqa: E402

FAILURES = []


def check(name, cond, detail=""):
    if cond:
        print(f"PASS  {name}")
    else:
        FAILURES.append(name)
        print(f"FAIL  {name}  {detail}")


class FakeClient:
    """Mimics discord.Client.latency states."""

    def __init__(self, latency):
        self.latency = latency


class NoLatency:
    pass  # object without a latency attribute at all


# 1. The exact outage condition: NaN latency must return the default, not raise.
try:
    got = gateway_latency_ms(FakeClient(float("nan")), 0)
    check("NaN -> default 0", got == 0, f"got {got!r}")
except ValueError as exc:  # pragma: no cover - the historical bug
    check("NaN -> default 0", False, f"raised {exc!r}")

# 2. NaN with default=None (health_music payload distinguishes 0 from unmeasured).
try:
    got = gateway_latency_ms(FakeClient(float("nan")), None)
    check("NaN -> default None", got is None, f"got {got!r}")
except ValueError as exc:  # pragma: no cover
    check("NaN -> default None", False, f"raised {exc!r}")

# 3. Inf / -inf are equally crash-prone for round().
check("+inf -> default", gateway_latency_ms(FakeClient(float("inf")), 0) == 0)
check("-inf -> default", gateway_latency_ms(FakeClient(float("-inf")), 0) == 0)

# 4. Pre-connect states: None latency, missing attribute.
check("None latency -> default", gateway_latency_ms(FakeClient(None), 0) == 0)
check("missing attr -> default", gateway_latency_ms(NoLatency(), 0) == 0)

# 5. Non-numeric garbage never raises.
check("str latency -> default", gateway_latency_ms(FakeClient("soon"), 0) == 0)

# 6. Healthy values still convert correctly.
check("0.0512s -> 51ms", gateway_latency_ms(FakeClient(0.0512), 0) == 51)
check("0.0s -> 0ms", gateway_latency_ms(FakeClient(0.0), 0) == 0)
check("0.5s -> 500ms", gateway_latency_ms(FakeClient(0.5), 0) == 500)

# 7. Document the historical bug: the OLD guard raises on NaN.
old_guard = lambda client: round(client.latency * 1000) if client.latency else 0  # noqa: E731
try:
    old_guard(FakeClient(float("nan")))
    check("old guard reproduces ValueError", False, "no exception raised")
except ValueError:
    check("old guard reproduces ValueError", True)

# 8. Source scan: no raw latency arithmetic may reappear outside gateway_util.
#    Catches `round(bot.latency * 1000)`, `bot.latency or 0`, etc.
UNSAFE = re.compile(r"\.latency\s*(\*|\bor\b|\bif\b|\belse\b)")
bad = []
for path in sorted(BOT_DIR.rglob("*.py")):
    if path.name == "gateway_util.py":
        continue
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if UNSAFE.search(line):
            bad.append(f"{path.relative_to(BOT_DIR)}:{lineno}: {line.strip()}")
check("no raw .latency arithmetic outside gateway_util", not bad, "; ".join(bad))

# 9. Source scan: the four known call sites must use the helper.
main_py = (BOT_DIR / "main.py").read_text(encoding="utf-8")
status_cog = (BOT_DIR / "cogs" / "murastream.py").read_text(encoding="utf-8")
check("main.py imports helper", "gateway_latency_ms" in main_py)
check("murastream.py imports helper", "gateway_latency_ms" in status_cog)
check("main.py has 3 helper call sites",
      main_py.count("gateway_latency_ms(bot") >= 3,
      f"found {main_py.count('gateway_latency_ms(bot')}")

print()
if FAILURES:
    print(f"{len(FAILURES)} failure(s): {', '.join(FAILURES)}")
    sys.exit(1)
print("gateway latency NaN guard: all checks passed")
