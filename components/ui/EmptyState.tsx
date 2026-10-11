import React from 'react';
import Button from './Button';
import { cx } from './cx';

interface EmptyStateProps {
  icon?: React.ReactNode;
  /** What goes here. */
  title: string;
  /** Why it's empty and what happens next. */
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  className?: string;
}

const DefaultGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.75 13.5h4.5l1.5 2.25h4.5l1.5-2.25h4.5M5.25 6.75 3.75 13.5v4.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V13.5l-1.5-6.75a1.5 1.5 0 0 0-1.46-1.17H6.71a1.5 1.5 0 0 0-1.46 1.17z" />
  </svg>
);

/**
 * Says what will appear here, why it's empty, and the one thing to do.
 * Left-aligned with a glyph tile, like the rest of the ledger.
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  className = '',
}) => (
  <div className={cx('grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1 p-5', className)}>
    <span className="row-span-3 grid h-14 w-14 place-items-center rounded-card bg-surface-2 text-ink-2 [&_svg]:h-7 [&_svg]:w-7" aria-hidden="true">
      {icon || <DefaultGlyph />}
    </span>
    <h3 className="pt-1 text-lg font-bold leading-[1.625rem] text-ink">{title}</h3>
    {description && <p className="max-w-[44ch] text-sm leading-5 text-ink-2">{description}</p>}
    {((actionLabel && onAction) || (secondaryLabel && onSecondary)) && (
      <div className="mt-2.5 flex flex-wrap gap-2">
        {actionLabel && onAction && <Button size="sm" onClick={onAction}>{actionLabel}</Button>}
        {secondaryLabel && onSecondary && <Button size="sm" variant="ghost" onClick={onSecondary}>{secondaryLabel}</Button>}
      </div>
    )}
  </div>
);

export default EmptyState;
