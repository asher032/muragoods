import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import GameProgress from '@/app/lib/models/GameProgress';
import UserPreference from '@/app/lib/models/UserPreference';
import GameReward from '@/app/lib/models/GameReward';
import { gameIdentity, gameLevel, playerKey } from '@/app/lib/gameserver';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/games/profile — own full game profile (session identity).
// GET /api/games/profile?user=<playerKey> — another player's PUBLIC summary.
// The playerKey is an HMAC, never an email: no identity leaks by enumeration.
export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('user');
    if (!key) {
      const id = await gameIdentity(req);
      if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
      return NextResponse.json({ success: true, mine: true, profile: await fullProfile(id.emailLc, true) });
    }
    if (!/^[0-9a-f]{22}$/.test(key)) {
      return NextResponse.json({ success: false, error: 'Unknown player' }, { status: 404 });
    }
    const users = await User.find({ 'privacy.gameProfile': 'public' })
      .select('email discord privacy').lean() as Array<{ email: string }>;
    let match: string | null = null;
    for (const u of users) {
      if (playerKey(u.email.toLowerCase()) === key) { match = u.email.toLowerCase(); break; }
    }
    if (!match) return NextResponse.json({ success: false, error: 'Unknown player' }, { status: 404 });
    return NextResponse.json({ success: true, mine: false, profile: await fullProfile(match, false) });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load profile' }, { status: 500 });
  }
}

async function fullProfile(emailLc: string, mine: boolean) {
  const [user, rows, favs, rewards] = await Promise.all([
    User.findOne({ email: new RegExp(`^${emailLc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
      .select('name avatar userId coinBalance discord privacy').lean() as Promise<{
        name?: string; avatar?: string; userId?: string; coinBalance?: number;
        discord?: { username?: string; avatar?: string }; privacy?: Record<string, string>;
      } | null>,
    GameProgress.find({ userEmail: emailLc }).sort({ lastPlayed: -1 }).lean(),
    UserPreference.find({ userEmail: emailLc, contentType: 'game', action: 'favorite' })
      .sort({ createdAt: -1 }).limit(20).lean(),
    GameReward.find({ userEmail: emailLc }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  const totalXp = rows.reduce((s, r) => s + (r.xp || 0), 0);
  const totalPlays = rows.reduce((s, r) => s + (r.plays || 0), 0);
  const totalTime = rows.reduce((s, r) => s + (r.playTimeSec || 0), 0);
  const achievements = [...new Set(rows.flatMap((r) => r.achievements || []))];
  const streaks = rows.map((r) => r.streak || 0);
  return {
    name: user?.name || 'Player',
    avatar: user?.avatar || user?.discord?.avatar || '',
    discordUsername: user?.discord?.username || '',
    coins: user?.coinBalance || 0,
    ...gameLevel(totalXp),
    totalXp, totalPlays, totalTimeSec: totalTime,
    gamesPlayed: rows.length,
    achievements, achievementCount: achievements.length,
    bestStreak: Math.max(0, ...streaks),
    favorites: favs.map((f) => ({ contentId: f.contentId, title: f.snapshot?.title || f.contentId })),
    recent: mine ? rewards.map((r) => ({ kind: r.kind, amount: r.amount, label: r.label, at: r.createdAt })) : [],
    recentGames: rows.slice(0, 5).map((r) => ({
      gameId: r.gameId, bestScore: r.bestScore, plays: r.plays, xp: r.xp, lastPlayed: r.lastPlayed,
    })),
    key: playerKey(emailLc),
  };
}
