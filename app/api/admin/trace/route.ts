import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import Order from '@/app/lib/models/Order';
import GameProgress from '@/app/lib/models/GameProgress';
import GameReward from '@/app/lib/models/GameReward';
import { requireStaff } from '@/app/lib/access-control';
import { ownerFilter } from '@/app/lib/identity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────
// Cross-system trace: Discord → Muragoods → everything.
//
// When a member says "my points disappeared" or "the bot says I have no
// progress but the site does", the first question is always the same: are we
// looking at ONE person or two? Previously that meant opening six databases
// and matching by hand, on whatever key each happened to store.
//
// This resolves a person once — by Discord snowflake, canonical userId, or
// email — and then reports what that one identity owns across every system,
// INCLUDING the places where the record is thin. A trace that only showed
// successes would hide exactly the duplication problem it exists to find, so
// each section states whether it found rows, none, or "no linkage possible".
//
// Scope: `technical`. Reading another person's full cross-system footprint is
// a debugging capability, not a support-tier one.
//
// Privacy: letter CONTENT is never included. Letters are counted and their
// visibility reported, because moderation needs to know a letter exists, not
// to read it.
// ─────────────────────────────────────────────────────────────────────────

interface TraceQuery {
  discordId?: string;
  userId?: string;
  email?: string;
}

