import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/email';
import { rateLimit, clientIp } from '@/app/lib/rate-limit';

export async function POST(req: Request) {
  try {
    // Verification emails cost money and can spam people — 3 per 15 min.
    const rl = rateLimit(`resend:${clientIp(req)}`, 3, 15 * 60_000);
    if (!rl.ok) {
      return NextResponse.json({ success: false, error: 'Too many requests — wait a bit.' }, { status: 429 });
    }

    await dbConnect();
    const { email } = (await req.json()) as { email: string };

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ success: true, message: 'Email already verified' });
    }

    // Generate new 6-digit code
    const newCode = crypto.randomInt(100000, 999999).toString();
    user.verificationCode = newCode;
    user.verificationExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await user.save();

    // Send the email
    let emailSent = false;
    try {
      emailSent = await sendVerificationEmail(user.email, newCode, user.name);
    } catch (e) {
      console.error('[Resend] Email send failed:', e);
    }

    if (emailSent) {
      return NextResponse.json({ success: true, message: 'New verification code sent! Check your inbox.' });
    } else {
      return NextResponse.json({ 
        success: true, 
        message: `Your new code is: ${newCode} (email delivery failed, use this code)` 
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
