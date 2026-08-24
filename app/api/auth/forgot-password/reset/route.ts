import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { email, code, newPassword } = (await req.json()) as { email: string; code: string; newPassword: string };

    if (!email || !code || !newPassword) {
      return NextResponse.json({ success: false, error: 'All fields are required' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
    }

    if (!user.passwordResetCode || !user.passwordResetExpires) {
      return NextResponse.json({ success: false, error: 'No reset code found' }, { status: 400 });
    }

    if (new Date() > user.passwordResetExpires) {
      return NextResponse.json({ success: false, error: 'Code has expired' }, { status: 400 });
    }

    if (user.passwordResetCode !== code) {
      return NextResponse.json({ success: false, error: 'Invalid code' }, { status: 400 });
    }

    // Update password and clear reset code
    user.password = newPassword;
    user.passwordResetCode = null;
    user.passwordResetExpires = null;
    await user.save();

    return NextResponse.json({ success: true, message: 'Password reset successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
