import {
  ECONOMY_CROSS_RULES,
  ECONOMY_ERROR_CODES,
  ECONOMY_FIELD_BY_KEY,
  ECONOMY_FIELDS,
  type EconomyField,
  type EconomyFieldError,
} from './economy-schema';

// ── Economy draft validation ────────────────────────────────────────────
//
// Validates a whole draft and returns EVERY failure at once, so the operator
// fixes one list rather than playing whack-a-mole one error per save.
//
// Two properties this file guarantees:
//   * it never mutates its input, and
//   * a rejected value is never "helpfully" clamped into range. Clamping
//     silently stored a number the user did not type and reported success,
//     which is how a reward could quietly become a different reward. An
//     out-of-range value is an error, full stop.

export interface ValidationResult {
  /** Sanitized, clamped-to-type values. Valid ONLY when `errors` is empty. */
  values: Record<string, unknown>;
  errors: EconomyFieldError[];
  /** Non-fatal advice (e.g. a weekly reward smaller than a daily one). */
  warnings: EconomyFieldError[];
}

function rangeLabel(field: EconomyField): string {
  if (field.kind === 'int' || field.kind === 'number') {
    return `${field.min} – ${field.max}`;
  }
  if (field.kind === 'text') return `${field.allowEmpty ? 'empty' : 'non-empty'} text`;
  return field.kind;
}

/**
 * Validate a raw draft.
 *
 * `draft` is whatever the browser sent. Unknown keys are rejected rather than
 * ignored: a typo'd field name would otherwise be dropped in silence, which is
 * precisely the failure that made nine settings unsaveable.
 */
