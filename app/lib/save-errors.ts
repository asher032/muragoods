// ─── One taxonomy for every dashboard save failure ──────────────────────
//
// The bug this file exists to kill:
//
//   "Not saved — 1 setting failed validation.
//    • Raid Alerts — the current value: Validation failed (HTTP 502).
//    Fix the selection above (usually bot permissions or a deleted channel/role)."
//
// Every clause of that message was wrong. A 502 is an upstream failure —
// Murabot, Discord, or a proxy — not a statement about the operator's
// selection. And the advice ("usually bot permissions or a deleted
// channel/role") told them to go fix something that was already fine.
//
// Two distinct mistakes were being made, in two places:
//
//   1. STATUS → MEANING. Every non-2xx collapsed into "validation failed".
//      A throttle, an outage, an expired session and a bad channel id are
//      five different facts with five different remedies.
//   2. VERDICT vs. VERIFICATION. "This channel does not exist" is a verdict.
//      "I could not reach Discord to find out" is the ABSENCE of a verdict,
//      and treating it as one either blocks a valid save or, worse, invites
//      the user to "fix" a selection that was correct.
//
// So a failure here is either a VERDICT (the value is wrong — block and
// name the field) or an UNAVAILABILITY (we do not know — say so, do not
// blame the user's value, and let the caller decide whether it blocks).

/** How a failure should be classified. */
export type SaveErrorKind =
  /** The request or a value is genuinely wrong. Blocking, field-specific. */
  | 'validation'
  /** Not signed in, or the session expired. */
  | 'authentication'
  /** Signed in, but not allowed to do this. */
  | 'permission'
  /** The thing does not exist. */
  | 'not_found'
  /** Conflicts with current state. */
  | 'conflict'
  /** Throttled by us or by Discord. Retry after the window. */
  | 'rate_limited'
  /** Our own bug. */
  | 'internal'
  /** An upstream service (Murabot, Discord, a proxy) could not answer. */
  | 'upstream'
  /** A dependency is down or unconfigured. */
  | 'unavailable'
  /** An upstream service did not answer in time. */
  | 'timeout'
  /** We could not classify it. Deliberately NOT validation. */
  | 'unknown';

export interface NormalizedSaveError {
  kind: SaveErrorKind;
  /** Machine-readable, safe to send to a client and to log. */
  code: string;
  /** The HTTP status this came from (0 for a transport failure). */
  status: number;
  /** One sentence, in the second person, naming what actually happened. */
  message: string;
  /**
   * True when the SAME request could plausibly succeed unchanged. The UI
   * offers Retry for these and never for a validation failure.
   */
  retryable: boolean;
  /** For a validation verdict: which field, and what was wrong with it. */
  field?: string;
  /** Discord's Retry-After, in ms, when the failure was a throttle. */
  retryAfterMs?: number;
}

/**
 * Status → kind.
 *
 * 400 and 422 are the ONLY two that mean "your value is wrong". Everything
 * else describes the connection, the credential, or the service — and calling
 * any of those a validation failure is the original bug.
 */
export function kindForStatus(status: number): SaveErrorKind {
  switch (status) {
    case 400:
    case 422:
      return 'validation';
    case 401:
      return 'authentication';
    case 403:
      return 'permission';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 429:
      return 'rate_limited';
    case 500:
      return 'internal';
    case 502:
      return 'upstream';
    case 503:
      return 'unavailable';
    case 504:
      return 'timeout';
    default:
      // 0 = never reached the server. 418/451/whatever = unclassified.
      return 'unknown';
  }
}

/**
 * Codes that mean "we could not check", not "your value is wrong".
 *
 * These are the ones that used to be rendered as a field-level validation
 * failure. They are deliberately NOT `kind: 'validation'`: a value that was
 * never examined cannot have failed validation.
 */
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'DISCORD_RATE_LIMITED',
  'RATE_LIMITED',
  'DISCORD_API_ERROR',
  'DISCORD_UNREACHABLE',
  'DISCORD_AUTH_ERROR',
  'BOT_CREDENTIAL_REJECTED',
  'BOT_API_UNAVAILABLE',
  'BOT_OFFLINE',
  'BOT_GATEWAY_NOT_READY',
  'DISCORD_UNAVAILABLE',
  'BRIDGE_NOT_CONFIGURED',
  'DATABASE_ERROR',
  'DATABASE_UNAVAILABLE',
  'ECONOMY_SNAPSHOT_FAILED',
  'UPSTREAM_TIMEOUT',
  'INTERNAL_ERROR',
  'UNKNOWN_SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
]);

