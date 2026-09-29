// ─── Server card backgrounds (Leveling → Level Background) ──────────────
// Imported picture assets ONLY — the SAME ids Murabot's leveling_sys.py
// renders from its local asset mirror. No URLs anywhere: the dashboard
// stores the id, the bot loads its copy of the file. Legacy theme ids and
// old URL values resolve to the default.

export interface ServerCardBackground {
  id: string;
  name: string;
  emoji: string;
  /** Site-served path under /public. The bot mirrors these files locally. */
  file: string;
}

export const SERVER_CARD_DEFAULT = 'duck-toast';

export const SERVER_CARD_BACKGROUNDS: ServerCardBackground[] = [
  { id: 'duck-toast', name: 'Duck & Toast', emoji: '🍞', file: '/images/level-backgrounds/duck-toast.jpg' },
  { id: 'frog-meadow', name: 'Meadow Friend', emoji: '🌱', file: '/images/level-backgrounds/frog-meadow.jpg' },
  { id: 'frog-pond', name: 'Lily Pond', emoji: '🪷', file: '/images/level-backgrounds/frog-pond.jpg' },
  { id: 'goldfish-glass', name: 'Goldfish Glow', emoji: '🐠', file: '/images/level-backgrounds/goldfish-glass.jpg' },
  { id: 'starry-duck', name: 'Starry Companion', emoji: '🌌', file: '/images/level-backgrounds/starry-duck.jpg' },
  { id: 'chick-lily', name: 'Lily Rest', emoji: '🐤', file: '/images/level-backgrounds/chick-lily.jpg' },
  { id: 'frog-sky', name: 'Sky Gaze', emoji: '🐸', file: '/images/level-backgrounds/frog-sky.jpg' },
  { id: 'pixel-sunset', name: 'Pixel Sunset', emoji: '🌅', file: '/images/level-backgrounds/pixel-sunset.jpg' },
];

const BY_ID = new Map(SERVER_CARD_BACKGROUNDS.map((b) => [b.id, b]));

/** Canonical asset id, or the default. Legacy theme ids/URLs resolve to default. */
export function resolveServerCardBackground(value: unknown): string {
  if (typeof value === 'string' && BY_ID.has(value)) return value;
  return SERVER_CARD_DEFAULT;
}

export function serverCardBackgroundMeta(id: unknown): ServerCardBackground {
  return BY_ID.get(resolveServerCardBackground(id)) ?? SERVER_CARD_BACKGROUNDS[0];
}
