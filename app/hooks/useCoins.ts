'use client';

import { useState, useCallback, useEffect } from 'react';

const COINS_KEY = 'muragoods_coins';
const DEFAULT_BALANCE = 100;

/**
 * localStorage-backed coin balance for the Art Deco Mario campus store.
 * Students earn coins by placing orders and can spend them on future purchases.
 * Defaults to 100 coins for new users.
 */
export function useCoins() {
  const [coins, setCoins] = useState<number>(DEFAULT_BALANCE);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COINS_KEY);
      if (stored !== null) {
        setCoins(JSON.parse(stored));
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

  const addCoins = useCallback((amount: number) => {
    setCoins((prev) => prev + amount);
  }, []);

  const removeCoins = useCallback((amount: number) => {
    setCoins((prev) => Math.max(0, prev - amount));
  }, []);

  const resetCoins = useCallback(() => {
    setCoins(DEFAULT_BALANCE);
  }, []);

  return { coins, addCoins, removeCoins, resetCoins, loaded };
}
