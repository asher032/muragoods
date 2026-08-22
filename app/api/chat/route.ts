import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import ChatMessage from '@/app/lib/models/ChatMessage';

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { sender, senderName, senderEmail, message, orderId } = body;

    if (!senderEmail || !message?.trim()) {
      return NextResponse.json({ success: false, error: 'Message and sender required' }, { status: 400 });
    }

    const isAdmin = ADMIN_EMAILS.includes(senderEmail);

    const chatMessage = await ChatMessage.create({
      sender: sender || senderName,
      senderName: senderName || senderEmail,
      senderEmail,
      recipient: isAdmin ? 'user' : 'admin',
      message: message.trim(),
      isAdmin,
      orderId: orderId || '',
    });

    return NextResponse.json({ success: true, data: chatMessage }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const userEmail = searchParams.get('email');
    const isAdmin = searchParams.get('isAdmin') === 'true';
    const unreadOnly = searchParams.get('unread') === 'true';
    const since = searchParams.get('since');

    if (isAdmin && ADMIN_EMAILS.includes(userEmail || '')) {
      // Admin sees all messages from all users
      let query: Record<string, unknown> = {};
      if (unreadOnly) query.read = false;
      if (since) query.createdAt = { $gt: new Date(since) };
      const messages = await ChatMessage.find(query).sort({ createdAt: 1 }).limit(200);
      return NextResponse.json({ success: true, data: messages });
    }

    if (userEmail) {
      // Regular user sees only their own messages
      let query: Record<string, unknown> = { senderEmail: userEmail };
      if (unreadOnly) query.read = false;
      if (since) query.createdAt = { $gt: new Date(since) };
      const messages = await ChatMessage.find(query).sort({ createdAt: 1 }).limit(200);
      return NextResponse.json({ success: true, data: messages });
    }

    return NextResponse.json({ success: false, error: 'Email required' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { messageIds, userEmail, markAll } = body;

    if (markAll && userEmail) {
      // Mark all messages from this user as read (used by admin)
      await ChatMessage.updateMany(
        { senderEmail: userEmail, read: false },
        { $set: { read: true } }
      );
      return NextResponse.json({ success: true });
    }

    if (Array.isArray(messageIds)) {
      await ChatMessage.updateMany(
        { _id: { $in: messageIds } },
        { $set: { read: true } }
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'No messages to update' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get('id');
    const userEmail = searchParams.get('email');

    if (!messageId) {
      return NextResponse.json({ success: false, error: 'Message ID required' }, { status: 400 });
    }

    const msg = await ChatMessage.findById(messageId);
    if (!msg) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 });
    }

    // Only allow delete by the sender or admin
    const isAdmin = userEmail && ADMIN_EMAILS.includes(userEmail);
    if (!isAdmin && msg.senderEmail !== userEmail) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    await ChatMessage.findByIdAndDelete(messageId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
