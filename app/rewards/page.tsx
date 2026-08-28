'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NavBar } from '@/app/components/NavBar';
import { useCoins } from '@/app/hooks/useCoins';
import { Icon } from '@/app/components/Icon';

interface Reward {
  id: string;
  name: string;
  description: string;
  cost: number;
  icon: React.ReactNode;
  category: string;
}

const rewards: Reward[] = [
  // Discount Vouchers
  { id: 'free_shipping', name: 'Free Shipping Voucher', description: 'Free delivery for your next order outside DWCL.', cost: 300, icon: '🚚', category: 'Vouchers' },
  { id: 'voucher_10', name: '₱10 Off Voucher', description: 'Get ₱10 off your next order. No minimum.', cost: 200, icon: '🏷️', category: 'Vouchers' },
  { id: 'voucher_50', name: '₱50 Off Voucher', description: 'Get ₱50 off your next order. Minimum order ₱75.', cost: 600, icon: '🏷️', category: 'Vouchers' },
  { id: 'double_points', name: '2x Points (Next Order)', description: 'Earn double coins on your next order for 24 hours.', cost: 500, icon: '✨', category: 'Vouchers' },
  { id: 'free_musubi', name: 'Free Musubi', description: 'Get a free regular musubi on your next order.', cost: 100, icon: '🍙', category: 'Vouchers' },

  // Special Perks
  { id: 'priority_order', name: 'Priority Order', description: 'Skip the queue — your order gets prepared first.', cost: 400, icon: '⚡', category: 'Perks' },
  { id: 'mystery_upgrade', name: 'Mystery Box Upgrade', description: 'Your next mystery box is guaranteed Rare or above.', cost: 800, icon: <Icon name="gift" size={20} />, category: 'Perks' },
  { id: 'custom_shoutout', name: 'Shoutout on Instagram', description: 'Get a personalized shoutout on the Muragoods Instagram page.', cost: 1000, icon: '📱', category: 'Perks' },
  { id: 'gold_member', name: 'Gold Member Badge', description: 'Permanent gold badge on your profile — shows you\'re a top supporter. Perks: priority support, exclusive early access to new items, and a special gold border on your profile.', cost: 2000, icon: '👑', category: 'Perks' },
];

const categoryEmojis: Record<string, string> = {
  Vouchers: '🏷️',
  Perks: '⭐',
};

const rewardCategories = ['All', 'Vouchers', 'Perks'];

