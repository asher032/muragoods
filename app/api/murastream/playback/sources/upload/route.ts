import { NextResponse } from 'next/server';
import { requireStaff } from '@/app/lib/access-control';
import { adapterFor } from '@/app/lib/murastream/playback/providers';
import { storeStatus } from '@/app/lib/murastream/playback/store';
import type { ProviderSourceType } from '@/app/lib/murastream/playback/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Staff-only media ingest.
//
//   POST { sourceType, corsOrigin?, playbackPolicy? }  -> a one-time upload URL
//
// Why this is a server route and not a browser call: minting a direct upload
// requires the provider's API credential. That credential is read from the
// environment here and never leaves the server. What comes back to the admin
// is a SINGLE-USE, short-lived upload URL scoped to one file — not the
// credential, and not a general-purpose key.
//
// This route hands out a place to PUT a file. It does not decide rights: an
// uploaded asset still has to be registered in the source registry with its
// licence and evidence before the rights gate will let it play.

const noStore = { 'Cache-Control': 'no-store' } as const;

export async function POST(req: Request) {
  const guard = await requireStaff(req, ['murastream']);
  if (!guard.ok) return guard.response;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400, headers: noStore });
  }

  const sourceType = String(body.sourceType ?? '') as ProviderSourceType;
  const adapter = adapterFor(sourceType);

  if (typeof adapter.createUpload !== 'function') {
    return NextResponse.json({
      success: false,
      error: 'This provider does not accept direct uploads. Register the asset through its own dashboard and add the playback id to the source registry.',
    }, { status: 409, headers: noStore });
  }

  const corsOrigin = typeof body.corsOrigin === 'string' ? body.corsOrigin.slice(0, 200) : null;
  // Anything other than an explicit "public" request stays signed.
  const playbackPolicy = body.playbackPolicy === 'public' ? 'public' : 'signed';

  const upload = await adapter.createUpload({ corsOrigin, playbackPolicy });

  if (!upload) {
    return NextResponse.json({
      success: false,
      error: `Could not create an upload target for ${sourceType}. The provider may be unconfigured or unreachable.`,
      store: await storeStatus(),
    }, { status: 502, headers: noStore });
  }

  return NextResponse.json({
    success: true,
    upload,
    note: 'This URL is single-use and expires. Upload the file, wait for the asset to finish processing, then register its playback id with its licence and evidence URL.',
  }, { status: 201, headers: noStore });
}