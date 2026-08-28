import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import SupportTicket from '@/app/lib/models/SupportTicket';
import { adminEmails } from '@/app/lib/muragoods-data';

// Auto-reply keywords and responses
const autoReplies: Record<string, string> = {
  'order': '📋 **Order Issue Detected**\n\nWe see you have a question about your order. Here are common solutions:\n\n• **Order not showing?** Check your email and refresh the page.\n• **Payment issue?** Send your GCash reference number to @muragoods_ on Instagram.\n• **Late delivery?** Delivery times are typically within the selected time slot.\n\nAn admin will review your ticket shortly!',
  'payment': '💳 **Payment Issue Detected**\n\nFor payment-related concerns:\n\n• **GCash payment not verified?** Please send your reference number and screenshot to @muragoods_ on Instagram.\n• **Wrong amount?** Contact us with your order number.\n• **Refund request?** Refunds are processed within 24-48 hours.\n\nAn admin will respond soon!',
  'cancel': '❌ **Cancellation Request**\n\nTo cancel your order:\n\n• You can cancel before the order is marked as "Payment Verified"\n• Go to your order page and click the cancel button\n• If already verified, contact us on Instagram @muragoods_\n\nAn admin will assist you shortly!',
  'delivery': '🚚 **Delivery Question**\n\n• **DWCL Pickup:** Free, available during store hours\n• **Daraga/Legazpi:** ₱30 delivery fee, free on orders ₱200+\n• **Custom:** Message @muragoods_ on Instagram for arrangements\n\nAn admin will respond soon!',
  'points': '🪙 **Points Question**\n\n• Points are earned at ₱1 = 0.5 points\n• Points are awarded when order status changes to "Delivered"\n• You can redeem points in the Rewards Shop\n• Check your profile for current balance\n\nAn admin will verify your points shortly!',
  'refund': '💰 **Refund Request**\n\nRefund processing:\n\n• Refunds are reviewed within 24-48 hours\n• Refunds go back to the original payment method\n• GCash refunds are sent to your registered number\n\nAn admin will process your request shortly!',
  'account': '👤 **Account Issue**\n\nFor account-related help:\n\n• **Forgot password?** Use the "Forgot Password" link on the login page\n• **Change profile picture?** Go to your profile page\n\nAn admin will assist you if needed!',
  'feedback': '💬 **Feedback Received**\n\nThank you for your feedback! We value your input and it helps us improve MuraGoods.\n\n• Suggestions are reviewed by our team\n• Feature requests are prioritized based on demand\n\nAn admin may follow up with you!',
  'bug': '🐛 **Bug Report**\n\nThank you for reporting this issue!\n\n• Please describe what happened in detail\n• Include screenshots if possible\n• Mention what device/browser you\'re using\n\nOur team will investigate and fix it!',
};

function getAutoReply(message: string): string | null {
  const lower = message.toLowerCase();
  for (const [keyword, reply] of Object.entries(autoReplies)) {
    if (lower.includes(keyword)) return reply;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    await dbConnect();
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const isAdmin = url.searchParams.get('isAdmin') === 'true';
    const ticketId = url.searchParams.get('id');

    // Get specific ticket
    if (ticketId) {
      const ticket = await SupportTicket.findById(ticketId);
      if (!ticket) return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 });
      return NextResponse.json({ success: true, data: ticket });
    }

    // Admin sees all tickets
    if (isAdmin) {
      const tickets = await SupportTicket.find({}).sort({ lastActivity: -1 });
      return NextResponse.json({ success: true, data: tickets });
    }

    // User sees their own tickets
    if (userId) {
      const tickets = await SupportTicket.find({ userId }).sort({ lastActivity: -1 });
      return NextResponse.json({ success: true, data: tickets });
    }

    return NextResponse.json({ success: false, error: 'userId or isAdmin required' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await dbConnect();
    const body = await req.json();
    const { action, userId, userName, subject, category, text, ticketId, senderName } = body;

    // Create new ticket
    if (action === 'create') {
      const ticket = await SupportTicket.create({
        userId,
        userName,
        subject: subject || 'Support Request',
        category: category || 'General',
        messages: [{ sender: 'user', senderName: userName, text }],
        lastActivity: new Date(),
      });

      // Auto-reply
      const autoReplyText = getAutoReply(text);
      if (autoReplyText) {
        ticket.messages.push({
          sender: 'admin',
          senderName: 'MuraGoods Bot',
          text: autoReplyText,
          timestamp: new Date(),
          isAutoReply: true,
        });
        ticket.lastActivity = new Date();
        await ticket.save();
      }

      return NextResponse.json({ success: true, data: ticket });
    }

    // Send message to existing ticket
    if (action === 'message') {
      const ticket = await SupportTicket.findById(ticketId);
      if (!ticket) return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 });

      const isAdminSender = adminEmails.includes(userId || '');
      ticket.messages.push({
        sender: isAdminSender ? 'admin' : 'user',
        senderName: senderName || (isAdminSender ? 'Admin' : ticket.userName),
        text,
        timestamp: new Date(),
      });
      ticket.lastActivity = new Date();
      ticket.status = isAdminSender ? 'replied' : 'open';
      await ticket.save();

      return NextResponse.json({ success: true, data: ticket });
    }

    // Close ticket
    if (action === 'close') {
      const ticket = await SupportTicket.findById(ticketId);
      if (!ticket) return NextResponse.json({ success: false, error: 'Ticket not found' }, { status: 404 });
      ticket.status = 'closed';
      ticket.lastActivity = new Date();
      await ticket.save();
      return NextResponse.json({ success: true, data: ticket });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An error occurred';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
