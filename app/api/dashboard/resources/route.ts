import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);
const DISCORD_API = 'https://discord.com/api/v10';

// Channel types the dashboard can meaningfully offer. Threads are excluded:
// they are transient children, not configuration targets.
const SELECTABLE_CHANNEL_TYPES = [0, 2, 4, 5, 13, 15];

type DiscordGuild = { id: string; owner: boolean; permissions: string | number };
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

function canManage(guild: DiscordGuild): boolean {
  if (guild.owner) return true;
  const permissions = BigInt(guild.permissions);
  return (permissions & MANAGE_GUILD) !== BigInt(0) || (permissions & ADMINISTRATOR) !== BigInt(0);
}

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN?.trim() || process.env.DISCORD_TOKEN?.trim() || null;
}

async function discordGet<T>(path: string, token: string, bot = false): Promise<T | null> {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `${bot ? 'Bot' : 'Bearer'} ${token}` },
    next: { revalidate: 0 },
  });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

async function manageableGuild(userToken: string, guildId: string): Promise<boolean> {
  const userGuilds = await discordGet<DiscordGuild[]>('/users/@me/guilds', userToken);
  const guild = userGuilds?.find((candidate) => candidate.id === guildId);
  return Boolean(guild && canManage(guild));
}

export async function GET(req: NextRequest) {
  const userToken = (await sessionToken());
  const guildId = req.nextUrl.searchParams.get('guildId');
  const bToken = botToken();
  if (!userToken || !guildId || !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Discord token and valid guildId are required' }, { status: 400 });
  }
  if (!bToken) {
    return NextResponse.json({
      success: false,
      error: 'Dashboard resource access is not configured. Add DISCORD_BOT_TOKEN to the Vercel project.',
    }, { status: 503 });
  }

  // The guildId always comes from the selector, never trusted: the caller's
  // live Discord authorization must show MANAGE rights on this exact guild.
  if (!(await manageableGuild(userToken, guildId))) {
    return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });
  }

  const [channels, roles, members, botMember, guild] = await Promise.all([
    discordGet<DiscordChannel[]>(`/guilds/${guildId}/channels`, bToken, true),
    discordGet<DiscordRole[]>(`/guilds/${guildId}/roles`, bToken, true),
    discordGet<DiscordMember[]>(`/guilds/${guildId}/members?limit=1000`, bToken, true),
    discordGet<DiscordBotMember>(`/guilds/${guildId}/members/@me`, bToken, true),
    discordGet<{ id: string; name: string; approximate_member_count?: number }>(
      `/guilds/${guildId}?with_counts=true`, bToken, true),
  ]);
  if (!channels || !roles) {
    return NextResponse.json({
      success: false,
      error: 'MuraBot cannot read this server. Check that it is still installed and has the required permissions.',
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
  const guildPerms = await discordGet<{ permissions?: string }>(`/guilds/${guildId}`, bToken, true);
  if (guildPerms?.permissions !== undefined) botPermissions = String(guildPerms.permissions);

  const categories = new Map(channels.filter((c) => c.type === 4).map((c) => [c.id, c.name]));

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
  });
}
