import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import ChatMessage from '@/app/lib/models/ChatMessage';
import { getSessionUser, isAdminEmail } from '@/app/lib/session';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { sender, senderName, senderEmail, message, orderId } = body;

    if (!senderEmail || !message?.trim()) {
      return NextResponse.json({ success: false, error: 'Message and sender required' }, { status: 400 });
    }

    // Admin flag is derived from the server-side session, never from the
    // request body: otherwise anyone could post as staff by naming an admin
    // email. Anonymous posting stays allowed (guest support chat).
    const session = await getSessionUser(req).catch(() => null);
    const effectiveEmail = (session?.email || senderEmail).toLowerCase().trim();
    const isAdmin = Boolean(session) && (session!.role === 'admin' || isAdminEmail(session!.email));

    const chatMessage = await ChatMessage.create({
      sender: sender || senderName,
      senderName: senderName || effectiveEmail,
      senderEmail: effectiveEmail,
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
    const unreadOnly = searchParams.get('unread') === 'true';
    const since = searchParams.get('since');

    // Identity comes from the signed session cookie — the ?email= parameter
    // used to let any visitor read anyone else's support chat. Admins (via
    // session) still see everything; everyone else sees only their own
    // messages, with the address itself projected out of the response.
    const session = await getSessionUser(req).catch(() => null);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    }
    const admin = session.role === 'admin' || isAdminEmail(session.email);

    if (admin) {
      // Admin sees all messages from all users
      let query: Record<string, unknown> = {};
      if (unreadOnly) query.read = false;
      if (since) query.createdAt = { $gt: new Date(since) };
      const messages = await ChatMessage.find(query).sort({ createdAt: 1 }).limit(200).lean();
      return NextResponse.json({ success: true, data: messages });
    }

    let query: Record<string, unknown> = { senderEmail: session.email };
    if (unreadOnly) query.read = false;
    if (since) query.createdAt = { $gt: new Date(since) };
    const messages = await ChatMessage.find(query)
      .select('-senderEmail')
      .sort({ createdAt: 1 }).limit(200).lean();
    return NextResponse.json({ success: true, data: messages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { messageIds, markAll } = body;

    // Scoped to the caller's own messages (admins via session may act
    // broadly). The old body-supplied email allowed anyone to mark or
    // delete anyone else's messages.
    const session = await getSessionUser(req).catch(() => null);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    }
    const admin = session.role === 'admin' || isAdminEmail(session.email);
    const scope: Record<string, unknown> = admin ? {} : { senderEmail: session.email };

    if (markAll) {
      // Mark this user's unread messages as read.
      await ChatMessage.updateMany(
        { ...scope, read: false },
        { $set: { read: true } }
      );
      return NextResponse.json({ success: true });
    }

    if (Array.isArray(messageIds)) {
      await ChatMessage.updateMany(
        { _id: { $in: messageIds }, ...scope },
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

    if (!messageId) {
      return NextResponse.json({ success: false, error: 'Message ID required' }, { status: 400 });
    }

    const msg = await ChatMessage.findById(messageId);
    if (!msg) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 });
    }

    // Only allow delete by the sender or an admin — both from the session,
    // never from a request-supplied email (which anyone could forge).
    const session = await getSessionUser(req).catch(() => null);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    }
    const admin = session.role === 'admin' || isAdminEmail(session.email);
    if (!admin && msg.senderEmail !== session.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    await ChatMessage.findByIdAndDelete(messageId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
