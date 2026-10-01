import { NextResponse, after } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Order from '@/app/lib/models/Order';
import PromoCode from '@/app/lib/models/PromoCode';
import { requireAdmin } from '@/app/lib/session';
import { getIdentityWithId, ownerFilter, ownsResource } from '@/app/lib/identity';

// Orders belong to the canonical `userId`. Identity comes from the session —
// a client-supplied `userId` is never trusted, because that is how one
// account ends up reading (or cancelling) another account's orders.

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
    //
    // The order records BOTH keys: `canonicalUserId` (the stable owner every
    // surface now references) and the legacy `userId` field, which has always
    // held the email. Writing both means orders placed today resolve
    // identically whether a reader matches the new key or the old one.
    const shopper = await getIdentityWithId(req);
    if (shopper) {
      body.userId = shopper.emailLc;
      body.canonicalUserId = shopper.userId;
      body.customer = shopper.name;
    }

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
      // An admin filter may be either the canonical id or the legacy email,
      // because admins look orders up by whatever the customer told them.
      if (userId) {
        const key = userId.trim();
        query.$or = [{ canonicalUserId: key }, { userId: key }, { userId: key.toLowerCase() }];
      }
      const orders = await Order.find(query).sort({ createdAt: -1 });
      return NextResponse.json({ success: true, data: orders });
    }
    const viewer = await getIdentityWithId(req);
    if (!viewer) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    }
    const orders = await Order.find(ownerFilter(viewer, 'userId')).sort({ createdAt: -1 });
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
    const previous = await Order.findById(orderId).select('status userId canonicalUserId').lean();
    if (!previous) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }
    const prevStatus = previous.status;

    // Owner self-cancel: the ONLY non-admin mutation. Anything else (status
    // advances, coins, notifications) stays behind the admin guard below.
    const keys = Object.keys(body).filter((k) => k !== '$push');
    const isOwnerCancel =
      keys.length === 1 && keys[0] === 'status' && body.status === 'Cancelled' &&
      prevStatus !== 'Delivered' && prevStatus !== 'Cancelled';
    if (isOwnerCancel) {
      const shopper = await getIdentityWithId(req);
      // Ownership is checked against the order's own owner field, never
      // against anything in the request.
      if (!shopper || !ownsResource(shopper, previous, 'userId')) {
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
