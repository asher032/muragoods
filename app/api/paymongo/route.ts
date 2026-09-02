import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';

const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET_KEY || '';
const PAYMONGO_BASE = 'https://api.paymongo.com/v1';

function getAuthHeader() {
  return 'Basic ' + Buffer.from(`${PAYMONGO_SECRET}:`).toString('base64');
}

async function connectDB() {
  if (mongoose.connections[0].readyState === 1) return;
  await mongoose.connect(process.env.MONGODB_URI!);
}

export async function POST(req: NextRequest) {
  try {
    if (!PAYMONGO_SECRET) {
      return NextResponse.json(
        { success: false, error: 'PayMongo secret key not configured. Add PAYMONGO_SECRET_KEY to your environment variables.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const {
      items,
      total,
      customerName,
      customerEmail,
      customerPhone,
      deliveryAddress,
      deliveryZone,
      deliveryDate,
      deliveryTimeSlot,
      deliveryService,
      orderId,
      discountCode,
      discountAmount,
      promoCode,
      promoDiscountAmount,
      pointsEarned,
      paymentMethods = ['gcash', 'card', 'qrph'],
    } = body;

    if (!items || !total || total <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid items or total amount' },
        { status: 400 }
      );
    }

    // Build line items for PayMongo (amounts in centavos)
    const lineItems = items.map((item: { name: string; variant?: string; price: number; quantity: number }) => ({
      name: item.variant ? `${item.name} (${item.variant})` : item.name,
      amount: Math.round(item.price * 100), // Convert pesos to centavos
      currency: 'PHP',
      quantity: item.quantity,
      description: item.variant ? `${item.name} - ${item.variant}` : item.name,
    }));

    // Build metadata
    const metadata: Record<string, string> = {
      orderId: orderId || '',
      customerName: customerName || '',
      customerEmail: customerEmail || '',
      customerPhone: customerPhone || '',
      deliveryZone: deliveryZone || '',
      deliveryDate: deliveryDate || '',
      deliveryTimeSlot: deliveryTimeSlot || '',
      deliveryService: deliveryService || '',
      deliveryAddress: deliveryAddress || '',
    };
    if (discountCode) metadata.discountCode = discountCode;
    if (discountAmount) metadata.discountAmount = String(discountAmount);
    if (promoCode) metadata.promoCode = promoCode;
    if (promoDiscountAmount) metadata.promoDiscountAmount = String(promoDiscountAmount);
    if (pointsEarned) metadata.pointsEarned = String(pointsEarned);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://muragoods.vercel.app';

    // Create Checkout Session via PayMongo API v1
    const res = await fetch(`${PAYMONGO_BASE}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: lineItems,
            payment_method_types: paymentMethods,
            success_url: `${siteUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${siteUrl}/checkout`,
            reference_number: orderId || `MURA-${Date.now()}`,
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            billing: {
              name: customerName || 'Customer',
              email: customerEmail || '',
              phone: customerPhone || '',
            },
            metadata,
          },
        },
      }),
    });

    const result = await res.json();

    if (!res.ok || !result.data) {
      console.error('PayMongo error:', result);
      return NextResponse.json(
        { success: false, error: result.errors?.[0]?.detail || 'Failed to create checkout session' },
        { status: res.status || 500 }
      );
    }

    const checkoutUrl = result.data.attributes.checkout_url;
    const sessionId = result.data.id;
    const clientKey = result.data.attributes.client_key;

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        checkoutUrl,
        clientKey,
      },
    });
  } catch (error) {
    console.error('PayMongo checkout error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET: Retrieve a checkout session status
export async function GET(req: NextRequest) {
  try {
    if (!PAYMONGO_SECRET) {
      return NextResponse.json(
        { success: false, error: 'PayMongo not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'session_id required' },
        { status: 400 }
      );
    }

    const res = await fetch(`${PAYMONGO_BASE}/checkout_sessions/${sessionId}`, {
      headers: {
        Authorization: getAuthHeader(),
      },
    });

    const result = await res.json();

    if (!res.ok || !result.data) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    const attrs = result.data.attributes;
    const paymentStatus = attrs.payments?.[0]?.attributes?.status || 'pending';

    return NextResponse.json({
      success: true,
      data: {
        id: result.data.id,
        status: attrs.status,
        paymentStatus,
        amount: attrs.line_items?.reduce((sum: number, item: { amount: number; quantity: number }) => sum + item.amount * item.quantity, 0) / 100 || 0,
        referenceNumber: attrs.reference_number,
        metadata: attrs.metadata,
        paidAt: attrs.payments?.[0]?.attributes?.paid_at,
      },
    });
  } catch (error) {
    console.error('PayMongo retrieve error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
