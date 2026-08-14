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

    return NextResponse.json({ success: true, data: { name: user.name, email: user.email } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
