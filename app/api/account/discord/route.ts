import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { getSessionUser } from '@/app/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/account/discord — Discord link status for the signed-in user.
// Never exposes tokens or secrets: only username, avatar, status and date.
export async function GET(req: Request) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    await dbConnect();
    const user = await User.findOne({ email: session.email })
      .select('discord').lean<{ discord?: { discordId?: string; username?: string; avatar?: string; linkedAt?: Date } } | null>();
    const d = user?.discord;
    return NextResponse.json({
      success: true,
      linked: Boolean(d?.discordId),
      discord: d?.discordId
        ? { username: d.username || '', avatar: d.avatar || '', linkedAt: d.linkedAt || null }
        : null,
      connectUrl: '/api/auth/discord?mode=link&next=/account/connected',
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load link status' }, { status: 500 });
  }
}
