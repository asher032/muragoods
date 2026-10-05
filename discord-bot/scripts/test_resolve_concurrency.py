"""Concurrency guard for the music resolver.

The production failure this prevents: several yt-dlp resolves running at once
exhausted the container and the process died. The resolver now admits a
bounded number of extractions at a time (MUSIC_RESOLVE_CONCURRENCY) and
refuses a caller that waits too long for a slot (MUSIC_RESOLVE_QUEUE_TIMEOUT).

These tests use a stub for the expensive part, so they measure the GATE and not
the network. Run:

    python discord-bot/scripts/test_resolve_concurrency.py
"""

from __future__ import annotations

import asyncio
import os
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bot"))

import config  # noqa: E402
import music  # noqa: E402
from music import MusicEngine  # noqa: E402

PASSED = 0
FAILED = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASSED, FAILED
    if ok:
        PASSED += 1
        print(f"  ok  {name}")
    else:
        FAILED += 1
        print(f"  FAIL {name}{(' - ' + detail) if detail else ''}")


class StubEngine(MusicEngine):
    """Records real concurrency while doing no network work.

    The stub replaces only _resolve_unbounded -- the expensive part the guard
    wraps. Everything above it (the gate, queueing, refusal) is the real code.
    """

    def __init__(self, duration: float = 0.30) -> None:
        super().__init__()
        self.duration = duration
        self.active = 0
        self.peak = 0
        self.started = 0
        self._lock = threading.Lock()

    async def _resolve_unbounded(self, query: str):  # type: ignore[override]
        with self._lock:
            self.active += 1
            self.started += 1
            self.peak = max(self.peak, self.active)
        try:
            await asyncio.sleep(self.duration)
            return f"track:{query}"
        finally:
            with self._lock:
                self.active -= 1


def reset_gate(limit: int, queue_timeout: int) -> None:
    """Force a fresh semaphore bound to a known limit for this test."""
    config.MUSIC_RESOLVE_CONCURRENCY = limit
    config.MUSIC_RESOLVE_QUEUE_TIMEOUT = queue_timeout
    MusicEngine._resolve_semaphore = None
    MusicEngine._resolve_inflight = 0
    MusicEngine._resolve_peak = 0


async def test_respects_limit() -> None:
    print("concurrency limit is enforced (limit=2, 8 callers)")
    reset_gate(2, 120)
    eng = StubEngine(duration=0.30)
    results = await asyncio.gather(*(eng.resolve(f"q{i}") for i in range(8)))
    check("all 8 callers completed", all(r is not None for r in results), str(results))
    check("peak concurrency <= 2", eng.peak <= 2, f"peak={eng.peak}")
    check("all 8 actually ran", eng.started == 8, f"started={eng.started}")
    stats = MusicEngine.resolve_stats()
    check("counters report the limit", stats["resolve_concurrency_limit"] == 2, str(stats))
    check("counters unwind to 0", stats["resolve_callers_active"] == 0, str(stats))


async def test_serialises_at_one() -> None:
    print("limit=1 fully serialises (no overlap)")
    reset_gate(1, 120)
    eng = StubEngine(duration=0.10)
    t0 = time.monotonic()
    await asyncio.gather(*(eng.resolve(f"s{i}") for i in range(4)))
    elapsed = time.monotonic() - t0
    check("peak concurrency == 1", eng.peak == 1, f"peak={eng.peak}")
    check("4x0.1s serial took >= 0.4s", elapsed >= 0.40, f"elapsed={elapsed:.2f}s")


async def test_distinct_queries_still_bounded() -> None:
    """Several DIFFERENT songs must not bypass the gate either.

    The cache shares identical queries, so this guards the case that actually
    loads a host: four unrelated tracks arriving at once. It also pins the
    meaning of the reported counters — callers may exceed the limit while
    queued, but simultaneous extractions must not.
    """
    print("distinct queries are still bounded by the gate")
    reset_gate(2, 120)
    eng = StubEngine(duration=0.10)
    await asyncio.gather(*(eng.resolve(f"different song {i}") for i in range(4)))
    check("extractions running at once <= limit", eng.peak <= 2, f"peak={eng.peak}")
    check("all four were really attempted", eng.started == 4, f"started={eng.started}")
    stats = MusicEngine.resolve_stats()
    check("counter names callers, not extractions",
          "resolve_callers_active" in stats and "resolve_inflight" not in stats,
          str(sorted(stats)))
    check("callers unwind to 0 after completion",
          stats["resolve_callers_active"] == 0, str(stats))


async def test_queue_timeout_refuses() -> None:
    print("queued caller past the wait limit is refused, not starved")
    reset_gate(1, 1)
    eng = StubEngine(duration=2.5)
    results = await asyncio.gather(eng.resolve("first"), eng.resolve("second"))
    check("holder completed", results[0] == "track:first", str(results))
    check("waiter returned None", results[1] is None, str(results))
    check("waiter set RESOLVER_BUSY", eng._last_error_kind == "RESOLVER_BUSY",
          f"kind={eng._last_error_kind}")
    check("waiter explained itself",
          bool(eng._last_resolve_error) and "busy" in (eng._last_resolve_error or ""),
          f"err={eng._last_resolve_error}")
    check("waiter did NOT start work", eng.started == 1, f"started={eng.started}")
    check("slot released after refusal", MusicEngine.resolve_stats()["resolve_callers_active"] == 0)


async def test_gate_survives_failures() -> None:
    print("a raising resolve releases its slot")

    class Boom(StubEngine):
        fail = True

        async def _resolve_unbounded(self, query: str):  # type: ignore[override]
            if self.fail:
                raise RuntimeError("provider exploded")
            return f"track:{query}"

    reset_gate(1, 5)
    eng = Boom()
    try:
        await eng.resolve("x")
        raised = False
    except RuntimeError:
        raised = True
    check("exception propagates (not swallowed)", raised)
    check("slot released after exception",
          MusicEngine.resolve_stats()["resolve_callers_active"] == 0)
    # The gate must still be usable afterwards: a raised resolve must not
    # permanently consume the slot.
    eng.fail = False
    ok = await eng.resolve("y")
    check("engine still resolves afterwards", ok == "track:y", str(ok))


async def test_single_request_unaffected() -> None:
    print("a lone resolve is not slowed or altered")
    reset_gate(2, 120)
    eng = StubEngine(duration=0.05)
    result = await eng.resolve("only")
    check("returns the track unchanged", result == "track:only", str(result))
    check("peak stays 1 when alone", eng.peak == 1, f"peak={eng.peak}")


def main() -> int:
    print(f"limit from env MUSIC_RESOLVE_CONCURRENCY="
          f"{os.environ.get('MUSIC_RESOLVE_CONCURRENCY', '<unset>')}\n")
    for coro in (
        test_respects_limit(),
        test_serialises_at_one(),
        test_distinct_queries_still_bounded(),
        test_queue_timeout_refuses(),
        test_gate_survives_failures(),
        test_single_request_unaffected(),
    ):
        asyncio.run(coro)
    print(f"\n{PASSED} passed, {FAILED} failed")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())