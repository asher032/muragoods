'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';

interface Source {
  id: string;
  name: string;
  quality?: 'HD' | '4K';
  getUrl: (type: string, id: number, season?: number, episode?: number) => string;
}

// Sources ordered by cleanliness: ad-free 4K-capable providers first,
// ad-supported providers last as fallbacks.
const SOURCES: Source[] = [
  {
    id: 'vidlink', name: 'VidLink', quality: '4K',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://vidlink.pro/tv/${id}/${season}/${episode}`
        : `https://vidlink.pro/movie/${id}`,
  },
  {
    id: 'videasy', name: 'Videasy', quality: '4K',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://player.videasy.to/tv/${id}/${season}/${episode}`
        : `https://player.videasy.to/movie/${id}`,
  },
  {
    id: 'vidking', name: 'Vidking', quality: '4K',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://www.vidking.net/embed/tv/${id}/${season}/${episode}`
        : `https://www.vidking.net/embed/movie/${id}`,
  },
  {
    id: 'vidfast', name: 'Vidfast', quality: '4K',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://vidfast.pro/tv/${id}/${season}/${episode}`
        : `https://vidfast.pro/movie/${id}`,
  },
  {
    id: '111movies', name: '111Movies', quality: 'HD',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://111movies.com/tv/${id}/${season}/${episode}`
        : `https://111movies.com/movie/${id}`,
  },
  {
    id: '2embed', name: '2Embed',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://www.2embed.cc/embed/tv/${id}/${season}/${episode}`
        : `https://www.2embed.cc/embed/movie/${id}`,
  },
  {
    id: 'multiembed', name: 'Multi',
    getUrl: (type, id, season, episode) =>
      type === 'tv' && season && episode
        ? `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${season}&e=${episode}`
        : `https://multiembed.mov/?video_id=${id}&tmdb=1`,
  },
];

