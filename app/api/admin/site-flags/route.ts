import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import SiteFlag from '@/app/lib/models/SiteFlag';
import { requireAdmin } from '@/app/lib/session';

// Site flags API — the admin-only content lock.
//  GET   /api/admin/site-flags                  → { contentLocked, lockedAt, ... }
//  PATCH /api/admin/site-flags { contentLocked } → flips the lock (admin session only)
//
// GET stays public: the gate on MuraStream/hub pages must be readable by
// every visitor (that's the point of a lock). PATCH mutates — admin session.

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
  } catch {
    console.error('[site-flags GET] failed');
    return NextResponse.json({ success: false, error: 'Failed to load flags' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (auth.response) return auth.response;

    await dbConnect();
    const body = await req.json().catch(() => ({}));
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
  } catch {
    console.error('[site-flags PATCH] failed');
    return NextResponse.json({ success: false, error: 'Failed to update flags' }, { status: 500 });
  }
}
