'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ONE button for the whole product.
//
// Every primary action on the site — shop checkout, Murastream "Watch Now",
// account actions, Murabot module actions — renders through this component,
// so geometry, radius, motion and the yellow-on-dark relationship can never
// drift between a shop CTA and a dashboard action.
//
// Intent is a semantic choice, not a colour choice:
//
//   primary    Muragoods yellow fill, dark ink text — the brand action
//   secondary  glass surface, light text — a real but quieter action
//   ghost      no chrome until hover
//   danger     destructive only (delete, revoke, disconnect)
//   success    confirmation only
//
// Red is never used for "primary" and green is never used for "success by
// default" — success exists, but it is not the brand.

export type GlassButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'success';

export type GlassButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASS: Record<GlassButtonVariant, string> = {
  primary: 'mg-btn-primary',
  secondary: 'mg-btn-secondary',
  ghost: 'mg-btn-ghost',
  danger: 'mg-btn-danger',
  success: 'mg-btn-success',
};

const SIZE_CLASS: Record<GlassButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: '',
  lg: 'px-6 py-3 text-base',
};

type BaseProps = {
  variant?: GlassButtonVariant;
  size?: GlassButtonSize;
  href?: string;
  className?: string;
  children: ReactNode;
  /** Accessible label when the visible content is an icon only. */
  'aria-label'?: string;
};

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function GlassButton({
  variant = 'primary',
  size = 'md',
  href,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = cn('mg-btn', VARIANT_CLASS[variant], SIZE_CLASS[size], className);

  if (href) {
    const { variant: _v, size: _s, ...anchorRest } = rest as Record<string, unknown>;
    return (
      <Link href={href} className={classes} {...(anchorRest as object)}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

export default GlassButton;
