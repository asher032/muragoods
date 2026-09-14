import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Order from '@/app/lib/models/Order';
import User from '@/app/lib/models/User';

// POST — server-side, idempotent award of coins when an order is delivered.
// Called from PATCH /api/orders when the status transitions to 'Delivered'.
// Keeps a flag on the order document so retries can never double-award.
export async function POST(req: Request) {
  try {
    await dbConnect();
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId required' }, { status: 400 });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    if (order.status !== 'Delivered') {
      return NextResponse.json({ success: false, error: 'Order is not delivered' }, { status: 400 });
    }

    // Idempotency flag (optional field, works with existing documents)
    if ((order as unknown as { coinsAwarded?: boolean }).coinsAwarded) {
      return NextResponse.json({ success: true, data: { alreadyAwarded: true, awarded: 0 } });
    }

    const points = order.pointsEarned ?? 0;
    if (points <= 0 || !order.userId) {
      // Nothing to award; still mark so we don't retry forever
      await Order.updateOne({ _id: order._id }, { $set: { coinsAwarded: true } });
      return NextResponse.json({ success: true, data: { awarded: 0 } });
    }

    const user = await User.findOne({ email: order.userId });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (user.coinBalance === undefined) user.coinBalance = 0;
    if (!user.coinHistory) user.coinHistory = [];
    user.coinBalance += points;
    user.coinHistory.push({
      type: 'earn',
      amount: points,
      label: `Order #${String(order._id).slice(-8).toUpperCase()} delivered`,
      date: new Date(),
    });
    await user.save();

    await Order.updateOne({ _id: order._id }, { $set: { coinsAwarded: true } });

    return NextResponse.json({ success: true, data: { awarded: points, coinBalance: user.coinBalance } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
