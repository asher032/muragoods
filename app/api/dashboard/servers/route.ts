import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/app/lib/require-session';

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

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

// Least-privilege install URL for the running bot (no secret inside).
const BOT_PERMISSIONS = '271698944';

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN?.trim()
    || process.env.DISCORD_TOKEN?.trim()
    || null;
}

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
  if (owner) return true;
  try {
    const p = BigInt(perms);
    return (p & MANAGE_GUILD) !== BigInt(0) || (p & ADMINISTRATOR) !== BigInt(0);
  } catch {
    return false;
  }
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
  bToken: string,
  guildId: string,
  gatewayIds: Set<string> | null,
): Promise<Partial<DetectedServer>> {
  // Authoritative check: the bot token resolves ITSELF as a member of this
  // exact guild. 404/403 → not installed. Anything else → unknown, not false.
  const member = await fetchJson(
    `https://discord.com/api/v10/guilds/${guildId}/member/@me`,
    { Authorization: `Bot ${bToken}` },
  );
  if (!member.ok) {
    if (member.status === 404 || member.status === 403) {
      return { botInstalled: false, botOnlineInGuild: gatewayIds ? gatewayIds.has(guildId) && false : false, botConnection: 'offline' };
    }
    return { botInstalled: null, botOnlineInGuild: gatewayIds ? gatewayIds.has(guildId) : null, botConnection: gatewayIds ? (gatewayIds.has(guildId) ? 'online' : 'offline') : 'unknown' };
  }
  const m = member.data as { permissions?: string | number } | null;
  const perms = m && m.permissions !== undefined ? String(m.permissions) : null;
  let isAdmin: boolean | null = null;
  if (perms !== null) {
    try { isAdmin = (BigInt(perms) & ADMINISTRATOR) !== BigInt(0); } catch { isAdmin = null; }
  }

  // Enrichment: guild object (member counts), channels, roles — all via the
  // bot token so counts reflect what the BOT can actually see.
  const [guildRes, channelsRes, rolesRes] = await Promise.all([
    fetchJson(`https://discord.com/api/v10/guilds/${guildId}?with_counts=true`, { Authorization: `Bot ${bToken}` }),
    fetchJson(`https://discord.com/api/v10/guilds/${guildId}/channels`, { Authorization: `Bot ${bToken}` }),
    fetchJson(`https://discord.com/api/v10/guilds/${guildId}/roles`, { Authorization: `Bot ${bToken}` }),
  ]);

  let memberCount: number | null = null;
  let presenceCount: number | null = null;
  if (guildRes.ok && guildRes.data && typeof guildRes.data === 'object') {
    const g = guildRes.data as { approximate_member_count?: number; approximate_presence_count?: number };
    memberCount = typeof g.approximate_member_count === 'number' ? g.approximate_member_count : null;
    presenceCount = typeof g.approximate_presence_count === 'number' ? g.approximate_presence_count : null;
  }
  let channelCount: number | null = null;
  let categoryCount: number | null = null;
  if (channelsRes.ok && Array.isArray(channelsRes.data)) {
    const channels = channelsRes.data as Array<{ type?: number }>;
    channelCount = channels.length;
    categoryCount = channels.filter((c) => c.type === 4).length;
  }
  let roleCount: number | null = null;
  if (rolesRes.ok && Array.isArray(rolesRes.data)) {
    roleCount = (rolesRes.data as unknown[]).length;
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
    botConnection: inGateway === null ? 'unknown' : inGateway ? 'online' : 'offline',
  };
}

async function detectServers(accessToken: string): Promise<{
  servers: DetectedServer[];
  meta: { botOnline: boolean | null; botGuildCount: number | null; userGuildCount: number; manageableCount: number; refreshedAt: string };
}> {
  // 1. Live user guilds — the user's Discord authorization, right now.
  const userRes = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (userRes.status === 401) {
    throw { status: 401, error: 'Discord rejected the session token — sign in again' };
  }
  if (!userRes.ok) {
    throw { status: 502, error: `Discord API error ${userRes.status}` };
  }
  const userGuilds = (await userRes.json()) as UserGuild[];
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
        botConnection: gateway.ids ? (gateway.ids.has(g.id) ? 'online' : 'offline') : 'unknown',
        inviteUrl: inviteUrlFor(g.id),
        needsInvite: false,
        missingPermissions: false,
      };
      if (!bToken) return { ...base, needsInvite: true };
      const verified = await verifyGuildWithBot(bToken, g.id, gateway.ids);
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
    return NextResponse.json({ success: false, error: guard.error }, { status: guard.status });
  }
  const url = req.nextUrl;
  const forceRefresh = url.searchParams.get('refresh') === '1';
  const onlyGuildId = url.searchParams.get('guildId') || '';

  // Single-guild mode: the id is re-verified (user-manages + live bot check),
  // never trusted from the query string.
  if (onlyGuildId) {
    if (!/^\d{5,25}$/.test(onlyGuildId)) {
      return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
    }
    const { servers, meta } = await detectServers(guard.accessToken);
    const found = servers.find((s) => s.id === onlyGuildId);
    if (!found) {
      return NextResponse.json(
        { success: false, error: 'You do not manage that server, or it is not visible to your Discord authorization' },
        { status: 403 },
      );
    }
    return NextResponse.json({ success: true, server: found, meta });
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
    return NextResponse.json({ success: false, error: guard.error }, { status: guard.status });
  }
  LIST_CACHE.delete(`u:${guard.discordId}`);
  META_CACHE.delete(`u:${guard.discordId}`);
  return handleGet(req);
}
