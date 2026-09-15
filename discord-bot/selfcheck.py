"""Offline self-check: validates config, imports, and syntax without touching Discord."""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "bot"))

logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(name)s: %(message)s")
log = logging.getLogger("selfcheck")

failures: list[str] = []

# 1. All modules import cleanly (catches syntax errors, missing deps).
try:
    import config
    import database
    import tmdb
    import bridge
    import music
    import utils
    log.info("OK core modules import")
except Exception as exc:
    failures.append(f"core import: {exc}")
    for f in failures:
        print("FAIL:", f)
    sys.exit(1)

# 2. Config sanity.
problems = config.validate()
for p in problems:
    log.warning("config: %s", p)
if not config.DISCORD_TOKEN:
    log.warning("DISCORD_TOKEN missing — set it in .env before starting the bot")
else:
    log.info("OK DISCORD_TOKEN present")

# 3. Cogs import cleanly.
import importlib
for cog in ("cogs.murastream", "cogs.watchtogether", "cogs.music", "cogs.moderation", "cogs.muragoods"):
    try:
        importlib.import_module(cog)
        log.info("OK %s", cog)
    except Exception as exc:
        failures.append(f"{cog}: {exc}")

# 4. yt-dlp resolves a known-good track (non-fatal if offline).
import asyncio

async def check_ytdlp():
    try:
        track = await music.engine.resolve("lofi hip hop")
        if track:
            log.info("OK yt-dlp resolved: %s", track.title[:60])
        else:
            log.warning("yt-dlp returned no result (network?)")
    except Exception as exc:
        log.warning("yt-dlp check failed (non-fatal): %s", exc)

# 5. TMDB proxy reachable (non-fatal if offline).
async def check_tmdb():
    try:
        results = await tmdb.search("inception")
        if results:
            log.info("OK TMDB proxy search (%d results, first: %s)", len(results), results[0]["title"])
        else:
            log.warning("TMDB proxy returned no results (site down or offline?)")
    except Exception as exc:
        log.warning("TMDB check failed (non-fatal): %s", exc)

async def main():
    await check_ytdlp()
    await check_tmdb()

if failures:
    for f in failures:
        print("FAIL:", f)
    sys.exit(1)

asyncio.run(main())
log.info("Self-check complete - no import/syntax failures.")