/** Codes that are a real verdict about the value the operator picked. */
const VERDICT_CODES: ReadonlySet<string> = new Set([
  'INVALID_REQUEST',
  'VALIDATION_ERROR',
  'INVALID_GUILD_ID',
  'INVALID_OP',
  'CHANNEL_NOT_FOUND',
  'CHANNEL_INVALID',
  'CHANNEL_ACCESS_DENIED',
  'MISSING_BOT_PERMISSION',
  'ROLE_NOT_FOUND',
  'ROLE_MANAGED',
  'ROLE_ACCESS_DENIED',
  'MEMBER_NOT_FOUND',
  'MEMBER_NOT_IN_GUILD',
  'INVALID_CHANNEL',
  'OWNER_ONLY',
  'INSUFFICIENT_GUILD_PERMISSION',
]);

/** Does this code describe a failure to CHECK rather than a bad value? */
export function isUnavailability(code: string | null | undefined): boolean {
  return !!code && UNAVAILABLE_CODES.has(code);
}

/** Does this code assert that the submitted value is wrong? */
export function isVerdict(code: string | null | undefined): boolean {
  return !!code && VERDICT_CODES.has(code);
}

const DEFAULT_MESSAGE: Record<SaveErrorKind, string> = {
  validation: 'The dashboard rejected this value. Nothing was saved.',
  authentication: 'Your Discord session has expired. Sign in again, then save.',
  permission: 'You do not have permission to change this on this server.',
  not_found: 'That server or setting could not be found.',
  conflict: 'Something else changed this setting first. Reload and try again.',
  rate_limited: 'Discord is temporarily rate limiting requests. Retry shortly.',
  internal: 'The dashboard hit an internal error. Nothing was saved.',
  upstream: 'Murabot could not be reached. Nothing was saved — your settings are unchanged.',
  unavailable: 'Murabot is unavailable right now. Nothing was saved — your settings are unchanged.',
  timeout: 'Murabot did not answer in time. Nothing was saved — your settings are unchanged.',
  unknown: 'The save failed for an unknown reason. Nothing was saved.',
};

/** Is retrying this exact request sensible? */
function retryableFor(kind: SaveErrorKind): boolean {
  return kind === 'rate_limited' || kind === 'upstream'
    || kind === 'unavailable' || kind === 'timeout' || kind === 'conflict'
    || kind === 'internal' || kind === 'unknown';
}

/**
 * The single entry point every save path uses to describe a failure.
 *
 * `body` is whatever the server sent (already parsed, possibly null). A
 * server-supplied `code` and `message` always win over the status-derived
 * default, because the server knows more than the status line does; the
 * status only decides the KIND when the server did not name one.
 */
