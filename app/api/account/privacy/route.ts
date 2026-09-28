import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { getSessionUser } from '@/app/lib/session';
import { rateLimit } from '@/app/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GAME_PROFILE = ['public', 'private'];
const FAVORITES = ['public', 'private'];
const ACTIVITY = ['private', 'friends', 'public'];
const WATCH = ['private', 'public'];

// GET /api/account/privacy — own privacy settings.
export async function GET(req: Request) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    await dbConnect();
    const user = await User.findOne({ email: session.email }).select('privacy').lean<{
      privacy?: Record<string, string>;
    } | null>();
    return NextResponse.json({
      success: true,
      privacy: {
        gameProfile: 'public', favorites: 'private', activity: 'private', watchHistory: 'private',
        ...(user?.privacy || {}),
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load privacy' }, { status: 500 });
  }
}

// PATCH /api/account/privacy { gameProfile?, favorites?, activity?, watchHistory? }
export async function PATCH(req: Request) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const rl = rateLimit(`privacy:${session.email.toLowerCase()}`, 20, 60_000);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const update: Record<string, string> = {};
    const pick = (key: string, allowed: string[]) => {
      if (body[key] !== undefined) {
        const v = String(body[key]);
        if (!allowed.includes(v)) throw new Error(`Bad ${key}`);
        update[`privacy.${key}`] = v;
      }
    };
    try {
      pick('gameProfile', GAME_PROFILE);
      pick('favorites', FAVORITES);
      pick('activity', ACTIVITY);
      pick('watchHistory', WATCH);
    } catch (e) {
      return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Bad value' }, { status: 400 });
    }
    if (!Object.keys(update).length) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }
    await dbConnect();
    await User.updateOne({ email: session.email }, { $set: update });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not save privacy' }, { status: 500 });
  }
}
