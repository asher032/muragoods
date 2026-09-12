// Public provider config — players fetch the globally-disabled provider list.
// Intentionally minimal (no report data leaks here).
import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import ProviderConfig from '@/app/lib/models/ProviderConfig';

export const maxDuration = 15;

export async function GET() {
  try {
    await dbConnect();
    const disabled = await ProviderConfig.find({ disabled: true }).select('provider -_id').lean();
    return NextResponse.json(
      { disabled: (disabled as { provider: string }[]).map(d => d.provider) },
      { headers: { 'Cache-Control': 'public, max-age=120' } }
    );
  } catch (error) {
    console.error('[ProviderConfig GET]', error);
    return NextResponse.json({ disabled: [] }, { status: 200 });
  }
}
