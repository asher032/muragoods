import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Order from '@/app/lib/models/Order';

const SEED_ORDERS = [
  { customer: 'Maria C.', items: ['Musubi', 'Coffee Jelly'], total: 55, status: 'Delivered', zone: 'Zone 1', address: 'Near campus', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-07-15') },
  { customer: 'Juan D.', items: ['Mini Churros'], total: 70, status: 'Delivered', zone: 'Zone 2', address: 'Dorm area', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-07-16') },
  { customer: 'Ana S.', items: ['Musubi', 'Musubi'], total: 80, status: 'Delivered', zone: 'Zone 1', address: 'Near library', payment: 'Cash', deliveryType: 'Pickup', createdAt: new Date('2026-07-17') },
  { customer: 'Mark L.', items: ['Cookies', 'Coffee Jelly'], total: 40, status: 'Delivered', zone: 'Zone 3', address: 'Off-campus', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-07-18') },
  { customer: 'Joy P.', items: ['Mini Churros', 'Coffee Jelly'], total: 85, status: 'Delivered', zone: 'Zone 2', address: 'Student housing', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-07-19') },
  { customer: 'Ryan M.', items: ['Musubi', 'Cookies', 'Coffee Jelly'], total: 80, status: 'Delivered', zone: 'Zone 1', address: 'Admin building', payment: 'Cash', deliveryType: 'Pickup', createdAt: new Date('2026-07-20') },
  { customer: 'Claire T.', items: ['Musubi'], total: 40, status: 'Delivered', zone: 'Zone 4', address: 'Far dorm', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-07-22') },
  { customer: 'Bryan K.', items: ['Mini Churros', 'Mini Churros'], total: 140, status: 'Delivered', zone: 'Zone 2', address: 'Canteen area', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-07-24') },
  { customer: 'Pat G.', items: ['Coffee Jelly', 'Coffee Jelly', 'Cookies'], total: 55, status: 'Delivered', zone: 'Zone 1', address: 'Near gym', payment: 'Cash', deliveryType: 'Pickup', createdAt: new Date('2026-07-25') },
  { customer: 'Sam R.', items: ['Musubi', 'Mini Churros'], total: 110, status: 'Delivered', zone: 'Zone 3', address: 'Faculty area', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-07-27') },
  { customer: 'Liza V.', items: ['Cookies'], total: 25, status: 'Delivered', zone: 'Zone 1', address: 'Entrance gate', payment: 'Cash', deliveryType: 'Pickup', createdAt: new Date('2026-07-28') },
  { customer: 'Carlo N.', items: ['Musubi', 'Musubi', 'Coffee Jelly'], total: 95, status: 'Delivered', zone: 'Zone 2', address: 'Parking area', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-07-29') },
  { customer: 'Bea F.', items: ['Mini Churros', 'Cookies'], total: 95, status: 'Delivered', zone: 'Zone 4', address: 'Far campus', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-07-30') },
  { customer: 'Daryl W.', items: ['Musubi', 'Coffee Jelly', 'Cookies'], total: 80, status: 'Delivered', zone: 'Zone 1', address: 'Near canteen', payment: 'Cash', deliveryType: 'Pickup', createdAt: new Date('2026-08-01') },
  { customer: 'Nicole B.', items: ['Mini Churros', 'Coffee Jelly'], total: 85, status: 'Delivered', zone: 'Zone 3', address: 'Back entrance', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-08-03') },
  { customer: 'Jake H.', items: ['Musubi'], total: 40, status: 'Delivered', zone: 'Zone 2', address: 'Quad area', payment: 'Cash', deliveryType: 'Pickup', createdAt: new Date('2026-08-05') },
  { customer: 'Mia Z.', items: ['Musubi', 'Mini Churros', 'Coffee Jelly', 'Cookies'], total: 150, status: 'Delivered', zone: 'Zone 1', address: 'Main building', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-08-07') },
  { customer: 'Ethan Y.', items: ['Coffee Jelly', 'Cookies'], total: 40, status: 'Delivered', zone: 'Zone 4', address: 'Off-campus lodge', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-08-10') },
  { customer: 'Rina Q.', items: ['Mini Churros', 'Musubi'], total: 110, status: 'Delivered', zone: 'Zone 2', address: 'Science wing', payment: 'Cash', deliveryType: 'Pickup', createdAt: new Date('2026-08-12') },
  { customer: 'Troy J.', items: ['Musubi', 'Musubi', 'Mini Churros'], total: 150, status: 'Delivered', zone: 'Zone 1', address: 'Near chapel', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-08-15') },
  { customer: 'Gella A.', items: ['Coffee Jelly', 'Cookies', 'Musubi'], total: 80, status: 'Delivered', zone: 'Zone 3', address: 'Commerce building', payment: 'GCash', deliveryType: 'Delivery', createdAt: new Date('2026-08-20') },
];

export async function POST() {
  try {
    await dbConnect();

    // Check if seed data already exists
    const existingCount = await Order.countDocuments({
      createdAt: { $lt: new Date('2026-08-24') }
    });

    if (existingCount >= 20) {
      return NextResponse.json({
        success: true,
        message: `Seed data already exists (${existingCount} historical orders found). Skipping.`,
        existingCount,
      });
    }

    // Insert seed orders
    const orders = SEED_ORDERS.map(o => ({
      ...o,
      userId: 'seed-historical',
      phone: '09XX-XXX-XXXX',
      pointsEarned: Math.floor(o.total * 0.5),
      statusHistory: [{ status: 'Delivered', timestamp: o.createdAt, note: 'Historical order' }],
    }));

    const result = await Order.insertMany(orders);

    return NextResponse.json({
      success: true,
      message: `Inserted ${result.length} historical orders`,
      count: result.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Seed failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
