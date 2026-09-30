// ── Economy configuration schema ────────────────────────────────────────
//
// ONE declaration of every economy setting: its key, label, type, bounds,
// default and whether it is owner-only. The server validates against it, the
// UI renders from it, and a CI test asserts it covers every key the bot
// understands (`economy.ECONOMY_DEFAULTS`).
//
// This exists because of a concrete bug. The save route carried a hand-written
// object literal listing the fields it would persist, and nine of the twenty-one
// fields the form actually showed were silently missing from it — including the
// Economy Log Channel. Users picked a channel, hit Save, got a success message,
// and the value was discarded. A schema cannot drop a field the same way twice:
// anything not declared here is a test failure, not a silent no-op.
//
// Numbers mirror `discord-bot/bot/economy.py::ECONOMY_DEFAULTS` for defaults,
// and the bot remains the runtime authority — this file governs what the
// DASHBOARD may write and how it reports a bad value.

export type EconomyFieldKind = 'text' | 'int' | 'number' | 'channel' | 'toggle' | 'list';

export interface EconomyField {
  key: string;
  label: string;
  kind: EconomyFieldKind;
  /** Inclusive bounds for numeric fields. */
  min?: number;
  max?: number;
  default: string | number | boolean | string[] | Record<string, never>;
  /** Owner-only values may not be written by a server admin. */
  ownerOnly: boolean;
  /** Rendered under the control to explain the field. */
  help?: string;
  /** Permissions the bot needs for this field to actually work. */
  requires?: Array<'view' | 'send' | 'embed'>;
  /** Allow an empty string (clearing the setting). */
  allowEmpty?: boolean;
}

