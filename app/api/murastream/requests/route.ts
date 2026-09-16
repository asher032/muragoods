import { NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/app/lib/mongodb';
import MediaRequest from '@/app/lib/models/MediaRequest';
import { getSessionUser, requireAdmin } from '@/app/lib/session';
import { rateLimit, clientIp } from '@/app/lib/rate-limit';

// Media requests API.
//  GET    /api/murastream/requests?q=&status=&sort= → public list
//  POST   /api/murastream/requests { title, type, year?, notes? }
//         → creates OR (on dedup match) supports the existing request
//  DELETE /api/murastream/requests?id=... → admin only (delete spam)
//  PATCH  /api/murastream/requests → admin only (status / merge helpers)
//
// Duplicates collapse: "Interstellar" and "Interstellar 2014" share a
// dedup key, so the second submitter becomes a supporter instead.

const MAX_TITLE = 120;
const MAX_NOTES = 500;

function dedupKeyFor(title: string, type: string): string {
  const norm = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
  return `${type}:${norm}`;
}

/** Stable per-viewer identity for supporters: email when signed in, else IP hash. */
function supporterId(email: string, ip: string): string {
  return email || `ip:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`;
}

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().slice(0, 80);
    const status = searchParams.get('status') || '';
    const sort = searchParams.get('sort') || 'popular';

    const filter: Record<string, unknown> = {};
    if (q) filter.title = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (['Requested', 'Under Review', 'In Progress', 'Added', 'Unavailable', 'Rejected'].includes(status)) {
      filter.status = status;
    }

    const viewer = await getSessionUser(req);
    const mySupporter = viewer?.email || supporterId('', clientIp(req));

    let query = MediaRequest.find(filter);
    if (sort === 'new') query = query.sort({ createdAt: -1 });
    else query = query.sort({ supporters: -1, createdAt: -1 }); // popular = most supporters first
    const docs = await query.limit(100).lean<{
      _id: unknown; title: string; type: string; year?: string; notes?: string;
      supporters: string[]; status: string; requestedByName?: string;
      tmdbId?: number | null; tmdbType?: string | null; adminNote?: string; createdAt: Date;
    }[]>([]);

    return NextResponse.json({
      success: true,
      requests: (docs || []).map(d => ({
        id: String(d._id),
        title: d.title,
        type: d.type,
        year: d.year || '',
        notes: d.notes || '',
        supporters: d.supporters?.length || 0,
        supportedByMe: (d.supporters || []).includes(mySupporter),
        status: d.status,
        requestedBy: d.requestedByName || 'A viewer',
        tmdbId: d.tmdbId ?? null,
        tmdbType: d.tmdbType ?? null,
        adminNote: d.adminNote || '',
        at: d.createdAt,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load requests';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const rl = rateLimit(`request:${clientIp(req)}`, 5, 10 * 60_000);
    if (!rl.ok) {
      return NextResponse.json({ success: false, error: 'Too many requests — try again later' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body.title || '').trim().slice(0, MAX_TITLE);
    const type = ['movie', 'tv', 'anime'].includes(body.type) ? body.type : '';
    if (!title || title.length < 2) {
      return NextResponse.json({ success: false, error: 'Enter the title you want' }, { status: 400 });
    }
    if (!type) {
      return NextResponse.json({ success: false, error: 'Pick a type — Movie, TV Series, or Anime' }, { status: 400 });
    }
    const year = /^\d{4}$/.test(String(body.year || '')) ? String(body.year) : '';
    const notes = String(body.notes || '').trim().slice(0, MAX_NOTES);

    const viewer = await getSessionUser(req);
    const email = viewer?.email || '';
    const name = viewer?.name || 'A viewer';
    const ip = clientIp(req);
    const sid = supporterId(email, ip);
    const dedupKey = dedupKeyFor(title, type);

    // Duplicate detection: exact dedup-key match first, then a relaxed
    // alphanumeric-prefix match so "Interstellar 2014" finds "Interstellar".
    let existing = await MediaRequest.findOne({ dedupKey });
    if (!existing) {
      const norm = dedupKey.split(':')[1];
      existing = await MediaRequest.findOne({
        type,
        dedupKey: new RegExp(`^${type}:${norm.slice(0, Math.max(6, norm.length - 4))}`),
      });
    }
    if (existing) {
      if (!(existing.supporters || []).includes(sid)) {
        await MediaRequest.updateOne({ _id: existing._id }, { $addToSet: { supporters: sid } });
      }
      const count = ((existing.supporters || []).length) + ((existing.supporters || []).includes(sid) ? 0 : 1);
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: `“${existing.title}” already has a request — you've been added as a supporter.`,
        data: {
          id: String(existing._id),
          title: existing.title,
          supporters: count,
          status: existing.status,
        },
      });
    }

    const created = await MediaRequest.create({
      title,
      type,
      year,
      notes,
      dedupKey,
      requestedBy: email,
      requestedByName: name,
      supporters: [sid],
    });
    return NextResponse.json({
      success: true,
      duplicate: false,
      message: 'Your request has been submitted.',
      data: { id: String(created._id), title: created.title, supporters: 1, status: created.status },
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to submit request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Support (vote) an existing request without creating a new one.
export async function PUT(req: Request) {
  try {
    await dbConnect();
    const rl = rateLimit(`support:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ success: false, error: 'Too many actions — slow down' }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '');
    if (!/^[a-f\d]{24}$/i.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
    }
    const viewer = await getSessionUser(req);
    const sid = supporterId(viewer?.email || '', clientIp(req));
    const updated = await MediaRequest.findByIdAndUpdate(
      id,
      { $addToSet: { supporters: sid } },
      { new: true },
    );
    if (!updated) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    return NextResponse.json({ success: true, supporters: updated.supporters.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to support';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Admin: change status, link TMDB entry, or delete spam.
export async function PATCH(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (auth.response) return auth.response;
    await dbConnect();

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '');
    if (!/^[a-f\d]{24}$/i.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (['Requested', 'Under Review', 'In Progress', 'Added', 'Unavailable', 'Rejected'].includes(body.status)) {
      update.status = body.status;
    }
    if (body.tmdbId !== undefined) {
      const tmdbId = Number(body.tmdbId);
      update.tmdbId = Number.isInteger(tmdbId) && tmdbId > 0 ? tmdbId : null;
    }
    if (body.tmdbType !== undefined && ['movie', 'tv'].includes(body.tmdbType)) {
      update.tmdbType = body.tmdbType;
    }
    if (typeof body.adminNote === 'string') update.adminNote = body.adminNote.slice(0, 300);

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }
    const updated = await MediaRequest.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: { id: String(updated._id), status: updated.status } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAdmin(req);
    if (auth.response) return auth.response;
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') || '';
    if (!/^[a-f\d]{24}$/i.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
    }
    await MediaRequest.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete request';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
