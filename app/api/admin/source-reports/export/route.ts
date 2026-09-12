// Admin CSV export of raw source reports.
// GET /api/admin/source-reports/export → text/csv attachment.
import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import SourceReport from '@/app/lib/models/SourceReport';

export const maxDuration = 15;

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Quote when the value contains CSV structure characters.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  try {
    await dbConnect();
    const reports = await SourceReport.find({})
      .sort({ createdAt: -1 })
      .limit(5000)
      .select('mediaType tmdbId season episode provider issue email createdAt -_id')
      .lean();

    const header = 'mediaType,tmdbId,season,episode,provider,issue,email,createdAt';
    const rows = reports.map(r =>
      [
        r.mediaType, r.tmdbId, r.season, r.episode,
        r.provider, r.issue, r.email,
        r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      ].map(csvCell).join(',')
    );

    const csv = [header, ...rows].join('\r\n');
    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="murastream-source-reports-${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[SourceReports Export]', error);
    return NextResponse.json({ error: 'Failed to export reports' }, { status: 500 });
  }
}
