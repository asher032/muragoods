'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';

const BOX_COST = 10;

interface Prize {
  id: string;
  label: string;
  description: string;
  type: 'coins' | 'discount' | 'jackpot';
  value: number;
  icon: string;
  rarity: 'common' | 'rare' | 'legendary';
  color: string;
}

const prizes: Prize[] = [
  {
    id: 'coins_5',
    label: '+5 Coins',
    description: 'A small coin bonus added to your balance!',
    type: 'coins',
    value: 5,
    icon: '🪙',
    rarity: 'common',
    color: 'var(--gold)',
  },
  {
    id: 'coins_10',
    label: '+10 Coins',
    description: 'You earned back what you spent — free box!',
    type: 'coins',
    value: 10,
    icon: '🪙',
    rarity: 'common',
    color: 'var(--gold-bright)',
  },
  {
    id: 'coins_15',
    label: '+15 Coins',
    description: 'A nice chunk of coins for your next order!',
    type: 'coins',
    value: 15,
    icon: '🪙',
    rarity: 'common',
    color: 'var(--gold-bright)',
  },
  {
    id: 'discount_10',
    label: '10% OFF',
    description: 'Use code MYSTERY10 at checkout for 10% off your next order!',
    type: 'discount',
    value: 10,
    icon: '🏷️',
    rarity: 'rare',
    color: 'var(--emerald-bright)',
  },
  {
    id: 'discount_15',
    label: '15% OFF',
    description: 'Use code MYSTERY15 at checkout for 15% off your next order!',
    type: 'discount',
    value: 15,
    icon: '🏷️',
    rarity: 'rare',
    color: 'var(--emerald-bright)',
  },
  {
    id: 'coins_25',
    label: '+25 Coins',
    description: 'Big coin drop! Stack these for premium rewards!',
    type: 'coins',
    value: 25,
    icon: '💰',
    rarity: 'rare',
    color: 'var(--gold-bright)',
  },
  {
    id: 'discount_20',
    label: '20% OFF',
    description: 'Use code MYSTERY20 at checkout for 20% off your next order!',
    type: 'discount',
    value: 20,
    icon: '🏷️',
    rarity: 'rare',
    color: 'var(--emerald-bright)',
  },
  {
    id: 'jackpot_50',
    label: 'JACKPOT! +50',
    description: 'MEGA JACKPOT! 50 bonus coins added to your balance!',
    type: 'jackpot',
    value: 50,
    icon: '⭐',
    rarity: 'legendary',
    color: 'var(--gold-bright)',
  },
  {
    id: 'free_musubi',
    label: 'FREE MUSUBI',
    description: 'Use code FREEMUSUBI for a free Regular Musubi on your next order!',
    type: 'discount',
    value: 40,
    icon: '🍙',
    rarity: 'legendary',
    color: 'var(--gold-bright)',
  },
  {
    id: 'coins_8',
    label: '+8 Coins',
    description: 'A little something for your coin collection!',
    type: 'coins',
    value: 8,
    icon: '🪙',
    rarity: 'common',
    color: 'var(--gold)',
  },
];

// Weighted random selection
function rollPrize(): Prize {
  const weights = [25, 20, 18, 10, 8, 8, 5, 3, 1.5, 1.5]; // total ~100
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (let i = 0; i < prizes.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) return prizes[i];
  }
  return prizes[0];
}

const rarityLabels: Record<string, string> = {
  common: 'COMMON',
  rare: '✦ RARE',
  legendary: '★ LEGENDARY',
};

const rarityColors: Record<string, string> = {
  common: 'var(--pewter)',
  rare: 'var(--emerald-bright)',
  legendary: 'var(--gold-bright)',
};

