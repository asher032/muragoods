import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { getSessionUser, isAdminEmail, type SessionUser } from '@/app/lib/session';
import { getSession } from '@/app/lib/discord-session';

// Admin guard that accepts EITHER login method: the shop session cookie
// (email+password login) or the dashboard Discord session — resolved to the
// linked shop user. One admin definition (User.role / ADMIN_EMAILS),
// two doors. Never trusts an email or id from the request body.
export async function requireAdminEither(
  req: Request,
): Promise<{ user: SessionUser; response?: never } | { user?: never; response: NextResponse }> {
  const shop = await getSessionUser(req);
  if (shop) {
    if (shop.role === 'admin' || isAdminEmail(shop.email)) return { user: shop };
    return { response: NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 }) };
  }
  try {
    const dash = await getSession();
    if (dash?.discordId) {
      await dbConnect();
      const linked = await User.findOne({ 'discord.discordId': dash.discordId })
        .select('name email userId role').lean<{
          name: string; email: string; userId?: string; role?: string;
        } | null>();
      if (linked && (linked.role === 'admin' || isAdminEmail(linked.email))) {
        return {
          user: {
            email: linked.email, name: linked.name,
            userId: linked.userId || '', role: linked.role || 'user',
          },
        };
      }
    }
  } catch { /* fall through to 401 */ }
  return { response: NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 }) };
}
