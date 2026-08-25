import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import AnonymousConfession from '@/app/lib/models/AnonymousConfession';

function generateShortId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export async function GET(req: NextRequest) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '15');
  const category = searchParams.get('category');
  const search = searchParams.get('search');
  const all = searchParams.get('all');

  if (id) {
    const doc = await AnonymousConfession.findOne({ shortId: id, removed: false });
    if (!doc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    await AnonymousConfession.updateOne({ shortId: id }, { $inc: { views: 1 } });
    doc.views += 1;
    return NextResponse.json({ success: true, data: doc });
  }

  const filter: Record<string, unknown> = { removed: false, visibility: 'public' };
  if (all !== 'true') {
    // Only show public
  }
  if (category && category !== 'All') filter.category = category;
  if (search) filter.$or = [{ title: { $regex: search, $options: 'i' } }, { content: { $regex: search, $options: 'i' } }];

  const total = await AnonymousConfession.countDocuments(filter);
  const data = await AnonymousConfession.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
  return NextResponse.json({ success: true, data, total, pages: Math.ceil(total / limit), page });
}

export async function POST(req: NextRequest) {
  await dbConnect();
  const body = await req.json();
  const { title, content, category, visibility } = body;
  if (!title || !content) return NextResponse.json({ success: false, error: 'Title and content required' }, { status: 400 });

  let shortId = generateShortId();
  while (await AnonymousConfession.findOne({ shortId })) shortId = generateShortId();

  const doc = await AnonymousConfession.create({ shortId, title, content, category, visibility: visibility || 'public' });
  return NextResponse.json({ success: true, data: doc });
}

export async function PATCH(req: NextRequest) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const body = await req.json();
  if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });

  const doc = await AnonymousConfession.findOne({ shortId: id });
  if (!doc) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

  if (body.action === 'like') {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!doc.likedBy?.includes(ip)) {
      doc.likes += 1;
      doc.likedBy = [...(doc.likedBy || []), ip];
    } else {
      doc.likes = Math.max(0, doc.likes - 1);
      doc.likedBy = doc.likedBy.filter((x: string) => x !== ip);
    }
    await doc.save();
    return NextResponse.json({ success: true, data: { likes: doc.likes, liked: doc.likedBy.includes(ip) } });
  }

  if (body.action === 'report') {
    doc.reportCount += 1;
    if (doc.reportCount >= 3) doc.reported = true;
    await doc.save();
    return NextResponse.json({ success: true, data: { reported: true } });
  }

  return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  await dbConnect();
  // Support both searchParams and JSON body
  let id: string | null = null;
  try {
    const { searchParams } = new URL(req.url);
    id = searchParams.get('id');
    if (!id) {
      const body = await req.json();
      id = body.shortId || body.id || null;
    }
  } catch { /* empty */ }
  if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
  await AnonymousConfession.updateOne({ shortId: id }, { removed: true });
  return NextResponse.json({ success: true });
}
