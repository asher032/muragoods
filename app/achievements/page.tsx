'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirement: string;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
  category: 'orders' | 'spending' | 'streak' | 'social' | 'special';
}

const ALL_BADGES: Omit<Badge, 'unlocked' | 'progress'>[] = [
  // Orders
  { id: 'first_order', name: 'First Blood', description: 'Place your first order', icon: '🎮', requirement: '1 order', category: 'orders', maxProgress: 1 },
  { id: 'orders_5', name: 'Regular Player', description: 'Place 5 orders', icon: '🎯', requirement: '5 orders', category: 'orders', maxProgress: 5 },
  { id: 'orders_10', name: 'Power User', description: 'Place 10 orders', icon: '⚡', requirement: '10 orders', category: 'orders', maxProgress: 10 },
  { id: 'orders_25', name: 'Elite Warrior', description: 'Place 25 orders', icon: '🏆', requirement: '25 orders', category: 'orders', maxProgress: 25 },
  { id: 'orders_50', name: 'Legend', description: 'Place 50 orders', icon: '👑', requirement: '50 orders', category: 'orders', maxProgress: 50 },

  // Spending
  { id: 'spent_100', name: 'Big Spender', description: 'Spend ₱100 total', icon: '💰', requirement: '₱100 spent', category: 'spending', maxProgress: 100 },
  { id: 'spent_500', name: 'High Roller', description: 'Spend ₱500 total', icon: '💎', requirement: '₱500 spent', category: 'spending', maxProgress: 500 },
  { id: 'spent_1000', name: 'VIP Member', description: 'Spend ₱1,000 total', icon: '🎰', requirement: '₱1,000 spent', category: 'spending', maxProgress: 1000 },
  { id: 'spent_5000', name: 'Whale', description: 'Spend ₱5,000 total', icon: '🐋', requirement: '₱5,000 spent', category: 'spending', maxProgress: 5000 },

  // Streak
  { id: 'streak_3', name: 'Hat Trick', description: 'Order 3 days in a row', icon: '🔥', requirement: '3-day streak', category: 'streak', maxProgress: 3 },
  { id: 'streak_7', name: 'On Fire', description: 'Order 7 days in a row', icon: '🌟', requirement: '7-day streak', category: 'streak', maxProgress: 7 },
  { id: 'checkin_7', name: 'Dedicated', description: 'Check in 7 days in a row', icon: '📅', requirement: '7-day check-in', category: 'streak', maxProgress: 7 },

  // Social
  { id: 'first_review', name: 'Critic', description: 'Leave your first review', icon: '⭐', requirement: '1 review', category: 'social', maxProgress: 1 },
  { id: 'reviews_5', name: 'Food Critic', description: 'Leave 5 reviews', icon: '📝', requirement: '5 reviews', category: 'social', maxProgress: 5 },
  { id: 'referral_1', name: 'Recruiter', description: 'Refer 1 friend', icon: '🤝', requirement: '1 referral', category: 'social', maxProgress: 1 },
  { id: 'unsent_1', name: 'Poet', description: 'Write your first unsent letter', icon: '💌', requirement: '1 letter', category: 'social', maxProgress: 1 },

  // Special
  { id: 'trivia_master', name: 'Trivia Master', description: 'Get 100% on trivia', icon: '🧠', requirement: 'Perfect trivia score', category: 'special', maxProgress: 1 },
  { id: 'mystery_lucky', name: 'Lucky Star', description: 'Win a Legendary mystery box', icon: '🌟', requirement: 'Legendary win', category: 'special', maxProgress: 1 },
  { id: 'early_bird', name: 'Early Bird', description: 'Order before 9 AM', icon: '🐦', requirement: 'Morning order', category: 'special', maxProgress: 1 },
  { id: 'night_owl', name: 'Night Owl', description: 'Order after 8 PM', icon: '🦉', requirement: 'Evening order', category: 'special', maxProgress: 1 },
];

const categoryLabels: Record<string, { label: string; icon: string }> = {
  orders: { label: 'Orders', icon: '📦' },
  spending: { label: 'Spending', icon: '💰' },
  streak: { label: 'Streaks', icon: '🔥' },
  social: { label: 'Social', icon: '💬' },
  special: { label: 'Special', icon: '✨' },
};

