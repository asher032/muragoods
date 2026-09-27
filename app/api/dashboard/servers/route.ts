import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/app/lib/require-session';
import { verifyBotInGuild, botToken, fetchBotMember, botRestCached } from '@/app/lib/discord-bot';
import { fetchUserGuildsCached, hasManageBits, requireGuildManage } from '@/app/lib/discord-guilds';

// ── Unified server/guild detection ─────────────────────────────────────────
// GET /api/dashboard/servers[?refresh=1][?guildId=ID]
// POST /api/dashboard/servers  { }  → force a live refresh (Refresh button)
//
// Four independent membership sources are reported separately — never merged
// into a single "your servers" guess:
//
//   userGuilds      every guild from the user's live Discord authorization
//                   (identify+guilds OAuth token, re-fetched on every call)
//   manageable      subset the user can manage (owner | MANAGE_GUILD | ADMIN)
//   botGuildIds     guilds the bot's own gateway connection reports via
//                   /health guild_ids (the bot's authenticated WS presence)
//   botRestGuildIds guilds from the bot token's REST identity
//                   (GET /users/@me/guilds with `Bot <token>`)
//
// A guild is reported as botInstalled ONLY when the bot token verifies
// membership against the Discord API for that exact guild
// (GET /guilds/{id}/member/@me with `Bot <token>`). The bot's /health set is
// used as a fast-path hint but never as the verdict — managing a server does
// NOT imply the bot is installed there.
//
// Per-server facts: name, icon, id, bot membership, bot permissions,
// channel count, category count, role count, member info, bot connection.
// A `guildId` query is always re-verified server-side (user-manages check +
// live bot check); a forged/unknown id is rejected, never trusted.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ADMINISTRATOR = BigInt(0x8); // bot's own admin bit (isAdmin fact)

// Least-privilege install URL for the running bot (no secret inside).
const BOT_PERMISSIONS = '271698944';

function botBase(): string {
  return process.env.BOT_HEALTH_URL?.replace(/\/health$/, '')
    || 'https://murastream-bot-pf11.onrender.com';
}

function inviteUrlFor(guildId: string): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: BOT_PERMISSIONS,
    scope: 'bot applications.commands',
    guild_id: guildId,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function hasManage(owner: boolean, perms: string | number): boolean {
  return hasManageBits(owner, perms);
}

function iconUrl(id: string, icon: string | null): string | null {
  return icon ? `https://cdn.discordapp.com/icons/${id}/${icon}.png` : null;
}

async function fetchJson(url: string, headers: Record<string, string>, timeoutMs = 6000): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const resp = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!resp.ok) return { ok: false, status: resp.status, data: null };
    return { ok: true, status: resp.status, data: await resp.json().catch(() => null) };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

interface UserGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string | number;
  approximate_member_count?: number;
  approximate_presence_count?: number;
}

export interface DetectedServer {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  // ── The four sources, reported independently ──
  inUserGuilds: boolean;
  userCanManage: boolean;
  userPermissions: string;
  botInGateway: boolean | null;   // from /health guild_ids (null = bot unreachable)
  botInRest: boolean | null;      // from bot token REST guild list (null = unknown)
  // ── Verified verdict (Bot-token membership check per guild) ──
  botInstalled: boolean | null;   // null = could not verify (no bot token / unreachable)
  botOnlineInGuild: boolean | null;
  // ── Bot facts inside this guild ──
  botPermissions: string | null;
  botIsAdmin: boolean | null;
  channelCount: number | null;
  categoryCount: number | null;
  roleCount: number | null;
  memberCount: number | null;
  presenceCount: number | null;
  botConnection: 'online' | 'offline' | 'unknown';
  // ── Actions ──
  inviteUrl: string | null;
  needsInvite: boolean;
  missingPermissions: boolean;
}

// ── Short-lived caches (per process) ───────────────────────────────────────
// Discord rate-limits hard; a 45s cache keeps Refresh honest without hammering.
interface CacheEntry<T> { at: number; value: T }
const LIST_CACHE = new Map<string, CacheEntry<DetectedServer[]>>();
const META_CACHE = new Map<string, CacheEntry<{ botOnline: boolean | null; botGuildCount: number | null }>>();
const LIST_TTL_MS = 45_000;

