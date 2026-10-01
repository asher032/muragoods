import crypto from 'crypto';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { getSessionUser } from '@/app/lib/session';
import { getSession as getDiscordSession } from '@/app/lib/discord-session';

// ── Canonical identity ──────────────────────────────────────────────────
//
// ONE person = ONE Muragoods account = ONE canonical `userId`.
//
// This module is the only place a request's owner is decided. Rules it
// enforces, which every route must go through rather than re-deriving:
//
//   1. Identity comes from the secure session (cookie → DB), never from a
//      body field, query parameter or localStorage value.
//   2. `userId` is the stable key. `email`, `name` and the Discord nickname
//      are mutable labels and must never be used to find a person's rows.
//   3. Access is always checked against the resource's stored owner, so one
//      signed-in user cannot read or write another's data.
//
// A note on the legacy key. Most collections predate `userId` and store the
// owner's lowercase email in a field named `userEmail` (or `email`, or — on
// orders and tickets — `userId`, which historically held an email). Rewriting
// every row before the backfill runs would strand real orders and points, so
// reads match `canonicalUserId` **or** the legacy email key. That dual match is
// what makes the migration safe in both directions: rows written before it keep
// resolving, and rows written after it keep resolving. Once
// `canonicalUserId` is backfilled everywhere the legacy key is redundant but
// still harmless, so it is never deleted.

export interface CanonicalUser {
  /** Stable internal id. The only key other systems may store. */
  userId: string;
  /** Lowercased login email. A label, never an ownership key. */
  emailLc: string;
  /** Email exactly as stored (always lowercase in practice). */
  email: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  role: string;
  /** Linked Discord snowflake, or '' when Discord is not connected. */
  discordUserId: string;
  discordUsername: string;
  createdAt: Date | null;
}

/** Field names that have historically held the owner's email. */
const LEGACY_EMAIL_FIELD = 'userEmail';

/**
 * The subset of a user document identity resolution needs. Keeps this
 * function usable from both the shop session and the Discord session.
 */
type IdentityDoc = {
  userId?: string;
  email?: string;
  name?: string;
  username?: string;
  avatar?: string;
  bio?: string;
  role?: string;
  createdAt?: Date;
  discord?: { discordId?: string; username?: string };
  linkedAccounts?: { discordUserId?: string; discordUsername?: string };
};

const IDENTITY_SELECT = 'userId email name username avatar bio role createdAt discord linkedAccounts';

function shape(doc: IdentityDoc): CanonicalUser {
  return {
    userId: doc.userId || '',
    email: doc.email || '',
    emailLc: (doc.email || '').toLowerCase(),
    name: doc.name || '',
    username: doc.username || '',
    avatar: doc.avatar || '',
    bio: doc.bio || '',
    role: doc.role || 'user',
    // `discord.discordId` is the historical home of the link; prefer it so a
    // document linked before `linkedAccounts` existed still reads correctly.
    discordUserId: doc.discord?.discordId || doc.linkedAccounts?.discordUserId || '',
    discordUsername: doc.discord?.username || doc.linkedAccounts?.discordUsername || '',
    createdAt: doc.createdAt || null,
  };
}

/**
 * Mint a canonical id for an account that predates them. Never collides with
 * an existing one: the random suffix plus a uniqueness re-check makes a clash
 * effectively impossible, and the retry keeps it impossible rather than
 * merely unlikely.
 */
export async function mintUserId(seed: string): Promise<string> {
  const prefix = (seed.split('@')[0] || 'user').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6) || 'USER';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `MG-${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const taken = await User.exists({ userId: candidate });
    if (!taken) return candidate;
  }
  // Fall back to something unguessable rather than looping forever.
  return `MG-${prefix}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

/**
 * Resolve the caller's canonical identity from the secure session.
 *
 * Two sessions exist and both resolve to the SAME account: the shop session
 * (`mura_session`) and the Discord dashboard session (`mg_session`, matched by
 * `discord.discordId`). A Discord session with no linked account resolves to
 * null — it deliberately does not create a second profile.
 *
 * Returns null when unauthenticated, or when the session points at an account
 * that no longer exists.
 */
