import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '@/lib/email';
import { rateLimit, clientIp } from '@/app/lib/rate-limit';

export async function POST(req: Request) {
  try {
    // Email-sending endpoint — cap it hard (3 per 15 min per IP).
    const rl = rateLimit(`forgot:${clientIp(req)}`, 3, 15 * 60_000);
    if (!rl.ok) {
      return NextResponse.json({ success: false, error: 'Too many reset requests — wait a bit.' }, { status: 429 });
    }

    await dbConnect();
    const { email } = (await req.json()) as { email: string };

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if user exists or not
      return NextResponse.json({ success: true, message: 'If an account exists, a code has been generated. Ask an admin for it.' });
    }

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store the reset code on the user document
    user.passwordResetCode = code;
    user.passwordResetExpires = expiresAt;
    await user.save();

    // Send reset code via email
    let emailSent = false;
    try {
      emailSent = await sendPasswordResetEmail(email, code, user.name);
    } catch (e) {
      console.error('[ForgotPassword] Email send failed:', e);
    }

    return NextResponse.json({ 
      success: true, 
      message: emailSent 
        ? `A verification code has been sent to ${email}. Check your inbox!`
        : `If an account exists, a code has been generated. Check your email or ask an admin.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