export const ECONOMY_FIELDS: readonly EconomyField[] = [
  // ── Currency ────────────────────────────────────────────────────────
  { key: 'currencyName', label: 'Currency Name', kind: 'text', default: 'coins', ownerOnly: true, allowEmpty: false },
  { key: 'currencySymbol', label: 'Currency Symbol', kind: 'text', default: '🪙', ownerOnly: true, allowEmpty: false },
  { key: 'startBalance', label: 'Starting Balance', kind: 'int', min: 0, max: 100_000, default: 100, ownerOnly: true },

  // ── Timed rewards ───────────────────────────────────────────────────
  { key: 'dailyAmount', label: 'Daily Reward', kind: 'int', min: 0, max: 100_000, default: 250, ownerOnly: true },
  { key: 'weeklyAmount', label: 'Weekly Reward', kind: 'int', min: 0, max: 500_000, default: 1500, ownerOnly: true },
  { key: 'monthlyAmount', label: 'Monthly Reward', kind: 'int', min: 0, max: 2_000_000, default: 6000, ownerOnly: true },

  // ── Work & activity payouts ─────────────────────────────────────────
  { key: 'workMin', label: 'Work Reward Min', kind: 'int', min: 0, max: 100_000, default: 50, ownerOnly: true },
  { key: 'workMax', label: 'Work Reward Max', kind: 'int', min: 0, max: 100_000, default: 300, ownerOnly: true },
  { key: 'begMin', label: 'Beg Reward Min', kind: 'int', min: 0, max: 100_000, default: 5, ownerOnly: true },
  { key: 'begMax', label: 'Beg Reward Max', kind: 'int', min: 0, max: 100_000, default: 100, ownerOnly: true },
  { key: 'gambleMax', label: 'Max Bet', kind: 'int', min: 10, max: 1_000_000, default: 10_000, ownerOnly: true },

  // ── Cooldowns (seconds) ─────────────────────────────────────────────
  { key: 'gambleCooldownSec', label: 'Gamble Cooldown (sec)', kind: 'int', min: 0, max: 86_400, default: 60, ownerOnly: true },
  { key: 'workCooldownSec', label: 'Work Cooldown (sec)', kind: 'int', min: 60, max: 86_400, default: 3600, ownerOnly: true },
  { key: 'begCooldownSec', label: 'Beg Cooldown (sec)', kind: 'int', min: 30, max: 86_400, default: 300, ownerOnly: true },
  { key: 'crimeCooldownSec', label: 'Crime Cooldown (sec)', kind: 'int', min: 60, max: 86_400, default: 1800, ownerOnly: true },
  { key: 'activityCooldownSec', label: 'Activity Cooldown (sec)', kind: 'int', min: 30, max: 86_400, default: 600, ownerOnly: true },
  { key: 'robCooldownSec', label: 'Rob Cooldown (sec)', kind: 'int', min: 60, max: 86_400, default: 3600, ownerOnly: true },
  { key: 'robMinTarget', label: 'Rob Min Target Balance', kind: 'int', min: 0, max: 1_000_000, default: 100, ownerOnly: true },

  // ── Lottery ─────────────────────────────────────────────────────────
  { key: 'lotteryTicketPrice', label: 'Lottery Ticket Price', kind: 'int', min: 1, max: 100_000, default: 100, ownerOnly: true },
  { key: 'lotteryMaxTickets', label: 'Lottery Max Tickets', kind: 'int', min: 1, max: 1_000, default: 10, ownerOnly: true },

  // ── Jobs ────────────────────────────────────────────────────────────
  { key: 'jobCooldownSec', label: 'Job Cooldown (sec)', kind: 'int', min: 60, max: 86_400, default: 3600, ownerOnly: true },
  {
    key: 'jobFailRate', label: 'Job Failure Rate', kind: 'number', min: 0.05, max: 0.9, default: 0.3,
    ownerOnly: true, help: 'A fraction between 0.05 and 0.9 — not a percentage.',
  },
  { key: 'bankCapacity', label: 'Base Bank Capacity', kind: 'int', min: 0, max: 100_000_000, default: 10_000, ownerOnly: true },

  // ── Operational (admin-editable) ────────────────────────────────────
  {
    key: 'logChannelId', label: 'Economy Log Channel', kind: 'channel', default: '', ownerOnly: false,
    // An economy log is an embed posted to a text channel, so all three apply.
    requires: ['view', 'send', 'embed'],
    allowEmpty: true,
    help: 'Where Murabot posts the economy audit log. The channel is verified against this server before it is saved.',
  },
  { key: 'disabledItems', label: 'Disabled Items', kind: 'list', default: [], ownerOnly: true, allowEmpty: true },
  { key: 'disabledJobs', label: 'Disabled Jobs', kind: 'list', default: [], ownerOnly: true, allowEmpty: true },
  { key: 'jobCooldownOverrides', label: 'Per-job Cooldown Overrides', kind: 'list', default: {}, ownerOnly: true, allowEmpty: true },
  { key: 'multipliers', label: 'Reward Multipliers', kind: 'list', default: {}, ownerOnly: true, allowEmpty: true },
];

export const ECONOMY_FIELD_BY_KEY: ReadonlyMap<string, EconomyField> = new Map(
  ECONOMY_FIELDS.map((f) => [f.key, f]),
);

/** Keys only the bot owner may change. Derived from the schema, not a copy. */
export const OWNER_ONLY_ECONOMY_KEYS: ReadonlySet<string> = new Set(
  ECONOMY_FIELDS.filter((f) => f.ownerOnly).map((f) => f.key),
);

/** Every declared key. Anything the form sends that is not here is rejected. */
export const ECONOMY_KEYS: ReadonlySet<string> = new Set(ECONOMY_FIELDS.map((f) => f.key));

// ── Cross-field rules ───────────────────────────────────────────────────
// A single field can be perfectly valid on its own and still make the economy
// incoherent. "Work Reward Min 500 / Work Reward Max 100" parses as two
// integers; it is nonsense, and the only place to catch it is before the write.

export interface CrossFieldRule {
  id: string;
  /** The field the error is reported against. */
  field: string;
  /**
   * The numeric fields this rule reads. Declared explicitly on purpose: the
   * first version inferred them by scraping identifiers out of `message`, which
   * silently matched nothing and meant the rule could never fire.
   */
  keys: readonly string[];
  message: string;
  /** Advisory rules report a warning instead of blocking the save. */
  advisory?: boolean;
  check: (values: Record<string, number>) => boolean;
}

