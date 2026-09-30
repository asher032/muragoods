#!/usr/bin/env python3
"""Generate the scene-art level-card backgrounds.

    python scripts/generate_level_backgrounds.py

The ten scene themes in `app/lib/level-card-themes.ts` are PROCEDURAL artwork,
not photographs: a seeded generator draws each one, so a theme is reproducible
from source instead of being an opaque binary nobody can edit or review. The
eight hand-drawn companions (duck-toast, frog-meadow, …) are untouched.

Each theme is composed so it survives the renderer's cover-fit into the
900x260 card: the focal point sits inside the middle 60% vertically, because
cover-fit centre-crops a 3.46:1 window and anything near the top or bottom edge
is discarded. Assets are written to BOTH mirrors — the site serves the picker
thumbnail, the bot loads its own copy because Render deploys only discord-bot/.
`scripts/check-level-card-parity.mjs` fails the build if the two ever drift.

Deterministic: every theme is seeded, so re-running produces identical bytes and
a diff here means a real change rather than noise.
"""

import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = ROOT / "public" / "images" / "level-backgrounds"
BOT_DIR = ROOT / "discord-bot" / "bot" / "assets" / "level_backgrounds"

# Matches the card's 900x260 exactly, so cover-fit never crops.
W, H = 1200, 347
# Generous margins: content inside this band always survives the crop.
SAFE_TOP, SAFE_BOTTOM = int(H * 0.20), int(H * 0.80)


def lerp(a, b, t):
    return a + (b - a) * t


def vertical_gradient(stops, h=H, w=W):
    """Multi-stop vertical gradient. `stops` = [(pos 0..1, (r,g,b)), ...]."""
    ys = np.linspace(0.0, 1.0, h)
    cols = np.zeros((h, 3), dtype=np.float64)
    stops = sorted(stops, key=lambda s: s[0])
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        mask = (ys >= p0) & (ys <= p1)
        if not mask.any():
            continue
        t = ((ys[mask] - p0) / max(1e-6, p1 - p0))[:, None]
        cols[mask] = np.array(c0)[None, :] * (1 - t) + np.array(c1)[None, :] * t
    cols[ys < stops[0][0]] = np.array(stops[0][1])
    cols[ys > stops[-1][0]] = np.array(stops[-1][1])
    return np.repeat(cols[:, None, :], w, axis=1)


def add_radial_glow(arr, cx, cy, radius, color, strength=1.0, falloff=2.0):
    """Screen-blend a soft radial light. Coordinates are fractions of W/H."""
    h, w, _ = arr.shape
    xs = (np.arange(w)[None, :] - cx * w) / (radius * w)
    ys = (np.arange(h)[:, None] - cy * h) / (radius * w)
    d = np.sqrt(xs ** 2 + ys ** 2)
    a = np.clip(1.0 - d, 0.0, 1.0) ** falloff * strength
    c = np.array(color, dtype=np.float64)[None, None, :]
    return 255.0 - (255.0 - arr) * (255.0 - c * a[..., None]) / 255.0


def starfield(arr, seed, count=260, max_r=1.9, bright=1.0, avoid=()):
    """Scattered stars with a soft halo. `avoid` = [(cx,cy,r), ...] in fractions,
    for regions a focal point occupies."""
    h, w, _ = arr.shape
    rng = np.random.default_rng(seed)
    layer = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(layer)
    for _ in range(count):
        x = rng.uniform(0, w)
        y = rng.uniform(0, h)
        if any(((x / w - cx) ** 2 + (y / h - cy) ** 2) < r ** 2 for cx, cy, r in avoid):
            continue
        r = rng.uniform(0.5, max_r)
        v = int(rng.uniform(70, 255) * bright)
        d.ellipse([x - r, y - r, x + r, y + r], fill=v)
    layer = layer.filter(ImageFilter.GaussianBlur(0.6))
    m = np.asarray(layer, dtype=np.float64)[..., None] / 255.0
    return 255.0 - (255.0 - arr) * (1.0 - m)


