import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import Order from '@/app/lib/models/Order';

export async function GET() {
  try {
    await dbConnect();
    const orders = await Order.find({}).sort({ createdAt: -1 });

    // Daily revenue (last 7 days)
    const dailyRevenue: { date: string; total: number; count: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayOrders = orders.filter(o => {
        const oDate = new Date(o.createdAt).toISOString().split('T')[0];
        return oDate === dateStr && o.status !== 'Cancelled';
      });
      dailyRevenue.push({
        date: dateStr,
        total: dayOrders.reduce((sum, o) => sum + (o.total || 0), 0),
        count: dayOrders.length,
      });
    }

    // Popular items
    const itemCounts: Record<string, number> = {};
    for (const order of orders) {
      if (order.status === 'Cancelled') continue;
      const items: string[] = (() => { try { return JSON.parse(String(order.items)); } catch { return []; } })();
      for (const item of items) {
        const name = item.split(' (')[0].trim(); // Get just the name
        itemCounts[name] = (itemCounts[name] || 0) + 1;
      }
    }
    const popularItems = Object.entries(itemCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Zone distribution
    const zoneCounts: Record<string, number> = {};
    for (const order of orders) {
      if (order.status === 'Cancelled') continue;
      zoneCounts[order.zone] = (zoneCounts[order.zone] || 0) + 1;
    }

    // Status distribution
    const statusCounts: Record<string, number> = {};
    for (const order of orders) {
      statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;
    }

    // Payment method distribution
    const paymentCounts: Record<string, number> = {};
    for (const order of orders) {
      if (order.status === 'Cancelled') continue;
      paymentCounts[order.payment] = (paymentCounts[order.payment] || 0) + 1;
    }

    // Weekly earnings summary (last 4 weeks)
    const weeklyRevenue: { week: string; total: number; count: number; avgOrder: number }[] = [];
    for (let w = 3; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (w * 7 + 6));
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      weekEnd.setHours(23, 59, 59, 999);

      const weekOrders = orders.filter(o => {
        const oDate = new Date(o.createdAt);
        return oDate >= weekStart && oDate <= weekEnd && o.status !== 'Cancelled';
      });
      const weekTotal = weekOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      weeklyRevenue.push({
        week: `Week of ${weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`,
        total: weekTotal,
        count: weekOrders.length,
        avgOrder: weekOrders.length > 0 ? Math.round(weekTotal / weekOrders.length) : 0,
      });
    }

    // Unique customers
    const uniqueCustomers = new Set(orders.filter(o => o.status !== 'Cancelled').map(o => o.userId)).size;

    // Today's stats
    const todayStr = now.toISOString().split('T')[0];
    const todayOrders = orders.filter(o => {
      return new Date(o.createdAt).toISOString().split('T')[0] === todayStr && o.status !== 'Cancelled';
    });
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    // Summary stats
    const activeOrders = orders.filter(o => o.status !== 'Cancelled' && o.status !== 'Delivered');
    const totalRevenue = orders.filter(o => o.status !== 'Cancelled').reduce((sum, o) => sum + (o.total || 0), 0);
    const avgOrderValue = orders.filter(o => o.status !== 'Cancelled').length > 0
      ? Math.round(totalRevenue / orders.filter(o => o.status !== 'Cancelled').length)
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalOrders: orders.filter(o => o.status !== 'Cancelled').length,
          totalRevenue,
          avgOrderValue,
          activeOrders: activeOrders.length,
          delivered: orders.filter(o => o.status === 'Delivered').length,
          cancelled: orders.filter(o => o.status === 'Cancelled').length,
          uniqueCustomers,
          todayRevenue,
          todayOrders: todayOrders.length,
        },
        dailyRevenue,
        weeklyRevenue,
        popularItems,
        zoneCounts,
        statusCounts,
        paymentCounts,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
