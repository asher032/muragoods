import { NextResponse } from 'next/server';
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
        body.gcashScreenshotUrl = URL.createObjectURL(gcashScreenshot);
      }
    } else {
      body = await req.json();
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

    const order = await Order.findByIdAndUpdate(orderId, body, { new: true });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
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