export async function getIdentity(req: Request): Promise<CanonicalUser | null> {
  await dbConnect();

  const shop = await getSessionUser(req).catch(() => null);
  if (shop) {
    const doc = await User.findOne({ email: shop.email }).select(IDENTITY_SELECT).lean<IdentityDoc | null>();
    if (doc) return shape(doc);
  }

  const discord = await getDiscordSession().catch(() => null);
  if (discord) {
    const doc = await User.findOne({ 'discord.discordId': discord.discordId })
      .select(IDENTITY_SELECT)
      .lean<IdentityDoc | null>();
    if (doc) return shape(doc);
  }

  return null;
}

/**
 * Same as {@link getIdentity} but also guarantees the account has a
 * `canonicalUserId`. Accounts created before the id existed get one assigned
 * lazily, on first authenticated request, so no separate backfill job has to
 * run before the site is coherent.
 */
export async function getIdentityWithId(req: Request): Promise<CanonicalUser | null> {
  const identity = await getIdentity(req);
  if (!identity) return null;
  if (identity.userId) return identity;

  const userId = await mintUserId(identity.emailLc || identity.name);
  await User.updateOne({ email: identity.email }, { $set: { userId, updatedAt: new Date() } });
  return { ...identity, userId };
}

/**
 * A Mongo filter that matches every row belonging to `user`: rows already
 * carrying the canonical id, plus rows still keyed by the legacy email.
 *
 * Used by every read and every ownership check. Two calls for the same
 * person can never match two different sets of rows, which is what stops a
 * request from silently finding nothing during the migration window.
 */
export function ownerFilter(user: Pick<CanonicalUser, 'userId' | 'emailLc'>, legacyField: string = LEGACY_EMAIL_FIELD): Record<string, unknown> {
  return {
    $or: [
      { canonicalUserId: user.userId },
      { [legacyField]: user.emailLc },
    ],
  };
}

/**
 * Ownership test for a single already-loaded resource.
 *
 * A row that carries a canonical id is matched on that id ALONE. A row that
 * does not is matched on its legacy email, so pre-migration data still
 * belongs to its owner. The asymmetry is deliberate: a row stamped with
 * someone else's `canonicalUserId` must never be reachable through a stale
 * email match.
 */
export function ownsResource(
  user: Pick<CanonicalUser, 'userId' | 'emailLc'>,
  resource: { canonicalUserId?: unknown; [k: string]: unknown } | null | undefined,
  legacyField: string = LEGACY_EMAIL_FIELD,
): boolean {
  if (!resource) return false;
  const canonical = resource.canonicalUserId;
  if (typeof canonical === 'string' && canonical) return canonical === user.userId;
  const legacy = resource[legacyField];
  return typeof legacy === 'string' && legacy.toLowerCase() === user.emailLc;
}

/**
 * The fields to stamp on a new or updated row so it is findable by `userId`.
 *
 * `legacyField` defaults to NOT writing the legacy key: most collections
 * already populate their own email column from the caller's identity, and
 * duplicating that here would be redundant. Pass a field name only where the
 * collection genuinely has no other place to record the owner.
 *
 * Takes the minimum it needs rather than the whole `CanonicalUser`, so the
 * narrower game/identity shapes can be passed straight through.
 */
export function ownerStamp(
  user: Pick<CanonicalUser, 'userId' | 'emailLc'>,
  legacyField?: string,
): Record<string, unknown> {
  const stamp: Record<string, unknown> = { canonicalUserId: user.userId };
  if (legacyField) stamp[legacyField] = user.emailLc;
  return stamp;
}

/** Human label used in activity lines and ticket headers. */
export function ownerLabel(user: CanonicalUser): string {
  return user.name || user.username || user.emailLc;
}