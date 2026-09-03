// MuraStream — Ad-Stripping Proxy with URL Rewriting
// Fetches streaming embed pages, rewrites relative URLs to absolute,
// removes ad code, and serves clean HTML with proper iframe headers

import { NextRequest, NextResponse } from 'next/server';

// Ad domain patterns to strip
const AD_SCRIPT_PATTERNS = [
  /llvpn\.com/gi,
  /adsterra/gi,
  /zvigrat/gi,
  /zvaufrpq/gi,
  /superextraextra/gi,
  /nviqolho/gi,
  /t7cpbtd6/gi,
  /histats\.com/gi,
];

// Source base URLs for rewriting relative URLs
const SOURCE_ORIGINS: Record<string, string> = {
  vidsrc: 'https://vsembed.ru',
  vidking: 'https://www.vidking.net',
  videasy: 'https://player.videasy.to',
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

  // Build the direct embed URL
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
    default:
      return NextResponse.json({ error: 'Unknown source' }, { status: 400 });
  }

  const origin = SOURCE_ORIGINS[source] || '';

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

    // ═══════════════════════════════════════════════════════════════
    // 1. REWRITE RELATIVE URLs → ABSOLUTE URLs
    //    This is critical — without it, the browser tries to load
    //    /assets/player.js from muragoods.vercel.app instead of vidking.net
    // ═══════════════════════════════════════════════════════════════

    if (origin) {
      // Rewrite src="..." for scripts, iframes, images, links
      html = html.replace(
        /src="\/(?!\/)/g,
        `src="${origin}/`
      );
      // Rewrite href="..." for stylesheets, manifests, etc.
      html = html.replace(
        /href="\/(?!\/)/g,
        `href="${origin}/`
      );
      // Rewrite url('...') in inline styles
      html = html.replace(
        /url\(['"]\/(?!\/)/g,
        `url('${origin}/`
      );
      // Rewrite // protocol-relative URLs (they need https:)
      html = html.replace(
        /src="\/\//g,
        `src="https://`
      );
      html = html.replace(
        /href="\/\//g,
        `href="https://`
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. SURGICAL AD REMOVAL
    // ═══════════════════════════════════════════════════════════════

    // Remove ad script tags (llvpn, adsterra, etc.)
    for (const pattern of AD_SCRIPT_PATTERNS) {
      // Remove <script> tags that contain ad domain references
      const scriptRegex = new RegExp(
        `<script[^>]*>[\\s\\S]*?${pattern.source}[\\s\\S]*?<\\/script>`,
        'gi'
      );
      html = html.replace(scriptRegex, '<!-- ad script removed -->');

      // Remove <script src="...adomain..."> tags
      const srcRegex = new RegExp(
        `<script[^>]*src=["'][^"']*${pattern.source}[^"']*["'][^>]*>[\\s\\S]*?<\\/script>`,
        'gi'
      );
      html = html.replace(srcRegex, '<!-- ad script removed -->');

      // Also handle self-closing: <script src="..." />
      const selfCloseRegex = new RegExp(
        `<script[^>]*src=["'][^"']*${pattern.source}[^"']*["'][^>]*/>`,
        'gi'
      );
      html = html.replace(selfCloseRegex, '<!-- ad script removed -->');
    }

    // Remove the specific inline llvpn ad pattern from VidSrc
    html = html.replace(
      /<script>\s*\(function\(s\)\{s\.dataset\.zone=['"]\d+['"],s\.src=['"][^'"]*(?:llvpn|adsterra|zvigrat)[^'"]*['"]/gi,
      '<!-- ad script removed -->'
    );

    // Remove histats tracking pixel
    html = html.replace(
      /<img[^>]*src=["'][^"']*histats\.com[^"']*["'][^>]*\/?>/gi,
      '<!-- tracking removed -->'
    );

    // ═══════════════════════════════════════════════════════════════
    // 3. INJECT AD-BLOCKING SAFETY NET
    // ═══════════════════════════════════════════════════════════════

    // For VidKing: disable ads via sessionStorage
    if (source === 'vidking') {
      html = html.replace(
        '<head>',
        `<head><script>try{window.sessionStorage.setItem("adsEnabled","false")}catch(e){}</script>`
      );
    }

    // Inject popup blocker and ad overlay hider BEFORE </head>
    html = html.replace(
      '</head>',
      `<script>
        (function(){
          // Block popup ads from known ad domains
          var _open=window.open;
          window.open=function(u,t,f){
            if(typeof u==='string'&&(u.indexOf('llvpn')>-1||u.indexOf('adsterra')>-1||u.indexOf('zvigrat')>-1||u.indexOf('superextra')>-1||u.indexOf('clickunder')>-1||u.indexOf('popunder')>-1||u.indexOf('nviqolho')>-1||u.indexOf('t7cpbtd')>-1)){
              return null;
            }
            return _open?_open.call(window,u,t,f):null;
          };
          // Block mousedown popups
          document.addEventListener('mousedown',function(e){
            if(e.target&&e.target.closest&&e.target.closest('[data-cfasync]')){
              e.stopPropagation();e.preventDefault();
            }
          },true);
        })();
      </script>
      <style>
        [class*="ad-shield"],[id*="adblock"],.adblock-card,
        [class*="popunder"],[class*="ad-overlay"],[class*="ad-container"],
        [data-cfasync]{display:none!important;pointer-events:none!important;}
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
