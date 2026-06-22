import React, { useState, useRef, useMemo } from 'react';
import { StatementTransaction, ExpenseCategory, StatementTransactionUpdate } from '../../types';
import { XMarkIcon, PlusIcon, Bars3Icon } from '../icons';
import { formatCurrency, formatDate, isLikelyOwnAccountTransfer } from '../../utils/helpers';
import CurrencyInput from '../common/CurrencyInput';

interface CategoryAllocatorProps {
    transaction: StatementTransaction;
    onUpdate: (id: string, updates: StatementTransactionUpdate) => void;
    onClose: () => void;
    categories: ExpenseCategory[];
    onAddCategory: (name: string) => void;
    onReorderCategories: (reordered: ExpenseCategory[]) => void;
}

const CategoryAllocator = ({ transaction, onUpdate, onClose, categories, onAddCategory, onReorderCategories }: CategoryAllocatorProps) => {
    const [category, setCategory] = useState(transaction.category);
    const [vatMode, setVatMode] = useState<'toggle' | 'manual'>('toggle');
    const [vatRate, setVatRate] = useState<number>(transaction.vatRate);
    const [manualVat, setManualVat] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    // A "transfer" is money moved between the business's own accounts (e.g. to
    // savings). Default it on when the line clearly looks like one, or when we're
    // editing a transaction that was already saved as a transfer.
    const [isTransfer, setIsTransfer] = useState<boolean>(
        transaction.reconciliationType === 'transfer' ||
        (transaction.status !== 'Reconciled' && isLikelyOwnAccountTransfer(transaction.description))
    );

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    
    const isIncome = transaction.amount > 0;

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => { dragItem.current = index; };
    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => { dragOverItem.current = index; };
    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null) {
            const reordered = [...categories];
            const dragged = reordered.splice(dragItem.current, 1)[0];
            reordered.splice(dragOverItem.current, 0, dragged);
            onReorderCategories(reordered);
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

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

        const updates: StatementTransactionUpdate = {
            category,
            vatRate: finalVatRate,
            vatAmount: Math.abs(finalVatAmount),
            status: 'Reconciled',
            reconciliationType: null, // clear any prior transfer flag (e.g. when editing)
        };
        onUpdate(transaction.id, updates);
    };
    
    const filteredCategories = useMemo(() => {
        if (!searchTerm) return categories;
        return categories.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [categories, searchTerm]);

    const handleAddNewCategoryFromSearch = () => {
        const newName = searchTerm.trim();
        if(newName) {
            onAddCategory(newName);
            setCategory(newName);
            setSearchTerm('');
        }
    };


    return (
        <>
            <header className="p-4 border-b border-gray-700 flex items-center justify-between sticky top-0 z-10 bg-gray-800">
                <h2 className="text-lg font-bold text-white">{isIncome ? 'Allocate Income' : 'Allocate Expense'}</h2>
                <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <div className="p-6">
                <div className="bg-gray-900/50 p-4 rounded-lg mb-6">
                    <div className="flex justify-between items-center"><p className="text-sm text-gray-400">{formatDate(transaction.date)}</p><p className={`text-xl font-bold ${transaction.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatCurrency(transaction.amount)}</p></div>
                    <p className="text-white mt-1 truncate">{transaction.description}</p>
                </div>

                {/* Transfer between own accounts (e.g. a sweep to savings) — not income/expense */}
                <div className="mb-6">
                    <button type="button" onClick={() => setIsTransfer(v => !v)} aria-pressed={isTransfer} className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border-2 text-left transition-colors ${isTransfer ? 'bg-brand-900/60 border-brand-500' : 'bg-gray-700/50 border-gray-600 hover:border-gray-500'}`}>
                        <span>
                            <span className="block text-sm font-semibold text-white">Transfer between own accounts</span>
                            <span className="block text-xs text-gray-400">Moving money to savings or another of your own accounts — not income or an expense.</span>
                        </span>
                        <span className={`flex-shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${isTransfer ? 'bg-brand-500' : 'bg-gray-600'}`}>
                            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${isTransfer ? 'translate-x-5' : ''}`} />
                        </span>
                    </button>
                </div>

                {isTransfer && (
                    <div className="space-y-3 rounded-lg bg-gray-900/40 p-4 border border-gray-700">
                        <p className="text-sm text-gray-300">
                            Use this for money moved between your own accounts — e.g. a sweep into your savings
                            account, or moving funds between two business bank accounts. It isn't income or an
                            expense, so it's excluded from your expense breakdown, profit, and VAT totals. The
                            money is still yours, just in a different pot.
                        </p>
                        <p className="text-xs text-gray-400 italic">
                            A transfer <em>fee</em>, if any, should be reconciled separately as a bank charge.
                        </p>
                    </div>
                )}

                {!isTransfer && (<>
                <div>
                    <label htmlFor="category-search" className="block text-sm font-medium text-gray-300">Select or Add Category</label>
                    <input
                        id="category-search"
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search or type to add new..."
                        className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm py-2 px-3 text-white"
                        autoFocus
                    />
                    <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {filteredCategories.map((cat, index) => (
                            <div key={cat.id} draggable onDragStart={(e) => handleDragStart(e, index)} onDragEnter={(e) => handleDragEnter(e, index)} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()} className="relative group">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCategory(cat.name);
                                        setSearchTerm('');
                                    }}
                                    className="w-full text-center focus:outline-none"
                                    aria-pressed={category === cat.name}
                                >
                                    <div className={`mx-auto h-14 w-14 rounded-full border-2 transition-all ${cat.color} ${category === cat.name ? 'border-brand-400 ring-2 ring-brand-400 ring-offset-2 ring-offset-gray-800' : 'border-transparent group-hover:opacity-80'}`} />
                                    <span className="mt-2 block w-full truncate text-xs font-semibold text-white text-center">{cat.name}</span>
                                </button>
                                <div className="absolute top-0 right-0 text-gray-400 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"><Bars3Icon className="h-4 w-4" /></div>
                            </div>
                        ))}
                    </div>

                    {filteredCategories.length === 0 && searchTerm.trim() !== '' && (
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={handleAddNewCategoryFromSearch}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-gray-600 bg-gray-700/50 text-gray-300 hover:border-gray-500 hover:text-white"
                            >
                                <PlusIcon className="h-5 w-5" />
                                Add new category: "{searchTerm.trim()}"
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-6">
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-300">VAT</label>
                         {isIncome && <span className="text-xs text-yellow-400 bg-yellow-900/50 px-2 py-1 rounded-md">Note: VAT on income is payable to HMRC.</span>}
                        <button onClick={() => setVatMode(vatMode === 'toggle' ? 'manual' : 'toggle')} className="text-xs font-semibold text-brand-400 hover:text-brand-300">
                            {vatMode === 'toggle' ? 'Enter Manually' : 'Use Toggle'}
                        </button>
                    </div>
                    {vatMode === 'toggle' ? (
                        <div className="flex items-center space-x-2 rounded-lg bg-gray-700 p-1">
                            <button onClick={() => setVatRate(0)} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${vatRate === 0 ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>0%</button>
                            <button onClick={() => setVatRate(20)} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${vatRate === 20 ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>20%</button>
                        </div>
                    ) : (
                        <div>
                            <CurrencyInput id="manualVat" value={manualVat} onChange={e => setManualVat(e.target.value)} placeholder="Enter VAT amount" />
                        </div>
                    )}
                </div>
                </>)}
            </div>
             <footer className="p-4 border-t border-gray-700 flex justify-end sticky bottom-0 z-10 bg-gray-800"><button onClick={handleUpdate} className="w-full px-4 py-3 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-md">{isTransfer ? 'Confirm Transfer' : isIncome ? 'Confirm & Record Income' : 'Confirm & Reconcile'}</button></footer>
        </>
    );
};

export default CategoryAllocator;
