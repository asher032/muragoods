import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import PromoCode from '@/app/lib/models/PromoCode';

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { code, type, value, description, minOrder, maxUses, validUntil, createdBy } = body;

    if (!code || !type || !value) {
      return NextResponse.json({ success: false, error: 'Code, type, and value required' }, { status: 400 });
    }

    if (!ADMIN_EMAILS.includes(createdBy)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const existing = await PromoCode.findOne({ code: code.toUpperCase() });
    if (existing) {
      return NextResponse.json({ success: false, error: 'Code already exists' }, { status: 400 });
    }

    const promoCode = await PromoCode.create({
      code: code.toUpperCase(),
      type,
      value,
      description: description || '',
      minOrder: minOrder || 0,
      maxUses: maxUses || -1,
      validUntil: validUntil || null,
      createdBy,
    });

    return NextResponse.json({ success: true, data: promoCode }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const isAdmin = searchParams.get('isAdmin') === 'true';
    const userEmail = searchParams.get('email');

    // Validate a specific code (customer use)
    if (code) {
      const promoCode = await PromoCode.findOne({ code: code.toUpperCase(), active: true });
      if (!promoCode) {
        return NextResponse.json({ success: false, error: 'Invalid promo code' }, { status: 404 });
      }

      // Check expiry (default 1 week)
      if (promoCode.validUntil && new Date(promoCode.validUntil) < new Date()) {
        return NextResponse.json({ success: false, error: 'This promo code has expired' }, { status: 400 });
      }

      // Check if already used by this user
      const userEmail = searchParams.get('email');
      if (userEmail && promoCode.usedBy?.includes(userEmail)) {
        return NextResponse.json({ success: false, error: 'You have already used this code' }, { status: 400 });
      }

      // Check usage limit
      if (promoCode.maxUses > 0 && promoCode.usedCount >= promoCode.maxUses) {
        return NextResponse.json({ success: false, error: 'This promo code has reached its usage limit' }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        data: {
          code: promoCode.code,
          type: promoCode.type,
          value: promoCode.value,
          description: promoCode.description,
          minOrder: promoCode.minOrder,
          promoId: promoCode._id,
        },
      });
    }

    // Admin: list all promo codes
    if (isAdmin && userEmail && ADMIN_EMAILS.includes(userEmail)) {
      const codes = await PromoCode.find({}).sort({ createdAt: -1 });
      return NextResponse.json({ success: true, data: codes });
    }

    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { id, updates, userEmail } = body;

    if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    if (id) {
      // Increment used count and track user
      const userEmail = body.userEmail;
      const update: Record<string, unknown> = { $inc: { usedCount: 1 } };
      if (userEmail) {
        update.$addToSet = { usedBy: userEmail };
      }
      await PromoCode.findByIdAndUpdate(id, update);
      return NextResponse.json({ success: true });
    }

    if (updates) {
      // Admin update promo code
      const { promoId, ...updateData } = updates;
      await PromoCode.findByIdAndUpdate(promoId, updateData);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'No update provided' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const userEmail = searchParams.get('email');

    if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
    }

    await PromoCode.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
