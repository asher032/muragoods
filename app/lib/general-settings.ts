import { ECONOMY_ERROR_CODES as ECON } from './economy-schema';

// ── General server settings schema ──────────────────────────────────────
//
// ONE declaration of Murabot's server-wide settings: the command prefix, the
// language Murabot speaks, and the welcome/leave notices. The server validates
// against it, the dashboard renders from it, and
// `discord-bot/scripts/test_general_settings.py` asserts the language list here
// is exactly the one `discord-bot/bot/i18n.py` can speak — so the dashboard can
// never offer a language Murabot would ignore.
//
// The command prefix is deliberately NOT validated here: it already has one
// canonical validator and one writer (`validatePrefix`/`saveGuildPrefix` in
// murabot-config.ts), and a second copy of either is how the field drifted into
// four places the first time.

export interface LanguageOption {
  code: string;
  label: string;
}

/**
 * The languages Murabot can actually speak — mirrors
 * `discord-bot/bot/i18n.py::LANGUAGES`. Adding one here without adding it there
 * fails the cross-boundary test rather than producing a setting that does
 * nothing.
 */
export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
];

export const DEFAULT_LANGUAGE = 'en';

/** Longest welcome/leave message Murabot will store, in characters. */
export const MESSAGE_MAX_LENGTH = 600;

/**
 * Placeholders a message template may use. Anything else `{like_this}` is
 * rejected at save time and left untouched by Murabot at render time — a server
 * never has its own text silently blanked.
 */
export const MESSAGE_PLACEHOLDERS: readonly { token: string; describe: string }[] = [
  { token: '{user}', describe: 'mentions the member' },
  { token: '{username}', describe: 'their display name' },
  { token: '{server}', describe: 'the server name' },
  { token: '{member_count}', describe: 'how many members the server has' },
];

/** The stored fields this schema owns, in one place. */
export interface GeneralSettings {
  prefix: string;
  language: string;
  welcomeChannelId: string;
  welcomeMessage: string;
  leaveChannelId: string;
  leaveMessage: string;
}

export const GENERAL_SETTINGS_FIELDS = [
  'language',
  'welcomeChannelId',
  'welcomeMessage',
  'leaveChannelId',
  'leaveMessage',
] as const;

export const GENERAL_FIELD_LABELS: Record<keyof GeneralSettings, string> = {
  prefix: 'Command prefix',
  language: 'Language',
  welcomeChannelId: 'Welcome channel',
  welcomeMessage: 'Welcome message',
  leaveChannelId: 'Leave channel',
  leaveMessage: 'Leave message',
};

// ── Error codes ─────────────────────────────────────────────────────────
// Shared failures reuse the economy schema's codes VERBATIM so a channel
// problem reads the same in every panel. Only the settings this schema
// introduces get new codes.
export const GENERAL_ERROR_CODES = {
  INVALID_LANGUAGE: 'INVALID_LANGUAGE',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  UNKNOWN_PLACEHOLDER: 'UNKNOWN_PLACEHOLDER',
  INVALID_CHANNEL_ID: 'INVALID_CHANNEL_ID',
  CHANNEL_NOT_FOUND: ECON.CHANNEL_NOT_FOUND,
  MISSING_BOT_PERMISSION: ECON.MISSING_BOT_PERMISSION,
  BOT_NOT_IN_GUILD: ECON.BOT_NOT_IN_GUILD,
  BOT_OFFLINE: ECON.BOT_OFFLINE,
  BOT_GATEWAY_NOT_READY: ECON.BOT_GATEWAY_NOT_READY,
  DISCORD_RATE_LIMITED: ECON.DISCORD_RATE_LIMITED,
  DISCORD_UNAVAILABLE: ECON.DISCORD_UNAVAILABLE,
  BRIDGE_NOT_CONFIGURED: ECON.BRIDGE_NOT_CONFIGURED,
  DATABASE_ERROR: ECON.DATABASE_ERROR,
  INSUFFICIENT_GUILD_PERMISSION: ECON.INSUFFICIENT_GUILD_PERMISSION,
} as const;

