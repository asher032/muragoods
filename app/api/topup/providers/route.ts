import { NextResponse } from 'next/server';
import { getProviderStatus } from '@/app/lib/topup-providers';

export async function GET() {
  const status = getProviderStatus();
  return NextResponse.json({ success: true, data: status });
}
