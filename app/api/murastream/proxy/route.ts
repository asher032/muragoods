// MuraStream — Surgical Ad-Stripping Proxy
// Fetches streaming embed pages and removes ONLY ad code while keeping all player logic intact

import { NextRequest, NextResponse } from 'next/server';

// Domains and patterns that serve ads
const AD_DOMAINS = [
  'llvpn.com',
  'adsterra.com',
  'zvigratbmq.com',
  'zvaufrpq.com',
  'superextraextra.info',
  'nviqolho.com',
  't7cpbtd6.com',
  'cdilw9894mlkx.cloudfront.net',
  'histats.com',
];

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

  // Build the direct embed URL for each source
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
    // SURGICAL AD REMOVAL — Only remove ad code, keep ALL player logic
    // ═══════════════════════════════════════════════════════════════

    // 1. Remove llvpn.com ad scripts (VidSrc main ad vector)
    html = html.replace(
      /<script[^>]*src=["'][^"']*llvpn\.com[^"']*["'][^>]*><\/script>/gi,
      '<!-- llvpn ad removed -->'
    );
    html = html.replace(
      /<script[^>]*>[^<]*llvpn[^<]*<\/script>/gi,
      '<!-- llvpn ad removed -->'
    );

    // 2. Remove any script that sets dataset.zone and src to ad domains
    html = html.replace(
      /<script>\s*\(function\(s\)\{[^}]*src=['"][^'"]*(?:llvpn|adsterra|zvigrat)[^'"]*['"]/gi,
      '<!-- ad script removed -->'
    );

    // 3. For VidSrc: Remove the histats tracking pixel
    html = html.replace(
      /<img[^>]*src=["'][^"']*histats\.com[^"']*["'][^>]*>/gi,
      '<!-- histats removed -->'
    );

    // 4. For VidKing: Force-disable ads by injecting sessionStorage before any script
    if (source === 'vidking') {
      html = html.replace(
        '<head>',
        `<head><script>window.sessionStorage.setItem("adsEnabled","false");</script>`
      );
    }

    // 5. For VidSrc inner player (vsembed.ru): Remove ad-related scripts
    // vsembed.ru loads sbx.js (sandbox-blocker) and disable-devtool.js — keep those
    // But remove any dynamically-injected ad domains

    // 6. Remove any script tags that reference ad domains
    for (const domain of AD_DOMAINS) {
      const escaped = domain.replace(/\./g, '\\.');
      const regex = new RegExp(`<script[^>]*src=["'][^"']*${escaped}[^"']*["'][^>]*>[\\s\\S]*?<\\/script>`, 'gi');
      html = html.replace(regex, `<!-- ${domain} ad removed -->`);
    }

    // 7. Override window.open to prevent popup ads (only for ad-related calls)
    // This is injected as a safety net — it blocks popups from ad domains
    html = html.replace(
      '</head>',
      `<script>
        // Ad popup blocker — blocks window.open from ad domains only
        (function() {
          const origOpen = window.open;
          window.open = function(url, target, features) {
            if (typeof url === 'string' && (
              url.includes('llvpn') || url.includes('adsterra') || 
              url.includes('zvigrat') || url.includes('superextra') ||
              url.includes('clickunder') || url.includes('popunder')
            )) {
              return null; // Block ad popups
            }
            return origOpen.call(this, url, target, features);
          };
        })();
      </script>
      <style>
        /* Hide any ad overlays that might still appear */
        .ad-shield-play, #adblock-screen, [class*="ad-shield"],
        [id*="adblock"], .adblock-card, [class*="popunder"],
        [class*="ad-overlay"], [class*="ad-container"] {
          display: none !important; pointer-events: none !important;
        }
      </style>
      </head>`
    );

    // 8. For VidSrc: remove the second <script> tag with Adsterra (if any remains)
    html = html.replace(
      /<script\s+type="text\/javascript">\s*\/\/\s*Adsterra[\s\S]*?<\/script>/gi,
      '<!-- adsterra ad removed -->'
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
