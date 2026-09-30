import { sessionToken, requireSession } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';
import { verifyBotInGuild, botToken } from '@/app/lib/discord-bot';
import { apiFail, logApi } from '@/app/lib/dashboard-response';
import { SERVER_CARD_BACKGROUNDS, SERVER_CARD_DEFAULT } from '@/app/lib/server-card-backgrounds';
import { ECONOMY_ERROR_CODES, ECONOMY_FIELDS, type EconomyFieldError } from '@/app/lib/economy-schema';
import { mergeEconomySection, validateEconomyDraft } from '@/app/lib/economy-validate';
import { invalidateBotPresence, validateChannelSetting } from '@/app/lib/discord-channels';
import { isMurabotOwner, logOwnerCheck, ownerConfigurationProblem } from '@/app/lib/murabot-owner';
import { pushLevelConfigToBot } from '@/app/lib/level-card-probe';
import { verifyResource, invalidateGuild } from '@/app/lib/resource-verifier';

const SERVER_CARD_IDS = new Set(SERVER_CARD_BACKGROUNDS.map((b) => b.id));

// Dashboard config API — authorization model:
//   1. The caller presents a Discord access token (from the OAuth flow).
//   2. We fetch their guilds from Discord and verify they have MANAGE_GUILD
//      (0x20) or ADMINISTRATOR (0x8) on the requested guild.
//   3. Only then do we read/write that guild's bot config.
// The dashboard's session cookie alone never grants access here.

export const dynamic = 'force-dynamic';

interface DashGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string | number;
}

function bad(message: string, status = 400, code?: string, extra?: Record<string, unknown>) {
  // 429s advertise when to come back so clients can back off instead of
  // hammering; the UI reads Retry-After for its next attempt window.
  const retryAfterMs = extra?.retryAfterMs;
  const headers: Record<string, string> =
    status === 429 && typeof retryAfterMs === 'number'
      ? { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }
      : {};
  return NextResponse.json(
    { success: false, error: message, ...(code ? { code } : {}), ...(extra || {}) },
    { status, headers },
  );
}

// Structured authorization outcomes — the dashboard renders a distinct state
// per code instead of one generic "not allowed". A 403 never claims the bot
// is missing when the real problem is the caller's permission, and PATCH
// refuses to store settings for a server the bot is not installed on.
type Authz =
  | { ok: true; guild: DashGuild }
  | { ok: false; status: number; code: string; error: string; retryAfterMs?: number };

async function authorize(token: string | null, guildId: string): Promise<Authz> {
  if (!token) {
    return { ok: false, status: 401, code: 'AUTH_REQUIRED', error: 'Sign in with Discord to continue' };
  }
  if (!guildId || !SNOWFLAKE.test(guildId)) {
    return { ok: false, status: 400, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' };
  }
  // Shared cached guard: one Discord guild-list read per 30s per token across
  // ALL dashboard routes. The old inline fetch ran uncached on every call and
  // turned rate limits/outages into a false "sign in again" 401.
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    // Forward Discord's Retry-After so the UI can say "retry in Ns" instead
    // of hammering the endpoint again immediately.
    return { ok: false, status: check.status, code: check.code, error: check.error, retryAfterMs: check.retryAfterMs };
  }
  return { ok: true, guild: check.guild };
}

/** Is the bot installed on this guild? Tri-state via the shared helper:
 *  true = verified member, false = real Discord 404, null = unverifiable
 *  (no token / rejected credential / rate limit / challenged network).
 *  Only `false` may ever gate a save or an invite prompt. */
async function botInstalled(guildId: string): Promise<boolean | null> {
  const presence = await verifyBotInGuild(guildId);
  return presence === 'installed' ? true : presence === 'absent' ? false : null;
}

// ── Server-side resource verification (§22) ──────────────────────────────
// The dashboard validates selections client-side before saving, but a forged
// PATCH must not store another guild's (or a nonexistent) channel/role.
// Every snowflake-valued *Id field is re-verified against the Discord API
// with the bot token: existence, same-guild belonging, and — for roles —
// hierarchy (the bot must actually be able to manage the role). Friendly
// field names in errors; raw IDs never echoed.
const SNOWFLAKE = /^\d{5,25}$/;

interface BotCheck {
  channels: Map<string, { guild_id?: string; type?: number; name?: string }>;
  roles: Map<string, { name: string; managed: boolean; position: number }>;
  botRoleIds: string[];
  botIsAdmin: boolean;
  botTopPosition: number;
}

/**
 * Load the guild's channels, roles and the bot's own member record.
 *
 * Returns either the data or a NAMED reason it could not be read. It used to
 * return `null` for everything, and the caller turned that single `null` into
 * one sentence — so a throttle, an outage, a rejected credential and a
 * genuinely absent bot were indistinguishable at the save button.
 */
