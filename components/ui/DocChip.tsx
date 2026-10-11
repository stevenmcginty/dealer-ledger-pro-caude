import React from 'react';
import { cx } from './cx';

/** Sales invoice, proforma, deposit slip, purchase invoice. */
export type DocKind = 'SI' | 'PF' | 'DS' | 'PI';

const NAME: Record<DocKind, string> = {
  SI: 'Sales invoice',
  PF: 'Proforma',
  DS: 'Deposit slip',
  PI: 'Purchase invoice',
};

// The code block carries the kind: solid ink for the real invoice, paler
// for drafts and slips, outlined for money going out.
const CODE: Record<DocKind, string> = {
  SI: 'bg-ink text-surface',
  PF: 'bg-surface-3 text-ink',
  DS: 'bg-warning-soft text-warning-ink',
  PI: 'bg-surface text-ink border-r border-line-strong',
};

interface DocChipProps {
  kind: DocKind;
  /** Words after the code. Defaults to the document's name; pass null for the code alone. */
  label?: React.ReactNode | null;
  className?: string;
}

/** A document's type at a glance: two-letter mono code + name. */
const DocChip: React.FC<DocChipProps> = ({ kind, label, className }) => {
  const text = label === undefined ? NAME[kind] : label;
  return (
    <span
      className={cx('inline-flex h-[26px] flex-none items-stretch overflow-hidden whitespace-nowrap rounded-chip border border-line-strong text-xs font-semibold', className)}
      title={text === null ? NAME[kind] : undefined}
    >
      <b className={cx('grid place-items-center px-1.5 font-mono font-semibold', CODE[kind])} aria-hidden={text !== null || undefined}>
        {kind}
      </b>
      {text === null ? <span className="sr-only">{NAME[kind]}</span> : <span className="grid place-items-center bg-surface px-2 text-ink">{text}</span>}
    </span>
  );
};

export default DocChip;
