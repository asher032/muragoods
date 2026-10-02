import { NextResponse } from 'next/server';
import { getIdentityWithId } from '@/app/lib/identity';
import { readSave, writeSave, isValidGameId, type SaveInput } from '@/app/lib/services/game-save';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────
// GET  /api/games/:gameId/save  → the caller's save for that game
// PUT  /api/games/:gameId/save  → write it
//
// There is no `?userId=` parameter and no way to ask for someone else's save.
// Ownership comes from the session on every call, so the browser cannot name a
// target — it can only ever write the save of whoever it is signed in as.
//
// A save grants NOTHING. Points and items are issued by /api/games/award,
// which recomputes the prize from the server's own tables. If a save could pay,
// a client would simply post a huge score and collect a reward.
//
// `userId` in the response is the caller's own canonical id, returned so the
// UI can prove the save belongs to the account it thinks it does.
// ─────────────────────────────────────────────────────────────────────────

type Ctx = { params: Promise<{ gameId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { gameId } = await params;
  if (!isValidGameId(gameId)) {
    return NextResponse.json({ success: false, error: 'Invalid game id', code: 'INVALID_GAME' }, { status: 400 });
  }
  const user = await getIdentityWithId(req);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Sign in required', code: 'UNAUTHENTICATED' }, { status: 401 });
  }
  const save = await readSave(user, gameId);
  return NextResponse.json({
    success: true,
    userId: user.userId,
    gameId,
    // Null is the honest answer for "never played", not an empty object that
    // looks like a real save of zeroes.
    save,
    exists: save !== null,
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { gameId } = await params;
  if (!isValidGameId(gameId)) {
    return NextResponse.json({ success: false, error: 'Invalid game id', code: 'INVALID_GAME' }, { status: 400 });
  }
  const user = await getIdentityWithId(req);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Sign in required', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  let body: SaveInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const result = await writeSave(user, gameId, body ?? {});
  if (!result.ok) {
    const status = result.code === 'UNAUTHENTICATED' ? 401 : result.code === 'WRITE_FAILED' ? 503 : 400;
    return NextResponse.json({ success: false, error: result.error, code: result.code }, { status });
  }
  return NextResponse.json({
    success: true,
    userId: user.userId,
    gameId,
    save: result.save,
    created: result.created,
    // Stated so nobody mistakes a save for a payout.
    awarded: false,
    note: 'A save never grants rewards. Rewards are issued by /api/games/award after server-side validation.',
  });
}