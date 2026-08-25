import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import { getAvailableProviders, getEmailStats } from '@/lib/email-providers';

async function checkDatabase(): Promise<{ status: string; latency: number }> {
  const start = Date.now();
  try {
    await dbConnect();
    return { status: 'online', latency: Date.now() - start };
  } catch {
    return { status: 'offline', latency: Date.now() - start };
  }
}

async function checkAPIs(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  // Check JARVIS API
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://muragoods.vercel.app'}/api/jarvis`);
    results.jarvis = res.ok ? 'online' : 'error';
  } catch { results.jarvis = 'offline'; }

  // Check Products API
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://muragoods.vercel.app'}/api/products`);
    results.products = res.ok ? 'online' : 'error';
  } catch { results.products = 'offline'; }

  // Check Explore API
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://muragoods.vercel.app'}/api/untold-words/explore`);
    results.explore = res.ok ? 'online' : 'error';
  } catch { results.explore = 'offline'; }

  // Check Deezer (music search)
  try {
    const res = await fetch('https://api.deezer.com/search?q=test&limit=1');
    results.deezer = res.ok ? 'online' : 'error';
  } catch { results.deezer = 'offline'; }

  return results;
}

export async function GET() {
  const startTime = Date.now();

  // Run all checks in parallel
  const [db, apis] = await Promise.all([checkDatabase(), checkAPIs()]);

  const emailProviders = getAvailableProviders();
  const emailStats = getEmailStats();

  const allApiOnline = Object.values(apis).every(v => v === 'online');
  const overallStatus = db.status === 'online' && allApiOnline ? 'healthy' : 'degraded';

  const healthScore = (() => {
    let score = 0;
    if (db.status === 'online') score += 30;
    const apiCount = Object.keys(apis).length;
    const apiOnline = Object.values(apis).filter(v => v === 'online').length;
    score += (apiOnline / Math.max(apiCount, 1)) * 40;
    if (emailProviders.length > 0) score += 20;
    if (emailProviders.length > 1) score += 10;
    return Math.round(score);
  })();

  return NextResponse.json({
    success: true,
    data: {
      status: overallStatus,
      healthScore,
      timestamp: new Date().toISOString(),
      uptime: `Server responded in ${Date.now() - startTime}ms`,
      systems: {
        database: {
          status: db.status,
          latency: `${db.latency}ms`,
          provider: 'MongoDB',
        },
        frontend: {
          status: 'online',
          url: 'https://muragoods.vercel.app',
          platform: 'Vercel',
        },
        apis,
        email: {
          providers: emailProviders,
          primary: emailProviders[0] || 'none',
          fallback: emailProviders[1] || 'none',
          dailyStats: emailStats,
        },
        ai: {
          status: 'online',
          type: 'Built-in NLU',
          provider: 'JARVIS v2.0',
        },
        music: {
          status: apis.deezer || 'offline',
          provider: 'Deezer',
          note: 'Free, unlimited search + 30s previews',
        },
      },
      deployment: {
        platform: 'Vercel',
        framework: 'Next.js',
        status: 'deployed',
        url: 'https://muragoods.vercel.app',
      },
    },
  });
}
