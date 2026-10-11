import React, { useMemo } from 'react';
import { Customer } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { ChevronRightIcon, DocumentTextIcon } from '../icons';
import { Badge, Button, EmptyState } from '../ui';
import { SheetBody, SheetFooter, SheetFrame, SheetHeader } from '../crm/SheetParts';
import { formatCurrency, formatDate } from '../../utils/helpers';

interface CustomerDetailViewProps {
    customer: Customer;
}

const CustomerDetailView = ({ customer }: CustomerDetailViewProps) => {
    const { closeModal, openModal } = useUI();
    const { jobInvoices } = useData();

    const customerHistory = useMemo(() => {
        return jobInvoices
            .filter(inv => inv.customerId === customer.id)
            .sort((a, b) => b.createdAt - a.createdAt);
    }, [jobInvoices, customer.id]);

    return (
        <SheetFrame className="max-h-[90vh]">
            <SheetHeader title={customer.name} description="Quotes and invoices, newest first" onClose={closeModal} />
            <SheetBody>
                {customerHistory.length > 0 ? (
                    <ul role="list" className="m-0 list-none overflow-hidden rounded-card border border-line bg-surface p-0">
                        {customerHistory.map(invoice => (
                            <li key={invoice.id} className="border-b border-line last:border-b-0">
                                <button
                                    type="button"
                                    onClick={() => openModal('jobInvoice', { viewOnly: true, invoice })}
                                    className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3"
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2">
                                            <Badge variant={invoice.status === 'Invoice' ? 'info' : 'default'}>{invoice.status}</Badge>
                                            <span className="num font-semibold text-ink">#{invoice.invoiceNumber}</span>
                                        </span>
                                        <span className="num mt-1 block text-sm text-ink-3">{formatDate(invoice.invoiceDate)}</span>
                                    </span>
                                    <span className="flex flex-none flex-col items-end gap-0.5">
                                        <span className="num text-base font-semibold text-ink">{formatCurrency(invoice.total)}</span>
                                        {invoice.status === 'Invoice' && (
                                            <span className={`num text-xs ${invoice.balance > 0.005 ? 'font-semibold text-warning' : 'text-ink-3'}`}>
                                                Balance {formatCurrency(invoice.balance)}
                                            </span>
                                        )}
                                    </span>
                                    <ChevronRightIcon className="h-5 w-5 flex-none text-ink-3 rtl:-scale-x-100" aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <EmptyState
                        icon={<DocumentTextIcon />}
                        title="Nothing for this customer yet"
                        description="Quotes and invoices you write for them show up here."
                        className="px-0"
                    />
                )}
            </SheetBody>
            <SheetFooter>
                <Button type="button" variant="secondary" onClick={closeModal}>Close</Button>
            </SheetFooter>
        </SheetFrame>
    );
};

export default CustomerDetailView;
