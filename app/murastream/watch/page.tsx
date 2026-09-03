'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Source {
  id: string;
  name: string;
  baseUrl: string;
}

const SOURCES: Source[] = [
  { id: 'vidking', name: 'VidKing', baseUrl: 'https://www.vidking.net/embed' },
  { id: 'videasy', name: 'Videasy', baseUrl: 'https://player.videasy.to' },
];

function getSourceUrl(source: Source, type: string, id: number, season?: number, episode?: number): string {
  if (type === 'tv' && season && episode) {
    return `${source.baseUrl}/tv/${id}/${season}/${episode}`;
  }
  return `${source.baseUrl}/movie/${id}`;
}

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
        <Link href="/murastream" style={{ color: 'var(--mario-yellow)' }}>← Browse</Link>
      </div>
    );
  }

  const embedUrl = getSourceUrl(activeSource, type, id, season, episode);

  return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(15,15,26,0.95)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#ccc' }}>← Back</button>
          <Link href="/murastream" style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: 'var(--mario-yellow)', textDecoration: 'none' }}>🎬 MuraStream</Link>
        </div>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#fff', margin: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}{type === 'tv' && ` — S${season}E${episode}`}
        </p>
        <div style={{ display: 'flex', gap: '4px' }}>
          {SOURCES.map(s => (
            <button key={s.id} onClick={() => setActiveSource(s)} style={{
              padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontFamily: 'var(--font-arcade)', fontSize: '7px',
              border: activeSource.id === s.id ? '1px solid var(--mario-yellow)' : '1px solid rgba(255,255,255,0.1)',
              background: activeSource.id === s.id ? 'rgba(255,214,10,0.15)' : 'transparent',
              color: activeSource.id === s.id ? 'var(--mario-yellow)' : '#888',
            }}>{s.name}</button>
          ))}
        </div>
      </div>

      {/* Player */}
      <div style={{ flex: 1, position: 'relative', minHeight: '60vh' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <div className="custom-loader" />
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#666' }}>Loading player...</p>
          </div>
        ) : (
          <iframe
            key={`${activeSource.id}-${id}-${type}-${season}-${episode}`}
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', inset: 0 }}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          />
        )}
      </div>

      {/* Bottom bar - episode navigation for TV */}
      {type === 'tv' && (
        <div style={{ background: 'rgba(15,15,26,0.95)', borderTop: '1px solid rgba(255,255,255,0.05)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <button onClick={() => { if (episode > 1) router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode - 1}`); }} disabled={episode <= 1} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: episode <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(255,214,10,0.15)', color: episode <= 1 ? '#444' : 'var(--mario-yellow)', fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: episode <= 1 ? 'default' : 'pointer' }}>← Prev Ep</button>
          <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#888' }}>Season {season} • Episode {episode}</span>
          <button onClick={() => router.push(`/murastream/watch?type=tv&id=${id}&season=${season}&episode=${episode + 1}`)} style={{ padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--mario-yellow)', background: 'rgba(255,214,10,0.15)', color: 'var(--mario-yellow)', fontFamily: 'var(--font-arcade)', fontSize: '8px', cursor: 'pointer' }}>Next Ep →</button>
        </div>
      )}
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
