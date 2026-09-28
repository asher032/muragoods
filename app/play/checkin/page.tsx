'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useGameSession } from '@/app/hooks/useGameSession';
import { DiscordNudge } from '@/app/components/DiscordNudge';
import { Icon } from '@/app/components/Icon';
import { Calendar, Check, PartyPopper, Star } from 'lucide-react';
const dayRewards = [
  { day: 1, coins: 5, label: 'Day 1', icon: <Icon name="coin" size={20} /> },
  { day: 2, coins: 8, label: 'Day 2', icon: <Icon name="coin" size={20} /> },
  { day: 3, coins: 10, label: 'Day 3', icon: <Icon name="coin" size={20} /> },
  { day: 4, coins: 12, label: 'Day 4', icon: <Icon name="coin" size={20} /> },
  { day: 5, coins: 15, label: 'Day 5', icon: <Icon name="coin" size={20} /> },
  { day: 6, coins: 20, label: 'Day 6', icon: <Icon name="coin" size={20} /> },
  { day: 7, coins: 50, label: 'MEGA DAY', icon: <Star color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> },
];

export default function CheckInPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [lastReward, setLastReward] = useState(0);
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const { award } = useGameSession('checkin');

  // Streak and reward come from the server — the calendar below renders the
  // server streak, so tampering with the clock or storage changes nothing.
  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) { router.push('/login'); return; }
    setIsLoggedIn(true);
    (async () => {
      try {
        const res = await fetch('/api/games/progress?gameId=checkin');
        const data = await res.json();
        const p = data.progress;
        if (p) {
          setCurrentStreak(p.streak || 0);
          const today = new Date().toISOString().slice(0, 10);
          if (p.lastPlayedDay === today) setCheckedInToday(true);
        }
      } catch { /* offline: allow the attempt, server decides */ }
    })();
  }, [router]);

  const handleCheckIn = async () => {
    if (checkedInToday || checking) return;
    setChecking(true);
    setNotice('');
    const res = await award({ gameId: 'checkin' });
    setChecking(false);
    if (!res.success) {
      setNotice(res.error || 'Check-in failed.');
      if ((res.error || '').includes('Daily play limit') || (res.error || '').includes('cooldown')) {
        setCheckedInToday(true);
      }
      return;
    }
    setCurrentStreak(res.streak || currentStreak + 1);
    setLastReward(res.coins || 0);
    setCheckedInToday(true);
    setJustCheckedIn(true);
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
              <Calendar className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Daily Check-In
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">Log in daily to earn bonus coins!</p>
            <p className="mt-1 text-sm text-[var(--pewter)]">
              Streak: {currentStreak} day{currentStreak === 1 ? '' : 's'} · rewards paid server-side
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
                  {isActive && <div className="text-[var(--gold-bright)] text-xs mt-1"><Check className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></div>}
                </div>
              );
            })}
          </div>

          {/* Check-In Button */}
          <div className="text-center mb-6">
            <DiscordNudge compact />
            {notice && <p className="text-sm text-red-300 mb-3">{notice}</p>}
            <button
              onClick={handleCheckIn}
              disabled={checkedInToday || checking}
              className={`deco-btn deco-btn-lg rounded-2xl ${checkedInToday ? 'opacity-50 cursor-not-allowed' : 'deco-btn-gold pulse-glow'}`}
              style={{ fontFamily: 'var(--font-arcade)', minWidth: '200px' }}
            >
              {checkedInToday ? 'CHECKED IN TODAY!' : checking ? 'CHECKING IN…' : 'CHECK IN NOW!'}
            </button>
          </div>

          {/* Just Checked In Message */}
          {justCheckedIn && (
            <div className="deco-modal bounce-in rounded-2xl max-w-sm mx-auto">
              <div className="deco-modal-body text-center space-y-3">
                <div className="text-4xl"><PartyPopper color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></div>
                <p className="text-sm text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                  +{lastReward} COINS!
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
