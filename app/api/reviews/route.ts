import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Review from '@/app/lib/models/Review';
import Order from '@/app/lib/models/Order';
import { getIdentityWithId, ownerFilter } from '@/app/lib/identity';
import { requireStaff } from '@/app/lib/access-control';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────
// Reviews.
//
// This route had two real authorization holes and both were of the kind that
// never show up as an error:
//
//   POST accepted `userId` and `userName` straight from the request body, with
//   NO session check at all — so anyone could post a review attributed to any
//   account, and a review is exactly the thing people trust.
//
//   GET accepted `?isAdmin=true` and returned every review in the database.
//   A query parameter is not an authorization decision. That is a
//   client-side admin flag, which rule 29 forbids outright.
//
// Fixed by resolving identity from the session on both paths. Reviews are
// still public content by product — that is what a review IS — but reading
// "someone's reviews" is answered from the caller's own identity, and the
// admin view is behind the real staff scope.
// ─────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const identity = await getIdentityWithId(req);
    if (!identity) {
      return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
    }
    await dbConnect();

    const body = await req.json();
    const { orderId, productName, rating, comment } = body ?? {};

    if (!orderId || !productName || !rating) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    const score = Number(rating);
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return NextResponse.json({ success: false, error: 'Rating must be 1-5' }, { status: 400 });
    }

    // A review must belong to a real order belonging to THIS person. Without
    // this check, signed-in-but-not-yet-customer is enough to review anything,
    // and the attribution is whatever the body claimed.
    const order = await Order.findOne({ _id: orderId }).select('userId canonicalUserId status').lean<{
      userId?: string; canonicalUserId?: string; status?: string;
    } | null>();
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }
    const ownsOrder =
      (typeof order.canonicalUserId === 'string' && order.canonicalUserId === identity.userId) ||
      (typeof order.userId === 'string' && order.userId.toLowerCase() === identity.emailLc);
    if (!ownsOrder) {
      return NextResponse.json({ success: false, error: 'That order is not yours' }, { status: 403 });
    }

    // Attribution comes from the session, never from the request.
    const authorId = identity.emailLc;
    const existing = await Review.findOne({ orderId, userId: authorId, productName });
    if (existing) {
      return NextResponse.json({ success: false, error: 'You already reviewed this item' }, { status: 400 });
    }

    const review = await Review.create({
      orderId,
      userId: authorId,
      canonicalUserId: identity.userId,
      userName: identity.name || identity.username || 'Anonymous',
      productName,
      rating: score,
      comment: typeof comment === 'string' ? comment.slice(0, 1000) : '',
    });

    return NextResponse.json({ success: true, data: review }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const productName = searchParams.get('product');
    const orderId = searchParams.get('orderId');
    const requestedUser = searchParams.get('userId');
    const wantsAll = searchParams.get('all') === 'true';

    // Public by product — a review is public content by design.
    if (productName) {
      const reviews = await Review.find({ productName }).sort({ createdAt: -1 }).limit(50);
      const avgRating = reviews.length > 0
        ? reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length
        : 0;
      return NextResponse.json({
        success: true,
        data: { reviews, avgRating: Math.round(avgRating * 10) / 10, totalReviews: reviews.length },
      });
    }

    if (orderId) {
      const reviews = await Review.find({ orderId }).sort({ createdAt: -1 });
      return NextResponse.json({ success: true, data: reviews });
    }

    // "Everyone's reviews" is an admin capability, decided by the access
    // authority — never by a flag in the URL.
    if (wantsAll) {
      const guard = await requireStaff(req, ['support']);
      if (!guard.ok) return guard.response;
      const reviews = await Review.find({}).sort({ createdAt: -1 }).limit(100);
      return NextResponse.json({ success: true, data: reviews });
    }

    // "This person's reviews" is answered from the caller's own identity.
    // Asking about anyone else is a refusal, not a lookup.
    if (requestedUser) {
      const identity = await getIdentityWithId(req);
      if (!identity) {
        return NextResponse.json({ success: false, error: 'Sign in required' }, { status: 401 });
      }
      if (requestedUser.trim().toLowerCase() !== identity.emailLc) {
        return NextResponse.json(
          { success: false, error: 'You can only read your own reviews', code: 'NOT_YOUR_ACCOUNT' },
          { status: 403 },
        );
      }
      const reviews = await Review.find({ ...ownerFilter(identity, 'userId') }).sort({ createdAt: -1 });
      return NextResponse.json({ success: true, data: reviews });
    }

    return NextResponse.json({ success: false, error: 'Query parameter required' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}