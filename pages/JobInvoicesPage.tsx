import React, { useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import { useUI } from '../hooks/useUI';
import { JobInvoice } from '../types';
import { DocumentTextIcon, PlusIcon, EditIcon, TrashIcon } from '../components/icons';
import { formatCurrency, formatDate } from '../utils/helpers';
import Spinner from '../components/common/Spinner';

const JobInvoicesPage = () => {
    const { jobInvoices, isLoading } = useData();
    const { openModal } = useUI();
    const [activeTab, setActiveTab] = useState<'invoices' | 'quotes'>('invoices');

    const filteredInvoices = useMemo(() => {
        return [...jobInvoices]
            .filter(inv => (activeTab === 'invoices' ? inv.status === 'Invoice' : inv.status === 'Quote'))
            .sort((a, b) => b.createdAt - a.createdAt);
    }, [jobInvoices, activeTab]);

    if (isLoading) {
        return <div className="flex justify-center items-center h-full"><Spinner /></div>;
    }

    const EmptyState = () => (
        <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
            <DocumentTextIcon className="h-12 w-12 text-gray-500 mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-white">{`No ${activeTab === 'invoices' ? 'Invoices' : 'Quotes'} Found`}</h3>
            <p className="mt-1 text-sm text-gray-400">{activeTab === 'invoices' ? 'Create a quote and convert it to an invoice.' : 'Create your first quote to get started.'}</p>
            <div className="mt-6">
                <button onClick={() => openModal('jobInvoice', { status: 'Quote' })} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
                    <PlusIcon className="-ml-0.5 h-5 w-5" /> Add Quote
                </button>
            </div>
        </div>
    );

    const getTabClassName = (tab: 'invoices' | 'quotes') => {
        return activeTab === tab
            ? 'border-brand-500 text-brand-400'
            : 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="border-b border-gray-700 w-full sm:w-auto">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button onClick={() => setActiveTab('invoices')} className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('invoices')}`}>
                            <span>Invoices</span>
                        </button>
                        <button onClick={() => setActiveTab('quotes')} className={`group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${getTabClassName('quotes')}`}>
                            <span>Quotes</span>
                        </button>
                    </nav>
                </div>
                <div className="flex items-center gap-x-2 w-full sm:w-auto">
                    <button
                        onClick={() => openModal('customerManager')}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-x-2 rounded-md bg-gray-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-600"
                    >
                        Manage Customers
                    </button>
                </div>
            </div>

            {filteredInvoices.length === 0 ? <EmptyState /> : (
                <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
                    <ul role="list" className="divide-y divide-gray-700">
                        {filteredInvoices.map((invoice) => (
                            <li key={invoice.id} className="group relative">
                                <button onClick={() => openModal('jobInvoice', { viewOnly: true, invoice })} className="block w-full text-left hover:bg-gray-700/50 focus:outline-none focus:bg-gray-700/50 transition duration-150 ease-in-out">
                                    <div className="px-4 py-4 sm:px-6">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-medium text-brand-400 truncate">{invoice.status} #{invoice.invoiceNumber}</p>
                                            <div className="ml-2 flex-shrink-0 flex items-center gap-x-2">
                                                <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${invoice.balance > 0 && invoice.status === 'Invoice' ? 'bg-yellow-800 text-yellow-100' : 'bg-green-800 text-green-100'}`}>
                                                    {invoice.status === 'Invoice' ? (invoice.balance > 0 ? `Owed: ${formatCurrency(invoice.balance)}` : 'Paid') : 'Quote'}
                                                </p>
                                                <p className="px-2 hidden sm:inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-200">{formatCurrency(invoice.total)}</p>
                                            </div>
                                        </div>
                                        <div className="mt-2 sm:flex sm:justify-between">
                                            <div className="sm:flex">
                                                <p className="flex items-center text-sm text-gray-300 font-semibold">{invoice.customerDetails.name}</p>
                                                <p className="mt-2 flex items-center text-sm text-gray-400 sm:mt-0 sm:ml-6 truncate">{invoice.items[0]?.description || 'Job Invoice'}</p>
                                            </div>
                                            <div className="mt-2 flex items-center text-sm text-gray-400 sm:mt-0">
                                                <p>{formatDate(invoice.invoiceDate)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                                 <div className="absolute top-1/2 -translate-y-1/2 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-x-2">
                                    <button onClick={() => openModal('jobInvoice', { editingInvoice: invoice })} className="p-2 rounded-full text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white" title="Edit">
                                        <EditIcon className="h-5 w-5" />
                                    </button>
                                     <button onClick={() => openModal('deleteJobInvoiceConfirm', invoice)} className="p-2 rounded-full text-gray-300 bg-gray-700 hover:bg-red-600 hover:text-white" title="Delete">
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default JobInvoicesPage;