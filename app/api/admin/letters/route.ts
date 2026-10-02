import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import UnsentLetter from '@/app/lib/models/UnsentLetter';
import { requireStaff } from '@/app/lib/access-control';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// Letter moderation.
//
// Untold Words is a place people write to someone they cannot name, so the
// admin list deliberately does NOT include letter content. What moderation
// needs is the queue: who submitted, for whom, in which category, is it
// visible, how much engagement. Content is fetched per-letter, on request,
// and every read is recorded in the response so the operator knows they are
// looking at something private.
//
// Authors are still shown: deciding whether a submission breaks the rules
// requires knowing who wrote it. What is not shown is the text, until the
// moderator asks for one specific letter.
// ─────────────────────────────────────────────────────────────────────────

interface LetterRow {
  _id: string;
  authorName: string;
  recipientName: string;
  category: string;
  likes: number;
  bookmarks: number;
  approved: boolean;
  createdAt: string;
}

function summarize(doc: Record<string, unknown>): LetterRow {
  return {
    _id: String(doc._id),
    authorName: String(doc.authorName ?? '—'),
    recipientName: String(doc.recipientName ?? '—'),
    category: String(doc.category ?? 'Other'),
    likes: Number(doc.likes ?? 0),
    bookmarks: Number(doc.bookmarks ?? 0),
    approved: doc.approved !== false,
    createdAt: new Date(doc.createdAt as string | number | Date).toISOString(),
  };
}

export async function GET(req: Request) {
  const guard = await requireStaff(req, ['moderation']);
  if (!guard.ok) return guard.response;

  await dbConnect();
  const url = new URL(req.url);
  const revealId = url.searchParams.get('reveal');
  const status = url.searchParams.get('status'); // 'hidden' | 'visible' | all
  const filter: Record<string, unknown> = {};
  if (status === 'hidden') filter.approved = false;
  if (status === 'visible') filter.approved = true;

  // Per-letter reveal: the one place the text is returned.
  if (revealId && /^[a-f0-9]{24}$/i.test(revealId)) {
    const doc = await UnsentLetter.findById(revealId).lean();
    if (!doc) return NextResponse.json({ success: false, error: 'Letter not found' }, { status: 404 });
    return NextResponse.json({
      success: true,
      letter: {
        ...summarize(doc as Record<string, unknown>),
        content: String((doc as { content?: string }).content ?? ''),
      },
      notice: 'This is private content. It was read for moderation and is not cached client-side.',
    });
  }

  const docs = await UnsentLetter.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  const rows = docs.map((d) => summarize(d as Record<string, unknown>));
  const [total, hidden] = await Promise.all([
    UnsentLetter.countDocuments({}),
    UnsentLetter.countDocuments({ approved: false }),
  ]);

  return NextResponse.json({
    success: true,
    counts: { total, hidden, visible: total - hidden },
    // Content is intentionally absent here.
    letters: rows,
    privacy: 'Letter text is not included in the list. Use reveal to read one specific submission.',
    readOnly: guard.access.level !== 'muragoods_owner',
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireStaff(req, ['moderation']);
  if (!guard.ok) return guard.response;

  let body: { id?: string; approved?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }
  const id = String(body.id || '');
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    return NextResponse.json({ success: false, error: 'A valid letter id is required' }, { status: 400 });
  }
  if (typeof body.approved !== 'boolean') {
    return NextResponse.json({ success: false, error: 'approved (boolean) is required' }, { status: 400 });
  }

  await dbConnect();
  const doc = await UnsentLetter.findByIdAndUpdate(
    id,
    { $set: { approved: body.approved } },
    { new: true },
  ).lean();
  if (!doc) return NextResponse.json({ success: false, error: 'Letter not found' }, { status: 404 });

  return NextResponse.json({
    success: true,
    saved: true,
    letter: summarize(doc as Record<string, unknown>),
    message: body.approved ? 'Letter is visible again.' : 'Letter hidden from the archive.',
    by: { userId: guard.access.userId, email: guard.access.email },
  });
}