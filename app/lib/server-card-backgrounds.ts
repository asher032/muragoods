// ─── Server card backgrounds (Leveling → Level Background) ──────────────
//
// The theme list now lives in `app/lib/level-card-themes.ts`, which is the
// single canonical definition shared with Murabot's renderer. This module is
// kept as the historical import path so existing callers keep working, and so
// the old symbol names remain available.
//
// There is exactly ONE list of theme ids in this codebase. `scripts/
// check-level-card-parity.mjs` asserts the site's list and the bot's
// `SERVER_CARD_BACKGROUNDS` agree, and asserts every referenced asset exists
// on both sides — which is what stops the dashboard preview and the real
// Discord card from silently disagreeing.

export {
  LEVEL_CARD_THEMES as SERVER_CARD_BACKGROUNDS,
  LEVEL_CARD_DEFAULT_THEME as SERVER_CARD_DEFAULT,
  resolveLevelCardTheme as resolveServerCardBackground,
  levelCardThemeMeta as serverCardBackgroundMeta,
  type LevelCardTheme as ServerCardBackground,
} from './level-card-themes';
