import { NextResponse } from 'next/server';
import { getAvailableProviders } from '@/lib/email-providers';

export async function GET() {
  const providers = getAvailableProviders();
  return NextResponse.json({
    providers,
    count: providers.length,
    primary: providers[0] || 'none',
    message: providers.length > 0
      ? `Email sending active via ${providers.join(', ')}`
      : 'No email providers configured',
  });
}
