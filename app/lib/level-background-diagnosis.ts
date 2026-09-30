// ── Who actually holds the level-card background? ───────────────────────
//
// The reported symptom — "I pick a background, I save, and the Discord card
// does not change" — has one indistinguishable cause: the dashboard's write and
// the bot's read land somewhere else. Every layer between them reports success.
// The picker updates, the save returns 200, the preview redraws, and the card
// on Discord is unchanged, because the two sides were never talking.
//
// So neither side is asked to explain itself. They are COMPARED, and the
// difference is reported as a specific broken link:
//
//   dashboard=duck-toast  bot=frog-sky   → the bot is ahead: a stale write, or
//                                          a different record on the bot side
//   dashboard=frog-sky    bot=duck-toast → THE REPORTED BUG: the bot is not
//                                          reading the record the dashboard
//                                          wrote. Cluster, database name, or
//                                          document shape.
//   dashboard=frog-sky    bot=<no doc>   → the bot has no guild_config document
//   both unset            → never configured
//
// The bot's answer is the only trustworthy one here: it comes from the bot's
// OWN connection, so it reflects what production actually renders.

export interface BotLevelBackground {
  /** Did the bot find a guild_config document at all? */
  documentFound: boolean;
  /** The database NAME the bot resolved (public; never a URI). */
  database: string | null;
  /** Which variable supplied that name. */
  databaseSource: string | null;
  /** The raw stored value, exactly as the bot found it. */
  raw: string | null;
  /** Which field name held it. */
  field: string | null;
  /** What the renderer will actually use. */
  resolved: string | null;
  asset: string | null;
  assetPresent: boolean;
  defaultTheme: string | null;
  valid: boolean;
  /**
   * When the running bot's source was written. Compared against the deployment
   * to tell "the bot is an older build" apart from "the bot is misconfigured" —
   * the two produce the same empty fields and completely different fixes.
   */
  buildFingerprint?: string | null;
}

export interface BackgroundDiagnosis {
  /** The dashboard's own stored value. */
  dashboard: string | null;
  /** The database the DASHBOARD wrote to. */
  dashboardDatabase: string | null;
  /** Which variable supplied the dashboard's URI. */
  dashboardUriSource: string | null;
  /** The bot's answer, or null when it could not be reached. */
  bot: BotLevelBackground | null;
  /** Why the bot could not be reached, when that is the case. */
  botError: { code: string; message: string } | null;
  /** What actually came back over the wire. Null only when never sent. */
  botHttp: {
    status: number | null;
    contentType: string | null;
    bodySnippet: string | null;
    durationMs: number;
  } | null;
  /** The verdict, naming the broken link. */
  verdict: 'MATCH' | 'BOT_AHEAD' | 'DASHBOARD_AHEAD' | 'NO_DOCUMENT' | 'UNVERIFIED' | 'STALE_BOT';
  /** One sentence the operator can act on. */
  explanation: string;
}

/**
 * Decide which link in the chain is broken, from the two observations.
 *
 * Pure function, so it can be tested without a database or a network.
 */
export function diagnoseBackground(
  dashboardValue: string | null | undefined,
  bot: BotLevelBackground | null,
  botError: { code: string; message: string } | null,
  botHttp?: { status: number | null } | null,
): Pick<BackgroundDiagnosis, 'verdict' | 'explanation'> {
  if (!bot && botError) {
    // A missing route is not "unverified, try again" — it is a version
    // mismatch between the running bot and this repository, and no amount of
    // re-saving will change it. Saying so plainly is the whole point of this
    // panel; the previous wording sent operators to re-pick a theme that was
    // already correct.
    if (botError.code === 'ROUTE_NOT_REGISTERED') {
      return {
        verdict: 'UNVERIFIED',
        explanation:
          'BROKEN LINK: DEPLOYMENT. Murabot is running, but the build it is running does not '
          + `include the level-card endpoints this dashboard calls (HTTP ${botHttp?.status ?? 404}). `
          + 'Nothing is wrong with your selection or your database — the running bot is an older '
          + 'version than this repository. Redeploy Murabot, then save again.',
      };
    }
    return {
      verdict: 'UNVERIFIED',
      explanation:
        `Murabot could not be asked what it has for this server (${botError.code}`
        + `${botHttp?.status ? `, HTTP ${botHttp.status}` : ''}). `
        + 'The dashboard value cannot be confirmed against the bot, so the card may or may not be using it.',
    };
  }
  if (!bot) {
    return {
      verdict: 'UNVERIFIED',
      explanation: 'Murabot did not answer, so what the Discord card is using is unknown.',
    };
  }

  const dash = typeof dashboardValue === 'string' && dashboardValue ? dashboardValue : null;

  if (!bot.documentFound && !dash) {
    return {
      verdict: 'NO_DOCUMENT',
      explanation:
        'This server has no saved level-card background, so the default is used. Pick one and save.',
    };
  }
  if (!bot.documentFound && dash) {
    return {
      verdict: 'DASHBOARD_AHEAD',
      explanation:
        `BROKEN LINK: DATABASE / RECORD. The dashboard saved "${dash}" but Murabot has NO `
        + 'guild_config document for this server. The two are not reading the same record — '
        + `the dashboard wrote to "${bot.database ?? 'its own database'}" and the bot reads `
        + `"${bot.database ?? 'an unknown database'}". Check MURABOT_MONGODB_URI and MURABOT_MONGO_DB on the site.`,
    };
  }

  const botValue = bot.raw ?? null;

  if (dash && botValue === dash) {
    return {
      verdict: 'MATCH',
      explanation: `Murabot has "${botValue}" for this server and will render it on the next /level. No restart needed.`,
    };
  }
  if (!dash && botValue) {
    return {
      verdict: 'BOT_AHEAD',
      explanation:
        `Murabot has "${botValue}" stored but the dashboard shows no selection. The dashboard is reading a different record than the bot writes.`,
    };
  }
  if (dash && !botValue) {
    return {
      verdict: 'DASHBOARD_AHEAD',
      explanation:
        `BROKEN LINK: DATABASE READ. The dashboard stored "${dash}" but Murabot reads NO background `
        + `for this server (database "${bot.database ?? 'unknown'}"). Either the two sides point at `
        + 'different databases, or the dashboard is writing the field under a name the bot does not read. '
        + 'Check MURABOT_MONGODB_URI and MURABOT_MONGO_DB on the site.',
    };
  }
  return {
    verdict: 'DASHBOARD_AHEAD',
    explanation:
      `BROKEN LINK: DATABASE READ. The dashboard stored "${dash ?? 'nothing'}" but Murabot reads `
      + `"${botValue ?? 'nothing'}". The two are not reading the same record.`,
  };
}
