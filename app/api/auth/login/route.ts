import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

const ADMIN_EMAILS = ['mhaxthedog@gmail.com', 'muragoods0@gmail.com'];
const ADMIN_PASSWORD = 'Jesusmaryosepcasiram';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const { email, password } = (await req.json()) as { email: string; password: string };

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password are required' }, { status: 400 });
    }

    let user = await User.findOne({ email });

    // Auto-create admin accounts if they don't exist in DB yet
    if (!user && ADMIN_EMAILS.includes(email) && password === ADMIN_PASSWORD) {
      user = await User.create({
        name: email === 'mhaxthedog@gmail.com' ? 'MuraAdmin' : 'MuraAdmin2',
        email,
        password: ADMIN_PASSWORD,
        role: 'admin',
        userId: 'MG-' + email.split('@')[0].toUpperCase().slice(0, 6) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
        emailVerified: true,
      });
    }

    // If user exists but is admin and password doesn't match, reset password
    if (user && ADMIN_EMAILS.includes(email) && user.password !== password && password === ADMIN_PASSWORD) {
      user.password = ADMIN_PASSWORD;
      user.role = 'admin';
      if (!user.userId) {
        user.userId = 'MG-' + email.split('@')[0].toUpperCase().slice(0, 6) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      }
      await user.save();
    }

    if (!user) {
      return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 401 });
    }

    // Compare passwords (plaintext — no hashing in this system)
    if (user.password !== password) {
      return NextResponse.json({ success: false, error: 'Invalid email or password' }, { status: 401 });
    }

    // Generate userId for users who signed up before the field existed
    let userId = user.userId;
    if (!userId) {
      userId = 'MG-' + email.split('@')[0].toUpperCase().slice(0, 6) + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      user.userId = userId;
      await user.save();
    }

    const role = user.role || 'user';

    return NextResponse.json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        userId,
        role,
        createdAt: user.createdAt,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
