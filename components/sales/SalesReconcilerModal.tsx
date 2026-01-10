import React, { useState, useMemo } from 'react';
import { StatementTransaction, SalesDocument, Payment, PaymentMethod } from '../../types';
import { XMarkIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';
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
        <div className="w-full flex flex-col h-full max-h-[90vh]">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
                <h2 className="text-lg font-bold text-white">Reconcile Income</h2>
                <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                <div className="bg-gray-900/50 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                        <p className="text-sm text-gray-400">{formatDate(transaction.date)}</p>
                        <p className="text-xl font-bold text-green-400">{formatCurrency(transaction.amount)}</p>
                    </div>
                    <p className="text-white mt-1 truncate">{transaction.description}</p>
                </div>
                <div>
                    <input 
                        type="text"
                        placeholder="Search by Reg, Customer, or Invoice #"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"
                    />
                </div>
                <div className="space-y-2 pr-2 -mr-2 max-h-64 overflow-y-auto">
                    {filteredDocs.length > 0 ? filteredDocs.map(doc => {
                        const carDetails = doc.carDetails || vehicles.find(v => v.id === doc.vehicleId);
                        return (
                            <div key={doc.id} onClick={() => setSelectedDocId(doc.id)} className={`p-3 rounded-lg cursor-pointer transition-all border ${selectedDocId === doc.id ? 'bg-brand-900/70 border-brand-600' : 'bg-gray-700 border-gray-600 hover:border-gray-500'}`}>
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-white">{doc.customerName}</p>
                                    <p className="font-bold text-white">{formatCurrency(doc.balance)}</p>
                                </div>
                                <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
                                    <span>{carDetails?.reg} - {doc.documentType}</span>
                                    <span>#{doc.invoiceNumber}</span>
                                </div>
                            </div>
                        )
                    }) : (
                        <p className="text-center text-gray-400 py-4">No matching unpaid invoices found.</p>
                    )}
                </div>
            </div>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 grid grid-cols-2 gap-3 bg-gray-800">
                <button type="button" onClick={handleCreateInvoice} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                    New Misc. Invoice
                </button>
                <button onClick={handleReconcile} disabled={!canReconcile || isSubmitting} className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : 'Confirm Match'}
                </button>
            </footer>
        </div>
    );
};

export default SalesReconcilerModal;