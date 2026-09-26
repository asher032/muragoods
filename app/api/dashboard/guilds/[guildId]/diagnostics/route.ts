import { NextRequest, NextResponse } from 'next/server';
import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { botToken, verifyBotInGuild } from '@/app/lib/discord-bot';
import { discordConfigCollection } from '@/app/lib/discord-config';

// GET /api/dashboard/guilds/:guildId/diagnostics — per-check drill-down for
// the dashboard's data pipeline. Manage-gated (same bar as every other data
// route). Booleans and status codes only — never tokens, secrets, or user
// data. Each `false` maps to exactly one user-facing message, so a failure
// here identifies the failing branch instead of guessing "no permission".

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

async function probe(url: string, headers: Record<string, string>, timeoutMs = 8000): Promise<{ ok: boolean; status: number }> {
  try {
    const resp = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    return { ok: resp.ok, status: resp.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params;
  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' },
      { status: 400 },
    );
  }

  const token = await sessionToken();
  if (!token) {
    return NextResponse.json(
      { success: false, code: 'AUTH_REQUIRED', error: 'Sign in with Discord to continue' },
      { status: 401 },
    );
  }
  const manage = await requireGuildManage(token, guildId);
  if (!manage.ok) {
    // The manage check IS the user-side diagnosis — surface it verbatim.
    return NextResponse.json(
      { success: false, code: manage.code, error: manage.error, retryable: manage.retryable, debug: manage.debug },
      { status: manage.status },
    );
  }

  const bToken = botToken();
  const presence = await verifyBotInGuild(guildId);

  const [channels, roles, members, bridge, config] = await Promise.all([
    bToken ? probe(`${DISCORD_API}/guilds/${guildId}/channels`, { Authorization: `Bot ${bToken}` }) : { ok: false, status: -1 },
    bToken ? probe(`${DISCORD_API}/guilds/${guildId}/roles`, { Authorization: `Bot ${bToken}` }) : { ok: false, status: -1 },
    bToken ? probe(`${DISCORD_API}/guilds/${guildId}/members?limit=1`, { Authorization: `Bot ${bToken}` }) : { ok: false, status: -1 },
    (async () => {
      const secret = process.env.DISCORD_BRIDGE_SECRET || '';
      if (!secret) return { ok: false, status: -1 };
      return probe(`${BOT_BASE}/mod/overview/${guildId}`, { Authorization: `Bearer ${secret}` }, 15000);
    })(),
    (async () => {
      try {
        const collection = await discordConfigCollection();
        const doc = await collection.findOne({ guildId }, { projection: { _id: 1 } });
        return { ok: true as boolean, status: doc ? 200 : 404 };
      } catch {
        return { ok: false as boolean, status: 0 };
      }
    })(),
  ]);

  return NextResponse.json({
    success: true,
    guild: { id: manage.guild.id, name: manage.guild.name, reachable: channels.ok || roles.ok || members.ok },
    user: { authenticated: true, member: true, canManage: true, owner: manage.guild.owner },
    bot: {
      configured: Boolean(bToken),
      installed: presence === 'installed' ? true : presence === 'absent' ? false : null,
      bridgeReachable: bridge.ok,
      bridgeStatus: bridge.status,
    },
    discord: {
      channels: channels.ok, channelsStatus: channels.status,
      roles: roles.ok, rolesStatus: roles.status,
      members: members.ok, membersStatus: members.status,
    },
    database: {
      connected: config.status !== 0, guildConfig: config.status === 200, moderationData: bridge.ok,
    },
  });
}