export default function AchievementsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const { coins, history } = useCoins();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    setUser(JSON.parse(userStr));
  }, [router]);

  useEffect(() => {
    if (!user) return;

    // Load saved badge progress
    const savedProgress = JSON.parse(localStorage.getItem('muragoods_badges') || '{}') as Record<string, { progress: number; unlocked: boolean }>;

    // Calculate progress from localStorage data
    const orderCount = parseInt(localStorage.getItem('muragoods_order_count') || '0', 10);
    const totalSpent = parseInt(localStorage.getItem('muragoods_total_spent') || '0', 10);
    const checkinStreak = parseInt(localStorage.getItem('muragoods_checkin_streak') || '0', 10);
    const triviaScore = parseInt(localStorage.getItem('muragoods_trivia_best') || '0', 10);
    const mysteryBoxWins = JSON.parse(localStorage.getItem('muragoods_mystery_wins') || '[]') as string[];
    const hasLegendary = mysteryBoxWins.includes('LEGENDARY');

    const calculatedBadges: Badge[] = ALL_BADGES.map(badge => {
      let progress = 0;
      let unlocked = false;

      // Check saved progress first
      if (savedProgress[badge.id]) {
        progress = savedProgress[badge.id].progress;
        unlocked = savedProgress[badge.id].unlocked;
      }

      // Calculate from data
      switch (badge.id) {
        case 'first_order': progress = Math.min(orderCount, 1); break;
        case 'orders_5': progress = Math.min(orderCount, 5); break;
        case 'orders_10': progress = Math.min(orderCount, 10); break;
        case 'orders_25': progress = Math.min(orderCount, 25); break;
        case 'orders_50': progress = Math.min(orderCount, 50); break;
        case 'spent_100': progress = Math.min(totalSpent, 100); break;
        case 'spent_500': progress = Math.min(totalSpent, 500); break;
        case 'spent_1000': progress = Math.min(totalSpent, 1000); break;
        case 'spent_5000': progress = Math.min(totalSpent, 5000); break;
        case 'checkin_7': progress = Math.min(checkinStreak, 7); break;
        case 'trivia_master': progress = triviaScore >= 10 ? 1 : 0; break;
        case 'mystery_lucky': progress = hasLegendary ? 1 : 0; break;
      }

      unlocked = progress >= badge.maxProgress;
      return { ...badge, progress, unlocked };
    });

    setBadges(calculatedBadges);

    // Save progress
    const progressData: Record<string, { progress: number; unlocked: boolean }> = {};
    calculatedBadges.forEach(b => { progressData[b.id] = { progress: b.progress, unlocked: b.unlocked }; });
    localStorage.setItem('muragoods_badges', JSON.stringify(progressData));
  }, [user, history]);

  const unlockedCount = badges.filter(b => b.unlocked).length;
  const totalCount = badges.length;

  const filteredBadges = activeCategory === 'all' ? badges : badges.filter(b => b.category === activeCategory);

  if (!user) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Achievements" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '64rem' }}>
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              🏆 Achievements
            </h1>
            <p className="mt-2 text-sm text-[var(--gold)]">Unlock badges by using Muragoods</p>
            <div className="mt-4 inline-flex items-center gap-3 border-2 border-[var(--gold)] bg-[var(--charcoal)] px-6 py-3 rounded-xl">
              <span className="text-[10px] text-[var(--pewter)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Unlocked</span>
              <span className="text-xl text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>{unlockedCount}/{totalCount}</span>
              <div className="w-32 h-2 bg-[var(--charcoal-light)] rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[var(--gold)] to-[var(--gold-bright)] rounded-full transition-all" style={{ width: `${(unlockedCount / totalCount) * 100}%` }} />
              </div>
            </div>
          </div>

          {/* Category Filters */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            <button onClick={() => setActiveCategory('all')} className={`deco-btn deco-btn-sm text-[9px] ${activeCategory === 'all' ? 'deco-btn-gold' : 'deco-btn-ghost'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
              All ({badges.length})
            </button>
            {Object.entries(categoryLabels).map(([key, val]) => {
              const count = badges.filter(b => b.category === key).length;
              const unlocked = badges.filter(b => b.category === key && b.unlocked).length;
              return (
                <button key={key} onClick={() => setActiveCategory(key)} className={`deco-btn deco-btn-sm text-[9px] ${activeCategory === key ? 'deco-btn-gold' : 'deco-btn-ghost'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                  {val.icon} {val.label} ({unlocked}/{count})
                </button>
              );
            })}
          </div>

          {/* Badges Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredBadges.map(badge => (
              <div key={badge.id} className={`border-2 rounded-xl p-5 transition-all ${
                badge.unlocked
                  ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.08)] shadow-[0_0_15px_rgba(212,175,55,0.15)]'
                  : 'border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] opacity-70'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                    badge.unlocked ? 'bg-gradient-to-br from-[var(--gold)] to-[var(--gold-dark)]' : 'bg-[var(--charcoal-light)]'
                  }`}>
                    {badge.unlocked ? badge.icon : '🔒'}
                  </div>
                  <div className="flex-1">
                    <p className={`text-[10px] uppercase ${badge.unlocked ? 'text-[var(--gold-bright)]' : 'text-[var(--pewter)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                      {badge.name}
                    </p>
                    <p className="text-xs text-[var(--cream-muted)] mt-1">{badge.description}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-[var(--charcoal-light)] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${badge.unlocked ? 'bg-[var(--gold-bright)]' : 'bg-[var(--pewter)]'}`} style={{ width: `${(badge.progress / badge.maxProgress) * 100}%` }} />
                      </div>
                      <span className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                        {badge.progress}/{badge.maxProgress}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Back to Profile */}
          <div className="mt-8 text-center">
            <Link href="/account/profile" className="deco-btn deco-btn-sm rounded-xl">← Back to Profile</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
