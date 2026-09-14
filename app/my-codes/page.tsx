'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/app/components/NavBar';
import Link from 'next/link';
import { Gift, ShoppingCart } from 'lucide-react';

type DiscountCode = {
  code: string;
  label: string;
  wonAt: string;
  used?: boolean;
};

export default function MyCodesPage() {
  const router = useRouter();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    setUser(JSON.parse(userStr));
    try {
      const saved = JSON.parse(localStorage.getItem('muragoods_discount_codes') || '[]');
      setCodes(saved);
    } catch { setCodes([]); }
  }, [router]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  const handleMarkUsed = (code: string) => {
    const updated = codes.map(c => c.code === code ? { ...c, used: true } : c);
    setCodes(updated);
    localStorage.setItem('muragoods_discount_codes', JSON.stringify(updated));
  };

  const usedCount = codes.filter(c => c.used).length;
  const unusedCount = codes.filter(c => !c.used).length;

  if (!user) return null;

  return (
    <main style={{ minHeight: '100vh', background: 'var(--mario-bg)' }}>
      <NavBar pageLabel="My Codes" />

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px 16px 60px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px', color: 'var(--mario-yellow)', textTransform: 'uppercase' }}>My Codes</h1>
          <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginTop: '6px' }}>
            Discount codes won from Mystery Boxes
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '12px' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: 'var(--mario-green)' }}>{unusedCount}</p>
              <p style={{ fontSize: '9px', color: 'var(--mario-text-muted)', fontFamily: 'var(--font-arcade)' }}>Available</p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '16px', color: 'var(--pewter)' }}>{usedCount}</p>
              <p style={{ fontSize: '9px', color: 'var(--mario-text-muted)', fontFamily: 'var(--font-arcade)' }}>Used</p>
            </div>
          </div>
        </div>

        {/* Codes List */}
        {codes.length === 0 ? (
          <div className="border-2 border-[rgba(255,255,255,0.08)] bg-[var(--charcoal)] p-8 rounded-2xl text-center">
            <p style={{ fontSize: '36px', marginBottom: '12px' }}><Gift color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></p>
            <p style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px', color: 'var(--mario-text)' }}>No codes yet!</p>
            <p style={{ fontSize: '12px', color: 'var(--mario-text-muted)', marginTop: '6px' }}>Open Mystery Boxes to win discount codes</p>
            <Link href="/play/mysterybox" className="deco-btn deco-btn-gold mt-4" style={{ display: 'inline-flex' }}>
              Open Mystery Box
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {codes.map((code, i) => (
              <div key={i} className="power-card p-4" style={{
                opacity: code.used ? 0.5 : 1,
                borderColor: code.used ? 'rgba(255,255,255,0.05)' : 'rgba(255,214,10,0.2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{
                        fontFamily: 'var(--font-arcade)', fontSize: '12px', letterSpacing: '2px',
                        color: code.used ? 'var(--pewter)' : 'var(--mario-yellow)',
                      }}>
                        {code.code}
                      </span>
                      {code.used && (
                        <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: 'var(--pewter)', fontFamily: 'var(--font-arcade)' }}>
                          USED
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--mario-text-muted)' }}>
                      {code.label} · Won {new Date(code.wonAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {!code.used && (
                      <>
                        <button onClick={() => handleCopyCode(code.code)} className="deco-btn deco-btn-sm" style={{ fontSize: '8px', padding: '4px 10px' }}>
                          Copy
                        </button>
                        <Link href="/checkout" className="deco-btn deco-btn-sm deco-btn-gold" style={{ fontSize: '8px', padding: '4px 10px', textDecoration: 'none' }}>
                          Use
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick links */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <Link href="/play/mysterybox" className="deco-btn deco-btn-sm" style={{ marginRight: '8px' }}>
            <Gift color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> More Mystery Boxes
          </Link>
          <Link href="/checkout" className="deco-btn deco-btn-sm deco-btn-gold">
            <ShoppingCart className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Go to Checkout
          </Link>
        </div>
      </div>
    </main>
  );
}
