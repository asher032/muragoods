import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import crypto from 'crypto';
import { sendVerificationEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { name, email, password, referredBy } = (await req.json()) as { name: string; email: string; password: string; referredBy?: string };

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'Email already exists' }, { status: 400 });
    }

    const userId = 'MG-' + email.split('@')[0].toUpperCase().slice(0, 6) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const verificationCode = crypto.randomInt(100000, 999999).toString();
    
    // Generate unique referral code for this user
    const referralCode = 'MURA-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    // Validate referral code
    let referrerEmail = null;
    if (referredBy && referredBy.trim()) {
      const referrer = await User.findOne({ referralCode: referredBy.trim().toUpperCase() });
      if (referrer && referrer.email !== email) {
        referrerEmail = referrer.email;
        // Give referrer 50 bonus coins
        referrer.coinBalance += 50;
        referrer.coinHistory.push({
          type: 'earn' as const,
          amount: 50,
          label: `Referral bonus: ${name} joined`,
          date: new Date(),
        });
        await referrer.save();
      }
    }

    const user = await User.create({
      name,
      email,
      password,
      userId,
      verificationCode,
      verificationExpires: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
      emailVerified: false,
      referralCode,
      referredBy: referrerEmail,
      referralUsed: false,
    });

    // Auto-send verification email
    let emailSent = false;
    try {
      emailSent = await sendVerificationEmail(email, verificationCode, name);
    } catch (e) {
      console.error('[Signup] Email send failed:', e);
    }

    return NextResponse.json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        userId: user.userId,
        createdAt: user.createdAt,
        emailVerified: false,
        referralCode: user.referralCode,
        emailSent,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
