import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { hashPassword, verifyPassword, isHashed } from '@/app/lib/password';
import { rateLimit, clientIp } from '@/app/lib/rate-limit';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'mhaxthedog@gmail.com,muragoods0@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase());
// Admin password lives in the ADMIN_PASSWORD environment variable — never in source.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

export async function POST(req: Request) {
  // Rate limit: 8 login attempts per IP per minute, 20 per email per 5 min.
  const ip = clientIp(req);
  const limited = rateLimit(`login:ip:${ip}`, 8, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { success: false, error: `Too many attempts — try again in ${limited.retryAfterSec}s` },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    );
  }

  try {
    await dbConnect();
    const { email, password } = (await req.json()) as { email: string; password: string };

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password are required' }, { status: 400 });
    }
    const emailLc = email.toLowerCase().trim();

    const perEmail = rateLimit(`login:email:${emailLc}`, 20, 5 * 60_000);
    if (!perEmail.ok) {
      return NextResponse.json(
        { success: false, error: `Too many attempts for this account — try again in ${perEmail.retryAfterSec}s` },
        { status: 429 },
      );
    }

    let user = await User.findOne({ email: emailLc });

    // Auto-create admin accounts if they don't exist in DB yet. The created
    // record stores a bcrypt hash — never the plaintext.
    if (!user && ADMIN_PASSWORD && ADMIN_EMAILS.includes(emailLc) && password === ADMIN_PASSWORD) {
      user = await User.create({
        name: emailLc === ADMIN_EMAILS[0] ? 'MuraAdmin' : 'MuraAdmin2',
        email: emailLc,
        password: await hashPassword(ADMIN_PASSWORD),
        role: 'admin',
        userId: 'MG-' + emailLc.split('@')[0].toUpperCase().slice(0, 6) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        emailVerified: true,
      });
    }

    // If user is an admin email, ensure role is set correctly and the
    // password matches the configured admin secret.
    if (user && ADMIN_EMAILS.includes(emailLc)) {
      const matchesAdmin = ADMIN_PASSWORD && password === ADMIN_PASSWORD;
      const storedIsStale = !(await verifyPassword(password, user.password));
      if (matchesAdmin && storedIsStale) {
        user.password = await hashPassword(ADMIN_PASSWORD);
      }
      if (user.role !== 'admin') {
        user.role = 'admin';
      }
      if (!user.userId) {
        user.userId = 'MG-' + emailLc.split('@')[0].toUpperCase().slice(0, 6) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      }
      await user.save();
    }

    if (!user) {
      return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 401 });
    }

    // Compare passwords (bcrypt for new/updated records; legacy plaintext
    // rows still verify and are upgraded in place).
    if (!(await verifyPassword(password, user.password))) {
      return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 401 });
    }

    // Transparent upgrade: legacy plaintext → bcrypt hash.
    if (!isHashed(user.password)) {
      user.password = await hashPassword(password);
    }

    // Auto-verify legacy accounts that have no verificationCode (created before verification system)
    if (user && !user.emailVerified && !user.verificationCode) {
      user.emailVerified = true;
      await user.save();
    }

    // Generate userId for users who signed up before the field existed
    let userId = user.userId;
    if (!userId) {
      userId = 'MG-' + emailLc.split('@')[0].toUpperCase().slice(0, 6) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      user.userId = userId;
      await user.save();
    }

    const role = user.role || 'user';

    return NextResponse.json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        userId,
        role,
        createdAt: user.createdAt,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
