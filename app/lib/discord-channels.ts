import { ECONOMY_ERROR_CODES, type EconomyFieldError } from './economy-schema';

// ── Live Discord channel verification ───────────────────────────────────
//
// A stored channel id is a claim, not a fact. It was true when someone picked
// it; the channel may since have been deleted, the bot may have lost access,
// or the bot's roles may have changed. Nothing here trusts the stored value.
//
// Every failure is distinguishable, because these have genuinely different
// fixes and collapsing them into "invalid channel" is what made the original
// error useless:
//
//   BOT_NOT_IN_GUILD       → invite the bot
//   CHANNEL_NOT_FOUND      → pick another channel
//   CHANNEL_ACCESS_DENIED  → the bot cannot see the channel at all
//   MISSING_BOT_PERMISSION → the exact permission that is missing
//   DISCORD_RATE_LIMITED   → transient; retry, do NOT report as invalid
//   DISCORD_UNAVAILABLE    → transient; retry
//
// Discord calls are cached briefly and de-duplicated, because validating N
// settings must not mean N round trips to Discord — that is how the page used
// to earn a 429 on every save.

const DISCORD_API = 'https://discord.com/api/v10';

const ADMINISTRATOR = BigInt(0x8);
const PERM_BITS = {
  view: { bit: BigInt(1024), label: 'View Channel' },
  send: { bit: BigInt(2048), label: 'Send Messages' },
  embed: { bit: BigInt(4096), label: 'Embed Links' },
} as const;

export type RequiredPermission = keyof typeof PERM_BITS;

/** Channel types that can receive a message with embeds. */
const TEXT_CAPABLE = new Set([0, 5, 10, 11, 12]);

type Role = { id: string; name: string; permissions: string; position: number };
type Overwrite = { id: string; type: number; allow: string; deny: string };
type Channel = {
  id: string; name: string; type: number; guild_id?: string;
  parent_id?: string | null; permission_overwrites?: Overwrite[];
};

interface GuildSnapshot {
  at: number;
  channels: Map<string, Channel>;
  roles: Map<string, Role>;
  botRoleIds: string[];
  botIsAdmin: boolean;
  channelOrder: string[];
}

const SNAPSHOT_TTL_MS = 20_000;
const inflight = new Map<string, Promise<GuildSnapshot>>();

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN?.trim() || process.env.DISCORD_TOKEN?.trim() || null;
}

class DiscordFailure extends Error {
  constructor(
    readonly code: typeof ECONOMY_ERROR_CODES.DISCORD_RATE_LIMITED | typeof ECONOMY_ERROR_CODES.DISCORD_UNAVAILABLE | typeof ECONOMY_ERROR_CODES.BOT_NOT_IN_GUILD,
    message: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'DiscordFailure';
  }
}