def banded_nebula(arr, seed, color, strength=0.5, scale=9):
    """Soft cloud banding via blurred value noise."""
    h, w, _ = arr.shape
    rng = np.random.default_rng(seed)
    small = rng.random((max(2, h // scale), max(2, w // scale)))
    noise = np.asarray(
        Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC),
        dtype=np.float64,
    )
    noise = np.asarray(
        Image.fromarray(noise.astype(np.uint8)).filter(ImageFilter.GaussianBlur(18)),
        dtype=np.float64,
    ) / 255.0
    ys = np.linspace(0, 1, h)[:, None]
    band = np.exp(-((ys - 0.45) ** 2) / 0.05)
    a = (noise * band * strength)[..., None]
    c = np.array(color, dtype=np.float64)[None, None, :]
    return 255.0 - (255.0 - arr) * (1.0 - c * a / 255.0 * 255.0 / 255.0)


def silhouette(arr, draw_fn, color=(6, 8, 16), blur=0.0):
    """Draw an opaque scene element (skyline, trees, hills) over the gradient."""
    h, w, _ = arr.shape
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(layer), w, h)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    m = np.asarray(layer, dtype=np.float64) / 255.0
    c = np.array(color, dtype=np.float64)[None, None, :]
    return arr * (1 - m[..., :3]) + c * m[..., :3]


def finish(arr, vignette=0.30, grain=3.0, seed=1):
    """Vignette + dithering grain. Grain matters: wide smooth gradients band
    badly after JPEG, and banding is very visible on a dark card."""
    h, w, _ = arr.shape
    ys = (np.linspace(-1, 1, h))[:, None]
    xs = (np.linspace(-1, 1, w))[None, :]
    r = np.sqrt(xs ** 2 + (ys * 0.85) ** 2) / math.sqrt(2)
    arr = arr * (1.0 - (vignette * r ** 2)[..., None])
    rng = np.random.default_rng(seed)
    arr = arr + rng.normal(0.0, grain, arr.shape)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def skyline(draw, w, h, base, blocks, seed, windows=True, win_color=(255, 214, 140)):
    """A city skyline: rectangles of varied height/width along the base line."""
    rng = np.random.default_rng(seed)
    x = -30
    while x < w + 30:
        bw = int(rng.integers(int(w * 0.035), int(w * 0.095)))
        bh = int(rng.integers(int(h * 0.18), int(h * (base / h) * 0.92)))
        top = base - bh
        draw.rectangle([x, top, x + bw, base], fill=(255, 255, 255, 255))
        # A few taller towers with a mast, so the skyline is not a flat comb.
        if rng.random() < 0.22:
            mw = max(2, int(bw * 0.06))
            draw.rectangle([x + bw / 2 - mw, top - int(h * 0.09), x + bw / 2 + mw, top],
                           fill=(255, 255, 255, 255))
        if windows:
            step = max(6, int(bw * 0.22))
            wy = top + step
            while wy < base - step // 2:
                wx = x + step // 2
                while wx < x + bw - step // 2:
                    if rng.random() < 0.42:
                        a = int(rng.integers(120, 255))
                        draw.rectangle([wx, wy, wx + max(2, step // 3), wy + max(2, step // 3)],
                                       fill=win_color + (a,))
                    wx += step
                wy += step
        x += bw + int(rng.integers(2, 10))


def pines(draw, w, h, base, count, seed, height=(0.35, 0.72), width=(0.018, 0.05)):
    """Conifer silhouettes receding into the frame."""
    rng = np.random.default_rng(seed)
    for _ in range(count):
        x = rng.uniform(-0.05, 1.05) * w
        th = rng.uniform(*height) * h
        tw = rng.uniform(*width) * w
        y = base + rng.integers(-int(h * 0.04), int(h * 0.06))
        # Stacked triangles read as a pine; a single one reads as a spike.
        steps = 4
        for i in range(steps):
            t = i / steps
            sw = tw * (1.0 - t * 0.72)
            sy = y - th * t
            draw.polygon([(x, sy - th / steps * 1.5),
                          (x - sw / 2, sy),
                          (x + sw / 2, sy)], fill=(255, 255, 255, 255))
        draw.rectangle([x - tw * 0.06, y - th * 0.1, x + tw * 0.06, y + th * 0.06],
                       fill=(255, 255, 255, 255))


# ── The ten scene themes ────────────────────────────────────────────────
def t_night_campus():
    """Deep indigo dusk, campus buildings with lit windows, a rising moon."""
    a = vertical_gradient([(0.0, (18, 22, 58)), (0.45, (34, 38, 84)),
                           (0.75, (58, 54, 104)), (1.0, (16, 16, 34))])
    a = add_radial_glow(a, 0.78, 0.30, 0.30, (120, 140, 220), 0.45)
    a = add_radial_glow(a, 0.78, 0.30, 0.075, (248, 246, 232), 1.0, falloff=1.2)
    a = starfield(a, 11, 190, 1.7, 0.9)

    def buildings(d, w, h):
        base = int(h * SAFE_BOTTOM + h * 0.06)
        rng = np.random.default_rng(4)
        # A hall with a clock tower, then lower wings either side.
        d.polygon([(int(w * 0.34), base), (int(w * 0.34), int(h * 0.42)),
                   (int(w * 0.40), int(h * 0.36)), (int(w * 0.46), int(h * 0.42)),
                   (int(w * 0.46), base)], fill=(255, 255, 255, 255))
        d.rectangle([int(w * 0.375), int(h * 0.18), int(w * 0.425), int(h * 0.38)],
                    fill=(255, 255, 255, 255))
        d.polygon([(int(w * 0.40), int(h * 0.09)), (int(w * 0.345), int(h * 0.19)),
                   (int(w * 0.455), int(h * 0.19))], fill=(255, 255, 255, 255))
        for x0, x1, top in ((0.05, 0.34, 0.52), (0.46, 0.72, 0.50), (0.72, 0.98, 0.55)):
            d.rectangle([int(w * x0), int(h * top), int(w * x1), base],
                        fill=(255, 255, 255, 255))
        # Windows, lit at random, brighter on the occupied-looking wings.
        for _ in range(190):
            x = rng.uniform(0.06, 0.92) * w
            y = rng.uniform(0.22, 0.80) * h
            ww, hh = max(3, int(w * 0.011)), max(4, int(h * 0.030))
            if y > base - hh:
                continue
            d.rectangle([x, y, x + ww, y + hh],
                        fill=(255, 222, 158, int(rng.integers(90, 255))))
        # Clock face on the tower.
        cx, cy, r = int(w * 0.40), int(h * 0.27), int(h * 0.045)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 240, 205, 235))

    a = silhouette(a, buildings, (10, 12, 30))
    a = add_radial_glow(a, 0.40, 0.62, 0.34, (70, 80, 150), 0.20)
    return finish(a, 0.34, 3.0, seed=101)


def t_deep_space():
    """Starfield with nebula clouds and a ringed planet."""
    a = vertical_gradient([(0.0, (6, 7, 22)), (0.5, (12, 14, 38)), (1.0, (5, 6, 18))])
    a = banded_nebula(a, 21, (120, 70, 190), 0.55, scale=7)
    a = banded_nebula(a, 22, (40, 120, 200), 0.40, scale=11)
    a = starfield(a, 23, 620, 2.2, 1.0)
    a = add_radial_glow(a, 0.24, 0.46, 0.16, (70, 90, 190), 0.55)

    def planet(d, w, h):
        cx, cy, r = w * 0.24, h * 0.46, h * 0.30
        # Atmospheric limb light, then the disc, then a terminator shadow.
        d.ellipse([cx - r * 1.20, cy - r * 1.20, cx + r * 1.20, cy + r * 1.20],
                  fill=(120, 150, 235, 46))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(58, 74, 140, 255))
        d.ellipse([cx - r * 0.98, cy - r * 0.98, cx + r * 0.30, cy + r * 0.99],
                  fill=(30, 40, 84, 255))
        d.arc([cx - r, cy - r, cx + r, cy + r], 205, 330,
              fill=(196, 214, 255, 220), width=max(2, int(h * 0.012)))
        # Ring: an ellipse so thin it must be drawn as an outline, not a fill.
        for scale, alpha in ((1.62, 120), (1.78, 70)):
            d.ellipse([cx - r * scale, cy - r * 0.30, cx + r * scale, cy + r * 0.30],
                      outline=(210, 222, 255, alpha), width=max(2, int(h * 0.010)))

    planet_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    planet(ImageDraw.Draw(planet_layer), W, H)
    m = np.asarray(planet_layer, dtype=np.float64) / 255.0
    a = a * (1 - m[..., :3]) + np.array([255, 255, 255], dtype=np.float64)[None, None, :] * m[..., :3]
    return finish(a, 0.26, 3.0, seed=102)


