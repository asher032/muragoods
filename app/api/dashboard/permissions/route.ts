import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';
import { discordConfigCollection } from '@/app/lib/discord-config';

export const dynamic = 'force-dynamic';

async function guard(token: string, guildId: string) {
  // Shared cached manage check (30s per token across ALL dashboard routes).
  // The old inline fetch ran uncached on every call and collapsed every
  // Discord failure into a false 'No permission' 403.
  const check = await requireGuildManage(token, guildId);
  if (check.ok) return null;
  return NextResponse.json(
    { success: false, code: check.code, error: check.error, retryable: check.retryable, debug: check.debug },
    { status: check.status },
  );
}

// GET /api/dashboard/permissions?guildId=xxx — check bot permissions in guild
export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  const guildId = req.nextUrl.searchParams.get('guildId');
  if (!token) return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Discord token required' }, { status: 401 });
  if (!botToken) return NextResponse.json({ success: false, error: 'Bot token not configured' }, { status: 503 });
  if (!guildId || !/^\d{5,25}$/.test(guildId)) return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });

  const denied = await guard(token, guildId);
  if (denied) return denied;

  if (!botToken) {
    return NextResponse.json({ success: false, error: 'Dashboard resource access is not configured' }, { status: 503 });
  }

  const [botMemberRes, botPermsRes] = await Promise.all([
    fetch(`https://discord.com/api/v10/guilds/${guildId}/members/@me`, {
      headers: { Authorization: `Bot ${botToken}` },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10000),
    }).then(async (r) => ({ status: r.status, data: r.ok ? await r.json().catch(() => null) : null }))
      .catch(() => ({ status: 0, data: null })),
    fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { Authorization: `Bot ${botToken}` },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(10000),
    }).then(async (r) => ({ status: r.status, data: r.ok ? await r.json().catch(() => null) : null }))
      .catch(() => ({ status: 0, data: null })),
  ]);
  const botMember = botMemberRes.data;
  const botPerms = botPermsRes.data;

  if (!botMember || !botPerms) {
    const statuses = [botMemberRes.status, botPermsRes.status];
    const code = statuses.includes(404)
      ? 'BOT_NOT_INSTALLED'
      : statuses.includes(401)
        ? 'BOT_TOKEN_REJECTED'
        : statuses.includes(429)
          ? 'RATE_LIMITED'
          : 'DISCORD_API_UNAVAILABLE';
    const message = code === 'BOT_NOT_INSTALLED'
      ? 'MuraBot is not installed on this server — invite it first.'
      : code === 'BOT_TOKEN_REJECTED'
        ? 'Discord rejected the dashboard bot credential (HTTP 401). Update DISCORD_BOT_TOKEN on the site host — do not re-invite the bot.'
        : code === 'RATE_LIMITED'
          ? 'Discord rate-limited the request — retry in a moment.'
          : 'Discord did not answer the bot permission read — retry in a moment.';
    return NextResponse.json(
      { success: false, code, error: message, retryable: code !== 'BOT_NOT_INSTALLED' && code !== 'BOT_TOKEN_REJECTED' },
      { status: code === 'BOT_NOT_INSTALLED' ? 404 : code === 'BOT_TOKEN_REJECTED' ? 503 : code === 'RATE_LIMITED' ? 429 : 502 },
    );
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
