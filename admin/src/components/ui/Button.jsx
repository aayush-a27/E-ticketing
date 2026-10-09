import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 font-medium shadow-card',
  brand: 'bg-brand text-white hover:bg-brand-strong active:bg-brand-strong font-medium shadow-card',
  secondary: 'bg-white text-ink-800 border border-ink-200 hover:bg-ink-50 hover:border-ink-300',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-bad text-white hover:brightness-110 active:brightness-95 font-medium shadow-card',
  'danger-quiet': 'bg-white text-bad border border-bad/30 hover:bg-bad-soft',
};

const SIZES = {
  xs: 'h-7 px-2.5 text-xs gap-1',
  sm: 'h-8.5 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

/**
 * Every button in the console.
 *
 * `loading` also disables, so a submit cannot be fired twice while a request
 * is in flight. That is the first line of defence against a double
 * cancellation or a duplicated approval; the server's idempotency keys are the
 * second.
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
        'inline-flex shrink-0 items-center justify-center rounded-lg transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className,
      ].join(' ')}
      {...props}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      {children}
    </Component>
  );
}

/** A square button that holds only an icon, so it still needs a label. */
export function IconButton({ label, icon: Icon, size = 'md', className = '', ...props }) {
  const box = { xs: 'size-7', sm: 'size-8.5', md: 'size-10', lg: 'size-11' }[size] ?? 'size-10';
  const glyph = { xs: 'size-3.5', sm: 'size-4', md: 'size-4', lg: 'size-4.5' }[size] ?? 'size-4';

  return (
    <Button
      size={size}
      aria-label={label}
      title={label}
      className={`px-0 ${box} ${className}`}
      {...props}
    >
      <Icon className={glyph} aria-hidden="true" />
    </Button>
  );
}
