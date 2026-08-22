'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';

interface Reward {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: string;
  category: string;
}

const rewards: Reward[] = [
  // Free Food
  { id: 'free_musubi', name: 'Free Regular Musubi', description: 'Claim a free Regular Musubi on your next visit to DWCL.', cost: 5000, icon: '🍙', category: 'Free Food' },
  { id: 'free_churros', name: 'Free Churros (Option 1)', description: 'Claim free Mini Churros (Option 1, ₱70 value) at DWCL.', cost: 7500, icon: '🍩', category: 'Free Food' },
  // Discount Vouchers
  { id: 'voucher_50', name: '₱50 Off Voucher', description: 'Get ₱50 off your next order. Minimum order ₱100.', cost: 8000, icon: '🏷️', category: 'Vouchers' },
  { id: 'voucher_100', name: '₱100 Off Voucher', description: 'Get ₱100 off your next order. Minimum order ₱200.', cost: 15000, icon: '🏷️', category: 'Vouchers' },
  { id: 'free_shipping', name: 'Free Shipping Voucher', description: 'Free delivery for your next order outside DWCL.', cost: 6000, icon: '🚚', category: 'Vouchers' },
  { id: 'double_points', name: '2x Points (Next Order)', description: 'Earn double coins on your next order for 24 hours.', cost: 10000, icon: '✨', category: 'Vouchers' },

  // Special Perks
  { id: 'priority_order', name: 'Priority Order', description: 'Skip the queue — your order gets prepared first.', cost: 12000, icon: '⚡', category: 'Perks' },
  { id: 'mystery_upgrade', name: 'Mystery Box Upgrade', description: 'Your next mystery box is guaranteed Rare or above.', cost: 20000, icon: '🎁', category: 'Perks' },
  { id: 'custom_shoutout', name: 'Shoutout on Instagram', description: 'Get a personalized shoutout on the Muragoods Instagram page.', cost: 25000, icon: '📱', category: 'Perks' },
  { id: 'gold_member', name: 'Gold Member Badge', description: 'Permanent gold badge on your profile — shows you\'re a top supporter.', cost: 50000, icon: '👑', category: 'Perks' },
];

const categoryEmojis: Record<string, string> = {
  'Free Food': '🍽️',
  Vouchers: '🏷️',
  Perks: '⭐',
};

const rewardCategories = ['All', 'Free Food', 'Vouchers', 'Perks'];

