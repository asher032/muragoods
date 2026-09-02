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
        order.paymentStatus = 'paid';
        order.paymongoPaymentId = paidPayment.id;
        order.paidAt = new Date();
        order.topUpStatus = 'processing'; // Start processing
        await order.save();

        console.log(`TopUp Order ${orderId} confirmed — paid via ${paymentSource}`);

        // Send receipt email
        if (order.customerEmail) {
          sendTopUpReceiptEmail({
            to: order.customerEmail, orderId, transactionId: order.transactionId,
            gameName: order.gameName, gameIcon: order.gameIcon, accountDetails: order.accountDetails,
            packageName: order.packageName, packageCurrency: order.packageCurrency, packageAmount: order.packageAmount,
            amount: order.finalAmount, paymentMethod: order.paymentMethod, createdAt: order.createdAt,
          }).catch(e => console.error('[Email] Receipt failed:', e));
        }

        // Process top-up via provider
        try {
          const { getProviderForGame } = await import('@/app/lib/topup-providers');
          const provider = getProviderForGame(order.gameId);
          console.log(`TopUp Order ${orderId} — using provider: ${provider.name}`);

          const result = await provider.createTopUp({
            gameId: order.gameId,
            packageId: order.packageId,
            accountDetails: order.accountDetails,
            orderId,
            amount: order.finalAmount,
          });

          if (result.success && result.providerTransactionId) {
            order.topUpProviderRef = result.providerTransactionId;
            order.topUpStatus = 'processing';
            await order.save();

            // Poll for completion (in production, use webhooks instead)
            const checkInterval = setInterval(async () => {
              try {
                const status = await provider.checkTransaction(result.providerTransactionId!);
                if (status.status === 'completed') {
                  order.topUpStatus = 'completed';
                  order.topUpCompletedAt = new Date();
                  order.completedAt = new Date();
                  await order.save();
                  clearInterval(checkInterval);
                  console.log(`TopUp Order ${orderId} — completed via ${provider.name}`);
                } else if (status.status === 'failed') {
                  order.topUpStatus = 'manual_review';
                  order.adminNotes = `Provider ${provider.name} reported failure.`;
                  await order.save();
                  clearInterval(checkInterval);
                  console.error(`TopUp Order ${orderId} — failed via ${provider.name}`);
                }
              } catch (e) {
                console.error(`TopUp Order ${orderId} — status check error:`, e);
              }
            }, 10000); // Check every 10s

            // Safety timeout after 5 minutes
            setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000);
          } else {
            order.topUpStatus = 'manual_review';
            order.adminNotes = `Provider ${provider.name} failed: ${result.error || 'Unknown error'}`;
            await order.save();
            console.error(`TopUp Order ${orderId} — provider ${provider.name} failed:`, result.error);
          }
        } catch (e) {
          console.error(`TopUp Order ${orderId} — provider error:`, e);
          order.topUpStatus = 'manual_review';
          order.adminNotes = 'Top-up provider error. Manual review needed.';
          await order.save();
        }
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
