import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { GAMES } from '@/app/lib/game-catalog';

const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET_KEY || '';
const PAYMONGO_BASE = 'https://api.paymongo.com/v1';

function getAuthHeader() {
  return 'Basic ' + Buffer.from(`${PAYMONGO_SECRET}:`).toString('base64');
}

async function connectDB() {
  if (mongoose.connections[0].readyState === 1) return;
  await mongoose.connect(process.env.MONGODB_URI!);
}

async function getTopUpOrderModel() {
  const { default: TopUpOrder } = await import('@/app/lib/models/TopUpOrder');
  return TopUpOrder;
}

// POST: Create a new top-up order
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameId, accountDetails, packageId, paymentMethod, customerEmail, customerName } = body;

    if (!gameId || !accountDetails || !packageId || !paymentMethod || !customerEmail) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Find the game and package
    const game = GAMES.find(g => g.id === gameId);
    if (!game) {
      return NextResponse.json({ success: false, error: 'Game not found' }, { status: 404 });
    }

    const pkg = game.packages.find(p => p.id === packageId);
    if (!pkg) {
      return NextResponse.json({ success: false, error: 'Package not found' }, { status: 404 });
    }

    // Validate required account fields
    for (const field of game.accountFields) {
      if (field.required && !accountDetails[field.id]?.trim()) {
        return NextResponse.json({ success: false, error: `${field.label} is required` }, { status: 400 });
      }
    }

    // Idempotency: check for existing pending order with same game+account+package in last 5 min
    await connectDB();
    const TopUpOrder = await getTopUpOrderModel();
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existingOrder = await TopUpOrder.findOne({
      customerEmail,
      gameId,
      packageId,
      paymentStatus: { $in: ['pending', 'processing'] },
      createdAt: { $gte: fiveMinAgo },
    });

    if (existingOrder) {
      // Return existing order instead of creating duplicate
      return NextResponse.json({
        success: true,
        data: {
          orderId: existingOrder.orderId,
          checkoutUrl: null, // Already has a checkout URL
          isExisting: true,
        },
      });
    }

    // Generate IDs
    const orderId = 'TU-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const transactionId = 'TXN-' + crypto.randomBytes(8).toString('hex').toUpperCase();

    // Create the order
    const order = await TopUpOrder.create({
      orderId,
      transactionId,
      gameId: game.id,
      gameName: game.name,
      gameIcon: game.icon,
      accountDetails,
      packageId: pkg.id,
      packageName: pkg.name,
      packageCurrency: pkg.currency,
      packageAmount: pkg.amount,
      amount: pkg.price,
      costPrice: pkg.costPrice || 0,
      margin: (pkg.price) - (pkg.costPrice || 0),
      discount: 0,
      finalAmount: pkg.price,
      customerEmail,
      customerName: customerName || 'Customer',
      paymentMethod,
      paymentStatus: 'pending',
      topUpStatus: 'pending',
      paymentAttempts: 1,
      retryCount: 0,
    });

    // For online payments, create a PayMongo checkout session
    if (paymentMethod !== 'cod' && PAYMONGO_SECRET) {
      try {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://muragoods.vercel.app';
        const paymentMethods = paymentMethod === 'card' ? ['card'] : [paymentMethod, 'card'];

        const res = await fetch(`${PAYMONGO_BASE}/checkout_sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: getAuthHeader(),
          },
          body: JSON.stringify({
            data: {
              attributes: {
                line_items: [{
                  name: `${game.name} — ${pkg.name}`,
                  amount: pkg.price * 100, // centavos
                  currency: 'PHP',
                  quantity: 1,
                  description: `${pkg.amount} ${pkg.currency} for ${game.name}`,
                }],
                payment_method_types: paymentMethods,
                success_url: `${siteUrl}/topup/success?orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${siteUrl}/topup?cancelled=${orderId}`,
                reference_number: orderId,
                send_email_receipt: true,
                show_description: true,
                show_line_items: true,
                billing: {
                  name: customerName,
                  email: customerEmail,
                },
                metadata: {
                  orderId,
                  transactionId,
                  gameId: game.id,
                  gameName: game.name,
                  packageId: pkg.id,
                  packageName: pkg.name,
                  accountDetails: JSON.stringify(accountDetails),
                },
              },
            },
          }),
        });

        const result = await res.json();

        if (res.ok && result.data?.attributes?.checkout_url) {
          order.paymongoSessionId = result.data.id;
          order.paymentStatus = 'processing';
          await order.save();

          return NextResponse.json({
            success: true,
            data: {
              orderId,
              transactionId,
              checkoutUrl: result.data.attributes.checkout_url,
              sessionId: result.data.id,
            },
          });
        } else {
          console.error('PayMongo error:', result);
        }
      } catch (paymongoErr) {
        console.error('PayMongo creation failed:', paymongoErr);
      }
    }

    // Cash on delivery or PayMongo failed — order is pending
    await order.save();
    return NextResponse.json({
      success: true,
      data: {
        orderId,
        transactionId,
        checkoutUrl: `/topup/success?orderId=${orderId}`,
      },
    });
  } catch (error) {
    console.error('Top-up order creation error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create order' }, { status: 500 });
  }
}

// GET: Retrieve order by orderId or transactionId
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');
    const transactionId = searchParams.get('transactionId');
    const email = searchParams.get('email');

    if (!orderId && !transactionId && !email) {
      return NextResponse.json({ success: false, error: 'orderId, transactionId, or email required' }, { status: 400 });
    }

    await connectDB();
    const TopUpOrder = await getTopUpOrderModel();

    let query: Record<string, unknown> = {};
    if (orderId) query.orderId = orderId;
    else if (transactionId) query.transactionId = transactionId;
    else if (email) query.customerEmail = email;

    if (orderId || transactionId) {
      const order = await TopUpOrder.findOne(query).lean();
      if (!order) {
        return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: order });
    }

    // Email query — return all orders for user
    const orders = await TopUpOrder.find(query).sort({ createdAt: -1 }).limit(20).lean();
    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error('Top-up order fetch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch order' }, { status: 500 });
  }
}
