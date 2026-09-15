import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/app/lib/mongodb';
import MediaComment from '@/app/lib/models/MediaComment';
import { getSessionUser } from '@/app/lib/session';
import { rateLimit } from '@/app/lib/rate-limit';

// POST /api/murastream/comments/like { id } — toggle a like on a comment.
// Signed-in users only (likes are keyed by email server-side; anonymous
// like-spam from one IP would otherwise be unbounded).

export async function POST(req: Request) {
  try {
    await dbConnect();
    const viewer = await getSessionUser(req);
    if (!viewer) {
      return NextResponse.json({ success: false, error: 'Sign in to like comments' }, { status: 401 });
    }
    const rl = rateLimit(`like:${viewer.email}`, 30, 60_000);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many actions — slow down' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '');
    if (!id || !mongoose.isValidObjectId(id)) {
      return NextResponse.json({ success: false, error: 'Invalid comment' }, { status: 400 });
    }

    const doc = await MediaComment.findById(id);
    if (!doc) return NextResponse.json({ success: false, error: 'Comment not found' }, { status: 404 });

    const idx = doc.likes.indexOf(viewer.email);
    if (idx >= 0) doc.likes.splice(idx, 1);
    else doc.likes.push(viewer.email);
    await doc.save();

    return NextResponse.json({
      success: true,
      likes: doc.likes.length,
      likedByMe: idx < 0,
    });
  } catch (error: unknown) {
    console.error('[comments/like]', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Failed to toggle like' }, { status: 500 });
  }
}
