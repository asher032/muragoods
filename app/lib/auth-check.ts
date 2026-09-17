export interface AuthorizationResult {
  authorized: boolean;
  userId: string;
  guildId: string;
  error: string;
}

interface DiscordGuild {
  id: string;
  owner: boolean;
  permissions?: string | number;
}

interface DiscordUser {
  id: string;
}

const DISCORD_API_URL = 'https://discord.com/api/v10';
const FETCH_TIMEOUT_MS = 5000;
const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);
const GUILD_ID_PATTERN = /^\d{17,20}$/;

function unauthorized(guildId: string, error: string): AuthorizationResult {
  return {
    authorized: false,
    userId: '',
    guildId,
    error,
  };
}

function hasRequiredPermission(permissions: unknown): boolean {
  let value: bigint;

  if (typeof permissions === 'string') {
    try {
      value = BigInt(permissions);
    } catch {
      return false;
    }
  } else if (typeof permissions === 'number' && Number.isSafeInteger(permissions) && permissions >= 0) {
    value = BigInt(permissions);
  } else {
    return false;
  }

  return (value & MANAGE_GUILD) !== BigInt(0) || (value & ADMINISTRATOR) !== BigInt(0);
}

function isDiscordGuild(value: unknown): value is DiscordGuild {
  if (typeof value !== 'object' || value === null) return false;

  const guild = value as Partial<DiscordGuild>;
  return typeof guild.id === 'string'
    && typeof guild.owner === 'boolean'
    && (guild.permissions === undefined
      || typeof guild.permissions === 'string'
      || typeof guild.permissions === 'number');
}

function isDiscordUser(value: unknown): value is DiscordUser {
  return typeof value === 'object'
    && value !== null
    && typeof (value as Partial<DiscordUser>).id === 'string'
    && (value as Partial<DiscordUser>).id !== '';
}

async function fetchWithTimeout(url: string, token: string): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) throw new Error('Discord request timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkAuthorization(
  token: string,
  guildId: string,
): Promise<AuthorizationResult> {
  const normalizedGuildId = guildId.trim();
  const accessToken = token.trim();

  if (!accessToken) {
    return unauthorized(normalizedGuildId, 'Discord token required');
  }

  if (!GUILD_ID_PATTERN.test(normalizedGuildId)) {
    return unauthorized(normalizedGuildId, 'Valid guildId required');
  }

  try {
    const guildsResponse = await fetchWithTimeout(`${DISCORD_API_URL}/users/@me/guilds`, accessToken);

    if (!guildsResponse.ok) {
      const message = guildsResponse.status === 401 || guildsResponse.status === 403
        ? 'Discord token is invalid or expired'
        : `Discord API request failed (${guildsResponse.status})`;
      return unauthorized(normalizedGuildId, message);
    }

    const guilds = await guildsResponse.json().catch(() => null);
    if (!Array.isArray(guilds)) {
      return unauthorized(normalizedGuildId, 'Discord returned an invalid guild list');
    }

    const guild = guilds.find(
      (candidate): candidate is DiscordGuild => isDiscordGuild(candidate) && candidate.id === normalizedGuildId,
    );

    if (!guild || (!guild.owner && !hasRequiredPermission(guild.permissions))) {
      return unauthorized(normalizedGuildId, 'You are not authorized to manage this guild');
    }

    const userResponse = await fetchWithTimeout(`${DISCORD_API_URL}/users/@me`, accessToken);
    if (!userResponse.ok) {
      const message = userResponse.status === 401 || userResponse.status === 403
        ? 'Discord token is invalid or expired'
        : `Discord API request failed (${userResponse.status})`;
      return unauthorized(normalizedGuildId, message);
    }

    const user = await userResponse.json().catch(() => null);
    if (!isDiscordUser(user)) {
      return unauthorized(normalizedGuildId, 'Discord returned an invalid user profile');
    }

    return {
      authorized: true,
      userId: user.id,
      guildId: normalizedGuildId,
      error: '',
    };
  } catch (error) {
    return unauthorized(
      normalizedGuildId,
      error instanceof Error && error.message === 'Discord request timed out'
        ? 'Discord request timed out'
        : 'Unable to contact Discord',
    );
  }
}
