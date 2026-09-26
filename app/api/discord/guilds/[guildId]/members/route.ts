import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { botToken } from '@/app/lib/discord-bot';

// GET /api/discord/guilds/:guildId/members?search=olin&limit=25
// Bounded member search for dashboard selectors — one reusable finder for
// member lookup, user selectors and role tools (never three systems).
//
//   auth:        session cookie (401 AUTH_REQUIRED when missing/dead)
//   permission:  caller must manage this guild (403 NOT_GUILD_MEMBER /
//                INSUFFICIENT_GUILD_PERMISSION — never conflated)
//   scope:       ONLY this guildId, from the path (400 INVALID_GUILD_ID)
//   data:        bot-token Discord REST, bounded to `limit` (max 100)
//   privacy:     id + username + display name + avatar only — no email,
//                no tokens, no presences
//
// Strategy: Discord's /members/search when the bot can use it, otherwise a
// bounded /members list filtered server-side. Either way the browser never
// downloads the whole roster on every keystroke.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DISCORD_API = 'https://discord.com/api/v10';

type RestMember = {
  user?: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
  nick?: string | null;
};

function shape(m: RestMember) {
  const u = m.user!;
  return {
    id: u.id,
    username: u.username,
    displayName: m.nick || u.global_name || u.username,
    avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : null,
    bot: Boolean(u.bot),
  };
}

async function botGet(path: string, token: string): Promise<{ status: number; data: unknown }> {
  try {
    const resp = await fetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    return { status: resp.status, data: resp.ok ? await resp.json().catch(() => null) : null };
  } catch {
    return { status: 0, data: null };
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params;
  const search = (req.nextUrl.searchParams.get('search') || '').trim().slice(0, 64);
  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get('limit') || 25) || 25));
  if (!guildId || !/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' },
      { status: 400 },
    );
  }

  const guard = await requireSession();
  if (!guard.ok) {
    return NextResponse.json(
      { success: false, code: 'AUTH_REQUIRED', error: guard.error },
      { status: guard.status },
    );
  }
  const manage = await requireGuildManage(guard.accessToken, guildId);
  if (!manage.ok) {
    return NextResponse.json(
      { success: false, code: manage.code, error: manage.error, retryable: manage.retryable, debug: manage.debug },
      { status: manage.status },
    );
  }

  const bToken = botToken();
  if (!bToken) {
    return NextResponse.json(
      { success: false, code: 'BOT_NOT_CONFIGURED', error: 'Dashboard resource access is not configured (DISCORD_BOT_TOKEN).' },
      { status: 503 },
    );
  }

  const q = search.toLowerCase();
  // Prefer the indexed search endpoint; fall back to a bounded list scan.
  if (q) {
    const found = await botGet(
      `/guilds/${guildId}/members/search?query=${encodeURIComponent(search)}&limit=${limit}`,
      bToken,
    );
    if (found.status !== 0 && found.status !== 403 && found.status !== 404 && Array.isArray(found.data)) {
      const members = (found.data as RestMember[])
        .filter((m) => m.user)
        .slice(0, limit)
        .map(shape);
      return NextResponse.json({ success: true, members, total: members.length, truncated: false });
    }
    if (found.status === 404) {
      return NextResponse.json(
        { success: false, code: 'BOT_NOT_INSTALLED', error: 'MuraBot is not installed on this server.' },
        { status: 404 },
      );
    }
  }

  const listed = await botGet(`/guilds/${guildId}/members?limit=1000`, bToken);
  if (!Array.isArray(listed.data)) {
    if (listed.status === 404) {
      return NextResponse.json(
        { success: false, code: 'BOT_NOT_INSTALLED', error: 'MuraBot is not installed on this server.' },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        success: false, code: 'MEMBER_FETCH_FAILED', error: 'Members could not be loaded — retry in a moment.',
        retryable: true, debug: { guildId, discordStatus: listed.status },
      },
      { status: 502 },
    );
  }
  const pool = (listed.data as RestMember[]).filter((m) => m.user);
  const matched = q
    ? pool.filter((m) => {
        const name = (m.nick || m.user!.global_name || m.user!.username).toLowerCase();
        return name.includes(q) || m.user!.username.toLowerCase().includes(q) || m.user!.id.includes(search);
      })
    : pool;
  const members = matched.slice(0, limit).map(shape);
  return NextResponse.json({
    success: true, members, total: members.length, truncated: matched.length > members.length,
  });
}
