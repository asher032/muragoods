import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import SongMessage from '@/app/lib/models/SongMessage';

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
    let shortId = generateId();

    // Ensure unique
    let attempts = 0;
    while (attempts < 10) {
      const exists = await SongMessage.findOne({ shortId });
      if (!exists) break;
      shortId = generateId();
      attempts++;
    }

    try {
      const { getSessionUser } = await import('@/app/lib/session');
      const author = await getSessionUser(req);
      if (author) body.createdBy = author.email.toLowerCase();
    } catch { /* continue as guest */ }

    const song = await SongMessage.create({ ...body, shortId });
    return NextResponse.json({ success: true, data: song }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create song message';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const shortId = searchParams.get('id');

    if (!shortId) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const song = await SongMessage.findOne({ shortId });
    if (!song) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 });
    }

    // Increment views
    song.views += 1;
    await song.save();

    return NextResponse.json({ success: true, data: song });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    await dbConnect();
    // Support both searchParams and JSON body
    let shortId: string | null = null;
    try {
      const { searchParams } = new URL(req.url);
      shortId = searchParams.get('id');
      if (!shortId) {
        const body = await req.json();
        shortId = body.shortId || body.id || null;
      }
    } catch { /* empty */ }
    if (!shortId) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }
    const song = await SongMessage.findOne({ shortId }).select('createdBy').lean() as {
      createdBy?: string;
    } | null;
    if (!song) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 });
    }
    const { getSessionUser } = await import('@/app/lib/session');
    const { requireAdmin } = await import('@/app/lib/session');
    const viewer = await getSessionUser(req);
    const { user: admin } = await requireAdmin(req);
    const own = Boolean(
      viewer && song.createdBy && song.createdBy.toLowerCase() === viewer.email.toLowerCase(),
    );
    if (!own && !admin) {
      return NextResponse.json(
        { success: false, error: song.createdBy ? 'You can only delete your own messages' : 'Sign in required' },
        { status: viewer ? 403 : 401 },
      );
    }
    await SongMessage.findOneAndDelete({ shortId });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
