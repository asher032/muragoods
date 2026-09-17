import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';

async function getManageableGuilds(accessToken: string): Promise<Map<string, { id: string }>> {
  const MANAGE_GUILD = BigInt(0x20);
  const ADMINISTRATOR = BigInt(0x8);
  const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
    next: { revalidate: 0 },
  });
  if (!resp.ok) return new Map();
  const guilds = (await resp.json()) as Array<{ id: string; permissions: string | number; owner: boolean }>;
  return new Map(guilds.filter((g) => g.owner || (BigInt(g.permissions) & MANAGE_GUILD) !== BigInt(0) || (BigInt(g.permissions) & ADMINISTRATOR) !== BigInt(0)).map((g) => [g.id, { id: g.id }]));
}

// GET /api/dashboard/permissions?guildId=xxx — check bot permissions in guild
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  if (!botToken) return NextResponse.json({ success: false, error: 'Bot token not configured' }, { status: 503 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const manageable = await getManageableGuilds(token);
  if (!manageable.has(guildId)) return NextResponse.json({ success: false, error: 'You do not have permission to manage this server' }, { status: 403 });

  if (!botToken) {
    return NextResponse.json({ success: false, error: 'Dashboard resource access is not configured' }, { status: 503 });
  }

  const [botMember, botPerms] = await Promise.all([
    fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
      headers: { Authorization: `Bot ${botToken}` },
      next: { revalidate: 0 },
    }).then((r) => (r.ok ? r.json() : null)),
    fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${botToken}` },
      next: { revalidate: 0 },
    }).then((r) => (r.ok ? r.json() : null)),
  ]);

  if (!botMember || !botPerms) {
    return NextResponse.json({
      success: false,
      error: 'MuraBot cannot read this server. Check that it is still installed and has the required permissions.',
    }, { status: 502 });
  }

  const permissions = BigInt((botPerms as { permissions?: string | number }).permissions || 0);
  const permsList = [
    { name: 'ADMINISTRATOR', bit: BigInt(0x8), label: 'Administrator' },
    { name: 'MANAGE_GUILD', bit: BigInt(0x20), label: 'Manage Server' },
    { name: 'MANAGE_ROLES', bit: BigInt(0x10), label: 'Manage Roles' },
    { name: 'MANAGE_CHANNELS', bit: BigInt(0x80), label: 'Manage Channels' },
    { name: 'KICK_MEMBERS', bit: BigInt(0x2), label: 'Kick Members' },
    { name: 'BAN_MEMBERS', bit: BigInt(0x4), label: 'Ban Members' },
    { name: 'VIEW_CHANNEL', bit: BigInt(0x400), label: 'View Channel' },
    { name: 'SEND_MESSAGES', bit: BigInt(0x800), label: 'Send Messages' },
    { name: 'READ_MESSAGE_HISTORY', bit: BigInt(0x10), label: 'Read Message History' },
    { name: 'CONNECT', bit: BigInt(0x100000), label: 'Connect' },
    { name: 'SPEAK', bit: BigInt(0x200000), label: 'Speak' },
    { name: 'MANAGE_MESSAGES', bit: BigInt(0x20), label: 'Manage Messages' },
    { name: 'MODERATE_MEMBERS', bit: BigInt(0x40000), label: 'Moderate Members' },
  ];

  const result: Record<string, boolean> = {};
  for (const p of permsList) {
    result[p.name] = (permissions & p.bit) !== BigInt(0) || (permissions & BigInt(0x8)) !== BigInt(0);
  }

  return NextResponse.json({
    success: true,
    botUser: (botMember as { user?: { username: string; id: string; avatar?: string } }).user,
    permissions: result,
  });
}
