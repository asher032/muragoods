import { sessionToken } from '@/app/lib/require-session';
import { NextRequest, NextResponse } from 'next/server';

// List Discord servers the authenticated user can manage (Manage Server or
// Administrator). Powers the dashboard's server selector. Requires the raw
// Discord access token from the OAuth session.

export const dynamic = 'force-dynamic';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

interface DashGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string | number;
  approximate_member_count?: number;
}

function hasManage(owner: boolean, perms: string | number): boolean {
  if (owner) return true;
  const p = BigInt(perms);
  return (p & MANAGE_GUILD) !== BigInt(0) || (p & ADMINISTRATOR) !== BigInt(0);
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
  const manageable = guilds
    .filter((g) => hasManage(g.owner, g.permissions))
    .map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
      owner: g.owner,
      members: g.approximate_member_count ?? null,
    }));
  return NextResponse.json({ success: true, guilds: manageable });
}