export default function MysteryBoxPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [revealPrize, setRevealPrize] = useState<Prize | null>(null);
  const [boxShaking, setBoxShaking] = useState(false);
  const [boxOpened, setBoxOpened] = useState(false);
  const [showPrize, setShowPrize] = useState(false);
  const [history, setHistory] = useState<(Prize & { date: string })[]>([]);
  const [totalOpened, setTotalOpened] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const { coins, addCoins, removeCoins } = useCoins();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) { router.push('/login'); return; }
    setIsLoggedIn(true);

    const savedHistory = localStorage.getItem('muragoods_mystery_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch { /* empty */ }
    }
    const savedTotal = parseInt(localStorage.getItem('muragoods_mystery_total') || '0', 10);
    setTotalOpened(savedTotal);
    const savedSpent = parseInt(localStorage.getItem('muragoods_mystery_spent') || '0', 10);
    setTotalSpent(savedSpent);
  }, [router]);

  const handleOpen = () => {
    if (isOpening || coins < BOX_COST) return;

    setIsOpening(true);
    setBoxShaking(true);
    setShowPrize(false);
    setRevealPrize(null);
    setBoxOpened(false);

    // Deduct coins
    removeCoins(BOX_COST, 'Mystery Box opened');
    setTotalSpent(prev => {
      const next = prev + BOX_COST;
      localStorage.setItem('muragoods_mystery_spent', String(next));
      return next;
    });

    // Shake animation (1.5s)
    setTimeout(() => {
      setBoxShaking(false);
      setBoxOpened(true);

      // Roll prize
      const prize = rollPrize();
      setRevealPrize(prize);

      // Award prize
      if (prize.type === 'coins' || prize.type === 'jackpot') {
        addCoins(prize.value, `Mystery Box: ${prize.label}`);
      }
      // Save discount code to localStorage for checkout redemption
      if (prize.type === 'discount') {
        const codeMap: Record<string, string> = {
          discount_10: 'MYSTERY10',
          discount_15: 'MYSTERY15',
          discount_20: 'MYSTERY20',
          free_musubi: 'FREEMUSUBI',
        };
        const code = codeMap[prize.id];
        if (code) {
          const savedCodes = JSON.parse(localStorage.getItem('muragoods_discount_codes') || '[]');
          savedCodes.push({ code, label: prize.label, wonAt: new Date().toISOString() });
          localStorage.setItem('muragoods_discount_codes', JSON.stringify(savedCodes));
        }
      }

      // Save to history
      const entry = { ...prize, date: new Date().toISOString() };
      const newHistory = [entry, ...history].slice(0, 50);
      setHistory(newHistory);
      localStorage.setItem('muragoods_mystery_history', JSON.stringify(newHistory));
      setTotalOpened(prev => {
        const next = prev + 1;
        localStorage.setItem('muragoods_mystery_total', String(next));
        return next;
      });

      // Reveal prize (0.5s after opening)
      setTimeout(() => {
        setShowPrize(true);
        setIsOpening(false);
      }, 500);
    }, 1500);
  };

  if (!isLoggedIn) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Mystery Box" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          {/* Header */}
          <div className="text-center mb-8">
            <h1
              className="text-2xl sm:text-3xl text-[var(--cream)] uppercase"
              style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}
            >
              🎁 Mystery Box
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">Spend 10 coins to reveal a random reward!</p>
            <div className="mt-3 inline-flex items-center gap-2 border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.1)] px-5 py-2 rounded-xl">
              <span className="coin-float">🪙</span>
              <span className="text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px' }}>{coins}</span>
              <span className="text-[var(--pewter)] text-sm">coins</span>
            </div>
          </div>

          {/* Mystery Box Display */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              {/* Glow behind box */}
              <div className={`absolute inset-0 flex items-center justify-center ${!boxOpened && !isOpening ? 'pulse-glow' : ''}`}>
                <div className="w-48 h-48 rounded-full" style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.15) 0%, transparent 70%)' }} />
              </div>

              {/* The Box */}
              <div
                className={`relative w-44 h-44 sm:w-52 sm:h-52 cursor-pointer select-none transition-all duration-300 ${
                  boxShaking ? 'mystery-shake' : boxOpened ? 'mystery-opened' : !isOpening ? 'mystery-idle hover:scale-105' : ''
                }`}
                onClick={!isOpening && coins >= BOX_COST ? handleOpen : undefined}
              >
                {/* Box body */}
                <div
                  className="absolute inset-0 border-3 rounded-2xl flex flex-col items-center justify-center"
                  style={{
                    background: boxOpened
                      ? 'linear-gradient(135deg, var(--charcoal-light), var(--charcoal))'
                      : 'linear-gradient(135deg, var(--gold-dark), var(--gold), var(--gold-bright))',
                    borderColor: boxOpened ? 'var(--gold)' : 'var(--gold-bright)',
                    boxShadow: boxOpened
                      ? '0 0 40px rgba(212,175,55,0.4)'
                      : '0 8px 32px rgba(212,175,55,0.3), inset 0 2px 0 rgba(242,201,76,0.5)',
                    border: '3px solid',
                  }}
                >
                  {!boxOpened ? (
                    <>
                      {/* Closed box — question mark */}
                      <div className="text-5xl sm:text-6xl" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--obsidian)', textShadow: '2px 2px 0 rgba(0,0,0,0.2)' }}>?</div>
                      <div className="mt-2 text-[9px] sm:text-[10px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-arcade)', color: 'var(--obsidian)' }}>
                        TAP TO OPEN
                      </div>
                      {/* Ribbon */}
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-full bg-[rgba(0,0,0,0.15)]" />
                      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-3 bg-[rgba(0,0,0,0.15)]" />
                      {/* Bow */}
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <div className="w-10 h-6 flex items-center justify-center gap-1">
                          <div className="w-5 h-4 bg-[var(--crimson)] rounded-full border border-[var(--crimson-dark)]" />
                          <div className="w-2 h-2 bg-[var(--crimson-dark)] rounded-full" />
                          <div className="w-5 h-4 bg-[var(--crimson)] rounded-full border border-[var(--crimson-dark)]" />
                        </div>
                      </div>
                    </>
                  ) : showPrize && revealPrize ? (
                    <>
                      {/* Opened — show prize */}
                      <div className="text-4xl sm:text-5xl mb-1">{revealPrize.icon}</div>
                      <div className="text-xs sm:text-sm text-[var(--cream)] text-center px-4" style={{ fontFamily: 'var(--font-arcade)', fontSize: '11px' }}>
                        {revealPrize.label}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Opening animation — light burst */}
                      <div className="mystery-burst" />
                      <div className="text-4xl animate-spin">✨</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Open Button */}
          <div className="text-center mb-6">
            {!showPrize ? (
              <button
                onClick={handleOpen}
                disabled={isOpening || coins < BOX_COST}
                className={`deco-btn deco-btn-lg rounded-2xl ${isOpening ? 'opacity-60 cursor-not-allowed' : coins < BOX_COST ? 'opacity-40 cursor-not-allowed' : 'deco-btn-gold pulse-glow'}`}
                style={{ fontFamily: 'var(--font-arcade)', minWidth: '220px' }}
              >
                {isOpening ? '🌀 OPENING...' : coins < BOX_COST ? 'NOT ENOUGH COINS' : `🎁 OPEN (🪙 ${BOX_COST})`}
              </button>
            ) : (
              <button
                onClick={() => { setShowPrize(false); setBoxOpened(false); setRevealPrize(null); }}
                className="deco-btn deco-btn-gold deco-btn-lg rounded-2xl"
                style={{ fontFamily: 'var(--font-arcade)', minWidth: '220px' }}
              >
                🎁 OPEN AGAIN (🪙 {BOX_COST})
              </button>
            )}
          </div>

          {/* Prize Detail Card */}
          {showPrize && revealPrize && (
            <div className="deco-modal bounce-in rounded-2xl max-w-sm mx-auto mb-8" style={{ background: 'var(--charcoal)' }}>
              <div
                className="deco-modal-header text-center rounded-t-2xl"
                style={{
                  background: revealPrize.rarity === 'legendary'
                    ? 'linear-gradient(135deg, var(--gold-dark), var(--gold-bright))'
                    : revealPrize.rarity === 'rare'
                    ? 'linear-gradient(135deg, var(--emerald-dark), var(--emerald-bright))'
                    : 'linear-gradient(135deg, var(--charcoal-light), var(--charcoal-mid))',
                }}
              >
                <p className="text-[10px] uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-arcade)', color: rarityColors[revealPrize.rarity] }}>
                  {rarityLabels[revealPrize.rarity]}
                </p>
              </div>
              <div className="deco-modal-body text-center space-y-3">
                <div className="text-4xl">{revealPrize.icon}</div>
                <h3 className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {revealPrize.label}
                </h3>
                <p className="text-sm text-[var(--pewter)]">{revealPrize.description}</p>
                {revealPrize.type === 'discount' && (
                  <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.1)] p-3 rounded-xl">
                    <p className="text-[9px] text-[var(--gold)] uppercase mb-1" style={{ fontFamily: 'var(--font-arcade)' }}>Your Code</p>
                    <p className="text-lg text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                      {revealPrize.id === 'discount_10' ? 'MYSTERY10' : revealPrize.id === 'discount_15' ? 'MYSTERY15' : revealPrize.id === 'discount_20' ? 'MYSTERY20' : 'FREEMUSUBI'}
                    </p>
                  </div>
                )}
                {(revealPrize.type === 'coins' || revealPrize.type === 'jackpot') && (
                  <p className="text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>
                    +{revealPrize.value} coins added! 🪙
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              { label: 'Opened', value: String(totalOpened), icon: '📦' },
              { label: 'Spent', value: `${totalSpent}`, icon: '🪙' },
              { label: 'Balance', value: String(coins), icon: '💰' },
            ].map(stat => (
              <div key={stat.label} className="power-card p-4 text-center rounded-xl">
                <span className="text-lg">{stat.icon}</span>
                <p className="text-[8px] text-[var(--gold)] uppercase mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>{stat.label}</p>
                <p className="text-sm text-[var(--cream)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Prize Table */}
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-5 mb-8">
            <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>
              Prize Pool
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {prizes.map(prize => (
                <div key={prize.id} className="flex items-center gap-3 p-2 bg-[var(--charcoal-light)] rounded-lg border border-[rgba(242,240,228,0.08)]">
                  <span className="text-xl">{prize.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] text-[var(--cream)] truncate" style={{ fontFamily: 'var(--font-arcade)' }}>{prize.label}</p>
                    <p className="text-[8px] truncate" style={{ color: rarityColors[prize.rarity] }}>{rarityLabels[prize.rarity]}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-5 mb-8">
              <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>
                Recent Wins
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.slice(0, 10).map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-[var(--charcoal-light)] rounded-xl border border-[rgba(242,240,228,0.08)]">
                    <span className="text-xl">{entry.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{entry.label}</p>
                      <p className="text-[8px] text-[var(--pewter)]">{new Date(entry.date).toLocaleDateString()}</p>
                    </div>
                    <span className="text-[8px] px-2 py-1 rounded-lg" style={{ fontFamily: 'var(--font-arcade)', color: rarityColors[entry.rarity], background: `${rarityColors[entry.rarity]}15`, border: `1px solid ${rarityColors[entry.rarity]}40` }}>
                      {rarityLabels[entry.rarity]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-center">
            <Link href="/" className="deco-btn deco-btn-sm rounded-xl">← Back to Muragoods</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
