'use client';

import { useState, useCallback, useEffect } from 'react';

const COINS_KEY = 'muragoods_coins';
const HISTORY_KEY = 'muragoods_points_history';
const DEFAULT_BALANCE = 100;

interface Transaction {
  type: 'earn' | 'spend';
  amount: number;
  label: string;
  date: string;
}

/**
 * localStorage-backed coin balance for the Art Deco Mario campus store.
 * Students earn coins by placing orders and can spend them on future purchases.
 * Defaults to 100 coins for new users.
 * Now includes transaction history tracking.
 */
export function useCoins() {
  const [coins, setCoins] = useState<number>(DEFAULT_BALANCE);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState<Transaction[]>([]);

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

  const recordTransaction = useCallback((type: 'earn' | 'spend', amount: number, label: string) => {
    const tx: Transaction = { type, amount, label, date: new Date().toISOString() };
    setHistory(prev => {
      const next = [tx, ...prev].slice(0, 100); // keep last 100
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const addCoins = useCallback((amount: number, label = 'Earned coins') => {
    setCoins((prev) => prev + amount);
    recordTransaction('earn', amount, label);
  }, [recordTransaction]);

  const removeCoins = useCallback((amount: number, label = 'Spent coins') => {
    setCoins((prev) => Math.max(0, prev - amount));
    recordTransaction('spend', amount, label);
  }, [recordTransaction]);

  const resetCoins = useCallback(() => {
    setCoins(DEFAULT_BALANCE);
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }, []);

  return { coins, addCoins, removeCoins, resetCoins, history, loaded };
}