def t_mystic_forest():
    """Moonlit pines, layered mist and drifting fireflies."""
    a = vertical_gradient([(0.0, (10, 30, 30)), (0.4, (16, 52, 48)),
                           (0.72, (22, 66, 56)), (1.0, (8, 22, 22))])
    a = add_radial_glow(a, 0.62, 0.24, 0.34, (150, 220, 190), 0.40)
    a = add_radial_glow(a, 0.62, 0.24, 0.07, (226, 255, 240), 0.95, falloff=1.2)
    a = starfield(a, 31, 90, 1.4, 0.7)

    # Far (pale) then near (dark) treelines give real depth.
    far = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pines(ImageDraw.Draw(far), W, H, int(H * 0.86), 26, 32,
          height=(0.30, 0.50), width=(0.014, 0.032))
    fm = np.asarray(far, dtype=np.float64)[..., 3] / 255.0
    a = a * (1 - fm[..., None] * 0.55) + np.array([70, 120, 110], dtype=np.float64)[None, None, :] * fm[..., None] * 0.55

    near = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pines(ImageDraw.Draw(near), W, H, int(H * 1.02), 14, 33,
          height=(0.55, 0.95), width=(0.030, 0.062))
    nm = np.asarray(near, dtype=np.float64)[..., 3] / 255.0
    a = a * (1 - nm[..., None]) + np.array([8, 26, 24], dtype=np.float64)[None, None, :] * nm[..., None]

    # Mist bands between the layers, then fireflies on top.
    mist = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mist)
    for k, (yc, a0) in enumerate(((0.58, 40), (0.72, 62), (0.84, 44))):
        md.rectangle([0, int(H * yc), W, int(H * yc + H * 0.10)], fill=a0)
    mist = mist.filter(ImageFilter.GaussianBlur(26))
    mm = np.asarray(mist, dtype=np.float64)[..., None] / 255.0
    a = a * (1 - mm * 0.5) + np.array([150, 200, 190], dtype=np.float64)[None, None, :] * mm * 0.5

    flies = Image.new("L", (W, H), 0)
    fd = ImageDraw.Draw(flies)
    rng = np.random.default_rng(34)
    for _ in range(70):
        x, y = rng.uniform(0, W), rng.uniform(H * 0.35, H * 0.95)
        r = rng.uniform(1.0, 2.6)
        fd.ellipse([x - r, y - r, x + r, y + r], fill=int(rng.integers(150, 255)))
    glow = np.asarray(flies.filter(ImageFilter.GaussianBlur(7)), dtype=np.float64)[..., None] / 255.0
    core = np.asarray(flies, dtype=np.float64)[..., None] / 255.0
    a = a + np.array([150, 235, 170], dtype=np.float64)[None, None, :] * (glow * 0.55 + core * 0.85)
    return finish(a, 0.32, 3.0, seed=103)


