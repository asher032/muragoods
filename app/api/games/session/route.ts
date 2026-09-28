import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/app/lib/mongodb';
import GameSession from '@/app/lib/models/GameSession';
import { gameIdentity } from '@/app/lib/gameserver';
import { rateLimit } from '@/app/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/games/session { gameId } — mint a single-use play nonce.
// Identity comes from the session cookie; the game id is validated
// against the catalog. Tokens live 10 minutes and die on first redeem.
export async function POST(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const rl = rateLimit(`gsess:${id.emailLc}`, 30, 60_000);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const gameId = String(body.gameId || '');
    if (!gameId) return NextResponse.json({ success: false, error: 'gameId required' }, { status: 400 });

    await dbConnect();
    const token = crypto.randomBytes(24).toString('hex');
    await GameSession.create({
      token, userEmail: id.emailLc, gameId, consumed: false,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    return NextResponse.json({ success: true, token });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not start session' }, { status: 500 });
  }
}
