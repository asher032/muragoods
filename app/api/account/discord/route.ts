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
      .select('discord linkedAccounts').lean<{
        discord?: { discordId?: string; username?: string; avatar?: string; linkedAt?: Date };
        linkedAccounts?: { discordUserId?: string; discordUsername?: string; discordAvatar?: string; discordLinkedAt?: Date | null };
      } | null>();
    const d = user?.discord;
    const la = user?.linkedAccounts;
    // Prefer the historical field so a link made before `linkedAccounts`
    // existed still reads as connected.
    const discordId = d?.discordId || la?.discordUserId || '';
    return NextResponse.json({
      success: true,
      linked: Boolean(discordId),
      discord: discordId
        ? {
          userId: discordId,
          username: d?.username || la?.discordUsername || '',
          avatar: d?.avatar || la?.discordAvatar || '',
          linkedAt: d?.linkedAt || la?.discordLinkedAt || null,
        }
        : null,
      connectUrl: '/api/auth/discord?mode=link&next=/account/connected',
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load link status' }, { status: 500 });
  }
}
