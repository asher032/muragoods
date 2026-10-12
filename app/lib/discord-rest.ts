/**
 * One Discord REST client, one error vocabulary.
 *
 * Phase 2 §8 requires the dashboard to distinguish "the guild has no such
 * role" from "Discord timed out" from "we are rate limited" from "the bot is
 * not in this guild". Before this module every selector route collapsed all of
 * them into `*_FETCH_FAILED` with HTTP 502 and a "retry in a moment" string,
 * which made an operator debug Discord when the real fault was a missing bot
 * invite, and made a 429 look identical to an outage.
 *
 * The rules it enforces:
 *
 *   * **Never turn infrastructure into "validation failed".** A timeout is
 *     `DISCORD_TIMEOUT` and is retryable. It can never surface as a form error
 *     telling the operator their input was wrong.
 *   * **Never leak.** The bot token is only ever sent in an Authorization
 *     header. No response body is echoed into a message unfiltered, and the
 *     debug object carries status numbers and ids — never headers, never the
 *     token, never a connection string.
 *   * **Deleted things are their own outcome.** A role or channel that exists
 *     in the dashboard's saved config but not in the guild is reported as
 *     missing, because "you saved a role that was deleted" is a different
 *     problem from "Discord is down".
 *
 * Every route that talks to Discord returns through `discordGet`, so the codes
 * below are the only ones a selector UI has to handle.
 */

import { botToken } from '@/app/lib/discord-bot';

export const DISCORD_API_BASE = 'https://discord.com/api/v10';

export const DISCORD_TIMEOUT = 'DISCORD_TIMEOUT';
export const DISCORD_RATE_LIMITED = 'DISCORD_RATE_LIMITED';
export const DISCORD_API_ERROR = 'DISCORD_API_ERROR';
export const BOT_NOT_IN_GUILD = 'BOT_NOT_IN_GUILD';
export const MISSING_PERMISSION = 'MISSING_PERMISSION';
export const DISCORD_NOT_CONFIGURED = 'DISCORD_NOT_CONFIGURED';
export const DISCORD_INVALID_GUILD = 'DISCORD_INVALID_GUILD';

/** Codes where the caller should offer "try again", not "fix your input". */
export const RETRYABLE_DISCORD_CODES = new Set<string>([
  DISCORD_TIMEOUT,
  DISCORD_RATE_LIMITED,
  DISCORD_API_ERROR,
]);

/** HTTP status → structured code. Anything unmapped is an API error. */
export function codeForStatus(status: number): string {
  if (status === 404) return BOT_NOT_IN_GUILD;
  if (status === 403) return MISSING_PERMISSION;
  if (status === 429) return DISCORD_RATE_LIMITED;
  return DISCORD_API_ERROR;
}

/** HTTP status → response status for the dashboard's own API route. */
export function httpStatusForCode(code: string): number {
  switch (code) {
    case DISCORD_INVALID_GUILD:
      return 400;
    case MISSING_PERMISSION:
      return 403;
    case BOT_NOT_IN_GUILD:
      return 404;
    case DISCORD_NOT_CONFIGURED:
      return 503;
    case DISCORD_RATE_LIMITED:
      // 429 tells the browser to back off, which is exactly right.
      return 429;
    default:
      return 502;
  }
}

export type DiscordFailure = {
  ok: false;
  code: string;
  error: string;
  retryable: boolean;
  /** Numbers and ids only — never headers, tokens or bodies. */
  debug: { guildId: string; discordStatus: number; reason?: string };
};

export type DiscordResult<T> = { ok: true; status: number; data: T } | DiscordFailure;

function fail(
  guildId: string,
  code: string,
  error: string,
  status: number,
  reason?: string,
): DiscordFailure {
  return {
    ok: false,
    code,
    error,
    retryable: RETRYABLE_DISCORD_CODES.has(code),
    debug: reason ? { guildId, discordStatus: status, reason } : { guildId, discordStatus: status },
  };
}

/**
 * GET a Discord REST path with the bot token.
 *
 * `guildId` is only used for the failure report; Discord derives the guild from
 * the path. Nothing from the response body is returned unless `resp.ok`, so a
 * 4xx body can never be mistaken for data.
 */
export async function discordGet<T>(
  path: string,
  guildId: string,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
): Promise<DiscordResult<T>> {
  const token = botToken();
  if (!token) {
    return fail(
      guildId,
      DISCORD_NOT_CONFIGURED,
      'Discord access is not configured on this deployment (DISCORD_BOT_TOKEN).',
      0,
      'BOT_NOT_CONFIGURED',
    );
  }

  let resp: Response;
  try {
    resp = await fetch(`${DISCORD_API_BASE}${path}`, {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // A thrown fetch is either our own timeout or a network fault. Both are
    // infrastructure: the operator's input was fine, so this must not be
    // reported as a validation failure.
    const timedOut = err instanceof Error && /timeout|abort/i.test(err.name + err.message);
    return fail(
      guildId,
      timedOut ? DISCORD_TIMEOUT : DISCORD_API_ERROR,
      timedOut
        ? 'Discord did not respond in time — try again.'
        : 'Discord could not be reached — try again shortly.',
      0,
      timedOut ? 'TIMEOUT' : 'NETWORK',
    );
  }

  if (resp.status === 429) {
    return fail(
      guildId,
      DISCORD_RATE_LIMITED,
      'Discord is rate limiting this bot — wait a moment and try again.',
      429,
      'RATE_LIMITED',
    );
  }

  if (!resp.ok) {
    const code = codeForStatus(resp.status);
    const error =
      code === BOT_NOT_IN_GUILD
        ? 'MuraBot is not a member of this server. Invite it, then try again.'
        : code === MISSING_PERMISSION
          ? 'MuraBot is missing a Discord permission for this request.'
          : `Discord returned ${resp.status} — try again shortly.`;
    return fail(guildId, code, error, resp.status);
  }

  const data = (await resp.json().catch(() => null)) as T | null;
  if (data === null) {
    return fail(
      guildId,
      DISCORD_API_ERROR,
      'Discord returned an unreadable response — try again shortly.',
      resp.status,
      'BAD_BODY',
    );
  }
  return { ok: true, status: resp.status, data };
}

/** Whether an id is a plausible Discord snowflake, checked before any fetch. */
export function isGuildId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{5,25}$/.test(value);
}

/** Turn a `DiscordResult` failure into the JSON body a route returns. */
export function failureBody(failure: DiscordFailure): {
  success: false;
  code: string;
  error: string;
  retryable: boolean;
  debug: DiscordFailure['debug'];
} {
  return {
    success: false,
    code: failure.code,
    error: failure.error,
    retryable: failure.retryable,
    debug: failure.debug,
  };
}