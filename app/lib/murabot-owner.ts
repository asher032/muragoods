// ── Who may change Murabot's economic values ────────────────────────────
//
// The Murabot owner is a GLOBAL role: the person who owns the bot. It is not
// "an admin", not "the owner of the selected server", and not "anyone with
// Manage Server" — the bot owner must be able to set economy values for a
// server they do not administer, and a server admin who is not the bot owner
// must not be able to.
//
// The identity is a Discord USER ID, read from `MURABOT_OWNER_DISCORD_ID` —
// the same variable the bot process resolves (`bot/config.py`). Nothing here
// compares a username, a display name, a nickname or a tag: all of those are
// changeable by the account holder, so authorizing on one would either lock the
// real owner out after a rename or let whoever takes the name in.
//
// The id being compared ALWAYS comes from the server-side session document
// (`getSession().discordId`), which is written by the Discord OAuth callback
// and read from an HttpOnly cookie. It is never taken from a query string, a
// request body, localStorage or any other client-supplied value, so a forged
// request cannot claim ownership.

export const dynamic = 'force-dynamic';

export type OwnerDiagnostics = {
  /** Masked to the last four characters. Never the full value. */
  authenticatedDiscordUserId: string | null;
  configuredOwnerId: string | null;
  ownerConfigured: boolean;
  isOwner: boolean;
};

/**
 * The configured Murabot owner Discord user id, or null when the deployment
 * has not set it.
 *
 * Parsed strictly: a Discord snowflake is digits, and anything else (an empty
 * value, a username pasted into the variable, a `#tag`) yields null rather than
 * a value that could match nothing or — worse — match a name-shaped string.
 */
export function murabotOwnerDiscordId(): string | null {
  const raw = (process.env.MURABOT_OWNER_DISCORD_ID || '').trim();
  return /^\d{5,25}$/.test(raw) ? raw : null;
}

/**
 * Is this Discord account the Murabot owner?
 *
 * Numeric equality against the configured id. When nothing is configured the
 * answer is `false` — an unconfigured deployment must not be permissive, and
 * the reason is reported separately by {@link ownerConfigurationProblem} so
 * the operator sees why.
 */
export function isMurabotOwner(discordId: string | null | undefined): boolean {
  const owner = murabotOwnerDiscordId();
  if (!owner || !discordId) return false;
  const id = String(discordId).trim();
  return /^\d{5,25}$/.test(id) && id === owner;
}

/** Why nobody is an owner, when that is the case. Safe to show. */
export function ownerConfigurationProblem(): string | null {
  if (murabotOwnerDiscordId()) return null;
  return 'MURABOT_OWNER_DISCORD_ID is not set to a Discord user ID on this deployment, '
    + 'so owner-only Economy values cannot be changed. Set it to the owner\'s Discord user ID '
    + '(not their username) and restart.';
}

/** Mask a Discord id for display: `********9204`. */
function maskId(value: string | null): string | null {
  if (!value) return null;
  return value.length > 4 ? `********${value.slice(-4)}` : '********';
}

/**
 * Credential-free owner resolution, for development and admin diagnostics.
 *
 * Both ids are masked, so the line is enough to confirm "the ids match" or
 * "the wrong account is signed in" and useless for harvesting an id. The full
 * value never leaves the server and is never returned to a client.
 */
export function ownerDiagnostics(discordId: string | null | undefined): OwnerDiagnostics {
  const configured = murabotOwnerDiscordId();
  return {
    authenticatedDiscordUserId: maskId(discordId ? String(discordId).trim() : null),
    configuredOwnerId: maskId(configured),
    ownerConfigured: configured !== null,
    isOwner: isMurabotOwner(discordId),
  };
}

/** One development-only line. Never contains a token, secret or full id. */
export function logOwnerCheck(discordId: string | null | undefined, guildId: string, context: string): void {
  if (process.env.NODE_ENV !== 'development') return;
  const d = ownerDiagnostics(discordId);
  console.log(
    `[owner] context=${context} guild=${guildId} ` +
    `authenticatedDiscordUserId=${d.authenticatedDiscordUserId} ` +
    `configuredOwnerId=${d.configuredOwnerId} ` +
    `ownerConfigured=${d.ownerConfigured} isOwner=${d.isOwner}`,
  );
}
