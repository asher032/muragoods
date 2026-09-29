// ─── Server card backgrounds (Leveling → Server Card) ───────────────────
// Built-in theme IDs only — the SAME ids Murabot's leveling_sys.py renders.
// No URLs anywhere: the dashboard stores the id, the bot generates the card
// from its internal palette. Old URL values resolve to the default.

export interface ServerCardBackground {
  id: string;
  name: string;
  emoji: string;
  /** CSS gradient stops (top → bottom), matched to the bot's RGB palettes. */
  css: [string, string, string];
}

export const SERVER_CARD_DEFAULT = 'night-campus';

export const SERVER_CARD_BACKGROUNDS: ServerCardBackground[] = [
  { id: 'night-campus', name: 'Night Campus', emoji: '🌙', css: ['#0a0a24', '#141436', '#2a2a5e'] },
  { id: 'deep-space', name: 'Deep Space', emoji: '🌌', css: ['#02020c', '#080828', '#101048'] },
  { id: 'mystic-forest', name: 'Mystic Forest', emoji: '🌲', css: ['#04140e', '#0a2a1c', '#164e30'] },
  { id: 'neon-city', name: 'Neon City', emoji: '🏙️', css: ['#0d0318', '#200a38', '#4a145c'] },
  { id: 'fantasy-castle', name: 'Fantasy Castle', emoji: '🏰', css: ['#0a0618', '#181032', '#34246e'] },
  { id: 'arcade', name: 'Arcade', emoji: '🎮', css: ['#12041f', '#241040', '#4a1a60'] },
  { id: 'sunset', name: 'Sunset', emoji: '🌅', css: ['#1c0b26', '#6e283c', '#d66e32'] },
  { id: 'sky', name: 'Sky', emoji: '☁️', css: ['#12395e', '#2c6ea2', '#6eafd2'] },
  { id: 'midnight', name: 'Midnight', emoji: '🌑', css: ['#020207', '#060614', '#0e0e24'] },
  { id: 'muragoods', name: 'Muragoods', emoji: '✨', css: ['#0d0d28', '#28185a', '#781e3c'] },
];

const BY_ID = new Map(SERVER_CARD_BACKGROUNDS.map((b) => [b.id, b]));

/** Canonical theme id, or the default. Legacy URL values resolve to default. */
export function resolveServerCardBackground(value: unknown): string {
  if (typeof value === 'string' && BY_ID.has(value)) return value;
  return SERVER_CARD_DEFAULT;
}

export function serverCardBackgroundMeta(id: unknown): ServerCardBackground {
  return BY_ID.get(resolveServerCardBackground(id)) ?? SERVER_CARD_BACKGROUNDS[0];
}

/** Deterministic star positions for previews (seeded by theme id). */
export function previewStars(id: string, count = 22): Array<{ left: string; top: string; size: number; opacity: number }> {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (Math.imul(seed ^ (seed >>> 15), 1 | seed) + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 7), 61 | seed) ^ seed;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => ({
    left: `${(rand() * 100).toFixed(1)}%`,
    top: `${(rand() * 72).toFixed(1)}%`,
    size: rand() < 0.8 ? 2 : 3,
    opacity: 0.35 + rand() * 0.5,
  }));
}
