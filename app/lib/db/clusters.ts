/**
 * The canonical database-cluster contract for the whole ecosystem.
 *
 * There is ONE place that decides which environment variable means which
 * cluster. The site, the dashboard and the bot all resolve their URI through
 * this mapping, so "the dashboard must talk to the same cluster as the bot"
 * becomes a property of the configuration rather than a convention someone
 * has to remember. `scripts/test_db_architecture.py` asserts the Python side
 * matches this table, so the two cannot drift.
 *
 * ---------------------------------------------------------------------------
 * SECURITY: nothing in this module may return, log, or embed a connection
 * string. `resolveClusterUri` is the only function that reads one, it is not
 * exported, and every error it can produce names the VARIABLE that is missing
 * or malformed — never its value. Connection errors are classified into the
 * closed set in `@/app/lib/db-health` for the same reason.
 * ---------------------------------------------------------------------------
 */

import { isMongoConnectionString, scrubSecrets, classifyDatabaseError, type DatabaseState } from '@/app/lib/db-health';
import { MongoClient } from 'mongodb';

export type ClusterName = 'muragoods' | 'murabot' | 'players';

export type ClusterSpec = {
  /** What this cluster owns. Mirrors the ownership rule in the architecture. */
  readonly owns: string;
  /**
   * Whether this cluster is a source of truth for WHO a person is.
   *
   * Exactly one cluster may be `true`. This is the machine-checkable form of
   * "one canonical identity": a second `true` would mean two login systems,
   * which is the failure the whole layout exists to prevent.
   */
  readonly identityAuthority: boolean;
  /**
   * Declared but not connected to. A cluster listed here with no call site is
   * still reported by /api/health, so an operator can see it exists instead of
   * discovering it from a missing screen.
   */
  readonly status: 'active' | 'legacy';
  /** The variable that should be set in every deployment. */
  readonly primary: string;
  /**
   * Accepted only so an existing deployment keeps working during the
   * migration to the named variables. Order matters: first non-empty wins.
   */
  readonly fallbacks: readonly string[];
  /** Per-cluster database name variable, then the shared one, then a default. */
  readonly dbVars: readonly string[];
  readonly defaultDb: string;
};

export const CLUSTERS: Record<ClusterName, ClusterSpec> = {
  // Source of truth for canonical identity: accounts, auth, main profile,
  // and the Murashop/Murastream content that belongs to a person.
  muragoods: {
    owns: 'canonical user identity, accounts, authentication, main profile',
    identityAuthority: true,
    status: 'active',
    primary: 'MURAGOODS_MONGODB_URI',
    fallbacks: ['MONGODB_URI'],
    dbVars: ['MURAGOODS_MONGO_DB', 'MONGO_DB'],
    defaultDb: 'muragoods',
  },
  // Source of truth for everything the bot owns. The dashboard is a client
  // of this cluster and must never hold a copy of it.
  murabot: {
    owns: 'guild config, economy, inventory, items, shop, market, jobs, moderation, leveling',
    identityAuthority: false,
    status: 'active',
    primary: 'MURABOT_MONGODB_URI',
    fallbacks: ['MONGODB_URI', 'MONGO_URI'],
    dbVars: ['MURABOT_MONGO_DB', 'DISCORD_BOT_MONGO_DB', 'MONGO_DB'],
    defaultDb: 'murastream_bot',
  },
  // A THIRD, older cluster holds player/user rows. It is declared here for two
  // reasons: so it is visible in /api/health instead of being an invisible
  // database nobody remembers, and so it is obvious that it is NOT an identity
  // authority. Nothing authenticates against it and nothing writes to it.
  //
  // Its contents are reconciled INTO `muragoods` by
  // `scripts/audit-db-consistency.mjs`, which reports and never deletes. Until
  // that reconciliation has been reviewed by a human, this cluster is the
  // reason a person could still exist twice — so it is declared rather than
  // quietly ignored. See DATABASE_SETUP.md.
  players: {
    owns: 'legacy player rows pending reconciliation into the canonical identity',
    identityAuthority: false,
    status: 'legacy',
    primary: 'MURAGOODS_PLAYERS_MONGODB_URI',
    fallbacks: ['PLAYERS_MONGODB_URI'],
    dbVars: ['MURAGOODS_PLAYERS_MONGO_DB', 'PLAYERS_MONGO_DB'],
    defaultDb: 'players',
  },
};