export type GeneralErrorCode = (typeof GENERAL_ERROR_CODES)[keyof typeof GENERAL_ERROR_CODES];

/** One structured, per-field error; the UI renders these under their control. */
export interface GeneralFieldError {
  field: string;
  label: string;
  code: GeneralErrorCode | string;
  message: string;
  current?: string;
  expected?: string;
  missingPermission?: string;
  retryable?: boolean;
}

const SNOWFLAKE = /^\d{5,25}$/;

export function isSnowflake(value: string): boolean {
  return SNOWFLAKE.test(value);
}

export function languageLabel(code: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}

/** Settings as Murabot's defaults, for a server that has never been configured. */
export function defaultGeneralSettings(prefix: string): GeneralSettings {
  return {
    prefix,
    language: DEFAULT_LANGUAGE,
    welcomeChannelId: '',
    welcomeMessage: '',
    leaveChannelId: '',
    leaveMessage: '',
  };
}

/**
 * Read the stored document into the schema's shape.
 *
 * Only declared fields survive; anything else the document holds (the rest of
 * the bot's configuration lives in the same document) is not this schema's
 * business and is never echoed back through it.
 */
export function normalizeGeneralSettings(
  doc: Record<string, unknown> | null | undefined,
  fallbackPrefix: string,
): GeneralSettings {
  const str = (key: string): string => {
    const v = doc?.[key];
    return typeof v === 'string' ? v : '';
  };
  return {
    prefix: str('prefix') || fallbackPrefix,
    language: normalizeLanguage(str('language')) ?? DEFAULT_LANGUAGE,
    welcomeChannelId: str('welcomeChannelId'),
    welcomeMessage: str('welcomeMessage'),
    leaveChannelId: str('leaveChannelId'),
    leaveMessage: str('leaveMessage'),
  };
}

/** The canonical code for a stored value, or null when it is not supported. */
export function normalizeLanguage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const primary = raw.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  return SUPPORTED_LANGUAGES.some((l) => l.code === primary) ? primary : null;
}

export function validateLanguage(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const code = normalizeLanguage(raw);
  if (!code) {
    return {
      ok: false,
      error: `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.map((l) => l.label).join(', ')}.`,
    };
  }
  return { ok: true, value: code };
}

/**
 * Validate one welcome/leave message.
 *
 * `{placeholder}` typos are the whole reason this is checked: Discord would
 * happily post `{usr}` to every new member forever, and the operator would only
 * find out by watching a join.
 */
export function validateMessage(
  field: 'welcomeMessage' | 'leaveMessage',
  raw: unknown,
): { ok: true; value: string } | { ok: false; code: string; error: string } {
  const message = String(raw ?? '').trim();
  if (!message) return { ok: true, value: '' };
  if (message.length > MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      code: GENERAL_ERROR_CODES.INVALID_MESSAGE,
      error: `${GENERAL_FIELD_LABELS[field]} must be ${MESSAGE_MAX_LENGTH} characters or fewer (it is ${message.length}).`,
    };
  }
  const known = new Set(MESSAGE_PLACEHOLDERS.map((p) => p.token));
  const unknown = [...new Set(message.match(/\{[a-z_]*\}/gi) ?? [])].filter((t) => !known.has(t));
  if (unknown.length > 0) {
    return {
      ok: false,
      code: GENERAL_ERROR_CODES.UNKNOWN_PLACEHOLDER,
      error: `${GENERAL_FIELD_LABELS[field]} uses unknown placeholder${unknown.length > 1 ? 's' : ''} `
        + `${unknown.join(', ')}. Allowed: ${MESSAGE_PLACEHOLDERS.map((p) => p.token).join(', ')}.`,
    };
  }
  return { ok: true, value: message };
}

