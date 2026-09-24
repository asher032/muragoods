import crypto from 'crypto';
import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

// Server-side sessions. Login sets an HMAC-signed, httpOnly cookie; every
// protected API route derives the caller's identity from it instead of
// trusting an email/userId from the request body or URL.

const COOKIE_NAME = 'mura_session';
const MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

function sessionSecret(): string {
  // AUTH_SECRET is mandatory. There is deliberately no fallback: deriving the
  // HMAC key from MONGODB_URI (a value with different rotation/exposure
  // characteristics) or a public static string makes every mura_session
  // cookie forgeable. Throws so misconfiguration fails closed and loudly.
  const secret = process.env.AUTH_SECRET || '';
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET is not configured (set a 16+ character secret)');
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + MAX_AGE_SEC * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): { email: string } | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    // AUTH_SECRET missing/misconfigured — fail closed: no session validates.
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { email?: string; exp?: number };
    if (!data.email || !data.exp || data.exp < Date.now()) return null;
    return { email: data.email };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SEC,
  };
}

export function setSessionCookie(res: NextResponse, email: string): NextResponse {
  res.cookies.set({ ...sessionCookieOptions(), value: createSessionToken(email) });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set({ ...sessionCookieOptions(), value: '', maxAge: 0 });
  return res;
}

/** Reads the session token from an incoming request (cookie header). */
function readToken(req: Request): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE_NAME) return rest.join('=');
  }
  return undefined;
}

export interface SessionUser {
  email: string;
  name: string;
  userId: string;
  role: string;
}

/**
 * The authenticated user, resolved server-side from the signed cookie.
 * Returns null when there is no valid session. The DB lookup keeps the
 * role fresh — a demoted/banned user loses access immediately.
 */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const session = verifySessionToken(readToken(req));
  if (!session) return null;
  await dbConnect();
  const user = await User.findOne({ email: session.email }).select('name email userId role').lean<{
    name: string; email: string; userId?: string; role?: string;
  } | null>();
  if (!user) return null;
  return { email: user.email, name: user.name, userId: user.userId || '', role: user.role || 'user' };
}

export function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS || 'mhaxthedog@gmail.com,muragoods0@gmail.com')
    .split(',').map((e) => e.trim().toLowerCase());
  return admins.includes(email.toLowerCase());
}

/** 403 JSON response helper for admin-only routes. */
export function forbidden(): NextResponse {
  return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
}

/** Full admin guard: valid session + admin role. Returns the user or a 403 response. */
export async function requireAdmin(req: Request): Promise<{ user: SessionUser; response?: never } | { user?: never; response: NextResponse }> {
  const user = await getSessionUser(req);
  if (!user) {
    return { response: NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 }) };
  }
  if (user.role !== 'admin' && !isAdminEmail(user.email)) return { response: forbidden() };
  return { user };
}
