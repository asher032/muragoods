// ── Ask Murabot whether a channel/role is actually usable ────────────────
//
// The dashboard used to answer this itself, by calling Discord's REST API
// directly with its own copy of the bot token. That was a second Discord
// client for one bot, in a second deployment, and it meant every selector
// blocked on two to four round-trips to discord.com from a serverless
// function. When those did not come back the panel said "Discord did not
// respond in time" about a channel that was perfectly fine — and the giveaway
// save then refused to write, over a check that was never necessary.
//
// Murabot already holds the answer in memory: the gateway keeps the guild, its
// channels, its roles and their permission overwrites. So this asks the
// process that owns that state, over the existing bridge, and does no Discord
// I/O of its own. That removes the timeout, removes the second client, and
// removes the second credential.
//
// Three properties this module is responsible for:
//
//   1. A code always means one thing. `VERIFIED` is the only success.
//      `INVALID_SELECTION` means Discord was asked and said no. Everything else
//      means "we could not find out" and is retryable. A timeout is never
//      laundered into an invalid selection, because that would mark a working
//      channel as broken and invite someone to "fix" it.
//   2. Concurrent identical checks collapse into one call. Five components
//      asking about the same channel must not produce five verifications.
//   3. The cache is for saving Discord work, never for skipping the check that
//      guards a write. `verifyResource` takes `bypassCache`, and the save path
//      always sets it.

const BOT_BASE =
  process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

export const dynamic = 'force-dynamic';

/** The closed set of outcomes. Nothing outside this list reaches the UI. */
export type VerifyCode =
  | 'VERIFIED'
  | 'INVALID_SELECTION'
  | 'PERMISSION_DENIED'
  | 'BOT_NOT_IN_GUILD'
  | 'DISCORD_RATE_LIMITED'
  | 'DISCORD_TIMEOUT'
  | 'DISCORD_SERVICE_UNAVAILABLE'
  | 'DISCORD_API_ERROR'
  | 'BRIDGE_NOT_CONFIGURED'
  | 'AUTHENTICATION_ERROR';

export type VerifyOutcome = 'verified' | 'invalid' | 'unverified';

export interface VerifyResult {
  ok: boolean;
  /** Did the check actually run and return a verdict? */
  outcome: VerifyOutcome;
  code: VerifyCode;
  /** True only for `VERIFIED`. */
  valid: boolean;
  retryable: boolean;
  message: string;
  objectName: string | null;
  missingPermissions: Array<{ key: string; label: string }>;
  checks: Array<{ key: string; label: string; ok: boolean }>;
  requestId: string;
  /** How the answer was obtained, for the log line. */
  source: 'bridge' | 'cache';
  durationMs: number;
}

const TTL_MS = 30_000;

type CacheEntry = { at: number; result: VerifyResult };
const cache = new Map<string, CacheEntry>();
/** In-flight verifications, so concurrent callers share one call. */
const inflight = new Map<string, Promise<VerifyResult>>();

function bridgeSecret(): string | null {
  const s = (process.env.DISCORD_BRIDGE_SECRET || '').trim();
  return s || null;
}

function key(guildId: string, kind: string, id: string, require: string[]): string {
  return `${guildId}:${kind}:${id}:${[...require].sort().join(',')}`;
}

