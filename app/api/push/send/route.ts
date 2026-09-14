import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import PushSubscription from '@/app/lib/models/PushSubscription';
import Order from '@/app/lib/models/Order';
import webpush from 'web-push';

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

function getVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_EMAIL || 'mailto:muragoods0@gmail.com';
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return { publicKey, privateKey };
}

type Payload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  userEmail?: string;
  userId?: string;
  orderId?: string;
  toAll?: boolean;
  notifyAdmins?: boolean;
};

// POST — send a push notification.
// Body options:
//   userEmail / userId  → target one user's subscriptions
//   toAll: true         → broadcast to every subscription
//   notifyAdmins: true  → also notify admin subscriptions
//   orderId             → if set, notify the order's customer (by email lookup)
export async function POST(req: Request) {
  try {
    if (!getVapid()) {
      return NextResponse.json({ success: false, error: 'VAPID keys not configured' }, { status: 500 });
    }
    await dbConnect();
    const payload: Payload = await req.json();

    // Resolve order → user email when needed
    let email = payload.userEmail;
    if (!email && payload.orderId) {
      const order = await Order.findById(payload.orderId).select('userId').lean();
      email = (order as { userId?: string } | null)?.userId;
    }

    const notification = {
      title: payload.title || 'MuraGoods',
      body: payload.body || '',
      url: payload.url || '/',
      tag: payload.tag,
      actions: [
        { action: 'view', title: 'View' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    // Build the target query
    const query: Record<string, unknown>[] = [];
    if (payload.toAll) {
      // everyone
    } else {
      if (email) query.push({ email });
      if (payload.userId) query.push({ userId: payload.userId });
      if (payload.notifyAdmins) query.push({ isAdmin: true });
      if (query.length === 0) {
        return NextResponse.json({ success: false, error: 'No target specified' }, { status: 400 });
      }
    }

    const subs = await (query.length > 0
      ? PushSubscription.find({ $or: query })
      : PushSubscription.find({}));

    let sent = 0;
    let removed = 0;
    await Promise.all(
      subs.map(async (sub: { endpoint: string; keys: { p256dh: string; auth: string } }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify(notification)
          );
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await PushSubscription.findOneAndDelete({ endpoint: sub.endpoint });
            removed++;
          }
        }
      })
    );

    return NextResponse.json({ success: true, data: { sent, removed, targets: subs.length } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