export function validateEconomyDraft(
  draft: unknown,
  opts: { existing?: Record<string, unknown>; isOwner: boolean } ,
): ValidationResult {
  const values: Record<string, unknown> = {};
  const errors: EconomyFieldError[] = [];
  const warnings: EconomyFieldError[] = [];

  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    return {
      values: {},
      warnings: [],
      errors: [{
        field: 'config', label: 'Configuration', code: ECONOMY_ERROR_CODES.INVALID_TEXT,
        message: 'The configuration payload was not an object.',
      }],
    };
  }
  const input = draft as Record<string, unknown>;
  const existing = opts.existing ?? {};

  for (const [key, value] of Object.entries(input)) {
    const field = ECONOMY_FIELD_BY_KEY.get(key);
    if (!field) {
      errors.push({
        field: key,
        label: key,
        code: ECONOMY_ERROR_CODES.INVALID_TEXT,
        message: `"${key}" is not a known economy setting. Nothing was saved.`,
      });
      continue;
    }

    // Owner-only is checked BEFORE the value so a non-owner is told the field
    // is not theirs to change, rather than being walked through its bounds.
    if (field.ownerOnly && !opts.isOwner) {
      errors.push({
        field: key,
        label: field.label,
        code: ECONOMY_ERROR_CODES.OWNER_ONLY,
        message: `${field.label} is an economic value. Only the Murabot owner can change it.`,
        current: formatValue(value),
        expected: 'Owner Only',
      });
      continue;
    }

    switch (field.kind) {
      case 'text': {
        const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
        if (text === '' && field.allowEmpty) {
          values[key] = '';
          break;
        }
        const maxLen = key === 'currencyName' ? 20 : key === 'currencySymbol' ? 8 : 100;
        if (text === '') {
          errors.push({
            field: key, label: field.label, code: ECONOMY_ERROR_CODES.INVALID_TEXT,
            message: `${field.label} cannot be empty.`, current: '(empty)',
            expected: `1 – ${maxLen} characters`,
          });
          break;
        }
        if (text.length > maxLen) {
          errors.push({
            field: key, label: field.label, code: ECONOMY_ERROR_CODES.INVALID_TEXT,
            current: text,
            expected: `1 – ${maxLen} characters`,
            message: `${field.label} is ${text.length} characters. It must be ${maxLen} or fewer.`,
          });
          break;
        }
        values[key] = text;
        break;
      }

      case 'int':
      case 'number': {
        // Accept a numeric string: an <input type="number"> hands one over.
        const raw = typeof value === 'number' ? value : Number(String(value).trim());
        if (String(value).trim() === '' || !Number.isFinite(raw)) {
          errors.push({
            field: key, label: field.label, code: ECONOMY_ERROR_CODES.INVALID_NUMBER,
            current: formatValue(value), expected: rangeLabel(field),
            message: `${field.label} must be a number.`,
          });
          break;
        }
        if (field.kind === 'int' && !Number.isInteger(raw)) {
          errors.push({
            field: key, label: field.label, code: ECONOMY_ERROR_CODES.INVALID_NUMBER,
            current: String(raw), expected: 'A whole number',
            message: `${field.label} must be a whole number.`,
          });
          break;
        }
        if (field.min !== undefined && field.max !== undefined && (raw < field.min || raw > field.max)) {
          errors.push({
            field: key, label: field.label, code: ECONOMY_ERROR_CODES.OUT_OF_RANGE,
            current: String(raw), expected: rangeLabel(field),
            message: `${field.label} must be between ${field.min} and ${field.max}.`,
          });
          break;
        }
        values[key] = raw;
        break;
      }

      case 'channel': {
        const id = typeof value === 'string' ? value.trim() : '';
        if (id === '') {
          // Clearing a channel is legitimate; it is verified only when set.
          values[key] = '';
          break;
        }
        if (!/^\d{5,25}$/.test(id)) {
          errors.push({
            field: key, label: field.label, code: ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND,
            current: '(not a valid channel)', expected: 'A channel from this server’s list',
            message: `${field.label} is not a valid channel selection. Pick one from the dropdown.`,
          });
          break;
        }
        values[key] = id;
        break;
      }

      case 'toggle': {
        values[key] = Boolean(value);
        break;
      }

      case 'list': {
        if (Array.isArray(value)) {
          values[key] = value.map((v) => String(v).slice(0, 40)).slice(0, 100);
        } else if (value && typeof value === 'object') {
          const out: Record<string, number> = {};
          for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
            const n = Math.floor(Number(v));
            if (/^[a-z0-9_-]{1,40}$/.test(k) && Number.isFinite(n)) out[k] = n;
          }
          values[key] = out;
        } else if (field.allowEmpty) {
          values[key] = key === 'jobCooldownOverrides' || key === 'multipliers' ? {} : [];
        } else {
          errors.push({
            field: key, label: field.label, code: ECONOMY_ERROR_CODES.INVALID_TEXT,
            expected: 'A list or object', message: `${field.label} has an unexpected shape.`,
          });
        }
        break;
      }
    }
  }

  // ── Cross-field rules ───────────────────────────────────────────────
  // Run against the MERGED view (draft over existing) so a rule still holds
  // when only one side of the pair is being changed.
  const merged: Record<string, number> = {};
  for (const field of ECONOMY_FIELDS) {
    if (field.kind !== 'int' && field.kind !== 'number') continue;
    const fromDraft = values[field.key];
    const fromExisting = existing[field.key];
    const n = typeof fromDraft === 'number' ? fromDraft : Number(fromExisting);
    if (Number.isFinite(n)) merged[field.key] = n;
  }
  for (const rule of ECONOMY_CROSS_RULES) {
    // A rule only runs when every field it reads has a usable value; a half
    // merged pair is already reported as a per-field error.
    if (!rule.keys.every((k) => k in merged)) continue;
    if (rule.check(merged)) continue;
    const label = ECONOMY_FIELD_BY_KEY.get(rule.field)?.label ?? rule.field;
    const issue: EconomyFieldError = {
      field: rule.field,
      label,
      code: ECONOMY_ERROR_CODES.CROSS_FIELD_INVALID,
      message: rule.message,
      current: String(merged[rule.field] ?? ''),
      expected: rule.message,
    };
    (rule.advisory ? warnings : errors).push(issue);
  }

  return { values, errors, warnings };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'string') return value === '' ? '(empty)' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value).slice(0, 60);
}

/**
 * Merge validated values over the existing economy section, preserving every
 * key the draft did not mention.
 *
 * This is what stops a partial save from erasing settings: a draft touching
 * only `dailyAmount` must not blank `currencyName` or drop `logChannelId`.
 */
export function mergeEconomySection(
  existing: Record<string, unknown> | null | undefined,
  validated: Record<string, unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  for (const field of ECONOMY_FIELDS) {
    const current = existing?.[field.key];
    if (current !== undefined && current !== null) base[field.key] = current;
  }
  return { ...base, ...validated };
}

/** A fresh section with every declared key defaulted, for first-time setups. */
export function defaultEconomySection(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of ECONOMY_FIELDS) {
    out[field.key] = Array.isArray(field.default)
      ? []
      : field.default && typeof field.default === 'object'
        ? {}
        : field.default;
  }
  return out;
}
