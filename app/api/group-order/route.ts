import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import GroupOrder from '@/app/lib/models/GroupOrder';

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

    // Create new group order
    if (action === 'create') {
      const groupCode = generateCode();
      const groupOrder = await GroupOrder.create({
        code: groupCode,
        hostUserId,
        hostName,
        title: title || `${hostName}'s Group Order`,
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

    // Add item to group order
    if (action === 'add_item') {
      if (!code || !item) return NextResponse.json({ success: false, error: 'Code and item required' }, { status: 400 });
      const groupOrder = await GroupOrder.findOne({ code: code.toUpperCase() });
      if (!groupOrder) return NextResponse.json({ success: false, error: 'Group order not found' }, { status: 404 });
      if (groupOrder.status !== 'open') return NextResponse.json({ success: false, error: 'Group order is closed' }, { status: 400 });

      groupOrder.items.push(item);
      await groupOrder.save();
      return NextResponse.json({ success: true, data: groupOrder });
    }

    // Remove item
    if (action === 'remove_item') {
      if (!code || !itemId) return NextResponse.json({ success: false, error: 'Code and item ID required' }, { status: 400 });
      const groupOrder = await GroupOrder.findOne({ code: code.toUpperCase() });
      if (!groupOrder) return NextResponse.json({ success: false, error: 'Group order not found' }, { status: 404 });

      groupOrder.items = groupOrder.items.filter((item: { _id: { toString(): string } }) => item._id.toString() !== itemId);
      await groupOrder.save();
      return NextResponse.json({ success: true, data: groupOrder });
    }

    // Close group order (host only)
    if (action === 'close') {
      if (!code) return NextResponse.json({ success: false, error: 'Code required' }, { status: 400 });
      const groupOrder = await GroupOrder.findOne({ code: code.toUpperCase() });
      if (!groupOrder) return NextResponse.json({ success: false, error: 'Group order not found' }, { status: 404 });
      if (groupOrder.hostUserId !== hostUserId) return NextResponse.json({ success: false, error: 'Only the host can close' }, { status: 403 });

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

    if (userId) {
      const groupOrders = await GroupOrder.find({ hostUserId: userId }).sort({ createdAt: -1 }).limit(10);
      return NextResponse.json({ success: true, data: groupOrders });
    }

    return NextResponse.json({ success: false, error: 'Query required' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
