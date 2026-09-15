'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';
import {
  User, Bookmark, Heart, History, MessageSquare, Bell, Star,
  Shield, Clock, Play, TrendingUp, Wallet,
} from 'lucide-react';

// My Space — the user's personal dashboard. Everything here is derived from
// data the app already stores (MuraStream localStorage + server profile),
// so nothing new/sensitive is collected.

type MediaItem = { id: number; mediaType: 'movie' | 'tv'; title: string; posterPath?: string | null };
type HistoryEntry = MediaItem & { date: string; progress?: number };
type MyComment = { id: string; mediaType: string; tmdbId: number; text: string; at: string; likes: number };

const msRead = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const POSTER = (path?: string | null) =>
  path ? `https://image.tmdb.org/t/p/w185${path}` : '';

function SectionCard({ title, icon, children, viewAllHref }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; viewAllHref?: string;
}) {
  return (
    <div className="glass-panel rounded-2xl p-5 mb-5" style={{
      background: 'rgba(255,255,255,0.21)',
      backdropFilter: 'blur(13px)',
      WebkitBackdropFilter: 'blur(13px)',
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.35)',
    }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--cream)]">
          <span style={{ color: 'var(--gold)' }}>{icon}</span> {title}
        </h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-[11px] text-[var(--gold)] hover:underline">View all →</Link>
        )}
      </div>
      {children}
    </div>
  );
}

function PosterStrip({ items, emptyLabel }: { items: MediaItem[]; emptyLabel: string }) {
  if (!items.length) {
    return <p className="text-xs text-[var(--pewter)]">{emptyLabel}</p>;
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
      {items.map((m) => (
        <Link
          key={`${m.mediaType}-${m.id}`}
          href={`/murastream/${m.mediaType}/${m.id}`}
          className="shrink-0 w-[92px] group"
        >
          <div className="w-[92px] h-[138px] rounded-xl overflow-hidden mb-1.5 border border-white/10 bg-white/5">
            {POSTER(m.posterPath) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={POSTER(m.posterPath)} alt={m.title} loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-[var(--pewter)] text-center px-1">{m.title}</div>
            )}
          </div>
          <p className="text-[10px] text-[var(--cream)] truncate group-hover:text-[var(--gold)]">{m.title}</p>
        </Link>
      ))}
    </div>
  );
}

