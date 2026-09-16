import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/app/lib/mongodb';
import MediaComment from '@/app/lib/models/MediaComment';
import { rateLimit, clientIp } from '@/app/lib/rate-limit';

// POST /api/murastream/comments/report { id } — flag a comment for admin
// review. Any viewer can report; per-IP rate limiting stops mass-flagging.

export async function POST(req: Request) {
  try {
    await dbConnect();
    const rl = rateLimit(`report:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ success: false, error: 'Too many reports — slow down' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '');
    if (!id || !mongoose.isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: 'Invalid comment' }, { status: 400 });
    }

    const doc = await MediaComment.findByIdAndUpdate(id, { reported: true });
    if (!doc) return NextResponse.json({ success: false, error: 'Comment not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to report';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
