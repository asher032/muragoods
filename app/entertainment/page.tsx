'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { PixelDivider } from '@/app/components/PixelDivider';
import { useCoins } from '@/app/hooks/useCoins';

const features = [
  {
    icon: '📅',
    title: 'Daily Check-In',
    desc: 'Log in every day to earn 5-50 coins. Build a 7-day streak for massive rewards!',
    link: '/play/checkin',
    tag: 'FREE',
    tagColor: 'var(--emerald-bright)',
  },
  {
    icon: "🎰",
    title: "Spin the Wheel",
    desc: "Pay 15 coins to spin the wheel! Win up to 50 coins per spin. 3 spins per day.",
    link: "/play/spin",
    tag: "🎰 SPIN",
    tagColor: "var(--emerald-bright)",
  },
  {
    icon: '🧠',
    title: 'Trivia Challenge',
    desc: 'Test your knowledge with 25 campus, Bicol, food, and Mario trivia questions. Earn coins for every correct answer!',
    link: '/play/trivia',
    tag: 'PLAY',
    tagColor: 'var(--crimson)',
  },
  {
    icon: '🎁',
    title: 'Mystery Box',
    desc: 'Spend 10 coins to open a mystery box. Win bonus coins, discount codes, or even a free musubi!',
    link: '/play/mysterybox',
    tag: '10 🪙',
    tagColor: 'var(--gold-bright)',
  },
  {
    icon: '👥',
    title: 'Refer a Friend',
    desc: 'Share your referral code with friends. You both earn 50 coins when they place their first order!',
    link: '/play/refer',
    tag: '+50',
    tagColor: 'var(--gold)',
  },
  {
    icon: '🛒',
    title: 'Group Order',
    desc: 'Order together with classmates! Create a shared cart, add items, and split the bill.',
    link: '/group-order',
    tag: 'NEW',
    tagColor: 'var(--emerald-bright)',
  },
  {
    icon: '🏆',
    title: 'Achievements',
    desc: 'Unlock badges for milestones like First Order, Big Spender, and Trivia Master!',
    link: '/achievements',
    tag: 'BADGES',
    tagColor: 'var(--gold-bright)',
  },
  {
    icon: '🏆',
    title: 'Leaderboard',
    desc: 'See who\'s the top spender on campus! Climb the ranks by placing more orders.',
    link: '/leaderboard',
    tag: 'RANK',
    tagColor: 'var(--gold-bright)',
  },
  {
    icon: '🪙',
    title: 'My Points',
    desc: 'Check your coin balance, see ways to earn and spend, and view your transaction history.',
    link: '/points',
    tag: 'BALANCE',
    tagColor: 'var(--gold)',
  },
];

export default function EntertainmentPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { coins } = useCoins();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) { router.push('/login'); return; }
    setIsLoggedIn(true);
  }, [router]);

  if (!isLoggedIn) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Entertainment" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '56rem' }}>
          <PixelDivider variant="starBurst" />

          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              🎮 Entertainment
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">Play, earn coins, and have fun!</p>
            <div className="mt-4 inline-flex items-center gap-2 border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.1)] px-5 py-2 rounded-xl">
              <span className="coin-float">🪙</span>
              <span className="text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '12px' }}>{coins}</span>
              <span className="text-[var(--pewter)] text-sm">coins</span>
            </div>
          </div>

          {/* Feature Grid */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Link
                key={feature.title}
                href={feature.link}
                className="power-card p-6 rounded-2xl hover:border-[var(--gold-bright)] transition-all group"
              >
                {/* Icon + Tag */}
                <div className="flex items-start justify-between mb-4">
                  <div className="text-4xl">{feature.icon}</div>
                  <span
                    className="text-[8px] px-3 py-1 rounded-lg border"
                    style={{
                      fontFamily: 'var(--font-arcade)',
                      color: feature.tagColor,
                      background: `${feature.tagColor}15`,
                      borderColor: `${feature.tagColor}40`,
                    }}
                  >
                    {feature.tag}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-xs text-[var(--cream)] uppercase mb-2 group-hover:text-[var(--gold-bright)] transition-colors" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-[var(--pewter)] leading-relaxed">
                  {feature.desc}
                </p>

                {/* Arrow */}
                <div className="mt-4 flex items-center gap-1 text-[var(--gold)] opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Play</span>
                  <span className="text-sm">→</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Divider */}
          <div className="mt-10">
            <PixelDivider variant="ziggurat" />
          </div>

          {/* Footer CTA */}
          <div className="mt-8 text-center">
            <p className="text-[9px] text-[var(--pewter)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>
              Earn coins to spend on rewards — or climb the leaderboard!
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/menu" className="deco-btn deco-btn-gold rounded-xl">🛒 Order Food</Link>
              <Link href="/points" className="deco-btn deco-btn-crimson rounded-xl">🪙 My Points</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
