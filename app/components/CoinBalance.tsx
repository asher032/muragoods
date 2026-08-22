'use client';

import { useCoins } from '@/app/hooks/useCoins';

interface CoinBalanceProps {
  /** Optional: override to show a specific coin count instead of using the hook */
  count?: number;
  /** Optional: size variant */
  size?: 'sm' | 'md';
}

/**
 * Art Deco Mario Coin Balance Badge
 *
 * A spinning gold coin icon with a glowing border and the student's
 * current coin count. Displays in the navbar next to the cart button.
 *
 * Coins are persisted in localStorage and default to 100 for new users.
 */
export function CoinBalance({ count, size = 'sm' }: CoinBalanceProps) {
  const { coins, loaded } = useCoins();
  const displayCoins = count !== undefined ? count : coins;

  const isSmall = size === 'sm';

  return (
    <div
      className={`
        inline-flex items-center gap-2
        border-2 border-[var(--gold)]
        bg-[rgba(212,175,55,0.1)]
        ${isSmall ? 'px-3 py-1.5' : 'px-4 py-2'}
        transition-all
        hover:bg-[rgba(212,175,55,0.18)]
        hover:shadow-[0_0_15px_rgba(212,175,55,0.3)]
      `}
      title={`${displayCoins} coins`}
    >
      {/* Spinning Coin Icon */}
      <span
        className={`
          inline-block
          ${isSmall ? 'text-sm' : 'text-base'}
        `}
        style={{
          animation: 'coinSpin 3s linear infinite',
          display: 'inline-block',
          filter: 'drop-shadow(0 0 6px rgba(212, 175, 55, 0.5))',
        }}
        aria-hidden="true"
      >
        🪙
      </span>

      {/* Coin Count */}
      <span
        className={`
          text-[var(--gold-bright)]
          ${isSmall ? 'text-[9px]' : 'text-[10px]'}
          font-bold
          uppercase
          tracking-wider
        `}
        style={{ fontFamily: 'var(--font-arcade)' }}
      >
        {loaded ? displayCoins.toLocaleString() : '---'}
      </span>
    </div>
  );
}
