'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';
import { GAMES, type Game, type GamePackage, getMargin, getMarginPercent } from '@/app/lib/game-catalog';

export default function AdminGamesPage() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>(GAMES);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [editingPackage, setEditingPackage] = useState<GamePackage | null>(null);
  const [filter, setFilter] = useState<string>('all');

  // Check admin
  useState(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!['muragoods0@gmail.com', 'mhaxthedog@gmail.com'].includes(user.email)) router.push('/');
  });

  const filteredGames = filter === 'all' ? games : games.filter(g => g.category === filter);

  const toggleActive = (gameId: string) => {
    setGames(prev => prev.map(g => g.id === gameId ? { ...g, active: !g.active } : g));
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Admin — Games" />
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 16px' }}>
        <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a', marginBottom: '16px' }}>GAME MANAGEMENT</h2>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '20px' }}>
          {/* Earnings Summary */}
          {(() => {
            const allPackages = games.flatMap(g => g.packages);
            const totalRevenue = allPackages.reduce((s, p) => s + p.price, 0);
            const totalCost = allPackages.reduce((s, p) => s + (p.costPrice || 0), 0);
            const totalMargin = totalRevenue - totalCost;
            const avgMargin = allPackages.length > 0 ? Math.round(totalMargin / allPackages.length) : 0;
            return (
              <div style={{ background: 'linear-gradient(135deg, rgba(6,214,160,0.06), rgba(255,214,10,0.04))', borderRadius: '10px', padding: '16px', border: '1px solid rgba(6,214,160,0.15)', marginBottom: '16px' }}>
                <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)', marginBottom: '10px' }}>💰 EARNINGS OVERVIEW</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {[
                    { label: 'Revenue (all)', value: `₱${totalRevenue.toLocaleString()}`, color: '#fff' },
                    { label: 'Cost (all)', value: `₱${totalCost.toLocaleString()}`, color: '#888' },
                    { label: 'Total Margin', value: `₱${totalMargin.toLocaleString()}`, color: '#06d6a0' },
                    { label: 'Avg Margin/Item', value: `₱${avgMargin}`, color: '#ffd60a' },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '14px', fontWeight: 900, color: s.color, fontFamily: 'var(--font-arcade)' }}>{s.value}</p>
                      <p style={{ fontSize: '8px', color: '#888', marginTop: '2px' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
          {[
            { label: 'Total Games', value: games.length, color: '#fff' },
            { label: 'Active', value: games.filter(g => g.active).length, color: '#06d6a0' },
            { label: 'Disabled', value: games.filter(g => !g.active).length, color: '#e63946' },
            { label: 'Total Packages', value: games.reduce((sum, g) => sum + g.packages.length, 0), color: '#ffd60a' },
          ].map(s => (
            <div key={s.label} style={{ background: '#1a1a2e', borderRadius: '8px', padding: '12px', border: '1px solid #2e2e2e', textAlign: 'center' }}>
              <p style={{ fontSize: '16px', fontWeight: 900, color: s.color, fontFamily: 'var(--font-arcade)' }}>{s.value}</p>
              <p style={{ fontSize: '8px', color: '#888', marginTop: '4px' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Category Filter */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {['all', 'Mobile', 'PC', 'Gift Cards'].map(cat => (
            <button key={cat} onClick={() => setFilter(cat)}
              style={{
                padding: '6px 12px', borderRadius: '6px', border: 'none',
                background: filter === cat ? 'rgba(255,214,10,0.15)' : '#222',
                color: filter === cat ? '#ffd60a' : '#888', fontSize: '9px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-arcade)',
              }}>
              {cat === 'all' ? 'ALL' : cat.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Games Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredGames.map(game => (
            <div key={game.id} style={{ background: '#1a1a2e', borderRadius: '10px', border: '1px solid #2e2e2e', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px' }}>
                <span style={{ fontSize: '22px' }}>{game.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{game.name}</p>
                    <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '3px', background: '#222', color: '#888' }}>{game.category}</span>
                    {!game.active && <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '3px', background: 'rgba(230,57,70,0.15)', color: '#e63946', fontWeight: 700 }}>DISABLED</span>}
                  </div>
                  <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>{game.packages.length} packages · {game.region.join(', ')} · From ₱{Math.min(...game.packages.map(p => p.price))}</p>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button onClick={() => setSelectedGame(selectedGame?.id === game.id ? null : game)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', background: '#222', color: '#888', fontSize: '9px', cursor: 'pointer', fontFamily: 'var(--font-arcade)' }}>
                    {selectedGame?.id === game.id ? 'CLOSE' : 'VIEW'}
                  </button>
                  <button onClick={() => toggleActive(game.id)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', background: game.active ? 'rgba(6,214,160,0.1)' : 'rgba(230,57,70,0.1)', color: game.active ? '#06d6a0' : '#e63946', fontSize: '9px', cursor: 'pointer', fontFamily: 'var(--font-arcade)' }}>
                    {game.active ? 'ACTIVE' : 'DISABLED'}
                  </button>
                </div>
              </div>

              {/* Expanded: Package List */}
              {selectedGame?.id === game.id && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid #2e2e2e' }}>
                  <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)', margin: '12px 0 8px' }}>PACKAGES</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                    {game.packages.map(pkg => (
                      <div key={pkg.id} style={{ background: '#222', borderRadius: '8px', padding: '10px 12px', border: editingPackage?.id === pkg.id ? '1px solid #ffd60a' : '1px solid #333' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <p style={{ fontSize: '10px', fontWeight: 600, color: '#fff' }}>{pkg.name}</p>
                          {pkg.badge && <span style={{ fontSize: '7px', padding: '1px 4px', borderRadius: '3px', background: 'rgba(255,214,10,0.15)', color: '#ffd60a' }}>{pkg.badge}</span>}
                        </div>
                        <p style={{ fontSize: '12px', fontWeight: 900, color: '#ffd60a', fontFamily: 'var(--font-arcade)', marginTop: '4px' }}>₱{pkg.price}</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                          <p style={{ fontSize: '8px', color: '#666' }}>{pkg.amount} {pkg.currency}</p>
                          <p style={{ fontSize: '8px', color: '#06d6a0', fontWeight: 600 }}>+₱{getMargin(pkg)} ({getMarginPercent(pkg)}%)</p>
                        </div>
                        <p style={{ fontSize: '7px', color: '#555', marginTop: '1px' }}>Cost: ₱{pkg.costPrice || 0}</p>
                      </div>
                    ))}
                  </div>

                  {/* Account Fields */}
                  <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)', margin: '12px 0 8px' }}>ACCOUNT FIELDS</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {game.accountFields.map(f => (
                      <span key={f.id} style={{ fontSize: '9px', padding: '4px 8px', borderRadius: '4px', background: '#222', color: '#ccc' }}>
                        {f.label} {f.required && <span style={{ color: '#e63946' }}>*</span>}
                      </span>
                    ))}
                  </div>

                  {/* ID Guide */}
                  <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)', margin: '12px 0 8px' }}>ID GUIDE</p>
                  <div style={{ background: '#222', borderRadius: '8px', padding: '10px 12px' }}>
                    {game.idGuideSteps.map((step, i) => (
                      <p key={i} style={{ fontSize: '9px', color: '#aaa', marginBottom: '4px' }}>{i + 1}. {step}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
