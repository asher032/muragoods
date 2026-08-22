'use client';

import { useState, useCallback, useEffect } from 'react';

const COINS_KEY = 'muragoods_coins';
const HISTORY_KEY = 'muragoods_points_history';
const RESTRICTIONS_KEY = 'muragoods_coin_restrictions';
const DEFAULT_BALANCE = 0;

interface Transaction {
  type: 'earn' | 'spend';
  amount: number;
  label: string;
  date: string;
}

interface CoinRestrictions {
  dailyEarned: number;
  dailyDate: string;
  lastCheckIn: string;
  lastTrivia: string;
  lastMysteryBox: string;
  lastReferral: string;
  totalLifetimeEarned: number;
  verified: boolean;
}

function getDefaultRestrictions(): CoinRestrictions {
  return {
    dailyEarned: 0,
    dailyDate: new Date().toISOString().split('T')[0],
    lastCheckIn: '',
    lastTrivia: '',
    lastMysteryBox: '',
    lastReferral: '',
    totalLifetimeEarned: 0,
    verified: false,
  };
}

// Daily coin earning cap from non-order activities
const DAILY_EARN_LIMIT = 150;
// Minimum cooldowns (ms)
const CHECKIN_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours
const TRIVIA_COOLDOWN = 30 * 60 * 1000; // 30 minutes
const MYSTERY_BOX_COOLDOWN = 5 * 60 * 1000; // 5 minutes
const REFERRAL_COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * localStorage-backed coin balance with earning restrictions.
 * - New users start with 0 coins
 * - Daily earning limit of 150 coins from non-order activities
 * - Cooldowns on check-in, trivia, mystery box, referrals
 * - Must verify account (have at least 1 delivered order) to earn coins
 */
export function useCoins() {
  const [coins, setCoins] = useState<number>(DEFAULT_BALANCE);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [restrictions, setRestrictions] = useState<CoinRestrictions>(getDefaultRestrictions());

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COINS_KEY);
      if (stored !== null) {
        setCoins(JSON.parse(stored));
      }
      const savedHistory = localStorage.getItem(HISTORY_KEY);
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
      const savedRestrictions = localStorage.getItem(RESTRICTIONS_KEY);
      if (savedRestrictions) {
        const parsed = JSON.parse(savedRestrictions) as CoinRestrictions;
        // Reset daily counter if it's a new day
        const today = new Date().toISOString().split('T')[0];
        if (parsed.dailyDate !== today) {
          parsed.dailyEarned = 0;
          parsed.dailyDate = today;
        }
        setRestrictions(parsed);
      }
    } catch {
      // keep default
    }
    setLoaded(true);
  }, []);

  // Persist whenever coins change
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(COINS_KEY, JSON.stringify(coins));
    }
  }, [coins, loaded]);

  // Persist restrictions
  useEffect(() => {
    if (loaded) {
      localStorage.setItem(RESTRICTIONS_KEY, JSON.stringify(restrictions));
    }
  }, [restrictions, loaded]);

  const recordTransaction = useCallback((type: 'earn' | 'spend', amount: number, label: string) => {
    const tx: Transaction = { type, amount, label, date: new Date().toISOString() };
    setHistory(prev => {
      const next = [tx, ...prev].slice(0, 100);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const updateRestrictions = useCallback((updates: Partial<CoinRestrictions>) => {
    setRestrictions(prev => ({ ...prev, ...updates }));
  }, []);

  const canEarn = useCallback((amount: number): { allowed: boolean; reason: string } => {
    const today = new Date().toISOString().split('T')[0];

    // Reset daily counter if new day
    if (restrictions.dailyDate !== today) {
      return { allowed: true, reason: '' };
    }

    // Check daily limit
    if (restrictions.dailyEarned + amount > DAILY_EARN_LIMIT) {
      const remaining = Math.max(0, DAILY_EARN_LIMIT - restrictions.dailyEarned);
      return {
        allowed: false,
        reason: `Daily limit reached! You can earn ${remaining} more coins today.`,
      };
    }

    return { allowed: true, reason: '' };
  }, [restrictions]);

  const checkCooldown = useCallback((type: 'checkin' | 'trivia' | 'mysterybox' | 'referral'): { allowed: boolean; waitTime: string } => {
    const now = Date.now();
    let lastUsed = 0;

    switch (type) {
      case 'checkin': lastUsed = restrictions.lastCheckIn ? new Date(restrictions.lastCheckIn).getTime() : 0; break;
      case 'trivia': lastUsed = restrictions.lastTrivia ? new Date(restrictions.lastTrivia).getTime() : 0; break;
      case 'mysterybox': lastUsed = restrictions.lastMysteryBox ? new Date(restrictions.lastMysteryBox).getTime() : 0; break;
      case 'referral': lastUsed = restrictions.lastReferral ? new Date(restrictions.lastReferral).getTime() : 0; break;
    }

    const cooldowns = { checkin: CHECKIN_COOLDOWN, trivia: TRIVIA_COOLDOWN, mysterybox: MYSTERY_BOX_COOLDOWN, referral: REFERRAL_COOLDOWN };
    const elapsed = now - lastUsed;

    if (elapsed < cooldowns[type]) {
      const remaining = cooldowns[type] - elapsed;
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const waitTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      return { allowed: false, waitTime };
    }

    return { allowed: true, waitTime: '' };
  }, [restrictions]);

  const addCoins = useCallback((amount: number, label = 'Earned coins', skipRestrictionCheck = false) => {
    if (!skipRestrictionCheck) {
      const { allowed, reason } = canEarn(amount);
      if (!allowed) {
        alert(reason);
        return;
      }
    }

    setCoins((prev) => prev + amount);
    recordTransaction('earn', amount, label);

    const today = new Date().toISOString().split('T')[0];
    updateRestrictions({
      dailyEarned: restrictions.dailyDate === today ? restrictions.dailyEarned + amount : amount,
      dailyDate: today,
      totalLifetimeEarned: restrictions.totalLifetimeEarned + amount,
    });
  }, [canEarn, recordTransaction, updateRestrictions, restrictions]);

  const removeCoins = useCallback((amount: number, label = 'Spent coins') => {
    setCoins((prev) => Math.max(0, prev - amount));
    recordTransaction('spend', amount, label);
  }, [recordTransaction]);

  const resetCoins = useCallback(() => {
    setCoins(DEFAULT_BALANCE);
    setHistory([]);
    setRestrictions(getDefaultRestrictions());
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(RESTRICTIONS_KEY);
  }, []);

  return {
    coins,
    addCoins,
    removeCoins,
    resetCoins,
    history,
    loaded,
    restrictions,
    canEarn,
    checkCooldown,
    updateRestrictions,
    dailyLimit: DAILY_EARN_LIMIT,
  };
}
