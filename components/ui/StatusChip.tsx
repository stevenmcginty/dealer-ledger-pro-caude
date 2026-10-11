import React from 'react';
import { cx } from './cx';

/**
 * The fixed status vocabulary. Each one is shape + word + colour, so it
 * reads without colour: ring, diamond, square, dot, triangle.
 */
export type ChipStatus = 'stock' | 'prep' | 'reserved' | 'sold' | 'due' | 'dave' | 'neutral';

const TONE: Record<ChipStatus, string> = {
  stock: 'bg-surface-2 text-ink-2',
  prep: 'bg-warning-soft text-warning-ink',
  reserved: 'bg-info-soft text-info-ink',
  sold: 'bg-success-soft text-success-ink',
  due: 'bg-danger-soft text-danger-ink',
  dave: 'bg-accent-soft text-accent-soft-ink',
  neutral: 'bg-surface-2 text-ink-2',
};

const Mark: React.FC<{ status: ChipStatus }> = ({ status }) => {
  switch (status) {
    case 'stock': // ring: on the forecourt, nothing happening
      return <span className="h-[9px] w-[9px] flex-none rounded-full border-2 border-current" />;
    case 'prep': // diamond: work in progress
      return <span className="h-2 w-2 flex-none rotate-45 rounded-[1px] bg-current" />;
    case 'reserved': // square: held
      return <span className="h-2 w-2 flex-none rounded-[1px] bg-current" />;
    case 'due': // triangle: needs attention
      return (
        <svg viewBox="0 0 10 9" className="h-[9px] w-2.5 flex-none" fill="currentColor"><path d="M5 0 10 9H0z" /></svg>
      );
    default: // dot
      return <span className="h-2 w-2 flex-none rounded-full bg-current" />;
  }
};

interface StatusChipProps {
  status: ChipStatus;
  children: React.ReactNode;
  size?: 'md' | 'lg';
  className?: string;
}

const StatusChip: React.FC<StatusChipProps> = ({ status, children, size = 'md', className }) => (
  <span
    className={cx(
      'inline-flex flex-none items-center whitespace-nowrap rounded-chip font-semibold leading-none tracking-[0.01em]',
      size === 'lg' ? 'h-8 gap-1.5 pl-2.5 pr-3 text-sm' : 'h-[26px] gap-1.5 pl-2 pr-2.5 text-xs',
      TONE[status],
      className,
    )}
  >
    <span aria-hidden="true" className="flex"><Mark status={status} /></span>
    {children}
  </span>
);

export default StatusChip;
