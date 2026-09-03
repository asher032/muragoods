// MuraStream — Ad-Stripping Proxy with URL Rewriting
// Fetches streaming embed pages, rewrites relative URLs to absolute,
// injects <base> tag so client-side routing works, removes ad code

import { NextRequest, NextResponse } from 'next/server';

// Ad domain patterns to strip
const AD_SCRIPT_PATTERNS = [
  /llvpn\.com/gi,
  /adsterra/gi,
  /zvigrat/gi,
  /zvaufrpq/gi,
  /superextraextra/gi,
  /nviqolho/gi,
  /t7cpbtd/gi,
  /histats\.com/gi,
];

// Source base URLs for rewriting relative URLs + base tag
const SOURCE_CONFIG: Record<string, { origin: string; embedPath: string }> = {
  vidsrc: { origin: 'https://vsembed.ru', embedPath: '' },
  vidking: { origin: 'https://www.vidking.net', embedPath: '' },
  videasy: { origin: 'https://player.videasy.to', embedPath: '' },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'movie';
  const id = searchParams.get('id');
  const season = searchParams.get('season') || '1';
  const episode = searchParams.get('episode') || '1';
  const source = searchParams.get('source') || 'vidking';

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const config = SOURCE_CONFIG[source];
  if (!config) {
    return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
  }

  // Build the direct embed URL for fetching
  let embedUrl = '';
  switch (source) {
    case 'vidsrc':
      embedUrl = type === 'movie'
        ? `https://vidsrc.to/embed/movie/${id}`
        : `https://vidsrc.to/embed/tv/${id}/${season}/${episode}`;
      break;
    case 'vidking':
      embedUrl = type === 'movie'
        ? `https://www.vidking.net/embed/movie/${id}`
        : `https://www.vidking.net/embed/tv/${id}/${season}/${episode}`;
      break;
    case 'videasy':
      embedUrl = type === 'movie'
        ? `https://player.videasy.to/movie/${id}`
        : `https://player.videasy.to/tv/${id}/${season}/${episode}`;
      break;
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
    const { origin } = config;

    // ═══════════════════════════════════════════════════════════════
    // 1. INJECT <base> TAG — Makes client-side router think it's
    //    on the original domain. This fixes the white screen issue.
    //    Also fixes all relative URL resolution.
    // ═══════════════════════════════════════════════════════════════
    html = html.replace(
      '<head>',
      `<head><base href="${origin}/">`
    );

    // ═══════════════════════════════════════════════════════════════
    // 2. REWRITE PROTOCOL-RELATIVE URLS (//example.com → https://example.com)
    // ═══════════════════════════════════════════════════════════════
    html = html.replace(/src="\/\//g, 'src="https://');
    html = html.replace(/href="\/\//g, 'href="https://');
    html = html.replace(/url\(\/\//g, 'url(https://');

    // ═══════════════════════════════════════════════════════════════
    // 3. SURGICAL AD REMOVAL
    // ═══════════════════════════════════════════════════════════════

    // Remove ad script tags
    for (const pattern of AD_SCRIPT_PATTERNS) {
      const source = pattern.source;
      // Remove <script> tags with ad domain in content
      html = html.replace(
        new RegExp(`<script[^>]*>[\\s\\S]*?${source}[\\s\\S]*?<\\/script>`, 'gi'),
        '<!-- ad removed -->'
      );
      // Remove <script src="...adomain..."> tags
      html = html.replace(
        new RegExp(`<script[^>]*src=["'][^"']*${source}[^"']*["'][^>]*>[\\s\\S]*?<\\/script>`, 'gi'),
        '<!-- ad removed -->'
      );
      html = html.replace(
        new RegExp(`<script[^>]*src=["'][^"']*${source}[^"']*["'][^>]*/>`, 'gi'),
        '<!-- ad removed -->'
      );
    }

    // Remove the specific inline llvpn ad pattern from VidSrc
    html = html.replace(
      /<script>\s*\(function\(s\)\{s\.dataset\.zone/gi,
      '<!-- ad removed'
    );

    // Remove histats tracking
    html = html.replace(
      /<img[^>]*src=["'][^"']*histats\.com[^"']*["'][^>]*\/?>/gi,
      '<!-- tracking removed -->'
    );

    // ═══════════════════════════════════════════════════════════════
    // 4. DISABLE ADS + POPUP BLOCKER
    // ═══════════════════════════════════════════════════════════════

    // For VidKing: disable ads via sessionStorage before any scripts run
    if (source === 'vidking') {
      html = html.replace(
        '<head><base',
        `<head><script>try{window.sessionStorage.setItem("adsEnabled","false")}catch(e){}</script><base`
      );
    }

    // Inject popup blocker and ad overlay hider
    html = html.replace(
      '</head>',
      `<script>
        (function(){
          var _o=window.open;
          window.open=function(u,t,f){
            if(typeof u==='string'&&(u.indexOf('llvpn')>-1||u.indexOf('adsterra')>-1||u.indexOf('zvigrat')>-1||u.indexOf('superextra')>-1||u.indexOf('clickunder')>-1||u.indexOf('popunder')>-1||u.indexOf('nviqolho')>-1||u.indexOf('t7cpbtd')>-1)){
              return null;
            }
            return _o?_o.call(window,u,t,f):null;
          };
        })();
      </script>
      <style>
        [class*="ad-shield"],[id*="adblock"],.adblock-card,
        [class*="popunder"],[class*="ad-overlay"],[data-cfasync]{
          display:none!important;pointer-events:none!important;
        }
      </style>
      </head>`
    );

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': "frame-ancestors *;",
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 500 });
  }
}
