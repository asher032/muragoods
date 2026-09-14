import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

// Account profile API — lets the signed-in user view and update their own
// display name and avatar. Email is the identity key (matches AuthContext's
// localStorage user object).

const MAX_AVATAR_CHARS = 900_000; // ~650KB image as data URL

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    if (!email) {
      return NextResponse.json({ success: false, error: 'email is required' }, { status: 400 });
    }
    const user = await User.findOne({ email }).select('name email userId avatar createdAt coinBalance perks');
    if (!user) return NextResponse.json({ success: true, data: null });
    return NextResponse.json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        userId: user.userId,
        avatar: user.avatar || '',
        createdAt: user.createdAt,
        coinBalance: user.coinBalance || 0,
        perks: user.perks || [],
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));
    const email: string = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email) {
      return NextResponse.json({ success: false, error: 'email is required' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 40) {
        return NextResponse.json({ success: false, error: 'Name must be 2–40 characters' }, { status: 400 });
      }
      update.name = name;
    }

    if (body.avatar !== undefined) {
      const avatar = String(body.avatar);
      if (avatar && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(avatar)) {
        return NextResponse.json({ success: false, error: 'Avatar must be an image data URL' }, { status: 400 });
      }
      if (avatar.length > MAX_AVATAR_CHARS) {
        return NextResponse.json({ success: false, error: 'Image too large — pick one under 2MB' }, { status: 400 });
      }
      update.avatar = avatar;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }

    const user = await User.findOneAndUpdate({ email }, update, {
      new: true,
      select: 'name email userId avatar createdAt coinBalance',
    });
    if (!user) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        userId: user.userId,
        avatar: user.avatar || '',
        createdAt: user.createdAt,
        coinBalance: user.coinBalance || 0,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
