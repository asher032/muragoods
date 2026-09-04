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

    let library = await UserLibrary.findOne({ email: email.toLowerCase() }).lean();
    if (!library) {
      library = { email: email.toLowerCase(), likes: [], myList: [], history: [], animeProgress: [], settings: {} };
    }

    return NextResponse.json({
      likes: library.likes || [],
      myList: library.myList || [],
      history: library.history || [],
      animeProgress: library.animeProgress || [],
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
    const { email, likes, myList, history, animeProgress, settings } = body;

    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (likes !== undefined) update.likes = likes;
    if (myList !== undefined) update.myList = myList;
    if (history !== undefined) update.history = history;
    if (animeProgress !== undefined) update.animeProgress = animeProgress;
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
      { $set: { likes: [], myList: [], history: [], animeProgress: [], updatedAt: new Date() } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Library DELETE]', error);
    return NextResponse.json({ error: 'Failed to clear library' }, { status: 500 });
  }
}