export async function GET(req: NextRequest) {
  const guard = await requireStaff(req, ['technical']);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const query: TraceQuery = {
    discordId: url.searchParams.get('discordId') || undefined,
    userId: url.searchParams.get('userId') || undefined,
    email: url.searchParams.get('email') || undefined,
  };
  if (!query.discordId && !query.userId && !query.email) {
    return NextResponse.json(
      { success: false, error: 'Provide discordId, userId or email', code: 'MISSING_QUERY' },
      { status: 400 },
    );
  }

  await dbConnect();

  // ── Resolve the person ONCE. This is the whole point. ──────────────────
  const or: Record<string, unknown>[] = [];
  if (query.discordId && /^\d{5,25}$/.test(query.discordId)) or.push({ 'discord.discordId': query.discordId });
  if (query.userId) or.push({ userId: query.userId });
  if (query.email) or.push({ email: query.email.toLowerCase() });
  const filter = { $or: or };

  const account = await User.findOne(filter)
    .select('userId email name username role coinBalance createdAt discord linkedAccounts staffScopes')
    .lean<{
      userId?: string; email?: string; name?: string; username?: string; role?: string;
      coinBalance?: number; createdAt?: Date; staffScopes?: string[];
      discord?: { discordId?: string; username?: string; linkedAt?: Date };
      linkedAccounts?: { discordUserId?: string; discordUsername?: string; linkedAt?: Date };
    } | null>();

  if (!account) {
    return NextResponse.json({
      success: true,
      found: false,
      // A miss is a real, common answer — it is usually the duplication bug.
      message: 'No Muragoods account matches that identifier. If the Discord user exists, '
        + 'this is an UNLINKED Discord account, not a duplicate: they have never linked it.',
      query,
    });
  }

  const owner = {
    userId: account.userId || '',
    emailLc: (account.email || '').toLowerCase(),
  };
  const discordId = account.discord?.discordId || account.linkedAccounts?.discordUserId || '';
  const stamp = ownerFilter(owner, 'userEmail');

  const [
    orders, games, rewards, inventory, ledger, saves,
    library, letters, mediaComments, activity,
  ] = await Promise.all([
    Order.find(ownerFilter(owner, 'userId')).select('status total pointsEarned createdAt').sort({ createdAt: -1 })
      .limit(100).lean<Array<{ status?: string; total?: number; pointsEarned?: number; createdAt?: Date }>>(),
    GameProgress.find(stamp).sort({ lastPlayed: -1 })
      .lean<Array<{ gameId: string; plays?: number; bestScore?: number; xp?: number; achievements?: string[]; lastPlayed?: Date }>>(),
    GameReward.find(stamp).sort({ createdAt: -1 })
      .lean<Array<{ gameId: string; kind: string; amount?: number; label?: string; ledgerTxId?: string; createdAt?: Date }>>(),
    import('@/app/lib/models/InventoryItem').then(({ default: InventoryItem }) =>
      InventoryItem.find({ canonicalUserId: owner.userId, quantity: { $gt: 0 } })
        .lean<Array<{ itemId: string; name?: string; kind?: string; quantity?: number; source?: string; acquiredAt?: Date }>>()),
    import('@/app/lib/models/PointsTransaction').then(({ default: PointsTransaction }) =>
      PointsTransaction.find({ canonicalUserId: owner.userId }).sort({ createdAt: -1 }).limit(100)
        .lean<Array<{ txId: string; source: string; amount: number; reference?: string; createdAt?: Date }>>()),
    import('@/app/lib/models/GameSave').then(({ default: GameSave }) =>
      GameSave.find({ canonicalUserId: owner.userId }).sort({ lastPlayed: -1 })
        .select('gameId highScore plays streak level achievements updatedAt')
        .lean<Array<{
          gameId: string; highScore?: number; plays?: number; streak?: number;
          level?: number; achievements?: string[]; updatedAt?: Date;
        }>>()
        // A trace reports the shape the API exposes, not the raw document —
        // no _id, no __v, no denormalized owner keys.
        .then((rows) => rows.map((r) => ({
          gameId: r.gameId,
          highScore: r.highScore || 0,
          plays: r.plays || 0,
          streak: r.streak || 0,
          level: r.level || 1,
          achievements: r.achievements || [],
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
        })))),
    import('@/app/lib/models/UserLibrary').then(({ default: UserLibrary }) =>
      UserLibrary.findOne({ email: owner.emailLc }).select('likes myList history').lean<{
        likes?: unknown[]; myList?: unknown[]; history?: unknown[];
      } | null>()),
    // Count only. Letter text is never returned by an admin trace.
    import('@/app/lib/models/UnsentLetter').then(({ default: UnsentLetter }) =>
      UnsentLetter.find(stamp).select('approved createdAt')
        .lean<Array<{ approved?: boolean; createdAt?: Date }>>()),
    import('@/app/lib/models/MediaComment').then(({ default: MediaComment }) =>
      MediaComment.find(stamp).countDocuments()),
    import('@/app/lib/models/UserActivity').then(({ default: UserActivity }) =>
      UserActivity.find(stamp).sort({ createdAt: -1 }).limit(50)
        .lean<Array<{ type: string; text: string; ref?: string; createdAt?: Date }>>()),
  ]);

  const orderSpend = orders
    .filter((o) => o.status !== 'Cancelled')
    .reduce((s, o) => s + (Number(o.total) || 0), 0);

  // A reward row with no ledgerTxId is pre-ledger history; both are real, and
  // the split is reported so the totals can be reconciled by hand.
  const legacyRewardRows = rewards.filter((r) => !r.ledgerTxId).length;

  return NextResponse.json({
    success: true,
    found: true,
    identity: {
      canonicalUserId: account.userId || null,
      // The one thing to look for when investigating duplication: two
      // accounts sharing a Discord id, or an account with no canonical id.
      missingCanonicalId: !account.userId,
      email: account.email || null,
      name: account.name || null,
      role: account.role || 'user',
      staffScopes: account.staffScopes || [],
      createdAt: account.createdAt ? new Date(account.createdAt).toISOString() : null,
      discord: discordId
        ? {
          discordId,
          username: account.discord?.username || account.linkedAccounts?.discordUsername || null,
          linkedAt: account.discord?.linkedAt || account.linkedAccounts?.linkedAt || null,
        }
        : null,
    },
    shop: {
      orders: orders.length,
      delivered: orders.filter((o) => o.status === 'Delivered').length,
      lifetimeSpend: orderSpend,
      pointsFromOrders: orders.reduce((s, o) => s + (Number(o.pointsEarned) || 0), 0),
      recent: orders.slice(0, 10),
    },
    points: {
      balance: account.coinBalance || 0,
      ledgerEntries: ledger.length,
      legacyRewardRows,
      note: legacyRewardRows > 0
        ? `${legacyRewardRows} pre-ledger reward row(s) exist. They are real history and are `
          + 'still counted; they simply carry no transaction id.'
        : 'Every reward is a ledger entry with a transaction id.',
      recent: ledger.slice(0, 20),
    },
    inventory: {
      items: inventory.length,
      detail: inventory.map((i) => ({
        itemId: i.itemId, name: i.name || i.itemId, kind: i.kind,
        quantity: i.quantity || 0, source: i.source || '',
        acquiredAt: i.acquiredAt ? new Date(i.acquiredAt).toISOString() : null,
      })),
      note: inventory.length === 0
        ? 'No items. This is expected for accounts predating the unified inventory — '
          + 'it is not evidence that purchases were lost.'
        : null,
    },
    games: {
      gamesPlayed: games.length,
      totalXp: games.reduce((s, g) => s + (Number(g.xp) || 0), 0),
      progress: games,
      serverSaves: saves,
      // GameProgress and GameSave are deliberately separate: progress is
      // server-computed from validated plays, saves are game-specific state.
      savesNote: 'Progress rows are server-validated. Save rows are per-game state the client '
        + 'owns its shape of. A save is not a reward.',
    },
    murastream: {
      favorites: library?.likes?.length ?? 0,
      watchlist: library?.myList?.length ?? 0,
      history: library?.history?.length ?? 0,
      comments: mediaComments,
      // Library rows are matched on the legacy email key because that
      // collection predates canonicalUserId — stated so a zero here is not
      // mistaken for "no viewing happened".
      storageKey: 'UserLibrary keyed by email (pre-canonicalUserId collection)',
    },
    letters: {
      // Metadata only. Content is never exposed here.
      total: letters.length,
      visible: letters.filter((l) => l.approved !== false).length,
      hidden: letters.filter((l) => l.approved === false).length,
      note: 'Counts only — letter text is not returned by a trace.',
    },
    murabot: {
      // Muragoods-side answer. The bot's own per-guild data (economy, levels,
      // moderation) is guild-scoped and deliberately NOT merged here: a user
      // in two servers has two server economies and one Muragoods account.
      note: 'Server-scoped Discord data (economy, leveling, moderation) is keyed by guildId '
        + 'and is intentionally not merged into this personal trace.',
      resolvable: Boolean(discordId),
    },
    activity: activity.slice(0, 20),
    tracedBy: { userId: guard.access.userId, email: guard.access.email, level: guard.access.level },
  });
}