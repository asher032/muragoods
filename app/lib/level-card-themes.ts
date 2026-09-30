// ─── Level card background themes — the ONE canonical list ──────────────
//
// The dashboard selector and Murabot's renderer must agree on which theme ids
// exist and what they are called. They used to be two hand-maintained lists
// with nothing tying them together: the site could offer "Pixel Sunset" while
// the bot's dict had drifted to a different set, and the symptom was a card
// that silently rendered the default while the dashboard preview showed
// something else. `scripts/check-level-card-parity.mjs` now fails the build if
// the two ever diverge.
//
// A theme stores an ID, never a URL. The bot loads its own local copy of the
// asset (Render deploys only discord-bot/, so the site's copy is unreachable at
// runtime), and this file is the shared vocabulary both sides speak.
//
// Keep this list and `discord-bot/bot/leveling_sys.py::SERVER_CARD_BACKGROUNDS`
// in step by editing this file first — the parity check names the offender.

export interface LevelCardTheme {
  id: string;
  name: string;
  emoji: string;
  /**
   * Site-served path under /public, used for the picker thumbnail and the
   * preview. The file name is the contract with the bot's asset mirror.
   */
  file: string;
}

export const LEVEL_CARD_DEFAULT_THEME = 'duck-toast';

export const LEVEL_CARD_THEMES: LevelCardTheme[] = [
  { id: 'duck-toast', name: 'Duck & Toast', emoji: '🍞', file: '/images/level-backgrounds/duck-toast.jpg' },
  { id: 'frog-meadow', name: 'Meadow Friend', emoji: '🌱', file: '/images/level-backgrounds/frog-meadow.jpg' },
  { id: 'frog-pond', name: 'Lily Pond', emoji: '🪷', file: '/images/level-backgrounds/frog-pond.jpg' },
  { id: 'goldfish-glass', name: 'Goldfish Glow', emoji: '🐠', file: '/images/level-backgrounds/goldfish-glass.jpg' },
  { id: 'starry-duck', name: 'Starry Companion', emoji: '🌌', file: '/images/level-backgrounds/starry-duck.jpg' },
  { id: 'chick-lily', name: 'Lily Rest', emoji: '🐤', file: '/images/level-backgrounds/chick-lily.jpg' },
  { id: 'frog-sky', name: 'Sky Gaze', emoji: '🐸', file: '/images/level-backgrounds/frog-sky.jpg' },
  { id: 'pixel-sunset', name: 'Pixel Sunset', emoji: '🌅', file: '/images/level-backgrounds/pixel-sunset.jpg' },
];

const BY_ID = new Map(LEVEL_CARD_THEMES.map((t) => [t.id, t]));

/**
 * Canonical theme id, or the default.
 *
 * Legacy theme ids and old URL values resolve to the default rather than
 * failing: a card with the wrong backdrop is better than no card, and the
 * dashboard shows the resolved value so the operator can repair it.
 */
export function resolveLevelCardTheme(value: unknown): string {
  if (typeof value === 'string' && BY_ID.has(value)) return value;
  return LEVEL_CARD_DEFAULT_THEME;
}

export function levelCardThemeMeta(id: unknown): LevelCardTheme {
  return BY_ID.get(resolveLevelCardTheme(id)) ?? LEVEL_CARD_THEMES[0];
}
