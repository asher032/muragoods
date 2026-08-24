import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

// PATCH — Add or deduct coins from a user
export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { email, action, amount, reason } = body;

    if (!email || !action || !amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Missing required fields (email, action, amount)' }, { status: 400 });
    }

    if (!['add', 'deduct'].includes(action)) {
      return NextResponse.json({ success: false, error: 'Action must be "add" or "deduct"' }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Initialize coinBalance if it doesn't exist
    if (user.coinBalance === undefined) user.coinBalance = 0;
    if (!user.coinHistory) user.coinHistory = [];

    if (action === 'add') {
      user.coinBalance += amount;
    } else {
      user.coinBalance = Math.max(0, user.coinBalance - amount);
    }

    user.coinHistory.push({
      type: action === 'add' ? 'earn' : 'spend',
      amount,
      label: reason || (action === 'add' ? 'Admin bonus' : 'Admin deduction'),
      date: new Date(),
    });

    await user.save();

    return NextResponse.json({
      success: true,
      data: { coinBalance: user.coinBalance },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