// Providers users can report; quality shown on their button
const QUALITY: Record<string, 'HD' | '4K'> = Object.fromEntries(
  SOURCES.filter(s => s.quality).map(s => [s.id, s.quality!])
);

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const id = Number(searchParams.get('id'));
  const season = Number(searchParams.get('season')) || 1;
  const episode = Number(searchParams.get('episode')) || 1;

  const [title, setTitle] = useState('');
  const [activeSource, setActiveSource] = useState<Source>(SOURCES[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [posterPath, setPosterPath] = useState('');
  const [showAutoPlay, setShowAutoPlay] = useState(false);
  const [autoPlayCountdown, setAutoPlayCountdown] = useState(10);
  const [failedSources, setFailedSources] = useState<Set<string>>(new Set());
  // Server-side probe results: which providers actually have THIS title.
  // null = probe still running (player area shows a loader).
  const [sourceHealth, setSourceHealth] = useState<Record<string, boolean> | null>(null);
  const manualPickRef = useRef(false);
  // Community reports: provider → trust info for this title (last 14 days)
  const [reports, setReports] = useState<Record<string, { broken: number; ads: number; score: number }>>({});
  // Globally-disabled providers (admin dashboard)
  const [disabledProviders, setDisabledProviders] = useState<Set<string>>(new Set());
  const playerRef = useRef<HTMLDivElement>(null);
  const [reportDone, setReportDone] = useState<Set<string>>(new Set());
  const [showReport, setShowReport] = useState(false);
  // Last-known-good provider for this exact title (per-title cache) — lets
  // repeat plays skip the probe delay entirely.
  const [cachedSource, setCachedSource] = useState<Source | null>(null);

  // Fetch title
  useEffect(() => {
    if (!id) {
      setError('No content selected.');
      setLoading(false);
      return;
    }

    console.log('[Watch] Loading:', { type, id, season, episode });

    const controller = new AbortController();

    const action = type === 'tv' ? 'tv_details' : 'movie_details';
    fetch(`/api/murastream/tmdb?action=${action}&id=${id}`, { signal: controller.signal })
        .then(r => r.json())
        .then(data => {
          console.log('[Watch] TMDB title:', data?.title || data?.name);
          setTitle(type === 'tv' ? (data.name || 'TV Show') : (data.title || 'Movie'));
          setPosterPath(data.posterPath || '');
          setLoading(false);
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          console.error('[Watch] TMDB failed:', err);
          setTitle(type === 'tv' ? 'TV Show' : 'Movie');
          setLoading(false);
        });
    return () => controller.abort();
  }, [id, type, season, episode]);

  const { markEpisodeWatched, settings } = useMuraStreamStore();

  // Record to watch history
  useEffect(() => {
    if (!id || loading || error) return;
    if (type === 'tv' && title) {
      markEpisodeWatched(id, title, posterPath, episode, undefined);
    }
  }, [id, type, episode, title, posterPath, loading, error, markEpisodeWatched]);

  // Reset failed sources when content or episode changes; restore the
  // last-known-good provider for this exact title if we have one.
  useEffect(() => {
    setFailedSources(new Set());
    manualPickRef.current = false;
    setCachedSource(null);
    try {
      const key = `ms-best-source:${type}:${id}${type === 'tv' ? `:S${season}E${episode}` : ''}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const src = SOURCES.find(s => s.id === saved);
        if (src) {
          setCachedSource(src);
          setActiveSource(src);
        }
      }
    } catch { /* empty */ }
  }, [id, type, season, episode]);

  // Probe which sources actually serve this title before opening the iframe.
  // Providers that lack the title serve a 200 HTML error page and iframe
  // onError never fires — without this the player silently sits on a dead
  // page or, worse, on an ad-heavy provider that happened to be next.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setSourceHealth(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    fetch(`/api/murastream/source-check?type=${type}&id=${id}&season=${season}&episode=${episode}`, {
      signal: controller.signal,
    })
      .then(r => (r.ok ? r.json() : { checks: [] }))
      .then(data => {
        if (cancelled) return;
        const health: Record<string, boolean> = {};
        for (const c of (data.checks || []) as { id: string; ok: boolean }[]) {
          health[c.id] = c.ok;
        }
        setSourceHealth(health);
      })
      .catch(() => { if (!cancelled) setSourceHealth({}); }) // probe failed → don't block playback
      .finally(() => clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); };
  }, [id, type, season, episode]);

  // Load community trust reports for this title (best-effort)
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/murastream/source-report?type=${type}&id=${id}`)
      .then(r => (r.ok ? r.json() : { trust: {} }))
      .then(data => { if (!cancelled) setReports(data.trust || {}); })
      .catch(() => { /* empty */ });
    return () => { cancelled = true; };
  }, [id, type]);

  // Global admin disables (2-min CDN cache, cheap) + live refresh: when an
  // admin disables a provider, active players hear about it and switch away
  // within a second.
  useEffect(() => {
    const refresh = () => fetch('/api/murastream/provider-config')
      .then(r => (r.ok ? r.json() : { disabled: [] }))
      .then(d => setDisabledProviders(new Set(d.disabled || [])))
      .catch(() => { /* empty */ });
    refresh();

    // Live push (SSE): sub-second reaction to admin disable/enable.
    const es = new EventSource('/api/murastream/provider-events');
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data) as { disabled?: string[] };
        if (Array.isArray(d.disabled)) setDisabledProviders(new Set(d.disabled));
      } catch { /* ignore malformed frames */ }
    };
    es.onerror = () => { /* browser auto-reconnects; poll below covers gaps */ };

    // 60s polling safety net (also covers SSE being blocked by proxies)
    const poll = setInterval(refresh, 60000);
    return () => { es.close(); clearInterval(poll); };
  }, []);

  // Probe results merged with community reports: sources downvoted to trust 0
  // are treated as dead for this title.
  const effectiveHealth = useMemo(() => {
    if (!sourceHealth) return null;
    const merged = { ...sourceHealth };
    for (const [pid, t] of Object.entries(reports)) {
      if (t.score <= 0) merged[pid] = false;
    }
    for (const pid of disabledProviders) merged[pid] = false;
    return merged;
  }, [sourceHealth, reports, disabledProviders]);

  // Fallback order = verified-healthy sources (or all, if no data)
  const orderedSources = useMemo(() => (
    effectiveHealth ? SOURCES.filter(s => effectiveHealth[s.id] !== false) : SOURCES
  ), [effectiveHealth]);

  // Auto-select / forced-switch effect. Two behaviors:
  // 1. Initial: after the probe lands, pick the first confirmed-healthy source
  //    (preferring the cached last-known-good winner) unless the user picked
  //    one manually and it's still healthy.
  // 2. Active-death watch: if the ACTIVE source becomes unhealthy at any point
  //    (runtime error, community reports, or an admin disabling it via the
  //    SSE push), switch away immediately — a manual pick does not survive
  //    its own source dying.
  useEffect(() => {
    if (!effectiveHealth) return;
    const activeDead = effectiveHealth[activeSource.id] === false;
    if (!activeDead && manualPickRef.current) return;
    if (activeDead) manualPickRef.current = false; // forced switch resets manual mode
    // Prefer the remembered winner if it still works.
    if (cachedSource && effectiveHealth[cachedSource.id]) {
      if (cachedSource.id !== activeSource.id) setActiveSource(cachedSource);
      return;
    }
    const firstHealthy = SOURCES.find(s => effectiveHealth[s.id]);
    if (firstHealthy && firstHealthy.id !== activeSource.id) {
      setActiveSource(firstHealthy);
      try {
        const key = `ms-best-source:${type}:${id}${type === 'tv' ? `:S${season}E${episode}` : ''}`;
        localStorage.setItem(key, firstHealthy.id);
      } catch { /* empty */ }
    } else if (!firstHealthy) {
      setError('All streaming sources are currently unavailable. Please try again later.');
    }
  }, [effectiveHealth, activeSource, cachedSource]);

  const advanceEpisode = useCallback(() => {
    router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode + 1}`);
  }, [router, id, season, episode]);

  // Auto-play next episode
  useEffect(() => {
    if (!showAutoPlay || type !== 'tv') return;
    if (autoPlayCountdown <= 0) {
      router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode + 1}`);
      return;
    }
    const timer = setTimeout(() => setAutoPlayCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [showAutoPlay, autoPlayCountdown, type, id, season, episode, router]);

  // Provider completion signal → advance instantly. Cross-origin iframes can't
  // be read directly, but some providers (VidLink, Videasy) postMessage player
  // events; listen for every completion shape they've used.
  useEffect(() => {
    if (type !== 'tv') return;
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      const ended =
        d === 'ended' ||
        d?.event === 'ended' ||
        d?.type === 'ended' ||
        d?.type === 'media/ended' ||
        d?.type === 'player:ended' ||
        d?.name === 'ended' ||
        (typeof d?.type === 'string' && d.type.endsWith(':ended'));
      if (ended) advanceEpisode();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [type, advanceEpisode]);

  // Keyboard shortcuts: S = cycle source, N = next episode, F = fullscreen,
  // M = mute, ←/→ = prev/next episode. Honors settings.shortcutsEnabled.
  // Must live above the `if (!id)` early return (Rules of Hooks).
  useEffect(() => {
    if (settings.shortcutsEnabled === false) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        const order = orderedSources.length > 0 ? orderedSources : SOURCES;
        if (order.length < 2) return;
        const idx = order.findIndex(s => s.id === activeSource.id);
        manualPickRef.current = true;
        setActiveSource(order[(idx + 1) % order.length]);
      } else if (key === 'n' && type === 'tv') {
        advanceEpisode();
      } else if (key === 'm') {
        const iframe = playerRef.current?.querySelector('iframe');
        iframe?.focus();
        try { iframe?.contentWindow?.postMessage({ type: 'mute' }, '*'); } catch { /* cross-origin */ }
      } else if (key === 'f') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void playerRef.current?.requestFullscreen();
      } else if (e.key === 'ArrowRight' && type === 'tv') {
        advanceEpisode();
      } else if (e.key === 'ArrowLeft' && type === 'tv' && episode > 1) {
        router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode - 1}`);
      } else if (key === 'escape') {
        setShowReport(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [orderedSources, activeSource, type, advanceEpisode, episode, id, season, router, settings.shortcutsEnabled]);

  if (!id) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <p style={{ fontSize: '16px', color: '#ef4444' }}>No content selected.</p>
        <Link href="/murastream" style={{ color: '#E50914', fontSize: '14px', textDecoration: 'none' }}>← Browse MuraStream</Link>
      </div>
    );
  }

  const embedUrl = activeSource.getUrl(type, id, season, episode);

  // Fallback order comes from the orderedSources memo above.

  const reportSource = async (provider: string, issue: 'broken' | 'ads') => {
    const key = `${provider}:${issue}`;
    if (reportDone.has(key)) return;
    setReportDone(prev => new Set(prev).add(key));
    // Both issue types trigger an instant switch away from the reported source:
    // 'broken' because it does not play, 'ads' because burned-in ad overlays
    // make it unwatchable. Locally demote it so auto-select + fallback skip it.
    if (issue === 'broken') {
      handleIframeError();
    } else {
      setSourceHealth(prev => (prev ? { ...prev, [provider]: false } : prev));
    }
    try {
      let email: string | undefined;
      try {
        const raw = localStorage.getItem('user');
        if (raw) email = JSON.parse(raw)?.email;
      } catch { /* anonymous */ }
      await fetch('/api/murastream/source-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaType: type, tmdbId: id, provider, issue,
          season: type === 'tv' ? season : undefined,
          episode: type === 'tv' ? episode : undefined,
          email,
        }),
      });
    } catch { /* best effort */ }
  };

  const handleIframeError = () => {
    // Record this source as failed, then move to the next healthy one
    const order = orderedSources.length > 0 ? orderedSources : SOURCES;
    const currentIdx = order.findIndex(s => s.id === activeSource.id);
    setFailedSources(prev => new Set(prev).add(activeSource.id));
    setSourceHealth(prev => (prev ? { ...prev, [activeSource.id]: false } : prev));
    let nextIdx = currentIdx + 1;
    while (nextIdx < order.length && failedSources.has(order[nextIdx].id)) {
      nextIdx++;
    }
    if (nextIdx < order.length) {
      setActiveSource(order[nextIdx]);
    } else {
      setError('All streaming sources are currently unavailable. Please try again later.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', background: 'rgba(10,10,10,0.9)',
        backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => router.back()} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', padding: '8px 14px', cursor: 'pointer',
            fontSize: '13px', color: '#ccc', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8"/></svg>
            Back
          </button>
          <Link href="/murastream" style={{ fontSize: '13px', color: '#E50914', textDecoration: 'none', fontWeight: 600 }}>MuraStream</Link>
        </div>
        <p style={{ fontSize: '14px', fontWeight: 600, color: '#fff', margin: 0, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}{type === 'tv' && <span style={{ color: '#E50914', fontWeight: 400 }}> — S{season}E{episode}</span>}
        </p>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {SOURCES.map(s => {
            const healthy = effectiveHealth ? effectiveHealth[s.id] !== false : true;
            const active = activeSource.id === s.id;
            return (
              <button key={s.id} onClick={() => { manualPickRef.current = true; setActiveSource(s); }} style={{
                padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
                fontSize: '12px', fontWeight: 500,
                border: active ? '1px solid rgba(229,9,20,0.4)' : '1px solid rgba(255,255,255,0.08)',
                background: active ? 'rgba(229,9,20,0.15)' : 'rgba(255,255,255,0.04)',
                color: !healthy ? '#444' : active ? '#E50914' : '#888',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: effectiveHealth ? (healthy ? '#22c55e' : '#ef4444') : '#666',
                  flexShrink: 0,
                }} />
                {s.name}
                {QUALITY[s.id] && healthy && (
                  <span style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: '0.04em',
                    color: '#E50914', border: '1px solid rgba(229,9,20,0.45)',
                    borderRadius: 4, padding: '0 4px', lineHeight: '13px',
                  }}>{QUALITY[s.id]}</span>
                )}
              </button>
            );
          })}

          {/* Report active source */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowReport(v => !v)} title="Report this source" style={{
              padding: '6px 10px', borderRadius: '8px', cursor: 'pointer',
              fontSize: '13px', color: '#888', border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)', transition: 'all 0.2s',
            }}>⚑</button>
            {showReport && (
              <div style={{
                position: 'absolute', top: '36px', right: 0, zIndex: 60,
                background: 'rgba(20,20,20,0.97)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, padding: 6, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                <p style={{ fontSize: 10, color: '#666', margin: '4px 8px 6px', letterSpacing: '0.06em' }}>
                  FLAG {activeSource.name.toUpperCase()}
                </p>
                {(['broken', 'ads'] as const).map(issue => {
                  const done = reportDone.has(`${activeSource.id}:${issue}`);
                  return (
                    <button key={issue} disabled={done}
                      onClick={() => { reportSource(activeSource.id, issue); setShowReport(false); }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                        borderRadius: 6, cursor: done ? 'default' : 'pointer', fontSize: 12,
                        color: done ? '#555' : '#E5E5E5', border: 'none', background: 'transparent',
                      }}
                      onMouseEnter={e => { if (!done) e.currentTarget.style.background = 'rgba(229,9,20,0.1)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {issue === 'broken' ? '⚠ Broken / won\u2019t play' : '◆ Too many ads'} {done && '✓ reported'}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player */}
      <div ref={playerRef} style={{ flex: 1, position: 'relative', minHeight: '60vh' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <div className="custom-loader" />
            <p style={{ fontSize: '14px', color: '#666' }}>Loading player...</p>
          </div>
        ) : error ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '24px' }}>
            <p style={{ fontSize: '14px', color: '#ef4444', textAlign: 'center', maxWidth: '400px' }}>{error}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setError(''); setActiveSource(SOURCES[0]); }}
                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid #E50914', background: 'rgba(229,9,20,0.15)', color: '#E50914', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                ↻ Retry
              </button>
              <Link href={type === 'tv' ? `/murastream/tv/${id}` : `/murastream/movie/${id}`} style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#888', fontSize: '13px', textDecoration: 'none' }}>
                ← Details
              </Link>
            </div>
          </div>
        ) : sourceHealth === null && !cachedSource ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <div className="custom-loader" />
            <p style={{ fontSize: '14px', color: '#666' }}>Finding the best source…</p>
          </div>
        ) : (
          <iframe
            key={`${activeSource.id}-${id}-${type}-${season}-${episode}`}
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', inset: 0 }}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            onError={handleIframeError}
          />
        )}

        {/* Auto-play overlay */}
        {showAutoPlay && type === 'tv' && (
          <div style={{
            position: 'absolute', bottom: '80px', right: '16px', zIndex: 20,
            background: 'rgba(10,10,24,0.95)', border: '1px solid rgba(229,9,20,0.3)',
            borderRadius: '12px', padding: '16px', width: '300px',
            backdropFilter: 'blur(10px)',
          }}>
            <p style={{ fontSize: '11px', color: '#E50914', margin: '0 0 8px', fontWeight: 600 }}>▶ NEXT EPISODE</p>
            <p style={{ fontSize: '12px', color: '#fff', margin: '0 0 4px' }}>{title} — S{season}E{episode + 1}</p>
            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 12px' }}>Starting in {autoPlayCountdown}s...</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode + 1}`)} style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #E50914',
                background: 'rgba(229,9,20,0.15)', color: '#E50914',
                fontSize: '12px', cursor: 'pointer', fontWeight: 600,
              }}>▶ Play Now</button>
              <button onClick={() => setShowAutoPlay(false)} style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: '#888', fontSize: '12px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ background: 'rgba(15,15,26,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>            <Link href={type === 'tv' ? `/murastream/tv/${id}` : `/murastream/movie/${id}`} style={{
              padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent', color: '#888', fontSize: '12px', textDecoration: 'none',
            }}>Details</Link>
            {/* Trust badge: community confidence in the active source */}
            {(() => {
              const t = reports[activeSource.id];
              const score = t ? t.score : 1; // no reports = neutral-good
              const [label, color] = score >= 0.8 ? ['Trusted', '#22c55e'] : score >= 0.5 ? ['Mixed reports', '#eab308'] : score > 0 ? ['Low confidence', '#f97316'] : ['Reported broken', '#ef4444'];
              return (
                <span title={t ? `${t.broken} broken · ${t.ads} ads reports (14d)` : 'No reports for this title'} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 10, fontWeight: 700, color, padding: '3px 8px', borderRadius: 6,
                  border: `1px solid ${color}55`, letterSpacing: '0.04em',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                  {label}{t ? ` · ${Math.round(score * 100)}%` : ''}
                </span>
              );
            })()}
            <span style={{ color: '#555', fontSize: 10, fontFamily: 'var(--font-arcade)', letterSpacing: '0.05em' }} title="S: source · N: next · F: fullscreen">
              S·N·F
            </span>
          </div>

        {type === 'tv' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => { if (episode > 1) router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode - 1}`); }}
              disabled={episode <= 1} style={{
                padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
                background: episode <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(229,9,20,0.15)',
                color: episode <= 1 ? '#444' : '#E50914', fontSize: '12px', cursor: episode <= 1 ? 'default' : 'pointer',
              }}>← Prev</button>
            <span style={{ fontSize: '12px', color: '#888' }}>S{season}E{episode}</span>
            <button onClick={() => { setShowAutoPlay(true); setAutoPlayCountdown(10); }} style={{
              padding: '4px 12px', borderRadius: '6px', border: '1px solid #E50914',
              background: 'rgba(229,9,20,0.15)', color: '#E50914', fontSize: '12px', cursor: 'pointer',
            }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#666' }}>Loading...</div>}>
      <WatchContent />
    </Suspense>
  );
}
