'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { GAMES, TOPUP_PAYMENT_METHODS, type Game, type GamePackage, type PaymentMethodOption } from '@/app/lib/game-catalog';

type Step = 'game' | 'account' | 'package' | 'review' | 'payment' | 'processing';

export default function TopUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('game');
  const [search, setSearch] = useState('');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [accountData, setAccountData] = useState<Record<string, string>>({});
  const [accountConfirmed, setAccountConfirmed] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<GamePackage | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethodOption | null>(null);
  const [showIdGuide, setShowIdGuide] = useState(false);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const filteredGames = useMemo(() => {
    if (!search.trim()) return GAMES.filter(g => g.active);
    const q = search.toLowerCase();
    return GAMES.filter(g => g.active && (
      g.name.toLowerCase().includes(q) ||
      g.category.toLowerCase().includes(q) ||
      g.region.toLowerCase().includes(q)
    ));
  }, [search]);

  const handleGameSelect = (game: Game) => {
    setSelectedGame(game);
    setAccountData({});
    setAccountConfirmed(false);
    setSelectedPackage(null);
    setStep('account');
  };

  const handleAccountConfirm = () => {
    if (!selectedGame) return;
    const missing = selectedGame.accountFields.filter(f => f.required && !accountData[f.id]?.trim());
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setError('');
    setAccountConfirmed(true);
    setStep('package');
  };

  const handlePackageSelect = (pkg: GamePackage) => {
    setSelectedPackage(pkg);
    setStep('review');
  };

  const handleProceedToPayment = () => {
    if (!selectedPayment) {
      setError('Please select a payment method');
      return;
    }
    setError('');
    setStep('payment');
  };

  const handlePay = async () => {
    if (!selectedGame || !selectedPackage || !selectedPayment) return;
    setIsProcessing(true);
    setError('');

    const user = JSON.parse(localStorage.getItem('user') || '{}');

    try {
      // Create the top-up order
      const res = await fetch('/api/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: selectedGame.id,
          accountDetails: accountData,
          packageId: selectedPackage.id,
          paymentMethod: selectedPayment.id,
          customerEmail: user.email || '',
          customerName: user.name || 'Customer',
        }),
      });
      const result = await res.json();

      if (result.success) {
        // For online payments, redirect to payment provider
        if (selectedPayment.type === 'online' || selectedPayment.type === 'ewallet') {
          if (result.data.checkoutUrl) {
            window.location.href = result.data.checkoutUrl;
          } else {
            // Cash payment — go to success directly
            router.push(`/topup/success?orderId=${result.data.orderId}`);
          }
        } else {
          // Cash on delivery
          router.push(`/topup/success?orderId=${result.data.orderId}`);
        }
      } else {
        setError(result.error || 'Failed to create order');
        setIsProcessing(false);
      }
    } catch {
      setError('Failed to connect. Please try again.');
      setIsProcessing(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="Top-Up" />

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>
        {/* ─── Step Indicator ──────────────────────────── */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px' }}>
          {(['game', 'account', 'package', 'review', 'payment'] as Step[]).map((s, i) => {
            const stepIndex = ['game', 'account', 'package', 'review', 'payment'].indexOf(s);
            const currentIndex = ['game', 'account', 'package', 'review', 'payment'].indexOf(step);
            const isActive = stepIndex === currentIndex;
            const isDone = stepIndex < currentIndex;
            return (
              <div key={s} style={{ flex: 1, height: '3px', borderRadius: '2px', background: isDone ? '#06d6a0' : isActive ? '#ffd60a' : '#2e2e2e', transition: 'all 0.3s' }} />
            );
          })}
        </div>

        {/* ─── Step 1: Game Selection ─────────────────── */}
        {step === 'game' && (
          <div className="page-enter">
            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a', marginBottom: '4px' }}>STEP 1</h2>
            <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '18px', color: '#fff', marginBottom: '16px' }}>SELECT YOUR GAME</h1>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search games..."
              className="input_field"
              style={{ marginBottom: '20px' }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredGames.map(game => (
                <button
                  key={game.id}
                  onClick={() => handleGameSelect(game)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '16px',
                    padding: '16px', borderRadius: '12px',
                    background: '#1a1a2e', border: '1px solid #2e2e2e',
                    cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,214,10,0.3)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2e2e2e'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
                >
                  <div style={{ fontSize: '32px', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,214,10,0.06)', borderRadius: '12px' }}>
                    {game.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{game.name}</p>
                    <p style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{game.packages[0]?.currency} · {game.region} · {game.category}</p>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#ffd60a', fontFamily: 'var(--font-arcade)', padding: '6px 14px', background: 'rgba(255,214,10,0.08)', borderRadius: '6px', border: '1px solid rgba(255,214,10,0.2)' }}>TOP UP →</span>
                </button>
              ))}
              {filteredGames.length === 0 && (
                <p style={{ textAlign: 'center', color: '#666', fontSize: '12px', padding: '40px' }}>No games found for &ldquo;{search}&rdquo;</p>
              )}
            </div>
          </div>
        )}

        {/* ─── Step 2: Account Entry ──────────────────── */}
        {step === 'account' && selectedGame && (
          <div className="page-enter">
            <button onClick={() => setStep('game')} style={{ fontSize: '11px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '12px' }}>← Back to games</button>

            <div style={{ background: 'linear-gradient(135deg, rgba(255,214,10,0.06), rgba(255,214,10,0.02))', border: '1px solid rgba(255,214,10,0.15)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <span style={{ fontSize: '28px' }}>{selectedGame.icon}</span>
              <div>
                <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px', color: '#888' }}>YOU&apos;RE TOPPING UP</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#ffd60a' }}>{selectedGame.name}</p>
              </div>
            </div>

            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#fff', marginBottom: '16px' }}>ENTER YOUR ACCOUNT</h2>

            {error && (
              <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '11px', color: '#e63946' }}>
                ⚠ {error}
              </div>
            )}

            <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
              {selectedGame.accountFields.map(field => (
                <div key={field.id} style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#ccc', marginBottom: '6px' }}>
                    {field.label} {field.required && <span style={{ color: '#e63946' }}>*</span>}
                  </label>
                  <input
                    type={field.type || 'text'}
                    value={accountData[field.id] || ''}
                    onChange={(e) => setAccountData(prev => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="input_field"
                  />
                </div>
              ))}

              {/* ID Guide */}
              <button
                onClick={() => setShowIdGuide(!showIdGuide)}
                style={{ fontSize: '10px', color: '#4895ef', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '4px' }}
              >
                ❓ How do I find my ID?
              </button>
              {showIdGuide && (
                <div style={{ marginTop: '8px', padding: '12px', background: 'rgba(72,149,239,0.06)', border: '1px solid rgba(72,149,239,0.15)', borderRadius: '8px' }}>
                  <p style={{ fontSize: '11px', color: '#aaa', lineHeight: 1.6 }}>{selectedGame.idGuide}</p>
                </div>
              )}
            </div>

            {/* Account Confirmation Box */}
            {accountConfirmed && (
              <div style={{ background: 'rgba(6,214,160,0.06)', border: '1px solid rgba(6,214,160,0.2)', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                <p style={{ fontSize: '11px', color: '#06d6a0', fontWeight: 600 }}>✓ Account details entered</p>
              </div>
            )}

            <button
              onClick={handleAccountConfirm}
              style={{
                width: '100%', padding: '14px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #ffd60a, #f59e0b)',
                border: 'none', color: '#000', fontSize: '12px', fontWeight: 700,
                fontFamily: 'var(--font-arcade)', cursor: 'pointer',
              }}
            >
              CONTINUE →
            </button>

            <p style={{ fontSize: '9px', color: '#666', textAlign: 'center', marginTop: '10px' }}>
              ⚠ We&apos;ll never ask for your game password.
            </p>
          </div>
        )}

        {/* ─── Step 3: Package Selection ──────────────── */}
        {step === 'package' && selectedGame && (
          <div className="page-enter">
            <button onClick={() => setStep('account')} style={{ fontSize: '11px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '12px' }}>← Back to account</button>

            <div style={{ background: '#1a1a2e', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', border: '1px solid #2e2e2e' }}>
              <span style={{ fontSize: '20px' }}>{selectedGame.icon}</span>
              <div>
                <p style={{ fontSize: '11px', color: '#fff', fontWeight: 600 }}>{selectedGame.name}</p>
                <p style={{ fontSize: '9px', color: '#888' }}>Account: {Object.values(accountData).join(' / ')}</p>
              </div>
            </div>

            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px', color: '#fff', marginBottom: '16px' }}>SELECT TOP-UP</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {selectedGame.packages.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => handlePackageSelect(pkg)}
                  style={{
                    padding: '16px 12px', borderRadius: '10px',
                    background: selectedPackage?.id === pkg.id ? 'rgba(255,214,10,0.1)' : '#1a1a2e',
                    border: selectedPackage?.id === pkg.id ? '1px solid #ffd60a' : '1px solid #2e2e2e',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', position: 'relative',
                  }}
                >
                  {pkg.popular && (
                    <div style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#06d6a0', color: '#000', fontSize: '7px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-arcade)' }}>HOT</div>
                  )}
                  <p style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{pkg.name}</p>
                  <p style={{ fontSize: '14px', fontWeight: 900, color: '#ffd60a', marginTop: '6px', fontFamily: 'var(--font-arcade)' }}>₱{pkg.price}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Step 4: Review ─────────────────────────── */}
        {step === 'review' && selectedGame && selectedPackage && (
          <div className="page-enter">
            <button onClick={() => setStep('package')} style={{ fontSize: '11px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '12px' }}>← Back to packages</button>

            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a', marginBottom: '4px' }}>REVIEW ORDER</h2>
            <p style={{ fontSize: '11px', color: '#888', marginBottom: '20px' }}>Please check your game and account details before paying.</p>

            <div style={{ background: '#1a1a2e', borderRadius: '14px', border: '1px solid #2e2e2e', overflow: 'hidden' }}>
              {/* Game */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #2e2e2e', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '24px' }}>{selectedGame.icon}</span>
                <div>
                  <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)' }}>GAME</p>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{selectedGame.name}</p>
                </div>
              </div>

              {/* Account */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #2e2e2e' }}>
                <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)', marginBottom: '6px' }}>ACCOUNT</p>
                {Object.entries(accountData).filter(([, v]) => v.trim()).map(([key, val]) => (
                  <p key={key} style={{ fontSize: '12px', color: '#fff' }}>
                    <span style={{ color: '#888' }}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}:</span> {val}
                  </p>
                ))}
              </div>

              {/* Package */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #2e2e2e' }}>
                <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)', marginBottom: '6px' }}>PACKAGE</p>
                <p style={{ fontSize: '14px', fontWeight: 700, color: '#ffd60a' }}>{selectedPackage.name}</p>
              </div>

              {/* Price */}
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-arcade)' }}>TOTAL</p>
                <p style={{ fontSize: '20px', fontWeight: 900, color: '#fff', fontFamily: 'var(--font-arcade)' }}>₱{selectedPackage.price}</p>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '8px', padding: '10px 14px', marginTop: '16px', fontSize: '11px', color: '#e63946' }}>
                ⚠ {error}
              </div>
            )}

            <button
              onClick={() => { setError(''); setStep('payment'); }}
              style={{
                width: '100%', padding: '14px', borderRadius: '10px', marginTop: '20px',
                background: 'linear-gradient(135deg, #ffd60a, #f59e0b)',
                border: 'none', color: '#000', fontSize: '12px', fontWeight: 700,
                fontFamily: 'var(--font-arcade)', cursor: 'pointer',
              }}
            >
              CHOOSE PAYMENT →
            </button>
          </div>
        )}

        {/* ─── Step 5: Payment ────────────────────────── */}
        {step === 'payment' && selectedGame && selectedPackage && (
          <div className="page-enter">
            <button onClick={() => setStep('review')} style={{ fontSize: '11px', color: '#888', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '12px }}>← Back to review</button>

            <h2 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: '#ffd60a', marginBottom: '16px' }}>PAYMENT</h2>

            {/* Persistent Summary */}
            <div style={{ background: '#1a1a2e', borderRadius: '10px', padding: '14px', marginBottom: '20px', border: '1px solid #2e2e2e' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', color: '#888' }}>Game</span>
                <span style={{ fontSize: '10px', color: '#fff', fontWeight: 600 }}>{selectedGame.icon} {selectedGame.name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', color: '#888' }}>Account</span>
                <span style={{ fontSize: '10px', color: '#fff' }}>{Object.values(accountData).filter(Boolean).join(' / ')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', color: '#888' }}>Package</span>
                <span style={{ fontSize: '10px', color: '#ffd60a', fontWeight: 600 }}>{selectedPackage.name}</span>
              </div>
              <div style={{ borderTop: '1px solid #2e2e2e', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: '#888', fontFamily: 'var(--font-arcade)' }}>TOTAL</span>
                <span style={{ fontSize: '16px', fontWeight: 900, color: '#fff', fontFamily: 'var(--font-arcade)' }}>₱{selectedPackage.price}</span>
              </div>
            </div>

            {/* Payment Methods */}
            <h3 style={{ fontSize: '11px', color: '#fff', fontWeight: 600, marginBottom: '12px' }}>Select Payment Method</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {TOPUP_PAYMENT_METHODS.map(method => (
                <button
                  key={method.id}
                  onClick={() => setSelectedPayment(method)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '14px 16px', borderRadius: '10px',
                    background: selectedPayment?.id === method.id ? 'rgba(255,214,10,0.08)' : '#1a1a2e',
                    border: selectedPayment?.id === method.id ? '1px solid #ffd60a' : '1px solid #2e2e2e',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{method.icon}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff', flex: 1, textAlign: 'left' }}>{method.name}</span>
                  {selectedPayment?.id === method.id && <span style={{ color: '#ffd60a', fontSize: '14px' }}>✓</span>}
                </button>
              ))}
            </div>

            {error && (
              <div style={{ background: 'rgba(230,57,70,0.1)', border: '1px solid rgba(230,57,70,0.3)', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '11px', color: '#e63946' }}>
                ⚠ {error}
              </div>
            )}

            <button
              onClick={handlePay}
              disabled={isProcessing || !selectedPayment}
              style={{
                width: '100%', padding: '14px', borderRadius: '10px',
                background: isProcessing ? '#555' : 'linear-gradient(135deg, #06d6a0, #059669)',
                border: 'none', color: '#fff', fontSize: '12px', fontWeight: 700,
                fontFamily: 'var(--font-arcade)', cursor: isProcessing ? 'not-allowed' : 'pointer',
              }}
            >
              {isProcessing ? 'PROCESSING...' : `PAY ₱${selectedPackage.price} NOW →`}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