export const ECONOMY_CROSS_RULES: readonly CrossFieldRule[] = [
  {
    id: 'work-range',
    field: 'workMin',
    keys: ['workMin', 'workMax'],
    message: 'Work Reward Min must be less than or equal to Work Reward Max.',
    check: (v) => v.workMin <= v.workMax,
  },
  {
    id: 'beg-range',
    field: 'begMin',
    keys: ['begMin', 'begMax'],
    message: 'Beg Reward Min must be less than or equal to Beg Reward Max.',
    check: (v) => v.begMin <= v.begMax,
  },
  {
    id: 'weekly-vs-daily',
    field: 'weeklyAmount',
    keys: ['weeklyAmount', 'dailyAmount'],
    message: 'Weekly Reward should be greater than Daily Reward, otherwise the weekly claim is a downgrade.',
    // Not fatal: an intentional "weekly is smaller" configuration is legal, so
    // this is advisory and never blocks a save.
    advisory: true,
    check: (v) => v.weeklyAmount >= v.dailyAmount,
  },
];

// ── Error codes ─────────────────────────────────────────────────────────
// Every distinct failure gets its own code. The generic "validation failed"
// string is what made this screen unusable: a deleted channel, a missing
// permission and a typo in a number all looked identical.

export const ECONOMY_ERROR_CODES = {
  /** Channel id no longer resolves on this server. */
  CHANNEL_NOT_FOUND: 'CHANNEL_NOT_FOUND',
  /** Channel exists but the bot cannot read it. */
  CHANNEL_ACCESS_DENIED: 'CHANNEL_ACCESS_DENIED',
  /** Channel exists and is readable, but the bot lacks a required permission. */
  MISSING_BOT_PERMISSION: 'MISSING_BOT_PERMISSION',
  /** Bot is not a member of this guild. */
  BOT_NOT_IN_GUILD: 'BOT_NOT_IN_GUILD',
  /** Channel cannot receive messages at all (voice channel, category...). */
  CHANNEL_NOT_TEXT_CAPABLE: 'CHANNEL_NOT_TEXT_CAPABLE',
  /** Value is not a number, or is not an integer where one is required. */
  INVALID_NUMBER: 'INVALID_NUMBER',
  /** Number is outside its declared bounds. */
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  /** Two fields together are incoherent. */
  CROSS_FIELD_INVALID: 'CROSS_FIELD_INVALID',
  /** Text field empty or too long. */
  INVALID_TEXT: 'INVALID_TEXT',
  /** Only the bot owner may write this. */
  OWNER_ONLY: 'OWNER_ONLY',
  /** Discord throttled us. Retryable — never reported as an invalid setting. */
  DISCORD_RATE_LIMITED: 'DISCORD_RATE_LIMITED',
  /** Discord could not be reached / answered 5xx. Retryable. */
  DISCORD_UNAVAILABLE: 'DISCORD_UNAVAILABLE',
  /** The database write failed. The previous config is untouched. */
  DATABASE_ERROR: 'DATABASE_ERROR',
  /** Not a guild admin. */
  INSUFFICIENT_GUILD_PERMISSION: 'INSUFFICIENT_GUILD_PERMISSION',
} as const;

export type EconomyErrorCode = (typeof ECONOMY_ERROR_CODES)[keyof typeof ECONOMY_ERROR_CODES];

/** One structured, per-field error. The UI renders these under their control. */
export interface EconomyFieldError {
  field: string;
  label: string;
  code: EconomyErrorCode;
  message: string;
  /** The value that was rejected, for display. Never a secret. */
  current?: string;
  /** The accepted range or requirement, when there is one. */
  expected?: string;
  /** Permission name when code is MISSING_BOT_PERMISSION. */
  missingPermission?: string;
  /** True when retrying unchanged could plausibly succeed. */
  retryable?: boolean;
}
