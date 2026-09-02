import { NextRequest, NextResponse } from 'next/server';

// Promo codes for game top-ups
// In production, store these in MongoDB
const PROMO_CODES: Record<string, {
  discountPercent: number;
  maxDiscount: number;
  minOrder: number;
  active: boolean;
  validUntil: string;
  usageLimit: number;
  usedCount: number;
  description: string;
}> = {
  'TOPUP10': { discountPercent: 10, maxDiscount: 100, minOrder: 49, active: true, validUntil: '2026-12-31', usageLimit: 200, usedCount: 0, description: '10% off your top-up!' },
  'FIRSTTOPUP': { discountPercent: 15, maxDiscount: 150, minOrder: 49, active: true, validUntil: '2026-12-31', usageLimit: 500, usedCount: 0, description: '15% off your first top-up!' },
  'SAVE50': { discountPercent: 0, maxDiscount: 50, minOrder: 99, active: true, validUntil: '2026-12-31', usageLimit: 100, usedCount: 0, description: '₱50 off orders ₱99+' },
  'GAMEON': { discountPercent: 5, maxDiscount: 200, minOrder: 199, active: true, validUntil: '2026-12-31', usageLimit: 300, usedCount: 0, description: '5% off all top-ups!' },
  'ML10': { discountPercent: 10, maxDiscount: 100, minOrder: 99, active: true, validUntil: '2026-12-31', usageLimit: 100, usedCount: 0, description: '10% off Mobile Legends!' },
};

export async function POST(req: NextRequest) {
  try {
    const { code, orderAmount } = await req.json();

    if (!code || !orderAmount) {
      return NextResponse.json({ success: false, error: 'Code and order amount required' }, { status: 400 });
    }

    const promo = PROMO_CODES[code.toUpperCase()];
    if (!promo) {
      return NextResponse.json({ success: false, error: 'Invalid promo code' }, { status: 400 });
    }

    if (!promo.active) {
      return NextResponse.json({ success: false, error: 'This promo code is no longer active' }, { status: 400 });
    }

    if (new Date(promo.validUntil) < new Date()) {
      return NextResponse.json({ success: false, error: 'This promo code has expired' }, { status: 400 });
    }

    if (promo.usedCount >= promo.usageLimit) {
      return NextResponse.json({ success: false, error: 'This promo code has reached its usage limit' }, { status: 400 });
    }

    if (orderAmount < promo.minOrder) {
      return NextResponse.json({ success: false, error: `Minimum order amount is ₱${promo.minOrder}` }, { status: 400 });
    }

    let discount = 0;
    if (promo.discountPercent > 0) {
      discount = Math.min(Math.round(orderAmount * promo.discountPercent / 100), promo.maxDiscount);
    } else {
      // Fixed discount (e.g., SAVE50 = ₱50 off)
      discount = Math.min(promo.maxDiscount, orderAmount - 1);
    }

    return NextResponse.json({
      success: true,
      data: {
        code: code.toUpperCase(),
        description: promo.description,
        discount,
        originalAmount: orderAmount,
        finalAmount: Math.max(1, orderAmount - discount),
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to validate promo code' }, { status: 500 });
  }
}