export default function MySpacePage() {
  const { coins } = useCoins();
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState('');
  const [joinedAt, setJoinedAt] = useState('');
  const [userId, setUserId] = useState('');

  const [watchlist, setWatchlist] = useState<MediaItem[]>([]);
  const [likes, setLikes] = useState<MediaItem[]>([]);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [myComments, setMyComments] = useState<MyComment[]>([]);

  useEffect(() => {
    // MuraStream personal data (local to this device) — read lazily inside
    // the effect to avoid setState-during-render cascades.
    const t = setTimeout(() => {
      setWatchlist(msRead<MediaItem[]>('ms-mylist', []));
      setLikes(msRead<MediaItem[]>('ms-likes', []));
      setRecent(msRead<HistoryEntry[]>('ms-history', []));
      setLoading(false);
    }, 0);

    // Profile — the server derives identity from the session cookie.
    (async () => {
      try {
        const res = await fetch('/api/account/profile');
        if (res.ok) {
          const data = await res.json();
          if (data?.success && data.data) {
            setSignedIn(true);
            setName(data.data.name || '');
            setEmail(data.data.email || '');
            setAvatar(data.data.avatar || '');
            setUserId(data.data.userId || '');
            setJoinedAt(data.data.createdAt ? new Date(data.data.createdAt).toLocaleDateString('en', { month: 'short', year: 'numeric' }) : '');
          }
        }
      } catch { /* offline */ }
    })();

    return () => clearTimeout(t);
  }, []);

  // My comments — needs a session; 401 silently means guest.
  useEffect(() => {
    if (!signedIn) return;
    fetch('/api/murastream/comments?mine=1')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.success) setMyComments(d.comments || []); })
      .catch(() => { /* ignore */ });
  }, [signedIn]);

  const continueWatching = useMemo(() => recent.slice(0, 12), [recent]);
  const continueWatchingKey = useCallback(() => `${watchlist.length}-${likes.length}-${recent.length}`, [watchlist.length, likes.length, recent.length]);

  if (loading) {
    return (
      <main className="min-h-screen" style={{ background: 'var(--mario-bg)' }}>
        <NavBar pageLabel="My Space" />
        <div className="flex items-center justify-center py-32">
          <div className="custom-loader" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen page-enter" style={{ background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="My Space" />

      <div className="mx-auto px-4 py-6" style={{ maxWidth: '900px' }}>
        {/* Hero */}
        <div className="glass-panel rounded-2xl p-6 mb-6 flex items-center gap-5" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.21), rgba(255,255,255,0.08))',
          backdropFilter: 'blur(13px)',
          WebkitBackdropFilter: 'blur(13px)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: '20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.35)',
        }}>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="w-16 h-16 rounded-full border-2 border-[var(--gold)] object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full border-2 border-[var(--gold)] flex items-center justify-center text-xl font-bold text-[var(--obsidian)]" style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))' }}>
              {(name || 'G').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[var(--cream)] truncate">{signedIn ? name : 'Guest viewer'}</h1>
            <p className="text-xs text-[var(--pewter)] truncate">
              {signedIn ? email : 'Sign in to sync your profile, coins and comments'}
            </p>
            {signedIn && (
              <p className="text-[10px] text-[var(--pewter)] mt-1">
                {userId && <span className="mr-3">ID: {userId}</span>}
                {joinedAt && <span className="inline-flex items-center gap-1"><Clock size={10} aria-hidden /> Member since {joinedAt}</span>}
              </p>
            )}
          </div>
          <div className="hidden sm:flex flex-col items-end">
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
              <Wallet size={14} aria-hidden /> {coins}
            </span>
            <span className="text-[10px] text-[var(--pewter)]">coins</span>
          </div>
        </div>

        {!signedIn && (
          <div className="glass-panel rounded-2xl p-4 mb-6 text-center" style={{
            background: 'rgba(255,255,255,0.21)',
            backdropFilter: 'blur(13px)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: '20px',
          }}>
            <p className="text-xs text-[var(--cream)] mb-2">Your watchlist and likes on this device already show below — sign in to keep them everywhere.</p>
            <Link href="/login" className="deco-btn deco-btn-sm rounded-xl">Sign in</Link>
          </div>
        )}

        <div key={continueWatchingKey()} data-stat="counts" data-watchlist={watchlist.length} data-likes={likes.length} data-recent={recent.length} data-comments={myComments.length} className="sr-only" />

        <SectionCard title="Continue Watching" icon={<Play size={15} aria-hidden />} viewAllHref="/murastream/history">
          <PosterStrip items={continueWatching} emptyLabel="Nothing started yet — open any title and it will appear here." />
        </SectionCard>

        <SectionCard title="My Watchlist" icon={<Bookmark size={15} aria-hidden />} viewAllHref="/murastream/my-list">
          <PosterStrip items={watchlist.slice(0, 14)} emptyLabel="Your watchlist is empty — tap + on any poster." />
        </SectionCard>

        <SectionCard title="My Favorites" icon={<Heart size={15} aria-hidden />} viewAllHref="/murastream/likes">
          <PosterStrip items={likes.slice(0, 14)} emptyLabel="No favorites yet — tap the heart on any poster." />
        </SectionCard>

        <SectionCard title="Recently Watched" icon={<History size={15} aria-hidden />} viewAllHref="/murastream/history">
          {recent.length === 0 ? (
            <p className="text-xs text-[var(--pewter)]">Nothing watched yet.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {recent.slice(0, 10).map((h) => (
                <Link key={`${h.id}-${h.date}`} href={`/murastream/${h.mediaType}/${h.id}`} className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  {POSTER(h.posterPath) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={POSTER(h.posterPath)} alt="" loading="lazy" className="w-9 h-13 rounded-md object-cover" style={{ height: '52px' }} />
                  ) : (
                    <div className="w-9 rounded-md bg-white/10" style={{ height: '52px' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--cream)] truncate">{h.title}</p>
                    <p className="text-[10px] text-[var(--pewter)]">{new Date(h.date).toLocaleDateString()}</p>
                  </div>
                  {typeof h.progress === 'number' && h.progress > 0 && (
                    <div className="w-16 h-1 rounded-full bg-white/15 overflow-hidden">
                      <div className="h-full bg-[var(--gold)]" style={{ width: `${Math.min(100, h.progress)}%` }} />
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="My Comments" icon={<MessageSquare size={15} aria-hidden />} viewAllHref="/murastream">
          {myComments.length === 0 ? (
            <p className="text-xs text-[var(--pewter)]">{signedIn ? 'You haven\u2019t posted any comments yet.' : 'Sign in to see your comment history.'}</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {myComments.slice(0, 10).map((c) => (
                <Link key={c.id} href={`/murastream/${c.mediaType}/${c.tmdbId}`} className="block p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  <p className="text-xs text-[var(--cream)] line-clamp-2">{c.text}</p>
                  <p className="text-[10px] text-[var(--pewter)] mt-1 flex items-center gap-2">
                    <Star size={9} aria-hidden /> {c.likes} · {new Date(c.at).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Quick links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { href: '/murastream/vault-watch', label: 'Vault', icon: <TrendingUp size={14} aria-hidden /> },
            { href: '/murastream/library', label: 'Library', icon: <Bookmark size={14} aria-hidden /> },
            { href: '/murastream/settings', label: 'Preferences', icon: <User size={14} aria-hidden /> },
            { href: '/account/profile', label: 'Account', icon: <Shield size={14} aria-hidden /> },
          ].map((q) => (
            <Link key={q.href} href={q.href} className="glass-panel rounded-xl p-3 flex items-center gap-2 hover:bg-white/10 transition-colors" style={{
              background: 'rgba(255,255,255,0.21)',
              backdropFilter: 'blur(13px)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: '16px',
            }}>
              <span style={{ color: 'var(--gold)' }}>{q.icon}</span>
              <span className="text-xs text-[var(--cream)]">{q.label}</span>
            </Link>
          ))}
        </div>

        <p className="text-center text-[10px] text-[var(--pewter)] flex items-center justify-center gap-1.5 mb-10">
          <Bell size={10} aria-hidden /> Only data needed for these features is stored — your account stays light.
        </p>
      </div>
    </main>
  );
}
