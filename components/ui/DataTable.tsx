import React from 'react';
import { ChevronDownIcon, ChevronUpDownIcon } from '../icons';
import { cx } from './cx';

/*
 * A light wrapper over a real <table> for desktop (≥1024px) ledgers:
 * hairline card, sticky head, mono right-aligned money, sort on a header
 * button with aria-sort, selected/hover row states. Below 1024px use ListRow.
 */

interface DataTableProps {
  children: React.ReactNode;
  /** Names the scroll region for keyboard and screen-reader users. */
  ariaLabel: string;
  /** 40px rows for the ledger instead of 52px. */
  compact?: boolean;
  /** Minimum table width before the card scrolls sideways. */
  minWidth?: number;
  /** Max height of the scroll area (sticky head kicks in). */
  maxHeight?: number | string;
  className?: string;
}

const DensityContext = React.createContext(false);

const DataTable: React.FC<DataTableProps> = ({ children, ariaLabel, compact = false, minWidth, maxHeight, className }) => (
  <DensityContext.Provider value={compact}>
    <div
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      className={cx('overflow-auto overscroll-x-contain rounded-card border border-line bg-surface focus-visible:[outline-offset:-3px]', className)}
      style={{ maxHeight }}
    >
      <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  </DensityContext.Provider>
);

export const THead: React.FC<{ children: React.ReactNode }> = ({ children }) => <thead>{children}</thead>;
export const TBody: React.FC<{ children: React.ReactNode }> = ({ children }) => <tbody>{children}</tbody>;

export type SortDir = 'ascending' | 'descending' | 'none';

interface ThProps extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'onClick'> {
  /** Right-align (money, counts). */
  numeric?: boolean;
  /** Makes the header a sort button. */
  sort?: SortDir;
  onSort?: () => void;
  children?: React.ReactNode;
}

export const Th: React.FC<ThProps> = ({ numeric, sort, onSort, children, className, ...props }) => (
  <th
    scope="col"
    aria-sort={onSort ? sort ?? 'none' : undefined}
    className={cx(
      'sticky top-0 z-sticky h-10 whitespace-nowrap border-b border-line-strong bg-surface-2 px-2.5 text-xs font-semibold uppercase tracking-[0.05em]',
      sort && sort !== 'none' ? 'text-ink' : 'text-ink-2',
      numeric ? 'text-right' : 'text-left',
      className,
    )}
    {...props}
  >
    {onSort ? (
      <button
        type="button"
        onClick={onSort}
        className={cx('inline-flex min-h-[32px] items-center gap-1 rounded-chip uppercase hover:text-ink', numeric && 'flex-row-reverse')}
      >
        {children}
        {sort === 'ascending' ? (
          <ChevronDownIcon className="h-4 w-4 rotate-180" />
        ) : sort === 'descending' ? (
          <ChevronDownIcon className="h-4 w-4" />
        ) : (
          <ChevronUpDownIcon className="h-4 w-4 opacity-60" />
        )}
      </button>
    ) : children}
  </th>
);

interface TrProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
}

export const Tr: React.FC<TrProps> = ({ selected, className, children, ...props }) => (
  <tr
    className={cx(
      'group/row [&>td]:transition-colors [&>td]:duration-quick',
      selected ? '[&>td]:bg-accent-soft' : 'hover:[&>td]:bg-surface-2',
      className,
    )}
    {...props}
  >
    {children}
  </tr>
);

interface TdProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  /** Colour a money value: in = green with its "+", out = ink. */
  tone?: 'in' | 'out';
}

export const Td: React.FC<TdProps> = ({ numeric, tone, className, children, ...props }) => {
  const compact = React.useContext(DensityContext);
  return (
    <td
      className={cx(
        'whitespace-nowrap border-b border-line bg-surface px-2.5 text-ink group-last/row:border-b-0',
        compact ? 'h-10' : 'h-[52px]',
        numeric && 'num text-right',
        tone === 'in' && 'font-semibold text-success',
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
};

export default DataTable;