/** Every variable this module may read, for the migration/audit tooling. */
export function clusterEnvNames(cluster: ClusterName): string[] {
  const spec = CLUSTERS[cluster];
  return [spec.primary, ...spec.fallbacks];
}

function readVar(name: string): string | null {
  const raw = process.env[name];
  if (!raw) return null;
  // Tolerate a pasted value that kept its quotes or trailing whitespace.
  const trimmed = raw.trim().replace(/^["']|["']$/g, '').trim();
  return trimmed || null;
}

export class DatabaseConfigError extends Error {
  readonly state: DatabaseState;
  /** The variable that is wrong — its value is never included. */
  readonly variable: string | null;

  constructor(variable: string | null, state: DatabaseState) {
    super(
      state === 'CONFIGURATION_ERROR' && variable
        ? `${variable} is not set to a mongodb:// or mongodb+srv:// connection string`
        : 'Database connection is not configured',
    );
    this.name = 'DatabaseConfigError';
    this.state = state;
    this.variable = variable;
  }
}

/**
 * Resolve a cluster's URI, trying the primary variable first.
 *
 * NOT exported: callers get a live `MongoClient` instead, so no route handler
 * or component can accidentally serialise a connection string into a response.
 */
function resolveClusterUri(cluster: ClusterName): string {
  const spec = CLUSTERS[cluster];
  for (const name of [spec.primary, ...spec.fallbacks]) {
    const value = readVar(name);
    if (value && isMongoConnectionString(value)) return value;
  }
  // Report the PRIMARY name even when a fallback was the one that was set but
  // malformed — the fix is always "set the primary", and naming the fallback
  // would invite someone to keep the old single-URI setup alive.
  throw new DatabaseConfigError(spec.primary, 'CONFIGURATION_ERROR');
}

/** Which variable actually supplied the URI — safe to log, it is just a name. */
export function clusterUriSource(cluster: ClusterName): string | null {
  const spec = CLUSTERS[cluster];
  for (const name of [spec.primary, ...spec.fallbacks]) {
    const value = readVar(name);
    if (value && isMongoConnectionString(value)) return name;
  }
  return null;
}

/** The database NAME for a cluster. Names are not secret, so this is safe. */
export function clusterDbName(cluster: ClusterName): string {
  const spec = CLUSTERS[cluster];
  for (const name of spec.dbVars) {
    const value = readVar(name);
    if (value) return value;
  }
  return spec.defaultDb;
}

export type ClusterStatus = {
  cluster: ClusterName;
  /** Variable name that supplied the URI, or null when unset. */
  configuredFrom: string | null;
  database: string;
  ok: boolean;
  state: DatabaseState;
  responseTimeMs: number;
};

// One cached client per cluster. Two clusters means two pools; the same
// cluster resolved twice still means exactly one pool, which is the point —
// a new connection per request is what exhausts the server's connection limit
// on a serverless runtime.
const clients = new Map<ClusterName, Promise<MongoClient>>();

function clientFor(cluster: ClusterName): Promise<MongoClient> {
  const existing = clients.get(cluster);
  if (existing) return existing;

  const uri = resolveClusterUri(cluster);
  const promise = new MongoClient(uri, {
    serverSelectionTimeoutMS: 6000,
    connectTimeoutMS: 6000,
    socketTimeoutMS: 10000,
    // Pooling: the driver multiplexes concurrent operations over a small
    // number of sockets, so a burst of dashboard traffic opens a handful of
    // connections rather than one per in-flight request.
    maxPoolSize: 10,
    minPoolSize: 0,
    maxIdleTimeMS: 30000,
    retryWrites: true,
  }).connect();

  // A failed connect must not poison the process: drop the cached rejection so
  // the next request retries instead of awaiting the same failure until restart.
  promise.catch(() => {
    clients.delete(cluster);
  });

  clients.set(cluster, promise);
  return promise;
}

/**
 * A pooled database handle for a cluster.
 *
 * Throws `DatabaseConfigError` (naming a variable, never a value) when the
 * cluster is unconfigured, and otherwise lets a driver error propagate —
 * callers that need a value should use `withDatabase`, which converts it into
 * a safe state instead.
 */
export async function clusterDb(cluster: ClusterName) {
  const client = await clientFor(cluster);
  return client.db(clusterDbName(cluster));
}

export async function clusterCollection<T extends import('mongodb').Document = import('mongodb').Document>(
  cluster: ClusterName,
  name: string,
): Promise<import('mongodb').Collection<T>> {
  return (await clusterDb(cluster)).collection<T>(name);
}

/**
 * Run `fn` against a cluster, converting any failure into a safe state.
 *
 * The caller gets `{ ok, data, error }` where `error.message` is scrubbed, so
 * a driver message that happens to embed the URI cannot reach a log line, an
 * API response or the dashboard.
 */
export async function withDatabase<T>(
  cluster: ClusterName,
  fn: (db: import('mongodb').Db) => Promise<T>,
): Promise<{ ok: true; data: T; error: null } | { ok: false; data: null; error: { state: DatabaseState; message: string } }> {
  try {
    const data = await fn(await clusterDb(cluster));
    return { ok: true, data, error: null };
  } catch (error) {
    const state =
      error instanceof DatabaseConfigError ? error.state : classifyDatabaseError(error);
    const raw = error instanceof Error ? error.message : String(error);
    return { ok: false, data: null, error: { state, message: scrubSecrets(raw) } };
  }
}

/**
 * Credential-free health for one cluster. Safe to return to a client: it
 * contains a variable NAME and a state, never a URI, user or password.
 */
export async function probeCluster(cluster: ClusterName): Promise<ClusterStatus> {
  const startedAt = Date.now();
  const database = clusterDbName(cluster);
  const configuredFrom = clusterUriSource(cluster);

  if (!configuredFrom) {
    return {
      cluster,
      configuredFrom: null,
      database,
      ok: false,
      state: 'CONFIGURATION_ERROR',
      responseTimeMs: Date.now() - startedAt,
    };
  }

  const result = await withDatabase(cluster, (db) => db.command({ ping: 1 }));
  return {
    cluster,
    configuredFrom,
    database,
    ok: result.ok,
    state: result.ok ? 'READY' : result.error.state,
    responseTimeMs: Date.now() - startedAt,
  };
}

/** Health for every cluster. Used by the dashboard health surface. */
export async function probeAllClusters(): Promise<ClusterStatus[]> {
  return Promise.all((Object.keys(CLUSTERS) as ClusterName[]).map(probeCluster));
}

/** Test seam: drop cached pools. Never called outside tests. */
export function _resetClusterClients(): void {
  clients.clear();
}

// ── Mongoose ──────────────────────────────────────────────────────────
// Mongoose keeps ONE global connection, so the site's model layer cannot hold
// a pool per cluster. It is therefore bound to exactly one cluster (the site's
// own), and bot data is read with the raw driver above. The connect helper
// lives HERE rather than in the caller so the URI is resolved in this module
// and no other file can read the variable itself.

let mongoosePromise: Promise<typeof import('mongoose').default> | null = null;

export async function connectMongoose(
  cluster: ClusterName = 'muragoods',
): Promise<typeof import('mongoose').default> {
  if (mongoosePromise) return mongoosePromise;

  const uri = resolveClusterUri(cluster);
  const mongoose = (await import('mongoose')).default;

  const promise = mongoose
    .connect(uri, {
      bufferCommands: false,
      // Bounded server selection: without these a dead cluster pins every
      // request for the driver default (~30s) instead of resolving to an error.
      serverSelectionTimeoutMS: 6000,
      connectTimeoutMS: 6000,
      socketTimeoutMS: 10000,
      maxPoolSize: 10,
    })
    .then((m) => m);

  // A failed connect must not poison the process: drop the cached rejection so
  // the next request retries rather than awaiting the same failure until a
  // restart. This is why a redeploy after fixing a bad URI is not required.
  promise.catch(() => {
    mongoosePromise = null;
  });

  mongoosePromise = promise;
  return promise;
}

/** Test seam: drop the cached mongoose connection. */
export function _resetMongoose(): void {
  mongoosePromise = null;
}