function result(partial: Partial<VerifyResult> & Pick<VerifyResult, 'code' | 'outcome' | 'retryable'>): VerifyResult {
  return {
    ok: false,
    valid: false,
    message: '',
    objectName: null,
    missingPermissions: [],
    checks: [],
    requestId: `rv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    source: 'bridge',
    durationMs: 0,
    ...partial,
  };
}

/**
 * Map an HTTP status from the bot onto the closed code set.
 *
 * The distinction that matters: 404 from a healthy bot is a real answer about
 * the object, while 502/503/timeout mean the question was never answered. A
 * transport failure is never reported as an invalid selection.
 */
function classify(status: number, payload: Record<string, unknown> | null): VerifyResult {
  const code = typeof payload?.code === 'string' ? payload.code as VerifyCode : null;
  const message = typeof payload?.message === 'string' ? payload.message : '';

  if (status === 200) {
    return result({
      ok: true, outcome: 'verified', valid: true, retryable: false, code: 'VERIFIED',
      objectName: (payload?.objectName as string) ?? null,
      missingPermissions: (payload?.missingPermissions as VerifyResult['missingPermissions']) ?? [],
      checks: (payload?.checks as VerifyResult['checks']) ?? [],
      message,
    });
  }
  if (status === 404) {
    return result({
      ok: true, outcome: 'verified', valid: false, retryable: false,
      code: code === 'BOT_NOT_IN_GUILD' ? 'BOT_NOT_IN_GUILD' : 'INVALID_SELECTION',
      message: message || 'That selection no longer exists on this server.',
    });
  }
  if (status === 403) {
    return result({
      ok: true, outcome: 'verified', valid: false, retryable: false,
      code: 'PERMISSION_DENIED',
      missingPermissions: (payload?.missingPermissions as VerifyResult['missingPermissions']) ?? [],
      message: message || 'Murabot cannot use that selection.',
    });
  }
  if (status === 429) {
    return result({
      outcome: 'unverified', code: 'DISCORD_RATE_LIMITED', retryable: true,
      message: 'Discord is rate limiting verification. Retry shortly — '
        + 'nothing about this selection has been checked or changed.',
    });
  }
  if (status === 401) {
    return result({
      outcome: 'unverified', code: 'AUTHENTICATION_ERROR', retryable: true,
      message: 'The dashboard could not authenticate to Murabot. '
        + 'Nothing has been checked or changed.',
    });
  }
  // 5xx, and anything else: the question was not answered.
  return result({
    outcome: 'unverified',
    code: code && code !== 'VERIFIED' && code !== 'INVALID_SELECTION' && code !== 'PERMISSION_DENIED'
      ? code : 'DISCORD_SERVICE_UNAVAILABLE',
    retryable: true,
    message: message
      || 'Murabot is currently unavailable. This selection has NOT been checked or changed.',
  });
}

async function callBot(
  guildId: string, kind: string, id: string, require: string[],
  timeoutMs: number,
): Promise<VerifyResult> {
  const started = Date.now();
  const secret = bridgeSecret();
  if (!secret) {
    return result({
      outcome: 'unverified', code: 'BRIDGE_NOT_CONFIGURED', retryable: true,
      message: 'The dashboard is not connected to Murabot, so this selection '
        + 'has NOT been checked or changed.',
      durationMs: 0,
    });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  let timedOut = false;
  try {
    res = await fetch(`${BOT_BASE}/resources/verify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId, kind, id, require }),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err) {
    timedOut = (err as { name?: string })?.name === 'AbortError'
      || (err as Error)?.name === 'TimeoutError';
    return result({
      outcome: 'unverified',
      code: timedOut ? 'DISCORD_TIMEOUT' : 'DISCORD_SERVICE_UNAVAILABLE',
      retryable: true,
      message: timedOut
        ? 'Murabot did not respond before the request timed out. This selection '
          + 'has NOT been checked and has NOT been changed. Retry verification.'
        : 'Murabot could not be reached. This selection has NOT been checked '
          + 'and has NOT been changed.',
      durationMs: Date.now() - started,
    });
  } finally {
    clearTimeout(timer);
  }
  const bodyText = await res.text().catch(() => '');
  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    payload = null;
  }
  const out = classify(res.status, payload);
  out.durationMs = Date.now() - started;
  // Credential-free: a request id, the outcome, the status and the latency.
  // No token, no bridge secret, no selected-object id.
  console.log(
    `[verify] ${out.requestId} guild=${guildId} kind=${kind} code=${out.code} `
    + `outcome=${out.outcome} status=${res.status} duration=${out.durationMs}ms`,
  );
  return out;
}

/**
 * Is this channel/role usable by Murabot?
 *
 * `bypassCache` must be true on any path that is about to WRITE. A cached
 * answer is fine for a selector the operator is still editing and fatal for a
 * save that would otherwise persist a value nobody re-checked.
 */
export async function verifyResource(
  guildId: string,
  kind: 'channel' | 'category' | 'role' | 'member',
  id: string,
  require: string[] = [],
  opts: { bypassCache?: boolean; timeoutMs?: number } = {},
): Promise<VerifyResult> {
  if (!/^\d{5,25}$/.test(guildId) || !/^\d{5,25}$/.test(id)) {
    return result({
      outcome: 'unverified', code: 'INVALID_SELECTION' as VerifyCode, retryable: false,
      message: 'A valid guild id and object id are required.',
    });
  }
  // An empty selection is not a failed selection: there is nothing to verify.
  if (id === '0' || id === '') {
    return result({
      ok: true, outcome: 'verified', valid: true, retryable: false, code: 'VERIFIED',
      message: 'No selection.',
    });
  }

  const k = key(guildId, kind, id, require);
  if (!opts.bypassCache) {
    const hit = cache.get(k);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return { ...hit.result, source: 'cache' };
    }
    const running = inflight.get(k);
    if (running) return running;
  }

  const promise = callBot(guildId, kind, id, require, opts.timeoutMs ?? 6000)
    .then((r) => {
      // Only a real verdict is cached. Caching a timeout would keep reporting
      // "unverified" for 30s after Murabot recovered, and caching a rejection
      // would let a fixed permission look broken.
      if (r.outcome === 'verified') cache.set(k, { at: Date.now(), result: r });
      return r;
    })
    .finally(() => {
      if (inflight.get(k) === promise) inflight.delete(k);
    });

  if (!opts.bypassCache) inflight.set(k, promise);
  return promise;
}

/** Drop a guild's cached verifications. Called after a successful save. */
export function invalidateGuild(guildId: string): void {
  for (const k of [...cache.keys()]) {
    if (k.startsWith(`${guildId}:`)) cache.delete(k);
  }
}