def t_neon_city():
    """Magenta/cyan skyline, neon signage and wet-street reflections."""
    a = vertical_gradient([(0.0, (12, 8, 34)), (0.38, (36, 14, 62)),
                           (0.62, (72, 20, 74)), (1.0, (10, 8, 26))])
    a = add_radial_glow(a, 0.50, 0.62, 0.52, (190, 40, 150), 0.55)
    a = add_radial_glow(a, 0.16, 0.50, 0.30, (30, 150, 210), 0.45)
    a = add_radial_glow(a, 0.86, 0.52, 0.28, (200, 50, 130), 0.40)

    base = int(H * SAFE_BOTTOM + H * 0.04)
    a = silhouette(a, lambda d, w, h: skyline(d, w, h, base, 0, 41), (8, 6, 20))

    # Neon accents: vertical light bars and horizontal signage on the towers.
    neon = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    nd = ImageDraw.Draw(neon)
    rng = np.random.default_rng(42)
    palette = [(80, 230, 255), (255, 70, 190), (180, 90, 255), (90, 255, 210)]
    for _ in range(26):
        x = rng.uniform(0, W)
        y = rng.uniform(H * 0.30, base - H * 0.05)
        col = palette[int(rng.integers(0, len(palette)))]
        wdt = max(2, int(rng.uniform(0.002, 0.006) * W))
        ln = rng.uniform(H * 0.04, H * 0.20)
        nd.rectangle([x, y, x + wdt, y + ln], fill=col + (255,))
    for _ in range(12):
        x = rng.uniform(0, W * 0.9)
        y = rng.uniform(H * 0.36, base - H * 0.10)
        col = palette[int(rng.integers(0, len(palette)))]
        nd.rectangle([x, y, x + rng.uniform(W * 0.02, W * 0.07), y + max(2, int(H * 0.014))],
                     fill=col + (255,))
    halo = np.asarray(neon.filter(ImageFilter.GaussianBlur(14)), dtype=np.float64)[..., :3] / 255.0
    core = np.asarray(neon, dtype=np.float64)[..., :3] / 255.0
    a = 255.0 - (255.0 - a) * (1.0 - (halo * 0.95 + core * 0.9))

    # Reflections smeared downward into "wet" street.
    top = a.copy()
    refl = Image.fromarray(np.clip(top, 0, 255).astype(np.uint8)).transpose(Image.FLIP_TOP_BOTTOM)
    rh = int(H * 0.16)
    refl = refl.crop((0, 0, W, rh)).filter(ImageFilter.GaussianBlur(9))
    ra = np.asarray(refl, dtype=np.float64)
    band = a[int(base):int(base) + rh, :]
    m = int(base) + rh <= H
    if m:
        fade = np.linspace(0.42, 0.0, rh)[:, None, None]
        a[int(base):int(base) + rh, :] = np.clip(ra * fade + band * (1 - fade), 0, 255)
    return finish(a, 0.30, 3.0, seed=104)


