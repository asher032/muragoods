import { discordConfigCollection } from '@/app/lib/discord-config';

// ─────────────────────────────────────────────────────────────────────────
// ONE canonical configuration for Murabot.
//
// The prefix lived in four places by accident: a dashboard-prefix write, a
// site `guild_config` document, a bot-side cache, and a "mg!prefix !" command
// typed in Discord. Two of those could be edited independently, so the field a
// server admin saved in the dashboard was not always the field the bot read —
// which surfaced as "Command prefix → Request timed out" and, worse, as saves
// that quietly did nothing.
//
// The contract, stated once so every caller obeys it:
//
//   owner      Murabot guild configuration
//   stored     this site's guild_config document (the canonical store)
//   read by    Murabot's command handler
//   edited by  the Discord dashboard AND the Muragoods Admin Panel
//   verified by Murabot, over the bridge, AFTER the canonical write
//
// There is no dashboardPrefix / adminPrefix / botPrefix. There is one
// `prefix` field, one writer, and one honest answer about whether the bot has
// it yet.
// ─────────────────────────────────────────────────────────────────────────

export const DEFAULT_PREFIX = 'mg!';
export const PREFIX_MAX_LENGTH = 10;
export const PREFIX_PATTERN = /^[a-zA-Z0-9_!@#$%^&*()-=.]+$/;

/**
 * How far a canonical write actually got.
 *
 * `applied`  Murabot confirmed it — the prefix is live in Discord now.
 * `pending`  the canonical store has it; Murabot has not confirmed. This is
 *            NOT a failure and NOT a success, and the UI must say exactly
 *            that. Murabot re-reads on its own TTL, so it usually resolves.
 * `failed`   the canonical write itself did not happen. Nothing changed.
 */
export type PropagationState = 'applied' | 'pending' | 'failed';

export interface ConfigWriteResult {
  ok: boolean;
  /** Value now stored canonically, or null when the write failed. */
  value: string | null;
  propagation: PropagationState;
  /** Seconds until Murabot's own TTL re-read will pick it up. */
  retryWithinSec?: number;
  /** Safe, user-facing reason. Never an exception or a secret. */
  message?: string;
}

export function validatePrefix(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const prefix = String(raw ?? '').trim();
  if (!prefix) return { ok: false, error: 'Prefix cannot be empty.' };
  if (prefix.length > PREFIX_MAX_LENGTH) {
    return { ok: false, error: `Prefix must be ${PREFIX_MAX_LENGTH} characters or fewer.` };
  }
  if (!PREFIX_PATTERN.test(prefix)) {
    return {
      ok: false,
      error: 'Prefix can only use letters, numbers and !@#$%^&*()-=. _',
    };
  }
  return { ok: true, value: prefix };
}

/** Read the canonical prefix for a guild. */
export async function readGuildPrefix(guildId: string): Promise<string> {
  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId }, { projection: { prefix: 1 } });
  const stored = doc?.prefix;
  return typeof stored === 'string' && stored ? stored : DEFAULT_PREFIX;
}

/** Read the canonical guild configuration document (owner/admin surfaces). */
export async function readGuildConfig(
  guildId: string,
): Promise<Record<string, unknown> | null> {
  const collection = await discordConfigCollection();
  const doc = await collection.findOne({ guildId });
  return doc ? ({ ...doc } as Record<string, unknown>) : null;
}

/** Mutate the canonical guild configuration (admin/system paths). */
export async function writeGuildConfigFields(
  guildId: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!/^\d{5,25}$/.test(guildId)) return { ok: false, error: 'Valid guildId required' };
  const collection = await discordConfigCollection();
  await collection.updateOne(
    { guildId },
    { $set: { ...fields, updatedAt: new Date() } },
    { upsert: true },
  );
  return { ok: true };
}

/**
 * Tell Murabot a canonical value changed and find out whether it took.
 *
 * Bounded on purpose. The old code waited up to 5s inside a request whose
 * client gave up after 12s alongside two other network calls — so a slow but
 * successful save was reported to the operator as "Request timed out" while
 * the write had in fact landed. Two changes: this call is short and
 * best-effort, and it REPORTS rather than hides the outcome.
 */
