import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import Order from '@/app/lib/models/Order';
import Product from '@/app/lib/models/Product';
import Review from '@/app/lib/models/Review';

export async function GET() {
  try {
    await dbConnect();

    // Total orders (all time, including delivered)
    const totalOrders = await Order.countDocuments({});

    // Completed orders (for revenue calc)
    const completedOrders = await Order.find({ status: 'Delivered' });
    const totalRevenue = completedOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);

    // Happy customers = unique users who placed at least one order
    const uniqueCustomerIds = await Order.distinct('userId');
    const happyCustomers = uniqueCustomerIds.length;

    // Registered users
    const registeredUsers = await User.countDocuments({});

    // Menu items - count from database
    const menuItems = await Product.countDocuments({});

    // Average rating from reviews
    const reviews = await Review.find({});
    const avgRating = reviews.length > 0
      ? (reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length)
      : 4.9;

    const stats = {
      totalOrders,
      totalRevenue,
      happyCustomers,
      registeredUsers,
      menuItems,
      avgRating: Math.round(avgRating * 10) / 10,
      totalReviews: reviews.length,
    };

    return NextResponse.json({ success: true, data: stats });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
