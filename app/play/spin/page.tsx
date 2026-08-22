'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';

const prizes = [
  { label: '10 COINS', coins: 10, color: '#D4AF37', textColor: '#0A0A0A' },
  { label: '5 COINS', coins: 5, color: '#1E3D2F', textColor: '#F2F0E4' },
  { label: '25 COINS', coins: 25, color: '#E52521', textColor: '#F2F0E4' },
  { label: '0 COINS', coins: 0, color: '#2A2A2A', textColor: '#888888' },
  { label: '15 COINS', coins: 15, color: '#F2C94C', textColor: '#0A0A0A' },
  { label: '50 COINS', coins: 50, color: '#D4AF37', textColor: '#0A0A0A' },
  { label: '2 COINS', coins: 2, color: '#1E1E1E', textColor: '#D4AF37' },
  { label: '20 COINS', coins: 20, color: '#E52521', textColor: '#F2F0E4' },
];

export default function SpinPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ prize: typeof prizes[0]; index: number } | null>(null);
  const [spinsLeft, setSpinsLeft] = useState(3);
  const [totalWon, setTotalWon] = useState(0);
  const { addCoins } = useCoins();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) { router.push('/login'); return; }
    setIsLoggedIn(true);

    // Load daily spin count
    const today = new Date().toDateString();
    const lastSpinDate = localStorage.getItem('muragoods_spin_date');
    const savedSpinsLeft = localStorage.getItem('muragoods_spins_left');
    if (lastSpinDate === today && savedSpinsLeft) {
      setSpinsLeft(parseInt(savedSpinsLeft, 10));
    } else {
      localStorage.setItem('muragoods_spin_date', today);
      localStorage.setItem('muragoods_spins_left', '3');
      setSpinsLeft(3);
    }

    const savedTotal = localStorage.getItem('muragoods_spin_total');
    if (savedTotal) setTotalWon(parseInt(savedTotal, 10));
  }, [router]);

  const handleSpin = () => {
    if (spinning || spinsLeft <= 0) return;

    setSpinning(true);
    setResult(null);

    // Pick random prize
    const prizeIndex = Math.floor(Math.random() * prizes.length);
    const prize = prizes[prizeIndex];

    // Calculate rotation: multiple full spins + position for the prize
    const segmentAngle = 360 / prizes.length;
    const targetAngle = 360 - (prizeIndex * segmentAngle + segmentAngle / 2);
    const totalRotation = rotation + 360 * 5 + targetAngle;

    setRotation(totalRotation);

    setTimeout(() => {
      setSpinning(false);
      setResult({ prize, index: prizeIndex });
      setSpinsLeft(prev => {
        const next = prev - 1;
        localStorage.setItem('muragoods_spins_left', String(next));
        return next;
      });

      if (prize.coins > 0) {
        addCoins(prize.coins);
        setTotalWon(prev => {
          const next = prev + prize.coins;
          localStorage.setItem('muragoods_spin_total', String(next));
          return next;
        });
      }
    }, 4000);
  };

  if (!isLoggedIn) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Lucky Spin" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              🎰 Lucky Spin
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">Spin the wheel to win coins and discounts!</p>
            <p className="mt-1 text-sm text-[var(--pewter)]">
              {spinsLeft > 0 ? `${spinsLeft} spins remaining today` : 'No spins left today — come back tomorrow!'}
            </p>
            {totalWon > 0 && (
              <p className="mt-1 text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
                🪙 Total won: {totalWon} coins
              </p>
            )}
          </div>

          {/* Wheel */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              {/* Pointer */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10 text-2xl">▼</div>

              {/* Wheel container */}
              <div
                className="w-72 h-72 sm:w-80 sm:h-80 rounded-full border-4 border-[var(--gold)] overflow-hidden shadow-[0_0_30px_rgba(212,175,55,0.3)]"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: spinning ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)' : 'none',
                }}
              >
                <div className="relative w-full h-full">
                  {prizes.map((prize, i) => {
                    const angle = (360 / prizes.length) * i;
                    return (
                      <div
                        key={i}
                        className="absolute top-0 left-0 w-full h-full origin-center"
                        style={{
                          transform: `rotate(${angle}deg)`,
                          clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.tan(Math.PI / prizes.length)}% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${50 - 50 * Math.tan(Math.PI / prizes.length)}% 0%)`,
                        }}
                      >
                        <div
                          className="absolute top-0 left-1/2 w-[2px] h-[50%] origin-bottom"
                          style={{ transform: 'translateX(-50%)' }}
                        />
                        <div
                          className="absolute w-full h-full flex items-center justify-center"
                          style={{ background: prize.color }}
                        >
                          <span
                            className="absolute text-[9px] font-bold whitespace-nowrap"
                            style={{
                              fontFamily: 'var(--font-arcade)',
                              color: prize.textColor,
                              top: '15%',
                              left: '50%',
                              transform: 'translateX(-50%)',
                            }}
                          >
                            {prize.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {/* Center circle */}
                  <div className="absolute inset-0 flex items-center justify-center z-20">
                    <div className="w-16 h-16 bg-gradient-to-br from-[var(--gold)] to-[var(--gold-dark)] rounded-full border-4 border-[var(--gold-bright)] flex items-center justify-center shadow-[0_0_20px_rgba(212,175,55,0.5)]">
                      <span className="text-xs text-[var(--obsidian)]" style={{ fontFamily: 'var(--font-arcade)' }}>M</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Spin Button */}
          <div className="text-center mb-6">
            <button
              onClick={handleSpin}
              disabled={spinning || spinsLeft <= 0}
              className={`deco-btn deco-btn-lg rounded-2xl ${spinning ? 'opacity-60 cursor-not-allowed' : spinsLeft <= 0 ? 'opacity-40 cursor-not-allowed' : 'deco-btn-gold pulse-glow'}`}
              style={{ fontFamily: 'var(--font-arcade)', minWidth: '200px' }}
            >
              {spinning ? '🌀 SPINNING...' : spinsLeft <= 0 ? 'NO SPINS LEFT' : '🪙 SPIN NOW!'}
            </button>
          </div>

          {/* Result */}
          {result && !spinning && (
            <div className="deco-modal bounce-in rounded-2xl max-w-sm mx-auto">
              <div className="deco-modal-header text-center rounded-t-2xl">
                <h2 className="text-sm text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {result.prize.coins > 0 ? '🎉 YOU WON!' : '😅 TRY AGAIN!'}
                </h2>
              </div>
              <div className="deco-modal-body text-center space-y-4">
                <p className="text-lg text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {result.prize.label}
                </p>
                {result.prize.coins > 0 && (
                  <p className="text-sm text-[var(--gold-bright)]">🪙 Added to your balance!</p>
                )}
                {spinsLeft > 0 && (
                  <button onClick={() => setResult(null)} className="deco-btn deco-btn-gold rounded-xl w-full">
                    Spin Again ({spinsLeft} left)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Back link */}
          <div className="text-center mt-8">
            <Link href="/" className="deco-btn deco-btn-sm rounded-xl">← Back to Muragoods</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
