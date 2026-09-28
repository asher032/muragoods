import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import UserActivity from '@/app/lib/models/UserActivity';
import { getSessionUser } from '@/app/lib/session';
import { rateLimit } from '@/app/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/account/discord/disconnect — remove the Discord link.
// Unlinking NEVER deletes game/shop/stream data (keyed by email); it only
// clears the join key, and the user can relink the same account later to
// restore cross-platform sync.
export async function POST(req: Request) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const rl = rateLimit(`unlink:${session.email.toLowerCase()}`, 5, 60_000);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    await dbConnect();
    const user = await User.findOne({ email: session.email }).select('discord').lean<{
      discord?: { discordId?: string; username?: string };
    } | null>();
    if (!user?.discord?.discordId) {
      return NextResponse.json({ success: true, linked: false });
    }
    await User.updateOne(
      { email: session.email },
      { $unset: { discord: '' } },
    );
    await UserActivity.create({
      userEmail: session.email.toLowerCase(), discordId: '', type: 'link',
      text: 'Disconnected Discord (data kept)', visibility: 'private',
    }).catch(() => undefined);
    return NextResponse.json({ success: true, linked: false });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not disconnect' }, { status: 500 });
  }
}
