import { NextResponse } from 'next/server';

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
