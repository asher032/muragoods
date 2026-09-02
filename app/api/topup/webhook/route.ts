import { NextRequest, NextResponse } from 'next/server';
import { sendTopUpReceiptEmail } from '@/lib/email';

async function connectDB() {
  const mongoose = await import('mongoose');
  if (mongoose.default.connections[0].readyState === 1) return;
  await mongoose.default.connect(process.env.MONGODB_URI!);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventType = body.data?.type;
    const session = body.data?.data;

    console.log('TopUp webhook received:', eventType, session?.id);

    if (eventType === 'checkout_session.payment.paid') {
      const attrs = session?.attributes;
      if (!attrs) return NextResponse.json({ received: true });

      const metadata = attrs.metadata || {};
      const orderId = metadata.orderId;
      const payments = attrs.payments || [];
      const paidPayment = payments.find((p: { attributes: { status: string } }) => p.attributes?.status === 'paid');

      if (!paidPayment || !orderId) return NextResponse.json({ received: true });

      const paymentAttrs = paidPayment.attributes;
      const paymentSource = paymentAttrs.source?.type || 'unknown';

      await connectDB();
      const { default: TopUpOrder } = await import('@/app/lib/models/TopUpOrder');

      const order = await TopUpOrder.findOne({ orderId });
      if (order) {
        // Mark payment as confirmed
        order.paymentStatus = 'paid';
        order.paymongoPaymentId = paidPayment.id;
        order.paidAt = new Date();

        // Set topup status to awaiting manual fulfillment
        // NOT 'processing' — no automatic API call happens
        order.topUpStatus = 'pending_fulfillment';
        order.adminNotes = `Payment confirmed via ${paymentSource}. Awaiting manual fulfillment.`;
        await order.save();

        console.log(`TopUp Order ${orderId} — payment confirmed via ${paymentSource}`);
        console.log(`TopUp Order ${orderId} — awaiting manual fulfillment by admin`);

        // Send receipt email to customer
        if (order.customerEmail) {
          sendTopUpReceiptEmail({
            to: order.customerEmail, orderId, transactionId: order.transactionId,
            gameName: order.gameName, gameIcon: order.gameIcon, accountDetails: order.accountDetails,
            packageName: order.packageName, packageCurrency: order.packageCurrency, packageAmount: order.packageAmount,
            amount: order.finalAmount, paymentMethod: order.paymentMethod, createdAt: order.createdAt,
          }).catch(e => console.error('[Email] Receipt failed:', e));
        }

        // NOTE: In a future version with automatic fulfillment:
        // 1. Import the appropriate provider
        // 2. Call provider.createTopUp()
        // 3. Poll with provider.checkTransaction() or wait for webhook
        // For now, the admin fulfills manually via /admin/fulfillment
      }
    }

    if (eventType === 'checkout_session.payment.failed') {
      const attrs = session?.attributes;
      const metadata = attrs?.metadata || {};
      const orderId = metadata.orderId;

      if (orderId) {
        await connectDB();
        const { default: TopUpOrder } = await import('@/app/lib/models/TopUpOrder');
        const order = await TopUpOrder.findOne({ orderId });
        if (order && order.paymentStatus !== 'paid') {
          order.paymentStatus = 'failed';
          order.failedAt = new Date();
          order.adminNotes = 'Payment failed via PayMongo.';
          await order.save();
          console.log(`TopUp Order ${orderId} — payment failed`);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('TopUp webhook error:', error);
    return NextResponse.json({ received: true });
  }
}
