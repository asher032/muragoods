import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import LoveLetter from '@/app/lib/models/LoveLetter';

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

    let attempts = 0;
    while (attempts < 10) {
      const exists = await LoveLetter.findOne({ shortId });
      if (!exists) break;
      shortId = generateId();
      attempts++;
    }

    // A signed-in author is stamped server-side (ownership for later
    // delete); guests stay anonymous. The client cannot claim another
    // account's email.
    try {
      const { getSessionUser } = await import('@/app/lib/session');
      const author = await getSessionUser(req);
      if (author) body.createdBy = author.email;
    } catch { /* continue as guest */ }

    const letter = await LoveLetter.create({ ...body, shortId });
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

    if (!shortId) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const letter = await LoveLetter.findOne({ shortId });
    if (!letter) {
      return NextResponse.json({ success: false, error: 'Letter not found' }, { status: 404 });
    }

    letter.views += 1;
    await letter.save();

    return NextResponse.json({ success: true, data: letter });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const shortId = searchParams.get('id');
    if (!shortId) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }
    const letter = await LoveLetter.findOne({ shortId }).select('createdBy').lean() as {
      createdBy?: string;
    } | null;
    if (!letter) {
      return NextResponse.json({ success: false, error: 'Letter not found' }, { status: 404 });
    }
    // Only the author (or an admin) may delete. Anonymous letters
    // (createdBy '') have no owner and cannot be deleted this way.
    const { getSessionUser } = await import('@/app/lib/session');
    const { requireAdmin } = await import('@/app/lib/session');
    const viewer = await getSessionUser(req);
    const { user: admin } = await requireAdmin(req);
    const own = Boolean(
      viewer && letter.createdBy && letter.createdBy === viewer.email,
    );
    if (!own && !admin) {
      return NextResponse.json(
        { success: false, error: letter.createdBy ? 'You can only delete your own letters' : 'Sign in required' },
        { status: viewer ? 403 : 401 },
      );
    }
    await LoveLetter.findOneAndDelete({ shortId });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
