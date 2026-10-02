import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { requireStaff } from '@/app/lib/access-control';
import { rateLimit, clientIp } from '@/app/lib/rate-limit';

// Economy ledger. Scope: `economy` — so support staff can answer "where did my
// coins go?" by handing them that scope alone, not by making them an admin.

// GET — Fetch a user's coin balance
export async function GET(req: Request) {
  try {
    const guard = await requireStaff(req, ['economy']);
    if (!guard.ok) return guard.response;

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    if (!email) {
      return NextResponse.json({ success: false, error: 'Email required' }, { status: 400 });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: { coinBalance: user.coinBalance || 0, coinHistory: user.coinHistory || [] },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH — Add or deduct coins from a user
export async function PATCH(req: Request) {
  try {
    const guard = await requireStaff(req, ['economy']);
    if (!guard.ok) return guard.response;
    const rl = rateLimit(`coins:${guard.access.email ?? 'anon'}:${clientIp(req)}`, 30, 60_000);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });

    await dbConnect();
    const body = await req.json();
    const { email, action, amount, reason } = body;

    if (!email || !action || !amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Missing required fields (email, action, amount)' }, { status: 400 });
    }
    // Strict input bounds — amount must be a sane positive integer.
    if (!Number.isInteger(amount) || amount > 1_000_000) {
      return NextResponse.json({ success: false, error: 'Amount must be a positive integer' }, { status: 400 });
    }
    if (typeof reason === 'string' && reason.length > 200) {
      return NextResponse.json({ success: false, error: 'Reason too long' }, { status: 400 });
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
