import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import PromoCode from '@/app/lib/models/PromoCode';
import { requireStaff, requireOwner } from '@/app/lib/access-control';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// Promo codes.
//
// Every handler here used to authorize with an email taken FROM THE REQUEST —
// `createdBy` in the POST body, `userEmail` in the PATCH body, `?email=` in
// GET and DELETE — checked against a hardcoded list in THIS file. That meant:
//
//   curl -X DELETE '/api/promo-codes?id=…&email=muragoods0@gmail.com'
//
// deleted a promo code, as anyone, because the caller was allowed to name
// themselves an admin. A request field is not an authorization decision, and
// the hardcoded list was a second copy of ADMIN_EMAILS, which drifts.
//
// Fixed by resolving access through app/lib/access-control, which reads the
// session. The hardcoded list is gone: there is now one definition of who is
// an admin.
//
// The PUBLIC path is unchanged: `?code=` validates a code at checkout, which a
// signed-out shopper must be able to do.
// ─────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const guard = await requireStaff(req, ['shop']);
    if (!guard.ok) return guard.response;

    await dbConnect();
    const body = await req.json();
    const { code, type, value, description, minOrder, maxUses, validUntil } = body;

    if (!code || !type || !value) {
      return NextResponse.json({ success: false, error: 'Code, type, and value required' }, { status: 400 });
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
      // Attribution comes from the session, not from a field the caller sent.
      createdBy: guard.access.email || '',
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
    // `?isAdmin=true` is gone: it never was an authorization decision. Listing
    // every code is now decided by the caller's session.
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

      // Game-reward codes are bound to their winner at mint time
      // (description `game:<email>`) — anyone else gets a refusal, never a hint.
      const userEmail = searchParams.get('email');
      const owner = typeof promoCode.description === 'string' && promoCode.description.startsWith('game:')
        ? promoCode.description.slice(5).toLowerCase()
        : null;
      if (owner && userEmail?.toLowerCase() !== owner) {
        return NextResponse.json({ success: false, error: 'Invalid promo code' }, { status: 404 });
      }

      // Check if already used by this user
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

    // Admin: list all promo codes — proven from the session, not from the URL.
    const guard = await requireStaff(req, ['shop']);
    if (!guard.ok) return guard.response;
    const codes = await PromoCode.find({}).sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: codes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const guard = await requireStaff(req, ['shop']);
    if (!guard.ok) return guard.response;

    await dbConnect();
    const body = await req.json();
    const { id, updates, userEmail } = body;

    if (id) {
      // Record a redemption. `userEmail` here is who USED the code, which is
      // data about the redemption — not a claim about who is calling, which
      // was proven above from the session.
      const update: Record<string, unknown> = { $inc: { usedCount: 1 } };
      if (typeof userEmail === 'string' && userEmail) {
        update.$addToSet = { usedBy: userEmail.toLowerCase() };
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
    // Deleting a discount is destructive and revenue-affecting, so it is
    // owner-only — no staff scope grants it.
    const guard = await requireOwner(req);
    if (!guard.ok) return guard.response;

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

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
