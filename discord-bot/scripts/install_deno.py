#!/usr/bin/env python3
"""Download a static Deno build into ./bin for yt-dlp's JavaScript solver.

yt-dlp cannot solve YouTube's signature / n-parameter challenges without an
external JavaScript runtime, and the only runtime it enables on its own is
Deno. The app host ships no Deno, and a runtime that is not on PATH is
invisible to yt-dlp — so extraction fails and the failure is easily mistaken
for an IP block ("Sign in to confirm you're not a bot"). This fetches the
official static binary at build time and unpacks it next to the bot, where
``bot/music.py`` puts it on PATH before any track is resolved.

Deliberately never fatal: if the download fails the app must still start and
behave exactly as it did before, just with the runtime unavailable and
``/health`` reporting that honestly.

Usage (Render runs this from the ``discord-bot`` rootDir):
    python scripts/install_deno.py
    python scripts/install_deno.py --asset deno-x86_64-unknown-linux-gnu.zip
"""

from __future__ import annotations

import argparse
import io
import platform
import stat
import sys
import urllib.request
import zipfile
from pathlib import Path

RELEASE_BASE = "https://github.com/denoland/deno/releases/latest/download/"

# yt-dlp probes the executable by name, so every archive must contain "deno".
ASSETS = {
    ("Linux", "x86_64"): "deno-x86_64-unknown-linux-gnu.zip",
    ("Linux", "amd64"): "deno-x86_64-unknown-linux-gnu.zip",
    ("Linux", "aarch64"): "deno-aarch64-unknown-linux-gnu.zip",
    ("Linux", "arm64"): "deno-aarch64-unknown-linux-gnu.zip",
    ("Darwin", "x86_64"): "deno-x86_64-apple-darwin.zip",
    ("Darwin", "arm64"): "deno-aarch64-apple-darwin.zip",
    ("Windows", "AMD64"): "deno-x86_64-pc-windows-msvc.zip",
}

# discord-bot/bin — one level above this file's directory.
DEST = Path(__file__).resolve().parent.parent / "bin"


def resolve_asset(override: str | None) -> str | None:
    if override:
        return override
    return ASSETS.get((platform.system(), platform.machine()))


def install(asset: str) -> int:
    url = RELEASE_BASE + asset
    print(f"[deno] downloading {url}", flush=True)
    try:
        with urllib.request.urlopen(url, timeout=180) as response:
            payload = response.read()
        DEST.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            archive.extractall(DEST)
        binary = DEST / "deno"
        if not binary.exists():
            print(f"[deno] archive had no 'deno' binary; found {[p.name for p in DEST.iterdir()]}",
                  file=sys.stderr)
            return 0
        binary.chmod(binary.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        print(f"[deno] installed {binary}", flush=True)
    except Exception as exc:  # network, zip, permissions — never fatal
        print(f"[deno] install skipped ({type(exc).__name__}: {exc})", file=sys.stderr)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", default=None,
                        help="Override the release asset (used to cross-test on another platform).")
    args = parser.parse_args()

    asset = resolve_asset(args.asset)
    if not asset:
        print(f"[deno] no build for {platform.system()}/{platform.machine()}; skipping", file=sys.stderr)
        return 0
    return install(asset)


if __name__ == "__main__":
    raise SystemExit(main())
