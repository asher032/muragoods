#!/usr/bin/env python3
"""Level card backgrounds: the pixels, for real.

    python discord-bot/scripts/test_level_card_backgrounds.py

The Node suite (`scripts/test-level-card.mjs`) proves the CONNECTIVITY — that
the theme the dashboard stored is the one the renderer receives. This suite
proves the part that needs Pillow, and runs in the bot job where Pillow is
installed:

  1. every built-in theme renders a PNG, not a text fallback
  2. every theme renders a VISIBLY DISTINCT image (different bytes AND
     different pixels — two themes that hashed alike would mean the selection
     silently does nothing)
  3. an invalid theme falls back to the default instead of crashing
  4. the fallback image is the default theme's image, not a blank card
  5. two guilds with different stored themes produce different cards

No database, no network, no gateway.
"""

import asyncio
import hashlib
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "bot"))

import leveling_sys as lv  # noqa: E402

passed = 0
failed = 0
failures = []


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok    {name}")
    else:
        failed += 1
        failures.append(name)
        print(f"  FAIL  {name}{f' — {detail}' if detail else ''}")


def section(title):
    print(f"\n{title}")


def render(theme_id):
    """Render one card; return (kind, sha, byte_length) or raise."""
    kind, payload = lv.render_level_card(
        "tester", None, 7, 120, 800, 3, background_id=theme_id
    )
    return kind, hashlib.sha256(payload).hexdigest(), len(payload)


try:
    from PIL import Image  # noqa: F401
    HAVE_PILLOW = True
except Exception:
    HAVE_PILLOW = False

# ── 1 & 2. Every theme renders a real, distinct card ─────────────────────
section("[1] every built-in theme renders a distinct PNG")
if not HAVE_PILLOW:
    check("Pillow is available (the card renderer requires it)", False,
          "pip install Pillow — this suite proves rendered output")
else:
    themes = list(lv.SERVER_CARD_BACKGROUNDS)
    check("the bot declares a theme list", len(themes) >= 8, f"{len(themes)}")
    check("the default theme is declared",
          lv.SERVER_CARD_DEFAULT in lv.SERVER_CARD_BACKGROUNDS)

    rendered = {}
    for theme in themes:
        try:
            kind, sha, size = render(theme)
            rendered[theme] = sha
            check(f"{theme} renders a PNG", kind == "png", kind)
            check(f"{theme} produces a real image", size > 5000, f"{size} bytes")
        except Exception as exc:  # noqa: BLE001
            check(f"{theme} renders a PNG", False, repr(exc)[:160])

    if len(rendered) == len(themes) and len(themes) > 1:
        check("every theme renders VISIBLY DISTINCT bytes",
              len(set(rendered.values())) == len(themes),
              f"{len(set(rendered.values()))} distinct of {len(themes)}")

        # Distinct bytes are necessary but not sufficient: a font or gradient
        # could differ while the BACKGROUND — the thing the operator selected —
        # did not. Compare the backdrop region only.
        try:
            import io as _io

            from PIL import Image as _Image

            def backdrop_signature(theme):
                img = _Image.open(
                    _io.BytesIO(lv.render_level_card(
                        "tester", None, 7, 120, 800, 3, background_id=theme)[1])
                ).convert("RGB")
                # A strip across the lower half, away from the avatar, level
                # text and progress bar: this is painted background artwork.
                strip = img.crop((300, 150, 880, 250))
                return hashlib.sha256(strip.tobytes()).hexdigest()

            sigs = {t: backdrop_signature(t) for t in themes}
            check("every theme paints a DISTINCT BACKGROUND region",
                  len(set(sigs.values())) == len(themes),
                  f"{len(set(sigs.values()))} distinct of {len(themes)}")
        except Exception as exc:  # noqa: BLE001
            check("every theme paints a DISTINCT BACKGROUND region", False,
                  repr(exc)[:160])

