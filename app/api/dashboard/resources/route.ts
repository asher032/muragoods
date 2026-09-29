import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { botToken } from '@/app/lib/discord-bot';
import { apiFail, logApi } from '@/app/lib/dashboard-response';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DISCORD_API = 'https://discord.com/api/v10';

// Channel types the dashboard can meaningfully offer. Threads are excluded:
// they are transient children, not configuration targets.
const SELECTABLE_CHANNEL_TYPES = [0, 2, 4, 5, 13, 15];

type DiscordChannel = {
  id: string; name: string; type: number; parent_id?: string | null;
  permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }>;
};
type DiscordRole = { id: string; name: string; managed: boolean; position: number; color: number };
type DiscordMember = {
  user?: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
  nick?: string | null; roles?: string[];
};
type DiscordBotMember = { user: { id: string }; roles: string[] };

function botDiscordGet<T>(path: string, token: string): Promise<{ data: T | null; status: number }> {
  return fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bot ${token}` },
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(10000),
  }).then(async (response) => ({
    data: response.ok ? (await response.json().catch(() => null) as T) : null,
    status: response.status,
  })).catch(() => ({ data: null, status: 0 }));
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    const userToken = (await sessionToken());
    const guildId = req.nextUrl.searchParams.get('guildId');
    const bToken = botToken();
    if (!userToken || !guildId || !/^\d{5,25}$/.test(guildId)) {
      logApi('/api/dashboard/resources', 'GET', !userToken ? 401 : 400, Date.now() - started, !userToken ? 'AUTH_REQUIRED' : 'INVALID_GUILD_ID');
      return NextResponse.json({
        success: false,
        code: !userToken ? 'AUTH_REQUIRED' : 'INVALID_GUILD_ID',
        error: !userToken ? 'Sign in with Discord to continue' : 'Valid guildId is required',
      }, { status: !userToken ? 401 : 400 });
    }
  if (!bToken) {
    logApi('/api/dashboard/resources', 'GET', 503, Date.now() - started, 'BOT_NOT_CONFIGURED');
    return NextResponse.json({
      success: false,
      code: 'BOT_NOT_CONFIGURED',
      error: 'Dashboard resource access is not configured. Add DISCORD_BOT_TOKEN to the Vercel project.',
    }, { status: 503 });
  }

  // The guildId always comes from the selector, never trusted: the caller's
  // live Discord authorization must show MANAGE rights on this exact guild.
  // requireGuildManage keeps dead tokens (401), non-membership, missing
  // permission and Discord outages as SEPARATE codes — a rate limit is never
  // reported as "no permission".
  // Any unexpected throw below becomes structured JSON — the frontend
  // expects JSON exclusively, so a platform HTML error page must never
  // escape this route (it would surface as an empty "couldn't load").
  // (Covered by the handler-wide try/catch with request logging below.)
  const manage = await requireGuildManage(userToken, guildId);
  if (!manage.ok) {
    logApi('/api/dashboard/resources', 'GET', manage.status, Date.now() - started, manage.code);
    return NextResponse.json(
      { success: false, code: manage.code, error: manage.error, retryable: manage.retryable, debug: manage.debug },
      { status: manage.status },
    );
  }

  // One Discord identity (the host's bot token) reads five endpoints. Each
  // resource is classified SEPARATELY below — a rejected credential (401),
  // a rate limit (429) and a Discord outage (5xx/timeout) must never again
  // collapse into "check that it is still installed". Only a real 404
  // (Discord does not know this guild for this credential) earns
  // BOT_NOT_INSTALLED.
  const [channelsRes, rolesRes, membersRes, botMemberRes, guildRes] = await Promise.all([
    botDiscordGet<DiscordChannel[]>(`/guilds/${guildId}/channels`, bToken),
    botDiscordGet<DiscordRole[]>(`/guilds/${guildId}/roles`, bToken),
    botDiscordGet<DiscordMember[]>(`/guilds/${guildId}/members?limit=1000`, bToken),
    botDiscordGet<DiscordBotMember>(`/guilds/${guildId}/members/@me`, bToken),
    botDiscordGet<{ id: string; name: string; approximate_member_count?: number }>(
      `/guilds/${guildId}?with_counts=true`, bToken),
  ]);
  const channels = channelsRes.data;
  const roles = rolesRes.data;
  const members = membersRes.data;
  const botMember = botMemberRes.data;
  const guild = guildRes.data;
  // Per-resource Discord statuses (numbers only — always safe to expose).
  const detail = {
    guildId,
    channelsStatus: channelsRes.status,
    rolesStatus: rolesRes.status,
    membersStatus: membersRes.status,
    botStatus: botMemberRes.status,
    guildStatus: guildRes.status,
  };
  if (!channels || !roles) {
    const statuses = [channelsRes.status, rolesRes.status, botMemberRes.status];
    if (statuses.includes(404)) {
      logApi('/api/dashboard/resources', 'GET', 404, Date.now() - started, 'BOT_NOT_INSTALLED');
      return NextResponse.json({
        success: false,
        code: 'BOT_NOT_INSTALLED',
        error: 'MuraBot is not installed on this server — invite it first.',
        retryable: false,
        detail,
      }, { status: 404 });
    }
    if (statuses.includes(401)) {
      // The site host's bot credential is dead (rotated token never updated
      // on this host is the classic cause). The bot itself can be online
      // and installed while this is broken — so this must NEVER read as
      // "not installed" and must never suggest re-inviting.
      logApi('/api/dashboard/resources', 'GET', 503, Date.now() - started, 'BOT_TOKEN_REJECTED');
      return NextResponse.json({
        success: false,
        code: 'BOT_TOKEN_REJECTED',
        error: 'Discord rejected the dashboard bot credential (HTTP 401). Update DISCORD_BOT_TOKEN on the site host to the bot\u2019s current token — do not re-invite the bot.',
        retryable: false,
        detail,
      }, { status: 503 });
    }
    if (statuses.includes(429)) {
      logApi('/api/dashboard/resources', 'GET', 429, Date.now() - started, 'RATE_LIMITED');
      return NextResponse.json({
        success: false,
        code: 'RATE_LIMITED',
        error: 'Discord rate-limited the request — retrying automatically.',
        retryable: true,
        detail,
      }, { status: 429 });
    }
    logApi('/api/dashboard/resources', 'GET', 502, Date.now() - started, 'DISCORD_API_UNAVAILABLE');
    return NextResponse.json({
      success: false,
      code: 'DISCORD_API_UNAVAILABLE',
      error: 'Discord did not answer the guild read — retry in a moment.',
      retryable: true,
      detail,
    }, { status: 502 });
  }

  const roleById = new Map(roles.map((r) => [r.id, r]));
  const memberRoleCounts = new Map<string, number>();
  const safeMembers = (members || []).filter((m) => m.user);
  for (const m of safeMembers) {
    for (const roleId of m.roles ?? []) {
      memberRoleCounts.set(roleId, (memberRoleCounts.get(roleId) ?? 0) + 1);
    }
  }

  const botRolePositions = (botMember?.roles ?? [])
    .map((id) => roleById.get(id)?.position ?? 0);
  const botTopRolePosition = botRolePositions.length ? Math.max(...botRolePositions) : null;

  // Guild-level bot permissions (approximate; per-channel overwrites are
  // resolved by the validate endpoint before saving).
  let botPermissions: string | null = null;
  const guildPerms = await botDiscordGet<{ permissions?: string }>(`/guilds/${guildId}`, bToken);
  if (guildPerms.data?.permissions !== undefined) botPermissions = String(guildPerms.data.permissions);

  const categories = new Map(channels.filter((c) => c.type === 4).map((c) => [c.id, c.name]));

  logApi('/api/dashboard/resources', 'GET', 200, Date.now() - started);
  return NextResponse.json({
    success: true,
    guild: guild ? { id: guild.id, name: guild.name, memberCount: guild.approximate_member_count ?? null } : null,
    channels: channels
      .filter((channel) => SELECTABLE_CHANNEL_TYPES.includes(channel.type))
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parent_id || null,
        parentName: (channel.parent_id && categories.get(channel.parent_id)) || null,
      })),
    roles: roles
      .filter((role) => !role.managed && role.id !== guildId)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
        color: role.color || 0,
        memberCount: memberRoleCounts.get(role.id) ?? 0,
      })),
    members: safeMembers.map((member) => ({
      id: member.user!.id,
      name: member.nick || member.user!.global_name || member.user!.username,
      username: member.user!.username,
      avatar: member.user!.avatar
        ? `https://cdn.discordapp.com/avatars/${member.user!.id}/${member.user!.avatar}.png?size=64`
        : null,
      bot: Boolean(member.user!.bot),
      roleIds: member.roles ?? [],
    })),
    bot: botMember ? {
      id: botMember.user.id,
      roleIds: botMember.roles,
      topRolePosition: botTopRolePosition,
      guildPermissions: botPermissions,
    } : null,
    // Per-resource read statuses: the UI keeps working sections usable when
    // only one leg (e.g. the member roster) fails instead of failing all.
    meta: { membersStatus: membersRes.status, guildStatus: guildRes.status },
  });
  } catch {
    logApi('/api/dashboard/resources', 'GET', 500, Date.now() - started, 'INTERNAL_ERROR');
    return apiFail('INTERNAL_ERROR', 'Server data request failed unexpectedly.', 500, { retryable: true });
  }
}
