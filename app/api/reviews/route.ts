import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Review from '@/app/lib/models/Review';

const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { orderId, userId, userName, productName, rating, comment } = body;

    if (!orderId || !userId || !productName || !rating) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json({ success: false, error: 'Rating must be 1-5' }, { status: 400 });
    }

    // Check if user already reviewed this order+product combo
    const existing = await Review.findOne({ orderId, userId, productName });
    if (existing) {
      return NextResponse.json({ success: false, error: 'You already reviewed this item' }, { status: 400 });
    }

    const review = await Review.create({
      orderId,
      userId,
      userName: userName || 'Anonymous',
      productName,
      rating,
      comment: comment || '',
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
    const userId = searchParams.get('userId');
    const isAdmin = searchParams.get('isAdmin') === 'true';

    if (productName) {
      // Get reviews for a specific product (public)
      const reviews = await Review.find({ productName }).sort({ createdAt: -1 }).limit(50);
      const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
      return NextResponse.json({
        success: true,
        data: { reviews, avgRating: Math.round(avgRating * 10) / 10, totalReviews: reviews.length },
      });
    }

    if (orderId) {
      // Get reviews for a specific order
      const reviews = await Review.find({ orderId }).sort({ createdAt: -1 });
      return NextResponse.json({ success: true, data: reviews });
    }

    if (userId) {
      // Get user's reviews
      const reviews = await Review.find({ userId }).sort({ createdAt: -1 });
      return NextResponse.json({ success: true, data: reviews });
    }

    if (isAdmin) {
      // Admin: get all reviews
      const reviews = await Review.find({}).sort({ createdAt: -1 }).limit(100);
      return NextResponse.json({ success: true, data: reviews });
    }

    return NextResponse.json({ success: false, error: 'Query parameter required' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { reviewId, adminReply, userEmail } = body;

    if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    if (!reviewId || !adminReply) {
      return NextResponse.json({ success: false, error: 'Review ID and reply required' }, { status: 400 });
    }

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { adminReply, adminRepliedAt: new Date() },
      { new: true }
    );

    if (!review) {
      return NextResponse.json({ success: false, error: 'Review not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: review });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const reviewId = searchParams.get('id');
    const userEmail = searchParams.get('email');

    if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    if (!reviewId) {
      return NextResponse.json({ success: false, error: 'Review ID required' }, { status: 400 });
    }

    await Review.findByIdAndDelete(reviewId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
