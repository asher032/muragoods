'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { VAULT_ITEMS, type VaultItem } from '../data/vault';

function VaultCard({ item, posterPath }: { item: VaultItem; posterPath?: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link
      href={`/murastream/vault/${item.id}`}
      style={{
        flexShrink: 0, width: 230, display: 'flex', flexDirection: 'column',
        background: 'var(--ms-surface)', border: '1px solid var(--ms-border-2)', borderRadius: 10,
        padding: 10, textDecoration: 'none', transition: 'all 0.3s', cursor: 'pointer',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-10px)'; e.currentTarget.style.borderColor = '#E50914'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'var(--ms-border-2)'; }}
    >
      <div style={{
        width: '100%', minHeight: 240, borderRadius: 10, marginBottom: 12,
        overflow: 'hidden', background: 'var(--ms-surface-2)', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {posterPath && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterPath}
            alt={item.title}
            style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }}
            onError={() => setBroken(true)}
          />
        ) : (
          <span style={{ color: 'var(--ms-text-ghost)', display: 'flex' }}><PopcornIcon size={40} strokeWidth={1.4} /></span>
        )}
        <span style={{
          position: 'absolute', top: 8, left: 8, background: 'rgba(229,9,20,0.9)',
          color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
          letterSpacing: '0.06em',
        }}>
          FREE · DOWNLOADABLE
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
        {item.title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ms-text-muted)', marginBottom: 6 }}>
        {item.year} · {item.runtime} · ★ {item.rating.toFixed(1)}
      </div>
      <div style={{
        fontSize: 12, color: 'var(--ms-text-muted)', display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5,
      }}>
        {item.overview}
      </div>
    </Link>
  );
}

export default function MuraStreamVaultPage() {
  const [posters, setPosters] = useState<Record<number, string>>({});

  // Resolve real TMDB poster paths via our own API route (keys stay server-side).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        VAULT_ITEMS.map(async it => {
          try {
            const res = await fetch(`/api/murastream/tmdb?action=movie_details&id=${it.tmdbId}`);
            if (!res.ok) return null;
            const data = await res.json();
            return data?.posterPath ? [it.tmdbId, data.posterPath as string] : null;
          } catch {
            return null;
          }
        })
      );
      if (!cancelled) setPosters(Object.fromEntries(entries.filter(Boolean) as [number, string][]));
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <style jsx global>{`
        .vault-hero {
          position: relative; border-radius: 16px; overflow: hidden;
          background: linear-gradient(135deg, var(--ms-surface-2) 0%, var(--ms-bg) 60%);
          border: 1px solid var(--ms-border-2); padding: 40px 36px; margin-bottom: 36px;
        }
        .vault-hero h1 {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 30px; font-weight: 800; color: #fff; margin: 0 0 10px;
        }
        .vault-hero p {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 14px; color: var(--ms-text-muted); max-width: 560px; margin: 0; line-height: 1.6;
        }
        .vault-badge {
          display: inline-block; background: rgba(229,9,20,0.15); color: #E50914;
          font-size: 11px; font-weight: 700; letter-spacing: 0.1em;
          padding: 5px 12px; border-radius: 8px; margin-bottom: 14px;
        }
      `}</style>

      <div className="vault-hero">
        <span className="vault-badge">THE FREE VAULT</span>
        <h1>Movies you can actually download.</h1>
        <p>
          100% legal open-licensed films — real files, no ads, no popups, works offline.
          Stream in adaptive quality or download and keep them forever.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        {VAULT_ITEMS.map(item => (
          <VaultCard key={item.id} item={item} posterPath={posters[item.tmdbId]} />
        ))}
      </div>
    </div>
  );
}
