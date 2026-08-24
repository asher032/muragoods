import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { email } = (await req.json()) as { email: string };

    if (!email) {
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

    return NextResponse.json({ 
      success: true, 
      message: `Your verification code is: ${code}. This code expires in 15 minutes. Ask an admin for it.`,
      // In production, this would be sent via email
      _debug_code: code,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
