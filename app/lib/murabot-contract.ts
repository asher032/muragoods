// ── THE MURABOT ERROR CONTRACT ───────────────────────────────────────────
//
// One vocabulary for "the dashboard asked Murabot something and did not get a
// usable answer". Every bridge call classifies against this list, so the same
// fault is never reported under two different names on two different pages.
//
// The failure this exists to prevent: a 404 from Murabot used to be surfaced
// as a Discord problem. The dashboard told the operator "Discord did not
// return the channel list" and "your channel no longer exists" while the real
// cause was that the running Murabot build predates the endpoint. That sends
// someone to fix permissions and channels that were perfectly fine, and it
// costs an afternoon to undo.
//
// The distinction is always the same three questions:
//   1. Did the request REACH Murabot?
//   2. Did Murabot's build HAVE that route?
//   3. Did Discord answer?
// A `no` to 1 is an outage, to 2 is a deployment, to 3 is a Discord fault. Only
// the third one is ever the user's server.

export type MurabotErrorCode =
  /** Murabot did not have the route. Redeploy. Not a Discord fault. */
  | 'MURABOT_ROUTE_MISSING'
  /** Murabot could not be reached at all. */
  | 'MURABOT_UNAVAILABLE'
  /** Murabot was reached but did not answer in time. */
  | 'MURABOT_TIMEOUT'
  /** The dashboard's bridge secret was rejected (401). */
  | 'MURABOT_UNAUTHORIZED'
  /** Murabot refused on authorization grounds (403). */
  | 'MURABOT_FORBIDDEN'
  /** Murabot answered, but its own database was unreachable. */
  | 'MURABOT_DATABASE_ERROR'
  /** Discord rate limited the check. */
  | 'DISCORD_RATE_LIMITED'
  /** Discord answered and denied access. */
  | 'DISCORD_PERMISSION_DENIED'
  /** Discord did not answer in time. */
  | 'DISCORD_TIMEOUT'
  /** Discord answered with something we cannot classify. */
  | 'DISCORD_API_ERROR'
  /** The bot is not in the guild. */
  | 'BOT_NOT_IN_GUILD'
  /** The bridge secret is not configured on the dashboard. */
  | 'BRIDGE_NOT_CONFIGURED'
  /** Something else went wrong. */
  | 'INTERNAL_ERROR';

/**
 * Legacy names still emitted by older call sites, mapped onto the contract.
 *
 * `ROUTE_NOT_REGISTERED` predates this contract and means exactly
 * `MURABOT_ROUTE_MISSING`; accepting both keeps existing UI comparisons
 * working while everything new speaks one language.
 */
const LEGACY_ALIASES: Record<string, MurabotErrorCode> = {
  ROUTE_NOT_REGISTERED: 'MURABOT_ROUTE_MISSING',
  BOT_OFFLINE: 'MURABOT_UNAVAILABLE',
  BOT_GATEWAY_NOT_READY: 'MURABOT_UNAVAILABLE',
  AUTHENTICATION_ERROR: 'MURABOT_UNAUTHORIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

/** Normalise any code this codebase can emit to the canonical contract. */
export function normalizeMurabotCode(code: string): MurabotErrorCode {
  if (code in LEGACY_ALIASES) return LEGACY_ALIASES[code];
  return code as MurabotErrorCode;
}

/**
 * HTTP status to answer with, so a client backs off correctly.
 *
 * A missing route is 501, not 404: the resource the dashboard asked for is not
 * implemented by this build. That is a server-side condition and must never be
 * rendered as "that channel does not exist".
 */
export function murabotStatusFor(code: string): number {
  switch (normalizeMurabotCode(code)) {
    case 'MURABOT_ROUTE_MISSING':
      return 501;
    case 'BOT_NOT_IN_GUILD':
      return 404;
    case 'MURABOT_UNAUTHORIZED':
      return 502;
    case 'MURABOT_FORBIDDEN':
      return 403;
    case 'DISCORD_RATE_LIMITED':
      return 429;
    case 'MURABOT_TIMEOUT':
    case 'DISCORD_TIMEOUT':
      return 504;
    case 'MURABOT_UNAVAILABLE':
    case 'MURABOT_DATABASE_ERROR':
    case 'BRIDGE_NOT_CONFIGURED':
      return 503;
    default:
      return 503;
  }
}

/**
 * Retryable only if trying again could plausibly help.
 *
 * A missing route is NOT retryable: no amount of retrying an outdated build
 * makes the endpoint appear. So is a 403. A rate limit, a timeout and an
 * outage all are.
 */
export function murabotRetryable(code: string): boolean {
  switch (normalizeMurabotCode(code)) {
    case 'MURABOT_ROUTE_MISSING':
    case 'MURABOT_FORBIDDEN':
    case 'MURABOT_UNAUTHORIZED':
    case 'DISCORD_PERMISSION_DENIED':
      return false;
    default:
      return true;
  }
}
