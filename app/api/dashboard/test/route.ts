import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API = 'https://discord.com/api/v10';
const ADMINISTRATOR = BigInt(0x8);
const PERMISSIONS = [
  ['View channel', BigInt(0x400)],
  ['Send messages', BigInt(0x800)],
  ['Embed links', BigInt(0x4000)],
  ['Manage channels', BigInt(0x10)],
] as const;

type Guild = { id: string; owner: boolean; permissions: string | number };
type Channel = { id: string; type: number; name: string; permission_overwrites?: Array<{ id: string; type: number; allow: string; deny: string }> };
type Role = { id: string; permissions: string };
type Member = { roles: string[] };

async function get<T>(path: string, token: string, bot = false): Promise<T | null> {
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `${bot ? 'Bot' : 'Bearer'} ${token}` },
    next: { revalidate: 0 },
  });
  return response.ok ? response.json() as Promise<T> : null;
}

export async function POST(req: NextRequest) {
  const userToken = req.headers.get('x-discord-token');
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  const body = await req.json().catch(() => null) as { guildId?: string; module?: string; channelId?: string; roleId?: string } | null;
  if (!userToken || !body?.guildId || !/^\d{5,25}$/.test(body.guildId)) {
    return NextResponse.json({ success: false, error: 'Valid Discord authorization and server are required' }, { status: 400 });
  }
  if (!botToken) return NextResponse.json({ success: false, error: 'DISCORD_BOT_TOKEN is not configured in Vercel' }, { status: 503 });

  const guilds = await get<Guild[]>('/users/@me/guilds', userToken);
  const guild = guilds?.find((item) => item.id === body.guildId);
  if (!guild || (!guild.owner && (BigInt(guild.permissions) & BigInt(0x20)) === BigInt(0) && (BigInt(guild.permissions) & BigInt(0x8)) === BigInt(0))) {
    return NextResponse.json({ success: false, error: 'You cannot manage this server' }, { status: 403 });
  }

  const [botUser, channels, roles] = await Promise.all([
    get<{ id: string }>(`/users/@me`, botToken, true),
    get<Channel[]>(`/guilds/${body.guildId}/channels`, botToken, true),
    get<Role[]>(`/guilds/${body.guildId}/roles`, botToken, true),
  ]);
  if (!botUser || !channels || !roles) return NextResponse.json({ success: false, error: 'MuraBot cannot read this server' }, { status: 502 });

  const channel = body.channelId ? channels.find((item) => item.id === body.channelId) : null;
  const member = await get<Member>(`/guilds/${body.guildId}/members/${botUser.id}`, botToken, true);
  const botRoleIds = new Set(member?.roles || []);
  let permissions = BigInt(0);
  for (const role of roles) {
    if (role.id === body.guildId || botRoleIds.has(role.id)) permissions |= BigInt(role.permissions);
  }
  const checks = channel ? PERMISSIONS.map(([name, bit]) => ({ name, ok: (permissions & ADMINISTRATOR) !== BigInt(0) || (permissions & bit) !== BigInt(0) })) : [{ name: 'Server resource access', ok: true }];
  const missing = checks.filter((check) => !check.ok).map((check) => check.name);
  return NextResponse.json({ success: missing.length === 0, module: body.module || 'module', channel: channel?.name || null, checks, missing }, { status: missing.length ? 403 : 200 });
}