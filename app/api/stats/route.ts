import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';
import Order from '@/app/lib/models/Order';

export async function GET() {
  try {
    await dbConnect();
    
    const totalSales = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    
    const activeOrders = await Order.countDocuments({ 
      status: { $nin: ['Delivered'] } 
    });
    
    const menuItems = 24; // This can be dynamic based on your products count
    
    const registeredPlayers = await User.countDocuments({});

    const stats = {
      totalSales: totalSales[0]?.total || 0,
      activeOrders,
      menuItems,
      registeredPlayers
    };

    return NextResponse.json({ success: true, data: stats });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
