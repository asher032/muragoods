import { NextRequest, NextResponse } from 'next/server';

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
        order.paymentStatus = 'paid';
        order.paymongoPaymentId = paidPayment.id;
        order.paidAt = new Date();
        order.topUpStatus = 'processing'; // Start processing
        await order.save();

        console.log(`TopUp Order ${orderId} confirmed — paid via ${paymentSource}`);

        // TODO: Integrate with actual game top-up provider here
        // For now, simulate processing
        setTimeout(async () => {
          try {
            order.topUpStatus = 'completed';
            order.topUpCompletedAt = new Date();
            order.completedAt = new Date();
            await order.save();
            console.log(`TopUp Order ${orderId} — top-up completed`);
          } catch (e) {
            console.error(`TopUp Order ${orderId} — processing failed:`, e);
            order.topUpStatus = 'manual_review';
            order.adminNotes = 'Top-up failed after payment. Manual review needed.';
            await order.save();
          }
        }, 30000); // Simulate 30s processing
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
