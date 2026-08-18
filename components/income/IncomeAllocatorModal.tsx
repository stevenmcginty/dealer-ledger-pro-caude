import React, { useState, useMemo } from 'react';
import { StatementTransaction, StatementTransactionUpdate, SalesDocument, MiscInvoice, PaymentMethod, Payment, JobInvoice } from '../../types';
import { XMarkIcon } from '../icons';
import { formatCurrency, formatDate, isLikelyOwnAccountTransfer } from '../../utils/helpers';
import CurrencyInput from '../common/CurrencyInput';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { useToast } from '../ui';
import Spinner from '../common/Spinner';

interface IncomeAllocatorModalProps {
    transaction: StatementTransaction;
    onUpdate: (id: string, updates: StatementTransactionUpdate) => void;
    onClose: () => void;
}

type Receivable = {
    id: string;
    type: 'sale' | 'misc' | 'job';
    date: string;
    customerName: string;
    details: string;
    amountDue: number;
};

const IncomeAllocatorModal = ({ transaction, onUpdate, onClose }: IncomeAllocatorModalProps) => {
    const { salesDocs, miscInvoices, jobInvoices, reconcileSalePayment, reconcileMiscInvoicePayment, reconcileJobInvoicePayment } = useData();
    const { openModal, closeModal } = useUI();
    const toast = useToast();
    // Default straight to the categorize view (where the Transfer toggle lives) when the
    // line clearly looks like an own-account transfer, or when editing a saved transfer.
    const looksLikeTransfer = transaction.reconciliationType === 'transfer' ||
        (transaction.status !== 'Reconciled' && isLikelyOwnAccountTransfer(transaction.description));
    const [view, setView] = useState<'match' | 'categorize'>(looksLikeTransfer ? 'categorize' : 'match');
    const [isTransfer, setIsTransfer] = useState<boolean>(looksLikeTransfer);

    // State for 'categorize' view
    const [category, setCategory] = useState(transaction.category === 'Other' ? '' : transaction.category);
    const [isOther, setIsOther] = useState(!["Car Sale", "Part Sale", "Rent"].includes(transaction.category) && transaction.category !== 'Other');
    const [otherCategory, setOtherCategory] = useState(isOther ? transaction.category : '');
    const [vatMode, setVatMode] = useState<'toggle' | 'manual'>('toggle');
    const [vatRate, setVatRate] = useState<number>(transaction.vatRate || 0);
    const [manualVat, setManualVat] = useState('');

    // State for 'match' view
    const [selectedReceivable, setSelectedReceivable] = useState<Receivable | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const transactionAmount = transaction.amount;

    const receivables = useMemo<Receivable[]>(() => {
        const salesReceivables: Receivable[] = salesDocs
            .filter(doc => doc.balance > 0)
            .map(doc => ({
                id: doc.id,
                type: 'sale',
                date: doc.invoiceDate,
                customerName: doc.customerName,
                details: `${doc.carDetails.reg} - ${doc.documentType}`,
                amountDue: doc.balance
            }));

        const miscReceivables: Receivable[] = miscInvoices
            .filter(inv => !inv.linkedTransactionId)
            .map(inv => ({
                id: inv.id,
                type: 'misc',
                date: inv.invoiceDate,
                customerName: inv.customerName,
                details: inv.items[0]?.description || 'Misc. Invoice',
                amountDue: inv.total
            }));
        
        const jobReceivables: Receivable[] = jobInvoices
            .filter(inv => inv.status === 'Invoice' && inv.balance > 0)
            .map(inv => ({
                id: inv.id,
                type: 'job',
                date: inv.invoiceDate,
                customerName: inv.customerDetails.name,
                details: inv.items[0]?.description || 'Job Invoice',
                amountDue: inv.balance
            }));
        
        const combined = [...salesReceivables, ...miscReceivables, ...jobReceivables];
        
        // Sort by how close the amount is to the transaction amount
        return combined.sort((a, b) => Math.abs(transactionAmount - a.amountDue) - Math.abs(transactionAmount - b.amountDue));

    }, [salesDocs, miscInvoices, jobInvoices, transactionAmount]);

    const handleUpdate = () => {
        if (isTransfer) {
            // Money moved between own accounts: no VAT, flagged so the reports exclude it.
            onUpdate(transaction.id, {
                category: 'Transfer',
                vatRate: 0,
                vatAmount: 0,
                reconciliationType: 'transfer',
                status: 'Reconciled',
            });
            onClose();
            return;
        }

        let finalVatAmount = 0;
        let finalVatRate = 0;

        if (vatMode === 'manual') {
            finalVatAmount = parseFloat(manualVat) || 0;
            const netAmount = Math.abs(transaction.amount) - finalVatAmount;
            finalVatRate = netAmount > 0 ? (finalVatAmount / netAmount) * 100 : 0;
        } else {
            finalVatRate = vatRate;
            finalVatAmount = vatRate === 20 ? (transaction.amount / 6) : 0;
        }

        const finalCategory = isOther ? otherCategory.trim() : category;
        if (!finalCategory) {
            toast.error("Please select or enter a category.");
            return;
        }

        const updates: StatementTransactionUpdate = {
            category: finalCategory,
            vatRate: finalVatRate,
            vatAmount: Math.abs(finalVatAmount),
            status: 'Reconciled',
            reconciliationType: null, // clear any prior transfer flag (e.g. when editing)
        };
        onUpdate(transaction.id, updates);
        onClose();
    };

    const handleReconcile = async () => {
        if (!selectedReceivable) return;
        setIsSubmitting(true);

        try {
            const payment: Payment = {
                method: (transaction.method as PaymentMethod) || 'Bank Transfer',
                amount: transaction.amount,
                notes: `Bank reconciliation on ${formatDate(new Date())}`
            };

            if (selectedReceivable.type === 'sale') {
                await reconcileSalePayment(transaction.id, selectedReceivable.id, payment);
            } else if (selectedReceivable.type === 'job') {
                await reconcileJobInvoicePayment(transaction.id, selectedReceivable.id, payment);
            } else { // 'misc'
                await reconcileMiscInvoicePayment(transaction.id, selectedReceivable.id);
            }
            closeModal();
        } catch (error) {
            console.error("Reconciliation failed:", error);
            toast.error("An error occurred during reconciliation. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleCreateNewInvoice = () => {
        closeModal();
        openModal('miscInvoice', { transaction });
    };

    const renderMatchView = () => (
        <>
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                <div className="bg-gray-900/50 p-4 rounded-lg">
                    <div className="flex justify-between items-center"><p className="text-sm text-gray-400">{formatDate(transaction.date)}</p><p className="text-xl font-bold text-green-400">{formatCurrency(transaction.amount)}</p></div>
                    <p className="text-white mt-1 truncate">{transaction.description}</p>
                </div>
                <div>
                    <h3 className="text-base font-semibold text-white mb-2">Select Matching Invoice</h3>
                    <div className="space-y-2 pr-2 -mr-2 max-h-80 overflow-y-auto">
                        {receivables.length > 0 ? receivables.map(item => {
                            const isSelected = selectedReceivable?.id === item.id;
                            const isSuggested = Math.abs(transactionAmount - item.amountDue) < 0.05;
                            return (
                                <div key={`${item.type}-${item.id}`} onClick={() => setSelectedReceivable(item)} className={`p-3 rounded-lg cursor-pointer transition-all border ${isSelected ? 'bg-brand-900/70 border-brand-600' : 'bg-gray-700 border-gray-600 hover:border-gray-500'} ${isSuggested && !isSelected ? 'border-yellow-500' : ''}`}>
                                    <div className="flex justify-between items-center">
                                        <p className="font-semibold text-white">{item.customerName}</p>
                                        <p className="font-bold text-white">{formatCurrency(item.amountDue)}</p>
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
                                        <span>{item.details}</span>
                                        <span>{formatDate(item.date)}</span>
                                    </div>
                                </div>
                            );
                        }) : (
                            <p className="text-center text-gray-400 py-6">No outstanding invoices found.</p>
                        )}
                    </div>
                </div>
            </div>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 grid grid-cols-2 gap-3 bg-gray-800">
                <div className="space-y-2">
                    <button type="button" onClick={() => setView('categorize')} className="w-full px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                        Categorize Manually
                    </button>
                    <button type="button" onClick={handleCreateNewInvoice} className="w-full px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                        New Misc. Invoice
                    </button>
                </div>
                <button onClick={handleReconcile} disabled={!selectedReceivable || isSubmitting} className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : 'Confirm Match'}
                </button>
            </footer>
        </>
    );

    const renderCategorizeView = () => (
         <>
            <div className="p-6">
                <div className="bg-gray-900/50 p-4 rounded-lg mb-6">
                    <div className="flex justify-between items-center"><p className="text-sm text-gray-400">{formatDate(transaction.date)}</p><p className="text-xl font-bold text-green-400">{formatCurrency(transaction.amount)}</p></div>
                    <p className="text-white mt-1 truncate">{transaction.description}</p>
                </div>

                {/* Transfer between own accounts (e.g. moving money between bank accounts) — not income */}
                <div className="mb-6">
                    <button type="button" onClick={() => setIsTransfer(v => !v)} aria-pressed={isTransfer} className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border-2 text-left transition-colors ${isTransfer ? 'bg-brand-900/60 border-brand-500' : 'bg-gray-700/50 border-gray-600 hover:border-gray-500'}`}>
                        <span>
                            <span className="block text-sm font-semibold text-white">Transfer between own accounts</span>
                            <span className="block text-xs text-gray-400">Money received from another of your own accounts — not income.</span>
                        </span>
                        <span className={`flex-shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${isTransfer ? 'bg-brand-500' : 'bg-gray-600'}`}>
                            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${isTransfer ? 'translate-x-5' : ''}`} />
                        </span>
                    </button>
                </div>

                {isTransfer && (
                    <div className="space-y-3 rounded-lg bg-gray-900/40 p-4 border border-gray-700">
                        <p className="text-sm text-gray-300">
                            Use this for money moved between your own accounts — e.g. cash coming back from your
                            savings account, or moving funds between two business bank accounts. It isn't income,
                            so it's excluded from your turnover and VAT totals. The money is still yours, just in a
                            different pot.
                        </p>
                        <p className="text-xs text-gray-400 italic">
                            A transfer <em>fee</em>, if any, should be reconciled separately as a bank charge.
                        </p>
                    </div>
                )}

                {!isTransfer && (<>
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Select Category</label>
                    <div className="grid grid-cols-2 gap-3">
                        {["Car Sale", "Part Sale", "Rent", 'Other'].map((cat) => (
                             <button
                                key={cat} type="button"
                                onClick={() => { cat === 'Other' ? setIsOther(true) : setCategory(cat); if (cat !== 'Other') setIsOther(false); }}
                                className={`py-3 px-4 text-sm font-semibold rounded-md transition-colors border-2 ${(isOther && cat === 'Other') || category === cat ? 'bg-brand-600 border-brand-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'}`}
                            >{cat}</button>
                        ))}
                    </div>
                </div>

                {isOther && (
                    <div className="mt-4">
                        <label htmlFor="otherCategory" className="block text-sm font-medium text-gray-300">Custom Category</label>
                        <input id="otherCategory" type="text" value={otherCategory} onChange={(e) => setOtherCategory(e.target.value)} placeholder="e.g., Refund" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"/>
                    </div>
                )}

                <div className="mt-6">
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-300">VAT</label>
                        <span className="text-xs text-yellow-400 bg-yellow-900/50 px-2 py-1 rounded-md">Note: VAT on income is payable to HMRC.</span>
                        <button onClick={() => setVatMode(vatMode === 'toggle' ? 'manual' : 'toggle')} className="text-xs font-semibold text-brand-400 hover:text-brand-300">{vatMode === 'toggle' ? 'Enter Manually' : 'Use Toggle'}</button>
                    </div>
                    {vatMode === 'toggle' ? (
                        <div className="flex items-center space-x-2 rounded-lg bg-gray-700 p-1">
                            <button type="button" onClick={() => setVatRate(0)} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${vatRate === 0 ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>0%</button>
                            <button type="button" onClick={() => setVatRate(20)} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${vatRate === 20 ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>20%</button>
                        </div>
                    ) : (
                        <div><CurrencyInput id="manualVat" value={manualVat} onChange={e => setManualVat(e.target.value)} placeholder="Enter VAT amount" /></div>
                    )}
                </div>
                </>)}
            </div>
             <footer className="p-4 border-t border-gray-700 flex justify-end gap-3 sticky bottom-0 z-10 bg-gray-800">
                <button type="button" onClick={() => setView('match')} className="px-4 py-3 text-sm font-bold text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Back to Matching</button>
                <button onClick={handleUpdate} className="flex-1 px-4 py-3 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-md">{isTransfer ? 'Confirm Transfer' : 'Confirm & Record Income'}</button>
             </footer>
        </>
    );

    return (
        <div className="w-full flex flex-col h-full max-h-[90vh]">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Allocate Income</h2>
                <button type="button" onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            {view === 'match' ? renderMatchView() : renderCategorizeView()}
        </div>
    );
};

export default IncomeAllocatorModal;