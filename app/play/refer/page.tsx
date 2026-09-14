'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { BookOpen, Coins, MessageCircle, Users } from 'lucide-react';
export default function ReferPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [referralCount, setReferralCount] = useState(0);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    setIsLoggedIn(true);
    const user = JSON.parse(userStr);

    // Generate a referral code from email
    const code = (user.email || 'PLAYER').split('@')[0].toUpperCase().slice(0, 8) + Math.floor(Math.random() * 100);
    setReferralCode(code);

    const savedCount = parseInt(localStorage.getItem('muragoods_referral_count') || '0', 10);
    setReferralCount(savedCount);
  }, [router]);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSimulateReferral = () => {
    setReferralCount(prev => {
      const next = prev + 1;
      localStorage.setItem('muragoods_referral_count', String(next));
      return next;
    });
  };

  if (!isLoggedIn) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Refer a Friend" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '48rem' }}>
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              <Users className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Refer a Friend
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">Invite friends and earn 50 coins for each referral!</p>
          </div>

          {/* Referral Code Card */}
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-8 text-center mb-8">
            <p className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>Your Referral Code</p>
            <div className="inline-flex items-center gap-4 border-2 border-[var(--gold)] bg-[var(--charcoal-light)] rounded-xl px-8 py-4">
              <span className="text-2xl text-[var(--gold-bright)] tracking-[0.2em]" style={{ fontFamily: 'var(--font-arcade)' }}>
                {referralCode}
              </span>
              <button
                onClick={handleCopy}
                className="deco-btn deco-btn-sm deco-btn-gold rounded-lg"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="power-card p-6 text-center rounded-xl">
              <span className="text-2xl"><Users className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
              <p className="text-[10px] text-[var(--gold)] uppercase mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>Friends Referred</p>
              <p className="text-xl text-[var(--cream)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>{referralCount}</p>
            </div>
            <div className="power-card p-6 text-center rounded-xl">
              <span className="text-2xl"><Coins color={'#ffd60a'} className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /></span>
              <p className="text-[10px] text-[var(--gold)] uppercase mt-2" style={{ fontFamily: 'var(--font-arcade)' }}>Coins Earned</p>
              <p className="text-xl text-[var(--gold-bright)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>{referralCount * 50}</p>
            </div>
          </div>

          {/* How It Works */}
          <div className="border-2 border-[var(--gold)] bg-[var(--charcoal)] rounded-2xl p-8 mb-8">
            <h2 className="text-[10px] text-[var(--gold)] uppercase tracking-[0.15em] mb-4 text-center" style={{ fontFamily: 'var(--font-arcade)' }}>How It Works</h2>
            <div className="space-y-4">
              {[
                { step: '1', text: 'Share your referral code with friends' },
                { step: '2', text: 'They sign up using your code' },
                { step: '3', text: 'You both earn 50 coins when they place their first order!' },
              ].map(item => (
                <div key={item.step} className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[var(--gold)] flex items-center justify-center rounded-full shrink-0">
                    <span className="text-sm text-[var(--obsidian)]" style={{ fontFamily: 'var(--font-arcade)' }}>{item.step}</span>
                  </div>
                  <p className="text-sm text-[var(--cream-muted)]">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Share Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <a
              href={`https://www.facebook.com/sharer/sharer.php?quote=Use%20my%20referral%20code%20${referralCode}%20on%20Muragoods!`}
              target="_blank"
              rel="noopener noreferrer"
              className="deco-btn deco-btn-gold rounded-xl flex-1 text-center"
            >
              <BookOpen className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Share on Facebook
            </a>
            <a
              href={`https://wa.me/?text=Hey! Use my referral code ${referralCode} on Muragoods and we both get 50 coins!`}
              target="_blank"
              rel="noopener noreferrer"
              className="deco-btn rounded-xl flex-1 text-center"
            >
              <MessageCircle className="inline-block" style={{ verticalAlign: '-0.15em', flexShrink: 0 }} aria-hidden /> Share on WhatsApp
            </a>
          </div>

          <div className="text-center">
            <Link href="/" className="deco-btn deco-btn-sm rounded-xl">← Back to Muragoods</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
