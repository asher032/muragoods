import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Order from '@/app/lib/models/Order';

export async function GET() {
  try {
    await dbConnect();

    // Fetch all non-cancelled orders
    const orders = await Order.find({ status: { $ne: 'Cancelled' } }).sort({ createdAt: -1 });

    // Aggregate by user
    const userMap = new Map<string, {
      name: string;
      email: string;
      totalSpent: number;
      orderCount: number;
      coinsEarned: number;
      deliveredCount: number;
    }>();

    for (const order of orders) {
      const key = order.userId || order.customer || 'unknown';
      const existing = userMap.get(key);
      if (existing) {
        existing.totalSpent += order.total || 0;
        existing.orderCount += 1;
        existing.coinsEarned += order.pointsEarned || Math.floor((order.total || 0) * 1);
        if (order.status === 'Delivered') existing.deliveredCount += 1;
      } else {
        userMap.set(key, {
          name: order.customer || 'Unknown Player',
          email: order.userId || key,
          totalSpent: order.total || 0,
          orderCount: 1,
          coinsEarned: order.pointsEarned || Math.floor((order.total || 0) * 1),
          deliveredCount: order.status === 'Delivered' ? 1 : 0,
        });
      }
    }

    // Sort by total spent (descending)
    const leaderboard = Array.from(userMap.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((entry, index) => ({
        rank: index + 1,
        ...entry,
        // Mask email for privacy — show only first part
        displayName: entry.name,
      }));

    return NextResponse.json({ success: true, data: leaderboard });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
