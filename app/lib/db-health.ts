import { discordConfigCollection } from '@/app/lib/discord-config';

/**
 * Safe, human-readable database states.
 *
 * Never surfaces the connection string, username or password — a malformed
 * MONGODB_URI used to appear in API responses as the raw driver message
 * ("Invalid scheme, expected connection string ...") while /api/health only
 * said "offline", which made a three-week outage look like a mystery.
 */
export type DatabaseState =
  | 'READY'
  | 'CONFIGURATION_ERROR'
  | 'AUTHENTICATION_FAILED'
  | 'ENDPOINT_UNAVAILABLE'
  | 'TIMEOUT'
  | 'DATABASE_UNAVAILABLE';

export const DATABASE_MESSAGES: Record<DatabaseState, string> = {
  READY: 'Database: connected',
  CONFIGURATION_ERROR:
    'Database: MONGODB_URI is missing or is not a mongodb:// / mongodb+srv:// connection string',
  AUTHENTICATION_FAILED: 'Database: authentication failed (cluster rejected the credentials)',
  ENDPOINT_UNAVAILABLE: 'Database: cluster unreachable (DNS/network or IP allowlist)',
  TIMEOUT: 'Database: connection timed out (cluster unreachable or IP allowlist)',
  DATABASE_UNAVAILABLE: 'Database: unavailable (driver error while connecting)',
};

const PROBE_TIMEOUT_MS = 6000;

class ProbeTimeoutError extends Error {
  constructor() {
    super('database probe timed out');
    this.name = 'ProbeTimeoutError';
  }
}

/** Reads the same variable the rest of the app does, tolerating stray quotes/whitespace. */
export function resolveMongoUri(): string | null {
  const raw = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '').trim();
  return trimmed || null;
}

export function isMongoConnectionString(uri: string | null): uri is string {
  return !!uri && /^mongodb(\+srv)?:\/\//i.test(uri);
}

/** Removes anything that looks like a connection string so logs stay credential-free. */
export function scrubSecrets(text: string): string {
  return text
    .replace(/mongodb(\+srv)?:\/\/[^\s"']*/gi, 'mongodb://***')
    .replace(/[A-Za-z0-9_.-]{16,}@/g, '***@');
}

/** Maps a driver error to a safe category — never 'unknown'. */
export function classifyDatabaseError(error: unknown): DatabaseState {
  const name = error instanceof Error ? error.name : '';
  const message = scrubSecrets(error instanceof Error ? error.message : String(error ?? '')).toLowerCase();

  if (name === 'MongoParseError' || /invalid scheme|expected connection string|supported scheme|malformed|not a valid|must be a string/.test(message)) {
    return 'CONFIGURATION_ERROR';
  }
  if (/bad auth|authentication failed|auth failed|scram|credentials|not authorized|unauthorized/.test(message)) {
    return 'AUTHENTICATION_FAILED';
  }
  if (/timed out|timeout|etimedout|serverselectiontimeouterror/.test(message)) {
    return 'TIMEOUT';
  }
  if (/enotfound|econnrefused|econnreset|eai_again|getaddrinfo|querysrv|dns|not whitelisted|allowlist|ip address/.test(message)) {
    return 'ENDPOINT_UNAVAILABLE';
  }
  return 'DATABASE_UNAVAILABLE';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProbeTimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type DatabaseHealth = {
  state: DatabaseState;
  database: 'online' | 'offline';
  detail: { state: DatabaseState; message: string };
  responseTimeMs: number;
};

/**
 * Bounded liveness probe against the collection the site already uses
 * (murastream_bot.guild_config) so a healthy result means the same
 * connection string the rest of the app reads is genuinely usable.
 */
export async function probeDatabase(timeoutMs = PROBE_TIMEOUT_MS): Promise<DatabaseHealth> {
  const startedAt = Date.now();
  const finish = (state: DatabaseState): DatabaseHealth => ({
    state,
    database: state === 'READY' ? 'online' : 'offline',
    detail: { state, message: DATABASE_MESSAGES[state] },
    responseTimeMs: Date.now() - startedAt,
  });

  if (!isMongoConnectionString(resolveMongoUri())) {
    return finish('CONFIGURATION_ERROR');
  }

  try {
    const collection = await withTimeout(discordConfigCollection(), timeoutMs);
    await withTimeout(collection.estimatedDocumentCount(), timeoutMs);
    return finish('READY');
  } catch (error) {
    const state = error instanceof ProbeTimeoutError ? 'TIMEOUT' : classifyDatabaseError(error);
    const raw = error instanceof Error ? error.message : String(error);
    console.error('[db-health] database probe failed:', state, scrubSecrets(raw));
    return finish(state);
  }
}
