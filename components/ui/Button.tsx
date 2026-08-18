'use client';

import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-press active:bg-accent-press',
  secondary:
    'bg-ink text-black hover:bg-white active:bg-white',
  ghost:
    'border border-hairline text-ink hover:bg-surface active:bg-surface-2',
  danger: 'border border-danger/60 text-danger hover:bg-danger/10 active:bg-danger/20',
};

/**
 * The only button in the app. Pill shape, one radius system, and every state
 * accounted for: hover, active push, disabled, and a loading state that keeps
 * the label in place so the button does not resize mid-click.
 */
export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[15px] font-semibold transition-[background-color,transform] duration-150 active:translate-y-px disabled:pointer-events-none ${VARIANTS[variant]} ${className}`}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}
