import { sessionToken } from '@/app/lib/require-session';
import { requireGuildManage } from '@/app/lib/discord-guilds';
import { logApi, apiFail } from '@/app/lib/dashboard-response';
import { withDisplayNames } from '@/app/lib/discord-names';
import { economyConfig, economyOverview, withEconomyDb } from '@/app/lib/economy-store';
import { NextRequest, NextResponse } from 'next/server';

// GET ?guildId=… → overview + configuration, straight from the canonical
// Murabot collections the slash commands read.
//
// It used to be proxied to the bot process, which made every dashboard visit
// depend on that process being awake. The dashboard is already a declared
// client of the bot's cluster, so it reads the same wallet and ledger
// collections directly — same numbers, one less failure mode.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const started = Date.now();
  const token = await sessionToken();
  const guildId = (req.nextUrl.searchParams.get('guildId') || '').trim();
  // Shape check first (discloses nothing); the session and Manage Server checks
  // below still gate every data access.
  if (!/^\d{5,25}$/.test(guildId)) {
    return apiFail('INVALID_GUILD_ID', 'A valid Discord server ID is required.', 400);
  }
  if (!token) return apiFail('AUTH_REQUIRED', 'Sign in with Discord to continue', 401);
  const check = await requireGuildManage(token, guildId);
  if (!check.ok) {
    logApi('/api/dashboard/economy/overview', 'GET', check.status, Date.now() - started, check.code);
    return NextResponse.json(
      { success: false, code: check.code, error: check.error, retryable: check.retryable },
      { status: check.status },
    );
  }

  const read = await withEconomyDb('overview', guildId, async (db) => {
    const [overview, config] = await Promise.all([economyOverview(db, guildId), economyConfig(db, guildId)]);
    return { overview: { ...overview, top: await withDisplayNames(guildId, overview.top) }, config: config.config, configState: config.state };
  });

  if (!read.ok) {
    logApi('/api/dashboard/economy/overview', 'GET', 503, Date.now() - started, read.error.code);
    return NextResponse.json(
      { success: false, code: read.error.code, error: read.error.message, retryable: read.error.retryable },
      { status: 503 },
    );
  }
  logApi('/api/dashboard/economy/overview', 'GET', 200, Date.now() - started);
  return NextResponse.json({ success: true, ...read.data });
}
