// ── Ask Murabot what IT reads for this guild's level card ───────────────
//
// The dashboard's own copy of the configuration cannot answer "why is the
// Discord card still the old background", because if the two sides were
// reading different records the dashboard's copy would look perfectly
// healthy. Only the bot knows what it will actually render.
//
// This asks the bot process, over the same bridge every other dashboard→bot
// call uses, and never invents an answer: every failure mode returns a named
// reason and a null result, so a caller can say "unknown" rather than
// "default theme".

import type { BotLevelBackground } from './level-background-diagnosis';

const BOT_BASE =
  process.env.BOT_HEALTH_URL?.replace(/\/health$/, '') || 'https://murastream-bot-pf11.onrender.com';

export const dynamic = 'force-dynamic';

export interface BotProbeResult {
  bot: BotLevelBackground | null;
  error: { code: string; message: string } | null;
}

function bridgeSecret(): string | null {
  const secret = (process.env.DISCORD_BRIDGE_SECRET || '').trim();
  return secret || null;
}

/**
 * What does Murabot have stored for this guild's level-card background?
 *
 * Cached for 15 seconds so opening the Leveling page does not call the bot on
 * every render; `?fresh=1` on the route bypasses it by construction (the route
 * is per-request).
 */
export async function askBotLevelBackground(guildId: string): Promise<BotProbeResult> {
  if (!bridgeSecret()) {
    return {
      bot: null,
      error: {
        code: 'BRIDGE_NOT_CONFIGURED',
        message: 'The dashboard is not connected to Murabot (no shared bridge secret), so the bot cannot be asked.',
      },
    };
  }
  try {
    const res = await fetch(`${BOT_BASE}/leveling/background/${guildId}`, {
      headers: { Authorization: `Bearer ${bridgeSecret()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403) {
      return {
        bot: null,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Murabot refused the dashboard\'s request; the shared connection secret does not match.',
        },
      };
    }
    if (res.status === 503) {
      return {
        bot: null,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Murabot cannot reach its database right now.' },
      };
    }
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload || payload.ok !== true) {
      const code = typeof payload?.error === 'string' ? payload.error : 'BOT_API_UNAVAILABLE';
      return {
        bot: null,
        error: {
          code,
          message: 'Murabot did not return its level-card configuration.',
        },
      };
    }
    return {
      bot: {
        documentFound: payload.documentFound === true,
        database: typeof payload.database === 'string' ? payload.database : null,
        databaseSource: typeof payload.databaseSource === 'string' ? payload.databaseSource : null,
        raw: typeof payload.raw === 'string' ? payload.raw : null,
        field: typeof payload.field === 'string' ? payload.field : null,
        resolved: typeof payload.resolved === 'string' ? payload.resolved : null,
        asset: typeof payload.asset === 'string' ? payload.asset : null,
        assetPresent: payload.assetPresent === true,
        defaultTheme: typeof payload.defaultTheme === 'string' ? payload.defaultTheme : null,
        valid: payload.valid === true,
      },
      error: null,
    };
  } catch {
    return {
      bot: null,
      error: {
        code: 'BOT_OFFLINE',
        message: 'Murabot did not answer. It may be restarting — try again in a moment.',
      },
    };
  }
}

/**
 * Push leveling config to Murabot so it lands in the database the RENDERER
 * reads.
 *
 * The dashboard writes `guild_config` itself, but it resolves the bot's cluster
 * from its own environment, where the bot's URI is only a fallback. When that
 * resolves to the site's own cluster, the write succeeds and the bot never
 * sees it — which is exactly the reported symptom. Writing through the bot
 * removes the second guess: the value is stored by the same connection the
 * card is rendered from.
 *
 * The site's own write already happened and is NOT rolled back if this fails;
 * the caller reports which path was used so the operator knows whether the
 * Discord card will reflect the change yet.
 */
export async function pushLevelConfigToBot(
  guildId: string,
  leveling: Record<string, unknown>,
): Promise<{ pushed: boolean; themeId: string | null; error: { code: string; message: string } | null }> {
  if (!bridgeSecret()) {
    return {
      pushed: false, themeId: null,
      error: {
        code: 'BRIDGE_NOT_CONFIGURED',
        message: 'The dashboard is not connected to Murabot, so the change was not pushed to the bot.',
      },
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BOT_BASE}/leveling/config/${guildId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bridgeSecret()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(leveling),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !payload || payload.ok !== true) {
      const code = typeof payload?.error === 'string' ? payload.error : `HTTP_${res.status}`;
      return {
        pushed: false, themeId: null,
        error: {
          code,
          message: res.status >= 500
            ? 'Murabot could not store the change. The dashboard saved it; the Discord card will pick it up once Murabot responds.'
            : 'Murabot refused the change. The dashboard saved it, but the Discord card still uses the previous background.',
        },
      };
    }
    return {
      pushed: true,
      themeId: typeof payload.server_card_background === 'string' ? payload.server_card_background : null,
      error: null,
    };
  } catch {
    return {
      pushed: false, themeId: null,
      error: {
        code: 'BOT_OFFLINE',
        message: 'Murabot could not be reached. The dashboard saved the change; the Discord card will pick it up once Murabot responds.',
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
