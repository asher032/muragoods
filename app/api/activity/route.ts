import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import UserActivity from '@/app/lib/models/UserActivity';
import { gameIdentity } from '@/app/lib/gameserver';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/activity — own recent timeline (private by default, owner sees all).
export async function GET(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit')) || 30));
    const rows = await UserActivity.find({ userEmail: id.emailLc })
      .sort({ createdAt: -1 }).limit(limit).lean();
    return NextResponse.json({ success: true, activity: rows });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load activity' }, { status: 500 });
  }
}
