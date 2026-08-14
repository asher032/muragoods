import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { name, email, password } = (await req.json()) as { name: string; email: string; password: string };

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ success: false, error: 'Email already exists' }, { status: 400 });
    }

    const user = await User.create({ name, email, password });
    return NextResponse.json({ success: true, data: { name: user.name, email: user.email } }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