async function botGet(path: string, token: string): Promise<{ ok: boolean; status: number; data: unknown; retryAfter?: number }> {
  try {
    const resp = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get('retry-after') ?? '1');
      return { ok: false, status: 429, data: null, retryAfter: Number.isFinite(retryAfter) ? retryAfter : 1 };
    }
    if (!resp.ok) return { ok: false, status: resp.status, data: null };
    return { ok: true, status: resp.status, data: await resp.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/**
 * One cached, single-flight snapshot of everything needed to judge a channel:
 * the guild's channels, its roles, and the bot's own role set.
 *
 * Concurrent validations for the same guild share ONE fetch, so validating ten
 * settings performs the same number of Discord calls as validating one.
 */
export async function guildSnapshot(guildId: string): Promise<GuildSnapshot> {
  const cached = snapshotCache.get(guildId);
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached;

  const running = inflight.get(guildId);
  if (running) return running;

  const promise = (async (): Promise<GuildSnapshot> => {
    const token = botToken();
    if (!token) {
      throw new DiscordFailure(ECONOMY_ERROR_CODES.DISCORD_UNAVAILABLE, 'Bot credential is not configured.');
    }
    // A real 404 is the only proof the bot is not in the guild. A 429, a 5xx
    // or a timeout is an outage and must never be reported as absence.
    const me = await botGet(`/guilds/${guildId}/members/@me`, token);
    if (!me.ok) {
      if (me.status === 404) {
        throw new DiscordFailure(ECONOMY_ERROR_CODES.BOT_NOT_IN_GUILD, 'Murabot is not a member of this server.');
      }
      if (me.status === 429) {
        throw new DiscordFailure(ECONOMY_ERROR_CODES.DISCORD_RATE_LIMITED, 'Discord rate-limited the request.', me.retryAfter);
      }
      throw new DiscordFailure(ECONOMY_ERROR_CODES.DISCORD_UNAVAILABLE, 'Discord did not answer the bot check.');
    }

    const [channelsRes, rolesRes] = await Promise.all([
      botGet(`/guilds/${guildId}/channels`, token),
      botGet(`/guilds/${guildId}/roles`, token),
    ]);
    if (!channelsRes.ok) {
      if (channelsRes.status === 429) {
        throw new DiscordFailure(ECONOMY_ERROR_CODES.DISCORD_RATE_LIMITED, 'Discord rate-limited the request.', channelsRes.retryAfter);
      }
      throw new DiscordFailure(ECONOMY_ERROR_CODES.DISCORD_UNAVAILABLE, 'Could not read this server’s channels.');
    }
    const roles = (Array.isArray(rolesRes.data) ? rolesRes.data : []) as Role[];
    const channels = (Array.isArray(channelsRes.data) ? channelsRes.data : []) as Channel[];
    const botMember = me.data as { roles?: string[] };
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const botRoleIds = Array.isArray(botMember?.roles) ? botMember.roles : [];
    let botIsAdmin = false;
    for (const rid of botRoleIds) {
      try {
        if ((BigInt(roleById.get(rid)?.permissions ?? '0') & ADMINISTRATOR) !== BigInt(0)) botIsAdmin = true;
      } catch { /* an unparsable permission string grants nothing */ }
    }
    const snapshot: GuildSnapshot = {
      at: Date.now(),
      channels: new Map(channels.map((c) => [c.id, c])),
      roles: roleById,
      botRoleIds,
      botIsAdmin,
      channelOrder: channels.map((c) => c.id),
    };
    snapshotCache.set(guildId, snapshot);
    return snapshot;
  })().finally(() => {
    if (inflight.get(guildId) === promise) inflight.delete(guildId);
  });

  inflight.set(guildId, promise);
  return promise;
}

const snapshotCache = new Map<string, GuildSnapshot>();

/** Drop the cached snapshot so the next check reads live state. */
export function invalidateGuildSnapshot(guildId: string): void {
  snapshotCache.delete(guildId);
}

/**
 * Effective permissions of the bot in one channel: base role grants, then
 * @everyone / role / member overwrites, with deny clearing and allow setting.
 */
function effectivePermissions(snapshot: GuildSnapshot, channel: Channel, guildId: string): bigint {
  if (snapshot.botIsAdmin) return ADMINISTRATOR;
  let base = BigInt(0);
  for (const rid of snapshot.botRoleIds) {
    try { base |= BigInt(snapshot.roles.get(rid)?.permissions ?? '0'); } catch { /* ignore */ }
  }
  try { base |= BigInt(snapshot.roles.get(guildId)?.permissions ?? '0'); } catch { /* @everyone */ }

  const apply = (current: bigint, allow: string, deny: string): bigint => {
    try { return (current & ~BigInt(deny)) | BigInt(allow); } catch { return current; }
  };
  const ows = channel.permission_overwrites ?? [];
  let perms = base;
  for (const o of ows.filter((o) => o.type === 0 && o.id === guildId)) {
    perms = apply(perms, o.allow, o.deny);
  }
  let allow = BigInt(0);
  let deny = BigInt(0);
  for (const o of ows.filter((o) => o.type === 0 && snapshot.botRoleIds.includes(o.id))) {
    try { allow |= BigInt(o.allow); deny |= BigInt(o.deny); } catch { /* ignore */ }
  }
  perms = apply(perms, allow.toString(), deny.toString());
  for (const o of ows.filter((o) => o.type === 1 && o.id === snapshot.botRoleIds[0])) {
    perms = apply(perms, o.allow, o.deny);
  }
  return perms;
}

export interface ChannelVerdict {
  valid: boolean;
  channelName?: string;
  channelType?: number;
  categoryName?: string;
  /** The first requirement that failed, when invalid. */
  code?: EconomyFieldError['code'];
  message?: string;
  missingPermission?: string;
  /** Per-requirement results, for a detailed UI checklist. */
  checks: Array<{ label: string; ok: boolean; permission?: string }>;
}

/**
 * Verify one channel against the requirements of a setting.
 *
 * `requires` names the permissions that must hold for the feature to work, so
 * a log channel demands View + Send + Embed and the failure says exactly
 * which one is missing.
 */
export function judgeChannel(
  snapshot: GuildSnapshot,
  guildId: string,
  channelId: string,
  requires: readonly RequiredPermission[],
): ChannelVerdict {
  const checks: ChannelVerdict['checks'] = [];
  const channel = snapshot.channels.get(channelId);

  if (!channel) {
    return {
      valid: false,
      code: ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND,
      message: 'This channel no longer exists on this server. It may have been deleted — please select another channel.',
      checks: [{ label: 'Channel still exists', ok: false }],
    };
  }
  if (channel.guild_id && channel.guild_id !== guildId) {
    return {
      valid: false, channelName: channel.name, channelType: channel.type,
      code: ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND,
      message: 'That channel belongs to a different server. Please select a channel on this server.',
      checks: [{ label: 'Channel belongs to this server', ok: false }],
    };
  }
  checks.push({ label: 'Channel exists', ok: true });

  if (!TEXT_CAPABLE.has(channel.type)) {
    return {
      valid: false, channelName: channel.name, channelType: channel.type,
      code: ECONOMY_ERROR_CODES.CHANNEL_NOT_TEXT_CAPABLE,
      message: `"${channel.name}" is not a text channel and cannot receive messages. Select a text channel.`,
      checks: [...checks, { label: 'Channel can receive messages', ok: false }],
    };
  }
  checks.push({ label: 'Channel can receive messages', ok: true });

  const perms = effectivePermissions(snapshot, channel, guildId);
  let missing: string | undefined;
  let missingLabel: string | undefined;
  for (const req of requires) {
    const spec = PERM_BITS[req];
    // Administrator grants everything; the base is already masked to
    // ADMINISTRATOR above, so any check passes in that case.
    const ok = (perms & spec.bit) !== BigInt(0);
    checks.push({ label: `Murabot can: ${spec.label}`, ok, permission: req });
    if (!ok && !missing) {
      missing = req;
      missingLabel = spec.label;
    }
  }
  if (missing) {
    return {
      valid: false, channelName: channel.name, channelType: channel.type,
      code: ECONOMY_ERROR_CODES.MISSING_BOT_PERMISSION,
      missingPermission: missingLabel,
      message: `Murabot cannot use "${channel.name}" — it is missing the ${missingLabel} permission. Fix the channel's permission overwrites in Discord, then save again.`,
      checks,
    };
  }

  const parentId = channel.parent_id ?? null;
  const parent = parentId ? snapshot.channels.get(parentId) : undefined;
  return {
    valid: true,
    channelName: channel.name,
    channelType: channel.type,
    categoryName: parent?.name,
    checks,
  };
}

/**
 * Ask Discord about a channel that is missing from the guild's channel list.
 *
 * This is the difference between "deleted" and "hidden". A channel the bot
 * cannot VIEW_CHANNEL is simply absent from `/guilds/{id}/channels`, so the
 * list alone cannot tell a deleted channel from an inaccessible one — and those
 * have completely different fixes. A direct fetch can:
 *
 *   404 → the channel is gone (or was never here) → CHANNEL_NOT_FOUND
 *   403 → it exists and the bot is not allowed in → CHANNEL_ACCESS_DENIED
 *   200 → it exists but the guild list withheld it → CHANNEL_ACCESS_DENIED
 *
 * Only reached on the failure path, so the happy path still costs one snapshot.
 */
async function probeHiddenChannel(
  guildId: string,
  channelId: string,
): Promise<{ code: EconomyFieldError['code']; message: string } | null> {
  const token = botToken();
  if (!token) return null;
  const res = await botGet(`/channels/${channelId}`, token);
  if (res.status === 404) {
    return {
      code: ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND,
      message: 'This channel no longer exists on this server. It was deleted, or the id belongs to another server — please select another channel.',
    };
  }
  if (res.status === 403) {
    return {
      code: ECONOMY_ERROR_CODES.CHANNEL_ACCESS_DENIED,
      message: 'Murabot cannot view this channel, so it cannot be used for economy logs. Allow the bot to View Channel, or select another channel.',
    };
  }
  if (res.ok) {
    const data = (res.data ?? {}) as { guild_id?: string; name?: string; type?: number };
    if (data.guild_id && data.guild_id !== guildId) {
      return {
        code: ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND,
        message: 'That channel belongs to a different server. Please select a channel on this server.',
      };
    }
    return {
      code: ECONOMY_ERROR_CODES.CHANNEL_ACCESS_DENIED,
      message: `Murabot cannot see "${data.name ?? 'that channel'}" on this server, so it cannot be used for economy logs. Allow the bot to View Channel, or select another channel.`,
    };
  }
  // 429 / 5xx / timeout: we learned nothing, so claim nothing.
  return null;
}

/**
 * Validate one setting's channel, converting a Discord transport failure into
 * a RETRYABLE error rather than a verdict about the setting. A rate limit must
 * never be reported as "this channel is invalid".
 */
export async function validateChannelSetting(
  guildId: string,
  fieldKey: string,
  label: string,
  channelId: string,
  requires: readonly RequiredPermission[],
): Promise<EconomyFieldError | null> {
  let snapshot: GuildSnapshot;
  try {
    snapshot = await guildSnapshot(guildId);
  } catch (err) {
    const failure = err as DiscordFailure;
    return {
      field: fieldKey,
      label,
      code: (failure.code ?? ECONOMY_ERROR_CODES.DISCORD_UNAVAILABLE) as EconomyFieldError['code'],
      message: `${label} could not be verified right now: ${failure.message} Nothing was saved — try again in a moment.`,
      retryable: true,
    };
  }
  const verdict = judgeChannel(snapshot, guildId, channelId, requires);
  if (verdict.valid) return null;

  let code = verdict.code ?? ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND;
  let message = verdict.message ?? `${label} is not usable.`;
  if (code === ECONOMY_ERROR_CODES.CHANNEL_NOT_FOUND) {
    // "Not in the list" is ambiguous on its own; one direct lookup settles
    // whether the channel was deleted or merely hidden from the bot.
    try {
      const probe = await probeHiddenChannel(guildId, channelId);
      if (probe) {
        code = probe.code;
        message = probe.message;
      }
    } catch { /* a failed probe must not mask the original verdict */ }
  }

  return {
    field: fieldKey,
    label,
    code,
    message,
    current: verdict.channelName ? `"${verdict.channelName}"` : '(unknown channel)',
    expected: 'A text channel on this server that Murabot can read, send and embed in',
    missingPermission: verdict.missingPermission,
  };
}

/** Every selectable channel for the dropdown, annotated with its verdict. */
export function listSelectableChannels(
  snapshot: GuildSnapshot,
  guildId: string,
  requires: readonly RequiredPermission[],
): Array<{
  id: string; name: string; type: number; categoryName: string | null;
  usable: boolean; reason: string | null;
}> {
  const categories = new Map(
    [...snapshot.channels.values()].filter((c) => c.type === 4).map((c) => [c.id, c.name]),
  );
  const out: Array<{ id: string; name: string; type: number; categoryName: string | null; usable: boolean; reason: string | null }> = [];
  for (const id of snapshot.channelOrder) {
    const channel = snapshot.channels.get(id);
    if (!channel || !TEXT_CAPABLE.has(channel.type)) continue;
    const verdict = judgeChannel(snapshot, guildId, id, requires);
    out.push({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      categoryName: (channel.parent_id && categories.get(channel.parent_id)) || null,
      usable: verdict.valid,
      reason: verdict.valid ? null : verdict.message ?? 'Not usable by Murabot',
    });
  }
  return out;
}
