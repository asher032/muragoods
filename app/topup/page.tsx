'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';
import { Icon } from '@/app/components/Icon';
import { GAMES, TOPUP_PAYMENT_METHODS, type Game, type GamePackage, type PaymentMethodOption, type GameCategory } from '@/app/lib/game-catalog';

type WizardStep = 'browse' | 'account' | 'package' | 'review' | 'payment';

const CATEGORIES = [
  { label: 'All', value: 'all' as const, iconName: 'game' as const },
  { label: 'Popular', value: 'popular' as const, iconName: 'fire' as const },
  { label: 'Mobile', value: 'Mobile' as GameCategory, iconName: 'home' as const },
  { label: 'PC', value: 'PC' as GameCategory, iconName: 'game' as const },
  { label: 'Gift Cards', value: 'Gift Cards' as GameCategory, iconName: 'gift' as const },
];

const STEP_LABELS = ['Browse', 'Account', 'Package', 'Review', 'Pay'];

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
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<{ discount: number; description: string; finalAmount: number } | null>(null);
  const [promoError, setPromoError] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

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

  const handleApplyPromo = async () => {
    if (!promoCode.trim() || !selectedPackage) return;
    setPromoLoading(true);
    setPromoError('');
    setPromoResult(null);
    try {
      const res = await fetch('/api/topup/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim(), orderAmount: selectedPackage.price }),
      });
      const result = await res.json();
      if (result.success) setPromoResult(result.data);
      else setPromoError(result.error || 'Invalid code');
    } catch { setPromoError('Failed to check code'); }
    setPromoLoading(false);
  };

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

  const goBack = () => {
    if (step === 'account') setStep('browse');
    else if (step === 'package') setStep('account');
    else if (step === 'review') setStep('package');
    else if (step === 'payment') setStep('review');
  };

  const currentStepIndex = (['browse', 'account', 'package', 'review', 'payment'] as WizardStep[]).indexOf(step);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Top-Up" />
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px 16px' }}>

        {/* ─── Step Progress Bar ──────────────────────────── */}
        {step !== 'browse' && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <button onClick={goBack}
                style={{ fontSize: '11px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-arcade)' }}>
                <Icon name="home" size={12} /> Back
              </button>
            </div>
            {/* Progress dots */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
              {STEP_LABELS.map((label, i) => (
                <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i <= currentStepIndex ? 'linear-gradient(135deg, #ffd60a, #f59e0b)' : '#2e2e2e',
                    color: i <= currentStepIndex ? '#000' : '#666', fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-arcade)',
                    transition: 'all 0.3s ease', boxShadow: i <= currentStepIndex ? '0 0 12px rgba(255,214,10,0.3)' : 'none',
                  }}>{i + 1}</div>
                  <p style={{ fontSize: '7px', color: i <= currentStepIndex ? '#ffd60a' : '#555', marginTop: '4px', fontFamily: 'var(--font-arcade)', textAlign: 'center' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 1: BROWSE GAMES
            ═══════════════════════════════════════════════════ */}
        {step === 'browse' && (
          <div className="page-enter">
            {/* Hero Header */}
            <div style={{ textAlign: 'center', marginBottom: '28px', padding: '24px 16px', background: 'linear-gradient(135deg, rgba(255,214,10,0.06), rgba(245,158,11,0.03))', borderRadius: '16px', border: '1px solid rgba(255,214,10,0.1)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,214,10,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Icon name="game" size={24} color="#ffd60a" />
              </div>
              <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: '#ffd60a', marginBottom: '6px' }}>
                GAMES & TOP-UP
              </h1>
              <p style={{ fontSize: '12px', color: '#888' }}>Instant top-up for your favorite games</p>
            </div>

            {/* Search Bar */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>
                <Icon name="chat" size={14} color="#888" />
              </div>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search games..." className="input_field"
                style={{ paddingLeft: '38px', background: '#1a1a2e', borderColor: search ? 'rgba(255,214,10,0.3)' : '#2e2e2e', transition: 'border-color 0.2s' }} />
              {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px' }}>✕</button>}
            </div>

            {/* Category Tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }}>
              {CATEGORIES.map(cat => (
                <button key={cat.value} onClick={() => { setActiveCategory(cat.value); setSearch(''); }}
                  style={{
                    padding: '8px 16px', borderRadius: '20px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px',
                    background: activeCategory === cat.value ? 'rgba(255,214,10,0.15)' : '#1a1a2e',
                    color: activeCategory === cat.value ? '#ffd60a' : '#888', border: `1px solid ${activeCategory === cat.value ? 'rgba(255,214,10,0.3)' : '#2e2e2e'}`,
                    fontSize: '10px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-arcade)',
                    transition: 'all 0.2s',
                  }}>
                  <Icon name={cat.iconName} size={12} color={activeCategory === cat.value ? '#ffd60a' : '#888'} />
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Popular Games */}
            {activeCategory === 'all' && !search && (
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Icon name="fire" size={16} color="#e63946" />
                  <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#ffd60a' }}>POPULAR GAMES</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                  {popularGames.slice(0, 4).map(game => (
                    <button key={game.id} onClick={() => handleGameSelect(game)}
                      className="card-hover"
                      style={{
                        padding: '20px 14px', borderRadius: '14px', border: '1px solid #2e2e2e', position: 'relative', overflow: 'hidden',
                        background: `linear-gradient(135deg, ${game.logoColor}22, #1a1a2e)`,
                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}>
                      {/* Game icon circle */}
                      <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: `${game.logoColor}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: '24px', border: `1px solid ${game.logoColor}44` }}>
                        {game.icon}
                      </div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>{game.name}</p>
                      <p style={{ fontSize: '9px', color: '#888' }}>{game.packages[0]?.currency} · from ₱{Math.min(...game.packages.map(p => p.price))}</p>
                      {/* Popular badge */}
                      <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(255,214,10,0.15)', borderRadius: '6px', padding: '2px 6px' }}>
                        <Icon name="fire" size={10} color="#ffd60a" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* All Games */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Icon name="game" size={14} color="#888" />
              <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#888' }}>
                {activeCategory === 'all' && !search ? 'ALL GAMES' : search ? `RESULTS FOR "${search.toUpperCase()}"` : activeCategory.toUpperCase()}
              </h2>
              <span style={{ fontSize: '9px', color: '#555', background: '#1a1a2e', padding: '2px 8px', borderRadius: '10px' }}>{filteredGames.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredGames.map(game => (
                <button key={game.id} onClick={() => handleGameSelect(game)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px',
                    borderRadius: '12px', background: '#1a1a2e', border: '1px solid #2e2e2e',
                    cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,214,10,0.2)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2e2e2e'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}>
                  <div style={{ fontSize: '24px', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${game.logoColor}33`, borderRadius: '12px', flexShrink: 0, border: `1px solid ${game.logoColor}44` }}>
                    {game.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{game.name}</p>
                      {game.new && <span style={{ fontSize: '7px', background: '#06d6a0', color: '#000', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, flexShrink: 0 }}>NEW</span>}
                    </div>
                    <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>{game.packages[0]?.currency} · {game.region.join(', ')}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: '10px', color: '#ffd60a', fontFamily: 'var(--font-arcade)' }}>from ₱{Math.min(...game.packages.map(p => p.price))}</p>
                    <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>{game.packages.length} pkgs</p>
                  </div>
                </button>
              ))}
              {filteredGames.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <Icon name="question" size={28} color="#555" />
                  <p style={{ color: '#666', fontSize: '12px', marginTop: '8px' }}>No games found</p>
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
            <div style={{ background: `linear-gradient(135deg, ${selectedGame.logoColor}33, ${selectedGame.logoColor}11)`, borderRadius: '14px', padding: '18px', display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', border: '1px solid rgba(255,214,10,0.1)' }}>
              <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: `${selectedGame.logoColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', border: `1px solid ${selectedGame.logoColor}66` }}>
                {selectedGame.icon}
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '8px', color: '#888', letterSpacing: '0.1em' }}>YOU&apos;RE TOPPING UP</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#ffd60a' }}>{selectedGame.name}</p>
                <p style={{ fontSize: '9px', color: '#888' }}>{selectedGame.region.join(', ')} · {selectedGame.packages[0]?.currency}</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Icon name="person" size={16} color="#fff" />
              <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#fff' }}>ACCOUNT DETAILS</h2>
            </div>
            <p style={{ fontSize: '10px', color: '#888', marginBottom: '16px' }}>Enter your game account information</p>

            {error && <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '11px', color: '#e63946', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="question" size={14} color="#e63946" /> {error}
            </div>}

            <div style={{ background: '#1a1a2e', borderRadius: '14px', padding: '20px', marginBottom: '16px', border: '1px solid #2e2e2e' }}>
              {selectedGame.accountFields.map((field, i) => (
                <div key={field.id} style={{ marginBottom: i < selectedGame.accountFields.length - 1 ? '16px' : '0' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#ccc', marginBottom: '6px' }}>
                    {field.label} {field.required && <span style={{ color: '#e63946' }}>*</span>}
                  </label>
                  <input type={field.type || 'text'} value={accountData[field.id] || ''} onChange={(e) => setAccountData(prev => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.placeholder} className="input_field" />
                </div>
              ))}

              {/* ID Guide */}
              <button onClick={() => setShowIdGuide(!showIdGuide)}
                style={{ fontSize: '10px', color: '#4895ef', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Icon name="question" size={12} color="#4895ef" />
                {showIdGuide ? 'Hide guide' : 'Where do I find my ID?'}
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

            {accountConfirmed && (
              <div style={{ background: 'rgba(6,214,160,0.06)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: '10px', padding: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon name="check" size={14} color="#06d6a0" />
                <p style={{ fontSize: '11px', color: '#06d6a0', fontWeight: 600 }}>Account details entered</p>
              </div>
            )}

            <p style={{ fontSize: '9px', color: '#666', textAlign: 'center', marginBottom: '12px' }}>We&apos;ll never ask for your game password.</p>

            <button onClick={handleAccountConfirm}
              style={{ width: '100%', padding: '14px', borderRadius: '10px', background: 'linear-gradient(135deg, #ffd60a, #f59e0b)', border: 'none', color: '#000', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-arcade)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              CONTINUE TO PACKAGES <Icon name="check" size={14} color="#000" />
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 3: PACKAGE SELECTION
            ═══════════════════════════════════════════════════ */}
        {step === 'package' && selectedGame && (
          <div className="page-enter">
            {/* Account Summary */}
            <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', border: '1px solid #2e2e2e' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `${selectedGame.logoColor}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{selectedGame.icon}</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>{selectedGame.name}</p>
                <p style={{ fontSize: '9px', color: '#888' }}>Account: {Object.values(accountData).filter(Boolean).join(' / ')}</p>
              </div>
              <div style={{ color: '#06d6a0' }}><Icon name="check" size={16} color="#06d6a0" /></div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Icon name="coin" size={16} color="#ffd60a" />
              <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#fff' }}>SELECT TOP-UP</h2>
            </div>
            <p style={{ fontSize: '10px', color: '#888', marginBottom: '16px' }}>Choose the amount you want to top up</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {selectedGame.packages.map(pkg => (
                <button key={pkg.id} onClick={() => handlePackageSelect(pkg)}
                  style={{
                    padding: '16px 12px', borderRadius: '12px', position: 'relative', overflow: 'hidden',
                    background: selectedPackage?.id === pkg.id ? 'rgba(255,214,10,0.1)' : '#1a1a2e',
                    border: `1px solid ${selectedPackage?.id === pkg.id ? '#ffd60a' : '#2e2e2e'}`,
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { if (selectedPackage?.id !== pkg.id) (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,214,10,0.2)'; }}
                  onMouseLeave={e => { if (selectedPackage?.id !== pkg.id) (e.currentTarget as HTMLElement).style.borderColor = '#2e2e2e'; }}>
                  {pkg.badge && <div style={{
                    position: 'absolute', top: '8px', right: '8px',
                    background: pkg.badge === 'BEST VALUE' ? '#06d6a0' : pkg.badge === 'POPULAR' ? '#ffd60a' : pkg.badge === 'HOT' ? '#e63946' : '#4895ef',
                    color: pkg.badge === 'POPULAR' ? '#000' : '#fff', fontSize: '7px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-arcade)',
                  }}>{pkg.badge}</div>}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Icon name="checkSquare" size={16} color="#ffd60a" />
              <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a' }}>REVIEW ORDER</h2>
            </div>
            <p style={{ fontSize: '11px', color: '#888', marginBottom: '20px' }}>Please check your game and account details before paying.</p>

            <div style={{ background: '#1a1a2e', borderRadius: '14px', border: '1px solid #2e2e2e', overflow: 'hidden', marginBottom: '20px' }}>
              {[
                { label: 'GAME', value: <><span style={{ fontSize: '18px', marginRight: '6px' }}>{selectedGame.icon}</span>{selectedGame.name}</>, color: '#fff' },
                { label: 'ACCOUNT', value: Object.entries(accountData).filter(([, v]) => v.trim()).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}: ${v}`).join(' / '), color: '#fff' },
                { label: 'PACKAGE', value: selectedPackage.name, color: '#ffd60a' },
                { label: 'REGION', value: selectedGame.region.join(', '), color: '#888' },
              ].map(({ label, value, color }, i) => (
                <div key={label} style={{ padding: '14px 20px', borderBottom: i < 3 ? '1px solid #2e2e2e' : 'none' }}>
                  <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)', marginBottom: '4px' }}>{label}</p>
                  <p style={{ fontSize: '13px', color, fontWeight: 600 }}>{value}</p>
                </div>
              ))}
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,214,10,0.04)', borderTop: '2px solid rgba(255,214,10,0.15)' }}>
                <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)' }}>TOTAL</p>
                <p style={{ fontSize: '22px', fontWeight: 900, color: '#fff', fontFamily: 'var(--font-arcade)' }}>₱{selectedPackage.price}</p>
              </div>
            </div>

            {/* Promo Code */}
            <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '14px', marginBottom: '16px', border: '1px solid #2e2e2e' }}>
              <p style={{ fontSize: '10px', color: '#888', fontFamily: 'var(--font-arcade)', marginBottom: '8px' }}>HAVE A PROMO CODE?</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="text" value={promoCode} onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoResult(null); setPromoError(''); }}
                  placeholder="Enter code" className="input_field"
                  style={{ flex: 1, textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.05em' }} />
                <button onClick={handleApplyPromo} disabled={promoLoading || !promoCode.trim()}
                  style={{ padding: '8px 16px', borderRadius: '8px', background: promoLoading ? '#555' : 'rgba(255,214,10,0.15)', border: '1px solid rgba(255,214,10,0.3)', color: '#ffd60a', fontSize: '10px', fontFamily: 'var(--font-arcade)', fontWeight: 700, cursor: promoLoading ? 'not-allowed' : 'pointer' }}>
                  {promoLoading ? '...' : 'APPLY'}
                </button>
              </div>
              {promoResult && (
                <div style={{ marginTop: '8px', padding: '8px 10px', background: 'rgba(6,214,160,0.08)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icon name="check" size={12} color="#06d6a0" />
                    <p style={{ fontSize: '10px', color: '#06d6a0', fontWeight: 600 }}>{promoResult.description}</p>
                  </div>
                  <p style={{ fontSize: '9px', color: '#888', marginTop: '2px' }}>-₱{promoResult.discount} discount applied</p>
                </div>
              )}
              {promoError && <p style={{ fontSize: '9px', color: '#e63946', marginTop: '6px' }}>{promoError}</p>}
            </div>

            {error && <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '11px', color: '#e63946', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="question" size={14} color="#e63946" /> {error}
            </div>}

            <button onClick={() => { setError(''); setStep('payment'); }}
              style={{ width: '100%', padding: '14px', borderRadius: '10px', background: 'linear-gradient(135deg, #ffd60a, #f59e0b)', border: 'none', color: '#000', fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-arcade)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              CHOOSE PAYMENT <Icon name="cart" size={14} color="#000" />
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════
            STEP 5: PAYMENT
            ═══════════════════════════════════════════════════ */}
        {step === 'payment' && selectedGame && selectedPackage && (
          <div className="page-enter">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Icon name="cart" size={16} color="#ffd60a" />
              <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a' }}>PAYMENT</h2>
            </div>

            {/* Persistent Order Summary */}
            <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '14px', marginBottom: '20px', border: '1px solid #2e2e2e' }}>
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

            <h3 style={{ fontSize: '11px', color: '#fff', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="coin" size={14} color="#ffd60a" /> Select Payment Method
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {TOPUP_PAYMENT_METHODS.map(method => (
                <button key={method.id} onClick={() => setSelectedPayment(method)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderRadius: '12px',
                    background: selectedPayment?.id === method.id ? 'rgba(255,214,10,0.08)' : '#1a1a2e',
                    border: `1px solid ${selectedPayment?.id === method.id ? '#ffd60a' : '#2e2e2e'}`,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}>
                  <span style={{ fontSize: '18px' }}>{method.icon}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff', flex: 1, textAlign: 'left' }}>{method.name}</span>
                  {selectedPayment?.id === method.id && <Icon name="check" size={16} color="#ffd60a" />}
                </button>
              ))}
            </div>

            {error && <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '11px', color: '#e63946', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="question" size={14} color="#e63946" /> {error}
            </div>}

            <button onClick={handlePay} disabled={isProcessing || !selectedPayment}
              style={{
                width: '100%', padding: '14px', borderRadius: '10px',
                background: isProcessing ? '#555' : 'linear-gradient(135deg, #06d6a0, #059669)',
                border: 'none', color: '#fff', fontSize: '12px', fontWeight: 700,
                fontFamily: 'var(--font-arcade)', cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}>
              {isProcessing ? 'PROCESSING...' : <><Icon name="check" size={14} color="#fff" /> PAY ₱{selectedPackage.price} NOW</>}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
