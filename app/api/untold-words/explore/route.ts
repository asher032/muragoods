import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import SongMessage from '@/app/lib/models/SongMessage';
import LoveLetter from '@/app/lib/models/LoveLetter';

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'all';

    let letters: unknown[] = [];
    let songs: unknown[] = [];

    if (type === 'all' || type === 'letters') {
      letters = await LoveLetter.find({ visibility: 'link' }).sort({ createdAt: -1 }).limit(50).select('shortId recipientName senderName isAnonymous title theme content createdAt');
    }
    if (type === 'all' || type === 'songs') {
      songs = await SongMessage.find({ visibility: 'link' }).sort({ createdAt: -1 }).limit(50).select('shortId recipientName senderName isAnonymous songTitle artist message spotifyUrl createdAt');
    }

    return NextResponse.json({ success: true, letters, songs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
