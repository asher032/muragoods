import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import GroupOrder from '@/app/lib/models/GroupOrder';
import { getSessionUser, requireAdmin } from '@/app/lib/session';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { action, code, hostUserId, hostName, title, item, itemId } = body;

    // Create new group order — the host is stamped server-side when signed
    // in, so the client cannot host as another account.
    if (action === 'create') {
      const groupCode = generateCode();
      const host = await getSessionUser(req).catch(() => null);
      const groupOrder = await GroupOrder.create({
        code: groupCode,
        hostUserId: host ? host.email.toLowerCase() : hostUserId,
        hostName: host ? host.name : hostName,
        title: title || `${host ? host.name : hostName}'s Group Order`,
        items: [],
        status: 'open',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });
      return NextResponse.json({ success: true, data: groupOrder }, { status: 201 });
    }

    // Join / get group order by code
    if (action === 'get') {
      if (!code) return NextResponse.json({ success: false, error: 'Code required' }, { status: 400 });
      const groupOrder = await GroupOrder.findOne({ code: code.toUpperCase() });
      if (!groupOrder) return NextResponse.json({ success: false, error: 'Group order not found' }, { status: 404 });
      return NextResponse.json({ success: true, data: groupOrder });
    }

    // Add item to group order — attributed to the session account when
    // signed in.
    if (action === 'add_item') {
      if (!code || !item) return NextResponse.json({ success: false, error: 'Code and item required' }, { status: 400 });
      const groupOrder = await GroupOrder.findOne({ code: code.toUpperCase() });
      if (!groupOrder) return NextResponse.json({ success: false, error: 'Group order not found' }, { status: 404 });
      if (groupOrder.status !== 'open') return NextResponse.json({ success: false, error: 'Group order is closed' }, { status: 400 });

      const adder = await getSessionUser(req).catch(() => null);
      if (adder && item && typeof item === 'object') {
        (item as Record<string, unknown>).userId = adder.email.toLowerCase();
        (item as Record<string, unknown>).userName = adder.name;
      }
      groupOrder.items.push(item);
      await groupOrder.save();
      return NextResponse.json({ success: true, data: groupOrder });
    }

    // Remove item — item owner, host, or admin only.
    if (action === 'remove_item') {
      if (!code || !itemId) return NextResponse.json({ success: false, error: 'Code and item ID required' }, { status: 400 });
      const groupOrder = await GroupOrder.findOne({ code: code.toUpperCase() });
      if (!groupOrder) return NextResponse.json({ success: false, error: 'Group order not found' }, { status: 404 });

      const remover = await getSessionUser(req).catch(() => null);
      const { user: admin } = await requireAdmin(req);
      const target = groupOrder.items.find(
        (it: { _id: { toString(): string }; userId?: string }) => it._id.toString() === itemId,
      );
      if (target && remover && !admin) {
        const ownItem = target.userId && target.userId.toLowerCase() === remover.email.toLowerCase();
        const isHost = groupOrder.hostUserId && String(groupOrder.hostUserId).toLowerCase() === remover.email.toLowerCase();
        if (!ownItem && !isHost) {
          return NextResponse.json({ success: false, error: 'Only the item owner or host can remove it' }, { status: 403 });
        }
      }
      groupOrder.items = groupOrder.items.filter((item: { _id: { toString(): string } }) => item._id.toString() !== itemId);
      await groupOrder.save();
      return NextResponse.json({ success: true, data: groupOrder });
    }

    // Close group order (host only) — host identity resolved server-side.
    if (action === 'close') {
      if (!code) return NextResponse.json({ success: false, error: 'Code required' }, { status: 400 });
      const groupOrder = await GroupOrder.findOne({ code: code.toUpperCase() });
      if (!groupOrder) return NextResponse.json({ success: false, error: 'Group order not found' }, { status: 404 });
      const closer = await getSessionUser(req).catch(() => null);
      const { user: admin } = await requireAdmin(req);
      const hostClaim = closer ? closer.email.toLowerCase() : String(hostUserId || '').toLowerCase();
      if (!admin && String(groupOrder.hostUserId).toLowerCase() !== hostClaim) {
        return NextResponse.json({ success: false, error: 'Only the host can close' }, { status: 403 });
      }

      groupOrder.status = 'closed';
      await groupOrder.save();
      return NextResponse.json({ success: true, data: groupOrder });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
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
    const userId = searchParams.get('userId');

    if (code) {
      const groupOrder = await GroupOrder.findOne({ code: code.toUpperCase() });
      if (!groupOrder) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
      return NextResponse.json({ success: true, data: groupOrder });
    }

    // A host lists their own group orders — session owner or admin.
    if (userId) {
      const viewer = await getSessionUser(req);
      const { user: admin } = await requireAdmin(req);
      const own = viewer && viewer.email.toLowerCase() === userId.toLowerCase();
      if (!own && !admin) {
        return NextResponse.json({ success: false, error: 'Sign in required' }, { status: viewer ? 403 : 401 });
      }
      const groupOrders = await GroupOrder.find({ hostUserId: userId }).sort({ createdAt: -1 }).limit(10);
      return NextResponse.json({ success: true, data: groupOrders });
    }

    return NextResponse.json({ success: false, error: 'Query required' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
