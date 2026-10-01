import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { getIdentityWithId, ownerFilter } from '@/app/lib/identity';

// GET /api/me — the ONE canonical identity for the entire Muragoods
// ecosystem (shop, Murastream, games, letters, rewards, My Space, support and
// the Murabot dashboard).
//
// Identity resolution, in order:
//   1. Muragoods session cookie (mura_session) → User by email.
//   2. Discord dashboard session (mg_session) → the SAME User by its linked
//      Discord id. A Discord session never yields a second profile.
//   3. Neither → { authenticated: false }.
//
// Everything below is keyed to `user.userId`. `connectedServices` reports the
// state of each service for THIS one account — Muragoods, Murastream,
// Murabot and Discord are services attached to the same profile, not separate
// accounts.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    await dbConnect();
    const user = await getIdentityWithId(req);
    if (!user) {
      return NextResponse.json({ success: true, authenticated: false, user: null });
    }

    // Murastream: does this account actually have library rows yet? Derived,
    // never a separate profile — it is the same account with or without data.
    const libraryFilter = ownerFilter(user, 'email');
    const lib = await import('@/app/lib/models/UserLibrary');
    const library = await lib.default.findOne(libraryFilter)
      .select('likes myList history')
      .lean<{ likes?: unknown[]; myList?: unknown[]; history?: unknown[] } | null>();

    const prefsFilter = ownerFilter(user, 'userEmail');
    const results = await Promise.allSettled([
      // Shop orders — every order references the canonical userId.
      (async () => {
        const { default: Order } = await import('@/app/lib/models/Order');
        const rows = await Order.find(ownerFilter(user, 'userId'))
          .select('total status').lean().limit(500);
        return {
          count: rows.length,
          totalSpent: rows.reduce((s: number, o: { total?: number }) => s + (Number(o.total) || 0), 0),
        };
      })(),
      // Favorites — one collection, one owner, shared by every surface.
      (async () => {
        const { default: UserPreference } = await import('@/app/lib/models/UserPreference');
        return { favorites: await UserPreference.countDocuments({ ...prefsFilter, action: 'favorite' }) };
      })(),
      // Points ledger.
      (async () => {
        const { default: GameReward } = await import('@/app/lib/models/GameReward');
        const rows = await GameReward.find(ownerFilter(user, 'userEmail'))
          .select('kind amount').lean().limit(2000);
        let earned = 0;
        let spent = 0;
        for (const r of rows) {
          const n = Number(r.amount) || 0;
          if (r.kind === 'coins') (n >= 0 ? (earned += n) : (spent += -n));
        }
        return { entries: rows.length, earned, spent };
      })(),
      // Games progress.
      (async () => {
        const { default: GameProgress } = await import('@/app/lib/models/GameProgress');
        const rows = await GameProgress.find(ownerFilter(user, 'userEmail'))
          .select('xp achievements').lean();
        return {
          gamesPlayed: rows.length,
          totalXp: rows.reduce((s, g) => s + (Number(g.xp) || 0), 0),
          achievements: rows.reduce((s, g) => s + ((g.achievements?.length as number) || 0), 0),
        };
      })(),
      // Letters + support tickets.
      (async () => {
        const [{ default: UnsentLetter }, { default: SupportTicket }] = await Promise.all([
          import('@/app/lib/models/UnsentLetter'),
          import('@/app/lib/models/SupportTicket'),
        ]);
        const [letters, tickets] = await Promise.all([
          UnsentLetter.countDocuments(ownerFilter(user, 'authorEmail')),
          SupportTicket.countDocuments(ownerFilter(user, 'userId')),
        ]);
        return { letters, tickets };
      })(),
      // Account-wide balance for display.
      (async () => {
        const doc = await User.findOne({ userId: user.userId })
          .select('coinBalance perks').lean<{ coinBalance?: number; perks?: unknown[] } | null>();
        return { coins: doc?.coinBalance || 0, perks: (doc?.perks || []).length };
      })(),
    ]);

    const val = <T,>(r: PromiseSettledResult<T>, fb: T): T => (r.status === 'fulfilled' ? r.value : fb);
    const orders = val(results[0], { count: 0, totalSpent: 0 });
    const favorites = val(results[1], { favorites: 0 });
    const points = val(results[2], { entries: 0, earned: 0, spent: 0 });
    const games = val(results[3], { gamesPlayed: 0, totalXp: 0, achievements: 0 });
    const social = val(results[4], { letters: 0, tickets: 0 });
    const balance = val(results[5], { coins: 0, perks: 0 });

    return NextResponse.json({
      success: true,
      authenticated: true,
      linked: true,
      user: {
        id: user.userId,
        email: user.email,
        username: user.username || user.name,
        displayName: user.name,
        avatar: user.avatar,
        bio: user.bio,
        role: user.role,
        coins: balance.coins,
        perks: balance.perks,
        memberSince: user.createdAt,
        discord: {
          connected: Boolean(user.discordUserId),
          userId: user.discordUserId || null,
          username: user.discordUsername || null,
        },
      },
      // Services attached to THIS account. Not accounts of their own: a
      // service is "connected" when this one profile has data or a link
      // behind it, and unconnected otherwise.
      connectedServices: [
        { id: 'muragoods', name: 'Muragoods', connected: true, detail: `Member since ${user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : '—'}`, href: '/profile' },
        {
          id: 'murastream',
          name: 'Murastream',
          connected: Boolean(library?.myList?.length || library?.likes?.length || library?.history?.length),
          detail: 'Watchlist, history and likes',
          href: '/murastream',
        },
        {
          id: 'murabot',
          name: 'Murabot',
          connected: Boolean(user.discordUserId),
          detail: user.discordUserId ? 'Discord-linked server economy' : 'Link Discord to connect',
          href: '/dashboard',
        },
        {
          id: 'discord',
          name: 'Discord',
          connected: Boolean(user.discordUserId),
          detail: user.discordUserId ? `@${user.discordUsername || 'connected'}` : 'Not connected',
          href: user.discordUserId ? '/account/connected' : '/api/auth/discord?mode=link',
        },
      ],
      muragoods: { orders },
      murastream: {
        watchlist: library?.myList?.length || 0,
        likes: library?.likes?.length || 0,
        history: library?.history?.length || 0,
        favorites: favorites.favorites,
      },
      points: { balance: balance.coins, ...points },
      games,
      letters: { letters: social.letters },
      support: { tickets: social.tickets },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load profile' }, { status: 500 });
  }
}