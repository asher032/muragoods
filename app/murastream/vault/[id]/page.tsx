'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { VAULT_ITEMS } from '../../data/vault';

export default function VaultDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const item = VAULT_ITEMS.find(v => v.id === params?.id);

  const [art, setArt] = useState<{ poster?: string; backdrop?: string }>({});
  const [posterBroken, setPosterBroken] = useState(false);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/murastream/tmdb?type=movie_details&id=${item.tmdbId}`);
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setArt({ poster: d.posterPath, backdrop: d.backdropPath });
      } catch {
        /* poster fallback 🍿 is fine */
      }
    })();
    return () => { cancelled = true; };
  }, [item]);

  if (!item) {
    return (
      <div style={{ padding: '48px 32px', textAlign: 'center' }}>
        <p style={{ color: '#A0A0A0', fontFamily: 'var(--font-arcade)', fontSize: 14 }}>
          This vault film doesn&apos;t exist.
        </p>
        <Link href="/murastream/downloads" style={{ color: '#B85CFF', fontSize: 14, textDecoration: 'none' }}>
          ← Back to the Free Vault
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Backdrop */}
      <div style={{
        position: 'relative', minHeight: 340, background: '#0A0A0A',
        borderBottom: '1px solid #1A1A1A', overflow: 'hidden',
      }}>
        {art.backdrop && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art.backdrop}
            alt=""
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', opacity: 0.45,
            }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, #0A0A0A 8%, rgba(10,10,10,0.4) 60%, rgba(10,10,10,0.7))',
        }} />
      </div>

      <div style={{ padding: '0 32px 48px', maxWidth: 1100, marginTop: -140, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {/* Poster */}
          <div style={{
            width: 220, height: 330, borderRadius: 12, overflow: 'hidden',
            background: '#171717', border: '1px solid #2A2A2A', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {art.poster && !posterBroken ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art.poster} alt={item.title}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setPosterBroken(true)} />
            ) : (
              <span style={{ fontSize: 48 }}>🍿</span>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 280, paddingTop: 40 }}>
            <span style={{
              display: 'inline-block', background: 'rgba(184,92,255,0.15)', color: '#B85CFF',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              padding: '4px 10px', borderRadius: 6, marginBottom: 12,
            }}>
              FREE VAULT · {item.license} LICENSE
            </span>
            <h1 style={{
              fontFamily: -apple-system, fontSize: 34, fontWeight: 800,
              color: '#fff', margin: '0 0 10px', lineHeight: 1.1,
            } as React.CSSProperties}>
              {item.title}
            </h1>
            <div style={{ fontSize: 14, color: '#A0A0A0', marginBottom: 16 }}>
              {item.year} · {item.runtime} · ★ {item.rating.toFixed(1)} · {item.studio}
            </div>
            <div style={{ fontSize: 12, color: '#B85CFF', marginBottom: 16 }}>
              {item.genres.join(' • ')}
            </div>
            <p style={{ fontSize: 15, color: '#E5E5E5', lineHeight: 1.7, maxWidth: 560, margin: '0 0 28px' }}>
              {item.overview}
            </p>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button
                onClick={() => router.push(`/murastream/vault-watch?id=${item.id}`)}
                style={{
                  background: '#B85CFF', color: '#fff', border: 'none', borderRadius: 10,
                  padding: '13px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                }}
              >
                ▶ Watch Now
              </button>
              {item.mp4Url && (
                <a
                  href={item.mp4Url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: 'transparent', color: '#fff', border: '1px solid #3A3A3A',
                    borderRadius: 10, padding: '13px 28px', fontSize: 15, fontWeight: 600,
                    textDecoration: 'none', display: 'inline-block',
                  }}
                >
                  ⬇ Download ({item.downloadSize})
                </a>
              )}
            </div>

            <p style={{ fontSize: 12, color: '#666', marginTop: 18, maxWidth: 520 }}>
              Licensed {item.license} — free to watch, download, and share. No ads, ever.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
