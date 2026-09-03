'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const type = (searchParams.get('type') as 'movie' | 'tv') || 'movie';
  const id = Number(searchParams.get('id'));
  const season = Number(searchParams.get('season')) || 1;
  const episode = Number(searchParams.get('episode')) || 1;

  const [title, setTitle] = useState('');
  const [source, setSource] = useState('vidking');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const action = type === 'tv' ? 'tv_details' : 'movie_details';
    fetch(`/api/murastream/tmdb?action=${action}&id=${id}`)
      .then(r => r.json())
      .then(data => { setTitle(type === 'tv' ? data.name : data.title); setLoading(false); })
      .catch(() => { setTitle(type === 'tv' ? 'TV Show' : 'Movie'); setLoading(false); });
  }, [id, type]);

  if (!id) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-body)', color: '#666' }}>No content selected.</p>
        <Link href="/murastream" style={{ color: 'var(--mario-yellow)' }}>← Browse MuraStream</Link>
      </div>
    );
  }

  // Direct embed URLs — no proxy, no server-side resolution
  const embedUrl = (() => {
    switch (source) {
      case 'vidking':
        return type === 'tv'
          ? `https://www.vidking.net/embed/tv/${id}/${season}/${episode}`
          : `https://www.vidking.net/embed/movie/${id}`;
      case 'videasy':
        return type === 'tv'
          ? `https://player.videasy.to/tv/${id}/${season}/${episode}`
          : `https://player.videasy.to/movie/${id}`;
      default:
        return type === 'tv'
          ? `https://www.vidking.net/embed/tv/${id}/${season}/${episode}`
          : `https://www.vidking.net/embed/movie/${id}`;
    }
  })();

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(15,15,26,0.95)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ccc' }}>← Back</button>
          <Link href="/murastream" style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-yellow)', textDecoration: 'none' }}>🎬 MuraStream</Link>
        </div>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#fff', margin: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}{type === 'tv' && ` — S${season} E${episode}`}
        </p>
      </div>

      {/* Player iframe */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666' }}>
            Loading...
          </div>
        ) : (
          <iframe
            src={embedUrl}
            title={title}
            style={{ width: '100%', height: 'calc(100vh - 50px)', border: 'none' }}
            allowFullScreen
            allow="autoplay; fullscreen; picture-in-picture"
          />
        )}
      </div>

      {/* Source selector */}
      <div style={{ background: 'rgba(15,15,26,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#666' }}>SOURCE:</span>
        {[{ id: 'vidking', label: 'VidKing' }, { id: 'videasy', label: 'Videasy' }].map(s => (
          <button key={s.id} onClick={() => setSource(s.id)} style={{
            padding: '4px 12px', borderRadius: '6px',
            border: source === s.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
            background: source === s.id ? 'rgba(255,214,10,0.15)' : 'transparent',
            color: source === s.id ? 'var(--mario-yellow)' : '#888',
            fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer',
          }}>{s.label}</button>
        ))}
        {type === 'tv' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <button onClick={() => { if (episode > 1) router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode - 1}`); }} disabled={episode <= 1} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: episode <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,214,10,0.15)', color: episode <= 1 ? '#444' : 'var(--mario-yellow)', fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: episode <= 1 ? 'default' : 'pointer' }}>← Prev</button>
            <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#888' }}>S{season}E{episode}</span>
            <button onClick={() => router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode + 1}`)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,214,10,0.15)', color: 'var(--mario-yellow)', fontFamily: 'var(--font-arcade)', fontSize: '7px', cursor: 'pointer' }}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WatchPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666' }}>Loading...</div>}>
      <WatchContent />
    </Suspense>
  );
}
