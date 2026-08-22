import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

// GET — Fetch a user's perks (by email or userId)
export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const query = searchParams.get('query'); // search by name, email, or userId

    if (query) {
      // Admin search — find user by name, email, or userId
      const users = await User.find({
        $or: [
          { email: { $regex: new RegExp(query, 'i') } },
          { name: { $regex: new RegExp(query, 'i') } },
          { userId: { $regex: new RegExp(query, 'i') } },
        ],
      }).select('name email userId perks').limit(10);
      return NextResponse.json({ success: true, data: users });
    }

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const user = await User.findOne({ email }).select('name email userId perks');
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST — Add a perk to a user (admin action)
export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { email, perkId, perkName, perkDescription, addedBy } = body;

    if (!email || !perkId || !perkName) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Initialize perks array if it doesn't exist
    if (!user.perks) user.perks = [];

    // Check if perk already exists
    const existing = user.perks.find((p: { perkId: string }) => p.perkId === perkId);
    if (existing) {
      return NextResponse.json({ success: false, error: 'User already has this perk' }, { status: 400 });
    }

    user.perks.push({
      perkId,
      perkName,
      perkDescription: perkDescription || '',
      addedBy: addedBy || 'Admin',
      addedAt: new Date(),
      redeemed: false,
    });

    await user.save();

    return NextResponse.json({ success: true, data: user.perks });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH — Mark a perk as redeemed
export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { email, perkId, action } = body;

    if (!email || !perkId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user || !user.perks) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const perk = user.perks.find((p: { perkId: string }) => p.perkId === perkId);
    if (!perk) {
      return NextResponse.json({ success: false, error: 'Perk not found' }, { status: 404 });
    }

    if (action === 'redeem') {
      perk.redeemed = true;
      perk.redeemedAt = new Date();
    }

    await user.save();
    return NextResponse.json({ success: true, data: user.perks });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE — Remove a perk from a user
export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const perkId = searchParams.get('perkId');

    if (!email || !perkId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user || !user.perks) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    user.perks = user.perks.filter((p: { perkId: string }) => p.perkId !== perkId);
    await user.save();

    return NextResponse.json({ success: true, data: user.perks });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
