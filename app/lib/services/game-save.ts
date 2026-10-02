import dbConnect from '@/app/lib/mongodb';
import GameSave from '@/app/lib/models/GameSave';
import { getIdentityWithId, type CanonicalUser } from '@/app/lib/identity';

// ─────────────────────────────────────────────────────────────────────────
// THE game save service.
//
// Identity is resolved from the session by the caller and passed in. There is
// deliberately no `userId` parameter anywhere in this module and no way to
// read or write somebody else's save: the browser cannot name a target.
//
// What is and is not authoritative here is the important part:
//
//   AUTHORITATIVE on the server: high score, plays, streak, achievements,
//                               the level the game earned.
//   CLIENT AUTHORITATIVE:       the shape of `state` (a memory grid, the set
//                               of revealed cards, a puzzle position).
//
// For the second category the client is the only place that knows, and forcing
// a round-trip per move would make the games unplayable. The rule is that
// those fields may never influence a REWARD — which is why nothing here grants
// points or items. Awards go through /api/games/award, which recomputes the
// prize from the server's own tables. A save is a save; it pays nothing.
//
// Writes merge rather than replace the summary fields, and `highScore` only
// ever moves UP unless a reset is explicitly requested. Otherwise a client
// that loads a stale save could quietly wipe a record.
// ─────────────────────────────────────────────────────────────────────────

const MAX_STATE_BYTES = 64 * 1024;

export interface SaveInput {
  highScore?: number;
  plays?: number;
  streak?: number;
  level?: number;
  achievements?: string[];
  state?: Record<string, unknown>;
  /** Only honoured when `resetScore` is true — an explicit, visible action. */
  resetScore?: boolean;
}

export type SaveResult =
  | { ok: true; save: PublicSave; created: boolean; recovered?: boolean }
  | { ok: false; code: 'UNAUTHENTICATED' | 'INVALID_GAME' | 'INVALID_STATE' | 'WRITE_FAILED'; error: string };

export interface PublicSave {
  gameId: string;
  highScore: number;
  plays: number;
  streak: number;
  level: number;
  achievements: string[];
  state: Record<string, unknown>;
  lastPlayed: string;
  updatedAt: string;
}

const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

export function isValidGameId(id: string): boolean {
  return GAME_ID_PATTERN.test(id);
}

function shape(doc: {
  gameId: string; highScore: number; plays: number; streak: number; level: number;
  achievements: string[]; state: unknown; lastPlayed: Date; updatedAt: Date;
}): PublicSave {
  return {
    gameId: doc.gameId,
    highScore: doc.highScore || 0,
    plays: doc.plays || 0,
    streak: doc.streak || 0,
    level: doc.level || 1,
    achievements: Array.isArray(doc.achievements) ? doc.achievements : [],
    state: (doc.state && typeof doc.state === 'object' ? doc.state : {}) as Record<string, unknown>,
    lastPlayed: new Date(doc.lastPlayed).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

/** Read the caller's save for one game. Null simply means "no save yet". */
export async function readSave(
  user: CanonicalUser | null,
  gameId: string,
): Promise<PublicSave | null> {
  if (!user?.userId || !isValidGameId(gameId)) return null;
  await dbConnect();
  const doc = await GameSave.findOne({ canonicalUserId: user.userId, gameId }).lean();
  return doc ? shape(doc as never) : null;
}

/** Every save the caller has, newest first. Powers the cross-game profile view. */
export async function readAllSaves(user: CanonicalUser | null): Promise<PublicSave[]> {
  if (!user?.userId) return [];
  await dbConnect();
  const rows = await GameSave.find({ canonicalUserId: user.userId })
    .sort({ lastPlayed: -1 }).limit(200).lean();
  return rows.map((r) => shape(r as never));
}

export async function writeSave(
  user: CanonicalUser | null,
  gameId: string,
  input: SaveInput,
): Promise<SaveResult> {
  if (!user?.userId) return { ok: false, code: 'UNAUTHENTICATED', error: 'Sign in required' };
  if (!isValidGameId(gameId)) return { ok: false, code: 'INVALID_GAME', error: 'Invalid game id' };

  const state = input.state ?? {};
  // A save blob is user-controlled input that gets stored and rendered, so it
  // is bounded. An unbounded body here is a cheap way to fill the database.
  if (JSON.stringify(state).length > MAX_STATE_BYTES) {
    return { ok: false, code: 'INVALID_STATE', error: 'Save data is too large' };
  }
  // A caller that only wants to report a new high score sends no `state`.
  // Writing `{}` in that case would silently ERASE the game's save — which is
  // what happened here: bumping a score wiped `legendaryHighScore`. So `state`
  // is only written when the caller actually supplied one.
  const stateProvided = input.state !== undefined;

  await dbConnect();
  const emailLc = user.emailLc;
  const now = new Date();

  const existing = await GameSave.findOne({ canonicalUserId: user.userId, gameId })
    .select('highScore plays streak level achievements').lean<{
      highScore?: number; plays?: number; streak?: number; level?: number; achievements?: string[];
    } | null>();

  const highScore = input.resetScore
    ? Math.max(0, Math.trunc(input.highScore ?? 0))
    : Math.max(existing?.highScore ?? 0, Math.trunc(input.highScore ?? 0));
  const plays = input.resetScore
    ? Math.max(0, Math.trunc(input.plays ?? 0))
    : Math.max(existing?.plays ?? 0, Math.trunc(input.plays ?? 0));
  const streak = input.streak != null ? Math.max(0, Math.trunc(input.streak)) : (existing?.streak ?? 0);
  const level = input.level != null ? Math.max(1, Math.trunc(input.level)) : (existing?.level ?? 1);

  // Achievements only ever accumulate; a client cannot un-earn one.
  const mergedAchievements = [...new Set([
    ...(existing?.achievements ?? []),
    ...(Array.isArray(input.achievements) ? input.achievements.map(String).slice(0, 200) : []),
  ])];

  try {
    const set: Record<string, unknown> = {
      canonicalUserId: user.userId,
      userEmail: emailLc,
      discordId: user.discordUserId || '',
      gameId,
      highScore, plays, streak, level,
      achievements: mergedAchievements,
      lastSavedByClientAt: now,
      lastPlayed: now,
      updatedAt: now,
    };
    if (stateProvided) set.state = state;
    await GameSave.updateOne(
      { canonicalUserId: user.userId, gameId },
      {
        $set: set,
        // A first-ever save must still start with an empty state object
        // rather than leaving the field missing.
        $setOnInsert: stateProvided ? { createdAt: now } : { createdAt: now, state: {} },
      },
      { upsert: true },
    );
  } catch {
    return { ok: false, code: 'WRITE_FAILED', error: 'The save could not be written' };
  }

  const saved = await GameSave.findOne({ canonicalUserId: user.userId, gameId }).lean();
  return { ok: true, save: shape(saved as never), created: existing === null };
}

/**
 * Adopt saves that predate this collection.
 *
 * Games used to keep this state in localStorage, so the first time someone
 * plays after this ships, their authoritative record is empty but their
 * browser holds a real high score. Importing it once — keyed to the session
 * user, never to a client-supplied id — turns that into a server-side record
 * without ever letting the browser name whose save it is writing.
 *
 * `source: 'client_import'` exists in the audit trail precisely so an operator
 * can tell an imported value from a played one.
 */
export async function importClientSave(
  req: Request,
  gameId: string,
  input: SaveInput,
): Promise<SaveResult> {
  const user = await getIdentityWithId(req);
  if (!user) return { ok: false, code: 'UNAUTHENTICATED', error: 'Sign in required' };
  return writeSave(user, gameId, input);
}