import React from 'react';
import { cx } from './cx';
import './primitives.css';

interface SkeletonProps {
  /** CSS width (number = px). */
  width?: number | string;
  /** CSS height (number = px). */
  height?: number | string;
  /** pill = fully round; box = 4px corners (default). */
  shape?: 'box' | 'pill' | 'circle';
  className?: string;
}

/** A shimmering placeholder block. The shimmer stops under reduced motion. */
const Skeleton: React.FC<SkeletonProps> = ({ width, height = 14, shape = 'box', className }) => (
  <span
    aria-hidden="true"
    className={cx('fl-skeleton block', shape === 'box' ? 'rounded-chip' : 'rounded-full', className)}
    style={{ width, height: shape === 'circle' ? width ?? height : height }}
  />
);

interface SkeletonListProps {
  /** How many placeholder rows. */
  rows?: number;
  /** Read out instead of the rows, e.g. "Loading stock". */
  label: string;
  /** Show a plate-shaped block, as in the stock list. */
  plate?: boolean;
  className?: string;
}

// Widths vary a little row to row so it reads as content, not a pattern.
const TITLE_W = ['74%', '58%', '66%', '52%', '70%'];
const META_W = ['48%', '40%', '44%', '36%', '42%'];

/**
 * Copies the real list row (plate, two lines, amount, chip) so nothing jumps
 * when the data lands. Use instead of a spinner for lists.
 */
export const SkeletonList: React.FC<SkeletonListProps> = ({ rows = 3, label, plate = true, className }) => (
  <div aria-busy="true" className={cx('overflow-hidden rounded-card border border-line bg-surface', className)}>
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b border-line px-3.5 py-3 last:border-b-0">
        <div className="col-span-2 flex items-center gap-2">
          {plate && <Skeleton width={86} height={28} />}
          <Skeleton width={40} height={12} />
          <Skeleton width={72} height={26} className="ml-auto" />
        </div>
        <Skeleton width={TITLE_W[i % TITLE_W.length]} height={16} />
        <Skeleton width={64} height={20} />
        <Skeleton width={META_W[i % META_W.length]} height={12} className="col-span-2" />
      </div>
    ))}
  </div>
);

export default Skeleton;
