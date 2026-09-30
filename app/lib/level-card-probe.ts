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

/** Non-secret facts about the build that answered. */
export interface BotBuildInfo {
  service: string | null;
  version: string | null;
  commit: string | null;
  buildFingerprint: string | null;
  buildTime: string | null;
  environment: string | null;
  /** Which level-card endpoints this process actually registered. */
  levelingBackgroundRegistered: boolean | null;
  levelingConfigRegistered: boolean | null;
}

/**
 * Ask the running process which build it is.
 *
 * This exists because a 404 from `/leveling/background` is ambiguous on its
 * own: the same response means "stale deployment" and "wrong URL", and the
 * operator has no way to tell them apart — which is why this was reported as
 * a database problem for so long. `/health/version` is on the same public
 * `/health` surface that demonstrably works, so it answers even on a build too
 * old to have the level-card routes at all. That turns "some old build" into
 * a dated, checkable fact.
 *
 * Returns null when even that is unreachable; never throws, and never needs
 * the bridge secret.
 */
export async function askBotBuildInfo(): Promise<BotBuildInfo | null> {
  try {
    const res = await fetch(`${BOT_BASE}/health/version`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const p = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!p || p.ok !== true) return null;
    const registered = (p.levelingRoutesRegistered ?? {}) as Record<string, unknown>;
    return {
      service: typeof p.service === 'string' ? p.service : null,
      version: typeof p.version === 'string' ? p.version : null,
      commit: typeof p.commit === 'string' ? p.commit : null,
      buildFingerprint: typeof p.buildFingerprint === 'string' ? p.buildFingerprint : null,
      buildTime: typeof p.buildTime === 'string' ? p.buildTime : null,
      environment: typeof p.environment === 'string' ? p.environment : null,
      levelingBackgroundRegistered: registered.background === true,
      levelingConfigRegistered: registered.config === true,
    };
  } catch {
    return null;
  }
}

export interface BotProbeResult {
  bot: BotLevelBackground | null;
  error: { code: string; message: string } | null;
  /**
   * What actually came back over the wire, when the call did not succeed.
   * Collapsing every failure into one opaque code is what made this
   * undiagnosable: a 404 (the running bot predates the route) and a 500 (the
   * route exists and threw) both surfaced as the same "unavailable", so the
   * report could not say which, and the operator could not act on it.
   */
  http?: {
    status: number | null;
    contentType: string | null;
    /** First 200 chars of the body, for a 404/500 that is not JSON. */
    bodySnippet: string | null;
    /** How long the request took, in ms. */
    durationMs: number;
  };
  /** Present when the call failed, to date the build that answered. */
  build?: BotBuildInfo | null;
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
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${BOT_BASE}/leveling/background/${guildId}`, {
      headers: { Authorization: `Bearer ${bridgeSecret()}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return {
      bot: null,
      error: {
        code: 'BOT_OFFLINE',
        message: 'Murabot did not answer. It may be restarting — try again in a moment.',
      },
    };
  }

  // Read the body ONCE as text, then decide what it is. Reading it as JSON
  // first and falling back is what discarded the status code, which is the
  // single most useful thing this probe can learn.
  const contentType = res.headers.get('content-type');
  const bodyText = await res.text().catch(() => '');
  const http = {
    status: res.status,
    contentType,
    bodySnippet: bodyText.slice(0, 200) || null,
    durationMs: Date.now() - started,
  };
  let payload: Record<string, unknown> | null = null;
  try {
    payload = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    payload = null;
  }

  if (res.status === 401 || res.status === 403) {
    return {
      bot: null,
      http,
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: 'Murabot refused the dashboard\'s request; the shared connection secret does not match.',
      },
    };
  }
  if (res.status === 503) {
    return {
      bot: null,
      http,
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Murabot cannot reach its database right now.' },
    };
  }
  if (res.status === 404) {
    // Named specifically, because the fix is completely different from every
    // other failure here: the route is missing on the RUNNING process, which
    // means the deployed build predates the code that added it. Retrying,
    // re-saving, or changing the theme cannot help; the bot has to be
    // redeployed.
    //
    // The build is queried even though this request failed, because
    // /health/version lives on a surface that old builds DO have. Naming the
    // running build is the difference between "redeploy Murabot" and "redeploy
    // Murabot, and here is the build you are currently running".
    const build = await askBotBuildInfo();
    const known = build?.version ?? build?.buildFingerprint ?? null;
    return {
      bot: null,
      http,
      build,
      error: {
        code: 'ROUTE_NOT_REGISTERED',
        message: 'Murabot answered, but it has no /leveling/background endpoint. '
          + 'The running build predates that route, so it is serving an older '
          + 'version than this repository. '
          + (known
            ? `Running build: ${known}${build?.environment ? ` (${build.environment})` : ''}. `
            : '')
          + 'Redeploy Murabot; re-saving will not help.',
      },
    };
  }
  if (!payload || payload.ok !== true) {
    const code = typeof payload?.error === 'string' ? payload.error
      : res.ok ? 'BOT_API_UNAVAILABLE' : `HTTP_${res.status}`;
    return {
      bot: null,
      http,
      error: {
        code,
        message: payload
          ? 'Murabot returned an error for this level-card lookup.'
          : `Murabot returned HTTP ${res.status} with a non-JSON body, so its `
            + 'configuration could not be read.',
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
      buildFingerprint: typeof payload.buildFingerprint === 'string'
        ? payload.buildFingerprint : null,
    },
    error: null,
    http,
  };
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
    const bodyText = await res.text().catch(() => '');
    let payload: Record<string, unknown> | null = null;
    try {
      payload = JSON.parse(bodyText) as Record<string, unknown>;
    } catch {
      payload = null;
    }

    if (res.status === 404) {
      // The endpoint is missing on the running process. Saying "Murabot
      // refused the change" here is wrong and sends the operator to fix a
      // selection that was already valid: nothing was refused, the route is
      // simply not deployed.
      return {
        pushed: false, themeId: null,
        error: {
          code: 'ROUTE_NOT_REGISTERED',
          message: 'Murabot has no /leveling/config endpoint, so this change was never sent to it. '
            + 'The running build predates that route. Your selection was saved on the '
            + 'dashboard only; redeploy Murabot, then save again.',
        },
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        pushed: false, themeId: null,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Murabot rejected the dashboard\'s bridge secret. The shared secret on the site and the bot do not match.',
        },
      };
    }
    if (!res.ok || !payload || payload.ok !== true) {
      const code = typeof payload?.error === 'string' ? payload.error : `HTTP_${res.status}`;
      return {
        pushed: false, themeId: null,
        error: {
          code,
          message: res.status >= 500
            ? `Murabot returned HTTP ${res.status} and could not store the change. Your selection is saved on the dashboard; it is not in the bot's database yet.`
            : `Murabot returned HTTP ${res.status} and did not store the change. Your selection is saved on the dashboard only.`,
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
