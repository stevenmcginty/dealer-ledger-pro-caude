import React, { useEffect, useRef, useState } from 'react';
import { SalesDocument } from '../../types';
import { DocumentTextIcon, EditIcon, UndoIcon, EllipsisVerticalIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { DataTable, DocChip, EmptyState, IconButton, Plate, SkeletonList, StatusChip, TBody, Td, Th, THead, Tr } from '../ui';
import { cx } from '../ui/cx';
import { DOC_KIND, DOC_NAME, docPayment } from './docMeta';

interface SalesJournalProps {
  documents: SalesDocument[];
}

const canUndoSale = (doc: SalesDocument) => doc.documentType === 'Sales Invoice' || doc.documentType === 'Deposit Slip';

/**
 * Edit / Undo sale for one document on phones, behind a "More" button so the
 * row itself stays a single tap to open. Nothing hides behind hover.
 */
const RowMenu: React.FC<{ doc: SalesDocument; onEdit: () => void; onUndo: () => void }> = ({ doc, onEdit, onUndo }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const item = 'flex min-h-[48px] w-full items-center gap-3 px-4 text-start text-base font-semibold transition-colors duration-quick ease-out [&_svg]:h-5 [&_svg]:w-5';

  return (
    <div ref={rootRef} className="relative flex flex-none items-center pe-1">
      <IconButton
        label={`More for ${DOC_NAME[doc.documentType]} ${doc.invoiceNumber}`}
        icon={<EllipsisVerticalIcon />}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
       
      />
      {open && (
        <div role="menu" className="absolute end-1 top-[calc(100%-6px)] z-dropdown min-w-[208px] overflow-hidden rounded-control border border-line bg-surface py-1 shadow-e2">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onEdit(); }} className={cx(item, 'text-ink hover:bg-surface-2 active:bg-surface-3')}>
            <EditIcon aria-hidden="true" className="text-ink-2" />Edit document
          </button>
          {canUndoSale(doc) && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onUndo(); }} className={cx(item, 'border-t border-line text-danger hover:bg-danger-soft')}>
              <UndoIcon aria-hidden="true" />Undo sale
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const SalesJournal = ({ documents }: SalesJournalProps) => {
  const { openModal, setView } = useUI();
  const { vehicles } = useData();

  if (!documents || !vehicles) return <SkeletonList rows={4} label="Loading sales documents" />;

  const salesDocumentsOnly = documents.filter(doc => doc.documentType !== 'Purchase Invoice');

  if (salesDocumentsOnly.length === 0) {
    return (
      <EmptyState
        icon={<DocumentTextIcon />}
        title="No sales documents yet"
        description="Invoices, proformas and deposit slips show up here once you make one from a car in stock."
        actionLabel="Go to stock"
        onAction={() => setView('stock')}
        className="px-0"
      />
    );
  }

  const openDoc = (doc: SalesDocument) => openModal('invoice', { viewOnly: true, document: doc });
  const editDoc = (doc: SalesDocument) => openModal('editInvoice', doc);
  const undoSale = (doc: SalesDocument) => openModal('undoSaleConfirm', doc);

  // A proforma is a quote, not a debt, so its balance is not owed.
  const toCollect = salesDocumentsOnly.reduce(
    (sum, d) => sum + (DOC_KIND[d.documentType] !== 'PF' && d.balance > 0.005 ? d.balance : 0), 0);
  const rows = salesDocumentsOnly.map(doc => ({
    doc,
    car: doc.carDetails || vehicles.find(v => v.id === doc.vehicleId),
    pay: docPayment(doc),
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        <span className="font-semibold text-ink">{salesDocumentsOnly.length} {salesDocumentsOnly.length === 1 ? 'document' : 'documents'}</span>
        {toCollect > 0 && (
          <> · <span className="num font-semibold text-ink">{formatCurrency(toCollect)}</span> still to collect</>
        )}
      </p>

      {/* Phone + tablet: what it is and what it's for, the car, who and whether paid. More menu on the end. */}
      <ul role="list" aria-label="Sales documents" className="m-0 list-none rounded-card border border-line bg-surface p-0 lg:hidden">
        {rows.map(({ doc, car, pay }) => (
          <li key={doc.id} className="flex items-stretch border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => openDoc(doc)}
             
              className="min-w-0 flex-1 rounded-[inherit] py-3 pe-1 ps-3.5 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <DocChip kind={DOC_KIND[doc.documentType]} label={DOC_NAME[doc.documentType]} />
                <span className="num min-w-0 truncate text-sm font-semibold text-ink-3">#{doc.invoiceNumber}</span>
                <span className="num ms-auto flex-none text-base font-semibold text-ink">{formatCurrency(doc.subtotal)}</span>
              </span>
              <span className="mt-2 flex min-w-0 items-center gap-2">
                {car?.reg && <Plate reg={car.reg} size="sm" />}
                <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{car?.make} {car?.model}</span>
              </span>
              <span className="mt-1.5 flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-ink-3">
                  {doc.customerName} · <span className="num">{formatDate(doc.invoiceDate, { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                </span>
                <StatusChip status={pay.status}>{pay.label}</StatusChip>
              </span>
            </button>
            <RowMenu doc={doc} onEdit={() => editDoc(doc)} onUndo={() => undoSale(doc)} />
          </li>
        ))}
      </ul>

      {/* Desktop: the same documents as a table, two-line cells, actions always visible */}
      <DataTable ariaLabel="Sales documents" minWidth={760} className="hidden lg:block">
        <THead>
          <tr>
            <Th>Document</Th>
            <Th>Car</Th>
            <Th>Customer</Th>
            <Th numeric>Amount</Th>
            <Th className="w-[1%]"><span className="sr-only">Actions</span></Th>
          </tr>
        </THead>
        <TBody>
          {rows.map(({ doc, car, pay }) => (
            <Tr key={doc.id} className="cursor-pointer" onClick={() => openDoc(doc)}>
              <Td className="py-2.5">
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); openDoc(doc); }}
                  className="flex flex-col items-start gap-1 rounded-chip text-start"
                  aria-label={`Open ${DOC_NAME[doc.documentType]} ${doc.invoiceNumber}`}
                 
                >
                  <DocChip kind={DOC_KIND[doc.documentType]} label={DOC_NAME[doc.documentType]} />
                  <span className="num text-xs text-ink-3">#{doc.invoiceNumber} · {formatDate(doc.invoiceDate)}</span>
                </button>
              </Td>
              <Td className="py-2.5">
                <span className="flex flex-col items-start gap-1">
                  {car?.reg && <Plate reg={car.reg} size="sm" />}
                  <span className="block max-w-[220px] truncate text-ink-2">{car?.make} {car?.model}</span>
                </span>
              </Td>
              <Td><span className="block max-w-[220px] truncate font-semibold">{doc.customerName}</span></Td>
              <Td numeric className="py-2.5">
                <span className="flex flex-col items-end gap-1">
                  <span className="font-semibold">{formatCurrency(doc.subtotal)}</span>
                  <StatusChip status={pay.status} className="font-sans">{pay.label}</StatusChip>
                </span>
              </Td>
              <Td className="pe-1.5">
                <span className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                  <IconButton size="sm" label={`Edit ${DOC_NAME[doc.documentType]} ${doc.invoiceNumber}`} icon={<EditIcon />} onClick={() => editDoc(doc)} />
                  {canUndoSale(doc) ? (
                    <IconButton
                      size="sm"
                      label={`Undo sale on ${DOC_NAME[doc.documentType]} ${doc.invoiceNumber}`}
                      icon={<UndoIcon />}
                      onClick={() => undoSale(doc)}
                      className="hover:bg-danger-soft hover:text-danger"
                    />
                  ) : <span className="w-10" aria-hidden="true" />}
                </span>
              </Td>
            </Tr>
          ))}
        </TBody>
      </DataTable>
    </div>
  );
};

export default SalesJournal;
