#!/usr/bin/env python3
"""Check the scene backgrounds survive the card renderer.

    python scripts/check_level_background_quality.py

Generating a pretty source image is not the same as producing a usable card
backdrop. `render_card_background` lays a dark gradient over the art and
`render_level_card` adds a second luminance-scaled shade on top, so a source
that is already dark comes out near-black — indistinguishable from "the
background setting does nothing", which is the exact bug this whole area has.

So this renders each theme through the REAL card pipeline and asserts:
  - the result is a PNG;
  - it carries real tonal range (stddev above a floor), i.e. detail survived
    the shade rather than being crushed to a flat panel;
  - its mean luminance is in a legible band, not crushed and not blown out;
  - every scene theme is distinct from every other, including the eight
    hand-drawn ones already in production.
"""
import hashlib
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "discord-bot" / "bot"))

import leveling_sys as lv  # noqa: E402
from PIL import Image, ImageStat  # noqa: E402

SCENE = ["night-campus", "deep-space", "mystic-forest", "neon-city",
         "fantasy-castle", "arcade", "sunset", "sky", "midnight", "muragoods"]

# A card that is this dark or this flat reads as "no background applied".
MIN_STDDEV = 12.0
LUM_MIN, LUM_MAX = 26.0, 165.0

failures = []


def card_stats(theme):
    kind, payload = lv.render_level_card("check", None, 7, 120, 800, 3,
                                         background_id=theme)
    if kind != "png":
        return None, kind, None
    img = Image.open(io.BytesIO(payload)).convert("RGB")
    st = ImageStat.Stat(img.convert("L"))
    return (st.mean[0], st.stddev[0]), "png", hashlib.sha256(payload).hexdigest()[:12]


def main():
    known = list(lv.SERVER_CARD_BACKGROUNDS) + SCENE
    unknown = [t for t in known if t not in lv.SERVER_CARD_BACKGROUNDS]
    if unknown:
        print("NOTE: not yet registered in SERVER_CARD_BACKGROUNDS:", ", ".join(unknown))
        print("      (expected until the theme list is updated)\n")

    rows = []
    print(f"{'theme':<16} {'kind':<5} {'mean':>7} {'stddev':>8}  verdict")
    for theme in SCENE:
        stats, kind, digest = card_stats(theme)
        if stats is None:
            print(f"{theme:<16} {kind:<5} {'-':>7} {'-':>8}  FAIL not a png")
            failures.append(f"{theme}: renderer returned {kind}")
            continue
        mean, sd = stats
        bad = []
        if sd < MIN_STDDEV:
            bad.append(f"too flat (stddev {sd:.1f})")
        if not (LUM_MIN <= mean <= LUM_MAX):
            bad.append(f"luminance {mean:.0f} out of band")
        verdict = "ok" if not bad else "FAIL " + "; ".join(bad)
        print(f"{theme:<16} {kind:<5} {mean:7.1f} {sd:8.1f}  {verdict}")
        if bad:
            failures.append(f"{theme}: {verdict}")
        rows.append((theme, digest))

    digests = [d for _, d in rows if d]
    dupes = len(digests) != len(set(digests))
    print()
    if dupes:
        print("FAIL two scene themes render the same image")
        failures.append("duplicate scene renders")
    else:
        print(f"ok   all {len(digests)} scene themes render distinctly")

    # Also confirm each is distinct from the pre-existing hand-drawn themes.
    clashes = []
    for theme in SCENE:
        _, _, d1 = card_stats(theme)
        for other in lv.SERVER_CARD_BACKGROUNDS:
            if other == theme:
                continue
            _, _, d2 = card_stats(other)
            if d1 == d2:
                clashes.append(f"{theme} == {other}")
    if clashes:
        print("FAIL clashes with existing themes: " + ", ".join(clashes))
        failures.append("scene themes clash with existing ones")
    elif all(t in lv.SERVER_CARD_BACKGROUNDS for t in SCENE):
        print("ok   no scene theme collides with an existing one")

    print()
    if failures:
        print(f"FAILED ({len(failures)})")
        for f in failures:
            print("  - " + f)
        sys.exit(1)
    print("PASS — every scene background survives the card renderer.")


if __name__ == "__main__":
    main()
