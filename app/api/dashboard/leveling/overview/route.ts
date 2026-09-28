import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { NextRequest, NextResponse } from 'next/server';

// GET ?guildId= → leveling overview from the bot (same xp collection the
// listeners and slash commands use — never a parallel store).

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

export async function GET(req: NextRequest) {
  const token = await sessionToken();
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!token) {
    return NextResponse.json({ success: false, code: 'AUTH_REQUIRED', error: 'Sign in with Discord to continue' }, { status: 401 });
  }
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, code: 'INVALID_GUILD_ID', error: 'Valid guildId required' }, { status: 400 });
  }
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    return NextResponse.json(
      { success: false, code: check.code, error: check.error, retryable: check.retryable },
      { status: check.status },
    );
  }
  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) {
    return NextResponse.json({ success: false, code: 'BRIDGE_NOT_CONFIGURED', error: 'Bot bridge is not configured.' }, { status: 503 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res: Response | null = null;
  let payload: unknown = null;
  try {
    res = await fetch(`${BOT_BASE}/leveling/overview/${guildId}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    payload = await res.json().catch(() => null);
  } catch {
    res = null;
  } finally {
    clearTimeout(timer);
  }
  if (!res) {
    return NextResponse.json({ success: false, code: 'BOT_OFFLINE', error: 'Muragoods is currently offline — retry in a moment.', retryable: true }, { status: 502 });
  }
  const data = payload as { ok?: boolean; overview?: unknown; config?: unknown; error?: string } | null;
  if (!res.ok || !data || !data.ok) {
    return NextResponse.json(
      { success: false, code: 'LEVELING_DATA_FAILED', error: typeof data?.error === 'string' && data.error ? data.error : 'Leveling data could not be loaded.', retryable: res.status >= 500 },
      { status: [400, 401, 403, 404, 409].includes(res.status) ? res.status : 502 },
    );
  }
  return NextResponse.json({ success: true, overview: data.overview, config: data.config });
}
