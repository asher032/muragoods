import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);
const DISCORD_API = 'https://discord.com/api/v10';

type DiscordGuild = { id: string; owner: boolean; permissions: string | number };
type DiscordChannel = { id: string; name: string; type: number; parent_id?: string | null };
type DiscordRole = { id: string; name: string; managed: boolean; position: number };
type DiscordMember = { user?: { id: string; username: string; global_name?: string | null }; nick?: string | null };

function canManage(guild: DiscordGuild): boolean {
  if (guild.owner) return true;
  const permissions = BigInt(guild.permissions);
  return (permissions & MANAGE_GUILD) !== BigInt(0) || (permissions & ADMINISTRATOR) !== BigInt(0);
}

async function discordGet<T>(path: string, token: string, bot = false): Promise<T | null> {
  const response = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `${bot ? 'Bot' : 'Bearer'} ${token}` },
    next: { revalidate: 0 },
  });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

export async function GET(req: NextRequest) {
  const userToken = req.headers.get('x-discord-token');
  const guildId = req.nextUrl.searchParams.get('guildId');
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!userToken || !guildId || !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Discord token and valid guildId are required' }, { status: 400 });
  }
  if (!botToken) {
    return NextResponse.json({
      success: false,
      error: 'Dashboard resource access is not configured. Add DISCORD_BOT_TOKEN to the Vercel project.',
    }, { status: 503 });
  }

  const userGuilds = await discordGet<DiscordGuild[]>('/users/@me/guilds', userToken);
  const guild = userGuilds?.find((candidate) => candidate.id === guildId);
  if (!guild || !canManage(guild)) {
    return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });
  }

  const [channels, roles, members] = await Promise.all([
    discordGet<DiscordChannel[]>(`/guilds/${guildId}/channels`, botToken),
    discordGet<DiscordRole[]>(`/guilds/${guildId}/roles`, botToken),
    discordGet<DiscordMember[]>(`/guilds/${guildId}/members?limit=1000`, botToken),
  ]);
  if (!channels || !roles) {
    return NextResponse.json({
      success: false,
      error: 'MuraBot cannot read this server. Check that it is still installed and has the required permissions.',
    }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    channels: channels
      .filter((channel) => [0, 2, 4, 5].includes(channel.type))
      .map((channel) => ({ id: channel.id, name: channel.name, type: channel.type, parentId: channel.parent_id || null })),
    roles: roles
      .filter((role) => !role.managed && role.id !== guildId)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name })),
    members: (members || [])
      .filter((member) => member.user)
      .map((member) => ({
        id: member.user!.id,
        name: member.nick || member.user!.global_name || member.user!.username,
      })),
  });
}
