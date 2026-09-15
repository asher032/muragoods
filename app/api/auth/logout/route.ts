import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/app/lib/session';

// POST /api/auth/logout — clears the httpOnly session cookie. localStorage
// cleanup happens client-side; the cookie is what actually authenticates.
export async function POST() {
  const res = NextResponse.json({ success: true });
  return clearSessionCookie(res);
}