def t_fantasy_castle():
    """Moonlit keep on a crag, with a dragon-lit sky."""
    a = vertical_gradient([(0.0, (22, 14, 46)), (0.42, (48, 26, 74)),
                           (0.70, (78, 42, 88)), (1.0, (14, 10, 28))])
    a = add_radial_glow(a, 0.30, 0.26, 0.40, (150, 100, 210), 0.40)
    a = add_radial_glow(a, 0.30, 0.26, 0.08, (250, 244, 255), 1.0, falloff=1.1)
    a = starfield(a, 51, 260, 1.8, 0.95)

    base = int(H * 0.92)

    def keep(d, w, h):
        cx = w * 0.66
        # Crag first, so the towers sit on it.
        d.polygon([(int(cx - w * 0.30), h), (int(cx - w * 0.20), int(h * 0.74)),
                   (int(cx - w * 0.04), int(h * 0.68)), (int(cx + w * 0.16), int(h * 0.76)),
                   (int(cx + w * 0.28), h)], fill=(255, 255, 255, 255))
        towers = [(-0.16, 0.44, 0.070), (0.0, 0.30, 0.085), (0.15, 0.50, 0.062),
                  (-0.09, 0.60, 0.050), (0.09, 0.64, 0.046)]
        for dx, top, tw in towers:
            x0, x1 = cx + w * dx - w * tw / 2, cx + w * dx + w * tw / 2
            y0 = h * top
            d.rectangle([x0, y0, x1, base], fill=(255, 255, 255, 255))
            # Crenellations, then a tall conical roof on the main keep.
            step = (x1 - x0) / 4
            for i in range(4):
                bx = x0 + i * step
                d.rectangle([bx, y0 - h * 0.022, bx + step * 0.55, y0],
                            fill=(255, 255, 255, 255))
            if tw > 0.07:
                d.polygon([(cx + w * dx, y0 - h * 0.16), (x0, y0), (x1, y0)],
                          fill=(255, 255, 255, 255))
                d.rectangle([cx + w * dx - 1, y0 - h * 0.21, cx + w * dx + 1, y0 - h * 0.15],
                            fill=(255, 255, 255, 255))
        # Lit windows and a warm doorway on the keep.
        for dx, top, tw in towers:
            wy = h * top + h * 0.06
            while wy < base - h * 0.08:
                d.rectangle([cx + w * dx - w * 0.006, wy,
                             cx + w * dx + w * 0.006, wy + h * 0.030],
                            fill=(255, 206, 122, 220))
                wy += h * 0.075
        d.rectangle([cx - w * 0.014, base - h * 0.10, cx + w * 0.014, base],
                    fill=(255, 186, 96, 235))

    a = silhouette(a, keep, (14, 10, 26))
    a = add_radial_glow(a, 0.66, 0.74, 0.16, (255, 170, 80), 0.42)
    return finish(a, 0.34, 3.0, seed=105)


