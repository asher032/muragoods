// Admin API — source report analytics + global provider toggle.
// GET  /api/admin/source-reports
//   → { providers: [{ id, broken, ads, total, score, titles, lastReportAt, disabled }],
//       recent: [ ...latest 25 raw reports ], disabledProviders: string[],
//       trend: [{ label, weekKey, broken, ads } × 8 weeks oldest→newest] }
// POST { provider, disabled } → set global enable/disable
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import SourceReport from '@/app/lib/models/SourceReport';
import ProviderConfig from '@/app/lib/models/ProviderConfig';

export const maxDuration = 15;

const PROVIDERS = ['vidlink', 'videasy', 'vidking', 'vidfast', '111movies', '2embed', 'multiembed'];

// Monday of the ISO week containing `d`, as a YYYY-MM-DD string.
// Matches Mongo's $ISOWeek bucketing ($ISOWeek on a date string uses the
// embedded date's week; we compare on the Monday 0:00 UTC of each week).
function weekStartKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7; // 0 = Monday
  t.setUTCDate(t.getUTCDate() - day);
  return t.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    await dbConnect();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [agg, recent, configs, trend] = await Promise.all([
      SourceReport.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { provider: '$provider', issue: '$issue' },
            count: { $sum: 1 },
            titles: { $addToSet: '$tmdbId' },
            last: { $max: '$createdAt' },
          },
        },
      ]),
      SourceReport.find({}).sort({ createdAt: -1 }).limit(25).select('-_id -__v').lean(),
      ProviderConfig.find({}).select('-_id -__v').lean(),
      // Weekly trend: reports bucketed into the last 8 weeks (Monday UTC),
      // per issue. $dateTrunc yields the week's Monday date so the keys match
      // weekStartKey() below exactly.
      SourceReport.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 56 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: {
              week: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: { $dateTrunc: { date: '$createdAt', unit: 'week', startOfWeek: 'monday' } },
                },
              },
            },
            broken: { $sum: { $cond: [{ $eq: ['$issue', 'broken'] }, 1, 0] } },
            ads: { $sum: { $cond: [{ $eq: ['$issue', 'ads'] }, 1, 0] } },
          },
        },
        { $sort: { '_id.week': 1 } },
      ]),
    ]);

    const byProvider: Record<string, { broken: number; ads: number; titles: Set<number>; last: Date | null }> = {};
    for (const row of agg as { _id: { provider: string; issue: string }; count: number; titles: number[]; last: Date }[]) {
      const p = row._id.provider;
      if (!byProvider[p]) byProvider[p] = { broken: 0, ads: 0, titles: new Set(), last: null };
      if (row._id.issue === 'broken') byProvider[p].broken += row.count;
      else byProvider[p].ads += row.count;
      row.titles.forEach(t => byProvider[p].titles.add(t));
      if (!byProvider[p].last || row.last > byProvider[p].last) byProvider[p].last = row.last;
    }

    const disabledProviders = configs.filter(c => c.disabled).map(c => c.provider);
    const providers = PROVIDERS.map(id => {
      const s = byProvider[id] || { broken: 0, ads: 0, titles: new Set<number>(), last: null };
      const total = s.broken + s.ads;
      return {
        id,
        broken: s.broken,
        ads: s.ads,
        total,
        titles: s.titles.size,
        score: total === 0 ? 1 : Math.max(0, 1 - (s.broken * 0.34 + s.ads * 0.2) / Math.max(1, s.titles.size)),
        lastReportAt: s.last,
        disabled: disabledProviders.includes(id),
      };
    }).sort((a, b) => a.score - b.score); // worst first

    // Normalize the trend into exactly 8 buckets (oldest → newest) so the
    // chart renders stable bars even for weeks with zero reports.
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const trendMap = new Map<string, { broken: number; ads: number }>();
    for (const row of trend as { _id: { week: string }; broken: number; ads: number }[]) {
      trendMap.set(row._id.week, { broken: row.broken, ads: row.ads });
    }
    const weeks: { label: string; weekKey: string; broken: number; ads: number }[] = [];
    const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    for (let i = 7; i >= 0; i--) {
      const d = new Date(Date.now() - i * weekMs);
      const weekKey = weekStartKey(d);
      const hit = trendMap.get(weekKey);
      weeks.push({ label: fmt.format(d), weekKey, broken: hit?.broken ?? 0, ads: hit?.ads ?? 0 });
    }

    return NextResponse.json(
      { providers, recent, disabledProviders, trend: weeks },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[Admin SourceReports GET]', error);
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const { provider, disabled } = (await request.json()) as { provider?: string; disabled?: boolean };
    if (!provider || typeof disabled !== 'boolean' || !PROVIDERS.includes(provider)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    await ProviderConfig.findOneAndUpdate(
      { provider },
      { provider, disabled, updatedAt: new Date() },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, provider, disabled });
  } catch (error) {
    console.error('[Admin SourceReports POST]', error);
    return NextResponse.json({ error: 'Failed to update provider' }, { status: 500 });
  }
}