export function normalizeApiError(
  status: number,
  body: unknown,
  opts: { field?: string; retryAfterMs?: number } = {},
): NormalizedSaveError {
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const serverCode = typeof payload.code === 'string' ? payload.code : null;
  const serverMessage =
    typeof payload.error === 'string' && payload.error ? payload.error
      : typeof payload.message === 'string' && payload.message ? payload.message
        : null;

  // A named code is more specific than the status. An unavailability code
  // keeps that kind even when the status was 4xx, because "we could not reach
  // Discord" is not a permission problem however it was numbered.
  let kind: SaveErrorKind;
  if (serverCode && isUnavailability(serverCode)) {
    kind = serverCode === 'DISCORD_RATE_LIMITED' || serverCode === 'RATE_LIMITED'
      ? 'rate_limited'
      : serverCode === 'UPSTREAM_TIMEOUT' ? 'timeout'
      // A service that is DOWN or UNCONFIGURED reads differently from one we
      // merely could not reach, and the operator's next action differs.
      : serverCode === 'SERVICE_UNAVAILABLE' || serverCode === 'BOT_OFFLINE'
        || serverCode === 'DATABASE_UNAVAILABLE' || serverCode === 'BOT_GATEWAY_NOT_READY'
        || serverCode === 'BRIDGE_NOT_CONFIGURED'
        ? 'unavailable'
        : 'upstream';
  } else if (serverCode && isVerdict(serverCode)) {
    kind = serverCode === 'OWNER_ONLY' || serverCode === 'INSUFFICIENT_GUILD_PERMISSION'
      ? 'permission'
      : 'validation';
  } else {
    kind = kindForStatus(status);
  }

  // A per-field error list, when the server sent one, is authoritative for the
  // field name. The first entry names the field for a single-field failure.
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const first = errors.length > 0 && errors[0] && typeof errors[0] === 'object'
    ? (errors[0] as Record<string, unknown>)
    : null;
  const field = opts.field ?? (typeof first?.field === 'string' ? first.field : undefined);

  return {
    kind,
    code: serverCode ?? (kind === 'unknown' ? 'UNKNOWN_SERVER_ERROR' : `HTTP_${status || 0}`),
    status,
    message: serverMessage ?? DEFAULT_MESSAGE[kind],
    retryable: typeof payload.retryable === 'boolean' ? payload.retryable : retryableFor(kind),
    ...(field ? { field } : {}),
    ...(opts.retryAfterMs !== undefined ? { retryAfterMs: opts.retryAfterMs } : {}),
  };
}

/**
 * The one line shown to the operator, per category.
 *
 * Deliberately NOT phrased as advice about their selection unless we actually
 * know the selection is at fault. "Fix the selection above (usually bot
 * permissions or a deleted channel/role)" was shown for every failure,
 * including upstream outages — which is how a correct configuration came to
 * be repeatedly "fixed" into a wrong one.
 */
export function saveErrorHeadline(err: NormalizedSaveError): string {
  switch (err.kind) {
    case 'validation':
      return '✕ Not saved — a setting was rejected.';
    case 'authentication':
      return '🔑 Not saved — sign in again.';
    case 'permission':
      return '🔒 Not saved — you do not have permission.';
    case 'not_found':
      return '✕ Not saved — that server or setting no longer exists.';
    case 'conflict':
      return '✕ Not saved — someone else changed this first.';
    case 'rate_limited':
      return `⏳ Not saved — rate limited.${err.retryAfterMs ? ` Retry in ${Math.max(1, Math.round(err.retryAfterMs / 1000))}s.` : ' Retry shortly.'}`;
  case 'upstream':
    return '⚠ Not saved — Murabot could not be reached. Your settings are unchanged.';
  case 'unavailable':
    return '⚠ Not saved — Murabot is unavailable or restarting. Your settings are unchanged.';
    case 'timeout':
      return '⏱ Not saved — Murabot did not answer in time. Your settings are unchanged.';
    case 'internal':
      return '⚠ Not saved — the dashboard hit an internal error.';
    default:
      return '⚠ Not saved — the request failed. Your settings are unchanged.';
  }
}

/**
 * A follow-up line that tells the operator what to do NEXT.
 *
 * Returns nothing for the failure categories where the right action is simply
 * to retry — an empty string is better than a wrong instruction.
 */
export function saveErrorAdvice(err: NormalizedSaveError): string {
  switch (err.kind) {
    case 'validation':
      return 'Fix the highlighted field below, then save again.';
    case 'authentication':
      return 'Sign in with Discord again — your session expired.';
    case 'permission':
      return 'Only someone with permission on this server can change this.';
    case 'not_found':
      return 'Pick the server again — it may have been removed from your account.';
    case 'conflict':
      return 'Reload the page to get the current values, then apply your change again.';
    case 'rate_limited':
    case 'upstream':
    case 'unavailable':
    case 'timeout':
      // The one thing we must NOT say here is "check your channel". We never
      // looked at the channel; the upstream service did not answer.
      return 'This is a service problem, not a problem with your settings. Retry in a moment.';
    default:
      return '';
  }
}
