import React from 'react';
import { Receipt } from '../../types';
import { DocumentTextIcon, EditIcon, ChevronRightIcon } from '../icons';
import { formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';
import { useUI } from '../../hooks/useUI';
import ReceiptThumb from '../common/ReceiptThumb';
import { DataTable, THead, TBody, Th, Tr, Td, StatusChip, EmptyState, IconButton } from '../ui';
import { LedgerSummary, Money } from './ledgerUi';

interface ReceiptManagerProps {
  receipts: Receipt[];
  hasActiveFilters: boolean;
}

const MatchChip: React.FC<{ receipt: Receipt }> = ({ receipt }) =>
    receipt.status === 'Paid'
        ? <StatusChip status="sold">Matched</StatusChip>
        : <StatusChip status="prep">Not matched</StatusChip>;

/** Thumbnail if there is a file, otherwise a quiet "no receipt" tile of the same size. */
const ReceiptTile: React.FC<{ receipt: Receipt; size: 'sm' | 'md' }> = ({ receipt, size }) =>
    receipt.receiptUrl ? (
        <ReceiptThumb url={receipt.receiptUrl} label={`${receipt.vendor} · ${formatDate(receipt.date)}`} size={size} />
    ) : (
        <span
            className={`grid flex-none place-items-center rounded-control border border-dashed border-line-strong text-ink-3 ${size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'}`}
            title="No receipt file"
        >
            <DocumentTextIcon className="h-4 w-4" />
            <span className="sr-only">No receipt file</span>
        </span>
    );

const ReceiptManager = ({ receipts, hasActiveFilters }: ReceiptManagerProps) => {
    const { openModal } = useUI();
    if (!receipts) return <div className="flex h-full items-center justify-center"><Spinner /></div>;

    if (receipts.length === 0) {
        return (
            <EmptyState
                className="rounded-card border border-line bg-surface"
                icon={<DocumentTextIcon />}
                title={hasActiveFilters ? 'No receipts match' : 'No receipts in this period'}
                description={hasActiveFilters
                    ? 'Try other words, or pick a wider period.'
                    : 'Receipts you snap or upload land here. We read the supplier, date, total and VAT for you.'}
            />
        );
    }

    const total = receipts.reduce((s, r) => s + (r.amount || 0), 0);
    const vat = receipts.reduce((s, r) => s + (r.vat || 0), 0);
    const open = (r: Receipt) => openModal('expense', r);

    return (
        <div className="space-y-3">
            <LedgerSummary
                left={<><span className="num font-semibold text-ink">{receipts.length}</span> receipt{receipts.length !== 1 ? 's' : ''}</>}
                right={<>
                    <span>VAT <Money amount={vat} className="font-semibold text-ink-2" /></span>
                    <span>Total <Money amount={total} className="font-semibold text-ink" /></span>
                </>}
            />

            {/* Desktop: a real table. */}
            <div className="hidden lg:block">
                <DataTable ariaLabel="Receipts" minWidth={760}>
                    <THead>
                        <tr>
                            <Th className="w-[104px]">Date</Th>
                            <Th>Supplier</Th>
                            <Th>Category</Th>
                            <Th>Status</Th>
                            <Th numeric>VAT</Th>
                            <Th numeric>Total</Th>
                            <Th className="w-14"><span className="sr-only">Edit</span></Th>
                        </tr>
                    </THead>
                    <TBody>
                        {receipts.map(r => (
                            <Tr key={r.id} onClick={() => open(r)} className="cursor-pointer">
                                <Td className="num text-ink-2">{formatDate(r.date, { day: '2-digit', month: 'short', year: '2-digit' })}</Td>
                                <Td className="max-w-[18rem]">
                                    <span className="flex min-w-0 items-center gap-3">
                                        <ReceiptTile receipt={r} size="sm" />
                                        <span className="truncate font-semibold" title={r.vendor}>{r.vendor}</span>
                                    </span>
                                </Td>
                                <Td className="text-ink-2">{r.category}</Td>
                                <Td><MatchChip receipt={r} /></Td>
                                <Td numeric className="text-ink-2">{r.vat > 0 ? <Money amount={r.vat} /> : <span className="text-ink-3">—</span>}</Td>
                                <Td numeric className="font-semibold"><Money amount={r.amount} /></Td>
                                <Td className="pe-1">
                                    <IconButton
                                        size="sm"
                                        label={`Edit ${r.vendor}, ${formatDate(r.date)}`}
                                        icon={<EditIcon />}
                                        onClick={e => { e.stopPropagation(); open(r); }}
                                        className="[&_svg]:h-5 [&_svg]:w-5"
                                    />
                                </Td>
                            </Tr>
                        ))}
                    </TBody>
                </DataTable>
            </div>

            {/* Phone and tablet: two-line rows; the whole row opens the expense. */}
            <ul className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0 lg:hidden" aria-label="Receipts">
                {receipts.map(r => (
                    <li key={r.id} className="flex items-center gap-3 border-b border-line ps-3.5 last:border-b-0">
                        <ReceiptTile receipt={r} size="md" />
                        <button
                            type="button"
                            onClick={() => open(r)}
                            className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 pe-3 text-start transition-colors duration-quick ease-out active:bg-surface-2"
                        >
                            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                                <span className="truncate text-base font-semibold leading-[1.3] text-ink">{r.vendor}</span>
                                <span className="truncate text-sm leading-[1.3] text-ink-3">
                                    <span className="num">{formatDate(r.date, { day: '2-digit', month: 'short', year: '2-digit' })}</span> · {r.category}
                                </span>
                            </span>
                            <span className="flex flex-none flex-col items-end gap-[5px]">
                                <Money amount={r.amount} className="text-base font-semibold leading-tight text-ink" />
                                <MatchChip receipt={r} />
                            </span>
                            <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3 rtl:-scale-x-100" />
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ReceiptManager;
