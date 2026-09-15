import { NextResponse } from 'next/server';
import { sendLetterEmail } from '@/lib/email';
import { rateLimit, clientIp } from '@/app/lib/rate-limit';

// Letter-email route. Email sending is an abuse vector (spam relay), so it
// gets layered limits: per-sender burst, per-IP hourly, and strict input
// validation on every field.

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const { recipientEmail, letterUrl, senderName, recipientName } = await req.json();

    if (!recipientEmail || !letterUrl) {
      return NextResponse.json({ success: false, error: 'Recipient email and letter URL are required' }, { status: 400 });
    }

    if (!emailRegex.test(recipientEmail)) {
      return NextResponse.json({ success: false, error: 'Please enter a valid email address' }, { status: 400 });
    }

    // letterUrl must be an internal path or an https URL on our own site —
    // never an attacker-chosen absolute URL that leaks the button click or
    // phishes from our domain.
    if (typeof letterUrl === 'string') {
      if (letterUrl.startsWith('/')) {
        if (letterUrl.startsWith('//') || letterUrl.length > 500) {
          return NextResponse.json({ success: false, error: 'Invalid letter link' }, { status: 400 });
        }
      } else {
        try {
          const u = new URL(letterUrl);
          if (u.protocol !== 'https:' || !u.hostname.endsWith('muragoods.vercel.app')) {
            return NextResponse.json({ success: false, error: 'Invalid letter link' }, { status: 400 });
          }
        } catch {
          return NextResponse.json({ success: false, error: 'Invalid letter link' }, { status: 400 });
        }
      }
    } else {
      return NextResponse.json({ success: false, error: 'Invalid letter link' }, { status: 400 });
    }

    // Names become email content — cap length, strip control characters.
    const cleanSender = String(senderName || 'Anonymous').replace(/[\u0000-\u001f<>]/g, '').slice(0, 60) || 'Anonymous';
    const cleanRecipient = String(recipientName || 'someone special').replace(/[\u0000-\u001f<>]/g, '').slice(0, 60) || 'someone special';

    // Layered rate limits: 5 per recipient per hour, 3 per minute per IP,
    // 20 per hour per IP.
    const perRcpt = rateLimit(`letter:rcpt:${recipientEmail.toLowerCase()}`, 5, 60 * 60_000);
    if (!perRcpt.ok) {
      return NextResponse.json({ success: false, error: 'This recipient got too many letters recently — try later.' }, { status: 429 });
    }
    const burst = rateLimit(`letter:ip:${clientIp(req)}`, 3, 60_000);
    if (!burst.ok) {
      return NextResponse.json({ success: false, error: 'Sending too fast — wait a moment.' }, { status: 429 });
    }
    const hourly = rateLimit(`letter:ipH:${clientIp(req)}`, 20, 60 * 60_000);
    if (!hourly.ok) {
      return NextResponse.json({ success: false, error: 'Hourly email limit reached.' }, { status: 429 });
    }

    const sent = await sendLetterEmail(
      recipientEmail,
      letterUrl,
      cleanSender,
      cleanRecipient,
    );

    if (!sent) {
      return NextResponse.json({ success: false, error: 'Failed to send email. Please try again or copy the link instead.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Letter sent successfully!' });
  } catch {
    console.error('[untold-words/send-email] failed');
    return NextResponse.json({ success: false, error: 'Failed to send email' }, { status: 500 });
  }
}
