#!/usr/bin/env python3
"""Music preflight: resolve one track through every egress path, in one step.

This answers the question the production battery could not answer from outside
Render: does YouTube extraction actually work here, and on which egress?

Paths tested, in the order the resolver uses them:

  direct   this host's own egress, cookies applied — the fallback path that
           exists so a challenged proxy cannot take music down
  proxy    YOUTUBE_PROXY exactly as get_ydl_opts() builds it
  engine   the real MusicEngine.resolve(), i.e. the tagged plan with the
           bounded proxy → direct fallback and the youtube_bot_challenge
           classifier

Never prints the proxy URL, its credentials, cookies or any key: only states
and outcomes. Run locally or on Render:

    python scripts/music_preflight.py
    python scripts/music_preflight.py --query "some other track"

Exit code 0 when the direct path works (that is the path playback depends on),
1 otherwise, so it can gate a deploy step.
"""

import os
import sys
from pathlib import Path

TRACK = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"  # stable public video
BOT_DIR = Path(__file__).resolve().parent.parent / "bot"
sys.path.insert(0, str(BOT_DIR))

RESULTS: list[tuple[str, str, str]] = []


def record(path: str, state: str, note: str = "") -> None:
    RESULTS.append((path, state, note))
    print(f"  {state:<10} {path:<8} {note}")


def _load_engine():
    """The bot's own modules, when their dependencies are importable."""
    try:
        import config  # noqa: F401
        import music  # noqa: F401
        return config, music
    except Exception as exc:  # pragma: no cover - depends on the host
        print(f"  SKIP       engine   bot modules unavailable here ({type(exc).__name__})")
        return None, None


def _challenge(text: str) -> bool:
    low = (text or "").lower()
    return any(marker in low for marker in (
        "confirm you're not a bot", "confirm you\u2019re not a bot",
        "sign in to confirm", "captcha", "automated queries",
        "unusual traffic", "too many requests",
    ))


def _extract(use_proxy: bool, proxy: str, cookies: str | None) -> tuple[str, str]:
    """One yt-dlp extraction. Returns (state, note) with no secrets inside."""
    import yt_dlp

    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "format": "bestaudio/best",
        "socket-timeout": 20,
        # yt-dlp enables ONLY deno by default; production carries node.
        "js_runtimes": {"deno": {}, "node": {}, "quickjs": {}, "bun": {}},
    }
    if use_proxy and proxy:
        opts["proxy"] = proxy
    if cookies:
        opts["cookiefile"] = cookies
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(TRACK, download=False)
    except Exception as exc:
        text = str(exc)
        if _challenge(text):
            return "CHALLENGED", "YouTube refused this egress (bot check)"
        return "FAILED", f"{type(exc).__name__}: {text[:120]}"
    if not info:
        return "FAILED", "yt-dlp returned no info"
    title = str(info.get("title") or "")[:60]
    return "PASS", f"{title} ({info.get('ext')}, acodec={info.get('acodec')})"


async def _engine_path(music_mod, query: str) -> None:
    try:
        track = await music_mod.MusicEngine().resolve(query)
    except Exception as exc:
        record("engine", "FAILED", f"{type(exc).__name__}: {str(exc)[:120]}")
        return
    state = music_mod.proxy_state()
    note = f"egress={state['last_egress']} proxy={state['status']}"
    if track is None:
        kind = music_mod.engine.get_error_kind()
        record("engine", "FAILED", f"classified {kind!r}; {note}")
        return
    record("engine", "PASS", f"{track.title[:50]} | {note}")


async def main() -> int:
    query_flag = "--query" in sys.argv
    if query_flag:
        global TRACK
        TRACK = sys.argv[sys.argv.index("--query") + 1]

    config, music_mod = _load_engine()
    proxy = (config.YOUTUBE_PROXY if config else os.environ.get("YOUTUBE_PROXY", "")).strip()
    cookies = None
    if music_mod:
        cookies = music_mod.cookies_path()
    else:
        cookies = os.environ.get("YT_COOKIES_FILE") or None

    print("music preflight")
    print(f"  proxy configured: {bool(proxy)}   cookies: {'yes' if cookies else 'no'}")
    print(f"  track: {TRACK}")
    print()

    record("direct", *_extract(False, proxy, cookies))
    if proxy:
        record("proxy", *_extract(True, proxy, cookies))
    else:
        print("  NOT RUN    proxy    YOUTUBE_PROXY is not configured")
    if music_mod:
        await _engine_path(music_mod, TRACK)
    else:
        print("  NOT RUN    engine   run this on the bot host for the full resolver")

    direct_ok = any(p == "direct" and s == "PASS" for p, s, _ in RESULTS)
    print()
    print("direct extraction:", "PASS" if direct_ok else "FAIL")
    if direct_ok:
        print("Playback can resolve on this host even if the proxy is challenged.")
    else:
        print("YouTube extraction is blocked from this host on every path.")
    return 0 if direct_ok else 1


if __name__ == "__main__":
    import asyncio

    raise SystemExit(asyncio.run(main()))
