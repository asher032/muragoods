#!/usr/bin/env python3
"""Music preflight: resolve one track through every egress path, in one step.

Thin CLI over the bot's shared preflight core
(`MusicEngine.preflight` in bot/music.py) — the same code the dashboard's
bridge-secret `GET /music/preflight` endpoint calls, so shell and dashboard
can never disagree about what was tested.

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

import asyncio
import os
import sys
from pathlib import Path

BOT_DIR = Path(__file__).resolve().parent.parent / "bot"
sys.path.insert(0, str(BOT_DIR))


def _load_music():
    """The bot's own engine module, when its dependencies are importable."""
    try:
        import music as music_mod  # noqa: F401
        return music_mod
    except Exception as exc:  # pragma: no cover - depends on the host
        print(f"  SKIP       engine   bot modules unavailable here ({type(exc).__name__})")
        return None


async def main() -> int:
    music_mod = _load_music()
    if music_mod is None:
        return 1
    query = None
    if "--query" in sys.argv:
        try:
            query = sys.argv[sys.argv.index("--query") + 1]
        except IndexError:
            query = None

    import config as config_mod
    proxy = (config_mod.YOUTUBE_PROXY or os.environ.get("YOUTUBE_PROXY", "")).strip()
    cookies = music_mod.cookies_path()

    print("music preflight")
    print(f"  proxy configured: {bool(proxy)}   cookies: {'yes' if cookies else 'no'}")
    result = await music_mod.engine.preflight(query)
    print(f"  track: {result['track']}")
    print()
    for path in ("direct", "proxy", "engine"):
        entry = result["paths"].get(path, {"state": "NOT RUN", "note": ""})
        print(f"  {entry['state']:<10} {path:<8} {entry['note']}")
    print()
    print("direct extraction:", "PASS" if result["ok"] else "FAIL")
    if result["ok"]:
        print("Playback can resolve on this host even if the proxy is challenged.")
    else:
        print("YouTube extraction is blocked from this host on every path.")
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