# ── 3 & 4. An invalid theme falls back safely ─────────────────────────────
section("[2] an invalid theme falls back to the default")
if HAVE_PILLOW:
    default_sha = render(lv.SERVER_CARD_DEFAULT)[1]
    for bad in ["not-a-theme", "neon-city", "", "https://example.com/bg.png",
                "../../etc/passwd", None]:
        resolved = lv.resolve_server_background(bad)
        check(f"{bad!r} resolves to the default theme",
              resolved == lv.SERVER_CARD_DEFAULT, resolved)
        try:
            kind, sha, size = render(bad)
            check(f"{bad!r} still renders a card", kind == "png" and size > 5000,
                  f"{kind}/{size}")
            check(f"{bad!r} falls back to the DEFAULT image, not a blank one",
                  sha == default_sha, "differs from the default render")
        except Exception as exc:  # noqa: BLE001
            check(f"{bad!r} still renders a card", False, repr(exc)[:160])

# ── 5. The shared resolver reads the guild's stored value ─────────────────
section("[3] the shared resolver reads what the dashboard stored")


class _Coll:
    def __init__(self, doc):
        self.doc = doc

    async def find_one(self, _query, *_a, **_k):
        return self.doc


class _DB:
    def __init__(self, doc):
        self.guild_config = _Coll(doc)


async def _resolved_for(stored, guild_id):
    cfg = await lv.get_level_config(
        _DB({"guildId": str(guild_id), "leveling": {"serverBackground": stored}}),
        guild_id,
    )
    return lv.get_level_card_background(cfg, guild_id=guild_id, source="test")


GUILD_A, GUILD_B = 997389969448517632, 123456789012345678


async def main():
    section("[4] per-guild resolution and independence")
    for theme in lv.SERVER_CARD_BACKGROUNDS:
        got = await _resolved_for(theme, GUILD_A)
        check(f"{theme} reaches the renderer for guild A", got == theme, got)
        got_b = await _resolved_for(theme, GUILD_B)
        check(f"{theme} reaches the renderer for guild B", got_b == theme, got_b)

    # Changing one guild's theme must not move the other's.
    a1 = await _resolved_for("frog-sky", GUILD_A)
    b1 = await _resolved_for("chick-lily", GUILD_B)
    a2 = await _resolved_for("starry-duck", GUILD_A)
    check("guild A resolves its own theme", a1 == "frog-sky", a1)
    check("guild B resolves its own theme", b1 == "chick-lily", b1)
    check("changing guild A does not touch guild B",
          a2 == "starry-duck" and b1 == "chick-lily", f"{a2}/{b1}")

    # There is no module-level config cache: a second read sees the new value
    # with no restart, which was the reported symptom.
    again = await _resolved_for("pixel-sunset", GUILD_A)
    check("a later read returns the NEW theme with no restart",
          again == "pixel-sunset", again)

    if HAVE_PILLOW:
        _, sha_a, _ = render("starry-duck")
        _, sha_b, _ = render("chick-lily")
        check("two guilds render different cards", sha_a != sha_b)

    section("[5] both card paths resolve through the shared helper")
    cog = (ROOT / "bot" / "cogs" / "leveling.py").read_text(encoding="utf-8")
    check("the cog calls get_level_card_background", "get_level_card_background(" in cog)
    check("there is exactly ONE card builder", cog.count("def build_level_card(") == 1,
          str(cog.count("def build_level_card(")))
    check("/level uses the shared builder",
          "build_level_card(" in cog.split("async def level_card")[1].split("async def ")[0])
    check("the level-up path uses the shared builder",
          "build_level_card(" in cog.split("_handle_level_up")[1].split("async def ")[0])
    check("the level-up path renders an image, not only an embed",
          'filename="level.png"' in cog.split("_handle_level_up")[1].split("async def ")[0])
    check("no call site resolves a theme on its own",
          "resolve_server_background(cfg" not in cog)


asyncio.run(main())
print(f"\n{passed} passed, {failed} failed")
if failed:
    print("Failures:\n  - " + "\n  - ".join(failures))
    sys.exit(1)
