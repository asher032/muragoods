import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import MusicFeedback from '@/app/lib/models/MusicFeedback';
import { requireSession } from '@/app/lib/require-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Player preferences (Like / Love this / Not for me).
// Auth: the session's own Discord token, re-verified against the guild here —
// the browser supplies a guild id, never an identity.

const KINDS = ['like', 'love', 'dislike'] as const;
type Kind = (typeof KINDS)[number];

const isKind = (v: unknown): v is Kind => KINDS.includes(v as Kind);

/** Stable per-track key. The URL wins because a title can be ambiguous. */
function trackKeyFrom(url: unknown, title: unknown): string {
  const u = String(url || '').trim();
  if (u) return u.slice(0, 500);
  return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
}

async function tallies(guildId: string, trackKey: string, userId: string) {
  const [rows, mine] = await Promise.all([
    MusicFeedback.aggregate([
      { $match: { guildId, trackKey } },
      { $group: { _id: '$feedback', n: { $sum: 1 } } },
    ]),
    MusicFeedback.findOne({ guildId, userId, trackKey }, { feedback: 1 }).lean(),
  ]);
  const counts: Record<Kind, number> = { like: 0, love: 0, dislike: 0 };
  for (const row of rows as Array<{ _id: string; n: number }>) {
    if (isKind(row._id)) counts[row._id] = row.n;
  }
  const stored = (mine as { feedback?: string } | null)?.feedback;
  return { mine: isKind(stored) ? stored : null, counts };
}

export async function GET(req: NextRequest) {
  const guildId = req.nextUrl.searchParams.get('guildId') || '';
  const trackKey = req.nextUrl.searchParams.get('trackKey') || '';
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  }
  if (!trackKey) {
    return NextResponse.json({ success: false, error: 'trackKey required' }, { status: 400 });
  }
  const guard = await requireSession(guildId);
  if (!guard.ok) {
    return NextResponse.json({ success: false, error: guard.error }, { status: guard.status });
  }
  try {
    await dbConnect();
    const result = await tallies(guildId, trackKey, guard.discordId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Could not read feedback: ${String(err).slice(0, 140)}` },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: {
    guildId?: string; url?: string; title?: string; uploader?: string;
    thumbnail?: string; feedback?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const guildId = String(body.guildId || '');
  if (!/^\d{5,25}$/.test(guildId)) {
    return NextResponse.json({ success: false, error: 'Valid guildId required' }, { status: 400 });
  }

  // `null` means withdraw the current choice.
  const wanted: Kind | null = body.feedback === null || body.feedback === undefined
    ? null
    : String(body.feedback) as Kind;
  if (wanted !== null && !isKind(wanted)) {
    return NextResponse.json(
      { success: false, error: `feedback must be one of ${KINDS.join(', ')} or null` },
      { status: 400 },
    );
  }

  const trackKey = trackKeyFrom(body.url, body.title);
  if (!trackKey) {
    return NextResponse.json({ success: false, error: 'A track url or title is required' }, { status: 400 });
  }

  const guard = await requireSession(guildId);
  if (!guard.ok) {
    return NextResponse.json({ success: false, error: guard.error }, { status: guard.status });
  }

  try {
    await dbConnect();
    const filter = { guildId, userId: guard.discordId, trackKey };
    if (wanted === null) {
      await MusicFeedback.deleteOne(filter);
    } else {
      await MusicFeedback.updateOne(filter, {
        $set: {
          feedback: wanted,
          title: String(body.title || '').slice(0, 300),
          uploader: String(body.uploader || '').slice(0, 200),
          thumbnail: String(body.thumbnail || '').slice(0, 500),
        },
      }, { upsert: true });
    }
    // Read back before reporting success — never a presumed write.
    const stored = await MusicFeedback.findOne(filter, { feedback: 1 }).lean();
    const saved = (stored as { feedback?: string } | null)?.feedback;
    const kind = isKind(saved) ? saved : null;
    if (kind !== wanted) {
      return NextResponse.json(
        { success: false, error: 'Feedback was not persisted' }, { status: 502 },
      );
    }
    const result = await tallies(guildId, trackKey, guard.discordId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `Could not save feedback: ${String(err).slice(0, 140)}` },
      { status: 502 },
    );
  }
}
