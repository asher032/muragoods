import { NextRequest, NextResponse } from 'next/server';

async function connectDB() {
  const mongoose = await import('mongoose');
  if (mongoose.default.connections[0].readyState === 1) return;
  await mongoose.default.connect(process.env.MONGODB_URI!);
}

export async function GET() {
  try {
    await connectDB();
    const { default: TopUpOrder } = await import('@/app/lib/models/TopUpOrder');
    const orders = await TopUpOrder.find({}).sort({ createdAt: -1 }).limit(100).lean();
    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error('Admin topup orders error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch orders' }, { status: 500 });
  }
}

// PATCH: Fulfill or fail an order
export async function PATCH(req: NextRequest) {
  try {
    const { orderId, action, reason } = await req.json();
    if (!orderId || !action) {
      return NextResponse.json({ success: false, error: 'orderId and action required' }, { status: 400 });
    }

    await connectDB();
    const { default: TopUpOrder } = await import('@/app/lib/models/TopUpOrder');
    const order = await TopUpOrder.findOne({ orderId });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    if (action === 'fulfill') {
      order.topUpStatus = 'completed';
      order.completedAt = new Date();
      order.adminNotes = 'Manually fulfilled by admin';
      await order.save();
      console.log(`[Fulfillment] Order ${orderId} — marked as completed`);
      return NextResponse.json({ success: true, message: 'Order fulfilled' });
    }

    if (action === 'fail') {
      order.topUpStatus = 'manual_review';
      order.adminNotes = reason || 'Admin marked as unable to fulfill';
      await order.save();
      console.log(`[Fulfillment] Order ${orderId} — marked as unable to fulfill: ${reason}`);
      return NextResponse.json({ success: true, message: 'Order marked as unable to fulfill' });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('Admin topup orders PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update order' }, { status: 500 });
  }
}
