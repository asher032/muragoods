import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Status colour is semantic and fixed across the whole product:
//
//   success = green   warning = amber   error = red   info = blue
//   brand   = Muragoods yellow
//
// A module may carry its own accent (a dashboard module chip, a game rarity),
// but a STATUS is never re-coloured for looks — "Pending" is amber everywhere
// and "Delivered" is green everywhere.

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'info';

const TONE: Record<BadgeTone, string> = {
  neutral: '',
  brand: 'mg-badge-brand',
  success: 'mg-badge-success',
  warning: 'mg-badge-warning',
  error: 'mg-badge-error',
  info: 'mg-badge-info',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn('mg-badge', TONE[tone], className)}>{children}</span>;
}

export function SectionHeader({
  label,
  title,
  description,
  action,
  className,
}: {
  label?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        {label ? <p className="mg-section-label mb-1.5">{label}</p> : null}
        <h2 className="mg-section-title">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-[var(--mg-text-muted)]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export default Badge;
