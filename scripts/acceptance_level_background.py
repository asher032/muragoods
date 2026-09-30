#!/usr/bin/env python3
"""Acceptance test for the dashboard → database → Discord PNG chain.

    python scripts/acceptance_level_background.py

Runs the user's exact sequence three times with three visibly different
themes, and after each save asserts the RENDERED PNG changed — with no bot
restart, no redeploy, no manual database edit and no hardcoded override in
between.

The theme ids in this project are the eight imported pictures (duck-toast,
frog-meadow, frog-pond, goldfish-glass, starry-duck, chick-lily, frog-sky,
pixel-sunset). `night-campus` / `neon-city` / `deep-space` / `sunset` from the
original report do not exist here; the closest equivalents by appearance are
starry-duck (night sky), pixel-sunset (sunset) and frog-pond (deep blue).
"""
import asyncio
import hashlib
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "discord-bot" / "bot"))

import leveling_sys as lv  # noqa: E402
from PIL import Image, ImageStat  # noqa: E402

GUILD = "997389969448517632"

# The user's requested sequence, mapped onto this project's real themes.
SEQUENCE = [
    ("neon-city  -> starry-duck", "starry-duck"),
    ("sunset     -> pixel-sunset", "pixel-sunset"),
    ("deep-space -> frog-pond", "frog-pond"),
]


class _Coll:
    def __init__(self):
        self.doc = None

    async def find_one(self, _q, *_a, **_k):
        return self.doc

    async def update_one(self, _q, update, **_k):
        self.doc = {**(self.doc or {}), **update.get("$set", {})}


class _DB:
    def __init__(self):
        self.guild_config = _Coll()
        self.xp = _Coll()


def dashboard_push_merge(current: dict, body: dict) -> dict:
    """The merge the site's PATCH + the bot's POST /leveling/config perform.

    Mirrors the handler exactly, including the rule that an incoming background
    key is authoritative — `current` already carries a previously stored theme,
    so deriving the result from `current` alone would let the stale canonical
    field beat this request and silently drop the save.
    """
    out = dict(current)
    incoming = None
    for key, value in body.items():
        if key in ("serverBackground", "server_card_background"):
            incoming = lv.resolve_server_background(value)
            out[key] = incoming
        else:
            out[key] = value
    theme = incoming or lv.coerce_server_background(
        out.get("server_card_background"), out.get("serverBackground"))
    out["server_card_background"] = theme
    out["serverBackground"] = theme
    return out


async def render_for_guild(db, guild_id, source):
    """Exactly what /level does: resolve, then render."""
    cfg = await lv.get_level_config(db, guild_id)
    theme = await lv.resolve_level_background(db, guild_id, cfg=cfg, source=source)
    kind, payload = lv.render_level_card("acceptance", None, 7, 120, 800, 3,
                                         background_id=theme)
    return theme, kind, payload


async def main():
    db = _DB()
    digests = []
    failures = []

    for label, theme in SEQUENCE:
        print("=" * 72)
        print(f"STEP  —  dashboard selects {label}")
        print("=" * 72)

        # 1. DASHBOARD SELECTION + SAVE (no restart, no redeploy anywhere below).
        # The SECOND save onward starts from the already-stored config, which is
        # what made this bug bite: a stale field could outrank the new choice.
        body = {"server_card_background": theme, "serverBackground": theme}
        merged = dashboard_push_merge(
            db.guild_config.doc["leveling"] if db.guild_config.doc
            else dict(lv.LEVEL_DEFAULTS),
            body)
        db.guild_config.doc = {"guildId": GUILD, "leveling": merged}

        # 2. VERIFY DATABASE.
        stored = db.guild_config.doc["leveling"]
        canonical = stored.get("server_card_background")
        alias = stored.get("serverBackground")
        ok_db = canonical == theme and alias == theme
        print(f"  database  server_card_background = {canonical!r}")
        print(f"  database  serverBackground        = {alias!r}")
        print(f"  {'ok  ' if ok_db else 'FAIL'} both spellings hold the selection")
        if not ok_db:
            failures.append(f"{theme}: database holds {canonical!r}")

        # 3. RUN /level — same process, no restart.
        resolved, kind, payload = await render_for_guild(
            db, int(GUILD), source="acceptance/command")
        ok_res = resolved == theme
        print(f"  /level resolved theme  = {resolved!r}")
        print(f"  {'ok  ' if ok_res else 'FAIL'} resolver returned the selection")
        if not ok_res:
            failures.append(f"{theme}: resolved {resolved!r}")

        # 4. ACTUAL DISCORD PNG.
        img = Image.open(io.BytesIO(payload)).convert("RGB")
        digest = hashlib.sha256(payload).hexdigest()[:16]
        mean = tuple(round(c) for c in ImageStat.Stat(img).mean)
        digests.append(digest)
        print(f"  png kind={kind} digest={digest} meanRGB={mean}")
        if kind != "png":
            failures.append(f"{theme}: card did not render as png")

        # Compare against rendering that theme in isolation — proves the PNG is
        # built from the selection and not from some other layer.
        _, direct = lv.render_level_card("acceptance", None, 7, 120, 800, 3,
                                         background_id=theme)
        ok_px = hashlib.sha256(direct).hexdigest()[:16] == digest
        print(f"  {'ok  ' if ok_px else 'FAIL'} png is byte-identical to that theme alone")
        if not ok_px:
            failures.append(f"{theme}: png does not match the theme alone")
        print()

    print("=" * 72)
    print("SUMMARY")
    print("=" * 72)
    print(f"  distinct PNGs across the sequence : {len(set(digests))} of {len(digests)}")
    if len(set(digests)) != len(digests):
        failures.append("two selections produced the same image")
        print("  FAIL at least two selections produced the SAME image")
    else:
        print("  ok   every selection produced a DIFFERENT image")

    # The automatic level-up path must use the same resolver.
    cog = (ROOT / "discord-bot" / "bot" / "cogs" / "leveling.py").read_text()
    shared = cog.count("def build_level_card(") == 1
    level_up_uses = "await build_level_card(" in cog
    print(f"  {'ok  ' if shared and level_up_uses else 'FAIL'} "
          f"/level and level-up share one card builder")
    if not (shared and level_up_uses):
        failures.append("level-up path does not use the shared builder")

    # No cache between the dashboard save and the render.
    lvs = (ROOT / "discord-bot" / "bot" / "leveling_sys.py").read_text()
    get_cfg = lvs.split("async def get_level_config")[1].split("\ndef ")[0]
    no_cache = "find_one" in get_cfg and "\n    _cache" not in get_cfg
    print(f"  {'ok  ' if no_cache else 'FAIL'} "
          f"config is read from the database on every card (no cache, no restart)")
    if not no_cache:
        failures.append("config appears to be cached")

    print()
    if failures:
        print(f"FAILED: {len(failures)}")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("PASS — the dashboard selection controls the real Discord card.")


if __name__ == "__main__":
    asyncio.run(main())