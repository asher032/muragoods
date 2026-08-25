import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import JarvisMemory from '@/app/lib/models/JarvisMemory';

// GET: List memories for a user (with optional search)
export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const search = searchParams.get('q');
    const category = searchParams.get('category');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 });
    }

    const query: Record<string, unknown> = { userId };
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { key: { $regex: search, $options: 'i' } },
        { value: { $regex: search, $options: 'i' } },
      ];
    }

    const memories = await JarvisMemory.find(query).sort({ updatedAt: -1 }).limit(100);
    return NextResponse.json({ success: true, data: memories });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST: Create or update a memory
export async function POST(req: Request) {
  try {
    await dbConnect();
    const { userId, key, value, category } = (await req.json()) as {
      userId: string; key: string; value: string; category?: string;
    };

    if (!userId || !key || !value) {
      return NextResponse.json({ success: false, error: 'userId, key, and value required' }, { status: 400 });
    }

    // Upsert: update if exists, create if not
    const memory = await JarvisMemory.findOneAndUpdate(
      { userId, key },
      { value, category: category || 'context', updatedAt: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, data: memory });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE: Delete a memory or clear all
export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const memoryId = searchParams.get('id');
    const clearAll = searchParams.get('clearAll') === 'true';

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 });
    }

    if (clearAll) {
      await JarvisMemory.deleteMany({ userId });
      return NextResponse.json({ success: true, message: 'All memories cleared' });
    }

    if (memoryId) {
      await JarvisMemory.findOneAndDelete({ _id: memoryId, userId });
      return NextResponse.json({ success: true, message: 'Memory deleted' });
    }

    return NextResponse.json({ success: false, error: 'memoryId or clearAll required' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
