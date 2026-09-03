// MuraStream — Ad-Free Proxy
// Simple approach: override isDemo=true so NexStream skips all ad logic

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'movie';
  const id = searchParams.get('id');
  const season = searchParams.get('season') || '1';
  const episode = searchParams.get('episode') || '1';
  const source = searchParams.get('source') || 'nexstream';

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const nexstreamKey = process.env.NEXTSTREAM_API_KEY || '';
  let embedUrl = '';

  switch (source) {
    case 'nexstream':
      if (!nexstreamKey) return NextResponse.json({ error: 'NexStream not configured' }, { status: 500 });
      embedUrl = type === 'movie'
        ? `https://api.codespecters.com/embed/movie/${id}?apikey=${nexstreamKey}`
        : `https://api.codespecters.com/embed/tv/${id}/${season}/${episode}?apikey=${nexstreamKey}`;
      break;
    case 'videasy':
      embedUrl = type === 'movie'
        ? `https://player.videasy.to/movie/${id}?overlay=true`
        : `https://player.videasy.to/tv/${id}/${season}/${episode}?overlay=true`;
      break;
    case 'vidsrc':
      embedUrl = type === 'movie'
        ? `https://vsembed.su/embed/movie/${id}`
        : `https://vsembed.su/embed/tv/${id}/${season}/${episode}`;
      break;
    case 'vidking':
      embedUrl = type === 'movie'
        ? `https://www.vidking.net/embed/movie/${id}?autoPlay=true`
        : `https://www.vidking.net/embed/tv/${id}/${season}/${episode}?autoPlay=true`;
      break;
    default:
      return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
  }

  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://muragoods.vercel.app/',
      },
    });

    if (!res.ok) {
      return new NextResponse(`Source returned ${res.status}`, { status: res.status });
    }

    let html = await res.text();

    // ── AD REMOVAL ──────────────────────────────────────────────────────
    // NexStream shows ads when isDemo = false. Force it to true = no ads.
    // This is the simplest and most reliable approach.
    html = html.replace(
      /const isDemo = _apiKey\.startsWith\('DEMO_'\);/,
      'const isDemo = true;'
    );

    // Also replace any isDemo check that might use real key detection
    html = html.replace(
      /if \(!isDemo\)\s*\{/,
      'if (false) { // ads disabled by proxy'
    );

    // Remove the popunder script block (second <script> tag with Adsterra)
    html = html.replace(
      /<script\s+type="text\/javascript">\s*\/\/\s*Adsterra[\s\S]*?<\/script>/,
      '<!-- ads removed -->'
    );

    // Inject CSS to hide any remaining ad overlays
    html = html.replace(
      '</head>',
      `<style>
        .ad-shield-play, #adblock-screen, [class*="ad-shield"],
        [id*="adblock"], .adblock-card { display:none!important; }
        #stream-frame, iframe, video { width:100%!important; height:100%!important; border:none!important; }
      </style></head>`
    );

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': 'frame-ancestors *;',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 500 });
  }
}
