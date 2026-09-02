import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';

const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET || '';

async function connectDB() {
  if (mongoose.connections[0].readyState === 1) return;
  await mongoose.connect(process.env.MONGODB_URI!);
}

// Dynamic import to avoid circular deps
async function getOrderModel() {
  const { default: Order } = await import('@/app/lib/models/Order');
  return Order;
}

async function getUserModel() {
  const { default: User } = await import('@/app/lib/models/User');
  return User;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventType = body.data?.type;
    const session = body.data?.data;

    console.log('PayMongo webhook received:', eventType, session?.id);

    if (eventType === 'checkout_session.payment.paid') {
      const attrs = session?.attributes;
      if (!attrs) {
        return NextResponse.json({ received: true });
      }

      const metadata = attrs.metadata || {};
      const orderId = metadata.orderId;
      const payments = attrs.payments || [];
      const paidPayment = payments.find((p: { attributes: { status: string } }) => p.attributes?.status === 'paid');

      if (!paidPayment) {
        console.log('No paid payment found in webhook');
        return NextResponse.json({ received: true });
      }

      const paymentAttrs = paidPayment.attributes;
      const paymentSource = paymentAttrs.source?.type || 'unknown';
      const amountPaid = paymentAttrs.amount / 100; // centavos to pesos

      console.log('Payment confirmed:', {
        orderId,
        paymentId: paidPayment.id,
        amount: amountPaid,
        source: paymentSource,
      });

      if (orderId) {
        await connectDB();
        const Order = await getOrderModel();
        const User = await getUserModel();

        // Update the order status to "Paid"
        const order = await Order.findById(orderId);
        if (order) {
          order.status = 'Confirmed';
          order.paymentStatus = 'paid';
          order.paymongoPaymentId = paidPayment.id;
          order.paymongoSessionId = session.id;
          order.paymentMethod = `PayMongo (${paymentSource})`;
          await order.save();

          // Award coins/points to the user
          if (order.userId && order.total) {
            const pointsEarned = Math.floor(order.total * 0.5);
            await User.findOneAndUpdate(
              { email: order.userId },
              {
                $inc: {
                  coins: pointsEarned,
                  totalPointsEarned: pointsEarned,
                  totalOrders: 1,
                },
              }
            );
          }

          // Send push notification to admin
          try {
            const adminEmail = process.env.ADMIN_EMAIL || 'muragoods0@gmail.com';
            await User.findOneAndUpdate(
              { email: adminEmail },
              {
                $push: {
                  notifications: {
                    title: '💰 Payment Received!',
                    message: `Order #${orderId.slice(-6)} paid via ${paymentSource} — ₱${amountPaid}`,
                    type: 'payment',
                    read: false,
                    createdAt: new Date(),
                  },
                },
              }
            );
          } catch (notifErr) {
            console.error('Failed to send admin notification:', notifErr);
          }

          console.log(`Order ${orderId} confirmed and paid via ${paymentSource}`);
        } else {
          console.warn(`Order ${orderId} not found for webhook confirmation`);
        }
      }
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('PayMongo webhook error:', error);
    // Return 200 to prevent PayMongo from retrying for processing errors
    return NextResponse.json({ received: true });
  }
}
