import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import GameProgress from '@/app/lib/models/GameProgress';
import UserPreference from '@/app/lib/models/UserPreference';
import GameReward from '@/app/lib/models/GameReward';
import UserLibrary from '@/app/lib/models/UserLibrary';
import { requireStaff } from '@/app/lib/access-control';
import { playerKey } from '@/app/lib/gameserver';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/admin/players?search=<email|name|discord> — find a player and
// their linked ecosystem state. Admin-only; shows no tokens or secrets,
// only linked identities and game activity.
export async function GET(req: Request) {
  const gate = await requireStaff(req, ['technical']);
  if (!gate.ok) return gate.response;
  try {
    const q = (new URL(req.url).searchParams.get('search') || '').trim().slice(0, 80);
    if (q.length < 2) return NextResponse.json({ success: true, players: [] });
    await dbConnect();
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const users = await User.find({
      $or: [{ email: rx }, { name: rx }, { 'discord.username': rx }, { 'discord.discordId': q }],
    })
      .select('name email userId avatar coinBalance discord privacy createdAt')
      .limit(10)
      .lean() as Array<{
        name?: string; email: string; userId?: string; avatar?: string;
        coinBalance?: number; discord?: { discordId?: string; username?: string; avatar?: string; linkedAt?: Date };
        privacy?: Record<string, string>; createdAt?: Date;
      }>;
    const players = await Promise.all(users.map(async (u) => {
      const emailLc = u.email.toLowerCase();
      const [games, favs, rewards, lib] = await Promise.all([
        GameProgress.find({ userEmail: emailLc }).sort({ lastPlayed: -1 }).limit(20).lean(),
        UserPreference.countDocuments({ userEmail: emailLc }),
        GameReward.find({ userEmail: emailLc }).sort({ createdAt: -1 }).limit(10).lean(),
        UserLibrary.findOne({ email: emailLc }).select('likes myList history updatedAt').lean() as Promise<{
          likes?: unknown[]; myList?: unknown[]; history?: unknown[]; updatedAt?: Date;
        } | null>,
      ]);
      return {
        name: u.name, email: u.email, userId: u.userId || '', avatar: u.avatar || '',
        coins: u.coinBalance || 0, key: playerKey(emailLc),
        discord: u.discord?.discordId
          ? { username: u.discord.username || '', avatar: u.discord.avatar || '', linkedAt: u.discord.linkedAt || null }
          : null,
        privacy: u.privacy || {},
        games: games.map((g) => ({
          gameId: g.gameId, plays: g.plays, xp: g.xp, bestScore: g.bestScore,
          achievements: (g.achievements || []).length, lastPlayed: g.lastPlayed,
        })),
        favorites: favs,
        rewards: rewards.map((r) => ({ kind: r.kind, amount: r.amount, label: r.label, at: r.createdAt })),
        murastream: lib
          ? { likes: (lib.likes || []).length, watchlist: (lib.myList || []).length, history: (lib.history || []).length }
          : null,
        createdAt: u.createdAt || null,
      };
    }));
    return NextResponse.json({ success: true, players });
  } catch {
    return NextResponse.json({ success: false, error: 'Player lookup failed' }, { status: 500 });
  }
}
