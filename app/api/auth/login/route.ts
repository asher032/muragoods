import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { email, password } = (await req.json()) as { email: string; password: string };

    const user = await User.findOne({ email });
    if (!user || user.password !== password) {
      return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 401 });
    }

    // Generate userId for users who signed up before the field existed
    let userId = user.userId;
    if (!userId) {
      userId = 'MG-' + email.split('@')[0].toUpperCase().slice(0, 6) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      user.userId = userId;
      await user.save();
    }

    return NextResponse.json({ success: true, data: { name: user.name, email: user.email, userId, createdAt: user.createdAt } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
