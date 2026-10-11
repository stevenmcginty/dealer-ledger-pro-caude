import React from 'react';
import { cx } from './cx';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}

// Soft tint + matching ink: one recipe per meaning, the same in every screen.
const VARIANT: Record<BadgeVariant, string> = {
  default: 'bg-surface-2 text-ink-2',
  primary: 'bg-accent-soft text-accent-soft-ink',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
};

const SIZE: Record<BadgeSize, string> = {
  sm: 'h-[22px] px-1.5 text-xs gap-1',
  md: 'h-[26px] px-2 text-xs gap-1.5',
  lg: 'h-8 px-2.5 text-sm gap-1.5',
};

/** A small label chip (4px corners). For car/money status, prefer StatusChip. */
const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', size = 'md', dot = false, className = '' }) => (
  <span className={cx('inline-flex items-center whitespace-nowrap rounded-chip font-semibold leading-none tracking-[0.01em]', VARIANT[variant], SIZE[size], className)}>
    {dot && <span className="h-2 w-2 flex-none rounded-full bg-current" aria-hidden="true" />}
    {children}
  </span>
);

export default Badge;
