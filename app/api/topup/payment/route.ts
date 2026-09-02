import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET_KEY || '';
const PAYMONGO_BASE = 'https://api.paymongo.com/v1';

function getAuthHeader() {
  return 'Basic ' + Buffer.from(`${PAYMONGO_SECRET}:`).toString('base64');
}

async function connectDB() {
  const mongoose = await import('mongoose');
  if (mongoose.default.connections[0].readyState === 1) return;
  await mongoose.default.connect(process.env.MONGODB_URI!);
}

async function getTopUpOrderModel() {
  const { default: TopUpOrder } = await import('@/app/lib/models/TopUpOrder');
  return TopUpOrder;
}

// POST: Retry a failed/cancelled payment
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, paymentMethod } = body;

    if (!orderId || !paymentMethod) {
      return NextResponse.json({ success: false, error: 'orderId and paymentMethod required' }, { status: 400 });
    }

    await connectDB();
    const TopUpOrder = await getTopUpOrderModel();
    const order = await TopUpOrder.findOne({ orderId });

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Only allow retry for failed/cancelled/expired/pending orders
    if (!['failed', 'cancelled', 'expired', 'pending'].includes(order.paymentStatus)) {
      return NextResponse.json({
        success: false,
        error: `Cannot retry order with status "${order.paymentStatus}". Only failed/cancelled/expired orders can be retried.`,
      }, { status: 400 });
    }

    // Recheck the price from catalog (price may have changed)
    const { GAMES } = await import('@/app/lib/game-catalog');
    const game = GAMES.find(g => g.id === order.gameId);
    const pkg = game?.packages.find(p => p.id === order.packageId);
    if (pkg) {
      order.amount = pkg.price;
      order.finalAmount = pkg.price;
    }

    // Increment payment attempts and retry count
    order.paymentAttempts += 1;
    order.retryCount += 1;
    order.paymentMethod = paymentMethod;
    order.paymentStatus = 'processing';
    order.lastCheckedAt = new Date();

    // For online payments, create new checkout session
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
                  name: `${order.gameName} — ${order.packageName}`,
                  amount: order.finalAmount * 100,
                  currency: 'PHP',
                  quantity: 1,
                  description: `${order.packageAmount} ${order.packageCurrency} for ${order.gameName}`,
                }],
                payment_method_types: paymentMethods,
                success_url: `${siteUrl}/topup/success?orderId=${order.orderId}&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${siteUrl}/topup?cancelled=${order.orderId}`,
                reference_number: `${order.orderId}-retry${order.retryCount}`,
                send_email_receipt: true,
                show_description: true,
                show_line_items: true,
                billing: {
                  name: order.customerName,
                  email: order.customerEmail,
                },
                metadata: {
                  orderId: order.orderId,
                  transactionId: order.transactionId,
                  retryCount: String(order.retryCount),
                  gameId: order.gameId,
                  gameName: order.gameName,
                  packageId: order.packageId,
                  packageName: order.packageName,
                  accountDetails: JSON.stringify(order.accountDetails),
                },
              },
            },
          }),
        });

        const result = await res.json();

        if (res.ok && result.data?.attributes?.checkout_url) {
          order.paymongoSessionId = result.data.id;
          await order.save();

          return NextResponse.json({
            success: true,
            data: {
              orderId: order.orderId,
              transactionId: order.transactionId,
              checkoutUrl: result.data.attributes.checkout_url,
              newAmount: order.finalAmount,
            },
          });
        }
      } catch (err) {
        console.error('PayMongo retry failed:', err);
      }
    }

    // Cash on delivery or PayMongo failed
    await order.save();
    return NextResponse.json({
      success: true,
      data: {
        orderId: order.orderId,
        transactionId: order.transactionId,
        checkoutUrl: `/topup/success?orderId=${order.orderId}`,
        newAmount: order.finalAmount,
      },
    });
  } catch (error) {
    console.error('Top-up retry error:', error);
    return NextResponse.json({ success: false, error: 'Failed to retry payment' }, { status: 500 });
  }
}
