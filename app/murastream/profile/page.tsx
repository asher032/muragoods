'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMuraStreamStore } from '../hooks/useMuraStreamStore';
import {
  UserIcon, FilmIcon, TvIcon, PlayIcon, HeartIcon, StarIcon,
  ClockIcon, BookIcon, ChevronRightIcon, TrashIcon, SignOutIcon,
  AlertIcon, GearIcon, PackageIcon, ScrollIcon,
} from '../components/MuraStreamIcons';

type UserProfile = { name: string; email: string; role: string } | null;

type MiniOrder = {
  _id: string;
  total: number;
  status: string;
  items: string[];
  createdAt: string;
};

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div style={{
      background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A',
      padding: '18px 16px', flex: '1 1 130px', minWidth: '130px',
    }}>
      <div style={{ color: '#E50914', marginBottom: '10px' }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-arcade)', fontSize: '22px', color: '#E5E5E5', marginBottom: '4px' }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#666', letterSpacing: '0.1em' }}>
        {label}
      </div>
    </div>
  );
}

function Row({ icon, label, value, href, onClick, danger }: {
  icon: React.ReactNode; label: string; value?: React.ReactNode;
  href?: string; onClick?: () => void; danger?: boolean;
}) {
  const inner = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: danger ? '#e63946' : '#E50914', display: 'flex' }}>{icon}</span>
        <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '13px', color: danger ? '#e63946' : '#E5E5E5' }}>{label}</span>
      </span>
      {value !== undefined
        ? <span style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#E50914' }}>{value}</span>
        : <ChevronRightIcon size={14} color="#555" />}
    </>
  );
  const base = {
    width: '100%', padding: '14px 16px', borderBottom: '1px solid #1A1A1A',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'none', border: '1px solid transparent', borderTop: 'none',
    cursor: href || onClick ? 'pointer' : 'default', textAlign: 'left' as const,
    textDecoration: 'none',
  };
  if (href) return <Link href={href} style={{ ...base, borderBottom: '1px solid #1A1A1A' }}>{inner}</Link>;
  return <button onClick={onClick} style={base}>{inner}</button>;
}

