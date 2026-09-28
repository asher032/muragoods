'use client';

import { useState, useCallback } from 'react';

export interface AwardRequest {
  gameId: string;
  score?: number;
  moves?: number;
  timeSec?: number;
  difficulty?: number;
  cleared?: number;
  playTimeSec?: number;
}

export interface AwardResponse {
  success: boolean;
  coins?: number;
  xp?: number;
  achievements?: string[];
  playsLeft?: number;
  discountCode?: string;
  discountPct?: number;
  streak?: number;
  balance?: number | null;
  error?: string;
}

/**
 * Server-backed play flow. Each round mints a single-use session, then
 * redeems it with the verified result. Prizes are computed server-side —
 * the browser only reports gameplay facts. After every award, coin badges
 * refresh from the server balance.
 */
export function useGameSession(gameId: string) {
  const [awarding, setAwarding] = useState(false);
  const [lastAward, setLastAward] = useState<AwardResponse | null>(null);

  const award = useCallback(async (req: AwardRequest): Promise<AwardResponse> => {
    setAwarding(true);
    try {
      const sess = await fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      const sessData = await sess.json().catch(() => ({}));
      if (!sessData.success || !sessData.token) {
        const r = { success: false, error: 'Sign in to save progress and earn rewards.' };
        setLastAward(r);
        return r;
      }
      const res = await fetch('/api/games/award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...req, sessionToken: sessData.token as string }),
      });
      const data = (await res.json()) as AwardResponse;
      setLastAward(data);
      try { window.dispatchEvent(new CustomEvent('muragoods:coins-changed')); } catch { /* noop */ }
      return data;
    } catch {
      const r = { success: false, error: 'Reward claim failed — try again.' };
      setLastAward(r);
      return r;
    } finally {
      setAwarding(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  return { award, awarding, lastAward };
}
