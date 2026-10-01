'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import {
  User, Bookmark, Heart, History, MessageSquare, Star,
  Shield, Clock, Play, TrendingUp, Wallet, Package, Gamepad2, Mail,
  LifeBuoy, Sparkles,
} from 'lucide-react';

// ── My Space — the personal hub for ONE canonical Muragoods account ───────
//
// Everything here is fetched from /api/account/my-space, which resolves the
// caller from their secure session and reads every collection by their
// canonical `userId`. The previous version read watchlist/likes/history from
// localStorage, which meant the hub answered "what is on this device" instead
// of "what belongs to this person" — the same account showed different data
// on different devices.

type MediaItem = { id: number; mediaType?: string; title?: string; posterPath?: string | null };
type FavoriteItem = { contentType: string; contentId: string; title: string; image: string; subtitle: string };
type PointEntry = { type: 'earn' | 'spend'; amount: number; label: string; date: string | null };
type GameRow = { gameId: string; level: number; xp: number; bestScore: number; plays: number; wins: number; streak: number };

interface MySpaceResponse {
  success: boolean;
  userId: string;
  profile?: {
    displayName: string; username: string; email: string; avatar: string; memberSince: string | null;
  };
  library?: { watchlist: MediaItem[]; favorites: MediaItem[]; history: Array<MediaItem & { date?: string; progress?: number }> };
  favorites?: FavoriteItem[];
  points?: { balance: number; earned: number; spent: number; history: PointEntry[] };
  orders?: Array<{ id: string; status: string; total: number; createdAt: string | null }>;
  games?: { totalXp: number; achievements: number; games: GameRow[] };
  letters?: Array<{ id: string; title: string; recipient: string; category: string; createdAt: string | null }>;
  support?: Array<{ id: string; subject: string; status: string; category: string; lastActivity: string | null }>;
  activity?: Array<{ type: string; text: string; ref: string; createdAt: string | null }>;
  degraded?: string[];
  error?: string;
}

const POSTER = (path?: string | null) =>
  path ? `https://image.tmdb.org/t/p/w185${path}` : '';

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '');

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
          href={`/murastream/${m.mediaType || 'movie'}/${m.id}`}
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--pewter)]">{children}</p>;
}

