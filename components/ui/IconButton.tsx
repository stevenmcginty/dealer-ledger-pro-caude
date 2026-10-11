import React from 'react';
import { cx } from './cx';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required: the button has no visible words. */
  label: string;
  icon: React.ReactNode;
  variant?: 'ghost' | 'outlined' | 'accent';
  /** 48 (default, touch) or 40 for dense desktop bars; sm stays 48 on phones and touch screens. */
  size?: 'md' | 'sm';
  /** Count badge (things waiting on a person). 0 / undefined hides it; over 99 shows 99+. */
  badge?: number;
}

const VARIANT = {
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3',
  outlined: 'bg-surface text-ink-2 border border-line-strong hover:bg-surface-2 hover:text-ink active:bg-surface-3',
  accent: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-press',
};

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, icon, variant = 'ghost', size = 'md', badge, className, type = 'button', ...props }, ref) => {
    const count = badge && badge > 0 ? (badge > 99 ? '99+' : String(badge)) : null;
    return (
      <button
        ref={ref}
        type={type}
        aria-label={count ? `${label}, ${badge} waiting` : label}
        title={props.title ?? label}
        className={cx(
          'relative inline-grid flex-none place-items-center rounded-control',
          'transition-[background-color,color,transform] duration-quick ease-out active:scale-[.94] active:duration-press',
          'disabled:cursor-not-allowed disabled:bg-transparent disabled:text-line-strong disabled:active:scale-100',
          size === 'md' ? 'h-12 w-12' : 'h-12 w-12 md:[@media(pointer:fine)]:h-10 md:[@media(pointer:fine)]:w-10',
          '[&_svg]:h-6 [&_svg]:w-6',
          VARIANT[variant],
          className,
        )}
        {...props}
      >
        {icon}
        {count && (
          <span
            aria-hidden="true"
            className="num absolute end-1 top-1.5 h-5 min-w-[20px] rounded-full bg-danger px-[5px] text-center text-xs font-semibold leading-5 text-on-danger shadow-[0_0_0_2px_rgb(var(--c-surface))]"
          >
            {count}
          </span>
        )}
      </button>
    );
  },
);
IconButton.displayName = 'IconButton';

export default IconButton;
