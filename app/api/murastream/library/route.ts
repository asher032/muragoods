import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import UserLibrary from '@/app/lib/models/UserLibrary';
import UserPreference from '@/app/lib/models/UserPreference';
import { getIdentityWithId, ownerFilter, ownerStamp } from '@/app/lib/identity';

// Murastream library — the SAME canonical Muragoods account, not a separate
// Murastream account. Identity ALWAYS comes from the signed session cookie;
// the old ?email= parameter trusted whoever typed it (IDOR: any visitor could
// read or overwrite anyone's watchlist). Unauthenticated devices keep working
// fully offline via localStorage; nothing syncs until sign-in.
type Media = {
  id: number; mediaType?: string; title?: string; posterPath?: string | null;
  backdropPath?: string | null; voteAverage?: number; year?: string; overview?: string;
};

function normType(mediaType?: string): 'movie' | 'anime' | 'series' {
  const t = String(mediaType || '').toLowerCase();
  if (t === 'anime') return 'anime';
  if (t === 'movie') return 'movie';
  return 'series'; // tv and everything else read as series
}

function snapOf(m: Media) {
  return {
    title: String(m.title || '').slice(0, 120),
    image: String(m.posterPath || m.backdropPath || '').slice(0, 500),
    subtitle: String(m.year || '').slice(0, 40),
  };
}

// Mirror likes/watchlist into the unified preferences table so favorites
// stay cross-platform (site, dashboard, Discord). Idempotent upserts.
async function mirrorPreferences(user: { userId: string; emailLc: string; discordUserId: string }, likes: Media[], myList: Media[]) {
  const stamp = ownerStamp(user);
  const ops: Array<Promise<unknown>> = [];
  for (const m of likes || []) {
    if (typeof m?.id !== 'number') continue;
    ops.push(UserPreference.updateOne(
      { userEmail: user.emailLc, contentType: normType(m.mediaType), contentId: String(m.id), action: 'like' },
      { $setOnInsert: { ...stamp, discordId: user.discordUserId, snapshot: snapOf(m), createdAt: new Date() } },
      { upsert: true },
    ));
  }
  for (const m of myList || []) {
    if (typeof m?.id !== 'number') continue;
    ops.push(UserPreference.updateOne(
      { userEmail: user.emailLc, contentType: normType(m.mediaType), contentId: String(m.id), action: 'save' },
      { $setOnInsert: { ...stamp, discordId: user.discordUserId, snapshot: snapOf(m), createdAt: new Date() } },
      { upsert: true },
    ));
  }
  // Bound the fan-out: likes+list are capped client-side well below this.
  await Promise.all(ops.slice(0, 400));
}

// GET /api/murastream/library — own library (session).
export async function GET(request: NextRequest) {
  try {
    const identity = await getIdentityWithId(request);
    if (!identity) return NextResponse.json({ likes: [], myList: [], history: [], episodeProgress: [], settings: {} });
    await dbConnect();
    const library = await UserLibrary.findOne(ownerFilter(identity, 'email')).lean<Record<string, unknown>>();
    if (!library) {
      return NextResponse.json({ likes: [], myList: [], history: [], episodeProgress: [], settings: {} });
    }
    const progress = (library.episodeProgress || library.animeProgress || []) as unknown[];
    return NextResponse.json({
      likes: library.likes || [],
      myList: library.myList || [],
      history: library.history || [],
      episodeProgress: progress,
      settings: library.settings || {},
    });
  } catch (error) {
    console.error('[Library GET]', error);
    return NextResponse.json({ error: 'Failed to load library' }, { status: 500 });
  }
}

// POST /api/murastream/library — save/merge own library (session).
export async function POST(request: NextRequest) {
  try {
    const viewer = await getIdentityWithId(request);
    if (!viewer) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    await dbConnect();
    const body = await request.json();
    const { likes, myList, history, episodeProgress, settings } = body;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (likes !== undefined) update.likes = Array.isArray(likes) ? likes.slice(0, 500) : [];
    if (myList !== undefined) update.myList = Array.isArray(myList) ? myList.slice(0, 500) : [];
    if (history !== undefined) update.history = Array.isArray(history) ? history.slice(0, 100) : [];
    if (episodeProgress !== undefined) update.episodeProgress = Array.isArray(episodeProgress) ? episodeProgress.slice(0, 50) : [];
    if (settings !== undefined && typeof settings === 'object') update.settings = settings;

    const library = await UserLibrary.findOneAndUpdate(
      { email: viewer.emailLc },
      { $set: { ...update, ...ownerStamp(viewer) } },
      { upsert: true, new: true },
    ).lean();
    await mirrorPreferences(viewer, (update.likes || []) as Media[], (update.myList || []) as Media[]);

    return NextResponse.json({ success: true, updatedAt: library.updatedAt });
  } catch (error) {
    console.error('[Library POST]', error);
    return NextResponse.json({ error: 'Failed to save library' }, { status: 500 });
  }
}

// DELETE /api/murastream/library — clear own library (session).
export async function DELETE(request: NextRequest) {
  try {
    const viewer = await getIdentityWithId(request);
    if (!viewer) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    await dbConnect();
    await UserLibrary.findOneAndUpdate(
      { email: viewer.emailLc },
      { $set: { likes: [], myList: [], history: [], episodeProgress: [], updatedAt: new Date() } }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Library DELETE]', error);
    return NextResponse.json({ error: 'Failed to clear library' }, { status: 500 });
  }
}
