import React from 'react';
import Spinner from '../common/Spinner';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'whatsapp' | 'deposit';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Keeps the label, adds a spinner and aria-busy, and blocks clicks. */
  loading?: boolean;
  icon?: React.ReactNode;
  /** Icon after the label instead of before it. */
  iconEnd?: React.ReactNode;
  /** Full width. */
  block?: boolean;
  children: React.ReactNode;
}

// Accent fills for the main action; danger is red-on-white in light and
// pale-red-on-dark in dark (the tokens flip, the classes don't).
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent border-transparent hover:bg-accent-hover active:bg-accent-press',
  success: 'bg-accent text-on-accent border-transparent hover:bg-accent-hover active:bg-accent-press',
  secondary: 'bg-surface text-ink border-line-strong hover:bg-surface-2 active:bg-surface-3',
  ghost: 'bg-transparent text-accent-text border-transparent hover:bg-accent-soft active:bg-surface-3',
  danger: 'bg-danger text-on-danger border-transparent hover:bg-danger-hover active:bg-danger-hover',
  // Start or send a WhatsApp: WhatsApp's own green, same in every brand.
  whatsapp: 'bg-whatsapp text-on-whatsapp border-transparent hover:bg-whatsapp-hover active:bg-whatsapp-press',
  // Taking a deposit: amber, so it stands apart from the grey buttons
  // without fighting the green main action.
  deposit: 'bg-warning-soft text-warning-ink border-warning hover:border-warning-ink active:border-warning-ink',
};

// 36 / 48 / 56. Small is 44 on phones and touch screens so it stays
// tappable; it only drops to 36 on a wide screen with a mouse.
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-[44px] min-w-[44px] md:[@media(pointer:fine)]:min-h-[36px] md:[@media(pointer:fine)]:min-w-[36px] px-3 text-sm gap-1.5 [&_svg]:h-4 [&_svg]:w-4',
  md: 'min-h-[48px] min-w-[48px] px-5 text-base gap-2 [&_svg]:h-5 [&_svg]:w-5',
  lg: 'min-h-[56px] min-w-[56px] px-6 text-lg gap-2.5 [&_svg]:h-5 [&_svg]:w-5',
};

export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', block = false, loading = false): string =>
  cx(
    'relative inline-flex select-none items-center justify-center whitespace-nowrap rounded-control border font-semibold leading-tight',
    'transition-[background-color,border-color,color,transform] duration-quick ease-out',
    loading
      // Busy keeps its colour and label so nothing jumps; it just stops taking taps.
      ? 'cursor-progress'
      : 'active:scale-[.97] active:duration-press disabled:cursor-not-allowed disabled:border-transparent disabled:bg-surface-2 disabled:text-ink-3 disabled:active:scale-100 ' +
        'aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-surface-2 aria-disabled:text-ink-3',
    VARIANT[variant],
    SIZE[size],
    block && 'w-full',
  );

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconEnd,
  block = false,
  children,
  className = '',
  disabled,
  ...props
}, ref) => (
  <button
    ref={ref}
    className={cx(buttonClasses(variant, size, block, loading), className)}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    data-size={size}
    {...props}
  >
    {loading ? (
      <Spinner />
    ) : icon ? (
      <span className="inline-flex flex-shrink-0" aria-hidden="true">{icon}</span>
    ) : null}
    {children}
    {iconEnd && !loading && <span className="inline-flex flex-shrink-0" aria-hidden="true">{iconEnd}</span>}
  </button>
));
Button.displayName = 'Button';

export default Button;
