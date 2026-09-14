import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import PushSubscription from '@/app/lib/models/PushSubscription';

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

// POST — save a push subscription for a user
export async function POST(req: Request) {
  try {
    await dbConnect();
    const { subscription, email, userId } = await req.json();
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ success: false, error: 'Invalid subscription payload' }, { status: 400 });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        email: email || 'anonymous',
        userId: userId || email || 'anonymous',
        isAdmin: ADMIN_EMAILS.includes(email),
        lastUsed: new Date(),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE — remove a subscription by endpoint
export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get('endpoint');
    if (!endpoint) {
      return NextResponse.json({ success: false, error: 'endpoint required' }, { status: 400 });
    }
    await PushSubscription.findOneAndDelete({ endpoint });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
