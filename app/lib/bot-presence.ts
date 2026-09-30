// ── Murabot presence, from Murabot itself ──────────────────────────────
//
// "Is Murabot in this server, and can it post in these channels?" is answered
// by the bot process, from its own gateway cache.
//
// It used to be answered by the DASHBOARD, with the dashboard's own Discord
// bot token. That was a second credential to keep valid, and when it was
// missing, stale or rejected Discord answered 401 — which the old code
// collapsed into one useless sentence, "Discord did not answer the bot check.",
// shown under the Economy Log Channel as if the channel were the problem.
//
// Three properties this module guarantees:
//
//   * the gateway cache is the source of truth for presence, not token
//     presence — a configured token does not mean the bot is online;
//   * every failure keeps its own code (offline, gateway not ready, not in
//     guild, rate limited, unauthenticated, transport), and
//   * a transport failure is never reported as "this channel is invalid".
//
// The bot resolves permissions with discord.py against the cached guild, which
// is the same computation the gateway itself applies — there is no second
// permission model here to drift out of step with Discord.

const BOT_BASE =
  process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

export const dynamic = 'force-dynamic';

/** Every way this check can fail, named. Never collapsed into one message. */
export type BotCheckCode =
  | 'BOT_ONLINE'
  | 'BOT_OFFLINE'
  | 'BOT_GATEWAY_NOT_READY'
  | 'BOT_NOT_IN_GUILD'
  | 'BOT_PERMISSION_MISSING'
  | 'DISCORD_RATE_LIMITED'
  | 'DISCORD_API_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'BRIDGE_NOT_CONFIGURED'
  | 'INTERNAL_ERROR';

export interface BotPresence {
  /** Is Murabot connected to Discord right now? */
  online: boolean;
  /** Is Murabot a member of the guild being viewed? */
  installed: boolean;
  /** Can Murabot read this guild's channels at all? */
  guildAccessible: boolean;
  botUserId: string | null;
  botUsername: string | null;
  gatewayState: string | null;
  heartbeatAgeSeconds: number | null;
  latencyMs: number | null;
}

export interface ChannelOption {
  id: string;
  name: string;
  type: number;
  categoryName: string | null;
  usable: boolean;
  /** The exact permission that is missing, when `usable` is false. */
  missing: { requirement: string; permission: string; label: string } | null;
  checks: Array<{ requirement: string; label: string; ok: boolean }>;
}

export interface BotChannelResult {
  presence: BotPresence;
  channels: ChannelOption[];
  requires: string[];
  error: { code: BotCheckCode; message: string } | null;
  /** Discord's Retry-After, when it throttled us. */
  retryAfterMs?: number;
  cached: boolean;
}

/**
 * Failure codes that will not fix themselves: retrying is pointless, and the
 * user needs a different action (invite the bot, fix the shared secret) rather
 * than a retry button.
 */
const TERMINAL_CODES: ReadonlySet<BotCheckCode> = new Set<BotCheckCode>([
  'BOT_NOT_IN_GUILD',
  'AUTHENTICATION_ERROR',
  'BRIDGE_NOT_CONFIGURED',
]);

/** Whether retrying this failure could plausibly succeed. */
export function isRetryableBotFailure(code: BotCheckCode): boolean {
  return !TERMINAL_CODES.has(code);
}

const PRESENCE_TTL_MS = 15_000;
const cache = new Map<string, { at: number; value: BotChannelResult }>();
const inflight = new Map<string, Promise<BotChannelResult>>();

function bridgeSecret(): string | null {
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  return secret.trim() || null;
}

function retryAfterMs(res: Response): number {
  const raw = Number(res.headers.get('retry-after') ?? '1');
  return Number.isFinite(raw) && raw >= 0 ? Math.min(60, Math.ceil(raw)) * 1000 : 1000;
}

const UNKNOWN_PRESENCE: BotPresence = {
  online: false, installed: false, guildAccessible: false,
  botUserId: null, botUsername: null, gatewayState: null,
  heartbeatAgeSeconds: null, latencyMs: null,
};

/**
 * Ask Murabot which channels it can use in this guild.
 *
 * Never throws and never invents an answer: every path returns a presence and,
 * when the bot could not answer, a specific reason.
 */
