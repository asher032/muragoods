import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/app/lib/require-session';
import { discordConfigCollection } from '@/app/lib/discord-config';
import { clusterDbName, clusterUriSource } from '@/app/lib/db/clusters';
import { askBotLevelBackground } from '@/app/lib/level-card-probe';
import {
  diagnoseBackground,
  type BackgroundDiagnosis,
  type BotLevelBackground,
} from '@/app/lib/level-background-diagnosis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/dashboard/leveling/background?guildId=…
//
// Reports BOTH sides of the level-card chain for one guild and names the
// broken link when they disagree. It never writes anything.
//
// The dashboard's value is read from the same collection the save writes, and
// the bot's value is asked of the bot process itself, over the existing
// bridge. Neither is inferred: both are observed.
export async function GET(req: NextRequest) {
  const started = Date.now();
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_GUILD_ID', message: 'A valid guildId is required.' } },
      { status: 400 },
    );
  }

  const auth = await requireSession(guildId);
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: { code: auth.code ?? 'AUTH_REQUIRED', message: auth.error } },
      { status: auth.status },
    );
  }

  // 1. What the DASHBOARD holds — the record the save writes.
  let dashboardValue: string | null = null;
  let dashboardError: { code: string; message: string } | null = null;
  try {
    const doc = await (await discordConfigCollection()).findOne(
      { guildId },
      { projection: { leveling: 1 } },
    );
    const leveling = (doc?.leveling ?? {}) as Record<string, unknown>;
    const raw = leveling.server_card_background ?? leveling.serverBackground;
    dashboardValue = typeof raw === 'string' && raw ? raw : null;
  } catch (error) {
    dashboardError = {
      code: 'DASHBOARD_DATABASE_UNAVAILABLE',
      message: error instanceof Error ? error.name : 'unknown',
    };
  }

  // 2. What the BOT holds — the record it actually renders from.
  const { bot, error: botError } = await askBotLevelBackground(guildId);

  const diagnosis = diagnoseBackground(dashboardValue, bot, botError ?? dashboardError);
  const payload: BackgroundDiagnosis & { success: true; durationMs: number } = {
    success: true,
    dashboard: dashboardValue,
    dashboardDatabase: clusterDbName('murabot'),
    dashboardUriSource: clusterUriSource('murabot'),
    bot,
    botError: botError ?? dashboardError,
    verdict: diagnosis.verdict,
    explanation: diagnosis.explanation,
    durationMs: Date.now() - started,
  };
  console.log(
    `[level-bg] guild=${guildId} dashboard=${dashboardValue ?? '-'} `
    + `bot=${bot?.raw ?? '-'} botDb=${bot?.database ?? '-'} verdict=${diagnosis.verdict}`,
  );
  return NextResponse.json(payload);
}

// Keep the imported types referenced so the compiler enforces their shape.
export type { BotLevelBackground };
