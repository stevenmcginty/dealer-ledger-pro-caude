import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import Button from './Button';
import { cx } from './cx';

/** 1-based page list with gaps: [1, '…', 4, 5, 6, '…', 12]. */
export const pageList = (page: number, count: number): Array<number | '…'> => {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: Array<number | '…'> = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(count - 1, page + 1);
  if (lo > 2) out.push('…');
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < count - 1) out.push('…');
  out.push(count);
  return out;
};

interface PagerProps {
  /** Current page, 1-based. */
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  ariaLabel?: string;
  className?: string;
}

const cell = 'grid h-12 min-w-[48px] md:[@media(pointer:fine)]:h-10 md:[@media(pointer:fine)]:min-w-[40px] place-items-center rounded-control px-1 font-mono text-sm font-semibold transition-colors duration-quick ease-out';

/** Numbered pages for desktop tables. Phones use ShowMore. */
const Pager: React.FC<PagerProps> = ({ page, pageCount, onChange, ariaLabel = 'Pages', className }) => {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={ariaLabel} className={cx('flex flex-wrap items-center gap-1', className)}>
      <button
        type="button"
        className={cx(cell, 'text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-line-strong disabled:hover:bg-transparent')}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      {pageList(page, pageCount).map((p, i) =>
        p === '…' ? (
          <span key={`gap${i}`} className={cx(cell, 'text-ink-3')} aria-hidden="true">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Page ${p}`}
            className={cx(cell, p === page ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className={cx(cell, 'text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-line-strong disabled:hover:bg-transparent')}
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        aria-label="Next page"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
    </nav>
  );
};

interface ShowMoreProps {
  shown: number;
  total: number;
  /** "receipts", "cars" … */
  noun: string;
  step?: number;
  onMore: () => void;
  className?: string;
}

/** Phone paging: count + "Show 20 more". Keeps your place; no infinite scroll. */
export const ShowMore: React.FC<ShowMoreProps> = ({ shown, total, noun, step = 20, onMore, className }) => (
  <div className={cx('flex flex-col items-start gap-2', className)}>
    <p className="text-sm text-ink-3" aria-live="polite">
      Showing <span className="num text-ink-2">{Math.min(shown, total)}</span> of <span className="num text-ink-2">{total}</span> {noun}
    </p>
    {shown < total && (
      <Button variant="secondary" onClick={onMore}>
        Show {Math.min(step, total - shown)} more
      </Button>
    )}
  </div>
);

export default Pager;