export async function pushGuildConfigToBot(
  guildId: string,
  fields: Record<string, unknown>,
  path = '/config/refresh',
  timeoutMs = 2500,
): Promise<{ notified: boolean; reason?: string }> {
  const secret = process.env.DISCORD_BRIDGE_SECRET;
  if (!secret) return { notified: false, reason: 'NOT_CONFIGURED' };
  const base = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '')
    || 'https://murastream-bot-pf11.onrender.com';
  try {
    const resp = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ guildId, ...fields }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (resp.ok) return { notified: true };
    return { notified: false, reason: `BOT_HTTP_${resp.status}` };
  } catch {
    return { notified: false, reason: 'BOT_UNREACHABLE' };
  }
}

/**
 * The one canonical prefix save, used by BOTH the Discord dashboard and the
 * Muragoods Admin Panel so the two can never drift into separate values.
 *
 * Failure semantics are the point of this function:
 *   - canonical write fails  → ok:false, and the caller must say nothing was
 *     changed;
 *   - canonical write lands, bot confirms → 'applied';
 *   - canonical write lands, bot silent  → 'pending', which the UI renders as
 *     "saved, Murabot has not confirmed yet" and NEVER as a plain success.
 */
export async function saveGuildPrefix(guildId: string, prefix: string): Promise<ConfigWriteResult> {
  const valid = validatePrefix(prefix);
  if (!valid.ok) return { ok: false, value: null, propagation: 'failed', message: valid.error };
  if (!/^\d{5,25}$/.test(guildId)) {
    return { ok: false, value: null, propagation: 'failed', message: 'Valid guildId required' };
  }

  let written: boolean;
  try {
    const collection = await discordConfigCollection();
    const res = await collection.updateOne(
      { guildId },
      { $set: { prefix: valid.value, updatedAt: new Date() } },
      { upsert: true },
    );
    written = Boolean(res.acknowledged);
  } catch {
    return {
      ok: false,
      value: null,
      propagation: 'failed',
      message: 'The prefix could not be saved. Your existing prefix was not changed.',
    };
  }
  if (!written) {
    return {
      ok: false,
      value: null,
      propagation: 'failed',
      message: 'The prefix could not be saved. Your existing prefix was not changed.',
    };
  }

  const push = await pushGuildConfigToBot(guildId, { prefix: valid.value }, '/prefix/refresh');
  if (push.notified) {
    return { ok: true, value: valid.value, propagation: 'applied' };
  }
  return {
    ok: true,
    value: valid.value,
    propagation: 'pending',
    retryWithinSec: 60,
    message: push.reason === 'NOT_CONFIGURED'
      ? 'Saved. Murabot has not been notified (no bridge is configured on this deployment), '
        + 'so it will pick the value up on its next reload.'
      : 'Saved, but Murabot did not confirm in time. It is not applied in Discord yet — '
        + 'it will be picked up automatically within about a minute.',
  };
}

/** Ask the bot what it actually holds — the honest read-back. */
export async function verifyGuildPrefixWithBot(
  guildId: string,
  timeoutMs = 2500,
): Promise<{ confirmed: boolean; prefix: string | null; reason?: string }> {
  const secret = process.env.DISCORD_BRIDGE_SECRET;
  if (!secret) return { confirmed: false, prefix: null, reason: 'NOT_CONFIGURED' };
  const base = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '')
    || 'https://murastream-bot-pf11.onrender.com';
  try {
    const resp = await fetch(`${base}/prefix/refresh?guildId=${encodeURIComponent(guildId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return { confirmed: false, prefix: null, reason: `BOT_HTTP_${resp.status}` };
    const body = (await resp.json().catch(() => null)) as { prefix?: string } | null;
    return { confirmed: true, prefix: typeof body?.prefix === 'string' ? body.prefix : null };
  } catch {
    return { confirmed: false, prefix: null, reason: 'BOT_UNREACHABLE' };
  }
}
