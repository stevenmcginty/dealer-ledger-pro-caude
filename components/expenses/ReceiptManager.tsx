import React from 'react';
import { Receipt } from '../../types';
import { DocumentTextIcon, PlusIcon, EditIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';
import { useUI } from '../../hooks/useUI';

interface ReceiptManagerProps {
  receipts: Receipt[];
  hasActiveFilters: boolean;
}

interface ReceiptCardProps {
    receipt: Receipt;
}
const ReceiptCard: React.FC<ReceiptCardProps> = ({ receipt }) => {
    const { openModal } = useUI();
    const isReconciled = receipt.status === 'Paid';
    const statusText = isReconciled ? 'Reconciled' : 'Unreconciled';
    const statusColor = isReconciled ? 'bg-green-800 text-green-200' : 'bg-yellow-800 text-yellow-200';
    
    return (
        <div className="bg-gray-800 rounded-lg shadow-md p-4 space-y-2">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-lg font-bold text-white truncate">{receipt.vendor}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-gray-400">{receipt.category}</p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>{statusText}</span>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-lg font-semibold text-white">{formatCurrency(receipt.amount)}</p>
                    {receipt.vat > 0 && <p className="text-xs text-gray-400">incl. {formatCurrency(receipt.vat)} VAT</p>}
                </div>
            </div>
             <div className="mt-3 flex justify-between items-center text-sm text-gray-400 pt-2 border-t border-gray-700">
                <p>{formatDate(receipt.date)}</p>
                 <button onClick={() => openModal('expense', receipt)} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><EditIcon className="h-5 w-5" /></button>
            </div>
        </div>
    );
}

const ReceiptManager = ({ receipts, hasActiveFilters }: ReceiptManagerProps) => {
    const { openModal } = useUI();
    if(!receipts) return <div className="flex justify-center items-center h-full"><Spinner /></div>;
    
    const EmptyState = () => (
        <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
            <DocumentTextIcon className="h-12 w-12 text-gray-500 mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-white">{hasActiveFilters ? 'No Receipts Match Filter' : 'No Receipts Found'}</h3>
            <p className="mt-1 text-sm text-gray-400">
                {hasActiveFilters
                    ? 'Try adjusting your search or date range.'
                    : 'Add an expense to get started. You can scan or upload a receipt.'
                }
            </p>
            {!hasActiveFilters && (
                <div className="mt-6"><button onClick={() => openModal('expense')} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500"><PlusIcon className="h-5 w-5" /> Add Receipt</button></div>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
             <div className="hidden sm:flex sm:items-center sm:justify-end">
                <button onClick={() => openModal('expense')} className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"><PlusIcon className="-ml-1 mr-2 h-5 w-5" /> Add New Receipt</button>
            </div>
            {receipts.length === 0 ? <EmptyState /> : (
                <div className="space-y-4">
                    {receipts.map(r => <ReceiptCard key={r.id} receipt={r} />)}
                </div>
            )}
        </div>
    );
};

export default ReceiptManager;