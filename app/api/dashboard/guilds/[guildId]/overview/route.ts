import { NextRequest, NextResponse } from 'next/server';
import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';

// GET /api/dashboard/guilds/:guildId/overview — one authoritative payload
// for the dashboard Overview card:
//
//   guild:      id + name + icon + memberCount (live Discord count)
//   moderation: warnings / activeTimeouts / bans / actionsToday /
//               actionsThisWeek / openCases — REAL numbers from the bot's
//               guild-scoped database queries + live Discord reads
//
// Honesty rules (never violated):
//   - a genuine zero is returned as 0
//   - an unknowable value (bot lacks Ban Members, member intent gap) is
//     returned as null WITH unknown.bans/unknown.timeouts = true — the UI
//     renders "Unavailable", never a silent "—" and never a fake 0
//   - time windows are rolling UTC (last 24h / last 7d), computed once in
//     the bot; `windows` documents the exact strategy so today/week can
//     never mix Discord timestamps, server-local and browser-local time
//
// Error codes: AUTH_REQUIRED · INVALID_GUILD_ID · NOT_GUILD_MEMBER ·
// INSUFFICIENT_GUILD_PERMISSION · DISCORD_API_ERROR · BRIDGE_NOT_CONFIGURED ·
// BOT_NOT_IN_GUILD · BOT_FORBIDDEN · BOT_OFFLINE · BOT_ERROR.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BOT_BASE = process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

interface BridgeStats {
  byAction?: Record<string, number>;
  today?: number;
  week?: number;
  openCases?: number;
  warnings?: number;
  total?: number;
  bans?: number;
  activeTimeouts?: number;
  members?: number | null;
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
    return NextResponse.json(
      { success: false, code: manage.code, error: manage.error, retryable: manage.retryable, debug: manage.debug },
      { status: manage.status },
    );
  }

  const secret = process.env.DISCORD_BRIDGE_SECRET || '';
  if (!secret) {
    return NextResponse.json(
      { success: false, code: 'BRIDGE_NOT_CONFIGURED', error: 'Bot bridge is not configured.' },
      { status: 503 },
    );
  }

  let res: Response | null = null;
  let payload: unknown = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      res = await fetch(`${BOT_BASE}/mod/overview/${guildId}`, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      payload = await res.json().catch(() => null);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    res = null;
  }

  if (!res) {
    return NextResponse.json(
      { success: false, code: 'BOT_OFFLINE', error: 'Muragoods is currently offline — retry in a moment.', retryable: true },
      { status: 502 },
    );
  }
  const data = payload as { ok?: boolean; stats?: BridgeStats; error?: string } | null;
  if (!res.ok || !data || !data.ok || !data.stats) {
    const code = res.status === 404 ? 'BOT_NOT_IN_GUILD' : res.status === 403 ? 'BOT_FORBIDDEN' : 'MODERATION_DATA_FAILED';
    return NextResponse.json(
      {
        success: false, code,
        error: typeof data?.error === 'string' && data.error ? data.error : 'Moderation data could not be loaded.',
        retryable: res.status >= 500, debug: { guildId, botStatus: res.status },
      },
      { status: [400, 401, 403, 404, 409].includes(res.status) ? res.status : 502 },
    );
  }

  const s: BridgeStats = data.stats;
  // The bot reports -1 for counts it could not read (missing Discord
  // permission). -1 is NEVER a real count — surface null + unknown flags.
  const bans = typeof s.bans === 'number' && s.bans >= 0 ? s.bans : null;
  const activeTimeouts = typeof s.activeTimeouts === 'number' && s.activeTimeouts >= 0 ? s.activeTimeouts : null;
  return NextResponse.json({
    success: true,
    guild: {
      id: manage.guild.id,
      name: manage.guild.name,
      icon: manage.guild.icon,
      memberCount: typeof s.members === 'number' ? s.members : null,
    },
    moderation: {
      warnings: typeof s.warnings === 'number' ? s.warnings : 0,
      activeTimeouts,
      bans,
      actionsToday: typeof s.today === 'number' ? s.today : 0,
      actionsThisWeek: typeof s.week === 'number' ? s.week : 0,
      openCases: typeof s.openCases === 'number' ? s.openCases : 0,
    },
    unknown: { bans: bans === null, timeouts: activeTimeouts === null },
    windows: { today: 'rolling-24h', week: 'rolling-7d', timezone: 'UTC' },
  });
}
