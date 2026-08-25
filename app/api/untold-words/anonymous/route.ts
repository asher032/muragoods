import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import AnonymousLetter from '@/app/lib/models/AnonymousLetter';

function generateId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();

    // Basic spam protection: max 5 anonymous letters per IP per hour
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const recentCount = await AnonymousLetter.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });
    if (recentCount > 200) {
      return NextResponse.json({ success: false, error: 'Too many letters right now. Please try again later.' }, { status: 429 });
    }

    let shortId = generateId();
    let attempts = 0;
    while (attempts < 10) {
      const exists = await AnonymousLetter.findOne({ shortId });
      if (!exists) break;
      shortId = generateId();
      attempts++;
    }

    const validCategories = ['Confession', 'Appreciation', 'Missing Someone', 'Friendship', 'Crush', 'Moving On', 'Random Thoughts'];
    const category = validCategories.includes(body.category) ? body.category : 'Random Thoughts';
    const visibility = body.visibility === 'private' ? 'private' : 'public';

    const letter = await AnonymousLetter.create({
      shortId,
      title: body.title?.trim().slice(0, 100) || 'Untitled',
      content: body.content?.trim().slice(0, 2000) || '',
      category,
      visibility,
      createdBy: body.createdBy || '',
      // Optional song
      songTitle: body.songTitle || undefined,
      artist: body.artist || undefined,
      artwork: body.artwork || undefined,
      previewUrl: body.previewUrl || undefined,
      deezerUrl: body.deezerUrl || undefined,
    });

    return NextResponse.json({ success: true, data: letter }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create letter';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const shortId = searchParams.get('id');
    const category = searchParams.get('category');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Single letter
    if (shortId) {
      const letter = await AnonymousLetter.findOne({ shortId, removed: false });
      if (!letter) {
        return NextResponse.json({ success: false, error: 'Letter not found' }, { status: 404 });
      }
      letter.views += 1;
      await letter.save();
      return NextResponse.json({ success: true, data: letter });
    }

    // List/search
    const query: Record<string, unknown> = { removed: false, visibility: 'public' };
    if (category && category !== 'All') query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await AnonymousLetter.countDocuments(query);
    const letters = await AnonymousLetter.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-likedBy');

    return NextResponse.json({ success: true, data: letters, total, page, pages: Math.ceil(total / limit) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    if (!body.shortId) return NextResponse.json({ success: false, error: 'shortId required' }, { status: 400 });
    const letter = await AnonymousLetter.findOneAndUpdate({ shortId: body.shortId }, { removed: true }, { new: true });
    if (!letter) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const shortId = searchParams.get('id');
    const body = await req.json();

    if (!shortId) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const letter = await AnonymousLetter.findOne({ shortId });
    if (!letter) {
      return NextResponse.json({ success: false, error: 'Letter not found' }, { status: 404 });
    }

    // Like/unlike
    if (body.action === 'like') {
      const ip = req.headers.get('x-forwarded-for') || 'unknown';
      if (!letter.likedBy.includes(ip)) {
        letter.likes += 1;
        letter.likedBy.push(ip);
      } else {
        letter.likes = Math.max(0, letter.likes - 1);
        letter.likedBy = letter.likedBy.filter((i: string) => i !== ip);
      }
      await letter.save();
      return NextResponse.json({ success: true, data: { likes: letter.likes, liked: letter.likedBy.includes(ip) } });
    }

    // Report
    if (body.action === 'report') {
      letter.reportCount += 1;
      if (letter.reportCount >= 3) letter.reported = true;
      await letter.save();
      return NextResponse.json({ success: true, message: 'Reported. Thank you for helping keep our community safe.' });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
