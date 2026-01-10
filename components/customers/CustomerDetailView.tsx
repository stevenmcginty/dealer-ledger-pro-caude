import React, { useMemo } from 'react';
import { Customer } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { XMarkIcon, DocumentTextIcon } from '../icons';
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
        <div className="w-full flex flex-col h-full max-h-[90vh]">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-white">{customer.name}</h2>
                    <p className="text-sm text-gray-400">Customer History</p>
                </div>
                <button onClick={closeModal} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                {customerHistory.length > 0 ? (
                    <ul className="space-y-3">
                        {customerHistory.map(invoice => (
                            <li key={invoice.id}>
                                <button
                                    onClick={() => openModal('jobInvoice', { viewOnly: true, invoice })}
                                    className="w-full text-left p-3 bg-gray-900/50 rounded-md hover:bg-gray-700/50 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <p className="font-semibold text-white">{invoice.status} #{invoice.invoiceNumber}</p>
                                        <p className={`text-sm font-bold ${invoice.status === 'Invoice' ? 'text-green-400' : 'text-yellow-400'}`}>{formatCurrency(invoice.total)}</p>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
                                        <span>{formatDate(invoice.invoiceDate)}</span>
                                        {invoice.status === 'Invoice' && (
                                            <span>Balance: {formatCurrency(invoice.balance)}</span>
                                        )}
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-center py-10">
                        <DocumentTextIcon className="h-10 w-10 text-gray-500 mx-auto" />
                        <p className="mt-2 text-gray-400">No quotes or invoices found for this customer.</p>
                    </div>
                )}
            </div>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end bg-gray-800">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-md">Close</button>
            </footer>
        </div>
    );
};

export default CustomerDetailView;
