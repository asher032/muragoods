import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import GameProgress from '@/app/lib/models/GameProgress';
import UserPreference from '@/app/lib/models/UserPreference';
import { gameIdentity, gameLevel } from '@/app/lib/gameserver';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/games/progress?gameId=spin — own per-game progress (session).
// GET /api/games/progress?summary=1 — own totals + per-game rows + level.
export async function GET(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get('gameId');
    if (gameId) {
      const row = await GameProgress.findOne({ userEmail: id.emailLc, gameId }).lean();
      return NextResponse.json({ success: true, progress: row || null });
    }
    const rows = await GameProgress.find({ userEmail: id.emailLc }).sort({ lastPlayed: -1 }).lean();
    const totalXp = rows.reduce((s, r) => s + (r.xp || 0), 0);
    const totalPlays = rows.reduce((s, r) => s + (r.plays || 0), 0);
    const totalTime = rows.reduce((s, r) => s + (r.playTimeSec || 0), 0);
    const achievements = [...new Set(rows.flatMap((r) => r.achievements || []))];
    const favGames = await UserPreference.countDocuments({ userEmail: id.emailLc, contentType: 'game', action: 'favorite' });
    return NextResponse.json({
      success: true,
      summary: {
        ...gameLevel(totalXp), totalXp, totalPlays, totalTimeSec: totalTime,
        achievements: achievements.length, favoriteGames: favGames, gamesPlayed: rows.length,
      },
      games: rows,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load progress' }, { status: 500 });
  }
}
