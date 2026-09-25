#!/usr/bin/env python3
"""Regression test: a challenged YouTube proxy must not take music down.

The live production failure this guards against:

    YOUTUBE_PROXY was reachable (HTTP 200, egress 192.177.124.235) but YouTube
    refused every request through it with
        "Sign in to confirm you're not a bot"
    while the identical cookies + Node/EJS runtime resolved the *same* track
    directly. The resolver treated the challenge as fatal, so playback died
    with the proxy even though the host's own egress worked.

The resolver must therefore:
  1. use the configured proxy while YouTube still accepts its IP,
  2. detect the challenge and retry the same query on this host's own egress
     exactly once (bounded: no proxy → direct → proxy → direct loop),
  3. classify it as `youtube_bot_challenge` with a credential-free state, and
  4. never expose the proxy URL, username or password.

yt-dlp is stubbed, so this needs no network, no cookies and no real proxy.

Usage:
    python scripts/test_youtube_egress_fallback.py          # proxy configured (hermetic)
    python scripts/test_youtube_egress_fallback.py no-proxy # host egress only (hermetic)
    python scripts/test_youtube_egress_fallback.py live     # real network, host diagnosis

The first two modes stub yt-dlp, so they are safe in CI. `live` deliberately
resolves for real and depends on YouTube reachability from this host.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

FAKE_PROXY = "http://egressuser:egresspass@proxy.invalid:8080"
CHALLENGE = (
    "ERROR: [youtube] aqz-KE-bpKQ: Sign in to confirm you're not a bot. "
    "Use --cookies-from-browser or --cookies for the authentication."
)

BOT_DIR = Path(__file__).resolve().parent.parent / "bot"
sys.path.insert(0, str(BOT_DIR))

MODE = sys.argv[1] if len(sys.argv) > 1 else "proxy"

# config.py loads discord-bot/.env without overriding existing env vars, so
# pinning these before the import keeps the hermetic modes off the network.
# "live" leaves the real environment alone on purpose.
if MODE == "proxy":
    os.environ["YOUTUBE_PROXY"] = FAKE_PROXY
elif MODE != "live":
    os.environ["YOUTUBE_PROXY"] = ""
if MODE != "live":
    os.environ.pop("YT_COOKIES", None)
    os.environ.pop("YT_COOKIES_FILE", None)

import music as music_mod  # noqa: E402  (import after the environment is fixed)

FAILURES: list[str] = []


def check(condition: bool, label: str) -> None:
    print(f"  {'PASS' if condition else 'FAIL'}  {label}")
    if not condition:
        FAILURES.append(label)


class StubYDL:
    """yt-dlp stand-in that records which egress each call would have used."""

    calls: list[dict] = []
    seen: list[tuple[str, str]] = []
    challenge: str = "none"  # "none" | "proxy" | "direct" | "both"
    challenge_calls = 0

    def __init__(self, opts):
        self.opts = dict(opts)
        StubYDL.calls.append(self.opts)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def extract_info(self, query, download=False):  # noqa: D401 - mimics yt-dlp
        egress = "proxy" if self.opts.get("proxy") else "direct"
        StubYDL.seen.append((egress, query))
        # The YouTube "ytsearch" strategy searches with the *bare* query (it
        # relies on default_search), so the provider fallbacks are told apart by
        # their own opts and query prefixes rather than by the query wording.
        is_provider = bool(self.opts.get("force_generic_extractor")) or query.startswith(
            ("scsearch:", "bandcamp:")
        )
        if is_provider:
            raise RuntimeError("no entries")
        if StubYDL.challenge in ("both", egress):
            StubYDL.challenge_calls += 1
            raise RuntimeError(CHALLENGE)
        return {
            "title": "Stub Track",
            "url": "https://stub.invalid/audio.webm",
            "webpage_url": "https://www.youtube.com/watch?v=stub",
            "extractor": "youtube",
            "extractor_key": "Youtube",
        }


def install_stub() -> None:
    """Replace yt-dlp with the fixture so no scenario touches the network."""
    music_mod.yt_dlp.YoutubeDL = StubYDL


def reset_proxy_bench() -> None:
    """Undo the cooldown so the next scenario starts with a usable proxy."""
    music_mod._egress_state["bench_until"] = 0.0
    music_mod._egress_state["status"] = music_mod.PROXY_EGRESS_READY


def egresses_since(mark: int) -> list[str]:
    return [egress for egress, _ in StubYDL.seen[mark:]]


async def scenario_challenged_proxy() -> None:
    print("scenario 1: proxy challenged -> direct egress answers")
    install_stub()
    reset_proxy_bench()
    StubYDL.challenge = "proxy"
    StubYDL.seen.clear()
    StubYDL.challenge_calls = 0
    engine = music_mod.MusicEngine()

    track = await engine.resolve("never gonna give you up")

    check(track is not None, "resolve returns a track instead of failing with the proxy")
    check(egresses_since(0)[:2] == ["proxy", "direct"],
          f"proxy tried first, then direct egress (saw {egresses_since(0)[:3]})")
    state = music_mod.proxy_state()
    check(state["status"] == music_mod.PROXY_EGRESS_CHALLENGED, "proxy reported challenged")
    check(state["last_egress"] == "direct", "last successful egress reported as direct")
    check(state["benched"] and not state["in_use"], "challenged proxy benched, not in use")
    blob = json.dumps(state).lower()
    check(not any(part in blob for part in ("egressuser", "egresspass", "proxy.invalid", "http://")),
          "proxy credentials absent from the reported state")


async def scenario_benched_proxy() -> None:
    print("scenario 2: benched proxy is not retried (no flapping)")
    install_stub()
    StubYDL.challenge = "proxy"
    StubYDL.seen.clear()
    engine = music_mod.MusicEngine()

    track = await engine.resolve("never gonna give you up")

    check(track is not None, "resolve still succeeds while the proxy is benched")
    check("proxy" not in egresses_since(0), "benched proxy is skipped entirely")
    check(music_mod.proxy_state()["last_egress"] == "direct", "egress reported as direct")


async def scenario_both_challenged() -> None:
    print("scenario 3: both egresses challenged -> classified, bounded, no hang")
    install_stub()
    reset_proxy_bench()
    StubYDL.challenge = "both"
    StubYDL.seen.clear()
    StubYDL.challenge_calls = 0
    engine = music_mod.MusicEngine()

    track = await engine.resolve("never gonna give you up")

    check(track is None, "resolve fails instead of inventing a result")
    check(engine.get_error_kind() == "youtube_bot_challenge",
          f"classified as youtube_bot_challenge (got {engine.get_error_kind()!r})")
    check(engine.youtube_challenged(), "challenge surfaced for diagnostics")
    check(StubYDL.challenge_calls == 2,
          f"exactly one attempt per egress, not a loop (challenge calls={StubYDL.challenge_calls})")
    check(music_mod.proxy_state()["status"] == music_mod.PROXY_EGRESS_CHALLENGED,
          "proxy left benched after being refused")


async def scenario_no_proxy() -> None:
    print("scenario 4: no proxy configured -> host egress only")
    install_stub()
    StubYDL.challenge = "none"
    StubYDL.seen.clear()
    StubYDL.calls.clear()
    engine = music_mod.MusicEngine()

    track = await engine.resolve("never gonna give you up")

    check(track is not None, "resolve works without any proxy")
    check(all("proxy" not in opts for opts in StubYDL.calls), "no proxy option was built")
    check(music_mod.proxy_state()["status"] == music_mod.PROXY_EGRESS_NOT_CONFIGURED,
          "state reported as not_configured")


def challenge_markers() -> None:
    print("scenario 5: challenge wordings are recognised")
    for text in (CHALLENGE, "Sign in to confirm you're not a bot",
                 "Please solve the captcha", "automated queries",
                 "we detected unusual traffic", "HTTP Error 429: Too Many Requests"):
        check(music_mod.is_bot_challenge(text), f"recognised: {text[:44]!r}")
    # A plain removal must NOT be misread as a challenge: same status code,
    # different cause.
    check(not music_mod.is_bot_challenge("ERROR: [youtube] x: Video unavailable"),
          "ordinary removal is not classified as a challenge")


async def scenario_live() -> None:
    """Real resolve, real egress — for diagnosing a host, never for CI."""
    print("scenario: live resolve (real network)")
    engine = music_mod.MusicEngine()
    track = await engine.resolve("Rick Astley Never Gonna Give You Up")
    state = music_mod.proxy_state()
    check(track is not None,
          f"live resolve returned a track (egress={state['last_egress']}, proxy={state['status']})")
    if track is None:
        print(f"    classified: {engine.get_error_kind()!r} — {engine.get_resolve_error()}")


async def main() -> int:
    print(f"YouTube egress fallback test (mode={MODE}, proxy={'configured' if MODE == 'proxy' else 'unset'})")
    challenge_markers()
    if MODE == "proxy":
        await scenario_challenged_proxy()
        await scenario_benched_proxy()
        await scenario_both_challenged()
    elif MODE == "live":
        await scenario_live()
    else:
        await scenario_no_proxy()
    print()
    if FAILURES:
        print(f"FAILED: {len(FAILURES)} check(s)")
        for item in FAILURES:
            print(f"  - {item}")
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
