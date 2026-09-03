// MuraStream — Ad-Free Proxy (Fixed)
// Surgically removes ONLY ad code while keeping player logic intact

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

    // ── SURGICAL AD REMOVAL ─────────────────────────────────────────────
    // Instead of removing entire script blocks, remove ONLY the ad code within them

    // 1. Remove the Adsterra click-shield div creation and dismiss logic
    //    This is the block that creates the overlay and opens popup on click
    html = html.replace(
      /\/\/ =+[\s\S]*?ADSTERRA CLICK-SHIELD LOGIC[\s\S]*?=+\s*if\s*\(!isDemo\)\s*\{[\s\S]*?adShield\.addEventListener\('touchend'[\s\S]*?\}\s*\}/,
      '// ADS REMOVED BY PROXY'
    );

    // 2. Remove the Adsterra popunder script block (second <script> tag)
    html = html.replace(
      /<script\s+type="text\/javascript">\s*\/\/\s*Adsterra[\s\S]*?<\/script>/,
      '<!-- adsterra popunder removed -->'
    );

    // 3. Remove any remaining ad-related inline scripts
    html = html.replace(
      /<script[^>]*>[\s\S]*?adsterra[\s\S]*?<\/script>/gi,
      '<!-- ad script removed -->'
    );

    // 4. Remove the ad-shield-play CSS and adblock-screen CSS
    html = html.replace(/\/\* ── Ad Shield Play Button ── \*\/[\s\S]*?\.ad-shield-play::after\s*\{[^}]*\}/, '/* ad shield css removed */');
    html = html.replace(/\/\* ── Adblock Screen ── \*\/[\s\S]*?\.adblock-card\s*\{[^}]*\}/, '/* adblock css removed */');

    // 5. Remove ad bait elements (hidden divs that detect adblockers)
    html = html.replace(/bait\.className\s*=\s*'[^']*(?:adsbox|ad-placement|doubleclick)[^']*'/g, "bait.className = 'clean'");
    html = html.replace(/<div[^>]*class="[^"]*(?:adsbox|ad-placement|doubleclick|ad-banner)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

    // 6. Remove ad-block detection screen
    html = html.replace(/<div[^>]*id="adblock-screen"[^>]*>[\s\S]*?<\/div>/gi, '<!-- adblock screen removed -->');

    // 7. Inject CSS to hide any remaining ad elements
    const cleanCSS = `
      <style>
        [class*="ad-shield"], [id*="ad-shield"], [id*="adblock-screen"],
        [class*="adblock"], .ad-shield-play, #adblock-screen,
        [class*="adsbox"], [class*="ad-placement"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
        /* Ensure video player fills the container */
        #stream-frame, iframe, video {
          width: 100% !important;
          height: 100% !important;
          border: none !important;
        }
      </style>
    `;
    html = html.replace('</head>', cleanCSS + '</head>');

    // 8. Override isDemo to always skip ad logic (belt and suspenders)
    html = html.replace(
      'const isDemo = _apiKey.startsWith(\'DEMO_\');',
      'const isDemo = true; // Force ad-free via proxy'
    );

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 500 });
  }
}
