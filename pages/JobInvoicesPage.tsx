import React, { useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import { DocumentTextIcon, UsersIcon } from '../components/icons';
import { formatCurrency } from '../utils/helpers';
import { Button, EmptyState, SkeletonList, StatusChip, Tabs } from '../components/ui';
import JobBook, { JobBookRow } from '../components/work-sheets/JobBook';

const JobInvoicesPage = () => {
    const { jobInvoices, isLoading } = useData();
    const { openModal } = useUI();
    const [activeTab, setActiveTab] = useState<'invoices' | 'quotes'>('invoices');

    const filteredInvoices = useMemo(() => {
        return [...jobInvoices]
            .filter(inv => (activeTab === 'invoices' ? inv.status === 'Invoice' : inv.status === 'Quote'))
            .sort((a, b) => b.createdAt - a.createdAt);
    }, [jobInvoices, activeTab]);

    const counts = useMemo(() => ({
        invoices: jobInvoices.filter(i => i.status === 'Invoice').length,
        quotes: jobInvoices.filter(i => i.status === 'Quote').length,
        owed: jobInvoices.filter(i => i.status === 'Invoice' && i.balance > 0).reduce((s, i) => s + i.balance, 0),
    }), [jobInvoices]);

    if (isLoading) {
        return <SkeletonList rows={4} plate={false} label="Loading jobs and invoices" />;
    }

    const isInvoices = activeTab === 'invoices';

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <Tabs
                    ariaLabel="Jobs and invoices"
                    activeTab={activeTab}
                    onChange={id => setActiveTab(id as 'invoices' | 'quotes')}
                    tabs={[
                        { id: 'invoices', label: 'Invoices', count: counts.invoices },
                        { id: 'quotes', label: 'Quotes', count: counts.quotes },
                    ]}
                    className="sm:flex-1"
                />
                <Button variant="secondary" size="sm" icon={<UsersIcon />} onClick={() => openModal('customerManager')} className="self-start sm:self-auto">
                    Manage customers
                </Button>
            </div>

            {isInvoices && counts.owed > 0 && (
                <p className="text-sm text-ink-2">
                    <span className="num font-semibold text-ink">{formatCurrency(counts.owed)}</span> owed to you
                </p>
            )}

            {filteredInvoices.length === 0 ? (
                <div className="rounded-card border border-line bg-surface">
                    <EmptyState
                        icon={<DocumentTextIcon />}
                        title={isInvoices ? 'No invoices yet' : 'No quotes yet'}
                        description={isInvoices ? 'Write a quote first, then turn it into an invoice when the job is done.' : 'Quote a job for a customer. You can turn it into an invoice later.'}
                        actionLabel="Add quote"
                        onAction={() => openModal('jobInvoice', { status: 'Quote' })}
                    />
                </div>
            ) : (
                <JobBook
                    label={isInvoices ? 'Invoices' : 'Quotes'}
                    head={{ primary: 'Customer', secondary: 'Job', status: 'Status', amount: 'Total' }}
                >
                    {filteredInvoices.map(invoice => {
                        const owed = invoice.status === 'Invoice' && invoice.balance > 0;
                        const partPaid = owed && Math.abs(invoice.balance - invoice.total) > 0.005;
                        const status = invoice.status === 'Quote'
                            ? <StatusChip status="neutral">Quote</StatusChip>
                            : owed
                                ? <StatusChip status="due">{partPaid ? <>Owed <span className="num">{formatCurrency(invoice.balance)}</span></> : 'Owed'}</StatusChip>
                                : <StatusChip status="sold">Paid</StatusChip>;
                        const noun = invoice.status === 'Quote' ? 'quote' : 'invoice';
                        return (
                            <JobBookRow
                                key={invoice.id}
                                noun={noun}
                                number={String(invoice.invoiceNumber)}
                                date={invoice.invoiceDate}
                                title={invoice.customerDetails.name}
                                detail={invoice.items[0]?.description || 'Job invoice'}
                                status={status}
                                amount={formatCurrency(invoice.total)}
                                openLabel={`View ${noun} ${invoice.invoiceNumber}, ${invoice.customerDetails.name}, ${formatCurrency(invoice.total)}${owed ? ', owed' : ''}`}
                                onOpen={() => openModal('jobInvoice', { viewOnly: true, invoice })}
                                onEdit={() => openModal('jobInvoice', { editingInvoice: invoice })}
                                onDelete={() => openModal('deleteJobInvoiceConfirm', invoice)}
                            />
                        );
                    })}
                </JobBook>
            )}
        </div>
    );
};

export default JobInvoicesPage;
