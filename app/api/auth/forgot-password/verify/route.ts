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
      return NextResponse.json({ success: false, error: 'Invalid code or email' }, { status: 400 });
    }

    if (!user.passwordResetCode || !user.passwordResetExpires) {
      return NextResponse.json({ success: false, error: 'No reset code found. Please request a new one.' }, { status: 400 });
    }

    if (new Date() > user.passwordResetExpires) {
      return NextResponse.json({ success: false, error: 'Code has expired. Please request a new one.' }, { status: 400 });
    }

    if (user.passwordResetCode !== code) {
      return NextResponse.json({ success: false, error: 'Invalid code' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Code verified successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
