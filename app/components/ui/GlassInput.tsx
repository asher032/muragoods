'use client';

import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

// ONE form language. Search bars, login forms, dashboard settings, the shop
// checkout and the Murastream request form all use these, so focus rings,
// placeholder contrast, radius and error messaging are identical everywhere.
//
// The dark `<option>` fix matters most: a native select renders its option
// list with the OS theme, which on this dark UI means white-on-white. The
// token layer forces the dark surface.

export function GlassInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('mg-input', className)} {...rest} />;
}

export function GlassSelect({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn('mg-select', className)} {...rest} />;
}

export function GlassTextarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('mg-textarea', className)} {...rest} />;
}

export function GlassLabel({ className, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mg-label', className)} {...rest} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs font-semibold text-[var(--mg-error)]">
      {children}
    </p>
  );
}

export default GlassInput;
