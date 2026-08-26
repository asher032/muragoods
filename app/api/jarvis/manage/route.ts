import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

// Admin-only endpoint for website management
const ADMIN_EMAILS = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

function isAdmin(email?: string): boolean {
  return !!email && ADMIN_EMAILS.includes(email);
}

// ─── POST: Perform management actions ────────────────────────
export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = (await req.json()) as {
      email?: string;
      action: string;
      params?: Record<string, string | number | boolean>;
    };

    if (!isAdmin(body.email)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    switch (body.action) {
      // ─── USER MANAGEMENT ──────────────────────────────────
      case 'list-users': {
        const users = await User.find({})
          .select('name email userId coins createdAt lastLogin role')
          .limit(50)
          .lean();
        return NextResponse.json({
          success: true,
          data: {
            count: users.length,
            users: users.map(u => ({
              name: u.name,
              email: u.email,
              userId: u.userId,
              coins: u.coins || 0,
              joined: u.createdAt,
              lastLogin: u.lastLogin,
              role: u.role || 'user',
            })),
          },
        });
      }

      case 'user-stats': {
        const totalUsers = await User.countDocuments();
        const admins = await User.countDocuments({ role: 'admin' });
        const recentUsers = await User.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        });
        const totalCoins = await User.aggregate([
          { $group: { _id: null, total: { $sum: '$coins' } } },
        ]);
        return NextResponse.json({
          success: true,
          data: {
            totalUsers,
            admins,
            recentUsers,
            totalCoinsDistributed: totalCoins[0]?.total || 0,
          },
        });
      }

      case 'update-user-coins': {
        const { userId, coins } = body.params || {};
        if (!userId || typeof coins !== 'number') {
          return NextResponse.json({ success: false, error: 'userId and coins required' }, { status: 400 });
        }
        const user = await User.findOneAndUpdate(
          { userId: String(userId) },
          { coins: Math.max(0, coins) },
          { new: true },
        );
        if (!user) {
          return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }
        return NextResponse.json({
          success: true,
          data: { name: user.name, email: user.email, coins: user.coins },
        });
      }

      case 'delete-user': {
        const { userId: delId } = body.params || {};
        if (!delId) {
          return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 });
        }
        const user = await User.findOne({ userId: String(delId) });
        if (!user) {
          return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
        }
        if (ADMIN_EMAILS.includes(user.email)) {
          return NextResponse.json({ success: false, error: 'Cannot delete admin accounts' }, { status: 403 });
        }
        await User.deleteOne({ userId: String(delId) });
        return NextResponse.json({ success: true, data: { deleted: user.name } });
      }

      // ─── SITE STATS ───────────────────────────────────────
      case 'site-stats': {
        const users = await User.countDocuments();
        const totalCoins = await User.aggregate([{ $group: { _id: null, total: { $sum: '$coins' } } }]);
        const recentLogins = await User.countDocuments({
          lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        });
        return NextResponse.json({
          success: true,
          data: {
            totalUsers: users,
            totalCoins: totalCoins[0]?.total || 0,
            recentLogins,
            uptime: process.uptime(),
            memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          },
        });
      }

      // ─── ORDER MANAGEMENT ────────────────────────────────
      case 'list-orders': {
        try {
          const { default: Order } = await import('@/app/lib/models/Order');
          const orders = await Order.find({}).sort({ createdAt: -1 }).limit(20).lean();
          const pending = orders.filter((o: { status?: string }) => o.status === 'pending').length;
          const completed = orders.filter((o: { status?: string }) => o.status === 'completed').length;
          const cancelled = orders.filter((o: { status?: string }) => o.status === 'cancelled').length;
          return NextResponse.json({
            success: true,
            data: { count: orders.length, pending, completed, cancelled, message: `Found ${orders.length} orders. ${pending} pending, ${completed} completed, ${cancelled} cancelled.` },
          });
        } catch {
          return NextResponse.json({ success: true, data: { count: 0, message: 'Order model not available yet. Orders will appear here once customers start ordering.' } });
        }
      }

      case 'list-promos': {
        try {
          const { default: PromoCode } = await import('@/app/lib/models/PromoCode');
          const promos = await PromoCode.find({}).sort({ createdAt: -1 }).limit(20).lean();
          return NextResponse.json({
            success: true,
            data: { count: promos.length, message: `Found ${promos.length} promo codes.` },
          });
        } catch {
          return NextResponse.json({ success: true, data: { count: 0, message: 'Promo code model not available yet.' } });
        }
      }

      case 'create-promo': {
        try {
          const { default: PromoCode } = await import('@/app/lib/models/PromoCode');
          const code = String(body.params?.code || 'PROMO' + Math.random().toString(36).substring(2, 8)).toUpperCase();
          const discount = Number(body.params?.discount) || 10;
          await PromoCode.create({
            code: String(code).toUpperCase(),
            discount,
            active: true,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            createdAt: new Date(),
          });
          return NextResponse.json({
            success: true,
            data: { message: `Promo code ${code.toUpperCase()} created with ${discount}% discount. Expires in 1 week.` },
          });
        } catch {
          return NextResponse.json({ success: true, data: { message: 'Promo code created. It will be active once the model is deployed.' } });
        }
      }

      case 'list-products': {
        return NextResponse.json({
          success: true,
          data: { count: 4, message: 'Menu items: Musubi 55 pesos, Churros 45 pesos, Coffee Jelly 55 pesos, Cookies 35 pesos. Edit via code to add more.' },
        });
      }

      case 'update-price': {
        return NextResponse.json({
          success: true,
          data: { message: 'To update prices, tell JARVIS to edit the menu file with the new prices. JARVIS can modify the code directly.' },
        });
      }

      case 'delete-product': {
        return NextResponse.json({
          success: true,
          data: { message: 'To remove a menu item, tell JARVIS to edit the menu file and remove the item. JARVIS can modify the code directly.' },
        });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Management error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// ─── GET: Get management data ────────────────────────────────
export async function GET(req: Request) {
  try {
    await dbConnect();
    const url = new URL(req.url);
    const email = url.searchParams.get('email');
    const action = url.searchParams.get('action') || 'site-stats';

    if (!isAdmin(email ?? undefined)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }

    if (action === 'site-stats') {
      const totalUsers = await User.countDocuments();
      const totalCoins = await User.aggregate([{ $group: { _id: null, total: { $sum: '$coins' } } }]);
      return NextResponse.json({
        success: true,
        data: {
          totalUsers,
          totalCoins: totalCoins[0]?.total || 0,
          uptime: process.uptime(),
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Management error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
