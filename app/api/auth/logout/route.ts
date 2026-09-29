import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/app/lib/session';
import { revokeSession as revokeDiscordSession } from '@/app/lib/discord-session';

// POST /api/auth/logout — ONE logout for the whole ecosystem. Clears the
// Muragoods session cookie AND revokes the Discord dashboard session, so the
// user leaves Muragoods, Murastream, games and the Murabot dashboard at once.
// (Disconnecting Discord *as a linked identity* is separate:
// POST /api/account/discord/disconnect only unlinks, it never signs out.)
export async function POST() {
  try {
    await revokeDiscordSession();
  } catch {
    // Discord session store unreachable — the shop cookie is still cleared
    // below; a stale dashboard session expires on its 30d idle TTL.
  }
  const res = NextResponse.json({ success: true });
  return clearSessionCookie(res);
}
