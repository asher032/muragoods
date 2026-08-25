import { NextResponse } from 'next/server';
import { getAvailableProviders, getEmailStats } from '@/lib/email-providers';

export async function GET() {
  const stats = getEmailStats();
  return NextResponse.json({
    providers: stats.providers,
    primary: stats.providers[0] || 'none',
    fallback: stats.providers[1] || 'none',
    dailyStats: {
      totalSentToday: stats.totalSentToday,
      resendRemaining: stats.resendRemaining,
      maxDaily: 90,
    },
    message: stats.providers.length > 0
      ? `Email active via ${stats.providers.join(' → ')} (${stats.resendRemaining} Resend emails left today)`
      : 'No email providers configured',
  });
}
