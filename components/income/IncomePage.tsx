import React, { useMemo } from 'react';
import { MiscInvoice } from '../../types';
import { BanknotesIcon, EditIcon, TrashIcon } from '../icons';
import { formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';
import { useUI } from '../../hooks/useUI';
import { Badge, EmptyState, IconButton, DataTable, THead, TBody, Th, Tr, Td } from '../ui';
import { eyebrow } from '../ui/cx';
import { Money, moneyText } from '../accountant/hubShared';

interface IncomePageProps {
  invoices: MiscInvoice[];
}

/** Matched = linked to a bank line (or made from one); unmatched invoices are the ones Expenses offers for matching. */
const PaidChip = ({ invoice }: { invoice: MiscInvoice }) => invoice.linkedTransactionId
  ? <Badge variant="success" size="sm" dot>Matched to bank</Badge>
  : <Badge variant="warning" size="sm" dot>Not matched yet</Badge>;

const IncomePage = ({ invoices }: IncomePageProps) => {
  const { openModal } = useUI();
  // Newest first. Display order only.
  const rows = useMemo(() => (invoices ? [...invoices].sort((a, b) => (b.invoiceDate || '').localeCompare(a.invoiceDate || '')) : []), [invoices]);
  const totals = useMemo(() => rows.reduce((t, i) => ({ total: t.total + (i.total || 0), vat: t.vat + (i.vat || 0) }), { total: 0, vat: 0 }), [rows]);

  if (!invoices) return <div className="flex h-full items-center justify-center"><Spinner /></div>;

  if (invoices.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState
          icon={<BanknotesIcon />}
          title="No income invoices yet"
          description="Invoices for money that is not a car sale, such as rent, storage or recovery, go here. Make one by hand or from a bank line in Expenses."
          actionLabel="Add invoice"
          onAction={() => openModal('miscInvoice')}
        />
      </div>
    );
  }

  const actions = (invoice: MiscInvoice) => (
    <div className="flex items-center justify-end gap-1">
      <IconButton label={`Edit invoice ${invoice.invoiceNumber}`} icon={<EditIcon />} size="sm" onClick={() => openModal('editMiscInvoice', invoice)} />
      <IconButton label={`Delete invoice ${invoice.invoiceNumber}`} icon={<TrashIcon />} size="sm" className="hover:text-danger" onClick={() => openModal('deleteMiscInvoiceConfirm', invoice)} />
    </div>
  );

  return (
    <div className="min-w-0 space-y-4">
      <dl className="grid grid-cols-3 overflow-hidden rounded-card border border-line bg-surface">
        {[
          { label: 'Invoices', value: <span className="num">{rows.length}</span> },
          { label: 'Invoiced', value: <Money value={totals.total} /> },
          { label: 'VAT', value: <Money value={totals.vat} /> },
        ].map((s, i) => (
          <div key={s.label} className={`min-w-0 px-3 py-3 sm:px-5 ${i ? 'border-s border-line' : ''}`}>
            <dt className={eyebrow}>{s.label}</dt>
            <dd className="mt-1 truncate text-base font-bold text-ink sm:text-xl">{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Phone: one row per invoice, actions always visible. */}
      <ul className="overflow-hidden rounded-card border border-line bg-surface md:hidden" aria-label="Income invoices">
        {rows.map(invoice => (
          <li key={invoice.id} className="flex items-center gap-2 border-b border-line py-2 pe-1 ps-3.5 last:border-b-0">
            <button type="button" onClick={() => openModal('editMiscInvoice', invoice)} className="min-w-0 flex-1 py-1 text-start">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold text-ink">{invoice.customerName}</span>
                <Money value={invoice.total} className="text-base font-bold text-ink" />
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3">
                <span className="num">#{invoice.invoiceNumber}</span>
                <span aria-hidden="true">·</span>
                <span className="num">{formatDate(invoice.invoiceDate)}</span>
                <PaidChip invoice={invoice} />
              </span>
            </button>
            <IconButton label={`Delete invoice ${invoice.invoiceNumber}`} icon={<TrashIcon />} className="hover:text-danger" onClick={() => openModal('deleteMiscInvoiceConfirm', invoice)} />
          </li>
        ))}
      </ul>

      {/* Tablet and desktop: the same rows as a table. */}
      <div className="hidden md:block">
        <DataTable ariaLabel="Income invoices" minWidth={720}>
          <THead>
            <tr>
              <Th className="ps-4">Date</Th>
              <Th>Invoice</Th>
              <Th>Customer</Th>
              <Th>Bank</Th>
              <Th numeric>VAT</Th>
              <Th numeric>Total</Th>
              <Th className="pe-3"><span className="sr-only">Actions</span></Th>
            </tr>
          </THead>
          <TBody>
            {rows.map(invoice => (
              <Tr key={invoice.id}>
                <Td className="num ps-4 text-ink-2">{formatDate(invoice.invoiceDate)}</Td>
                <Td className="num text-ink-2">#{invoice.invoiceNumber}</Td>
                <Td className="max-w-[18rem] truncate font-semibold" title={invoice.customerName}>{invoice.customerName}</Td>
                <Td><PaidChip invoice={invoice} /></Td>
                <Td numeric className="text-ink-2">{invoice.isVatInvoice ? moneyText(invoice.vat) : <span className="text-ink-3">No VAT</span>}</Td>
                <Td numeric className="font-semibold">{moneyText(invoice.total)}</Td>
                <Td className="pe-2">{actions(invoice)}</Td>
              </Tr>
            ))}
          </TBody>
        </DataTable>
      </div>
    </div>
  );
};

export default IncomePage;
