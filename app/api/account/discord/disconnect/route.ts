import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import UserActivity from '@/app/lib/models/UserActivity';
import { getSessionUser } from '@/app/lib/session';
import { getIdentityWithId, ownerStamp } from '@/app/lib/identity';
import { rateLimit } from '@/app/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/account/discord/disconnect — remove the Discord link.
//
// Unlinking NEVER deletes anything. Game, shop, stream, order and points data
// is keyed by the canonical `userId`, not by the Discord id, so removing the
// external link cannot orphan it. The person can relink the same Discord
// account later and everything is still there.
export async function POST(req: Request) {
  try {
    const session = await getSessionUser(req);
    if (!session) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const rl = rateLimit(`unlink:${session.email.toLowerCase()}`, 5, 60_000);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    await dbConnect();
    const user = await User.findOne({ email: session.email }).select('discord linkedAccounts').lean<{
      discord?: { discordId?: string };
      linkedAccounts?: { discordUserId?: string };
    } | null>();
    if (!user?.discord?.discordId && !user?.linkedAccounts?.discordUserId) {
      return NextResponse.json({ success: true, linked: false });
    }
    // Both field names are cleared together — the canonical one and the
    // historical one — so neither can be left behind as a phantom link.
    await User.updateOne(
      { email: session.email },
      {
        $unset: { discord: '', linkedAccounts: '' },
        $set: { updatedAt: new Date() },
      },
    );
    const identity = await getIdentityWithId(req);
    await UserActivity.create({
      ...(identity ? ownerStamp(identity) : {}),
      userEmail: session.email.toLowerCase(), discordId: '', type: 'link',
      text: 'Disconnected Discord (data kept)', visibility: 'private',
    }).catch(() => undefined);
    return NextResponse.json({ success: true, linked: false });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not disconnect' }, { status: 500 });
  }
}
