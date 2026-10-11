import React, { useState, useMemo } from 'react';
import { StatementTransaction, SalesDocument, Payment, PaymentMethod } from '../../types';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { Button, DocChip, Plate, Search } from '../ui';
import { cx } from '../ui/cx';
import { SheetBody, SheetFooter, SheetFrame, SheetHeader } from '../crm/SheetParts';
import { DOC_KIND } from './docMeta';
import { useData } from '../../hooks/useData';

interface SalesReconcilerModalProps {
    transaction: StatementTransaction;
    salesDocs: SalesDocument[]; // These are pre-filtered to have balance > 0
    onReconcile: (transactionId: string, docId: string, payment: Payment) => void;
    onCreateMiscInvoice: (transaction: StatementTransaction) => void;
    onClose: () => void;
}

const SalesReconcilerModal = ({ transaction, salesDocs, onReconcile, onCreateMiscInvoice, onClose }: SalesReconcilerModalProps) => {
    const { vehicles } = useData();
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const filteredDocs = useMemo(() => {
        if (!searchTerm) return salesDocs;
        const lowerSearch = searchTerm.toLowerCase();
        return salesDocs.filter(doc => {
            const carDetails = doc.carDetails || vehicles.find(v => v.id === doc.vehicleId);
            return (
                doc.customerName.toLowerCase().includes(lowerSearch) ||
                (carDetails && carDetails.reg.toLowerCase().includes(lowerSearch)) ||
                doc.invoiceNumber.includes(lowerSearch)
            );
        });
    }, [searchTerm, salesDocs, vehicles]);
    
    const selectedDoc = salesDocs.find(d => d.id === selectedDocId);
    const transactionAmount = transaction.amount;
    const canReconcile = selectedDoc && Math.abs(transactionAmount - selectedDoc.balance) < 0.01; // Exact match for now
    
    const handleReconcile = () => {
        if (!selectedDocId) return;
        setIsSubmitting(true);
        const payment: Payment = {
            method: (transaction.method as PaymentMethod) || 'Bank Transfer',
            amount: transaction.amount,
            notes: `Bank reconciliation on ${formatDate(new Date())}`
        };
        onReconcile(transaction.id, selectedDocId, payment);
    };

    const handleCreateInvoice = () => {
        // This will close the current modal and open the misc invoice one
        onCreateMiscInvoice(transaction);
    };

    return (
        <SheetFrame className="max-h-[90vh]">
            <SheetHeader title="Match money in" description="Pick the unpaid document this payment settles." onClose={onClose} />
            <SheetBody className="space-y-4">
                {/* The bank line */}
                <div className="rounded-card border border-line bg-surface-2 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                        <p className="num text-sm text-ink-3">{formatDate(transaction.date)}</p>
                        <p className="num text-xl font-bold text-success">{formatCurrency(transaction.amount)}</p>
                    </div>
                    <p className="mt-1 truncate text-ink">{transaction.description}</p>
                </div>

                <Search
                    value={searchTerm}
                    onChange={setSearchTerm}
                    label="Search unpaid documents"
                    placeholder="Reg, customer or invoice no."
                />

                <div role="radiogroup" aria-label="Unpaid documents" className="max-h-72 space-y-1.5 overflow-y-auto">
                    {filteredDocs.length > 0 ? filteredDocs.map(doc => {
                        const carDetails = doc.carDetails || vehicles.find(v => v.id === doc.vehicleId);
                        const on = selectedDocId === doc.id;
                        const exact = Math.abs(transactionAmount - doc.balance) < 0.01;
                        return (
                            <button
                                key={doc.id}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => setSelectedDocId(doc.id)}
                                className={cx(
                                    'block w-full rounded-control border p-3 text-start transition-colors duration-quick ease-out',
                                    on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2 active:bg-surface-3',
                                )}
                            >
                                <span className="flex items-center justify-between gap-3">
                                    <span className="truncate font-semibold text-ink">{doc.customerName}</span>
                                    <span className="num flex-none font-bold text-ink">{formatCurrency(doc.balance)}</span>
                                </span>
                                <span className="mt-1.5 flex items-center gap-2 text-sm text-ink-3">
                                    <DocChip kind={DOC_KIND[doc.documentType]} label={null} />
                                    {carDetails?.reg && <Plate reg={carDetails.reg} size="sm" />}
                                    <span className="num">#{doc.invoiceNumber}</span>
                                    {exact && <span className="ms-auto text-xs font-semibold text-success">Amount matches</span>}
                                </span>
                            </button>
                        );
                    }) : (
                        <p className="rounded-control border border-line px-4 py-5 text-sm text-ink-3">No unpaid documents match. Try the reg or the customer's surname.</p>
                    )}
                </div>

                {selectedDoc && !canReconcile && (
                    <p role="status" className="rounded-control bg-warning-soft px-3.5 py-3 text-sm text-warning-ink">
                        This payment is <span className="num font-semibold">{formatCurrency(transactionAmount)}</span> but the balance is <span className="num font-semibold">{formatCurrency(selectedDoc.balance)}</span>. Only an exact match can be ticked off here.
                    </p>
                )}
            </SheetBody>
            <SheetFooter>
                <Button type="button" variant="secondary" onClick={handleCreateInvoice}>
                    New misc. invoice
                </Button>
                <Button onClick={handleReconcile} disabled={!canReconcile} loading={isSubmitting}>
                    Match payment
                </Button>
            </SheetFooter>
        </SheetFrame>
    );
};

export default SalesReconcilerModal;