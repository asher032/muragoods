#!/usr/bin/env python3
"""End-to-end trace of the ACTUAL level-card background chain.

    python scripts/trace_level_background.py

Runs the real bot modules in the real order and reports, at each hop, what the
renderer would use. Nothing here is a stand-in for production code: every step
below is the module the bot imports.
"""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "discord-bot" / "bot"))

import leveling_sys as lv  # noqa: E402
from PIL import Image  # noqa: E402
import io  # noqa: E402


class _Coll:
    def __init__(self):
        self.doc = None

    async def find_one(self, q, *a, **k):
        return self.doc

    async def update_one(self, q, update, **k):
        self.doc = {**(self.doc or {}), **update.get("$set", {})}


class _DB:
    def __init__(self):
        self.guild_config = _Coll()
        self.xp = _Coll()


GUILD = "997389969448517632"


def bot_push_merge(current: dict, body: dict) -> dict:
    """Exact merge performed by POST /leveling/config in main.py."""
    out = dict(current)
    for key, value in body.items():
        if key not in lv.LEVEL_DEFAULTS:
            continue
        if key in ("serverBackground", "server_card_background"):
            out[key] = lv.resolve_server_background(value)
        else:
            out[key] = value
    out["server_card_background"] = out.get("serverBackground", lv.SERVER_CARD_DEFAULT)
    return out


async def main():
    db = _DB()

    print("=" * 72)
    print("HOP 1 — dashboard PATCH body (what the browser posts)")
    print("=" * 72)
    body = {"leveling": {"serverBackground": "pixel-sunset", "cardColor": "#5865F2"}}
    print(f"  body.leveling.serverBackground = {body['leveling']['serverBackground']!r}")

    print()
    print("=" * 72)
    print("HOP 2 — bot POST /leveling/config merge")
    print("=" * 72)
    current = dict(lv.LEVEL_DEFAULTS)
    merged = bot_push_merge(current, body["leveling"])
    db.guild_config.doc = {"guildId": GUILD, "leveling": merged}
    print(f"  stored server_card_background = "
          f"{merged.get('server_card_background')!r}")
    print(f"  stored serverBackground        = {merged.get('serverBackground')!r}")

    print()
    print("=" * 72)
    print("HOP 3 — get_level_config (what /level actually reads)")
    print("=" * 72)
    cfg = await lv.get_level_config(db, int(GUILD))
    print(f"  cfg keys present: {sorted(k for k in cfg if 'ackground' in k)}")
    print(f"  cfg['serverBackground']          = {cfg.get('serverBackground')!r}")
    print(f"  cfg['server_card_background']    = {cfg.get('server_card_background')!r}")

    print()
    print("=" * 72)
    print("HOP 4 — get_level_card_background (the resolver)")
    print("=" * 72)
    theme = lv.get_level_card_background(cfg, guild_id=int(GUILD), source="trace")
    print(f"  resolved theme = {theme!r}")

    print()
    print("=" * 72)
    print("HOP 5 — render_level_card -> PNG, and its actual pixels")
    print("=" * 72)
    kind, payload = lv.render_level_card(
        "tester", None, 5, 1, 500, 1, background_id=theme)
    print(f"  kind={kind!r} bytes={len(payload) if payload else 0}")
    from PIL import ImageStat
    img = Image.open(io.BytesIO(payload)).convert("RGB")
    png_digest = hashlib.sha256(payload).hexdigest()[:16]
    mean_rgb = tuple(round(c) for c in ImageStat.Stat(img).mean)
    print(f"  png digest = {png_digest}")
    print(f"  mean RGB   = {mean_rgb}")

    print()
    print("  -- compare against each theme rendered on its own --")
    print("  (identical digests between rows = two themes render the SAME image)")
    digests = {}
    for tid in lv.SERVER_CARD_BACKGROUNDS:
        k, p = lv.render_level_card("tester", None, 5, 1, 500, 1, background_id=tid)
        if k != "png":
            print(f"  {tid:<16} RENDER FAILED (kind={k})")
            continue
        d = hashlib.sha256(p).hexdigest()[:16]
        digests[tid] = d
        mark = "   <-- /level used this" if d == png_digest else ""
        print(f"  {tid:<16} {d}{mark}")

    print()
    print("=" * 72)
    print("HOP 6 — the DOCUMENTED field name alone")
    print("=" * 72)
    print("  guild_config.leveling holds ONLY server_card_background")
    db.guild_config.doc = {
        "guildId": GUILD,
        "leveling": {"server_card_background": "goldfish-glass",
                     "xpMin": 15, "xpMax": 25},
    }
    cfg_doc = await lv.get_level_config(db, int(GUILD))
    theme_doc = lv.get_level_card_background(cfg_doc, guild_id=int(GUILD),
                                             source="trace-documented-field")
    print(f"  stored server_card_background = 'goldfish-glass'")
    print(f"  get_level_config kept it?     = "
          f"{'server_card_background' in cfg_doc}")
    print(f"  RESOLVED THEME                = {theme_doc!r}")
    verdict = "OK" if theme_doc == "goldfish-glass" else "WRONG - renders default"
    print(f"  VERDICT: {verdict}")
    _, doc_png = lv.render_level_card("tester", None, 5, 1, 500, 1,
                                      background_id=theme_doc)
    print(f"  png digest = {hashlib.sha256(doc_png).hexdigest()[:16]} "
          f"(duck-toast default = {digests.get('duck-toast')})")

    print()
    print("=" * 72)
    print("HOP 7 — after an in-bot save (_save_level_cfg) rewrites the record")
    print("=" * 72)
    saved = dict(cfg_doc)
    saved.update({"serverBackground": "starry-duck"})
    db.guild_config.doc = {"guildId": GUILD, "leveling": saved}
    print(f"  $set: {{leveling: <get_level_config output>}}")
    print(f"  does that output carry server_card_background? "
          f"{'server_card_background' in saved}")
    print(f"  surviving background keys: "
          f"{sorted(k for k in saved if 'ackground' in k)}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())