export default function MySpacePage() {
  const [data, setData] = useState<MySpaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/account/my-space', { cache: 'no-store' });
        if (res.status === 401) {
          if (!cancelled) { setError('Sign in to see your personal hub.'); setLoading(false); }
          return;
        }
        const body = (await res.json().catch(() => null)) as MySpaceResponse | null;
        if (cancelled) return;
        if (!body?.success) {
          setError(body?.error || 'Could not load your data.');
        } else {
          setData(body);
        }
      } catch {
        if (!cancelled) setError('Network error — retry.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const lib = data?.library;
  const pts = data?.points;
  const gameRows = useMemo(() => (data?.games?.games || []).slice(0, 6), [data]);

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

  if (error || !data) {
    return (
      <main className="min-h-screen" style={{ background: 'var(--mario-bg)' }}>
        <NavBar pageLabel="My Space" />
        <div className="deco-container" style={{ maxWidth: '36rem', margin: '40px auto', padding: 32, textAlign: 'center' }}>
          <h1 className="text-xl text-[var(--cream)]">My Space is unavailable</h1>
          <p style={{ opacity: 0.7, margin: '8px 0 20px' }}>{error}</p>
          <Link href="/login" className="deco-btn">Sign in</Link>
        </div>
      </main>
    );
  }

  const p = data.profile;
  const memberSince = p?.memberSince
    ? new Date(p.memberSince).toLocaleDateString('en', { month: 'short', year: 'numeric' })
    : '';

  return (
    <main className="min-h-screen page-enter" style={{ background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="My Space" />

      <div className="mx-auto px-4 py-6" style={{ maxWidth: '900px' }}>
        {/* Hero — same identity as /profile and the header everywhere else */}
        <div className="glass-panel rounded-2xl p-6 mb-6 flex items-center gap-5" style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.21), rgba(255,255,255,0.08))',
          backdropFilter: 'blur(13px)',
          WebkitBackdropFilter: 'blur(13px)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: '20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.35)',
        }}>
          {p?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatar} alt="" className="w-16 h-16 rounded-full border-2 border-[var(--gold)] object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full border-2 border-[var(--gold)] flex items-center justify-center text-xl font-bold text-[var(--obsidian)]" style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-bright))' }}>
              {(p?.displayName || 'G').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-[var(--cream)] truncate">{p?.displayName}</h1>
            <p className="text-xs text-[var(--pewter)] truncate">{p?.email}</p>
            <p className="text-[10px] text-[var(--pewter)] mt-1">
              {data.userId && <span className="mr-3">ID: {data.userId}</span>}
              {memberSince && <span className="inline-flex items-center gap-1"><Clock size={10} aria-hidden /> Member since {memberSince}</span>}
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end">
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
              <Wallet size={14} aria-hidden /> {pts?.balance ?? 0}
            </span>
            <span className="text-[10px] text-[var(--pewter)]">points</span>
          </div>
        </div>

        {data.degraded?.length ? (
          <p className="text-xs text-[var(--pewter)] mb-4">
            Some sections could not load: {data.degraded.join(', ')}.
          </p>
        ) : null}

        {/* Points — the one balance, from the one account */}
        <SectionCard title="Points" icon={<Sparkles size={15} aria-hidden />} viewAllHref="/points">
          <div className="flex gap-5 flex-wrap mb-3 text-xs text-[var(--cream)]">
            <span><strong style={{ color: 'var(--gold-bright)' }}>{pts?.balance ?? 0}</strong> balance</span>
            <span><strong style={{ color: 'var(--mario-green, #06d6a0)' }}>+{pts?.earned ?? 0}</strong> earned</span>
            <span><strong style={{ color: '#ff8a8a' }}>-{pts?.spent ?? 0}</strong> spent</span>
          </div>
          {pts?.history?.length ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {pts.history.slice(0, 8).map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-[var(--pewter)]">
                  <span className="truncate">{h.label || 'Points'}{h.date ? ` · ${fmtDate(h.date)}` : ''}</span>
                  <span style={{ color: h.type === 'earn' ? 'var(--mario-green, #06d6a0)' : '#ff8a8a' }}>
                    {h.type === 'earn' ? '+' : '-'}{h.amount}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No points activity yet.</Empty>
          )}
        </SectionCard>

        <SectionCard title="Recently Watched" icon={<History size={15} aria-hidden />} viewAllHref="/murastream/history">
          {lib?.history?.length ? (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {lib.history.slice(0, 8).map((h, i) => (
                <Link key={`${h.id}-${i}`} href={`/murastream/${h.mediaType || 'movie'}/${h.id}`} className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  {POSTER(h.posterPath) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={POSTER(h.posterPath)} alt="" loading="lazy" className="w-9 rounded-md object-cover" style={{ height: '52px' }} />
                  ) : (
                    <div className="w-9 rounded-md bg-white/10" style={{ height: '52px' }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--cream)] truncate">{h.title}</p>
                    {h.date && <p className="text-[10px] text-[var(--pewter)]">{fmtDate(h.date)}</p>}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <Empty>Nothing watched yet.</Empty>
          )}
        </SectionCard>

        <SectionCard title="Watchlist" icon={<Bookmark size={15} aria-hidden />} viewAllHref="/murastream/my-list">
          <PosterStrip items={(lib?.watchlist || []).slice(0, 14)} emptyLabel="Your watchlist is empty — tap + on any poster." />
        </SectionCard>

        <SectionCard title="Favorites" icon={<Heart size={15} aria-hidden />} viewAllHref="/favorites">
          {data.favorites?.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {data.favorites.slice(0, 12).map((f) => (
                <div key={`${f.contentType}-${f.contentId}`} className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
                  {f.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.image} alt="" loading="lazy" className="w-8 h-12 rounded object-cover" />
                  ) : null}
                  <span className="text-[11px] text-[var(--cream)] truncate">{f.title}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No favorites yet — tap the heart on any poster.</Empty>
          )}
        </SectionCard>

        <SectionCard title="Recent Orders" icon={<Package size={15} aria-hidden />} viewAllHref="/orders">
          {data.orders?.length ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {data.orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between text-xs text-[var(--pewter)]">
                  <span className="truncate">#{o.id.slice(-8).toUpperCase()} · {o.status}{o.createdAt ? ` · ${fmtDate(o.createdAt)}` : ''}</span>
                  <span className="text-[var(--cream)]">₱{o.total.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No orders yet.</Empty>
          )}
        </SectionCard>

        <SectionCard title="Games & Achievements" icon={<Star size={15} aria-hidden />} viewAllHref="/games">
          <div className="flex gap-5 flex-wrap mb-3 text-xs text-[var(--cream)]">
            <span><strong style={{ color: 'var(--gold-bright)' }}>{data.games?.totalXp ?? 0}</strong> total XP</span>
            <span><strong style={{ color: 'var(--gold-bright)' }}>{data.games?.achievements ?? 0}</strong> achievements</span>
          </div>
          {gameRows.length ? (
            <div className="space-y-1">
              {gameRows.map((g) => (
                <div key={g.gameId} className="flex items-center justify-between text-xs text-[var(--pewter)]">
                  <span>{g.gameId} · level {g.level}</span>
                  <span>{g.plays} plays · {g.bestScore} best</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No game progress yet.</Empty>
          )}
        </SectionCard>

        <SectionCard title="Letters" icon={<Mail size={15} aria-hidden />} viewAllHref="/untold-words/my">
          {data.letters?.length ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {data.letters.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs text-[var(--pewter)]">
                  <span className="truncate">{l.title} · to {l.recipient}</span>
                  <span>{fmtDate(l.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No letters written yet.</Empty>
          )}
        </SectionCard>

        <SectionCard title="Support" icon={<LifeBuoy size={15} aria-hidden />} viewAllHref="/support">
          {data.support?.length ? (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {data.support.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs text-[var(--pewter)]">
                  <span className="truncate">{t.subject}</span>
                  <span>{t.status}{t.lastActivity ? ` · ${fmtDate(t.lastActivity)}` : ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No support tickets.</Empty>
          )}
        </SectionCard>

        <SectionCard title="Recent Activity" icon={<MessageSquare size={15} aria-hidden />}>
          {data.activity?.length ? (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {data.activity.slice(0, 12).map((a, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-[var(--pewter)]">
                  <span className="truncate">{a.text}</span>
                  <span>{fmtDate(a.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No recent activity.</Empty>
          )}
        </SectionCard>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { href: '/murastream/vault-watch', label: 'Vault', icon: <TrendingUp size={14} aria-hidden /> },
            { href: '/murastream/library', label: 'Library', icon: <Bookmark size={14} aria-hidden /> },
            { href: '/murastream/settings', label: 'Preferences', icon: <User size={14} aria-hidden /> },
            { href: '/profile', label: 'My Profile', icon: <Shield size={14} aria-hidden /> },
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
          <Gamepad2 size={10} aria-hidden /> Everything here is attached to one account — ID {data.userId}
        </p>
      </div>
    </main>
  );
}