async function botGatewayGuildIds(): Promise<{ ids: Set<string> | null; online: boolean | null; count: number | null }> {
  try {
    const resp = await fetch(`${botBase()}/health`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    if (!resp.ok) return { ids: null, online: false, count: null };
    const data = (await resp.json().catch(() => null)) as { ok?: boolean; guild_ids?: string[]; guilds?: number } | null;
    if (!data) return { ids: null, online: null, count: null };
    const ids = Array.isArray(data.guild_ids) ? new Set(data.guild_ids.map(String)) : new Set<string>();
    return { ids, online: data.ok !== false, count: typeof data.guilds === 'number' ? data.guilds : ids.size };
  } catch {
    return { ids: null, online: null, count: null };
  }
}

async function botRestGuildIds(token: string): Promise<Set<string> | null> {
  const r = await fetchJson('https://discord.com/api/v10/users/@me/guilds', { Authorization: `Bot ${token}` });
  if (!r.ok || !Array.isArray(r.data)) return null;
  return new Set((r.data as Array<{ id: string }>).map((g) => String(g.id)));
}

async function verifyGuildWithBot(
  guildId: string,
  gatewayIds: Set<string> | null,
): Promise<Partial<DetectedServer>> {
  // Authoritative check via the shared tri-state helper: ONLY a real 404
  // means "not installed". A rejected credential, rate limit, or challenged
  // network returns 'unknown' — never a false invite loop.
  // botConnection 'offline' is reserved for VERIFIED absence. An installed
  // bot missing from the gateway list (restart, reconnect lag, sharding) is
  // 'unknown' — the UI must never read that as "not installed".
  const presence = await verifyBotInGuild(guildId);
  if (presence === 'absent') {
    return { botInstalled: false, botOnlineInGuild: false, botConnection: 'offline' };
  }
  if (presence === 'unknown') {
    const online = gatewayIds ? gatewayIds.has(guildId) : null;
    return { botInstalled: null, botOnlineInGuild: online, botConnection: online ? 'online' : 'unknown' };
  }
  // Installed: resolve the bot's own member doc for permissions. A missing
  // doc here (transient blip right after the 200 above) degrades to nulls,
  // never to a false verdict — presence is already established.
  const m = await fetchBotMember(guildId);
  const perms = m && m.permissions !== undefined ? String(m.permissions) : null;
  let isAdmin: boolean | null = null;
  if (perms !== null) {
    try { isAdmin = (BigInt(perms) & ADMINISTRATOR) !== BigInt(0); } catch { isAdmin = null; }
  }

  // Enrichment: guild object (member counts), channels, roles — all via the
  // bot token so counts reflect what the BOT can actually see. Reads share a
  // 30s cache so one Refresh with N guilds does not fire 3N calls at Discord
  // and eat its own rate-limit storm (which used to read as UNKNOWN states).
  const [guildRes, channelsRes, rolesRes] = await Promise.all([
    botRestCached<{ approximate_member_count?: number; approximate_presence_count?: number }>(
      `/guilds/${guildId}?with_counts=true`),
    botRestCached<Array<{ type?: number }>>(`/guilds/${guildId}/channels`),
    botRestCached<unknown[]>(`/guilds/${guildId}/roles`),
  ]);

  let memberCount: number | null = null;
  let presenceCount: number | null = null;
  if (guildRes.data && typeof guildRes.data === 'object') {
    const g = guildRes.data;
    memberCount = typeof g.approximate_member_count === 'number' ? g.approximate_member_count : null;
    presenceCount = typeof g.approximate_presence_count === 'number' ? g.approximate_presence_count : null;
  }
  let channelCount: number | null = null;
  let categoryCount: number | null = null;
  if (Array.isArray(channelsRes.data)) {
    const channels = channelsRes.data;
    channelCount = channels.length;
    categoryCount = channels.filter((c) => c.type === 4).length;
  }
  let roleCount: number | null = null;
  if (Array.isArray(rolesRes.data)) {
    roleCount = rolesRes.data.length;
  }

  const inGateway = gatewayIds ? gatewayIds.has(guildId) : null;
  return {
    botInstalled: true,
    botOnlineInGuild: inGateway,
    botPermissions: perms,
    botIsAdmin: isAdmin,
    channelCount,
    categoryCount,
    roleCount,
    memberCount,
    presenceCount,
    // Installed is VERIFIED — but gateway absence only means the WS list is
    // stale (restart/reconnect lag), never "not installed". Report unknown.
    botConnection: inGateway ? 'online' : 'unknown',
  };
}

async function detectServers(accessToken: string): Promise<{
  servers: DetectedServer[];
  meta: { botOnline: boolean | null; botGuildCount: number | null; userGuildCount: number; manageableCount: number; refreshedAt: string };
}> {
  // 1. Live user guilds — through the SHARED 30s cache. Every dashboard
  // route used to fetch this list itself on every call; a page load fired a
  // burst of identical calls that ate Discord's rate limit and read back as
  // "no permission" / UNKNOWN states across the whole dashboard.
  const userRes = await fetchUserGuildsCached(accessToken);
  if (!userRes.ok && userRes.authFailed) {
    throw { status: 401, error: 'Discord rejected the session token — sign in again' };
  }
  if (!userRes.ok) {
    throw { status: 502, error: `Discord API error ${userRes.status}` };
  }
  const userGuilds = userRes.guilds as UserGuild[];
  const manageable = userGuilds.filter((g) => hasManage(g.owner, g.permissions));

  // 2 + 3. Bot presence from both of the bot's authenticated connections.
  const bToken = botToken();
  const [gateway, restIds] = await Promise.all([
    botGatewayGuildIds(),
    bToken ? botRestGuildIds(bToken) : Promise.resolve(null),
  ]);

  // 4. Per-guild bot verification (Bot token membership check each).
  const servers: DetectedServer[] = await Promise.all(
    manageable.map(async (g): Promise<DetectedServer> => {
      const base: DetectedServer = {
        id: g.id,
        name: g.name,
        icon: iconUrl(g.id, g.icon),
        owner: g.owner,
        inUserGuilds: true,
        userCanManage: true,
        userPermissions: String(g.permissions ?? 0),
        botInGateway: gateway.ids ? gateway.ids.has(g.id) : null,
        botInRest: restIds ? restIds.has(g.id) : null,
        botInstalled: null,
        botOnlineInGuild: gateway.ids ? gateway.ids.has(g.id) : null,
        botPermissions: null,
        botIsAdmin: null,
        channelCount: null,
        categoryCount: null,
        roleCount: null,
        memberCount: typeof g.approximate_member_count === 'number' ? g.approximate_member_count : null,
        presenceCount: typeof g.approximate_presence_count === 'number' ? g.approximate_presence_count : null,
        botConnection: gateway.ids ? (gateway.ids.has(g.id) ? 'online' : 'unknown') : 'unknown',
        inviteUrl: inviteUrlFor(g.id),
        needsInvite: false,
        missingPermissions: false,
      };
      // Without a configured bot token nothing can be verified — report
      // unknown (never a false "not installed"). needsInvite stays false;
      // only a real 404 earns it (see merged.needsInvite below).
      if (!bToken) return { ...base, needsInvite: false };
      const verified = await verifyGuildWithBot(g.id, gateway.ids);
      const merged: DetectedServer = { ...base, ...verified, id: base.id, name: base.name, icon: base.icon, owner: base.owner };
      // Preserve the OAuth member count when the bot cannot see the guild.
      if (merged.memberCount === null) merged.memberCount = base.memberCount;
      if (merged.presenceCount === null) merged.presenceCount = base.presenceCount;
      merged.needsInvite = merged.botInstalled === false;
      // "Missing permissions": bot is in but holds no useful grant.
      if (merged.botInstalled && merged.botPermissions !== null) {
        try {
          const p = BigInt(merged.botPermissions);
          const useful = p & (BigInt(0x8) | BigInt(0x20) | BigInt(0x2000) | BigInt(0x100000));
          merged.missingPermissions = useful === BigInt(0);
        } catch { merged.missingPermissions = false; }
      }
      return merged;
    }),
  );

  servers.sort((a, b) => {
    const rank = (s: DetectedServer) => (s.botInstalled ? 0 : s.botInstalled === null ? 1 : 2);
    const d = rank(a) - rank(b);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });

  return {
    servers,
    meta: {
      botOnline: gateway.online,
      botGuildCount: gateway.count,
      userGuildCount: userGuilds.length,
      manageableCount: manageable.length,
      refreshedAt: new Date().toISOString(),
    },
  };
}

async function handleGet(req: NextRequest) {
  const guard = await requireSession();
  if (!guard.ok) {
    return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: guard.error }, { status: guard.status });
  }
  const url = req.nextUrl;
  const forceRefresh = url.searchParams.get('refresh') === '1';
  const onlyGuildId = url.searchParams.get('guildId') || '';

  function singleMeta(
    gateway: { online: boolean | null; count: number | null },
    userGuildCount: number,
    manageableCount: number,
  ) {
    return {
      botOnline: gateway.online,
      botGuildCount: gateway.count,
      userGuildCount,
      manageableCount,
      refreshedAt: new Date().toISOString(),
      cached: false,
    };
  }

  // Single-guild mode: the id is re-verified (user-manages + live bot check),
  // never trusted from the query string. Verifies ONLY this guild — running
  // full multi-guild detection here used to fire 5N bot-token calls plus a
  // user-guilds call for a single-server question, feeding the rate-limit
  // storm that surfaced as UNKNOWN/false-not-installed states.
  if (onlyGuildId) {
    if (!/^\d{5,25}$/.test(onlyGuildId)) {
      return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
    }
    const check = await requireGuildManage(guard.accessToken, onlyGuildId);
    if (!check.ok) {
      return NextResponse.json(
        { success: false, code: check.code, error: check.error },
        { status: check.status },
      );
    }
    const bToken = botToken();
    const gateway = await botGatewayGuildIds();
    const base: DetectedServer = {
      id: check.guild.id,
      name: check.guild.name,
      icon: iconUrl(check.guild.id, check.guild.icon),
      owner: check.guild.owner,
      inUserGuilds: true,
      userCanManage: true,
      userPermissions: String(check.guild.permissions ?? 0),
      botInGateway: gateway.ids ? gateway.ids.has(onlyGuildId) : null,
      botInRest: null,
      botInstalled: null,
      botOnlineInGuild: gateway.ids ? gateway.ids.has(onlyGuildId) : null,
      botPermissions: null,
      botIsAdmin: null,
      channelCount: null,
      categoryCount: null,
      roleCount: null,
      memberCount: null,
      presenceCount: null,
      botConnection: gateway.ids ? (gateway.ids.has(onlyGuildId) ? 'online' : 'unknown') : 'unknown',
      inviteUrl: inviteUrlFor(onlyGuildId),
      needsInvite: false,
      missingPermissions: false,
    };
    if (!bToken) {
      const { servers, meta } = { servers: [base], meta: singleMeta(gateway, 1, 1) };
      return NextResponse.json({ success: true, server: servers[0], meta });
    }
    const verified = await verifyGuildWithBot(onlyGuildId, gateway.ids);
    const merged: DetectedServer = { ...base, ...verified };
    merged.needsInvite = merged.botInstalled === false;
    return NextResponse.json({
      success: true,
      server: merged,
      meta: singleMeta(gateway, 1, 1),
    });
  }

  const cacheKey = `u:${guard.discordId}`;
  if (!forceRefresh) {
    const hit = LIST_CACHE.get(cacheKey);
    const mHit = META_CACHE.get(cacheKey);
    if (hit && mHit && Date.now() - hit.at < LIST_TTL_MS) {
      return NextResponse.json({ success: true, servers: hit.value, meta: { ...mHit.value, cached: true } });
    }
  }
  try {
    const { servers, meta } = await detectServers(guard.accessToken);
    LIST_CACHE.set(cacheKey, { at: Date.now(), value: servers });
    META_CACHE.set(cacheKey, {
      at: Date.now(),
      value: { botOnline: meta.botOnline, botGuildCount: meta.botGuildCount },
    });
    return NextResponse.json({ success: true, servers, meta: { ...meta, manageableCount: meta.manageableCount, cached: false } });
  } catch (e) {
    const err = e as { status?: number; error?: string };
    return NextResponse.json(
      { success: false, error: err?.error || 'Server detection failed' },
      { status: err?.status || 502 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handleGet(req);
}

// POST = explicit refresh (Refresh Servers button). Same payload, cache bypassed.
export async function POST(req: NextRequest) {
  const guard = await requireSession();
  if (!guard.ok) {
    return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: guard.error }, { status: guard.status });
  }
  LIST_CACHE.delete(`u:${guard.discordId}`);
  META_CACHE.delete(`u:${guard.discordId}`);
  return handleGet(req);
}
