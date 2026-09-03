// MuraStream — Ad-Free Proxy
// Fetches streaming embed HTML and strips ALL ad scripts (Adsterra, popunders, click shields)
// before serving to the user. This ensures zero ads in the player.

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

  // Build the original embed URL
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
    // Fetch the original embed HTML
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

    // ── AD STRIPPING ──────────────────────────────────────────────────────
    // Remove Adsterra scripts and popunders
    html = html.replace(/<script[^>]*>[\s\S]*?adsterra[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
    html = html.replace(/<script[^>]*>[\s\S]*?popunder[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
    html = html.replace(/<script[^>]*>[\s\S]*?clickunder[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
    html = html.replace(/<script[^>]*>[\s\S]*?exoclick[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
    html = html.replace(/<script[^>]*>[\s\S]*?propeller[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
    html = html.replace(/<script[^>]*>[\s\S]*?hilltop[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
    html = html.replace(/<script[^>]*>[\s\S]*?monetag[\s\S]*?<\/script>/gi, '<!-- ad removed -->');
    html = html.replace(/<script[^>]*>[\s\S]*?adsterra[\s\S]*?<\/script>/gi, '<!-- ad removed -->');

    // Remove ad-related script blocks by content patterns
    html = html.replace(/<script[^>]*>[\s\S]*?(window\.open\(ad|adUrl|adShield|adshield|ad-shield|ADSTERRA|CLICK-SHIELD)[\s\S]*?<\/script>/gi, '<!-- ad shield removed -->');

    // Remove ad containers/divs
    html = html.replace(/<div[^>]*class="[^"]*(?:ad|banner|sponsor|popup)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '<!-- ad div removed -->');
    html = html.replace(/<div[^>]*id="[^"]*(?:ad|banner|sponsor|popup)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '<!-- ad div removed -->');

    // Remove ad-related CSS (adblock screens, ad shields)
    html = html.replace(/#adblock-screen[\s\S]*?\}/g, '#adblock-screen { display: none !important; }');
    html = html.replace(/\.ad-shield[\s\S]*?\}/g, '.ad-shield { display: none !important; }');
    html = html.replace(/#ad-shield[\s\S]*?\}/g, '#ad-shield { display: none !important; }');

    // Remove bait/anti-adblock elements
    html = html.replace(/<div[^>]*class="[^"]*(?:adsbox|ad-placement|doubleclick|ad-banner)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

    // Inject our own clean CSS to hide any remaining ad elements
    const cleanCSS = `
      <style>
        /* Hide all ad-related elements */
        [class*="ad-"], [class*="ad_"], [id*="ad-"], [id*="ad_"],
        [class*="banner"], [class*="sponsor"], [class*="popup"],
        [class*="overlay-ad"], [class*="click-shield"],
        .ad-shield-play, #adblock-screen, .adblock-card,
        [class*="adsbox"], [class*="ad-placement"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          position: absolute !important;
          left: -9999px !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
        }
        /* Ensure the actual video player is visible and full-size */
        iframe, video, .player, #player, #stream-frame {
          width: 100% !important;
          height: 100% !important;
          position: relative !important;
          z-index: 9999 !important;
        }
        /* Override any ad-block detection */
        body::after { display: none !important; }
      </style>
    `;
    html = html.replace('</head>', cleanCSS + '</head>');

    // Remove any script that tries to detect ad blockers
    html = html.replace(/<script[^>]*>[\s\S]*?(adblock|ad-blocker|adBlockDetect|blocker-detected)[\s\S]*?<\/script>/gi, '<!-- adblock detection removed -->');

    // Remove onclick handlers that open new windows (popups)
    html = html.replace(/onclick="[^"]*window\.open[^"]*"/gi, 'onclick="event.preventDefault()"');
    html = html.replace(/onclick="[^"]*open\([^"]*'_blank'[^"]*\)"/gi, 'onclick="event.preventDefault()"');

    // Serve the cleaned HTML
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'ALLOWALL',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 500 });
  }
}
