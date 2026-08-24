import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

// DELETE — Remove a user account
export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    const adminEmails = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];
    if (adminEmails.includes(email)) {
      return NextResponse.json({ success: false, error: 'Cannot delete admin accounts' }, { status: 403 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    await User.findOneAndDelete({ email });
    return NextResponse.json({ success: true, message: `User ${email} has been deleted` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
