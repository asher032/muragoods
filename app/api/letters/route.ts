import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Letter from '@/app/lib/models/Letter';

// POST — Send a new anonymous letter
export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { senderEmail, senderName, recipientEmail, recipientName, content, category } = body;

    if (!senderEmail || !recipientEmail || !content) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    if (senderEmail === recipientEmail) {
      return NextResponse.json({ success: false, error: 'You cannot send a letter to yourself' }, { status: 400 });
    }
    if (content.length > 2000) {
      return NextResponse.json({ success: false, error: 'Letter must be under 2000 characters' }, { status: 400 });
    }

    const letter = await Letter.create({
      senderEmail,
      senderName,
      recipientEmail,
      recipientName,
      content,
      category: category || 'Random',
    });

    return NextResponse.json({ success: true, data: letter }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

// GET — Fetch letters (inbox or sent)
export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const type = searchParams.get('type') || 'inbox'; // 'inbox' | 'sent' | 'users'

    if (type === 'users') {
      // Return list of all registered users (for recipient selection)
      const User = (await import('@/app/lib/models/User')).default;
      const users = await User.find({}, { name: 1, email: 1, _id: 0 }).sort({ name: 1 });
      return NextResponse.json({ success: true, data: users });
    }

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email is required' }, { status: 400 });
    }

    let query: Record<string, unknown>;
    if (type === 'sent') {
      query = { senderEmail: email };
    } else {
      query = { recipientEmail: email };
    }

    const letters = await Letter.find(query).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: letters });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH — Mark as read
export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Letter ID is required' }, { status: 400 });
    }

    const letter = await Letter.findByIdAndUpdate(id, { read: true }, { new: true });
    if (!letter) {
      return NextResponse.json({ success: false, error: 'Letter not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: letter });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE — Delete a letter
export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Letter ID is required' }, { status: 400 });
    }

    await Letter.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
