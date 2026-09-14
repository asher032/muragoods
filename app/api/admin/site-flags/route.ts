import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import SiteFlag from '@/app/lib/models/SiteFlag';

// Site flags API — the admin-only content lock.
//  GET   /api/admin/site-flags                  → { contentLocked, lockedAt, ... }
//  PATCH /api/admin/site-flags { contentLocked } → flips the lock (admin only)

export async function GET() {
  try {
    await dbConnect();
    const doc = await SiteFlag.findById('site').lean().catch(() => null);
    return NextResponse.json({
      success: true,
      data: {
        contentLocked: doc?.contentLocked ?? false,
        lockedAt: doc?.lockedAt ?? null,
        lockedMessage: doc?.lockedMessage ?? '',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load flags';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));
    const requester: string = typeof body.email === 'string' ? body.email.toLowerCase() : '';
    const admins: string[] = (process.env.ADMIN_EMAILS || 'mhaxthedog@gmail.com,muragoods0@gmail.com')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (!requester || !admins.includes(requester)) {
      return NextResponse.json({ success: false, error: 'Admins only' }, { status: 403 });
    }

    const contentLocked = !!body.contentLocked;
    const lockedMessage: string = typeof body.lockedMessage === 'string'
      ? body.lockedMessage.slice(0, 200)
      : '';
    await SiteFlag.findByIdAndUpdate(
      'site',
      { $set: { contentLocked, lockedAt: contentLocked ? new Date() : null, lockedMessage } },
      { upsert: true, new: true },
    );
    return NextResponse.json({ success: true, data: { contentLocked, lockedMessage } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update flags';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
