import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { email, code } = (await req.json()) as { email: string; code: string };

    if (!email || !code) {
      return NextResponse.json({ success: false, error: 'Email and code are required' }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    if (user.emailVerified) {
      return NextResponse.json({ success: true, message: 'Email already verified' });
    }

    if (!user.verificationCode || !user.verificationExpires) {
      return NextResponse.json({ success: false, error: 'No verification code found. Please sign up again.' }, { status: 400 });
    }

    if (new Date() > user.verificationExpires) {
      return NextResponse.json({ success: false, error: 'Code has expired. Please sign up again.' }, { status: 400 });
    }

    if (user.verificationCode !== code) {
      return NextResponse.json({ success: false, error: 'Invalid verification code' }, { status: 400 });
    }

    // Mark as verified
    user.emailVerified = true;
    user.verificationCode = null;
    user.verificationExpires = null;
    await user.save();

    return NextResponse.json({ success: true, message: 'Email verified successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
