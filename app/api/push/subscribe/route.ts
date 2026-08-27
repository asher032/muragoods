import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import PushSubscription from '@/app/lib/models/PushSubscription';

// Save a push subscription (when admin enables notifications)
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      subscription: PushSubscriptionJSON;
      email?: string;
      userId?: string;
    };

    if (!body.subscription || !body.subscription.endpoint) {
      return NextResponse.json({ success: false, error: 'Invalid subscription' }, { status: 400 });
    }

    const keys = (body.subscription as any).keys;
    if (!keys || !keys.p256dh || !keys.auth) {
      return NextResponse.json({ success: false, error: 'Invalid subscription keys' }, { status: 400 });
    }

    await dbConnect();

    const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];
    const isAdmin = body.email ? ADMIN_EMAILS.includes(body.email) : false;

    // Upsert subscription
    await PushSubscription.findOneAndUpdate(
      { endpoint: body.subscription.endpoint },
      {
        endpoint: body.subscription.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        userId: body.userId || '',
        email: body.email || '',
        isAdmin,
        lastUsed: new Date(),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true, message: 'Subscription saved' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Subscription error';
    console.error('[Push Subscribe]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// Delete a push subscription
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get('endpoint');

    if (!endpoint) {
      return NextResponse.json({ success: false, error: 'Missing endpoint' }, { status: 400 });
    }

    await dbConnect();
    await PushSubscription.findOneAndDelete({ endpoint });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unsubscribe error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