export default function MuraStreamProfilePage() {
  const router = useRouter();
  const { likes, myList, history, settings, clearAllLibrary } = useMuraStreamStore();
  const [user, setUser] = useState<UserProfile>(null);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [orders, setOrders] = useState<MiniOrder[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const parsed = JSON.parse(raw);
        setUser({ name: parsed.name || 'User', email: parsed.email || '', role: parsed.role || 'user' });
      }
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  // Real MuraGoods order history — same account, same database.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      const email = raw ? JSON.parse(raw)?.email : null;
      if (!email) return;
      fetch(`/api/orders?userId=${encodeURIComponent(email)}`)
        .then(r => (r.ok ? r.json() : { data: [] }))
        .then(d => setOrders((d.data || []).slice(0, 3)))
        .catch(() => { /* empty */ });
    } catch { /* empty */ }
  }, []);

  const handleSignOut = () => {
    try { localStorage.removeItem('user'); } catch { /* empty */ }
    router.push('/login');
  };

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 5000);
      return;
    }
    clearAllLibrary();
    setConfirmClear(false);
  };

  if (loading) {
    return (
      <div style={{ padding: '24px 28px', maxWidth: '600px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#666' }}>Loading profile…</p>
      </div>
    );
  }

  const moviesWatched = history.filter(h => h.mediaType === 'movie').length;
  const tvWatched = history.filter(h => h.mediaType === 'tv').length;
  const totalEpisodes = history.filter(h => h.mediaType === 'tv' && h.episode).length;
  const initials = (user?.name || 'U').trim().charAt(0).toUpperCase();

  return (
    <div style={{ padding: '24px 28px', maxWidth: '600px' }}>
      {/* Header */}
      <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#E5E5E5', margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <UserIcon size={18} color="#E50914" /> PROFILE
      </h1>

      {/* User Card */}
      <div style={{
        background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A',
        padding: '24px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px',
      }}>
        <div style={{
          width: '60px', height: '60px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #E50914, #B20710)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-arcade)', fontSize: '24px', color: '#FFF', flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#E5E5E5', margin: 0 }}>
            {user?.name || 'Not signed in'}
          </p>
          <p style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: '12px', color: '#666', margin: '4px 0 0', wordBreak: 'break-all' }}>
            {user?.email || 'Sign in to sync your library across devices'}
          </p>
          {user?.role === 'admin' && (
            <span style={{
              fontFamily: 'var(--font-arcade)', fontSize: '7px', color: '#facc15',
              background: 'rgba(250,204,21,0.12)', padding: '2px 8px', borderRadius: '4px',
              marginTop: '4px', display: 'inline-block',
            }}>ADMIN</span>
          )}
        </div>
        <Link href="/account/profile" title="Edit your MuraGoods account"
          style={{ color: '#888', display: 'flex', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
          <GearIcon size={15} />
        </Link>
      </div>

      {!user && (
        <div style={{
          background: 'rgba(229,9,20,0.08)', border: '1px solid rgba(229,9,20,0.3)',
          borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: '#A0A0A0',
        }}>
          <Link href="/login" style={{ color: '#E50914', textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
          {' '}to sync likes, My List, and watch history to your account.
        </div>
      )}

      {/* Watch Stats */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#555', letterSpacing: '0.15em', margin: '0 0 12px' }}>
          WATCH STATS
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <StatCard label="MOVIES" value={moviesWatched} icon={<FilmIcon size={20} />} />
          <StatCard label="TV SHOWS" value={tvWatched} icon={<TvIcon size={20} />} />
          <StatCard label="EPISODES" value={totalEpisodes} icon={<PlayIcon size={20} />} />
        </div>
      </div>

      {/* Library */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#555', letterSpacing: '0.15em', margin: '0 0 12px' }}>
          LIBRARY
        </p>
        <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A', overflow: 'hidden' }}>
          <Row icon={<HeartIcon size={15} />} label="Likes" value={likes.length} href="/murastream/likes" />
          <Row icon={<StarIcon size={15} />} label="My List" value={myList.length} href="/murastream/my-list" />
          <Row icon={<ClockIcon size={15} />} label="Watch History" value={history.length} href="/murastream/history" />
          <Row icon={<BookIcon size={15} />} label="Library" href="/murastream/library" />
        </div>
      </div>

      {/* MuraGoods Orders */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#555', letterSpacing: '0.15em', margin: '0 0 12px' }}>
          MURAGOODS ORDERS
        </p>
        <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A', overflow: 'hidden' }}>
          {orders.length === 0 ? (
            <div style={{ padding: '14px 16px', fontSize: 13, color: '#666' }}>
              No orders yet — <Link href="/menu" style={{ color: '#E50914', textDecoration: 'none' }}>grab a snack</Link> from the MuraGoods menu.
            </div>
          ) : (
            <>
              {orders.map((o, i) => (
                <Link key={o._id} href={`/order/${o._id}`} style={{
                  padding: '14px 16px', borderTop: i === 0 ? 'none' : '1px solid #1A1A1A',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ color: '#E50914', display: 'flex' }}><PackageIcon size={15} /></span>
                    <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: 13, color: '#E5E5E5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(o.items || []).join(', ') || 'Order'} — ₱{o.total}
                    </span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-arcade)', fontSize: 8, color: '#06d6a0', flexShrink: 0, marginLeft: 8 }}>{o.status}</span>
                </Link>
              ))}
              <Link href="/account/orders" style={{
                padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none',
              }}>
                <span style={{ fontFamily: '"Lucida Sans", sans-serif', fontSize: 13, color: '#E50914' }}>View all orders</span>
                <ChevronRightIcon size={14} color="#555" />
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#555', letterSpacing: '0.15em', margin: '0 0 12px' }}>
          QUICK LINKS
        </p>
        <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A', overflow: 'hidden' }}>
          <Row icon={<GearIcon size={15} />} label="Settings" href="/murastream/settings" />
          <Row icon={<ScrollIcon size={15} />} label="What's New" href="/murastream/changelog" />
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px', color: '#555', letterSpacing: '0.15em', margin: '0 0 12px' }}>
          ACCOUNT
        </p>
        <div style={{ background: '#111', borderRadius: '12px', border: '1px solid #1A1A1A', overflow: 'hidden' }}>
          <Row
            icon={confirmClear ? <AlertIcon size={15} /> : <TrashIcon size={15} />}
            label={confirmClear ? 'Click again to confirm' : 'Clear All Library Data'}
            onClick={handleClearAll}
            danger
          />
          <Row icon={<SignOutIcon size={15} />} label="Sign Out" onClick={handleSignOut} danger />
        </div>
      </div>
    </div>
  );
}
