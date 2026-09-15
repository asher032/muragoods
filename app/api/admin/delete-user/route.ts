import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import { requireAdmin, isAdminEmail } from '@/app/lib/session';

// DELETE — Remove a user account (admin session required; the request's
// target email is data, never proof of authority).
export async function DELETE(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (auth.response) return auth.response;

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    // Never allow deleting an admin account (checked against the server-side
    // admin list, not a hardcoded array).
    if (isAdminEmail(email)) {
      return NextResponse.json({ success: false, error: 'Cannot delete admin accounts' }, { status: 403 });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    await User.findOneAndDelete({ email });
    return NextResponse.json({ success: true, message: 'User deleted' });
  } catch (error: unknown) {
    // Log details server-side, return a clean message.
    console.error('[admin/delete-user]', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Failed to delete user' }, { status: 500 });
  }
}
