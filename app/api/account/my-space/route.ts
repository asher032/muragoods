import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getIdentityWithId, ownerFilter } from '@/app/lib/identity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/account/my-space — the personal hub for ONE canonical user.
//
// Every number and list below is read from the server under the caller's
// resolved `userId`. Nothing here is read from localStorage: a device-local
// cache cannot answer "what is my watchlist", which is exactly the question
// My Space exists to answer. Each section resolves independently so one
// slow collection can never blank the whole page.

// Stable public player key — the same HMAC shape the leaderboard uses, so
// links built from here resolve to the same profile.
function playerKey(emailLc: string): string {
  const secret = process.env.AUTH_SECRET || 'unconfigured';
  return crypto.createHmac('sha256', secret).update(`game:${emailLc}`).digest('hex').slice(0, 22);
}

type Section<T> = { data: T; error?: string };

async function section<T>(label: string, fn: () => Promise<T>): Promise<Section<T>> {
  try {
    return { data: await fn() };
  } catch (error) {
    console.error(`[my-space] ${label} failed`, error);
    return { data: null as T, error: `${label} unavailable` };
  }
}

export async function GET(req: Request) {
  const user = await getIdentityWithId(req);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
  }

  const [
    profile, library, favorites, points, orders, games, letters, support, activity,
  ] = await Promise.all([
    section('profile', async () => {
      const { default: User } = await import('@/app/lib/models/User');
      const doc = await User.findOne({ userId: user.userId })
        .select('name email username avatar createdAt')
        .lean<{ name: string; email: string; username?: string; avatar?: string; createdAt?: Date } | null>();
      return doc;
    }),
    section('library', async () => {
      const { default: UserLibrary } = await import('@/app/lib/models/UserLibrary');
      const lib = await UserLibrary.findOne(ownerFilter(user, 'email'))
        .select('likes myList history')
        .lean<{ likes?: unknown[]; myList?: unknown[]; history?: unknown[] } | null>();
      return {
        watchlist: (lib?.myList || []) as unknown[],
        favorites: (lib?.likes || []) as unknown[],
        history: (lib?.history || []) as unknown[],
      };
    }),
    section('favorites', async () => {
      const { default: UserPreference } = await import('@/app/lib/models/UserPreference');
      const rows = await UserPreference.find({ ...ownerFilter(user, 'userEmail'), action: 'favorite' })
        .sort({ createdAt: -1 }).limit(50)
        .lean<Array<{ contentType: string; contentId: string; snapshot?: { title?: string; image?: string; subtitle?: string } }>>();
      return rows.map((r) => ({
        contentType: r.contentType,
        contentId: r.contentId,
        title: r.snapshot?.title || r.contentId,
        image: r.snapshot?.image || '',
        subtitle: r.snapshot?.subtitle || '',
      }));
    }),
    section('points', async () => {
      const { default: User } = await import('@/app/lib/models/User');
      const { default: GameReward } = await import('@/app/lib/models/GameReward');
      const [doc, rows] = await Promise.all([
        User.findOne({ userId: user.userId }).select('coinBalance').lean<{ coinBalance?: number } | null>(),
        GameReward.find(ownerFilter(user, 'userEmail')).sort({ createdAt: -1 }).limit(25)
          .lean<Array<{ kind?: string; amount?: number; label?: string; gameId?: string; createdAt?: Date }>>(),
      ]);
      let earned = 0;
      let spent = 0;
      for (const r of rows) {
        const n = Number(r.amount) || 0;
        if (r.kind === 'coins') (n >= 0 ? (earned += n) : (spent += -n));
      }
      return {
        balance: doc?.coinBalance || 0,
        earned,
        spent,
        history: rows.map((r) => ({
          type: (Number(r.amount) || 0) >= 0 ? 'earn' : 'spend',
          amount: Math.abs(Number(r.amount) || 0),
          label: r.label || r.gameId || '',
          date: r.createdAt || null,
        })),
      };
    }),
    section('orders', async () => {
      const { default: Order } = await import('@/app/lib/models/Order');
      const rows = await Order.find(ownerFilter(user, 'userId')).sort({ createdAt: -1 }).limit(10)
        .lean<Array<{ _id?: unknown; status?: string; total?: number; createdAt?: Date }>>();
      return rows.map((o) => ({
        id: String(o._id || ''),
        status: o.status || '',
        total: Number(o.total) || 0,
        createdAt: o.createdAt || null,
      }));
    }),
    section('games', async () => {
      const { default: GameProgress } = await import('@/app/lib/models/GameProgress');
      const rows = await GameProgress.find(ownerFilter(user, 'userEmail')).limit(50)
        .lean<Array<{ gameId?: string; level?: number; xp?: number; bestScore?: number; plays?: number; wins?: number; streak?: number; achievements?: string[] }>>();
      return {
        totalXp: rows.reduce((s, g) => s + (Number(g.xp) || 0), 0),
        achievements: rows.reduce((s, g) => s + ((g.achievements?.length as number) || 0), 0),
        games: rows.map((g) => ({
          gameId: g.gameId || '',
          level: g.level || 1,
          xp: g.xp || 0,
          bestScore: g.bestScore || 0,
          plays: g.plays || 0,
          wins: g.wins || 0,
          streak: g.streak || 0,
        })),
      };
    }),
    section('letters', async () => {
      const { default: UnsentLetter } = await import('@/app/lib/models/UnsentLetter');
      const rows = await UnsentLetter.find(ownerFilter(user, 'authorEmail')).sort({ createdAt: -1 }).limit(10)
        .lean<Array<{ _id?: unknown; title?: string; recipientName?: string; category?: string; createdAt?: Date }>>();
      return rows.map((l) => ({
        id: String(l._id || ''),
        title: l.title || '',
        recipient: l.recipientName || '',
        category: l.category || '',
        createdAt: l.createdAt || null,
      }));
    }),
    section('support', async () => {
      const { default: SupportTicket } = await import('@/app/lib/models/SupportTicket');
      const rows = await SupportTicket.find(ownerFilter(user, 'userId')).sort({ lastActivity: -1 }).limit(10)
        .lean<Array<{ _id?: unknown; subject?: string; status?: string; category?: string; lastActivity?: Date }>>();
      return rows.map((t) => ({
        id: String(t._id || ''),
        subject: t.subject || '',
        status: t.status || 'open',
        category: t.category || '',
        lastActivity: t.lastActivity || null,
      }));
    }),
    section('activity', async () => {
      const { default: UserActivity } = await import('@/app/lib/models/UserActivity');
      const rows = await UserActivity.find(ownerFilter(user, 'userEmail')).sort({ createdAt: -1 }).limit(20)
        .lean<Array<{ type?: string; text?: string; ref?: string; createdAt?: Date }>>();
      return rows.map((a) => ({
        type: a.type || 'other',
        text: a.text || '',
        ref: a.ref || '',
        createdAt: a.createdAt || null,
      }));
    }),
  ]);

  return NextResponse.json({
    success: true,
    // Echoed so the client can label the hub with the same id every other
    // page shows.
    userId: user.userId,
    playerKey: playerKey(user.emailLc),
    profile: profile.data
      ? {
        displayName: profile.data.name,
        username: profile.data.username || '',
        email: profile.data.email,
        avatar: profile.data.avatar || '',
        memberSince: profile.data.createdAt || null,
      }
      : { displayName: user.name, username: user.username, email: user.email, avatar: user.avatar, memberSince: user.createdAt },
    library: library.data,
    favorites: favorites.data,
    points: points.data,
    orders: orders.data,
    games: games.data,
    letters: letters.data,
    support: support.data,
    activity: activity.data,
    // Per-section failures are reported rather than swallowed, so a degraded
    // hub is visible instead of silently empty.
    degraded: [profile, library, favorites, points, orders, games, letters, support, activity]
      .filter((s) => s.error)
      .map((s) => s.error),
  });
}