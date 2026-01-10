import React from 'react';
import { MiscInvoice } from '../../types';
import { BanknotesIcon, PlusIcon, EditIcon, TrashIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';
import { useUI } from '../../hooks/useUI';

interface IncomePageProps {
  invoices: MiscInvoice[];
}

const IncomePage = ({ invoices }: IncomePageProps) => {
  const { openModal } = useUI();
  if (!invoices) return <div className="flex justify-center items-center h-full"><Spinner /></div>;

  const EmptyState = () => (
    <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
      <BanknotesIcon className="h-12 w-12 text-gray-500 mx-auto" />
      <h3 className="mt-4 text-lg font-medium text-white">No Income Invoices Found</h3>
      <p className="mt-1 text-sm text-gray-400">Create your first invoice manually or from a bank transaction.</p>
       <div className="mt-6">
          <button onClick={() => openModal('miscInvoice')} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
              <PlusIcon className="-ml-0.5 h-5 w-5" /> Add Invoice
          </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
       {invoices.length === 0 ? <EmptyState /> : (
            <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden">
                <ul role="list" className="divide-y divide-gray-700">
                    {invoices.map((invoice) => (
                        <li key={invoice.id} className="group relative">
                            <div className="px-4 py-4 sm:px-6">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-brand-400 truncate">Invoice #{invoice.invoiceNumber}</p>
                                    <div className="ml-2 flex-shrink-0">
                                        <p className="px-2 hidden sm:inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-200">{formatCurrency(invoice.total)}</p>
                                    </div>
                                </div>
                                <div className="mt-2 sm:flex sm:justify-between">
                                    <div className="sm:flex">
                                        <p className="flex items-center text-sm text-gray-400">To: {invoice.customerName}</p>
                                    </div>
                                    <div className="mt-2 flex items-center text-sm text-gray-400 sm:mt-0">
                                        <p>{formatDate(invoice.invoiceDate)}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="absolute top-1/2 -translate-y-1/2 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-x-2">
                                <button onClick={() => openModal('editMiscInvoice', invoice)} className="p-2 rounded-full text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white" title="Edit Invoice">
                                    <EditIcon className="h-5 w-5" />
                                </button>
                                <button onClick={() => openModal('deleteMiscInvoiceConfirm', invoice)} className="p-2 rounded-full text-gray-300 bg-gray-700 hover:bg-red-600 hover:text-white" title="Delete Invoice">
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

export default IncomePage;