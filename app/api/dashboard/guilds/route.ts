import { sessionToken } from '@/app/lib/require-session';
import { hasManageBits } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

// List Discord servers the authenticated user can manage (Manage Server or
// Administrator). Powers the dashboard's server selector. Requires the raw
// Discord access token from the OAuth session.

export const dynamic = 'force-dynamic';

interface DashGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string | number;
  approximate_member_count?: number;
}

function hasManage(owner: boolean, perms: string | number): boolean {
  return hasManageBits(owner, perms);
}

/** Live bot guild set from the bot's own gateway connection. null = unknown. */
async function botGatewayIds(): Promise<Set<string> | null> {
  try {
    const base = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '')
      || 'https://murastream-bot-pf11.onrender.com';
    const resp = await fetch(`${base}/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const data = (await resp.json().catch(() => null)) as { ok?: boolean; guild_ids?: string[] } | null;
    if (!data || data.ok === false) return null;
    return new Set((data.guild_ids ?? []).map(String));
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const token = (await sessionToken());
  if (!token) {
    return NextResponse.json({ success: false, error: 'Discord token required' }, { status: 401 });
  }
  const resp = await fetch('https://discord.com/api/v10/users/@me/guilds?with_counts=true', {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });
  if (!resp.ok) {
    return NextResponse.json(
      { success: false, error: 'Discord rejected the token — try logging in again' },
      { status: resp.status },
    );
  }
  const guilds = (await resp.json()) as DashGuild[];
  // Bot presence hint from the bot's own authenticated connection. This is a
  // hint only — per-guild verification lives in /api/dashboard/servers and
  // /api/dashboard/guilds/perimeter. Managing a server never implies install.
  const botIds = await botGatewayIds();
  const manageable = guilds
    .filter((g) => hasManage(g.owner, g.permissions))
    .map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
      owner: g.owner,
      members: g.approximate_member_count ?? null,
      botInstalled: botIds ? botIds.has(g.id) : null,
      botOnlineInGuild: botIds ? botIds.has(g.id) : null,
    }));
  return NextResponse.json({ success: true, guilds: manageable });
}
