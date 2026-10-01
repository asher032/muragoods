import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Loading, empty and error look the same everywhere.
//
// The bug this prevents: a page that renders its own spinner, another that
// renders "Nothing here" as plain grey text, and a third that shows a raw
// error string. All three now speak the same language, and an error always
// names what happened without leaking internals.

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('mg-state', className)} role="status" aria-live="polite">
      <span className="mg-spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('mg-skeleton h-24 w-full', className)} aria-hidden />;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mg-state', className)}>
      <p className="text-base font-semibold text-[var(--mg-text)]">{title}</p>
      {description ? <p className="max-w-sm text-sm">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mg-state mg-state-error', className)} role="alert">
      <p className="text-base font-semibold">{title}</p>
      {description ? <p className="max-w-sm text-sm">{description}</p> : null}
      {action}
    </div>
  );
}
