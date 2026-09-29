import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { getSessionUser } from '@/app/lib/session';
import { getSession as getDiscordSession } from '@/app/lib/discord-session';

// GET /api/me — the ONE canonical identity for the entire Muragoods
// ecosystem (shop, Murastream, games, letters, rewards, Murabot dashboard).
//
// Identity resolution, in order:
//   1. Muragoods session cookie (mura_session) → User by email.
//   2. Discord dashboard session (mg_session) → User by discord.discordId.
//   3. Discord session with no linked User → discord-only identity with
//      linked:false (the UI offers explicit linking; a duplicate User is
//      NEVER auto-created).
//   4. Neither → { authenticated: false }.
//
// Every product section below reads the SAME user record — there are no
// per-product profiles. All queries are bounded (lean + limits) so one slow
// collection cannot wedge the whole profile.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LeanUser {
  name: string;
  email: string;
  userId?: string;
  role?: string;
  avatar?: string;
  bio?: string;
  coinBalance?: number;
  createdAt?: Date;
  perks?: Array<unknown>;
  discord?: { discordId?: string; username?: string; avatar?: string; linkedAt?: Date };
}

export async function GET(req: Request) {
  try {
    await dbConnect();

    let user: LeanUser | null = null;
    let discordSession: { discordId: string; username: string } | null = null;

    const shop = await getSessionUser(req);
    if (shop) {
      user = await User.findOne({ email: shop.email })
        .select('name email userId role avatar bio coinBalance createdAt perks discord')
        .lean<LeanUser | null>();
    }
    if (!user) {
      try {
        const ds = await getDiscordSession();
        if (ds) {
          // IValidatedSession carries { session, accessToken, discordId };
          // the display name lives on the stored session document.
          const sessionUsername =
            (ds.session as unknown as { username?: string; globalName?: string })?.username || '';
          discordSession = { discordId: ds.discordId, username: sessionUsername };
          user = await User.findOne({ 'discord.discordId': ds.discordId })
            .select('name email userId role avatar bio coinBalance createdAt perks discord')
            .lean<LeanUser | null>();
        }
      } catch {
        // Discord session store unreachable — fall through to unauthenticated
        // rather than failing the whole identity call.
      }
    }

    // Discord-only visitor: no Muragoods account yet. Explicit linking only.
    if (!user) {
      if (discordSession) {
        return NextResponse.json({
          success: true,
          authenticated: true,
          linked: false,
          user: null,
          discord: {
            connected: true,
            userId: discordSession.discordId,
            username: discordSession.username,
          },
          connectUrl: '/api/auth/discord?mode=link',
        });
      }
      return NextResponse.json({ success: true, authenticated: false, user: null });
    }

    const emailLc = user.email.toLowerCase();
    const discordId = user.discord?.discordId || discordSession?.discordId || '';

    // One bounded fan-out across the SAME user record's product data.
    const [orders, library, prefs, games, letters] = await Promise.allSettled([
      // Shop orders (userId field holds the canonical lowercase email).
      (async () => {
        const { default: Order } = await import('@/app/lib/models/Order');
        const rows = await Order.find({ userId: emailLc }).select('total status').lean().limit(500);
        return {
          count: rows.length,
          totalSpent: rows.reduce((s: number, o: { total?: number }) => s + (Number(o.total) || 0), 0),
        };
      })(),
      // Murastream library: watchlist (myList), likes, history.
      (async () => {
        const { default: UserLibrary } = await import('@/app/lib/models/UserLibrary');
        const lib = await UserLibrary.findOne({ email: emailLc })
          .select('likes myList history').lean() as {
            likes?: unknown[]; myList?: unknown[]; history?: unknown[];
          } | null;
        return {
          watchlist: lib?.myList?.length || 0,
          likes: lib?.likes?.length || 0,
          history: lib?.history?.length || 0,
        };
      })(),
      // Favorites (central preferences store).
      (async () => {
        const { default: UserPreference } = await import('@/app/lib/models/UserPreference');
        const favs = await UserPreference.countDocuments({ userEmail: emailLc, action: 'favorite' });
        return { favorites: favs };
      })(),
      // Games progress.
      (async () => {
        const { default: GameProgress } = await import('@/app/lib/models/GameProgress');
        const rows = await GameProgress.find({ userEmail: emailLc })
          .select('gameId xp bestScore achievements').lean() as Array<{
            gameId: string; xp?: number; bestScore?: number; achievements?: unknown[];
          }>;
        return {
          gamesPlayed: rows.length,
          totalXp: rows.reduce((s, g) => s + (Number(g.xp) || 0), 0),
          achievements: rows.reduce((s, g) => s + (g.achievements?.length || 0), 0),
        };
      })(),
      // Letters authored.
      (async () => {
        const { default: UnsentLetter } = await import('@/app/lib/models/UnsentLetter');
        const sent = await UnsentLetter.countDocuments({ authorEmail: emailLc });
        return { letters: sent };
      })(),
    ]);

    const val = <T,>(r: PromiseSettledResult<T>, fb: T): T => (r.status === 'fulfilled' ? r.value : fb);

    return NextResponse.json({
      success: true,
      authenticated: true,
      linked: true,
      user: {
        id: user.userId || emailLc,
        email: user.email,
        username: user.name,
        displayName: user.name,
        avatar: user.avatar || '',
        bio: (user as { bio?: string }).bio || '',
        role: user.role || 'user',
        coins: user.coinBalance || 0,
        perks: (user.perks || []).length,
        memberSince: user.createdAt || null,
        discord: {
          connected: Boolean(discordId),
          userId: discordId || null,
          username: user.discord?.username || discordSession?.username || null,
          avatar: user.discord?.avatar || '',
        },
      },
      muragoods: {
        orders: val(orders, { count: 0, totalSpent: 0 }),
      },
      murastream: {
        ...val(library, { watchlist: 0, likes: 0, history: 0 }),
        ...val(prefs, { favorites: 0 }),
      },
      games: val(games, { gamesPlayed: 0, totalXp: 0, achievements: 0 }),
      letters: val(letters, { letters: 0 }),
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load profile' }, { status: 500 });
  }
}