def t_arcade():
    """Synthwave grid floor, sun and a blocky horizon."""
    a = vertical_gradient([(0.0, (26, 10, 54)), (0.42, (74, 22, 92)),
                           (0.58, (150, 48, 118)), (1.0, (18, 8, 40))])
    horizon = int(H * 0.56)
    sun_cy = horizon - H * 0.10
    # Banded sun: bright disc, then the classic horizontal cut-outs.
    a = add_radial_glow(a, 0.50, sun_cy / H, 0.26, (255, 130, 60), 0.85)
    a = add_radial_glow(a, 0.50, sun_cy / H, 0.17, (255, 214, 120), 1.0, falloff=1.0)
    sun = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(sun)
    sr = H * 0.20
    sd.ellipse([W * 0.5 - sr, sun_cy - sr, W * 0.5 + sr, sun_cy + sr], fill=255)
    for i, yf in enumerate((0.10, 0.22, 0.36, 0.52, 0.70)):
        y = sun_cy + sr * yf
        sd.rectangle([W * 0.5 - sr - 4, y, W * 0.5 + sr + 4, y + H * (0.012 + i * 0.010)],
                     fill=0)
    sun = sun.filter(ImageFilter.GaussianBlur(1.2))
    sm = np.asarray(sun, dtype=np.float64)[..., None] / 255.0
    a = 255.0 - (255.0 - a) * (1.0 - np.array([255, 236, 190], dtype=np.float64)[None, None, :] * sm)

    # Perspective floor: converging verticals + spacing horizontals.
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    cx = W * 0.5
    for i in range(-16, 17):
        x = cx + i * W * 0.11
        gd.line([(cx, horizon), (x, H)], fill=(120, 200, 255, 90), width=2)
    y = horizon
    k = 0
    while y < H:
        gd.line([(0, y), (W, y)], fill=(150, 220, 255, 70 + min(120, k * 26)), width=2)
        y = horizon + (H - horizon) * (0.055 * (1.32 ** k))
        k += 1
    gd.rectangle([0, horizon - 3, W, horizon + 3], fill=(255, 255, 255, 150))
    gm = np.asarray(grid, dtype=np.float64)[..., :3] / 255.0
    a = 255.0 - (255.0 - a) * (1.0 - gm)
    a = a * np.where((np.arange(H)[:, None, None] < horizon), 1.0, 0.72)
    return finish(a, 0.30, 3.5, seed=106)


def t_sunset():
    """Warm dusk over water, with a low sun and drifting cloud bands."""
    a = vertical_gradient([(0.0, (48, 44, 110)), (0.28, (140, 74, 130)),
                           (0.48, (236, 122, 92)), (0.62, (255, 186, 104)),
                           (0.66, (255, 214, 140)), (1.0, (58, 40, 66))])
    horizon = int(H * 0.66)
    a = add_radial_glow(a, 0.62, horizon / H - 0.02, 0.34, (255, 170, 90), 0.55)
    a = add_radial_glow(a, 0.62, horizon / H - 0.02, 0.13, (255, 246, 208), 1.0, falloff=1.1)

    clouds = Image.new("L", (W, H), 0)
    cd = ImageDraw.Draw(clouds)
    rng = np.random.default_rng(61)
    for _ in range(16):
        y = rng.uniform(H * 0.18, horizon - H * 0.04)
        x = rng.uniform(-0.1, 0.9) * W
        cw = rng.uniform(0.10, 0.34) * W
        ch = rng.uniform(0.012, 0.034) * H
        cd.ellipse([x, y, x + cw, y + ch], fill=int(rng.integers(70, 190)))
    clouds = clouds.filter(ImageFilter.GaussianBlur(11))
    cm = np.asarray(clouds, dtype=np.float64)[..., None] / 255.0
    a = 255.0 - (255.0 - a) * (1.0 - np.array([120, 70, 120], dtype=np.float64)[None, None, :] * cm * 0.75)

    # Water: darker, with a bright sun column and horizontal ripple streaks.
    water = a.copy()
    water[horizon:, :, :] *= 0.62
    sun_path = Image.new("L", (W, H), 0)
    pd = ImageDraw.Draw(sun_path)
    for k in range(26):
        t = k / 25
        y = horizon + (H - horizon) * t
        half = W * (0.020 + 0.075 * t)
        pd.rectangle([W * 0.62 - half, y, W * 0.62 + half, y + max(1, (H - horizon) * 0.030)],
                     fill=int(200 * (1 - t * 0.75)))
    sun_path = sun_path.filter(ImageFilter.GaussianBlur(7))
    sp = np.asarray(sun_path, dtype=np.float64)[..., None] / 255.0
    water = 255.0 - (255.0 - water) * (1.0 - np.array([255, 200, 120], dtype=np.float64)[None, None, :] * sp * 0.75)
    ripple = np.zeros((H, W, 3))
    ys = np.arange(horizon, H)[:, None]
    ripple[horizon:, :, :] = ((np.sin(ys * 0.9) > 0.72) * 26)[:, :, None]
    water = np.clip(water + ripple, 0, 255)
    a = water
    return finish(a, 0.30, 3.0, seed=107)


