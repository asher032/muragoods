'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { PixelDivider } from '@/app/components/PixelDivider';
import { PixelArt } from '@/app/components/PixelArt';

interface LeaderboardEntry {
  rank: number;
  name: string;
  email: string;
  totalSpent: number;
  orderCount: number;
  coinsEarned: number;
  deliveredCount: number;
  displayName: string;
}

const rankTitles: Record<number, string> = {
  1: 'WORLD CHAMPION',
  2: '2ND PLACE HERO',
  3: '3RD PLACE LEGEND',
};

const rankColors: Record<number, string> = {
  1: 'var(--gold-bright)',
  2: 'var(--cream)',
  3: '#CD7F32',
};

const rankIcons: Record<number, string> = {
  1: '👑',
  2: '🥈',
  3: '🥉',
};

const tierBgs: Record<number, string> = {
  1: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(242,201,76,0.1))',
  2: 'linear-gradient(135deg, rgba(242,240,228,0.15), rgba(242,240,228,0.05))',
  3: 'linear-gradient(135deg, rgba(205,127,50,0.15), rgba(205,127,50,0.05))',
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUser(user.email || '');
      } catch { /* empty */ }
    }

    async function fetchLeaderboard() {
      try {
        const res = await fetch('/api/leaderboard');
        const result = await res.json();
        if (result.success && Array.isArray(result.data)) {
          setEntries(result.data);
        } else {
          setError('No leaderboard data available yet.');
        }
      } catch {
        setError('Failed to load leaderboard.');
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="High Scores" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '64rem' }}>
          <PixelDivider variant="starBurst" />

          {/* Header */}
          <div className="text-center mb-10">
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl text-[var(--cream)] uppercase"
              style={{ fontFamily: 'var(--font-arcade)', textShadow: '4px 4px 0px var(--gold-dark)' }}
            >
              🏆 HIGH SCORES
            </h1>
            <div className="h-[2px] w-48 bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent mx-auto mt-4" />
            <p className="mt-4 text-base text-[var(--gold)]">
              Top spenders on Muragoods — earn coins to climb the ranks!
            </p>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-16">
              <p className="text-[var(--gold-bright)] animate-pulse" style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px' }}>
                LOADING HIGH SCORES...
              </p>
            </div>
          )}

          {/* Error / Empty */}
          {!loading && (error || entries.length === 0) && (
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] p-12 text-center rounded-2xl">
              <PixelArt variant="question-block" size={4} />
              <p className="text-sm text-[var(--cream)] mb-2 mt-6" style={{ fontFamily: 'var(--font-arcade)' }}>
                {error || 'NO SCORES YET!'}
              </p>
              <p className="text-sm text-[var(--pewter)] mb-6">Be the first to place an order and claim the top spot!</p>
              <Link href="/menu" className="deco-btn deco-btn-gold rounded-xl">Start Shopping</Link>
            </div>
          )}

          {/* ─── Top 3 Podium ──────────────────────────────── */}
          {!loading && top3.length > 0 && (
            <div className="mb-10">
              {/* Podium layout: 2nd, 1st, 3rd */}
              <div className="flex items-end justify-center gap-3 sm:gap-5 mb-6">
                {[1, 0, 2].map((podiumIndex) => {
                  const entry = top3[podiumIndex];
                  if (!entry) return <div key={podiumIndex} className="w-24 sm:w-32" />;
                  const rank = entry.rank;
                  const isFirst = rank === 1;
                  return (
                    <div
                      key={podiumIndex}
                      className={`flex flex-col items-center slide-in ${isFirst ? 'sm:-mt-4' : ''}`}
                      style={{ animationDelay: `${podiumIndex * 0.15}s` }}
                    >
                      {/* Crown for 1st */}
                      {isFirst && (
                        <div className="text-3xl sm:text-4xl mb-2 coin-float">👑</div>
                      )}

                      {/* Avatar / Badge */}
                      <div
                        className={`relative mb-3 flex items-center justify-center border-3 ${
                          isFirst ? 'w-16 h-16 sm:w-20 sm:h-20' : 'w-14 h-14 sm:w-16 sm:h-16'
                        } rounded-full shadow-lg`}
                        style={{
                          background: isFirst
                            ? 'linear-gradient(135deg, var(--gold), var(--gold-dark))'
                            : rank === 2
                            ? 'linear-gradient(135deg, var(--cream), #B8B8A8)'
                            : 'linear-gradient(135deg, #CD7F32, #A0622E)',
                          borderColor: rankColors[rank],
                          boxShadow: isFirst ? '0 0 30px rgba(212,175,55,0.4)' : 'none',
                        }}
                      >
                        <span
                          className="text-xl sm:text-2xl"
                          style={{ fontFamily: 'var(--font-arcade)', color: 'var(--obsidian)' }}
                        >
                          {entry.displayName?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>

                      {/* Name */}
                      <p
                        className="text-[9px] sm:text-[10px] text-center uppercase tracking-wider max-w-[120px] truncate"
                        style={{ fontFamily: 'var(--font-arcade)', color: rankColors[rank] }}
                      >
                        {entry.displayName}
                      </p>

                      {/* Rank Title */}
                      <p
                        className="text-[7px] sm:text-[8px] text-[var(--pewter)] uppercase mt-1"
                        style={{ fontFamily: 'var(--font-arcade)' }}
                      >
                        {rankTitles[rank]}
                      </p>

                      {/* Score */}
                      <div className="mt-2 text-center">
                        <p className="coin-price text-base sm:text-lg">₱{entry.totalSpent}</p>
                        <p
                          className="text-[8px] text-[var(--gold)] mt-1"
                          style={{ fontFamily: 'var(--font-arcade)' }}
                        >
                          🪙 {entry.coinsEarned}
                        </p>
                      </div>

                      {/* Podium bar */}
                      <div
                        className="mt-3 border-2 w-24 sm:w-32 flex items-center justify-center"
                        style={{
                          height: isFirst ? '80px' : rank === 2 ? '60px' : '45px',
                          background: tierBgs[rank],
                          borderColor: rankColors[rank],
                        }}
                      >
                        <span
                          className="text-lg sm:text-xl"
                          style={{ fontFamily: 'var(--font-arcade)', color: rankColors[rank] }}
                        >
                          #{rank}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Divider ──────────────────────────────────── */}
          {!loading && entries.length > 3 && (
            <div className="mb-6">
              <div className="h-[2px] bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent" />
            </div>
          )}

          {/* ─── Remaining Ranks ──────────────────────────── */}
          {!loading && rest.length > 0 && (
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[60px_1fr_80px_80px_80px] sm:grid-cols-[70px_1fr_100px_100px_100px] gap-2 p-4 border-b-2 border-[var(--gold)] bg-[var(--charcoal-light)]">
                <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Rank</p>
                <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Player</p>
                <p className="text-[8px] text-[var(--gold)] uppercase text-right hidden sm:block" style={{ fontFamily: 'var(--font-arcade)' }}>Orders</p>
                <p className="text-[8px] text-[var(--gold)] uppercase text-right hidden sm:block" style={{ fontFamily: 'var(--font-arcade)' }}>Coins</p>
                <p className="text-[8px] text-[var(--gold)] uppercase text-right" style={{ fontFamily: 'var(--font-arcade)' }}>Total</p>
              </div>

              {/* Rows */}
              {rest.map((entry, i) => {
                const isYou = entry.email === currentUser;
                return (
                  <div
                    key={entry.email}
                    className={`grid grid-cols-[60px_1fr_80px_80px_80px] sm:grid-cols-[70px_1fr_100px_100px_100px] gap-2 p-4 border-b border-[rgba(242,240,228,0.08)] transition-colors hover:bg-[var(--charcoal-light)] slide-in ${
                      isYou ? 'bg-[rgba(212,175,55,0.08)] border-l-2 border-l-[var(--gold)]' : ''
                    }`}
                    style={{ animationDelay: `${i * 0.05}s` }}
                  >
                    {/* Rank */}
                    <div className="flex items-center">
                      <span
                        className="text-xs text-[var(--pewter)]"
                        style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}
                      >
                        {entry.rank}
                      </span>
                    </div>

                    {/* Name */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-xs text-[var(--cream)] truncate"
                        style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}
                      >
                        {entry.displayName}
                      </span>
                      {isYou && (
                        <span className="deco-badge deco-badge-gold shrink-0" style={{ fontSize: '6px', padding: '2px 6px' }}>
                          YOU
                        </span>
                      )}
                    </div>

                    {/* Orders */}
                    <div className="hidden sm:flex items-center justify-end">
                      <span className="text-xs text-[var(--cream-muted)]">{entry.orderCount}</span>
                    </div>

                    {/* Coins */}
                    <div className="hidden sm:flex items-center justify-end">
                      <span className="text-xs text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}>🪙 {entry.coinsEarned}</span>
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-end">
                      <span className="coin-price text-sm">₱{entry.totalSpent}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Your Rank (if logged in and not in top display) ── */}
          {!loading && currentUser && entries.length > 0 && (() => {
            const yourEntry = entries.find(e => e.email === currentUser);
            if (!yourEntry || yourEntry.rank <= rest.length + 3) return null;
            return (
              <div className="mt-4 border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.08)] rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">📍</span>
                  <div>
                    <p className="text-[9px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Your Rank</p>
                    <p className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>#{yourEntry.rank} — {yourEntry.displayName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="coin-price">₱{yourEntry.totalSpent}</span>
                  <p className="text-[8px] text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>🪙 {yourEntry.coinsEarned}</p>
                </div>
              </div>
            );
          })()}

          {/* ─── Footer ──────────────────────────────────── */}
          <div className="text-center mt-10">
            <PixelDivider variant="ziggurat" />
            <div className="mt-6 flex flex-wrap gap-4 justify-center">
              <Link href="/menu" className="deco-btn deco-btn-gold rounded-xl">🛒 Place an Order</Link>
              <Link href="/play/spin" className="deco-btn deco-btn-crimson rounded-xl">🎰 Spin to Earn</Link>
              <Link href="/play/refer" className="deco-btn rounded-xl">👥 Refer Friends</Link>
            </div>
            <p className="mt-6 text-[8px] text-[var(--pewter)] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)' }}>
              Rankings update with every confirmed order — keep ordering to climb!
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
