import { NextResponse } from 'next/server';
import webPush from 'web-push';
import dbConnect from '@/app/lib/mongodb';
import PushSubscription from '@/app/lib/models/PushSubscription';

// Configure VAPID
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:muragoods0@gmail.com';

if (vapidPublicKey && vapidPrivateKey) {
  webPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

// Send push notification to admin subscribers
export async function POST(req: Request) {
  try {
    if (!vapidPublicKey || !vapidPrivateKey) {
      return NextResponse.json({ success: false, error: 'Push notifications not configured' }, { status: 500 });
    }

    const body = (await req.json()) as {
      title: string;
      body: string;
      url?: string;
      tag?: string;
      adminOnly?: boolean;
    };

    if (!body.title || !body.body) {
      return NextResponse.json({ success: false, error: 'Title and body required' }, { status: 400 });
    }

    await dbConnect();

    // Find subscriptions
    const query = body.adminOnly !== false ? { isAdmin: true } : {};
    const subscriptions = await PushSubscription.find(query);

    if (subscriptions.length === 0) {
      return NextResponse.json({ success: true, message: 'No subscribers', sent: 0 });
    }

    const payload = JSON.stringify({
      title: body.title,
      body: body.body,
      url: body.url || '/admin',
      tag: body.tag || 'muragoods-order',
      icon: '/images/muragoods-logo.png',
      badge: '/images/muragoods-logo.png',
      vibrate: [200, 100, 200],
      actions: [
        { action: 'view', title: '👁️ View Order' },
        { action: 'dismiss', title: '✕ Dismiss' },
      ],
    });

    let sent = 0;
    let failed = 0;
    const failedEndpoints: string[] = [];

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webPush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payload
          );
          sent++;
          // Update last used
          sub.lastUsed = new Date();
          await sub.save();
        } catch (err: any) {
          failed++;
          // If subscription is expired/invalid, remove it
          if (err.statusCode === 404 || err.statusCode === 410) {
            failedEndpoints.push(sub.endpoint);
          }
          throw err;
        }
      })
    );

    // Clean up invalid subscriptions
    if (failedEndpoints.length > 0) {
      await PushSubscription.deleteMany({ endpoint: { $in: failedEndpoints } });
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: subscriptions.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Push send error';
    console.error('[Push Send]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