export default function RewardsPage() {
  const router = useRouter();
  const { coins, removeCoins } = useCoins();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [purchased, setPurchased] = useState<Record<string, { date: string; redeemed: boolean }>>({});
  const [showConfirm, setShowConfirm] = useState<Reward | null>(null);
  const [showSuccess, setShowSuccess] = useState<Reward | null>(null);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) { router.push('/login'); return; }
    setIsLoggedIn(true);

    const saved = localStorage.getItem('muragoods_rewards_purchased');
    if (saved) {
      try { setPurchased(JSON.parse(saved)); } catch { /* empty */ }
    }
  }, [router]);

  const handleBuy = (reward: Reward) => {
    if (coins < reward.cost || purchased[reward.id]) return;
    setShowConfirm(reward);
  };

  const confirmBuy = () => {
    if (!showConfirm) return;
    removeCoins(showConfirm.cost, `Rewards: ${showConfirm.name}`);
    const newPurchased = { ...purchased, [showConfirm.id]: { date: new Date().toISOString(), redeemed: false } };
    setPurchased(newPurchased);
    localStorage.setItem('muragoods_rewards_purchased', JSON.stringify(newPurchased));
    setShowSuccess(showConfirm);
    setShowConfirm(null);
  };

  const filteredRewards = selectedCategory === 'All' ? rewards : rewards.filter(r => r.category === selectedCategory);

  if (!isLoggedIn) return null;

  return (
    <main className="min-h-screen">
      <NavBar pageLabel="Rewards Shop" />

      <section className="px-4 py-10 sm:px-8">
        <div className="deco-container" style={{ maxWidth: '56rem' }}>

          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl text-[var(--cream)] uppercase" style={{ fontFamily: 'var(--font-arcade)', textShadow: '3px 3px 0px var(--gold-dark)' }}>
              🏪 Rewards Shop
            </h1>
            <p className="mt-3 text-base text-[var(--gold)]">Spend your coins on real rewards!</p>
            <div className="mt-4 inline-flex items-center gap-2 border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.1)] px-5 py-2 rounded-xl">
              <span className="coin-float">🪙</span>
              <span className="text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px' }}>{coins.toLocaleString()}</span>
              <span className="text-[var(--pewter)] text-sm">coins</span>
            </div>
          </div>

          {/* Categories */}
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {rewardCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 border-2 rounded-xl text-[9px] transition-all ${selectedCategory === cat ? 'border-[var(--gold)] bg-[var(--gold)] text-[var(--obsidian)]' : 'border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] text-[var(--cream-muted)] hover:border-[var(--gold)]'}`}
                style={{ fontFamily: 'var(--font-arcade)' }}
              >
                {cat !== 'All' && categoryEmojis[cat]} {cat}
              </button>
            ))}
          </div>

          {/* Rewards Grid */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRewards.map(reward => {
              const isPurchased = !!purchased[reward.id];
              const canAfford = coins >= reward.cost;
              return (
                <div
                  key={reward.id}
                  className={`power-card p-5 rounded-2xl transition-all ${isPurchased ? 'opacity-60' : canAfford ? 'hover:border-[var(--gold-bright)]' : 'opacity-50'}`}
                >
                  {/* Icon + Cost */}
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-3xl">{reward.icon}</span>
                    <span className={`text-[9px] px-3 py-1 rounded-lg border ${isPurchased ? 'border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.2)] text-[var(--emerald-bright)]' : 'border-[var(--gold)] bg-[rgba(212,175,55,0.1)] text-[var(--gold-bright)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                      {isPurchased ? '✓ OWNED' : `🪙 ${reward.cost.toLocaleString()}`}
                    </span>
                  </div>

                  {/* Name */}
                  <h3 className="text-[10px] text-[var(--cream)] uppercase mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>
                    {reward.name}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-[var(--pewter)] leading-relaxed mb-4">
                    {reward.description}
                  </p>

                  {/* Category */}
                  <p className="text-[8px] text-[var(--gold)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>
                    {categoryEmojis[reward.category]} {reward.category}
                  </p>

                  {/* Buy Button */}
                  {isPurchased ? (
                    <div className="border-2 border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.1)] rounded-xl p-3 text-center">
                      <p className="text-[9px] text-[var(--emerald-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                        ✓ Purchased — Show this to claim at DWCL
                      </p>
                      <p className="text-[8px] text-[var(--pewter)] mt-1">
                        {new Date(purchased[reward.id].date).toLocaleDateString()}
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleBuy(reward)}
                      disabled={!canAfford}
                      className={`w-full deco-btn rounded-xl ${canAfford ? 'deco-btn-gold' : 'deco-btn-dark opacity-40 cursor-not-allowed'}`}
                      style={{ fontFamily: 'var(--font-arcade)', fontSize: '9px' }}
                    >
                      {canAfford ? `🪙 Buy for ${reward.cost.toLocaleString()}` : `Need ${(reward.cost - coins).toLocaleString()} more coins`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* How to earn */}
          <div className="mt-10 border-2 border-[rgba(242,240,228,0.12)] bg-[var(--charcoal)] rounded-2xl p-6 text-center">
            <h3 className="text-[10px] text-[var(--gold)] uppercase mb-3" style={{ fontFamily: 'var(--font-arcade)' }}>Need more coins?</h3>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/menu" className="deco-btn deco-btn-sm rounded-xl">🛒 Order & Earn</Link>
              <Link href="/play/checkin" className="deco-btn deco-btn-sm rounded-xl">📅 Check In</Link>
              <Link href="/play/trivia" className="deco-btn deco-btn-sm deco-btn-crimson rounded-xl">🧠 Trivia</Link>
              <Link href="/play/refer" className="deco-btn deco-btn-sm rounded-xl">👥 Refer</Link>
              <Link href="/play/mysterybox" className="deco-btn deco-btn-sm rounded-xl">🎁 Mystery Box</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Confirm Modal ──────────────────────────────────── */}
      {showConfirm && (
        <div className="deco-overlay" onClick={() => setShowConfirm(null)}>
          <div className="deco-modal bounce-in rounded-2xl max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="deco-modal-header text-center rounded-t-2xl">
              <h2 className="text-sm text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Confirm Purchase</h2>
            </div>
            <div className="deco-modal-body text-center space-y-4">
              <span className="text-4xl">{showConfirm.icon}</span>
              <h3 className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{showConfirm.name}</h3>
              <p className="text-xs text-[var(--pewter)]">{showConfirm.description}</p>
              <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] rounded-xl p-3">
                <p className="text-[9px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>Cost</p>
                <p className="coin-price text-lg">🪙 {showConfirm.cost.toLocaleString()}</p>
                <p className="text-[8px] text-[var(--pewter)] mt-1">Remaining: {(coins - showConfirm.cost).toLocaleString()} coins</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowConfirm(null)} className="deco-btn flex-1 rounded-xl">Cancel</button>
                <button onClick={confirmBuy} className="deco-btn deco-btn-gold flex-1 rounded-xl">🪙 Buy Now</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Success Modal ──────────────────────────────────── */}
      {showSuccess && (
        <div className="deco-overlay" onClick={() => setShowSuccess(null)}>
          <div className="deco-modal bounce-in rounded-2xl max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="deco-modal-header text-center rounded-t-2xl" style={{ background: 'linear-gradient(135deg, #1E3D2F, var(--emerald-bright))' }}>
              <h2 className="text-sm text-[var(--gold-bright)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>🎉 Reward Claimed!</h2>
            </div>
            <div className="deco-modal-body text-center space-y-4">
              <span className="text-5xl">{showSuccess.icon}</span>
              <h3 className="text-sm text-[var(--cream)]" style={{ fontFamily: 'var(--font-arcade)' }}>{showSuccess.name}</h3>
              <p className="text-xs text-[var(--pewter)]">Show this screen at DWCL to claim your reward!</p>
              <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.08)] rounded-xl p-3">
                <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Reward Code</p>
                <p className="text-lg text-[var(--gold-bright)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>
                  {showSuccess.id.toUpperCase().slice(0, 8)}-{Math.random().toString(36).slice(2, 6).toUpperCase()}
                </p>
              </div>
              <button onClick={() => setShowSuccess(null)} className="deco-btn deco-btn-gold w-full rounded-xl">Done</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
