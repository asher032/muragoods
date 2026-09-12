import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import UserLibrary from '@/app/lib/models/UserLibrary';

// GET /api/murastream/library?email=xxx — load library
export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    const email = request.nextUrl.searchParams.get('email');
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const library = await UserLibrary.findOne({ email: email.toLowerCase() }).lean<Record<string, unknown>>();
    if (!library) {
      return NextResponse.json({ likes: [], myList: [], history: [], episodeProgress: [], settings: {} });
    }

    // Accept both names when reading legacy docs: episodeProgress (new) or
    // animeProgress (old field written before the rename).
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

// POST /api/murastream/library — save/merge library
export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();
    const { email, likes, myList, history, episodeProgress, settings } = body;

    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (likes !== undefined) update.likes = likes;
    if (myList !== undefined) update.myList = myList;
    if (history !== undefined) update.history = history;
    if (episodeProgress !== undefined) update.episodeProgress = episodeProgress;
    if (settings !== undefined) update.settings = settings;

    const library = await UserLibrary.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: update },
      { upsert: true, new: true }
    ).lean();

    return NextResponse.json({ success: true, updatedAt: library.updatedAt });
  } catch (error) {
    console.error('[Library POST]', error);
    return NextResponse.json({ error: 'Failed to save library' }, { status: 500 });
  }
}

// DELETE /api/murastream/library?email=xxx — clear library
export async function DELETE(request: NextRequest) {
  try {
    await dbConnect();
    const email = request.nextUrl.searchParams.get('email');
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    await UserLibrary.findOneAndUpdate(
      { email: email.toLowerCase() },
      { $set: { likes: [], myList: [], history: [], episodeProgress: [], updatedAt: new Date() } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Library DELETE]', error);
    return NextResponse.json({ error: 'Failed to clear library' }, { status: 500 });
  }
}