export async function botChannels(
  guildId: string,
  requires: readonly string[] = ['view', 'send', 'embed'],
): Promise<BotChannelResult> {
  const key = `${guildId}|${requires.join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < PRESENCE_TTL_MS) {
    return { ...hit.value, cached: true };
  }
  const running = inflight.get(key);
  if (running) return { ...(await running), cached: true };

  const promise = (async (): Promise<BotChannelResult> => {
    const secret = bridgeSecret();
    if (!secret) {
      return {
        presence: UNKNOWN_PRESENCE, channels: [], requires: [...requires], cached: false,
        error: {
          code: 'BRIDGE_NOT_CONFIGURED',
          message: 'The dashboard is not connected to Murabot, so it cannot read this server\'s channels. '
            + 'The channel list will return once the connection is configured.',
        },
      };
    }
    const url = `${BOT_BASE}/economy/channels/${guildId}?requires=${requires.join(',')}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // A timeout or a refused connection. That is a transport fact, and it is
      // reported as one — never as an invalid channel.
      return {
        presence: UNKNOWN_PRESENCE, channels: [], requires: [...requires], cached: false,
        error: {
          code: 'BOT_OFFLINE',
          message: 'Murabot did not answer. It may be restarting — the channel list is unavailable until it responds.',
        },
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        presence: UNKNOWN_PRESENCE, channels: [], requires: [...requires], cached: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Murabot refused the dashboard\'s request. The shared connection secret does not match.',
        },
      };
    }
    if (res.status === 429) {
      return {
        presence: UNKNOWN_PRESENCE, channels: [], requires: [...requires], cached: false,
        error: {
          code: 'DISCORD_RATE_LIMITED',
          message: 'Discord is temporarily rate limiting requests. Retry shortly.',
        },
        retryAfterMs: retryAfterMs(res),
      };
    }

    const payload = (await res.json().catch(() => null)) as
      | {
        ok?: boolean; state?: string; channels?: ChannelOption[]; requires?: string[];
        bot?: Partial<BotPresence>;
        code?: string;
        error?: { code?: string; message?: string } | string | null;
      }
      | null;

    // Murabot reports a bot-state failure as `ok: true` plus an `error` object
    // and a non-2xx status: it did answer, and the answer is "I am not in that
    // server" / "I am not connected". Reading only `ok` would have turned those
    // into an empty channel list — i.e. a deleted channel. Both shapes are read.
    const detail = payload?.error;
    const failureCode = (typeof detail === 'object' && detail ? detail.code : null)
      ?? (typeof payload?.code === 'string' ? payload.code : null);
    const failureMessage = (typeof detail === 'object' && detail ? detail.message : null)
      ?? (typeof detail === 'string' ? detail : null);

    if (!payload || payload.ok !== true || (!res.ok && failureCode)) {
      const code = (failureCode ?? (res.status >= 500 ? 'INTERNAL_ERROR' : 'DISCORD_API_ERROR')) as BotCheckCode;
      return {
        presence: UNKNOWN_PRESENCE, channels: [], requires: [...requires], cached: false,
        error: {
          code,
          message: failureMessage
            ?? (res.status >= 500
              ? 'Murabot reported an internal error while reading this server.'
              : 'Discord did not return the channel list.'),
        },
      };
    }

    const presence: BotPresence = {
      online: payload.bot?.online ?? false,
      installed: payload.bot?.installed ?? false,
      guildAccessible: payload.bot?.guildAccessible ?? false,
      botUserId: payload.bot?.botUserId ?? null,
      botUsername: payload.bot?.botUsername ?? null,
      gatewayState: payload.state ?? null,
      heartbeatAgeSeconds: payload.bot?.heartbeatAgeSeconds ?? null,
      latencyMs: payload.bot?.latencyMs ?? null,
    };
    const channels = Array.isArray(payload.channels) ? payload.channels : [];
    // A stored channel that is no longer offered was deleted or lost access:
    // report that, do not hide it.
    const value: BotChannelResult = {
      presence,
      channels,
      requires: payload.requires ?? [...requires],
      error: null,
      cached: false,
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  })().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/** Drop the cached presence so the next read asks Murabot again. */
export function invalidateBotPresence(guildId: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${guildId}|`)) cache.delete(key);
  }
}

/** Live bot status, for the System Status screen. */
export async function botStatus(): Promise<{
  state: string | null; online: boolean; latencyMs: number | null; uptimeSeconds: number | null;
  heartbeatAgeSeconds: number | null; reconnectCount: number | null; guildIds: string[];
  botUserId: string | null; botUsername: string | null; error: { code: BotCheckCode; message: string } | null;
}> {
  const empty = {
    state: null, online: false, latencyMs: null, uptimeSeconds: null, heartbeatAgeSeconds: null,
    reconnectCount: null, guildIds: [] as string[], botUserId: null, botUsername: null,
  };

  if (!bridgeSecret()) {
    return { ...empty, error: { code: 'BRIDGE_NOT_CONFIGURED', message: 'The dashboard is not connected to Murabot.' } };
  }
  try {
    const res = await fetch(`${BOT_BASE}/bot/status`, {
      headers: { Authorization: `Bearer ${bridgeSecret()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        ...empty,
        error: {
          code: res.status === 401 ? 'AUTHENTICATION_ERROR' : res.status >= 500 ? 'INTERNAL_ERROR' : 'DISCORD_API_ERROR',
          message: res.status === 401
            ? 'Murabot refused the dashboard\'s request.'
            : 'Murabot did not return its connection state.',
        },
      };
    }
    const data = (await res.json()) as Record<string, unknown>;
    return {
      state: typeof data.state === 'string' ? data.state : null,
      online: data.ready === true,
      latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : null,
      uptimeSeconds: typeof data.uptimeSeconds === 'number' ? data.uptimeSeconds : null,
      heartbeatAgeSeconds: typeof data.heartbeatAgeSeconds === 'number' ? data.heartbeatAgeSeconds : null,
      reconnectCount: typeof data.reconnectCount === 'number' ? data.reconnectCount : null,
      guildIds: Array.isArray(data.guildIds) ? (data.guildIds as string[]) : [],
      botUserId: typeof data.botUserId === 'string' ? data.botUserId : null,
      botUsername: typeof data.botUsername === 'string' ? data.botUsername : null,
      error: null,
    };
  } catch {
    return { ...empty, error: { code: 'BOT_OFFLINE', message: 'Murabot did not answer.' } };
  }
}
