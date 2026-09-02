'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';
import { GAMES, TOPUP_PAYMENT_METHODS, type Game, type GamePackage, type PaymentMethodOption, type GameCategory } from '@/app/lib/game-catalog';

type WizardStep = 'browse' | 'account' | 'package' | 'review' | 'payment';

const CATEGORIES: { label: string; value: GameCategory | 'all' | 'popular'; icon: string }[] = [
  { label: 'All', value: 'all', icon: '🎮' },
  { label: 'Popular', value: 'popular', icon: '🔥' },
  { label: 'Mobile', value: 'Mobile', icon: '📱' },
  { label: 'PC', value: 'PC', icon: '🖥️' },
  { label: 'Gift Cards', value: 'Gift Cards', icon: '🎁' },
];

export default function TopUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>('browse');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [accountData, setAccountData] = useState<Record<string, string>>({});
  const [accountConfirmed, setAccountConfirmed] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<GamePackage | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethodOption | null>(null);
  const [showIdGuide, setShowIdGuide] = useState(false);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // ─── Filtered Games ──────────────────────────────────────
  const filteredGames = useMemo(() => {
    let list = GAMES.filter(g => g.active);
    if (activeCategory === 'popular') list = list.filter(g => g.popular);
    else if (activeCategory !== 'all') list = list.filter(g => g.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(g => g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q));
    }
    return list;
  }, [search, activeCategory]);

  const popularGames = useMemo(() => GAMES.filter(g => g.active && g.popular), []);

  // ─── Handlers ────────────────────────────────────────────
  const handleGameSelect = (game: Game) => {
    setSelectedGame(game);
    setAccountData({});
    setAccountConfirmed(false);
    setSelectedPackage(null);
    setSelectedPayment(null);
    setError('');
    setStep('account');
  };

  const handleAccountConfirm = () => {
    if (!selectedGame) return;
    const missing = selectedGame.accountFields.filter(f => f.required && !accountData[f.id]?.trim());
    if (missing.length > 0) { setError(`Please fill in: ${missing.map(f => f.label).join(', ')}`); return; }
    setError('');
    setAccountConfirmed(true);
    setStep('package');
  };

  const handlePackageSelect = (pkg: GamePackage) => { setSelectedPackage(pkg); setStep('review'); };

  const handlePay = async () => {
    if (!selectedGame || !selectedPackage || !selectedPayment) return;
    setIsProcessing(true);
    setError('');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    try {
      const res = await fetch('/api/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: selectedGame.id, accountDetails: accountData, packageId: selectedPackage.id,
          paymentMethod: selectedPayment.id, customerEmail: user.email || '', customerName: user.name || 'Customer',
        }),
      });
      const result = await res.json();
      if (result.success) {
        if (result.data.checkoutUrl?.startsWith('http')) window.location.href = result.data.checkoutUrl;
        else router.push(result.data.checkoutUrl || `/topup/success?orderId=${result.data.orderId}`);
      } else { setError(result.error || 'Failed to create order'); setIsProcessing(false); }
    } catch { setError('Failed to connect. Please try again.'); setIsProcessing(false); }
  };

  const currentStepIndex = (['browse', 'account', 'package', 'review', 'payment'] as WizardStep[]).indexOf(step);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Top-Up" />
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 16px' }}>

        {/* ─── Step Progress ──────────────────────────────── */}
        {step !== 'browse' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
            <button onClick={() => { if (step === 'account') setStep('browse'); else if (step === 'package') setStep('account'); else if (step === 'review') setStep('package'); else if (step === 'payment') setStep('review'); }}
              style={{ fontSize: '11px', color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>← Back</button>
            <span style={{ color: '#444', margin: '0 4px' }}>|</span>
            <span style={{ fontSize: '10px', color: '#ffd60a', fontFamily: 'var(--font-arcade)' }}>STEP {currentStepIndex + 1}/5</span>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 1: BROWSE GAMES
            ═══════════════════════════════════════════════════ */}
        {step === 'browse' && (
          <div className="page-enter">
            {/* Hero Header */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#ffd60a', marginBottom: '4px' }}>
                🎮 GAMES & TOP-UP
              </h1>
              <p style={{ fontSize: '12px', color: '#888' }}>Instant top-up for your favorite games</p>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Search games..." className="input_field"
                style={{ paddingLeft: '16px', background: '#1a1a2e', borderColor: search ? 'rgba(255,214,10,0.3)' : '#2e2e2e' }} />
              {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px' }}>✕</button>}
            </div>

            {/* Category Tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
              {CATEGORIES.map(cat => (
                <button key={cat.value} onClick={() => { setActiveCategory(cat.value); setSearch(''); }}
                  style={{
                    padding: '7px 14px', borderRadius: '20px', border: 'none', whiteSpace: 'nowrap',
                    background: activeCategory === cat.value ? 'rgba(255,214,10,0.15)' : '#1a1a2e',
                    color: activeCategory === cat.value ? '#ffd60a' : '#888',
                    fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-arcade)',
                    transition: 'all 0.2s',
                  }}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            {/* Popular Games (only show when viewing all) */}
            {activeCategory === 'all' && !search && (
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a', marginBottom: '12px' }}>🔥 POPULAR GAMES</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                  {popularGames.slice(0, 4).map(game => (
                    <button key={game.id} onClick={() => handleGameSelect(game)}
                      style={{
                        padding: '16px 12px', borderRadius: '12px', border: '1px solid #2e2e2e',
                        background: `linear-gradient(135deg, ${game.logoColor}33, #1a1a2e)`,
                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', position: 'relative',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,214,10,0.3)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2e2e2e'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}>
                      <span style={{ fontSize: '28px', display: 'block', marginBottom: '8px' }}>{game.icon}</span>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>{game.name}</p>
                      <p style={{ fontSize: '9px', color: '#888' }}>{game.packages[0]?.currency} · ₱{game.packages[0]?.price}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* All Games */}
            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#888', marginBottom: '12px' }}>
              {activeCategory === 'all' && !search ? '📱 ALL GAMES' : search ? `RESULTS FOR "${search.toUpperCase()}"` : activeCategory.toUpperCase()}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredGames.map(game => (
                <button key={game.id} onClick={() => handleGameSelect(game)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px',
                    borderRadius: '12px', background: '#1a1a2e', border: '1px solid #2e2e2e',
                    cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,214,10,0.2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2e2e2e'; }}>
                  <div style={{ fontSize: '24px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${game.logoColor}33`, borderRadius: '10px', flexShrink: 0 }}>
                    {game.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.name}</p>
                      {game.new && <span style={{ fontSize: '7px', background: '#06d6a0', color: '#000', padding: '1px 5px', borderRadius: '3px', fontWeight: 700, flexShrink: 0 }}>NEW</span>}
                    </div>
                    <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>{game.packages[0]?.currency} · {game.region.join(', ')} · {game.category}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: '10px', color: '#ffd60a', fontFamily: 'var(--font-arcade)' }}>from ₱{Math.min(...game.packages.map(p => p.price))}</p>
                    <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>{game.packages.length} packages</p>
                  </div>
                </button>
              ))}
              {filteredGames.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <p style={{ fontSize: '24px', marginBottom: '8px' }}>🔍</p>
                  <p style={{ color: '#666', fontSize: '12px' }}>No games found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 2: ACCOUNT ENTRY
            ═══════════════════════════════════════════════════ */}
        {step === 'account' && selectedGame && (
          <div className="page-enter">
            {/* Game Confirmation Header */}
            <div style={{ background: `linear-gradient(135deg, ${selectedGame.logoColor}33, ${selectedGame.logoColor}11)`, borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', border: '1px solid rgba(255,214,10,0.1)' }}>
              <span style={{ fontSize: '28px' }}>{selectedGame.icon}</span>
              <div>
                <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#888', letterSpacing: '0.1em' }}>YOU&apos;RE TOPPING UP</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#ffd60a' }}>{selectedGame.name}</p>
                <p style={{ fontSize: '9px', color: '#888' }}>{selectedGame.region.join(', ')} · Currency: {selectedGame.packages[0]?.currency}</p>
              </div>
            </div>

            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#fff', marginBottom: '4px' }}>STEP 2 — ACCOUNT</h2>
            <p style={{ fontSize: '10px', color: '#888', marginBottom: '16px' }}>Enter your game account details</p>

            {error && <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '11px', color: '#e63946' }}>⚠ {error}</div>}

            <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
              {selectedGame.accountFields.map(field => (
                <div key={field.id} style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#ccc', marginBottom: '6px' }}>
                    {field.label} {field.required && <span style={{ color: '#e63946' }}>*</span>}
                  </label>
                  <input type={field.type || 'text'} value={accountData[field.id] || ''} onChange={(e) => setAccountData(prev => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.placeholder} className="input_field" />
                </div>
              ))}

              {/* ID Guide Toggle */}
              <button onClick={() => setShowIdGuide(!showIdGuide)} style={{ fontSize: '10px', color: '#4895ef', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '4px' }}>
                ❓ {showIdGuide ? 'Hide' : 'Where do I find my ID?'}
              </button>
              {showIdGuide && (
                <div style={{ marginTop: '10px', padding: '14px', background: 'rgba(72,149,239,0.06)', border: '1px solid rgba(72,149,239,0.15)', borderRadius: '10px' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#4895ef', marginBottom: '8px' }}>{selectedGame.idGuide}</p>
                  {selectedGame.idGuideSteps.map((stepText, i) => (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '10px', color: '#4895ef', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                      <p style={{ fontSize: '10px', color: '#aaa', lineHeight: 1.5 }}>{stepText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Account Confirmation */}
            {accountConfirmed && (
              <div style={{ background: 'rgba(6,214,160,0.06)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
                <p style={{ fontSize: '11px', color: '#06d6a0', fontWeight: 600 }}>✓ Account details entered</p>
              </div>
            )}

            <p style={{ fontSize: '9px', color: '#666', textAlign: 'center', marginBottom: '12px' }}>⚠ We&apos;ll never ask for your game password.</p>

            <button onClick={handleAccountConfirm}
              style={{ width: '100%', padding: '14px', borderRadius: '10px', background: 'linear-gradient(135deg, #ffd60a, #f59e0b)', border: 'none', color: '#000', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-arcade)', cursor: 'pointer' }}>
              CONTINUE TO PACKAGES →
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 3: PACKAGE SELECTION
            ═══════════════════════════════════════════════════ */}
        {step === 'package' && selectedGame && (
          <div className="page-enter">
            {/* Account Summary */}
            <div style={{ background: '#1a1a2e', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', border: '1px solid #2e2e2e' }}>
              <span style={{ fontSize: '20px' }}>{selectedGame.icon}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>{selectedGame.name}</p>
                <p style={{ fontSize: '9px', color: '#888' }}>Account: {Object.values(accountData).filter(Boolean).join(' / ')}</p>
              </div>
              <span style={{ color: '#06d6a0', fontSize: '12px' }}>✓</span>
            </div>

            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#fff', marginBottom: '4px' }}>STEP 3 — SELECT TOP-UP</h2>
            <p style={{ fontSize: '10px', color: '#888', marginBottom: '16px' }}>Choose the amount you want to top up</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {selectedGame.packages.map(pkg => (
                <button key={pkg.id} onClick={() => handlePackageSelect(pkg)}
                  style={{
                    padding: '16px 12px', borderRadius: '10px', position: 'relative',
                    background: selectedPackage?.id === pkg.id ? 'rgba(255,214,10,0.1)' : '#1a1a2e',
                    border: selectedPackage?.id === pkg.id ? '1px solid #ffd60a' : '1px solid #2e2e2e',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                  }}>
                  {pkg.badge && <div style={{ position: 'absolute', top: '-6px', right: '-6px', background: pkg.badge === 'BEST VALUE' ? '#06d6a0' : pkg.badge === 'HOT' ? '#e63946' : '#4895ef', color: '#fff', fontSize: '7px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-arcade)' }}>{pkg.badge}</div>}
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{pkg.name}</p>
                  <p style={{ fontSize: '14px', fontWeight: 900, color: '#ffd60a', marginTop: '6px', fontFamily: 'var(--font-arcade)' }}>₱{pkg.price}</p>
                  {pkg.promoPrice && <p style={{ fontSize: '9px', color: '#06d6a0', marginTop: '2px' }}>Save ₱{pkg.price - pkg.promoPrice}!</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 4: REVIEW
            ═══════════════════════════════════════════════════ */}
        {step === 'review' && selectedGame && selectedPackage && (
          <div className="page-enter">
            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a', marginBottom: '4px' }}>STEP 4 — REVIEW</h2>
            <p style={{ fontSize: '11px', color: '#888', marginBottom: '20px' }}>Please check your game and account details before paying.</p>

            <div style={{ background: '#1a1a2e', borderRadius: '14px', border: '1px solid #2e2e2e', overflow: 'hidden', marginBottom: '20px' }}>
              {[
                { label: 'GAME', value: <><span style={{ fontSize: '18px', marginRight: '6px' }}>{selectedGame.icon}</span>{selectedGame.name}</>, color: '#fff' },
                { label: 'ACCOUNT', value: Object.entries(accountData).filter(([, v]) => v.trim()).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}: ${v}`).join(' / '), color: '#fff' },
                { label: 'PACKAGE', value: selectedPackage.name, color: '#ffd60a' },
                { label: 'REGION', value: selectedGame.region.join(', '), color: '#888' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: '14px 20px', borderBottom: '1px solid #2e2e2e' }}>
                  <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)', marginBottom: '4px' }}>{label}</p>
                  <p style={{ fontSize: '13px', color, fontWeight: 600 }}>{value}</p>
                </div>
              ))}
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)' }}>TOTAL</p>
                <p style={{ fontSize: '22px', fontWeight: 900, color: '#fff', fontFamily: 'var(--font-arcade)' }}>₱{selectedPackage.price}</p>
              </div>
            </div>

            {error && <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '11px', color: '#e63946' }}>⚠ {error}</div>}

            <button onClick={() => { setError(''); setStep('payment'); }}
              style={{ width: '100%', padding: '14px', borderRadius: '10px', background: 'linear-gradient(135deg, #ffd60a, #f59e0b)', border: 'none', color: '#000', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-arcade)', cursor: 'pointer' }}>
              CHOOSE PAYMENT →
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 5: PAYMENT
            ═══════════════════════════════════════════════════ */}
        {step === 'payment' && selectedGame && selectedPackage && (
          <div className="page-enter">
            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a', marginBottom: '16px' }}>STEP 5 — PAYMENT</h2>

            {/* Persistent Order Summary */}
            <div style={{ background: '#1a1a2e', borderRadius: '10px', padding: '14px', marginBottom: '20px', border: '1px solid #2e2e2e' }}>
              {[
                ['Game', `${selectedGame.icon} ${selectedGame.name}`],
                ['Account', Object.values(accountData).filter(Boolean).join(' / ')],
                ['Package', selectedPackage.name],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '10px', color: '#888' }}>{label}</span>
                  <span style={{ fontSize: '10px', color: '#fff', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #2e2e2e', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', color: '#888', fontFamily: 'var(--font-arcade)' }}>TOTAL</span>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#fff', fontFamily: 'var(--font-arcade)' }}>₱{selectedPackage.price}</span>
              </div>
            </div>

            <h3 style={{ fontSize: '11px', color: '#fff', fontWeight: 600, marginBottom: '12px' }}>Select Payment Method</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {TOPUP_PAYMENT_METHODS.map(method => (
                <button key={method.id} onClick={() => setSelectedPayment(method)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '10px',
                    background: selectedPayment?.id === method.id ? 'rgba(255,214,10,0.08)' : '#1a1a2e',
                    border: selectedPayment?.id === method.id ? '1px solid #ffd60a' : '1px solid #2e2e2e',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                  <span style={{ fontSize: '18px' }}>{method.icon}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff', flex: 1, textAlign: 'left' }}>{method.name}</span>
                  {selectedPayment?.id === method.id && <span style={{ color: '#ffd60a', fontSize: '14px' }}>✓</span>}
                </button>
              ))}
            </div>

            {error && <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '11px', color: '#e63946' }}>⚠ {error}</div>}

            <button onClick={handlePay} disabled={isProcessing || !selectedPayment}
              style={{
                width: '100%', padding: '14px', borderRadius: '10px',
                background: isProcessing ? '#555' : 'linear-gradient(135deg, #06d6a0, #059669)',
                border: 'none', color: '#fff', fontSize: '12px', fontWeight: 700,
                fontFamily: 'var(--font-arcade)', cursor: isProcessing ? 'not-allowed' : 'pointer',
              }}>
              {isProcessing ? 'PROCESSING...' : `PAY ₱${selectedPackage.price} NOW →`}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