def t_sky():
    """Bright midday sky, soft cumulus and a warm sun high left."""
    a = vertical_gradient([(0.0, (58, 132, 214)), (0.42, (126, 190, 234)),
                           (0.72, (186, 224, 244)), (1.0, (222, 240, 250))])
    a = add_radial_glow(a, 0.22, 0.24, 0.46, (255, 250, 220), 0.55)
    a = add_radial_glow(a, 0.22, 0.24, 0.12, (255, 255, 244), 1.0, falloff=1.1)

    # Cumulus: overlapping ellipses, lit on top, shadowed underneath.
    clouds = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(clouds)
    rng = np.random.default_rng(71)
    for _ in range(9):
        cx, cy = rng.uniform(0, W), rng.uniform(H * 0.22, H * 0.70)
        scale = rng.uniform(0.6, 1.5)
        puffs = int(rng.integers(5, 9))
        blobs = []
        for i in range(puffs):
            ox = (i - puffs / 2) * W * 0.045 * scale + rng.uniform(-8, 8)
            oy = rng.uniform(-H * 0.030, H * 0.030) * scale
            r = H * rng.uniform(0.030, 0.060) * scale
            blobs.append((cx + ox, cy + oy, r))
        for bx, by, r in blobs:
            cd.ellipse([bx - r * 1.25, by - r * 0.72, bx + r * 1.25, by + r * 0.80],
                       fill=(150, 176, 206, 190))
        for bx, by, r in blobs:
            cd.ellipse([bx - r, by - r, bx + r, by + r * 0.9], fill=(255, 255, 255, 250))
    halo = clouds.filter(ImageFilter.GaussianBlur(16))
    clouds = Image.alpha_composite(halo, clouds)
    cm = np.asarray(clouds, dtype=np.float64)
    a = a * (1 - cm[..., 3:4]) + cm[..., :3] * cm[..., 3:4]

    # A soft green horizon so the card is not sky all the way down.
    ground = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(ground)
    gd.rectangle([0, int(H * 0.86), W, H], fill=120)
    gd.rectangle([0, int(H * 0.86), W, int(H * 0.86) + 8], fill=0)
    ground = ground.filter(ImageFilter.GaussianBlur(9))
    gm = np.asarray(ground, dtype=np.float64)[..., None] / 255.0
    a = a * (1 - gm * 0.8) + np.array([122, 168, 104], dtype=np.float64)[None, None, :] * gm * 0.8
    return finish(a, 0.24, 3.0, seed=108)


