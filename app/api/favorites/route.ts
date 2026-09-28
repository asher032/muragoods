import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import UserPreference, { PREFERENCE_TYPES, PREFERENCE_ACTIONS } from '@/app/lib/models/UserPreference';
import UserActivity from '@/app/lib/models/UserActivity';
import { gameIdentity, playerKey } from '@/app/lib/gameserver';
import User from '@/app/lib/models/User';
import { rateLimit } from '@/app/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Unified favorites/likes/saves across games, movies, anime, series,
// products and music. Identity always comes from the session cookie.

// GET /api/favorites?type=game&action=favorite — own rows.
// GET /api/favorites?user=<playerKey> — another user's PUBLIC favorites.
export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('user');
    let emailLc: string;
    if (key) {
      if (!/^[0-9a-f]{22}$/.test(key)) return NextResponse.json({ success: false, error: 'Unknown user' }, { status: 404 });
      const pub = await User.find({ 'privacy.favorites': 'public' }).select('email').lean() as Array<{ email: string }>;
      const match = pub.find((u) => playerKey(u.email.toLowerCase()) === key);
      if (!match) return NextResponse.json({ success: false, error: 'Unknown user' }, { status: 404 });
      emailLc = match.email.toLowerCase();
    } else {
      const id = await gameIdentity(req);
      if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
      emailLc = id.emailLc;
    }
    const q: Record<string, unknown> = { userEmail: emailLc };
    const type = searchParams.get('type');
    const action = searchParams.get('action');
    if (type) q.contentType = type;
    if (action) q.action = action;
    const rows = await UserPreference.find(q).sort({ createdAt: -1 }).limit(200).lean();
    const grouped: Record<string, typeof rows> = {};
    for (const r of rows) {
      const k = `${r.contentType}:${r.action}`;
      (grouped[k] ||= []).push(r);
    }
    return NextResponse.json({ success: true, rows, grouped });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load favorites' }, { status: 500 });
  }
}

// POST /api/favorites { contentType, contentId, action, snapshot?, remove? }
// Toggles by default; {remove:true} forces removal. Upsert = idempotent.
export async function POST(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const rl = rateLimit(`fav:${id.emailLc}`, 60, 60_000);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const contentType = String(body.contentType || '');
    const contentId = String(body.contentId || '').slice(0, 120);
    const action = String(body.action || 'favorite');
    if (!(PREFERENCE_TYPES as readonly string[]).includes(contentType)) {
      return NextResponse.json({ success: false, error: 'Bad contentType' }, { status: 400 });
    }
    if (!(PREFERENCE_ACTIONS as readonly string[]).includes(action)) {
      return NextResponse.json({ success: false, error: 'Bad action' }, { status: 400 });
    }
    if (!contentId) return NextResponse.json({ success: false, error: 'contentId required' }, { status: 400 });
    await dbConnect();
    const filter = { userEmail: id.emailLc, contentType, contentId, action };
    if (body.remove === true) {
      await UserPreference.deleteOne(filter);
      return NextResponse.json({ success: true, state: 'removed' });
    }
    const existing = await UserPreference.findOne(filter).select('_id').lean();
    if (existing) {
      await UserPreference.deleteOne(filter);
      return NextResponse.json({ success: true, state: 'removed' });
    }
    const snap = (body.snapshot || {}) as Record<string, unknown>;
    await UserPreference.create({
      ...filter, discordId: id.discordId,
      snapshot: {
        title: String(snap.title || contentId).slice(0, 120),
        image: String(snap.image || '').slice(0, 500),
        subtitle: String(snap.subtitle || '').slice(0, 120),
      },
    });
    await UserActivity.create({
      userEmail: id.emailLc, discordId: id.discordId, type: 'favorite',
      text: `${action}d ${contentType} ${String(snap.title || contentId).slice(0, 80)}`,
      ref: `${contentType}:${contentId}`, visibility: 'private',
    }).catch(() => undefined);
    return NextResponse.json({ success: true, state: 'added' });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not save favorite' }, { status: 500 });
  }
}

// POST /api/favorites/import { items: [{contentType, contentId, action, snapshot}] }
// One-shot migration of localStorage favorites into the account.
export async function PUT(req: Request) {
  try {
    const id = await gameIdentity(req);
    if (!id) return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    const rl = rateLimit(`favimp:${id.emailLc}`, 5, 60_000);
    if (!rl.ok) return NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429 });
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];
    await dbConnect();
    let added = 0;
    for (const it of items) {
      const contentType = String(it.contentType || '');
      const contentId = String(it.contentId || '').slice(0, 120);
      const action = String(it.action || 'favorite');
      if (!(PREFERENCE_TYPES as readonly string[]).includes(contentType)) continue;
      if (!(PREFERENCE_ACTIONS as readonly string[]).includes(action)) continue;
      if (!contentId) continue;
      const snap = (it.snapshot || {}) as Record<string, unknown>;
      const res = await UserPreference.updateOne(
        { userEmail: id.emailLc, contentType, contentId, action },
        {
          $setOnInsert: {
            discordId: id.discordId,
            snapshot: {
              title: String(snap.title || contentId).slice(0, 120),
              image: String(snap.image || '').slice(0, 500),
              subtitle: String(snap.subtitle || '').slice(0, 120),
            },
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
      if (res.upsertedCount) added += 1;
    }
    return NextResponse.json({ success: true, added });
  } catch {
    return NextResponse.json({ success: false, error: 'Import failed' }, { status: 500 });
  }
}
