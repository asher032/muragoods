import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ONE card. A Murastream poster tile, a Murabot settings panel, an account
// summary and a shop product tile are all the same object with different
// contents: same radius, same border, same fill, same elevation, same lift.
//
// A card may carry a product accent (Murastream's cinematic red on a poster
// badge, a dashboard module's colour on its icon chip). It may not change its
// own geometry to do it.

export type GlassCardPadding = 'none' | 'sm' | 'md' | 'lg';

const PADDING: Record<GlassCardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  /** Lifts and warms the border on hover. Use for anything clickable. */
  interactive?: boolean;
  /** Solid fill instead of glass — for modals and menus over content. */
  solid?: boolean;
  padding?: GlassCardPadding;
  children?: ReactNode;
};

export function GlassCard({
  interactive = false,
  solid = false,
  padding = 'md',
  className,
  children,
  ...rest
}: GlassCardProps) {
  return (
    <div
      className={cn(
        'mg-card',
        interactive && 'mg-card-hover',
        solid && 'bg-[var(--mg-surface)] backdrop-none',
        PADDING[padding],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export default GlassCard;
