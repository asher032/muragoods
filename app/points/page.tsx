'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { PixelDivider } from '@/app/components/PixelDivider';
import { CoinBalance } from '@/app/components/CoinBalance';
import { useCoins } from '@/app/hooks/useCoins';
import { Icon } from '@/app/components/Icon';
import { Brain, Coins, Gift, PiggyBank, ScrollText, Store, Users } from 'lucide-react';
interface Transaction {
  type: 'earn' | 'spend';
  amount: number;
  label: string;
  date: string;
}

const earnMethods = [
  { icon: <Icon name="cart" size={20} />, title: 'Place an Order', desc: 'Earn 0.5 coins per peso spent on every order', link: '/menu', coins: '0.5x', color: 'var(--gold)' },
  { icon: <Icon name="calendar" size={20} />, title: 'Daily Check-In', desc: 'Log in daily for 5-50 coins over 7 days', link: '/play/checkin', coins: '5-50', color: 'var(--emerald-bright)' },
  { icon: <Brain color={'#ff4d8d'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, title: 'Trivia Challenge', desc: 'Answer campus questions for 5-15 coins each', link: '/play/trivia', coins: '5-15', color: 'var(--crimson)' },
  { icon: <Users className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, title: 'Refer a Friend', desc: 'Invite friends and earn 50 coins per referral', link: '/play/refer', coins: '50', color: 'var(--gold-bright)' },
];

const spendMethods = [
  { icon: <Icon name="gift" size={20} />, title: 'Mystery Box', desc: 'Spend 10 coins for a chance to win coins, discounts, or a free musubi', link: '/play/mysterybox', coins: '-10', color: 'var(--crimson)' },
  { icon: <Store className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, title: 'Rewards Shop', desc: 'Redeem coins for free food, vouchers, and special perks (100 - 2,000 coins)', link: '/rewards', coins: '100-2K', color: 'var(--gold-bright)' },
];

export default function PointsPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [history, setHistory] = useState<Transaction[]>([]);
  const { coins } = useCoins();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) { router.push('/login'); return; }
    setIsLoggedIn(true);

    const saved = localStorage.getItem('muragoods_points_history');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch { /* empty */ }
    }
  }, [router]);

  if (!isLoggedIn) return null;

  const totalEarned = history.filter(t => t.type === 'earn').reduce((sum, t) => sum + t.amount, 0);
  const totalSpent = history.filter(t => t.type === 'spend').reduce((sum, t) => sum + t.amount, 0);

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Points" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '56rem' }}>
          <PixelDivider variant="coinChain" />

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              <Coins color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> My Points
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">Your coin balance and how to use them</p>
          </div>

          {/* ─── Balance Card ──────────────────────────────── */}
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-8 text-center mb-8" style={{ background: 'linear-gradient(135deg, var(--charcoal), var(--charcoal-light))' }}>
            <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-3" style={{ fontFamily: 'var(--font-arcade)' }}>Current Balance</p>
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="coin-float text-4xl"><Coins color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
              <span className="text-4xl sm:text-5xl text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', textShadow: '0 0 20px rgba(242,201,76,0.4)' }}>
                {coins}
              </span>
            </div>
            <CoinBalance size="md" />

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-xl">
                <p className="text-[8px] text-[var(--emerald-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Total Earned</p>
                <p className="text-sm text-[var(--cream)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>+{totalEarned}</p>
              </div>
              <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] p-3 rounded-xl">
                <p className="text-[8px] text-[var(--crimson)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Total Spent</p>
                <p className="text-sm text-[var(--cream)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>-{totalSpent}</p>
              </div>
            </div>
          </div>

          {/* ─── Ways to Earn ─────────────────────────────── */}
          <div className="mb-8">
            <h2 className="text-[11px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>
              <PiggyBank className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Ways to Earn Coins
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {earnMethods.map(method => (
                <Link key={method.title} href={method.link} className="power-card p-5 rounded-xl flex items-start gap-4 hover:border-[var(--gold-bright)] transition-all group">
                  <div className="w-12 h-12 flex items-center justify-center border-2 rounded-xl shrink-0 text-xl" style={{ borderColor: method.color, background: `${method.color}15` }}>
                    {method.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[10px] text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>{method.title}</h3>
                      <span className="text-[9px] px-2 py-1 rounded-lg shrink-0" style={{ fontFamily: 'var(--font-arcade)', color: method.color, background: `${method.color}15`, border: `1px solid ${method.color}40` }}>
                        +{method.coins}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--pewter)] mt-1 leading-relaxed">{method.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ─── Ways to Spend ────────────────────────────── */}
          <div className="mb-8">
            <h2 className="text-[11px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>
              <Gift color={'#e63946'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Ways to Spend Coins
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {spendMethods.map(method => (
                <Link key={method.title} href={method.link} className="power-card p-5 rounded-xl flex items-start gap-4 hover:border-[var(--gold-bright)] transition-all group">
                  <div className="w-12 h-12 flex items-center justify-center border-2 rounded-xl shrink-0 text-xl" style={{ borderColor: method.color, background: `${method.color}15` }}>
                    {method.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[10px] text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>{method.title}</h3>
                      <span className="text-[9px] px-2 py-1 rounded-lg shrink-0" style={{ fontFamily: 'var(--font-arcade)', color: method.color, background: `${method.color}15`, border: `1px solid ${method.color}40` }}>
                        {method.coins} <Coins color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />
                      </span>
                    </div>
                    <p className="text-xs text-[var(--pewter)] mt-1 leading-relaxed">{method.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <PixelDivider variant="ziggurat" />

          {/* ─── Transaction History ──────────────────────── */}
          <div className="mt-8">
            <h2 className="text-[11px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>
              <ScrollText className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Points History
            </h2>

            {history.length === 0 ? (
              <div className="border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] p-8 text-center rounded-2xl">
                <p className="text-sm text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '10px' }}>NO TRANSACTIONS YET</p>
                <p className="text-xs text-[var(--pewter)] mt-2">Start earning coins by placing orders or playing games!</p>
              </div>
            ) : (
              <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[1fr_80px_100px] gap-2 p-4 border-b-2 border-[var(--gold)] bg-[var(--charcoal-light)]">
                  <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Activity</p>
                  <p className="text-[8px] text-[var(--gold)] uppercase text-center" style={{ fontFamily: 'var(--font-arcade)' }}>Amount</p>
                  <p className="text-[8px] text-[var(--gold)] uppercase text-right" style={{ fontFamily: 'var(--font-arcade)' }}>Date</p>
                </div>

                {/* Rows */}
                <div className="max-h-80 overflow-y-auto">
                  {history.slice(0, 30).map((tx, i) => (
                    <div key={i} className="grid grid-cols-[1fr_80px_100px] gap-2 p-4 border-b border-[rgba(242,240,228,0.08)] hover:bg-[var(--charcoal-light)] transition-colors">
                      <div className="min-w-0">
                        <p className="text-[9px] text-[var(--cream)] truncate" style={{ fontFamily: 'var(--font-arcade)' }}>{tx.label}</p>
                      </div>
                      <div className="text-center">
                        <span className={`text-[10px] ${tx.type === 'earn' ? 'text-[var(--emerald-bright)]' : 'text-[var(--crimson)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                          {tx.type === 'earn' ? '+' : '-'}{tx.amount}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] text-[var(--pewter)]">{new Date(tx.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Quick Actions ────────────────────────────── */}
          <div className="mt-8">
            <p className="font-arcade text-[10px] text-mario-yellow uppercase tracking-widest mb-3 text-center">Quick Actions</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { href: '/menu', icon: <Icon name="food" size={22} />, label: 'Order Food', color: '#06d6a0' },
                { href: '/play/checkin', icon: <Icon name="calendar" size={22} />, label: 'Check In', color: '#ffd60a' },
                { href: '/play/trivia', icon: <Icon name="question" size={22} />, label: 'Trivia', color: '#e63946' },
                { href: '/play/mysterybox', icon: <Icon name="gift" size={22} />, label: 'Mystery Box', color: '#c896ff' },
                { href: '/rewards', icon: <Icon name="star" size={22} />, label: 'Rewards', color: '#4895ef' },
                { href: '/play/refer', icon: <Users className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden />, label:'Refer Friend', color: '#06d6a0' },
              ].map(action => (
                <Link key={action.href} href={action.href} className="group block text-center p-4 rounded-xl border border-white/8 bg-mario-bg-card hover:border-white/20 hover:bg-white/5 transition-all duration-200">
                  <div className="flex justify-center mb-2 group-hover:scale-110 transition-transform">
                    {typeof action.icon === 'string' ? <span className="text-xl">{action.icon}</span> : action.icon}
                  </div>
                  <p className="font-arcade text-[9px] text-mario-text group-hover:text-mario-yellow transition-colors uppercase leading-tight">{action.label}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
