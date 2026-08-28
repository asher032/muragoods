'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';
import { Icon } from '@/app/components/Icon';

const dayRewards = [
  { day: 1, coins: 5, label: 'Day 1', icon: <Icon name="coin" size={20} /> },
  { day: 2, coins: 8, label: 'Day 2', icon: <Icon name="coin" size={20} /> },
  { day: 3, coins: 10, label: 'Day 3', icon: <Icon name="coin" size={20} /> },
  { day: 4, coins: 12, label: 'Day 4', icon: <Icon name="coin" size={20} /> },
  { day: 5, coins: 15, label: 'Day 5', icon: <Icon name="coin" size={20} /> },
  { day: 6, coins: 20, label: 'Day 6', icon: <Icon name="coin" size={20} /> },
  { day: 7, coins: 50, label: 'MEGA DAY', icon: '⭐' },
];

export default function CheckInPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [totalEarned, setTotalEarned] = useState(0);
  const { addCoins } = useCoins();

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) { router.push('/login'); return; }
    setIsLoggedIn(true);

    const today = new Date().toDateString();
    const lastCheckIn = localStorage.getItem('muragoods_checkin_date');
    const savedStreak = parseInt(localStorage.getItem('muragoods_checkin_streak') || '0', 10);
    const savedTotal = parseInt(localStorage.getItem('muragoods_checkin_total') || '0', 10);

    setTotalEarned(savedTotal);

    if (lastCheckIn === today) {
      setCheckedInToday(true);
      setCurrentStreak(savedStreak);
    } else {
      // Check if yesterday was the last check-in for streak continuity
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      if (lastCheckIn === yesterday) {
        setCurrentStreak(savedStreak);
      } else if (lastCheckIn && lastCheckIn !== today) {
        // Streak broken
        setCurrentStreak(0);
        localStorage.setItem('muragoods_checkin_streak', '0');
      }
    }
  }, [router]);

  const handleCheckIn = () => {
    if (checkedInToday) return;

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const lastCheckIn = localStorage.getItem('muragoods_checkin_date');

    let newStreak = currentStreak;
    if (lastCheckIn === yesterday || !lastCheckIn) {
      newStreak = currentStreak + 1;
    } else if (lastCheckIn !== today) {
      newStreak = 1;
    }

    // Cap at 7 days for the cycle
    const dayInCycle = ((newStreak - 1) % 7);
    const reward = dayRewards[dayInCycle];

    addCoins(reward.coins, `Daily Check-In Day ${newStreak}`);
    setTotalEarned(prev => prev + reward.coins);
    setCurrentStreak(newStreak);
    setCheckedInToday(true);
    setJustCheckedIn(true);

    localStorage.setItem('muragoods_checkin_date', today);
    localStorage.setItem('muragoods_checkin_streak', String(newStreak));
    localStorage.setItem('muragoods_checkin_total', String(totalEarned + reward.coins));

    setTimeout(() => setJustCheckedIn(false), 3000);
  };

  if (!isLoggedIn) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Daily Check-In" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              📅 Daily Check-In
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">Log in daily to earn bonus coins!</p>
            <p className="mt-1 text-sm text-[var(--pewter)]">
              Streak: {currentStreak}/7 days · Total earned: {totalEarned} coins
            </p>
          </div>

          {/* 7-Day Calendar */}
          <div className="grid grid-cols-7 gap-3 mb-8">
            {dayRewards.map((day) => {
              const isActive = currentStreak >= day.day;
              const isToday = currentStreak % 7 === day.day - 1 && !checkedInToday;
              return (
                <div
                  key={day.day}
                  className={`p-3 sm:p-4 border-2 text-center rounded-xl transition-all ${
                    isActive
                      ? 'border-[var(--gold)] bg-[rgba(212,175,55,0.15)] shadow-[0_0_15px_rgba(212,175,55,0.3)]'
                      : isToday
                      ? 'border-[var(--gold-bright)] bg-[rgba(242,201,76,0.1)] pulse-glow'
                      : 'border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)]'
                  }`}
                >
                  <div className="text-xl mb-1">{day.icon}</div>
                  <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>{day.label}</p>
                  <p className="text-[10px] text-[var(--cream)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>+{day.coins}</p>
                  {isActive && <div className="text-[var(--gold-bright)] text-xs mt-1">✓</div>}
                </div>
              );
            })}
          </div>

          {/* Check-In Button */}
          <div className="text-center mb-6">
            <button
              onClick={handleCheckIn}
              disabled={checkedInToday}
              className={`deco-btn deco-btn-lg rounded-2xl ${checkedInToday ? 'opacity-50 cursor-not-allowed' : 'deco-btn-gold pulse-glow'}`}
              style={{ fontFamily: 'var(--font-arcade)', minWidth: '200px' }}
            >
              {checkedInToday ? '✅ CHECKED IN TODAY!' : '🪙 CHECK IN NOW!'}
            </button>
          </div>

          {/* Just Checked In Message */}
          {justCheckedIn && (
            <div className="deco-modal bounce-in rounded-2xl max-w-sm mx-auto">
              <div className="deco-modal-body text-center space-y-3">
                <div className="text-4xl">🎉</div>
                <p className="text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  +{dayRewards[((currentStreak - 1) % 7)].coins} COINS!
                </p>
                <p className="text-xs text-[var(--pewter)]">Keep your streak going!</p>
              </div>
            </div>
          )}

          <div className="text-center mt-8">
            <Link href="/" className="deco-btn deco-btn-sm rounded-xl">← Back to Muragoods</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
