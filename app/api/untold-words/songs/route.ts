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
    const { searchParams } = new URL(req.url);
    const shortId = searchParams.get('id');
    if (!shortId) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }
    await SongMessage.findOneAndDelete({ shortId });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
