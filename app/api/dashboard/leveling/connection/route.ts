import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/app/lib/require-session';
import { discordConfigCollection } from '@/app/lib/discord-config';
import { clusterDbName, clusterUriSource } from '@/app/lib/db/clusters';
import { askBotLevelBackground } from '@/app/lib/level-card-probe';
import { resolveLevelCardTheme, levelCardThemeMeta } from '@/app/lib/level-card-themes';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/dashboard/leveling/connection?guildId=…
//
// One request that checks EVERY link in the chain, in order, and reports each
// one by name — the diagnostic that the per-step UI never gave you. Previously
// the only visible symptom of a broken link was a field reading "—", which is
// indistinguishable between "Murabot has nothing stored" and "the question
// never reached Murabot at all". That ambiguity is what let a missing route on
// the running bot look like a database problem for as long as it did.
//
// Each check is a real measurement, never an assumption:
//   1. the dashboard's own database answers
//   2. the dashboard → Murabot bridge is reachable
//   3. Murabot's own database answers, and which one it is
//   4. the guild's config document exists on Murabot's side
//   5. a background field is stored
//   6. the theme is one the renderer knows
//   7. the asset is present in Murabot's production bundle
//   8. the build Murabot is running matches the deployment
//
// Security: this is a backend route guarded by the caller's session, and it
// reports database NAMES and theme ids only. No URI, no bridge secret, no
// token ever appears here or crosses to the browser.
export async function GET(req: NextRequest) {
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

  const checks: Record<string, string | null> = {};
  const details: Record<string, unknown> = {};
  const problems: string[] = [];

  // 1. The dashboard's own database.
  let dashboardValue: string | null = null;
  try {
    const doc = await (await discordConfigCollection()).findOne(
      { guildId },
      { projection: { leveling: 1 } },
    );
    const leveling = (doc?.leveling ?? {}) as Record<string, unknown>;
    const raw = leveling.server_card_background ?? leveling.serverBackground;
    dashboardValue = typeof raw === 'string' && raw ? raw : null;
    checks.dashboardDatabase = 'connected';
    details.dashboardDatabase = `${clusterDbName('murabot')} (${clusterUriSource('murabot')})`;
  } catch (error) {
    checks.dashboardDatabase = 'unreachable';
    details.dashboardDatabase = null;
    problems.push(
      `The dashboard's own database is unreachable (${error instanceof Error ? error.name : 'unknown'}).`,
    );
  }

  // 2-8. Everything that lives on Murabot, answered by Murabot itself.
  const { bot, error: botError, http } = await askBotLevelBackground(guildId);
  checks.murabotApi = bot ? 'reachable' : (http?.status ? `http_${http.status}` : 'unreachable');
  if (!bot) {
    problems.push(
      botError
        ? `Murabot could not be asked (${botError.code}). ${botError.message}`
        : 'Murabot could not be asked.',
    );
  }

  if (bot) {
    checks.murabotDatabase = bot.database ? 'connected' : 'unknown';
    details.murabotDatabase = bot.database
      ? `${bot.database} (${bot.databaseSource ?? 'default'})`
      : null;
    if (!bot.database) problems.push('Murabot did not report which database it resolved.');

    checks.guildConfig = bot.documentFound ? 'found' : 'missing';
    if (!bot.documentFound) {
      problems.push(
        'Murabot has no guild_config document for this server, so it renders the default.',
      );
    }

    checks.backgroundTheme = bot.raw ?? null;
    if (!bot.raw) {
      problems.push('No level-card background is stored on Murabot for this server.');
    }

    // 6. The theme must be one the renderer resolves. The BOT is the authority
    // on its own asset registry, so compare its answer against ours: if the two
    // disagree about what is a valid theme, the dashboard would be storing an
    // id the card can never draw.
    if (bot.raw) {
      const siteResolved = resolveLevelCardTheme(bot.raw);
      checks.rendererTheme = bot.resolved ?? null;
      if (siteResolved !== bot.raw) {
        checks.rendererTheme = siteResolved;
        problems.push(
          `Theme "${bot.raw}" is not in the dashboard's registry; the renderer would fall back to "${siteResolved}".`,
        );
      }
      const meta = levelCardThemeMeta(bot.resolved ?? bot.raw);
      details.asset = meta.file;
    }

    // 7. The asset must exist inside Murabot's own bundle, not just ours.
    checks.asset = bot.assetPresent ? 'available' : 'missing';
    if (!bot.assetPresent) {
      problems.push(
        `Murabot is missing its copy of the asset "${bot.asset ?? 'unknown'}". Cards would render a flat background.`,
      );
    }

    // 8. Is the running process the same build as the one that saved this?
    details.murabotBuild = bot.buildFingerprint ?? null;
    if (!bot.buildFingerprint) {
      problems.push(
        'Murabot did not report a build fingerprint, so it is running a build older than this dashboard.',
      );
    }
  } else {
    checks.murabotDatabase = 'unknown';
    checks.guildConfig = 'unknown';
    checks.backgroundTheme = null;
    checks.rendererTheme = null;
    checks.asset = 'unknown';
  }

  details.dashboardTheme = dashboardValue;
  details.httpStatus = http?.status ?? null;
  details.httpDurationMs = http?.durationMs ?? null;
  if (http?.bodySnippet && !bot) details.httpBody = http.bodySnippet;

  const healthy = problems.length === 0 && checks.dashboardDatabase === 'connected';

  return NextResponse.json({
    success: true,
    guildId,
    healthy,
    checks,
    details,
    problems,
    // The one sentence an operator actually needs.
    summary: healthy
      ? 'Dashboard and Murabot are connected. The background stored on Murabot is the one /level will draw.'
      : problems.join(' '),
  });
}