export function validateChannelId(
  field: 'welcomeChannelId' | 'leaveChannelId',
  raw: unknown,
): { ok: true; value: string } | { ok: false; code: string; error: string } {
  const id = String(raw ?? '').trim();
  if (!id) return { ok: true, value: '' };
  if (!SNOWFLAKE.test(id)) {
    return {
      ok: false,
      code: GENERAL_ERROR_CODES.INVALID_CHANNEL_ID,
      error: `${GENERAL_FIELD_LABELS[field]} is not a Discord channel id.`,
    };
  }
  return { ok: true, value: id };
}

export interface GeneralDraft {
  language: string;
  welcomeChannelId: string;
  welcomeMessage: string;
  leaveChannelId: string;
  leaveMessage: string;
}

/**
 * Validate a whole settings write before anything is persisted.
 *
 * Returns EVERY problem at once: fixing one field at a time, re-submitting to
 * discover the next, is how a settings form teaches people to stop using it.
 */
export function validateGeneralDraft(
  input: unknown,
): { ok: true; value: GeneralDraft } | { ok: false; errors: GeneralFieldError[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      errors: [{ field: 'settings', label: 'Settings', code: 'INVALID_INPUT', message: 'A settings object is required.' }],
    };
  }
  const body = input as Record<string, unknown>;
  const errors: GeneralFieldError[] = [];

  const language = validateLanguage(body.language);
  if (!language.ok) {
    errors.push({
      field: 'language',
      label: GENERAL_FIELD_LABELS.language,
      code: GENERAL_ERROR_CODES.INVALID_LANGUAGE,
      message: language.error,
      current: String(body.language ?? ''),
    });
  }

  const messages = {} as Record<'welcomeMessage' | 'leaveMessage', string>;
  for (const field of ['welcomeMessage', 'leaveMessage'] as const) {
    const result = validateMessage(field, body[field]);
    if (!result.ok) {
      errors.push({ field, label: GENERAL_FIELD_LABELS[field], code: result.code, message: result.error });
    } else {
      messages[field] = result.value;
    }
  }

  const channels = {} as Record<'welcomeChannelId' | 'leaveChannelId', string>;
  for (const field of ['welcomeChannelId', 'leaveChannelId'] as const) {
    const result = validateChannelId(field, body[field]);
    if (!result.ok) {
      errors.push({ field, label: GENERAL_FIELD_LABELS[field], code: result.code, message: result.error });
    } else {
      channels[field] = result.value;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      language: language.ok ? language.value : DEFAULT_LANGUAGE,
      welcomeChannelId: channels.welcomeChannelId,
      welcomeMessage: messages.welcomeMessage,
      leaveChannelId: channels.leaveChannelId,
      leaveMessage: messages.leaveMessage,
    },
  };
}

/** Which of the schema's fields actually changed, so only those are written. */
export function changedGeneralFields(
  before: GeneralSettings,
  after: GeneralDraft,
): Array<(typeof GENERAL_SETTINGS_FIELDS)[number]> {
  return GENERAL_SETTINGS_FIELDS.filter((key) => before[key] !== after[key]);
}

/** The localized default Murabot sends when a message field is left empty. */
export function defaultMessagePreview(
  language: string,
  kind: 'welcome' | 'leave',
): string {
  // Mirrors `discord-bot/bot/i18n.py` defaults for the selected language. The
  // bot remains the authority on what is sent; this is the preview copy shown
  // in the field, and the cross-boundary test keeps the two lists aligned.
  const templates: Record<string, Record<'welcome' | 'leave', string>> = {
    en: { welcome: '**{user}** joined {server}. Welcome!', leave: '**{user}** left {server}.' },
    de: { welcome: '**{user}** ist {server} beigetreten. Willkommen!', leave: '**{user}** hat {server} verlassen.' },
    es: { welcome: '**{user}** se ha unido a {server}. ¡Bienvenido!', leave: '**{user}** ha salido de {server}.' },
    fr: { welcome: '**{user}** a rejoint {server}. Bienvenue !', leave: '**{user}** a quitté {server}.' },
  };
  const table = templates[normalizeLanguage(language) ?? DEFAULT_LANGUAGE] ?? templates.en;
  return table[kind];
}
