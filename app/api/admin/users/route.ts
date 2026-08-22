import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import Order from '@/app/lib/models/Order';

// GET — List all users with stats
export async function GET() {
  try {
    await dbConnect();
    const users = await User.find({}, { name: 1, email: 1, userId: 1, perks: 1, createdAt: 1 }).sort({ createdAt: -1 });

    // Fetch order counts per user
    const userEmails = users.map((u: { email: string }) => u.email);
    const orderCounts = await Order.aggregate([
      { $match: { userId: { $in: userEmails } } },
      { $group: { _id: '$userId', totalSpent: { $sum: '$total' }, orderCount: { $sum: 1 }, delivered: { $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] } } } },
    ]);
    const orderMap = new Map(orderCounts.map((o: { _id: string; totalSpent: number; orderCount: number; delivered: number }) => [o._id, o]));

    const result = users.map((u: { name: string; email: string; userId?: string; perks?: { perkId: string; perkName: string }[]; createdAt: Date }) => {
      const stats = orderMap.get(u.email) || { totalSpent: 0, orderCount: 0, delivered: 0 };
      return {
        name: u.name,
        email: u.email,
        userId: u.userId || 'N/A',
        perks: u.perks || [],
        joinedAt: u.createdAt,
        totalSpent: stats.totalSpent,
        orderCount: stats.orderCount,
        delivered: stats.delivered,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