export default function RewardsPage() {
  const router = useRouter();
  const { coins, removeCoins } = useCoins();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [purchased, setPurchased] = useState<Record<string, { date: string; redeemed: boolean; code: string }>>({});
  const [userPerks, setUserPerks] = useState<{ perkId: string; perkName: string; redeemed: boolean }[]>([]);
  const [showConfirm, setShowConfirm] = useState<Reward | null>(null);
  const [showSuccess, setShowSuccess] = useState<Reward | null>(null);
  const [successCode, setSuccessCode] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  // Admin search state
  const [adminSearch, setAdminSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ name: string; email: string; userId: string; perks: { perkId: string; perkName: string; redeemed: boolean }[] }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ name: string; email: string; userId: string; perks: { perkId: string; perkName: string; redeemed: boolean }[] } | null>(null);
  const [addingPerk, setAddingPerk] = useState(false);

  const adminEmails = ['muragoods0@gmail.com', 'mhaxthedog@gmail.com'];

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) { router.push('/login'); return; }
    const u = JSON.parse(userStr);
    setUserEmail(u.email);
    setUserName(u.name);
    setIsLoggedIn(true);
    if (adminEmails.includes(u.email)) setIsAdmin(true);

    // Load saved purchases
    const saved = localStorage.getItem('muragoods_rewards_purchased');
    if (saved) {
      try { setPurchased(JSON.parse(saved)); } catch { /* empty */ }
    }

    // Fetch user ID and perks from API
    async function fetchUser() {
      try {
        const res = await fetch(`/api/perks?email=${encodeURIComponent(u.email)}`);
        const result = await res.json();
        if (result.success && result.data) {
          setUserId(result.data.userId || '');
          setUserPerks(result.data.perks || []);
        }
      } catch { /* empty */ }
    }
    fetchUser();
  }, [router]);

  const generateCode = () => {
    return `${showConfirm?.id.toUpperCase().slice(0, 6)}-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
  };

  const handleBuy = (reward: Reward) => {
    if (coins < reward.cost || purchased[reward.id] || userPerks.some(p => p.perkId === reward.id)) return;
    setShowConfirm(reward);
  };

  const confirmBuy = async () => {
    if (!showConfirm) return;
    const code = generateCode();
    removeCoins(showConfirm.cost, `Rewards: ${showConfirm.name}`);

    // Save locally
    const newPurchased = { ...purchased, [showConfirm.id]: { date: new Date().toISOString(), redeemed: false, code } };
    setPurchased(newPurchased);
    localStorage.setItem('muragoods_rewards_purchased', JSON.stringify(newPurchased));

    // Save to API
    try {
      await fetch('/api/perks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          perkId: showConfirm.id,
          perkName: showConfirm.name,
          perkDescription: showConfirm.description,
          addedBy: 'Self-purchase',
        }),
      });
      setUserPerks(prev => [...prev, { perkId: showConfirm.id, perkName: showConfirm.name, redeemed: false }]);
    } catch { /* empty */ }

    setSuccessCode(code);
    setShowSuccess(showConfirm);
    setShowConfirm(null);
  };

  const handleAdminAddPerk = async (userEmail: string, perkId: string, perkName: string, perkDescription: string) => {
    setAddingPerk(true);
    try {
      const res = await fetch('/api/perks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          perkId,
          perkName,
          perkDescription,
          addedBy: userName,
        }),
      });
      const result = await res.json();
      if (result.success) {
        // Refresh search results
        handleAdminSearch();
      } else {
        alert(result.error || 'Failed to add perk');
      }
    } catch {
      alert('Failed to add perk');
    } finally {
      setAddingPerk(false);
    }
  };

  const handleAdminSearch = async () => {
    if (!adminSearch.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/perks?query=${encodeURIComponent(adminSearch.trim())}`);
      const result = await res.json();
      if (result.success) setSearchResults(result.data);
    } catch { /* empty */ }
    setSearching(false);
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

            {/* User ID + Balance */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              {userId && (
                <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.08)] px-4 py-2 rounded-xl">
                  <p className="text-[8px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>Your ID</p>
                  <p className="text-[11px] text-[var(--gold-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>{userId}</p>
                </div>
              )}
              <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.1)] px-5 py-2 rounded-xl">
                <span className="coin-float inline-block">🪙</span>
                <span className="text-[var(--gold-bright)] ml-2" style={{ fontFamily: 'var(--font-arcade)', fontSize: '14px' }}>{coins.toLocaleString()}</span>
                <span className="text-[var(--pewter)] text-sm ml-1">coins</span>
              </div>
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
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
            {filteredRewards.map(reward => {
              const isPurchased = !!purchased[reward.id] || userPerks.some(p => p.perkId === reward.id);
              const canAfford = coins >= reward.cost;
              return (
                <div
                  key={reward.id}
                  className={`power-card p-5 rounded-2xl transition-all ${isPurchased ? 'opacity-70' : canAfford ? 'hover:border-[var(--gold-bright)]' : 'opacity-50'}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-3xl">{reward.icon}</span>
                    <span className={`text-[9px] px-3 py-1 rounded-lg border ${isPurchased ? 'border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.2)] text-[var(--emerald-bright)]' : 'border-[var(--gold)] bg-[rgba(212,175,55,0.1)] text-[var(--gold-bright)]'}`} style={{ fontFamily: 'var(--font-arcade)' }}>
                      {isPurchased ? '✓ OWNED' : `🪙 ${reward.cost.toLocaleString()}`}
                    </span>
                  </div>
                  <h3 className="text-[10px] text-[var(--cream)] uppercase mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>{reward.name}</h3>
                  <p className="text-sm text-[var(--pewter)] leading-relaxed mb-3">{reward.description}</p>
                  <p className="text-[8px] text-[var(--gold)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>
                    {categoryEmojis[reward.category]} {reward.category}
                  </p>
                  {isPurchased ? (
                    <div className="border-2 border-[var(--emerald-bright)] bg-[rgba(30,61,47,0.1)] rounded-xl p-3 text-center">
                      <p className="text-[9px] text-[var(--emerald-bright)]" style={{ fontFamily: 'var(--font-arcade)' }}>
                        ✓ Owned — Show this at DWCL
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

          {/* Admin Panel */}
          {isAdmin && (
            <div className="mt-10 border-2 border-[var(--crimson)] bg-[var(--charcoal)] rounded-2xl p-6">
              <h2 className="text-sm text-[var(--crimson)] uppercase mb-4" style={{ fontFamily: 'var(--font-arcade)' }}>🔧 Admin: Manage User Perks</h2>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={adminSearch}
                  onChange={(e) => setAdminSearch(e.target.value)}
                  placeholder="Search user by name, email, or ID..."
                  className="deco-input rounded-xl flex-1"
                />
                <button onClick={handleAdminSearch} disabled={searching} className="deco-btn deco-btn-crimson rounded-xl">
                  {searching ? '...' : '🔍'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-3">
                  {searchResults.map(user => (
                    <div key={user.email} className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] rounded-xl p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-[var(--cream)]">{user.name}</p>
                          <p className="text-[9px] text-[var(--pewter)]">{user.email}</p>
                          <p className="text-[9px] text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>ID: {user.userId || 'N/A'}</p>
                          {user.perks && user.perks.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {user.perks.map((p: { perkId: string; perkName: string }) => (
                                <span key={p.perkId} className="text-[7px] px-2 py-0.5 border border-[var(--gold)] bg-[rgba(212,175,55,0.1)] text-[var(--gold)] rounded-lg" style={{ fontFamily: 'var(--font-arcade)' }}>
                                  {p.perkName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setSelectedUser(selectedUser?.email === user.email ? null : user)}
                          className="deco-btn deco-btn-sm deco-btn-crimson rounded-lg shrink-0"
                          style={{ fontSize: '8px' }}
                        >
                          {selectedUser?.email === user.email ? 'Close' : 'Add Perk'}
                        </button>
                      </div>

                      {/* Add Perk Panel */}
                      {selectedUser?.email === user.email && (
                        <div className="mt-3 pt-3 border-t border-[rgba(242,240,228,0.08)]">
                          <p className="text-[8px] text-[var(--pewter)] uppercase mb-2" style={{ fontFamily: 'var(--font-arcade)' }}>Add Perk</p>
                          <div className="grid grid-cols-2 gap-2">
                            {rewards.map(reward => {
                              const hasPerk = user.perks?.some((p: { perkId: string }) => p.perkId === reward.id);
                              return (
                                <button
                                  key={reward.id}
                                  onClick={() => handleAdminAddPerk(user.email, reward.id, reward.name, reward.description)}
                                  disabled={hasPerk || addingPerk}
                                  className={`p-2 border rounded-lg text-left transition-all ${hasPerk ? 'border-[var(--emerald-bright)] opacity-50 cursor-not-allowed' : 'border-[rgba(242,240,228,0.12)] hover:border-[var(--gold)]'}`}
                                >
                                  <span className="text-sm">{reward.icon}</span>
                                  <p className="text-[8px] text-[var(--cream)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>{reward.name}</p>
                                  <p className="text-[7px] text-[var(--pewter)]">{hasPerk ? '✓ Already has' : 'Click to add'}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
              {userId && (
                <p className="text-[8px] text-[var(--pewter)]">Your ID: <span className="text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>{userId}</span></p>
              )}
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
              {userId && (
                <div className="border border-[rgba(242,240,228,0.12)] bg-[var(--charcoal-light)] rounded-xl p-2">
                  <p className="text-[7px] text-[var(--pewter)]" style={{ fontFamily: 'var(--font-arcade)' }}>Your ID</p>
                  <p className="text-[10px] text-[var(--gold)]" style={{ fontFamily: 'var(--font-arcade)' }}>{userId}</p>
                </div>
              )}
              <div className="border-2 border-[var(--gold)] bg-[rgba(212,175,55,0.08)] rounded-xl p-3">
                <p className="text-[8px] text-[var(--gold)] uppercase" style={{ fontFamily: 'var(--font-arcade)' }}>Reward Code</p>
                <p className="text-lg text-[var(--gold-bright)] mt-1" style={{ fontFamily: 'var(--font-arcade)' }}>{successCode}</p>
              </div>
              <button onClick={() => setShowSuccess(null)} className="deco-btn deco-btn-gold w-full rounded-xl">Done</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