def t_midnight():
    """Near-black blue, an aurora ribbon and a dense, quiet starfield."""
    a = vertical_gradient([(0.0, (6, 10, 26)), (0.5, (10, 16, 38)), (1.0, (4, 6, 18))])
    a = starfield(a, 81, 520, 1.7, 1.0)

    # Aurora: two sine ribbons, additively screened, then vertically smeared.
    aur = Image.new("L", (W, H), 0)
    ad = ImageDraw.Draw(aur)
    for phase, amp, thick, top in ((0.0, 0.10, 0.055, 0.10), (2.1, 0.07, 0.040, 0.18)):
        pts = []
        for i in range(0, W + 8, 8):
            t = i / W
            y = H * (top + amp * math.sin(t * 3.4 + phase) + 0.035 * math.sin(t * 8.1 + phase))
            pts.append((i, y))
        for i in range(len(pts) - 1):
            ad.line([pts[i], pts[i + 1]], fill=150, width=int(H * thick))
    aur = aur.filter(ImageFilter.GaussianBlur(20))
    am = np.asarray(aur, dtype=np.float64)[..., None] / 255.0
    ys = np.linspace(0, 1, H)[:, None, None]
    tint = np.array([70, 220, 175], dtype=np.float64)[None, None, :] * 0.85 \
        + np.array([110, 120, 235], dtype=np.float64)[None, None, :] * 0.15
    a = 255.0 - (255.0 - a) * (1.0 - tint * am * 0.75 * (1.0 - ys * 0.55))
    return finish(a, 0.36, 3.0, seed=109)


def t_muragoods():
    """The brand palette: warm caramel, soft bokeh and a rounded emblem."""
    a = vertical_gradient([(0.0, (72, 44, 30)), (0.45, (122, 74, 44)),
                           (1.0, (58, 34, 26))])
    a = add_radial_glow(a, 0.30, 0.34, 0.44, (226, 160, 92), 0.50)
    a = add_radial_glow(a, 0.78, 0.62, 0.34, (196, 96, 72), 0.40)

    # Bokeh: large soft discs, varied size and warmth.
    bok = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bok)
    rng = np.random.default_rng(91)
    for _ in range(22):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(H * 0.03, H * 0.13)
        tint = (255, int(rng.integers(190, 232)), int(rng.integers(140, 190)), int(rng.integers(40, 96)))
        bd.ellipse([x - r, y - r, x + r, y + r], fill=tint)
    bok = bok.filter(ImageFilter.GaussianBlur(9))
    bm = np.asarray(bok, dtype=np.float64)
    a = 255.0 - (255.0 - a) * (1.0 - bm[..., :3] * bm[..., 3:4] / 255.0)

    # Rounded emblem, bottom-right, echoing the site's logo mark.
    emblem = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ed = ImageDraw.Draw(emblem)
    ex, ey, er = W * 0.855, H * 0.60, H * 0.20
    ed.ellipse([ex - er * 1.22, ey - er * 1.22, ex + er * 1.22, ey + er * 1.22],
               fill=(255, 236, 200, 34))
    ed.ellipse([ex - er, ey - er, ex + er, ey + er], fill=(255, 244, 220, 235))
    ed.ellipse([ex - er * 0.60, ey - er * 0.60, ex + er * 0.60, ey + er * 0.60],
               fill=(150, 92, 52, 255))
    emblem = emblem.filter(ImageFilter.GaussianBlur(0.7))
    em = np.asarray(emblem, dtype=np.float64)
    a = a * (1 - em[..., 3:4]) + em[..., :3] * em[..., 3:4]
    return finish(a, 0.30, 3.0, seed=110)


THEMES = {
    "night-campus": t_night_campus,
    "deep-space": t_deep_space,
    "mystic-forest": t_mystic_forest,
    "neon-city": t_neon_city,
    "fantasy-castle": t_fantasy_castle,
    "arcade": t_arcade,
    "sunset": t_sunset,
    "sky": t_sky,
    "midnight": t_midnight,
    "muragoods": t_muragoods,
}


def main():
    quiet = "--quiet" in sys.argv
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    BOT_DIR.mkdir(parents=True, exist_ok=True)
    for name, fn in THEMES.items():
        img = fn()
        for d in (SITE_DIR, BOT_DIR):
            img.save(d / f"{name}.jpg", format="JPEG", quality=86,
                     optimize=True, progressive=True)
        if not quiet:
            p = SITE_DIR / f"{name}.jpg"
            print(f"  {name:<16} {W}x{H}  {p.stat().st_size // 1024}KB")
    if not quiet:
        print(f"generated {len(THEMES)} themes into {SITE_DIR} and {BOT_DIR}")


if __name__ == "__main__":
    main()