async function loadBotCheck(
  guildId: string, botToken: string,
): Promise<{ ok: true; check: BotCheck } | { ok: false; status: number; code: string; error: string; retryAfterMs?: number }> {
  // Bounded: an untimed Discord stall here would hang the SAVE button with
  // no feedback. 10s is generous; failure resolves to a named 502 with retry.
  const timeout = (ms: number) => AbortSignal.timeout(ms);
  const label = (res: Response) => {
    const which = res.url.includes('/channels') ? 'channel list'
      : res.url.includes('/roles') ? 'role list' : 'bot membership';
    return `Discord could not return this server's ${which} (HTTP ${res.status})`;
  };
  try {
    const [channelsRes, rolesRes, memberRes] = await Promise.all([
      fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${botToken}` }, cache: 'no-store',
        signal: timeout(10000),
      }),
      fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
        headers: { Authorization: `Bot ${botToken}` }, cache: 'no-store',
        signal: timeout(10000),
      }),
      fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
        headers: { Authorization: `Bot ${botToken}` }, cache: 'no-store',
        signal: timeout(10000),
      }),
    ]);
    for (const res of [channelsRes, rolesRes, memberRes]) {
      if (res.ok) continue;
      if (res.status === 429) {
        const raw = Number(res.headers.get('retry-after') ?? '1');
        const ms = (Number.isFinite(raw) && raw >= 0 ? Math.min(60, Math.ceil(raw)) : 1) * 1000;
        return {
          ok: false, status: 429, code: 'DISCORD_RATE_LIMITED', retryAfterMs: ms,
          error: `Discord is rate limiting dashboard requests. Retrying in ${Math.round(ms / 1000)}s. `
            + 'Nothing about your settings is wrong, and nothing was saved.',
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false, status: 502, code: 'BOT_CREDENTIAL_REJECTED',
          error: 'Discord rejected the dashboard\'s bot credentials. This is a dashboard problem, not a problem '
            + 'with the channel you picked — nothing was checked, and nothing was saved.',
        };
      }
      if (res.status === 404) {
        return {
          ok: false, status: 404, code: 'BOT_NOT_IN_GUILD',
          error: 'Murabot is not installed on this server (BOT_NOT_IN_GUILD). Invite it first — '
            + 'the channel itself has not been checked.',
        };
      }
      return {
        ok: false, status: 502, code: 'DISCORD_API_ERROR',
        error: `${label(res)}. Nothing was saved — try again in a moment.`,
      };
    }
    const channels = (await channelsRes.json()) as Array<{ id: string; guild_id?: string; type?: number; name?: string }>;
    const roles = (await rolesRes.json()) as Array<{ id: string; name: string; managed: boolean; position: number; permissions: string }>;
    const member = (await memberRes.json()) as { roles: string[] };
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const botRoleIds: string[] = Array.isArray(member.roles) ? member.roles : [];
    let botIsAdmin = false;
    let botTopPosition = 0;
    for (const rid of botRoleIds) {
      const r = roleById.get(rid);
      if (!r) continue;
      try {
        if ((BigInt(r.permissions) & BigInt(0x8)) !== BigInt(0)) botIsAdmin = true;
      } catch { /* ignore */ }
      if (r.position > botTopPosition) botTopPosition = r.position;
    }
    return {
      ok: true,
      check: {
        channels: new Map(channels.map((c) => [c.id, c])),
        roles: new Map(roles.map((r) => [r.id, r])),
        botRoleIds,
        botIsAdmin,
        botTopPosition,
      },
    };
  } catch {
    return {
      ok: false, status: 502, code: 'DISCORD_UNREACHABLE',
      error: 'Discord did not respond in time. Nothing was saved — try again in a moment.',
    };
  }
}

async function memberInGuild(guildId: string, userId: string, botToken: string): Promise<boolean> {
  try {
    const resp = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` }, cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function collectIdFields(update: Record<string, unknown>): Array<{ section: string; field: string; value: string }> {
  const out: Array<{ section: string; field: string; value: string }> = [];
  for (const [section, val] of Object.entries(update)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
    // Economy channels are already verified with a richer check (text
    // capability + View/Send/Embed) just above. Re-running the generic sweep
    // over them would replace that precise verdict with a generic one.
    if (section === 'economy') continue;
    for (const [field, fval] of Object.entries(val as Record<string, unknown>)) {
      if (/(Channel|Category|Role|Member|User)Id$/.test(field) && typeof fval === 'string' && SNOWFLAKE.test(fval)) {
        out.push({ section, field, value: fval });
      }
    }
  }
  return out;
}

function friendlyField(section: string, field: string): string {
  return field
    .replace(/Id$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

// ── Server-side read cache ───────────────────────────────────────────────
// GET does authorize (Discord guild-list read) + a DB read + a live bot
// presence probe per call. A dashboard page mounts several consumers, so a
// cold client burst still fired N× those Discord calls and tripped Discord's
// rate limit (surfaced here as 429). Serve identical reads from one short
// TTL cache with in-flight dedup; PATCH invalidates on every save. Authz is
// still enforced on every request BEFORE the cache is consulted.
const GET_TTL_MS = 30_000;
interface CachedGet {
  at: number;
  body: Record<string, unknown>;
}
const getCache = new Map<string, CachedGet>();
const getInflight = new Map<string, Promise<Record<string, unknown>>>();

async function buildGetPayload(guild: DashGuild, guildId: string): Promise<Record<string, unknown>> {
  const collection = await discordConfigCollection();
  const config = await collection.findOne({ guildId }) || {
    guildId,
    guildName: guild.name,
    guildIcon: guild.icon || '',
  };
  // Bot presence rides along (never blocks a read — settings remain
  // viewable while the bot is away); null = could not be determined.
  const installed = await botInstalled(guildId);
  return {
    success: true,
    guild: { id: guild.id, name: guild.name, icon: guild.icon },
    config,
    bot: { installed },
  };
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    const token = (await sessionToken());
    const guildId = req.nextUrl.searchParams.get('guildId') || '';

    // Authz FIRST, on every request — the cache is only ever consulted
    // after this requestor has proven Manage on this guild.
    const auth = await authorize(token, guildId);
    if (!auth.ok) {
      logApi('/api/dashboard/config', 'GET', auth.status, Date.now() - started, auth.code);
      return bad(auth.error, auth.status, auth.code,
        auth.retryAfterMs !== undefined ? { retryAfterMs: auth.retryAfterMs, retryable: true } : { retryable: auth.status === 429 || auth.status >= 500 });
    }

    // Fresh payload → zero DB/Discord work.
    const hit = getCache.get(guildId);
    if (hit && Date.now() - hit.at < GET_TTL_MS) {
      logApi('/api/dashboard/config', 'GET', 200, Date.now() - started, 'CACHE_HIT');
      return NextResponse.json(hit.body);
    }

    // Single flight: simultaneous mounts share ONE payload build.
    let pending = getInflight.get(guildId);
    if (!pending) {
      pending = buildGetPayload(auth.guild, guildId).then((body) => {
        getCache.set(guildId, { at: Date.now(), body });
        return body;
      }).finally(() => {
        if (getInflight.get(guildId) === pending) getInflight.delete(guildId);
      });
      getInflight.set(guildId, pending);
    }
    const body = await pending;
    logApi('/api/dashboard/config', 'GET', 200, Date.now() - started);
    return NextResponse.json(body);
  } catch {
    // Never leak HTML: DB/Discord throws resolve to a retryable JSON error.
    logApi('/api/dashboard/config', 'GET', 502, Date.now() - started, 'DATABASE_ERROR');
    return apiFail(
      'DATABASE_ERROR',
      'Configuration could not be loaded — retry in a moment.',
      502,
      { retryable: true },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return bad('Invalid JSON body');
  const guildId = String((body as Record<string, unknown>).guildId || '');
  // One call resolves BOTH halves of what this handler needs: proof that the
  // caller manages this guild, and the Discord identity they are signed in as.
  // The identity comes from the server-side session document behind the
  // HttpOnly cookie — never from the body, the query or the client.
  const auth = await requireSession(guildId);
  if (!auth.ok) {
    return bad(auth.error, auth.status, auth.code,
      auth.retryAfterMs !== undefined ? { retryAfterMs: auth.retryAfterMs, retryable: true } : undefined);
  }
  const guild = auth.guild ?? { id: guildId, name: guildId, icon: null, owner: false };

  // Storing settings for a server without the bot serves nothing and hides
  // misconfiguration — refuse with the precise state, not a generic 403.
  const installed = await botInstalled(guildId);
  if (installed === false) {
    return bad('The bot is not installed on this server (BOT_NOT_IN_GUILD). Invite it first — settings apply once it joins.',
      404, 'BOT_NOT_IN_GUILD');
  }

  const patch = (body as Record<string, unknown>).config;
  if (!patch || typeof patch !== 'object') return bad('config object required');
  const safe = patch as Record<string, Record<string, unknown>>;
  const started = Date.now();
  // ONE read of the stored document, reused by the economy merge, the
  // changed-resource sweep below, and the audit diff. Reading it three times
  // meant three chances to see a different version mid-save.
  const collection = await discordConfigCollection();
  const existingDoc = await collection.findOne({ guildId });
  /**
   * Non-blocking advisories for a save that DID succeed.
   *
   * These exist because "validate everything or refuse everything" is the wrong
   * trade for an OPTIONAL check. A raid-alerts toggle needs no Discord call; it
   * used to be refused whenever an unrelated channel lookup was unavailable.
   */
  const saveWarnings: string[] = [];

  // Whitelist updatable sections with type coercion + bounds.
  const update: Record<string, unknown> = {
    guildName: guild.name,
    guildIcon: guild.icon || '',
    updatedAt: new Date(),
  };
  // Non-fatal economy advice, surfaced on success without blocking the save.
  let economyWarnings: EconomyFieldError[] = [];
  if (safe.modules && typeof safe.modules === 'object') {
    update.modules = Object.fromEntries(
      Object.entries(safe.modules).slice(0, 16).map(([k, v]) => [k.slice(0, 30), Boolean(v)]),
    );
  }
  if (safe.giveaways && typeof safe.giveaways === 'object') {
    // This section used to have NO sanitiser at all. The revalidation block
    // below read `update.giveaways`, the read-back echoed `persisted.giveaways`,
    // and the dashboard rendered a full Giveaways form — but nothing in the
    // PATCH ever built `update.giveaways`, so the write silently dropped the
    // whole section. The dashboard reported success and the bot read the
    // default config forever. Every field here is one the /giveaway command
    // actually consumes (see bot/cogs/community.py), so they are written
    // verbatim rather than inventing a second shape.
    const g = safe.giveaways as Record<string, unknown>;
    const num = (v: unknown, lo: number, hi: number, fb: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : fb;
    };
    update.giveaways = {
      channelId: String(g.channelId || '').slice(0, 25),
      logsChannelId: String(g.logsChannelId || '').slice(0, 25),
      managerRoleId: String(g.managerRoleId || '').slice(0, 25),
      requiredRoleId: String(g.requiredRoleId || '').slice(0, 25),
      // Hours in the dashboard, minutes at the command boundary — converted on
      // read in the cog so one stored unit serves both surfaces.
      defaultDuration: num(g.defaultDuration, 1, 24 * 14, 24),
      defaultWinners: num(g.defaultWinners, 1, 20, 1),
      minAccountAge: num(g.minAccountAge, 0, 3650, 0),
      requiredLevel: num(g.requiredLevel, 0, 100, 0),
      requiredActivity: num(g.requiredActivity, 0, 3650, 0),
    };
  }
  if (safe.securitySettings && typeof safe.securitySettings === 'object') {
    const s = safe.securitySettings;
    update.securitySettings = {
      antiRaidEnabled: Boolean(s.antiRaidEnabled),
      joinSpikeThreshold: Math.max(3, Math.min(50, Number(s.joinSpikeThreshold) || 8)),
      antiNukeEnabled: Boolean(s.antiNukeEnabled),
      minAccountAgeHours: Math.max(0, Math.min(168, Number(s.minAccountAgeHours) || 24)),
    };
  }
  if (safe.community && typeof safe.community === 'object') {
    const c = safe.community;
    update.community = {
      giveawayChannelId: String(c.giveawayChannelId || '').slice(0, 25),
      suggestionChannelId: String(c.suggestionChannelId || '').slice(0, 25),
      reportChannelId: String(c.reportChannelId || '').slice(0, 25),
    };
  }

  // ── Server-side revalidation of every channel/role in this write ───────
  //
  // The browser already checked these, and that check is a convenience, not a
  // guarantee: the page is the untrusted party, `verified: true` arrives in the
  // body, and the operator may have left the tab open while a channel was
  // deleted. So the same objects are re-checked here, through Murabot, before
  // anything is written.
  //
  // This is the step that makes the save transactional. A resource that cannot
  // be verified is NOT a reason to clear it, to write an empty string over a
  // working id, or to save the rest of the form and leave a half-applied state:
  // if any named resource is rejected OR unknown, NOTHING in this section is
  // written and the operator is told which field and why. Verified resources
  // are never dropped because a different one failed.
  if (update.community || update.giveaways) {
    const RESOURCE_FIELDS: Array<{
      section: 'community' | 'giveaways';
      key: string;
      kind: 'channel' | 'role' | 'category';
      require: string[];
    }> = [
      { section: 'community', key: 'giveawayChannelId', kind: 'channel', require: ['view', 'send', 'embed'] },
      { section: 'community', key: 'suggestionChannelId', kind: 'channel', require: ['view', 'send', 'embed'] },
      { section: 'community', key: 'reportChannelId', kind: 'channel', require: ['view', 'send', 'embed'] },
      { section: 'giveaways', key: 'channelId', kind: 'channel', require: ['view', 'send', 'embed', 'react'] },
      { section: 'giveaways', key: 'logsChannelId', kind: 'channel', require: ['view', 'send', 'embed'] },
      { section: 'giveaways', key: 'managerRoleId', kind: 'role', require: [] },
      { section: 'giveaways', key: 'requiredRoleId', kind: 'role', require: [] },
    ];

    const resourceErrors: Array<{
      field: string; label: string; code: string; message: string;
      retryable: boolean;
      missingPermissions?: Array<{ key: string; label: string }>;
    }> = [];
    for (const spec of RESOURCE_FIELDS) {
      const sectionValue = spec.section === 'community' ? update.community : update.giveaways;
      if (!sectionValue) continue;
      const raw = (sectionValue as Record<string, unknown>)[spec.key];
      const id = String(raw ?? '');
      // An empty selection is a deliberate "unset", not a failed check, and is
      // allowed through untouched.
      if (!id) continue;
      if (!/^\d{5,25}$/.test(id)) {
        resourceErrors.push({
          field: `${spec.section}.${spec.key}`, label: spec.key, code: 'INVALID_SELECTION',
          message: `"${id}" is not a Discord id.`,
          // Not retryable: retrying will not make a malformed id well-formed.
          retryable: false,
        });
        continue;
      }
      const v = await verifyResource(guildId, spec.kind, id, spec.require,
        { bypassCache: true });
      if (v.code === 'VERIFIED') continue;        resourceErrors.push({
          field: `${spec.section}.${spec.key}`,
          label: spec.key,
          code: v.code,
          // A code that means "we could not find out" is reported as such, and is
          // never presented as a broken selection.
          message: v.message,
          retryable: v.retryable,
          ...(v.missingPermissions.length > 0
            ? { missingPermissions: v.missingPermissions }
            : {}),
        });
    }

    if (resourceErrors.length > 0) {
      // NOTHING is written. Not this section, not the rest of the form.
      delete update.community;
      delete update.giveaways;
      logApi('/api/dashboard/config', 'config-save', 422, Date.now() - started,
        `RESOURCE_REVALIDATION_FAILED:${resourceErrors.map((e) => e.code).join(',')}`);
      return NextResponse.json({
        success: false,
        saved: false,
        code: resourceErrors.every((e) => e.code === 'INVALID_SELECTION'
          || e.code === 'PERMISSION_DENIED')
          ? 'INVALID_SELECTION'
          : 'DISCORD_UNVERIFIED',
        retryable: resourceErrors.some((e) => e.retryable
          && e.code !== 'INVALID_SELECTION' && e.code !== 'PERMISSION_DENIED'),
        errors: resourceErrors,
        message: 'Nothing was saved. '
          + resourceErrors.map((e) => `${e.label}: ${e.message}`).join(' '),
      }, { status: 422 });
    }
    // Everything checked out; the cached verdicts for this guild are now stale.
    invalidateGuild(guildId);
  }
  if (safe.music && typeof safe.music === 'object') {
    const m = safe.music;
    const rawFilters = Array.isArray(m.filters) ? m.filters : [];
    const FILTERS = ['bassboost', 'nightcore', 'vaporwave', '8d', 'karaoke', 'tremolo'];
    update.music = {
      djRoleId: String(m.djRoleId || '').slice(0, 25),
      musicChannelId: String(m.musicChannelId || '').slice(0, 25),
      voiceChannelId: String(m.voiceChannelId || '').slice(0, 25),
      textChannelId: String(m.textChannelId || '').slice(0, 25),
      nowPlayingChannelId: String(m.nowPlayingChannelId || '').slice(0, 25),
      commandsChannelId: String(m.commandsChannelId || '').slice(0, 25),
      musicLogsChannelId: String(m.musicLogsChannelId || '').slice(0, 25),
      djOnlyMode: Boolean(m.djOnlyMode),
      voiceChannelRequired: m.voiceChannelRequired !== false,
      enableNowPlayingEmbed: m.enableNowPlayingEmbed !== false,
      enableQueueEmbed: m.enableQueueEmbed !== false,
      enableMusicButtons: m.enableMusicButtons !== false,
      controlMode: ['everyone', 'dj', 'moderators'].includes(String(m.controlMode))
        ? String(m.controlMode) : 'everyone',
      defaultVolume: Math.max(1, Math.min(150, Number(m.defaultVolume) || 50)),
      maxVolume: Math.max(10, Math.min(150, Number(m.maxVolume) || 150)),
      maxQueueSize: Math.max(1, Math.min(500, Number(m.maxQueueSize) || 100)),
      defaultLoop: ['off', 'track', 'queue'].includes(String(m.defaultLoop))
        ? String(m.defaultLoop) : 'off',
      filters: rawFilters.filter((f) => FILTERS.includes(String(f))).slice(0, 3),
      twentyFourSeven: Boolean(m.twentyFourSeven),
      autoPlay: Boolean(m.autoPlay),
      autoLeave: Boolean(m.autoLeave),
      enableNowPlaying: m.enableNowPlaying !== false,
    };
  }
  if (safe.moderation && typeof safe.moderation === 'object') {
    const m = safe.moderation;
    const rawThresholds = Array.isArray(m.warnThresholds) ? m.warnThresholds : [];
    const warnThresholds = rawThresholds.slice(0, 5)
      .map((t) => {
        const r = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
        const count = Math.max(1, Math.min(100, Number(r.count) || 0));
        const action = ['timeout', 'kick', 'ban'].includes(String(r.action)) ? String(r.action) : 'timeout';
        const durationMinutes = Math.max(1, Math.min(40320, Number(r.durationMinutes) || 60));
        return count ? { count, action, durationMinutes } : null;
      })
      .filter((t): t is { count: number; action: string; durationMinutes: number } => t !== null)
      .sort((a, b) => a.count - b.count);
    const dm = (m.dmNotifications && typeof m.dmNotifications === 'object'
      ? m.dmNotifications : {}) as Record<string, unknown>;
    update.moderation = {
      modRoleId: String(m.modRoleId || '').slice(0, 25),
      logChannelId: String(m.logChannelId || '').slice(0, 25),
      automodEnabled: Boolean(m.automodEnabled),
      antiSpam: Boolean(m.antiSpam),
      antiInvite: Boolean(m.antiInvite),
      antiLink: Boolean(m.antiLink),
      antiCaps: Boolean(m.antiCaps),
      capsThreshold: Math.max(10, Math.min(100, Number(m.capsThreshold) || 70)),
      mentionThreshold: Math.max(3, Math.min(50, Number(m.mentionThreshold) || 8)),
      escalation: Array.isArray(m.escalation)
        ? m.escalation.slice(0, 5).map((s) => String(s).slice(0, 20))
        : ['warn', 'timeout', 'timeout', 'kick', 'ban'],
      warnThresholds: warnThresholds.length ? warnThresholds : [{ count: 3, action: 'timeout', durationMinutes: 60 }],
      dmNotifications: {
        warn: dm.warn !== false,
        timeout: dm.timeout !== false,
        kick: dm.kick !== false,
        ban: dm.ban !== false,
      },
    };
  }
  if (safe.welcome && typeof safe.welcome === 'object') {
    const w = safe.welcome;
    update.welcome = {
      enabled: Boolean(w.enabled),
      channelId: String(w.channelId || '').slice(0, 25),
      message: String(w.message || '').slice(0, 500),
      autoRoleId: String(w.autoRoleId || '').slice(0, 25),
    };
  }
  if (safe.tickets && typeof safe.tickets === 'object') {
    update.tickets = {
      categoryId: String((safe.tickets as Record<string, unknown>).categoryId || '').slice(0, 25),
      supportRoleId: String((safe.tickets as Record<string, unknown>).supportRoleId || '').slice(0, 25),
    };
  }
  if (safe.notifications && typeof safe.notifications === 'object') {
    const n = safe.notifications;
    update.notifications = {
      channelId: String(n.channelId || '').slice(0, 25),
      newContent: Boolean(n.newContent),
      requestUpdates: Boolean(n.requestUpdates),
    };
  }
  if (safe.leveling && typeof safe.leveling === 'object') {
    const l = safe.leveling as Record<string, unknown>;
    const num = (v: unknown, lo: number, hi: number, fb: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : fb;
    };
    const str25 = (v: unknown) => String(v || '').slice(0, 25);
    const rewards: Record<string, string> = {};
    const rawRewards = (l.rewards && typeof l.rewards === 'object' ? l.rewards : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(rawRewards).slice(0, 100)) {
      if (/^\d{1,3}$/.test(k) && /^\d{5,25}$/.test(String(v || ''))) rewards[k] = String(v);
    }
    // Legacy dashboard role fields map onto the same rewards dict.
    for (const n of ['5', '10', '25', '50', '100']) {
      const v = String((l as Record<string, unknown>)[`reward${n}`] || '');
      if (/^\d{5,25}$/.test(v)) rewards[n] = v;
    }
    const serverBackground = SERVER_CARD_IDS.has(String(l.serverBackground || ''))
      ? String(l.serverBackground)
      : SERVER_CARD_DEFAULT;
    update.leveling = {
      xpMin: num(l.xpMin, 1, 100, 15),
      xpMax: num(l.xpMax, 1, 100, 25),
      xpCooldownSec: num(l.xpCooldownSec, 5, 3600, 60),
      voiceXp: Boolean(l.voiceXp),
      voiceXpAmount: num(l.voiceXpAmount, 1, 500, 10),
      blacklistedChannels: Array.isArray(l.blacklistedChannels)
        ? l.blacklistedChannels.filter((s) => /^\d{5,25}$/.test(String(s))).map(String).slice(0, 100) : [],
      blacklistedRoles: Array.isArray(l.blacklistedRoles)
        ? l.blacklistedRoles.filter((s) => /^\d{5,25}$/.test(String(s))).map(String).slice(0, 100) : [],
      levelUpChannelId: str25(l.levelUpChannelId),
      levelUpMessage: String(l.levelUpMessage || '').slice(0, 300),
      dmNotify: Boolean(l.dmNotify),
      rewardReplace: l.rewardReplace !== false,
      announceMinLevel: num(l.announceMinLevel, 1, 100, 1),
      announceMod: num(l.announceMod, 0, 100, 0),
      rewardOnly: Boolean(l.rewardOnly),
      cardColor: /^#[0-9a-fA-F]{6}$/.test(String(l.cardColor || '')) ? String(l.cardColor) : '#5865F2',
      cardOpacity: Math.max(0, Math.min(1, Number(l.cardOpacity ?? 1) || 0)),
      // BOTH spellings, always the same value. `server_card_background` is the
      // canonical field the bot's renderer resolves; `serverBackground` is the
      // legacy alias older readers still read. Writing only one of them let the
      // two disagree, and a reader that preferred the other one then showed the
      // PREVIOUS background — which looked exactly like the setting being
      // ignored. One value, one source of truth, both keys.
      server_card_background: serverBackground,
      serverBackground,
      rewards,
    };
  }
  // ── Economy ────────────────────────────────────────────────────────
  // Validated against the shared schema, reported per field, and written
  // all-or-nothing. The previous hand-written whitelist silently discarded
  // nine of the twenty-one fields the form showed (including the Economy Log
  // Channel), reported success anyway, and produced a single generic
  // "1 setting failed validation" for every other failure.
  if (safe.economy && typeof safe.economy === 'object') {
    // Ownership is decided from the AUTHENTICATED SESSION, never from the
    // request body. The browser used to send `actorId` and the API used to ask
    // the bot process about it — which meant the owner check could fail for
    // reasons that had nothing to do with who was signed in, and any client
    // could have claimed to be somebody else. The session's Discord id is the
    // only identity used, and it is compared numerically against
    // MURABOT_OWNER_DISCORD_ID.
    const isOwner = isMurabotOwner(auth.discordId);
    logOwnerCheck(auth.discordId, guildId, 'economy-save');

    const existingEconomy = (existingDoc?.economy && typeof existingDoc.economy === 'object'
      ? existingDoc.economy
      : {}) as Record<string, unknown>;

    const { values, errors, warnings } = validateEconomyDraft(safe.economy, {
      existing: existingEconomy,
      isOwner,
    });

    // Every Discord-dependent setting is verified against LIVE guild state.
    // Cached ids are never trusted, and a Discord outage produces a retryable
    // error rather than a false "this channel is invalid".
    for (const field of ECONOMY_FIELDS) {
      if (field.kind !== 'channel') continue;
      const channelId = values[field.key];
      if (typeof channelId !== 'string' || channelId === '') continue;
      const problem = await validateChannelSetting(
        guildId, field.key, field.label, channelId, field.requires ?? ['view', 'send'],
      );
      if (problem) errors.push(problem);
    }

    if (errors.length > 0) {
      // NOTHING is written. The previous configuration stays exactly as it
      // was — a failed save must never blank a working setting.
      const ownerOnly = errors.every((e) => e.code === ECONOMY_ERROR_CODES.OWNER_ONLY);
      const status = ownerOnly ? 403 : errors.some((e) => e.retryable) ? 503 : 422;
      logApi('/api/dashboard/config', 'PATCH', status, Date.now() - started,
        ownerOnly ? 'OWNER_ONLY' : 'ECONOMY_VALIDATION');
      return NextResponse.json({
        success: false,
        code: ownerOnly ? ECONOMY_ERROR_CODES.OWNER_ONLY : errors[0].code,
        // The per-field list is the payload. `error` is kept only as a short
        // summary for anything still reading the old shape.
        errors,
        error: ownerOnly
          ? 'Only the Murabot owner can modify economic values.'
          : errors.length === 1
            ? errors[0].message
            : `${errors.length} settings could not be saved. Nothing was saved.`,
        // Shown when nothing can be an owner at all, so the reason is a
        // deployment fix rather than a mystery.
        ownerConfiguration: ownerConfigurationProblem(),
        warnings,
        retryable: errors.every((e) => e.retryable),
      }, { status });
    }

    // All-or-nothing: one document, one write, every declared key present.
    update.economy = mergeEconomySection(existingEconomy, values);
    // The cached presence described Murabot as it was when the last check ran;
    // a save must not leave a stale answer behind for the next render.
    invalidateBotPresence(guildId);
    if (warnings.length > 0) economyWarnings = warnings;
  }

  // Server-side resource verification: every CHANGED channel/category/role
  // must exist in THIS guild and be usable by the bot — a forged guildId or
  // a foreign ID is rejected here, never stored.
  //
  // Only CHANGED ids are checked. An id already stored in this document was
  // verified when it was chosen and re-verifying it on every unrelated save is
  // what made "toggle Raid Alerts" fail whenever Discord was briefly slow.
  // The stored value cannot have become more valid by being left alone.
  const priorDoc = (existingDoc ?? {}) as Record<string, unknown>;
  const priorValue = (section: string, field: string): unknown => {
    const sec = priorDoc[section];
    return sec && typeof sec === 'object' ? (sec as Record<string, unknown>)[field] : undefined;
  };
  const allIdFields = collectIdFields(update as Record<string, unknown>);
  const idFields = allIdFields.filter(
    ({ section, field, value }) => String(priorValue(section, field) ?? '') !== value,
  );
  const unchangedIds = allIdFields.length - idFields.length;

  const bToken = botToken();
  if (idFields.length > 0 && !bToken) {
    // Discord verification needs a bot token. WITHOUT one we do NOT refuse the
    // save: these values came from this guild's own resource picker, so they
    // are structurally sound. Refusing here made every save unsaveable on a
    // deployment with no site-side bot token. Murabot validates on use.
    logApi('/api/dashboard/config', 'PATCH', 200, Date.now() - started, 'RESOURCE_CHECK_SKIPPED_NO_BOT_TOKEN');
    saveWarnings.push(
      'Changed channel/role selections could not be re-verified against Discord (the dashboard has no bot token configured). '
      + 'They were saved. Murabot will report a problem only if it cannot actually use them.',
    );
  }
  if (idFields.length > 0 && bToken) {
    const loaded = await loadBotCheck(guildId, bToken);
    if (!loaded.ok) {
      // Discord did not answer. That is a fact about the CONNECTION, not a
      // verdict about the operator's values, so it is reported as such — and
      // the save proceeds with a warning rather than being refused and
      // reported as a validation failure.
      logApi('/api/dashboard/config', 'PATCH', loaded.status, Date.now() - started, loaded.code);
      saveWarnings.push(
        `Could not verify the changed channel/role selections against Discord (${loaded.code}). `
        + 'Your settings were saved unchanged — re-verify once Murabot responds.',
      );
    } else {
      const check = loaded.check;
    for (const { field, value } of idFields) {
      const label = friendlyField('', field);
      if (/ChannelId$/.test(field)) {
        const ch = check.channels.get(value);
        if (!ch || ch.guild_id !== guildId) {
          // CHANNEL_NOT_FOUND is distinct from CHANNEL_ACCESS_DENIED: the
          // channel is gone (or foreign), which is a different problem from
          // the bot being unable to use a channel that still exists. The
          // operator is told which one they have.
          return bad(
            `${label} is no longer available on this server (CHANNEL_NOT_FOUND). ` +
            'It was deleted, or it belongs to another server — pick another channel.',
            400, 'CHANNEL_NOT_FOUND',
          );
        }
      } else if (/CategoryId$/.test(field)) {
        const ch = check.channels.get(value);
        if (!ch || ch.guild_id !== guildId || ch.type !== 4) {
          return bad(
            `${label} is no longer a category on this server (CHANNEL_NOT_FOUND). ` +
            'Pick another category.',
            400, 'CHANNEL_NOT_FOUND',
          );
        }
      } else if (/RoleId$/.test(field)) {
        const role = check.roles.get(value);
        if (!role || value === guildId) {
          return bad(`${label} is no longer available on this server (ROLE_NOT_FOUND). Pick another role.`, 400, 'ROLE_NOT_FOUND');
        }
        if (role.managed) {
          return bad(`${role.name} is managed by an integration and cannot be used here.`, 400, 'ROLE_MANAGED');
        }
        if (!check.botIsAdmin && check.botTopPosition <= role.position) {
          return bad(
            `This role can't be managed by the bot (ROLE_ACCESS_DENIED) — move the bot's role above ${role.name} in Discord's Server Settings → Roles, then save again.`,
            403, 'ROLE_ACCESS_DENIED',
          );
        }
      } else {
        // MemberId / UserId
        if (!(await memberInGuild(guildId, value, bToken))) {
          return bad(`${label} is no longer on this server (MEMBER_NOT_FOUND). Pick another member.`, 400, 'MEMBER_NOT_FOUND');
        }
      }
    }
    }
  }

  // Diff before writing so the audit trail records real before/after values.
  const existing = existingDoc;
  const { diffConfigUpdate, auditConfigChange } = await import('@/app/lib/dashboard-audit');
  const changes = diffConfigUpdate(
    existing as Record<string, unknown> | null,
    update as Record<string, unknown>,
  );

  try {
    await collection.updateOne({ guildId }, { $set: update }, { upsert: true });
  } catch {
    // A database failure is its own failure, distinct from validation and from
    // Discord. The document was not modified, so the previous configuration is
    // still in place — say so rather than showing a generic error.
    logApi('/api/dashboard/config', 'PATCH', 503, Date.now() - started, 'DATABASE_ERROR');
    return NextResponse.json({
      success: false,
      code: ECONOMY_ERROR_CODES.DATABASE_ERROR,
      errors: [{
        field: 'config',
        label: 'Server settings',
        code: ECONOMY_ERROR_CODES.DATABASE_ERROR,
        message: 'The settings could not be written to the database. Nothing was saved — your previous configuration is unchanged. Try again in a moment.',
        retryable: true,
      }],
      error: 'The settings could not be written to the database. Nothing was saved.',
      retryable: true,
    }, { status: 503 });
  }
  // The write is the truth now — drop the stale GET cache so the next read
  // (and any other tab) sees the saved settings immediately.
  getCache.delete(guildId);

  // Push music settings to the bot host: the dashboard writes the SITE
  // database, but the player reads the BOT's guild_config store. Without
  // this push, DJ/volume/24/7 settings would silently never apply.
  // Best-effort — the site save already succeeded, and the bot re-reads
  // with a short TTL anyway.
  if (update.music && typeof update.music === 'object') {
    const secret = process.env.DISCORD_BRIDGE_SECRET || '';
    const botBase = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';
    if (secret) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        await fetch(`${botBase}/music/config/${guildId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ music: update.music }),
          signal: controller.signal,
        });
        clearTimeout(timer);
      } catch { /* bot offline — settings apply on next push/save */ }
    }
  }

  // Audit trail: who changed what. The actor is the session's Discord account —
  // already resolved above — so this costs no extra Discord call and cannot be
  // spoofed by a request body.
  try {
    const actor = auth.username
      ? `${auth.username} (${auth.discordId})`
      : `discord:${auth.discordId}`;
    const summary = changes.length
      ? `Updated ${changes.length} setting${changes.length === 1 ? '' : 's'}: ${changes.slice(0, 3).map((c) => `${c.section ? `${c.section}.` : ''}${c.field}`).join(', ')}${changes.length > 3 ? '…' : ''}`
      : 'Saved settings (no changes)';
    await auditConfigChange(guildId, actor, summary, changes);
  } catch {
    // Audit is best-effort; the config write already succeeded.
  }
  // ── Leveling goes through Murabot's own connection ────────────────────
  // The dashboard's `guild_config` write above uses the dashboard's idea of
  // the bot's cluster, and that idea resolves from ITS OWN environment where
  // the bot URI is only a fallback. When it resolves to the site's own
  // cluster, this write succeeds and the bot never reads it — the picker
  // updates, the save returns 200, the preview redraws, and every Discord
  // card keeps the default.
  //
  // So the same change is also pushed to the bot, which stores it with the
  // connection it renders from. The site write stays as the fallback: a save
  // is never lost, and the response says which path succeeded so the operator
  // knows whether the Discord card will show it yet.
  let levelingPush: { pushed: boolean; themeId: string | null; error: { code: string; message: string } | null } | null = null;
  if (update.leveling && typeof update.leveling === 'object') {
    levelingPush = await pushLevelConfigToBot(
      guildId, update.leveling as Record<string, unknown>,
    );
    if (levelingPush.error) {
      saveWarnings.push(`⚠ ${levelingPush.error.message}`);
    }
  }

  // Read the document back so the client renders what is actually STORED,
  // not what it hoped it sent. A success response that disagrees with the
  // database is worse than a failure, because nobody would go looking.
  const persisted = (await collection.findOne({ guildId })) as Record<string, unknown> | null;
  const warnings = [
    ...economyWarnings.map((w) => w.message),
    ...saveWarnings,
  ];
  return NextResponse.json({
    success: true,
    ...(warnings.length > 0 ? { warnings } : {}),
    // Whether the value reached the bot's own database — the record the
    // Discord card is rendered from. Reported, never assumed.
    levelingPushedToBot: levelingPush ? levelingPush.pushed : null,
    levelCardBackground: levelingPush?.themeId
      ?? (update.leveling as Record<string, unknown> | undefined)?.serverBackground
      ?? null,
    config: persisted
      ? {
        modules: persisted.modules,
        securitySettings: persisted.securitySettings,
        community: persisted.community,
        music: persisted.music,
        leveling: persisted.leveling,
        economy: persisted.economy,
        tickets: persisted.tickets,
        giveaways: persisted.giveaways,
        suggestions: persisted.suggestions,
        reminders: persisted.reminders,
        reputation: persisted.reputation,
        murastream: persisted.murastream,
      }
      : null,
    updatedAt: persisted?.updatedAt ?? null,
  });
}
