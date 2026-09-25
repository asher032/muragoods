import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import dbConnect from '@/app/lib/mongodb';
import Order from '@/app/lib/models/Order';
import { getSessionUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Key for the opaque player keys.
 *
 * AUTH_SECRET is mandatory elsewhere (session.ts fails closed without it) and
 * must not be optional here either: a fallback constant would make every key
 * forgeable, and 16+ characters matches the rest of the app's requirement.
 */
function hmacSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

/**
 * Public display name only.
 *
 * Orders store a display name in `customer` (e.g. "Maria C."), but an account
 * identifier can end up in that field too, and this route is public — so
 * anything containing '@' is reduced to a few characters.
 */
function publicName(value: unknown): string {
  const name = String(value ?? '').trim() || 'Unknown Player';
  return name.includes('@') ? `${name.split('@')[0].slice(0, 3)}***` : name;
}

/**
 * Opaque, stable per-player key: HMAC-SHA256 of the account identifier under
 * AUTH_SECRET.
 *
 * Orders key accounts by email in `userId`, and that value used to be
 * serialised straight out as `email` — anyone could read the whole customer
 * list from an unauthenticated request. This gives the UI the one thing it
 * actually needs (a stable value to test each row against) without handing out
 * the identifier: the key is neither reversible nor enumerable from the
 * response, and unrelated players never collide.
 */
function playerKey(identifier: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(identifier.trim().toLowerCase())
    .digest('base64url')
    .slice(0, 22);
}

export async function GET(req: NextRequest) {
  const secret = hmacSecret();
  if (!secret) {
    // Fail closed: without a secret there is no safe value to publish.
    console.error('[leaderboard] AUTH_SECRET is missing or too short');
    return NextResponse.json(
      { success: false, error: 'Server configuration error' },
      { status: 500 },
    );
  }

  try {
    await dbConnect();

    // Fetch all non-cancelled orders
    const orders = await Order.find({ status: { $ne: 'Cancelled' } }).sort({ createdAt: -1 });

    // Aggregate by user
    const userMap = new Map<string, {
      name: string;
      key: string;
      totalSpent: number;
      orderCount: number;
      coinsEarned: number;
      deliveredCount: number;
    }>();

    for (const order of orders) {
      const identifier = order.userId || order.customer || 'unknown';
      const existing = userMap.get(identifier);
      if (existing) {
        existing.totalSpent += order.total || 0;
        existing.orderCount += 1;
        existing.coinsEarned += order.pointsEarned || Math.floor((order.total || 0) * 1);
        if (order.status === 'Delivered') existing.deliveredCount += 1;
      } else {
        userMap.set(identifier, {
          name: publicName(order.customer),
          key: playerKey(identifier, secret),
          totalSpent: order.total || 0,
          orderCount: 1,
          coinsEarned: order.pointsEarned || Math.floor((order.total || 0) * 1),
          deliveredCount: order.status === 'Delivered' ? 1 : 0,
        });
      }
    }

    // Sort by total spent (descending). Only the opaque key and public
    // statistics leave this route — never the identifier behind them.
    const leaderboard = Array.from(userMap.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((entry, index) => ({
        rank: index + 1,
        name: entry.name,
        displayName: entry.name,
        playerKey: entry.key,
        totalSpent: entry.totalSpent,
        orderCount: entry.orderCount,
        coinsEarned: entry.coinsEarned,
        deliveredCount: entry.deliveredCount,
      }));

    // The caller's own key so the UI can mark "you" without ever holding an
    // identifier. Resolved from the signed-in session, not from anything the
    // client claims; anonymous requests simply get no `you`.
    const session = await getSessionUser(req);
    const you = session?.email ? playerKey(session.email, secret) : undefined;

    return NextResponse.json({
      success: true,
      data: leaderboard,
      ...(you ? { you } : {}),
    });
  } catch (error: unknown) {
    // Internal detail stays in the server log: this response is public.
    console.error('[leaderboard]', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'Failed to load leaderboard' },
      { status: 500 },
    );
  }
}
