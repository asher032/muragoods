'use client';

/**
 * PixelArt — Pure CSS pixel art illustrations for empty states.
 * Uses the box-shadow technique: a single 1px element casts multiple
 * colored box-shadows to form pixel art, then scales up via transform.
 */

interface PixelArtProps {
  variant: 'empty-chest' | 'confused-mario' | 'question-block';
  size?: number; // scale multiplier (default 3)
}

// Helper to convert [x, y, color] array into a box-shadow string
function buildShadow(pixels: [number, number, string][], unit: number): string {
  return pixels
    .map(([x, y, color]) => `${x * unit}px ${y * unit}px 0 ${color}`)
    .join(', ');
}

// ─── Color Palette ──────────────────────────────────────────
const C = {
  // Chest
  wood: '#8B5E3C',
  woodDark: '#6B4226',
  woodLight: '#A67B5B',
  gold: '#D4AF37',
  goldBright: '#F2C94C',
  goldDark: '#B8960F',
  metal: '#888888',
  metalDark: '#666666',
  // Mario
  skin: '#F4C7A0',
  skinDark: '#D4A574',
  red: '#E52521',
  redDark: '#B81B18',
  blue: '#2563EB',
  blueDark: '#1D4ED8',
  brown: '#5C3A1E',
  white: '#F2F0E4',
  black: '#0A0A0A',
  // Question Block
  qGold: '#D4AF37',
  qGoldBright: '#F2C94C',
  qGoldDark: '#B8960F',
  qBrown: '#5C3A1E',
  // Coin
  coinGold: '#F2C94C',
  coinDark: '#D4AF37',
  coinShine: '#FFF8DC',
};

// ─── Empty Treasure Chest (16x14) ──────────────────────────
const chestPixels: [number, number, string][] = (() => {
  const p: [number, number, string][] = [];
  const W = C.wood, D = C.woodDark, L = C.woodLight;
  const G = C.gold, GB = C.goldBright, GD = C.goldDark;
  const M = C.metal, MD = C.metalDark;

  // Lid (open, tilted back)
  for (let x = 2; x <= 13; x++) p.push([x, 0, D]); // lid top edge
  for (let x = 3; x <= 12; x++) p.push([x, 1, W]);
  for (let x = 3; x <= 12; x++) p.push([x, 2, L]);
  // Lid inner
  for (let x = 4; x <= 11; x++) p.push([x, 3, W]);

  // Metal clasp
  p.push([7, 1, M]);
  p.push([8, 1, M]);
  p.push([7, 2, MD]);
  p.push([8, 2, MD]);

  // Box body
  for (let x = 1; x <= 14; x++) p.push([x, 4, D]);
  for (let x = 1; x <= 14; x++) p.push([x, 5, M]);
  for (let x = 1; x <= 14; x++) p.push([x, 6, W]);
  for (let x = 1; x <= 14; x++) p.push([x, 7, L]);
  for (let x = 1; x <= 14; x++) p.push([x, 8, W]);
  for (let x = 1; x <= 14; x++) p.push([x, 9, L]);
  for (let x = 1; x <= 14; x++) p.push([x, 10, W]);
  for (let x = 0; x <= 15; x++) p.push([x, 11, D]);
  for (let x = 0; x <= 15; x++) p.push([x, 12, MD]);

  // Front clasp
  p.push([7, 5, M]);
  p.push([8, 5, M]);
  p.push([7, 6, GD]);
  p.push([8, 6, GD]);

  // Gold coins inside (visible because lid is open)
  p.push([5, 3, GB]);
  p.push([6, 3, G]);
  p.push([7, 3, GB]);
  p.push([9, 3, G]);
  p.push([10, 3, GB]);
  p.push([4, 4, G]);
  p.push([5, 4, GD]);
  p.push([6, 4, GB]);
  p.push([8, 4, GB]);
  p.push([9, 4, GD]);
  p.push([10, 4, G]);
  p.push([11, 4, GB]);

  // Scattered coins outside
  p.push([0, 10, GB]);
  p.push([1, 10, G]);
  p.push([14, 10, G]);
  p.push([15, 10, GB]);

  // Sparkle dots
  p.push([3, 2, C.white]);
  p.push([12, 2, C.white]);

  return p;
})();

