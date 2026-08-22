'use client';

import { useCoins } from '@/app/hooks/useCoins';

interface CoinBalanceProps {
  count?: number;
  size?: 'sm' | 'md';
}

export function CoinBalance({ count, size = 'sm' }: CoinBalanceProps) {
  const { coins, loaded } = useCoins();
  const displayCoins = count !== undefined ? count : coins;
  const isSmall = size === 'sm';

  return (
    <div
      className={`inline-flex items-center gap-2 mario-badge mario-badge-gold ${isSmall ? 'px-3 py-1.5' : 'px-4 py-2'} overflow-hidden max-w-full`}
      title={`${displayCoins} coins`}
    >
      <span className={`${isSmall ? 'text-sm' : 'text-base'} shrink-0`}>🪙</span>
      <span
        className={`mario-text-xs font-arcade text-mario-yellow shrink-0 truncate`}
      >
        {loaded ? displayCoins.toLocaleString() : '---'}
      </span>
    </div>
  );
}
