import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-amber-brand text-midnight hover:bg-amber-bright active:bg-amber-deep font-semibold shadow-lg shadow-amber-brand/10',
  secondary:
    'neu neu-pressable text-ivory hover:text-amber-bright',
  ghost: 'text-ivory-dim hover:text-ivory hover:bg-charcoal-soft',
  outline: 'border border-slate-line text-ivory hover:border-amber-brand hover:text-amber-bright',
  danger: 'bg-status-bad/15 text-status-bad border border-status-bad/40 hover:bg-status-bad/25',
};

const SIZES = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-base gap-2.5',
};

/**
 * Every button in the app. `loading` also disables, so a submit cannot be
 * fired twice while a request is in flight — which matters most on the
 * payment and seat-hold screens.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  as: Component = 'button',
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <Component
      type={Component === 'button' ? type : undefined}
      disabled={Component === 'button' ? isDisabled : undefined}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      className={[
        'inline-flex items-center justify-center rounded-full transition-all duration-200',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </Component>
  );
}