// ─── Confused Mario Face (14x14) ───────────────────────────
const confusedMarioPixels: [number, number, string][] = (() => {
  const p: [number, number, string][] = [];
  const R = C.red, RD = C.redDark, S = C.skin, SD = C.skinDark;
  const B = C.brown, BL = C.blue, BK = C.black, W = C.white;

  // Hat
  for (let x = 3; x <= 10; x++) p.push([x, 0, R]);
  for (let x = 2; x <= 11; x++) p.push([x, 1, R]);
  for (let x = 2; x <= 11; x++) p.push([x, 2, RD]);
  // Hat brim
  for (let x = 1; x <= 9; x++) p.push([x, 3, R]);

  // Face
  for (let x = 2; x <= 11; x++) p.push([x, 4, S]);
  for (let x = 2; x <= 11; x++) p.push([x, 5, S]);
  for (let x = 2; x <= 11; x++) p.push([x, 6, S]);

  // Eyes (looking up/questioning — different sizes for confused look)
  p.push([4, 5, W]);
  p.push([5, 5, W]);
  p.push([4, 5, BK]); // left pupil looking up
  p.push([9, 5, W]);
  p.push([9, 5, BK]); // right pupil

  // Eyebrows (one raised for confusion)
  p.push([3, 4, B]);
  p.push([4, 4, B]);
  // Right eyebrow raised
  p.push([9, 3, B]);
  p.push([10, 3, B]);

  // Nose
  p.push([6, 6, SD]);
  p.push([7, 6, SD]);
  p.push([6, 7, SD]);

  // Mouth (slightly open, confused)
  p.push([4, 8, B]);
  p.push([5, 8, SD]);
  p.push([6, 8, SD]);
  p.push([7, 8, SD]);
  p.push([8, 8, B]);

  // Mustache
  for (let x = 3; x <= 9; x++) p.push([x, 7, B]);

  // Face sides
  p.push([2, 7, S]);
  p.push([11, 7, S]);
  p.push([2, 8, S]);
  p.push([11, 8, S]);

  // Question mark above head
  p.push([12, 0, C.goldBright]);
  p.push([13, 0, C.goldBright]);
  p.push([13, 1, C.goldBright]);
  p.push([12, 2, C.goldBright]);
  p.push([11, 3, C.goldBright]);
  p.push([11, 4, C.goldBright]);
  p.push([12, 5, C.goldBright]);

  return p;
})();

// ─── Floating Question Block (12x12) ───────────────────────
const questionBlockPixels: [number, number, string][] = (() => {
  const p: [number, number, string][] = [];
  const G = C.qGold, GB = C.qGoldBright, GD = C.qGoldDark, BR = C.qBrown;

  // Border
  for (let x = 1; x <= 10; x++) { p.push([x, 0, GD]); p.push([x, 11, BR]); }
  for (let y = 1; y <= 10; y++) { p.push([0, y, GD]); p.push([11, y, BR]); }
  // Fill
  for (let x = 1; x <= 10; x++) for (let y = 1; y <= 10; y++) p.push([x, y, G]);
  // Highlight
  for (let x = 1; x <= 10; x++) p.push([x, 1, GB]);
  for (let y = 1; y <= 10; y++) p.push([1, y, GB]);

  // Question Mark
  const qMark: [number, number][] = [
    [3, 2], [4, 2], [5, 2],
    [6, 3], [7, 3],
    [7, 4],
    [6, 5], [5, 5],
    [4, 6],
    [4, 7],
    [4, 9], // dot
  ];
  qMark.forEach(([x, y]) => p.push([x, y, BR]));

  // Corner rivets
  p.push([2, 2, GD]);
  p.push([9, 2, GD]);
  p.push([2, 9, GD]);
  p.push([9, 9, GD]);

  // Sparkles
  p.push([0, 0, GB]);
  p.push([11, 0, GB]);
  p.push([0, 11, GB]);
  p.push([11, 11, GB]);

  return p;
})();

const artData = {
  'empty-chest': { pixels: chestPixels, width: 16, height: 13, label: 'Your treasure chest is empty!' },
  'confused-mario': { pixels: confusedMarioPixels, width: 14, height: 10, label: 'Mario can\'t find this order!' },
  'question-block': { pixels: questionBlockPixels, width: 12, height: 12, label: 'Nothing here yet...' },
};

export function PixelArt({ variant, size = 3 }: PixelArtProps) {
  const art = artData[variant];
  const unit = size; // each pixel = `size` px

  const boxShadow = buildShadow(art.pixels, unit);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Pixel art canvas */}
      <div
        className="relative coin-float"
        style={{
          width: `${art.width * unit}px`,
          height: `${art.height * unit}px`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${unit}px`,
            height: `${unit}px`,
            background: 'transparent',
            boxShadow,
          }}
        />
      </div>
    </div>
  );
}
