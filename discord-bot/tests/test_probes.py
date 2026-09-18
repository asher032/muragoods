"""Verifies the new active probes map real HTTP outcomes to honest statuses.

Both site_bridge and movies previously sat at "starting" forever because they
were only written as a side effect of a command calling the site. These tests
drive every response class through the mapping with a stubbed transport.
"""
import os
import sys
import asyncio

_BOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "bot")
sys.path.insert(0, _BOT)

import net  # noqa: E402
import bridge  # noqa: E402
import tmdb  # noqa: E402

fails = []


def check(label, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + label + (("  <- " + str(detail)) if not cond else ""))
    if not cond:
        fails.append(label)


def stub(status):
    async def fake(url, params=None, headers=None):
        return status, ({"ok": True} if status == 200 else None)
    net.get_json = fake


print("--- site_bridge probe ---")
for status, expected in [
    (200, "online"),
    (400, "online"),          # authenticated but unknown action → bridge is up
    (401, "auth-missing"),    # secret wrong/missing on the site side
    (403, "auth-missing"),
    (404, "degraded"),        # endpoint gone
    (500, "degraded"),
    (502, "degraded"),
    (0, "offline"),           # network failure / timeout
]:
    stub(status)
    got = asyncio.run(bridge.probe())
    check("site_bridge HTTP %s -> %s" % (status, expected), got == expected, got)

# No secret configured must not be reported as online.
_orig = bridge.config.BRIDGE_SECRET
bridge.config.BRIDGE_SECRET = ""
stub(200)
check("site_bridge with no secret -> auth-missing", asyncio.run(bridge.probe()) == "auth-missing",
      net.get_status().get("site_bridge"))
bridge.config.BRIDGE_SECRET = _orig

print("--- movies probe ---")
for status, expected in [(200, "online"), (0, "offline"), (429, "degraded"), (500, "degraded")]:
    stub(status)
    got = asyncio.run(tmdb.probe())
    check("movies HTTP %s -> %s" % (status, expected), got == expected, got)

print("--- the original defect: status must no longer default to 'starting' ---")
stub(200)
net.set_status("site_bridge", "starting")
net.set_status("movies", "starting")
asyncio.run(bridge.probe())
asyncio.run(tmdb.probe())
live = net.get_status()
check("site_bridge left the 'starting' default",
      live["site_bridge"] != "starting", live["site_bridge"])
check("movies left the 'starting' default", live["movies"] != "starting", live["movies"])

print()
print("RESULT: %d passed, %d failed" % (16 - len(fails), len(fails)))
if fails:
    print("FAILED:", *fails, sep="\n  - ")
sys.exit(1 if fails else 0)
