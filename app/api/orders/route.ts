import { NextResponse, after } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Order from '@/app/lib/models/Order';

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
    const isAdmin = searchParams.get('isAdmin') === 'true';

    if (!isAdmin && !userId) {
      return NextResponse.json({ success: false, error: 'userId or isAdmin=true is required' }, { status: 400 });
    }

    let query: Record<string, unknown> = {};
    if (!isAdmin && userId) {
      query = { userId };
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });
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
    const previous = await Order.findById(orderId).select('status').lean();
    if (!previous) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }
    const prevStatus = (previous as { status?: string }).status;

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
