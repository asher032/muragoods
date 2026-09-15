import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/app/lib/mongodb';
import MediaComment from '@/app/lib/models/MediaComment';
import { getSessionUser } from '@/app/lib/session';
import { rateLimit, clientIp } from '@/app/lib/rate-limit';

// MuraStream comments API — session-authenticated where signed in, with
// server-side ownership for every mutation. Anonymous posting stays allowed
// (the Screening Room is open to guests), but guests cannot edit/delete.
//
//  GET    /api/murastream/comments?type=movie&id=27205 → { comments: [...] }
//  POST   /api/murastream/comments { mediaType, tmdbId, text, name?, parentId? }
//  PATCH  /api/murastream/comments { id, text }        → edit own comment
//  DELETE /api/murastream/comments?id=...              → delete own comment
//  POST   /api/murastream/comments/like { id }         → toggle like

const MAX_TEXT = 500;
const MAX_PER_FETCH = 200;
const RATE_LIMIT = 8; // posts+edits per 60s per identity
const RATE_WINDOW_MS = 60_000;

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);

    // "mine=1" — the signed-in user's own comments across all titles
    // (My Space dashboard). Identity is session-derived.
    if (searchParams.get('mine') === '1') {
      const viewer = await getSessionUser(req);
      if (!viewer) {
        return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
      }
      const docs = await MediaComment.find({ email: viewer.email })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      return NextResponse.json({
        success: true,
        comments: (docs || []).map((d) => ({
          id: String(d._id),
          mediaType: d.mediaType,
          tmdbId: d.tmdbId,
          name: d.name,
          text: d.text,
          at: d.at ?? d.createdAt,
          likes: d.likes?.length || 0,
          likedByMe: false,
          emailHash: hashEmail(d.email),
          self: true,
        })),
      });
    }

    const mediaType = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
    const tmdbId = Number(searchParams.get('id'));
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      return NextResponse.json({ success: false, error: 'A valid id is required' }, { status: 400 });
    }
    const viewer = await getSessionUser(req);
    const docs = await MediaComment.find({ mediaType, tmdbId })
      .sort({ createdAt: 1 })
      .limit(MAX_PER_FETCH)
      .lean();
    return NextResponse.json({
      success: true,
      comments: (docs || []).map((d) => ({
        id: String(d._id),
        parentId: d.parentId ? String(d.parentId) : null,
        name: d.name,
        text: d.text,
        at: d.at ?? d.createdAt,
        likes: d.likes?.length || 0,
        likedByMe: viewer ? (d.likes || []).includes(viewer.email) : false,
        emailHash: hashEmail(d.email),
        self: !!viewer && d.email === viewer.email,
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
    if (!text) return NextResponse.json({ success: false, error: 'Write something first' }, { status: 400 });
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid title' }, { status: 400 });
    }
    // Reject control characters / obvious injection payloads — content is
    // rendered as plain text by React, but we keep the stored data clean.
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text) || /<\s*(script|iframe|object|embed)/i.test(text)) {
      return NextResponse.json({ success: false, error: 'That content is not allowed' }, { status: 400 });
    }

    const viewer = await getSessionUser(req);
    const email: string = viewer?.email || '';

    const rlKey = email ? `comment:user:${email}` : `comment:ip:${clientIp(req)}`;
    const rl = rateLimit(rlKey, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: `Easy there — try again in ${rl.retryAfterSec}s` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    // Replies: parent must exist and belong to the same title.
    let parentId: mongoose.Types.ObjectId | null = null;
    if (body.parentId) {
      if (!mongoose.isValidObjectId(String(body.parentId))) {
        return NextResponse.json({ success: false, error: 'Invalid parent comment' }, { status: 400 });
      }
      const parent = await MediaComment.findById(String(body.parentId)).lean();
      if (!parent || parent.mediaType !== mediaType || parent.tmdbId !== tmdbId) {
        return NextResponse.json({ success: false, error: 'Parent comment not found' }, { status: 404 });
      }
      parentId = new mongoose.Types.ObjectId(String(body.parentId));
    }

    // Name: signed-in users own their display name; guests get a stable label.
    let name = typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
    if (!viewer && (!name || /^guest/i.test(name))) name = guestName();
    if (!viewer) name = name || guestName();
    if (viewer && !name) name = viewer.name || guestName();

    const doc = await MediaComment.create({
      mediaType, tmdbId, email, name, text, at: new Date(),
      parentId,
      likes: [],
    });
    return NextResponse.json({
      success: true,
      comment: commentView(doc, viewer?.email || null, true),
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to post comment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));
    const viewer = await getSessionUser(req);
    if (!viewer) return NextResponse.json({ success: false, error: 'Sign in to edit your comments' }, { status: 401 });

    const rl = rateLimit(`comment:user:${viewer.email}`, RATE_LIMIT, RATE_WINDOW_MS);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many updates — slow down' }, { status: 429 });

    const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
    if (!text) return NextResponse.json({ success: false, error: 'Comment cannot be empty' }, { status: 400 });

    // Ownership is enforced HERE, server-side, from the session.
    const updated = await MediaComment.findOneAndUpdate(
      { _id: String(body.id || ''), email: viewer.email },
      { $set: { text, editedAt: new Date() } },
      { new: true },
    );
    if (!updated) return NextResponse.json({ success: false, error: 'Comment not found (or not yours)' }, { status: 404 });
    return NextResponse.json({ success: true, comment: commentView(updated, viewer.email, true) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to edit comment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const viewer = await getSessionUser(req);
    if (!viewer) return NextResponse.json({ success: false, error: 'Sign in to delete your comments' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '';
    // Only the owner can delete; replies cascade with their parent thread.
    const owned = await MediaComment.findOne({ _id: id, email: viewer.email }).lean();
    if (!owned) {
      return NextResponse.json({ success: false, error: 'Comment not found (or not yours)' }, { status: 404 });
    }
    await MediaComment.deleteMany({ $or: [{ _id: id }, { parentId: id }] });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete comment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ─── Likes (separate subroute file handles routing) ───────────────────
function hashEmail(email: string): string {
  if (!email) return '';
  let h = 5381;
  for (let i = 0; i < email.length; i++) h = ((h << 5) + h + email.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function guestName(): string {
  return `Guest #${Math.floor(10 + Math.random() * 90)}`;
}

function commentView(d: { _id: unknown; parentId?: unknown; name: string; text: string; at?: Date; createdAt?: Date; likes?: string[] }, email: string | null, self: boolean) {
  return {
    id: String(d._id),
    parentId: d.parentId ? String(d.parentId) : null,
    name: d.name,
    text: d.text,
    at: d.at ?? d.createdAt,
    likes: d.likes?.length || 0,
    likedByMe: !!email && (d.likes || []).includes(email),
    self,
  };
}
