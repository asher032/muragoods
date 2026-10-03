import { NextResponse } from 'next/server';
import { requireStaff } from '@/app/lib/access-control';
import { upsertSource } from '@/app/lib/murastream/playback/store';
import { allAdapters } from '@/app/lib/murastream/playback/providers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/murastream/playback/sources/import
//
//   { sources: [ { tmdbId, imdbId, mediaType, season, episode, title,
//                  sourceType, provider, playbackUrl, mimeType,
//                  authorizationStatus, enabled, expiresAt } ], replace?: false }
//
// A JSON array, or a CSV file with a header row using the same column names.
//
// Every row is validated independently and classified. Nothing is imported
// silently: a row that fails validation, collides with an existing source, or
// names an expired/unverified grant is reported back by row number and
// reason. `replace` defaults to false, so an import can never overwrite a
// working source unless the operator asks for it explicitly.
//
// Provider credentials are NOT part of the format and are never accepted.

const noStore = { 'Cache-Control': 'no-store' } as const;
const MAX_ROWS = 2000;
const KNOWN_RIGHTS = ['PUBLIC_DOMAIN', 'CC_BY', 'CC_BY_SA', 'MURAGOODS_OWNED', 'LICENSED', 'UNVERIFIED'] as const;

type RowOutcome = {
  row: number;
  tmdbId: unknown;
  result: 'imported' | 'invalid' | 'duplicate' | 'expired' | 'unauthorized' | 'store_unavailable'
    | 'unverified' | 'missing_rights_evidence' | 'invalid_license';
  detail?: unknown;
};

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    // Simple CSV field split; quoted fields with embedded commas are not
    // supported and a row containing them fails validation downstream rather
    // than being silently mis-parsed.
    const cells = line.split(',').map((c) => c.trim());
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

export async function POST(req: Request) {
  const guard = await requireStaff(req, ['murastream']);
  if (!guard.ok) return guard.response;

  let rows: Array<Record<string, unknown>> = [];
  let replace = false;

  try {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('text/csv')) {
      const text = await req.text();
      rows = parseCsv(text);
    } else {
      const body = await req.json() as { sources?: Array<Record<string, unknown>>; replace?: boolean };
      rows = Array.isArray(body.sources) ? body.sources : [];
      replace = body.replace === true;
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Could not parse the import payload' }, { status: 400, headers: noStore });
  }

  if (!rows.length) {
    return NextResponse.json({ success: false, error: 'No rows supplied' }, { status: 400, headers: noStore });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ success: false, error: `Too many rows (${rows.length}); the limit is ${MAX_ROWS}` }, { status: 413, headers: noStore });
  }

  const outcomes: RowOutcome[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] as Record<string, unknown>;
    const rowNo = i + 1;

    // A row that names an expiry already in the past is reported rather than
    // imported: it would register a dead source that looks registered.
    const expiresRaw = raw.expiresAt ? String(raw.expiresAt) : '';
    if (expiresRaw) {
      const parsed = new Date(expiresRaw);
      if (Number.isNaN(parsed.getTime())) {
        outcomes.push({ row: rowNo, tmdbId: raw.tmdbId ?? null, result: 'invalid', detail: [{ field: 'expiresAt', message: 'not a valid date' }] });
        continue;
      }
      if (parsed.getTime() <= Date.now()) {
        outcomes.push({ row: rowNo, tmdbId: raw.tmdbId ?? null, result: 'expired', detail: 'expiresAt is in the past' });
        continue;
      }
    }

    // ── Rights must be establishable, or the row is refused ────────────
    // An item is only importable when the import states WHICH licence applies
    // to THIS item and where that licence is evidenced. A collection-level
    // assumption is not evidence, and neither is the file being online.
    const rightsStatus = String(raw.rightsStatus ?? 'UNVERIFIED');
    const evidenceUrl = String(raw.rightsSourceUrl ?? '').trim();
    const licenseType = String(raw.licenseType ?? '').trim();

    if (!KNOWN_RIGHTS.includes(rightsStatus as (typeof KNOWN_RIGHTS)[number])) {
      outcomes.push({ row: rowNo, tmdbId: raw.tmdbId ?? null, result: 'invalid_license', detail: `rightsStatus "${rightsStatus}" is not a recognised rights status` });
      continue;
    }
    if (rightsStatus === 'UNVERIFIED') {
      outcomes.push({ row: rowNo, tmdbId: raw.tmdbId ?? null, result: 'unverified', detail: 'rightsStatus is UNVERIFIED; import it only to keep it in the audit queue — it will NOT be playable' });
      continue;
    }
    if (!evidenceUrl) {
      outcomes.push({ row: rowNo, tmdbId: raw.tmdbId ?? null, result: 'missing_rights_evidence', detail: 'rightsSourceUrl is required: the page that evidences this item own licence' });
      continue;
    }
    if (!licenseType) {
      outcomes.push({ row: rowNo, tmdbId: raw.tmdbId ?? null, result: 'invalid_license', detail: 'licenseType is required when a playable licence is claimed' });
      continue;
    }

    const authStatus = String(raw.authorizationStatus ?? 'pending');
    if (authStatus === 'unverified') {
      outcomes.push({ row: rowNo, tmdbId: raw.tmdbId ?? null, result: 'unauthorized', detail: 'authorizationStatus is "unverified"; supply a verified licence record to register this source' });
      continue;
    }

    const outcome = await upsertSource(raw, { replace });
    if (outcome.result === 'imported') outcomes.push({ row: rowNo, tmdbId: outcome.record.tmdbId, result: 'imported' });
    else if (outcome.result === 'invalid') outcomes.push({ row: rowNo, tmdbId: raw.tmdbId ?? null, result: 'invalid', detail: outcome.errors });
    else if (outcome.result === 'duplicate') outcomes.push({ row: rowNo, tmdbId: raw.tmdbId ?? null, result: 'duplicate', detail: 'a source already exists for this address; send replace:true to overwrite' });
    else outcomes.push({ row: rowNo, tmdbId: raw.tmdbId ?? null, result: 'store_unavailable', detail: outcome.detail });
  }

  const tally = outcomes.reduce<Record<string, number>>((acc, o) => {
    acc[o.result] = (acc[o.result] ?? 0) + 1;
    return acc;
  }, {});

  // Which providers could actually serve what was imported, by state only.
  const providers = [];
  for (const adapter of allAdapters()) providers.push(await adapter.healthCheck());

  return NextResponse.json({
    success: true,
    total: outcomes.length,
    imported: tally.imported ?? 0,
    invalid: tally.invalid ?? 0,
    duplicate: tally.duplicate ?? 0,
    expired: tally.expired ?? 0,
    unauthorized: tally.unauthorized ?? 0,
    // Reported separately so "nothing playable came in" is never mistaken for
    // "nothing came in".
    unverified: tally.unverified ?? 0,
    missingRightsEvidence: tally.missing_rights_evidence ?? 0,
    invalidLicense: tally.invalid_license ?? 0,
    storeUnavailable: tally.store_unavailable ?? 0,
    rows: outcomes,
    providers,
  }, { headers: noStore });
}