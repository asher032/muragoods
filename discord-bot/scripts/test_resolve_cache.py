"""Resolver cache + stampede guard.

Two costs this removes on a small host:

  stampede — several callers asking for the SAME track each started their own
             yt-dlp resolve; they now share one in-flight attempt.
  repeat   — a track re-requested soon after was resolved from scratch again.

Correctness constraints that must hold:
  * a cache HIT returns the exact Track the original resolve produced, so the
    pinned source survives;
  * an explicitly requested variant never receives a different recording;
  * a REFUSAL (no suitable authorized recording) is never cached, so a cover
    can never be introduced by caching.

Run:
    python discord-bot/scripts/test_resolve_cache.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "bot"))

import music  # noqa: E402
from music import MusicEngine, Track  # noqa: E402

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


def make_track(title: str, url: str = "https://example/stream") -> Track:
    """A minimal Track carrying an identity we can assert was preserved."""
    t = Track.__new__(Track)
    t.title = title
    t.uploader = "uploader"
    t.duration = 200
    t.stream_url = url
    t.source = "youtube"
    for attr, default in (
        ("query", title), ("webpage_url", url), ("thumbnail", None),
        ("is_original", True), ("provenance", "HEURISTIC_PROVIDER_MATCH"),
    ):
        if not hasattr(t, attr):
            setattr(t, attr, default)
    return t


class StubEngine(MusicEngine):
    """Counts real resolves; does no network work."""

    def __init__(self, delay: float = 0.05, fail: bool = False) -> None:
        super().__init__()
        self.delay = delay
        self.fail = fail
        self.calls = 0

    async def _resolve_unbounded(self, query: str):
        self.calls += 1
        await asyncio.sleep(self.delay)
        if self.fail:
            return None
        return make_track(query, f"https://cdn/{abs(hash(query))}")


def reset_gate(limit: int = 4) -> None:
    music.config.MUSIC_RESOLVE_CONCURRENCY = limit
    music.config.MUSIC_RESOLVE_QUEUE_TIMEOUT = 120
    MusicEngine._resolve_semaphore = None
    MusicEngine._resolve_loop = None
    MusicEngine._resolve_inflight = 0
    MusicEngine._resolve_peak = 0


async def test_key_normalisation() -> None:
    print("cache key normalises case, spacing and punctuation")
    eng = StubEngine()
    variants = ["Take On Me  -  A-HA", "take on me a-ha", "TAKE ON ME   A-HA"]
    keys = {eng.resolve_cache_key(q) for q in variants}
    check("same request -> one key", len(keys) == 1, str(keys))
    check("variant request is a DIFFERENT key",
          eng.resolve_cache_key("take on me a-ha") != eng.resolve_cache_key("take on me a-ha sped up"))
    check("different song is a different key",
          eng.resolve_cache_key("take on me a-ha") != eng.resolve_cache_key("billie jean"))


async def test_cache_hit_avoids_resolve() -> None:
    print("a repeated request is served from cache")
    reset_gate()
    eng = StubEngine()
    first = await eng.resolve("Take On Me a-ha")
    second = await eng.resolve("Take On Me a-ha")
    check("first resolved", first is not None)
    check("only ONE resolve happened", eng.calls == 1, f"calls={eng.calls}")
    check("cache served the second", second is not None)
    check("pinned source preserved exactly",
          second is not None and second.stream_url == first.stream_url,
          f"{getattr(second, 'stream_url', None)} vs {getattr(first, 'stream_url', None)}")
    check("hits counted", eng.cache_stats()["resolver_cache_hits"] >= 1,
          str(eng.cache_stats()))


async def test_variant_not_served_from_plain_cache() -> None:
    print("an explicit variant never reuses the plain recording")
    reset_gate()
    eng = StubEngine()
    await eng.resolve("take on me a-ha")
    await eng.resolve("take on me a-ha sped up")
    check("variant triggered its own resolve", eng.calls == 2, f"calls={eng.calls}")


async def test_stampede_shares_one_attempt() -> None:
    print("5 simultaneous requests for one track -> ONE resolve")
    reset_gate(limit=8)
    eng = StubEngine(delay=0.20)
    results = await asyncio.gather(*(eng.resolve("wannabe spice girls") for _ in range(5)))
    check("all callers got a track", all(r is not None for r in results))
    check("only one resolve ran", eng.calls == 1, f"calls={eng.calls}")
    check("waiters were counted", eng.cache_stats()["resolver_shared_waiters"] >= 4,
          str(eng.cache_stats()))
    # Everyone must receive the SAME pinned source, not just any track.
    urls = {r.stream_url for r in results if r is not None}
    check("all callers got the SAME source", len(urls) == 1, str(urls))


async def test_refusal_is_not_cached() -> None:
    print("a refusal is never cached (no cover can be introduced)")
    reset_gate()
    eng = StubEngine(fail=True)
    first = await eng.resolve("bohemian rhapsody queen")
    second = await eng.resolve("bohemian rhapsody queen")
    check("first refused", first is None)
    check("second refused too", second is None)
    check("refusal was NOT cached", eng.cache_stats()["resolver_cache_entries"] == 0,
          str(eng.cache_stats()))
    check("it genuinely re-resolved rather than replaying", eng.calls == 2, f"calls={eng.calls}")


async def test_inflight_entry_cleared() -> None:
    print("the in-flight entry is always cleared")
    reset_gate()
    eng = StubEngine()
    await eng.resolve("clearing test")
    check("no stuck in-flight keys",
          eng.cache_stats()["resolver_inflight_queries"] == 0, str(eng.cache_stats()))

    class Boom(StubEngine):
        async def _resolve_unbounded(self, query: str):
            raise RuntimeError("provider exploded")

    eng2 = Boom()
    try:
        await eng2.resolve("boom")
    except RuntimeError:
        pass
    check("cleared after an exception too",
          eng2.cache_stats()["resolver_inflight_queries"] == 0, str(eng2.cache_stats()))


async def test_cache_bounded() -> None:
    print("cache respects its size ceiling")
    reset_gate()
    music.RESOLVE_CACHE_MAX = 5
    try:
        eng = StubEngine(delay=0.0)
        for i in range(12):
            await eng.resolve(f"unique song number {i}")
        check("cache never exceeds the ceiling",
              eng.cache_stats()["resolver_cache_entries"] <= 5,
              str(eng.cache_stats()))
    finally:
        music.RESOLVE_CACHE_MAX = 200


def main() -> int:
    for coro in (
        test_key_normalisation(),
        test_cache_hit_avoids_resolve(),
        test_variant_not_served_from_plain_cache(),
        test_stampede_shares_one_attempt(),
        test_refusal_is_not_cached(),
        test_inflight_entry_cleared(),
        test_cache_bounded(),
    ):
        asyncio.run(coro)
    print(f"\n{PASSED} passed, {FAILED} failed")
    return 1 if FAILED else 0


if __name__ == "__main__":
    raise SystemExit(main())