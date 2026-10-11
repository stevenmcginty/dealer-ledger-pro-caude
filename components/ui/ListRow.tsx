import React from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '../icons';
import { cx } from './cx';

/** The card that holds rows: one hairline box, rows divided by hairlines. */
export const List: React.FC<{ children: React.ReactNode; className?: string; ariaLabel?: string; as?: 'div' | 'ul' }> = ({
  children, className, ariaLabel, as: Tag = 'div',
}) => (
  <Tag
    aria-label={ariaLabel}
    className={cx(
      'm-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0',
      '[&>*:last-child]:border-b-0 [&>details:last-child>summary]:border-b-0 [&>details:last-child>div]:border-b-0',
      className,
    )}
  >
    {children}
  </Tag>
);

interface ListRowProps {
  /** What it is. One line, truncates. */
  title: React.ReactNode;
  /** The facts, one grey line. */
  meta?: React.ReactNode;
  /** Stock-list header line above the title: plate, stock no., status chip. */
  top?: React.ReactNode;
  /** Leading avatar / icon tile for simple rows. */
  leading?: React.ReactNode;
  /** Money on the end, set in mono. */
  amount?: React.ReactNode;
  /** Extra things on the end under the amount (a chip). */
  end?: React.ReactNode;
  /** Navigate on tap. */
  href?: string;
  onClick?: () => void;
  selected?: boolean;
  /** Extra detail revealed in place (details/summary): no third line in the row. */
  disclosure?: React.ReactNode;
  defaultOpen?: boolean;
  /** Show a chevron on navigating rows. Default: on when href/onClick is set. */
  chevron?: boolean;
  className?: string;
}

const rowBase =
  'relative block w-full border-b border-line px-3.5 py-3 text-start text-ink no-underline transition-colors duration-quick ease-out';
const interactive = 'cursor-pointer hover:bg-surface-2 active:bg-surface-3';

/**
 * A two-line mobile row: what it is, then the facts; amount and status on the
 * end. Detail goes in the disclosure, never a third line.
 */
const ListRow: React.FC<ListRowProps> = ({
  title, meta, top, leading, amount, end, href, onClick, selected, disclosure, defaultOpen, chevron, className,
}) => {
  const isNav = !!(href || onClick);
  const showChevron = chevron ?? (isNav && !disclosure);

  const body = top ? (
    // Stock row: header line, then title + price, then meta.
    <span className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5">
      <span className="col-span-2 mb-1.5 flex min-w-0 items-center gap-2 [&>*:last-child:not(:first-child)]:ms-auto">
        {top}
        {disclosure && <ChevronDownIcon className="ms-1 h-5 w-5 flex-none text-ink-3 transition-transform duration-quick ease-out group-open:rotate-180" />}
        {showChevron && <ChevronRightIcon className="ms-1 h-5 w-5 flex-none text-ink-3 rtl:-scale-x-100" />}
      </span>
      <span className="min-w-0 truncate text-base font-semibold leading-[1.3]">{title}</span>
      {amount !== undefined ? <span className="num text-lg font-semibold leading-tight">{amount}</span> : <span />}
      {meta && <span className="col-span-2 truncate text-sm leading-[1.3] text-ink-3">{meta}</span>}
    </span>
  ) : (
    <span className="flex min-h-[40px] items-center gap-3">
      {leading && <span className="flex flex-none">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-base font-semibold leading-[1.3]">{title}</span>
        {meta && <span className="truncate text-sm leading-[1.3] text-ink-3">{meta}</span>}
      </span>
      {(amount !== undefined || end) && (
        <span className="flex flex-none flex-col items-end gap-[5px]">
          {amount !== undefined && <span className="num text-base font-semibold leading-tight">{amount}</span>}
          {end}
        </span>
      )}
      {disclosure && <ChevronDownIcon className="h-5 w-5 flex-none text-ink-3 transition-transform duration-quick ease-out group-open:rotate-180" />}
      {showChevron && <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3 rtl:-scale-x-100" />}
    </span>
  );

  // One background class at a time, so selected never fights the resting surface.
  const tone = selected ? 'bg-accent-soft hover:bg-accent-soft' : 'bg-surface';

  if (disclosure) {
    return (
      <details className="group" open={defaultOpen}>
        <summary className={cx(rowBase, interactive, tone, 'list-none group-open:border-b-0 [&::-webkit-details-marker]:hidden', className)}>
          {body}
        </summary>
        <div className="border-b border-line bg-surface px-3.5 pb-3.5 pt-1">{disclosure}</div>
      </details>
    );
  }
  if (href) {
    return <a href={href} onClick={onClick} aria-current={selected ? 'true' : undefined} className={cx(rowBase, interactive, tone, className)}>{body}</a>;
  }
  if (onClick) {
    return <button type="button" onClick={onClick} aria-pressed={selected} className={cx(rowBase, interactive, tone, className)}>{body}</button>;
  }
  return <div className={cx(rowBase, tone, className)}>{body}</div>;
};

/** Key facts in a disclosure: three across, small grey label over a mono value. */
export const KeyValues: React.FC<{ items: Array<{ label: string; value: React.ReactNode; tone?: 'up' | 'down' }>; className?: string }> = ({ items, className }) => (
  <dl className={cx('m-0 mb-3 grid grid-cols-3 gap-2.5', className)}>
    {items.map(it => (
      <div key={it.label} className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs font-semibold text-ink-3">{it.label}</dt>
        <dd className={cx('num m-0 text-sm font-semibold leading-[1.3]', it.tone === 'up' ? 'text-success' : it.tone === 'down' ? 'text-danger' : 'text-ink')}>{it.value}</dd>
      </div>
    ))}
  </dl>
);

export default ListRow;
