import { NextResponse } from 'next/server';
import { sendLetterEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { recipientEmail, letterUrl, senderName, recipientName } = await req.json();

    if (!recipientEmail || !letterUrl) {
      return NextResponse.json({ success: false, error: 'Recipient email and letter URL are required' }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      return NextResponse.json({ success: false, error: 'Please enter a valid email address' }, { status: 400 });
    }

    // Rate limit: max 5 emails per recipient per hour
    // (simple in-memory check — for production use Redis)
    const sent = await sendLetterEmail(
      recipientEmail,
      letterUrl,
      senderName || 'Anonymous',
      recipientName || 'someone special'
    );

    if (!sent) {
      return NextResponse.json({ success: false, error: 'Failed to send email. Please try again or copy the link instead.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Letter sent successfully!' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send email';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
