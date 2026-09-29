import { NextResponse, after } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Order from '@/app/lib/models/Order';
import PromoCode from '@/app/lib/models/PromoCode';
import { getSessionUser, requireAdmin } from '@/app/lib/session';

export async function POST(req: Request) {
  try {
    await dbConnect();
    const contentType = req.headers.get('content-type') || '';

    let body: Record<string, unknown> = {};
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      body = Object.fromEntries(formData.entries());
      const gcashScreenshot = formData.get('gcashScreenshot');
      if (gcashScreenshot instanceof File) {
        const bytes = await gcashScreenshot.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        body.gcashScreenshotUrl = `data:${gcashScreenshot.type};base64,${base64}`;
      }
    } else {
      body = await req.json();
    }

    // Add initial status to history
    if (!body.statusHistory) {
      body.statusHistory = [{ status: body.status || 'Pending Payment', timestamp: new Date() }];
    }

    // Identity: a signed-in user always orders as themselves — the client
    // cannot place an order (or spend a promo code) on another account.
    // Guests without a session keep the supplied identifier.
    try {
      const { getSessionUser: getShopUser } = await import('@/app/lib/session');
      const shopper = await getShopUser(req);
      if (shopper) body.userId = shopper.email.toLowerCase();
    } catch { /* session lookup failed — continue as guest */ }

    // Game-reward promo codes are consumed here, server-side, so a code can
    // never be spent twice even if the checkout request is replayed. Only
    // game-bound codes (description `game:<email>`) take this path — admin
    // codes keep their existing validate-then-apply flow.
    const promoCode = typeof body.promoCode === 'string' ? body.promoCode.trim().toUpperCase() : '';
    const orderEmail = typeof body.userId === 'string' ? body.userId.trim().toLowerCase() : '';
    if (promoCode) {
      const promo = await PromoCode.findOne({ code: promoCode, active: true });
      const owner = promo && typeof promo.description === 'string' && promo.description.startsWith('game:')
        ? promo.description.slice(5).toLowerCase()
        : null;
      if (owner) {
        if (!orderEmail || orderEmail !== owner) {
          return NextResponse.json({ success: false, error: 'That promo code belongs to another account' }, { status: 403 });
        }
        if ((promo.maxUses > 0 && promo.usedCount >= promo.maxUses) || promo.usedBy?.includes(body.userId)) {
          return NextResponse.json({ success: false, error: 'That promo code was already used' }, { status: 409 });
        }
        if (promo.validUntil && new Date(promo.validUntil) < new Date()) {
          return NextResponse.json({ success: false, error: 'That promo code has expired' }, { status: 400 });
        }
        const consumed = await PromoCode.findOneAndUpdate(
          { _id: promo._id, usedCount: promo.usedCount },
          { $inc: { usedCount: 1 }, $addToSet: { usedBy: body.userId } },
        );
        if (!consumed) {
          return NextResponse.json({ success: false, error: 'That promo code was just used — try again' }, { status: 409 });
        }
      }
    }

    const order = await Order.create(body);

    return NextResponse.json({ success: true, data: order }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    // Identity comes from the session, never from ?userId=. Admins (server-
    // verified) may list everything or filter by account; everyone else sees
    // only their own orders. The old ?isAdmin=true client flag is gone: it
    // let any visitor list every order in the database.
    const { user: admin } = await requireAdmin(req);
    if (admin) {
      const query: Record<string, unknown> = {};
      if (userId) query.userId = userId.trim().toLowerCase();
      const orders = await Order.find(query).sort({ createdAt: -1 });
      return NextResponse.json({ success: true, data: orders });
    }
    const viewer = await getSessionUser(req);
    if (!viewer) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    }
    const orders = await Order.find({ userId: viewer.email.toLowerCase() }).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: orders });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('id');
    const body = await req.json();

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    // Capture the previous status so we only react to real transitions
    const previous = await Order.findById(orderId).select('status userId').lean();
    if (!previous) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }
    const prev = previous as { status?: string; userId?: string };
    const prevStatus = prev.status;

    // Owner self-cancel: the ONLY non-admin mutation. Anything else (status
    // advances, coins, notifications) stays behind the admin guard below.
    const keys = Object.keys(body).filter((k) => k !== '$push');
    const isOwnerCancel =
      keys.length === 1 && keys[0] === 'status' && body.status === 'Cancelled' &&
      prevStatus !== 'Delivered' && prevStatus !== 'Cancelled';
    if (isOwnerCancel) {
      const { getSessionUser: getShopper } = await import('@/app/lib/session');
      const shopper = await getShopper(req);
      if (!shopper || !prev.userId || prev.userId.toLowerCase() !== shopper.email.toLowerCase()) {
        return NextResponse.json({ success: false, error: 'You can only cancel your own orders' }, { status: 403 });
      }
      const order = await Order.findByIdAndUpdate(orderId, { status: 'Cancelled' }, { new: true });
      return NextResponse.json({ success: true, data: order });
    }

    // Order mutation is admin-only: status changes award coins/points and
    // push notifications, so an unauthenticated caller must never reach them.
    const { response } = await requireAdmin(req);
    if (response) return response;

    // Handle $push operations for statusHistory
    const updateOps: Record<string, unknown> = {};
    if (body.$push) {
      updateOps.$push = body.$push;
      delete body.$push;
    }
    // Merge remaining fields
    Object.assign(updateOps, body);

    const order = await Order.findByIdAndUpdate(orderId, updateOps, { new: true });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // On status change: push-notify the customer. On the Delivered transition
    // also award coins server-side (idempotent). after() keeps the response
    // fast while guaranteeing the work still runs after the response is sent.
    if (prevStatus !== order.status) {
      const delivered = order.status === 'Delivered' && prevStatus !== 'Delivered';
      after(async () => {
        const baseUrl = new URL(req.url).origin;
        const notify = fetch(`${baseUrl}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: String(order._id),
            userEmail: order.userId,
            title: delivered ? 'Order delivered' : 'Order update',
            body: delivered
              ? `Your order #${String(order._id).slice(-8).toUpperCase()} has been delivered. Enjoy!`
              : `Order #${String(order._id).slice(-8).toUpperCase()} is now: ${order.status}`,
            url: `/order/${order._id}`,
            tag: `order-${order._id}`,
            notifyAdmins: false,
          }),
        });
        if (delivered) {
          await Promise.allSettled([
            notify,
            fetch(`${baseUrl}/api/orders/award-coins`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId }),
            }),
          ]);
        } else {
          await notify.catch(() => {});
        }
      });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const { response } = await requireAdmin(req);
  if (response) return response;
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('id');

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    await Order.findByIdAndDelete(orderId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
