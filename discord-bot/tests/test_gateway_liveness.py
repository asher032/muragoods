"""Verifies gateway_liveness finds the real heartbeat-ACK clock.

Two kinds of check:
  1. STRUCTURAL — assert the attribute path this code walks actually exists in
     the installed discord.py, so the path can't silently rot into the
     fallback branch again (that is exactly what shipped and made
     /health report last_heartbeat: null on a healthy bot).
  2. BEHAVIOURAL — drive each branch with conforming stand-ins.
"""
import os
import sys
import time

_BOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "bot")
sys.path.insert(0, _BOT)

import discord  # noqa: E402
from discord.gateway import DiscordWebSocket, KeepAliveHandler  # noqa: E402
from discord.shard import ShardInfo  # noqa: E402
import main  # noqa: E402

fails = []


def check(label, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + label + (("  <- " + str(detail)) if not cond else ""))
    if not cond:
        fails.append(label)


# ── 1. structural: does the walked path exist in the real library? ────────
print("--- structural ---")
import inspect  # noqa: E402

ws_src = inspect.getsource(DiscordWebSocket.__init__)
check("DiscordWebSocket.__init__ assigns _keep_alive",
      "_keep_alive" in ws_src)

ka_src = inspect.getsource(KeepAliveHandler.__init__)
check("KeepAliveHandler.__init__ assigns _last_ack", "_last_ack" in ka_src)

ka_ack = inspect.getsource(KeepAliveHandler.ack)
check("KeepAliveHandler.ack refreshes _last_ack", "_last_ack" in ka_ack)

check("ShardInfo.__slots__ has no 'ws' (old code used si.ws)",
      "ws" not in ShardInfo.__slots__, ShardInfo.__slots__)
check("ShardInfo.__slots__ exposes _parent (new sharded path)",
      "_parent" in ShardInfo.__slots__, ShardInfo.__slots__)
check("Client has no .shards (old code indexed bot.shards)",
      not hasattr(discord.Client, "shards"))


# ── 2. behavioural ───────────────────────────────────────────────────────
class KA:
    def __init__(self, ack):
        self._last_ack = ack


class WS:
    def __init__(self, ack):
        self._keep_alive = KA(ack)


class Bot:
    """Shaped like a non-sharded commands.Bot: has .ws, no .shards."""

    def __init__(self, ws=None, ready=True):
        self.ws = ws
        self._ready = ready

    def is_ready(self):
        return self._ready


print("--- behavioural ---")

# Fresh ACK -> measured, alive, ISO timestamp present.
fresh = main.gateway_liveness(Bot(WS(time.perf_counter() - 3)))
check("fresh ACK -> alive", fresh[0] is True, fresh)
check("fresh ACK -> measured age (~3s), NOT fallback null",
      fresh[1] is not None and 2 < fresh[1] < 6, fresh[1])
check("fresh ACK -> real ISO last_heartbeat",
      isinstance(fresh[2], str) and "T" in fresh[2], fresh[2])

# Stale ACK -> the whole point: report OFFLINE, don't claim online.
stale = main.gateway_liveness(Bot(WS(time.perf_counter() - (main.GATEWAY_STALE_AFTER + 30))))
check("stale ACK -> NOT alive (gateway dead must read offline)", stale[0] is False, stale)
check("stale ACK -> age still measured (not fallback)",
      stale[1] is not None and stale[1] > main.GATEWAY_STALE_AFTER, stale[1])

# Boundary: just inside the stale window stays alive.
edge = main.gateway_liveness(Bot(WS(time.perf_counter() - (main.GATEWAY_STALE_AFTER - 5))))
check("just inside stale window -> alive", edge[0] is True, edge)

# No socket at all (pre-connect) -> fall back to ready, never invent an outage.
nosock = main.gateway_liveness(Bot(None, ready=True))
check("no socket + ready -> alive via fallback", nosock[0] is True, nosock)
check("no socket -> age None (honest about not knowing)", nosock[1] is None, nosock)

# Socket present but keep-alive not up yet -> same fallback.
check("socket without keep-alive -> falls back, not crash",
      main.gateway_liveness(Bot(object(), ready=True))[0] is True)

# A raising bot attribute must not propagate.
class Boom:
    @property
    def ws(self):
        raise RuntimeError("library drift")

    def is_ready(self):
        return True


check("raising ws -> no exception, falls back", main.gateway_liveness(Boom())[0] is True)

# Sharded path: ShardInfo with _parent.ws must be found.
class Shard:
    def __init__(self, ws):
        self.ws = ws


class ShardedBot:
    def __init__(self, ws):
        self.shards = {0: Shard(ws)}
        self.ws = None

    def is_ready(self):
        return True


sh = main.gateway_liveness(ShardedBot(WS(time.perf_counter() - 2)))
check("sharded: resolved via _parent.ws", sh[1] is not None and sh[1] < 6, sh)

# A numeric-but-stale ACK of 0 must still be treated as a measurement.
zer = main.gateway_liveness(Bot(WS(0.0)))
check("ack=0.0 counts as a measurement (not None)", zer[1] is not None, zer)

print()
print("RESULT: %d passed, %d failed" % (13 - len(fails), len(fails)))
if fails:
    print("FAILED:", *fails, sep="\n  - ")
sys.exit(1 if fails else 0)
