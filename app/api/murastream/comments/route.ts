import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import MediaComment from '@/app/lib/models/MediaComment';

// MuraStream comments API.
//  GET  /api/murastream/comments?type=movie&id=27205  → { comments: [...] }
//  POST /api/murastream/comments { mediaType, tmdbId, name?, text } → adds one
//
// Anonymous-friendly: name falls back to a stable "Guest #xx" derived from
// the email (or a random suffix), so threads stay readable without accounts.

const MAX_TEXT = 500;
const MAX_PER_FETCH = 200;
// Per-email posting rate limit: 5 comments per 60s across all titles.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const mediaType = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
    const tmdbId = Number(searchParams.get('id'));
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      return NextResponse.json({ success: false, error: 'A valid id is required' }, { status: 400 });
    }
    const docs = await MediaComment.find({ mediaType, tmdbId })
      .sort({ createdAt: 1 })
      .limit(MAX_PER_FETCH)
      .lean();
    return NextResponse.json({
      success: true,
      comments: (docs || []).map(d => ({
        id: String(d._id),
        name: d.name,
        text: d.text,
        at: d.at ?? d.createdAt,
        self: false, // client marks its own messages locally
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load comments';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));
    const mediaType = body.mediaType === 'tv' ? 'tv' : 'movie';
    const tmdbId = Number(body.tmdbId);
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
    if (!text) {
      return NextResponse.json({ success: false, error: 'Write something first' }, { status: 400 });
    }
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid title' }, { status: 400 });
    }

    const email: string = typeof body.email === 'string' ? body.email.slice(0, 200) : '';

    // Simple sliding-window rate limit (skip for anonymous posts — they are
    // already name-capped and text-capped; DB spam is bounded by the slice).
    if (email) {
      const since = new Date(Date.now() - RATE_WINDOW_MS);
      const recent = await MediaComment.countDocuments({ email, at: { $gte: since } });
      if (recent >= RATE_LIMIT) {
        return NextResponse.json(
          { success: false, error: 'Easy there — try again in a minute' },
          { status: 429 },
        );
      }
    }

    // Stable guest name: "Guest #NN" from the email hash, or a fixed label.
    let name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
    if (!name && email) {
      let h = 0;
      for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % 90 + 10;
      name = `Guest #${h}`;
    }
    if (!name) name = 'Guest';

    const doc = await MediaComment.create({ mediaType, tmdbId, email, name, text, at: new Date() });
    return NextResponse.json({
      success: true,
      comment: { id: String(doc._id), name: doc.name, text: doc.text, at: doc.at, self: true },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to post comment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
