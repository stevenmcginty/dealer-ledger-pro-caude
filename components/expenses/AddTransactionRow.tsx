import React, { useEffect, useRef, useState } from 'react';
import { NewStatementTransaction, ExpenseCategory } from '../../types';
import { useData } from '../../hooks/useData';
import { toYYYYMMDD } from '../../utils/helpers';
import UkDateInput from '../common/UkDateInput';
import CurrencyInput from '../common/CurrencyInput';
import InlineCategoryCombobox from './InlineCategoryCombobox';
import Spinner from '../common/Spinner';
import { useToast } from '../ui';
import { XMarkIcon, CheckCircleIcon } from '../icons';

interface AddTransactionRowProps {
    account: { id: string; type: 'Bank' | 'Credit Card'; name: string };
    categories: ExpenseCategory[];
    onAddCategory: (name: string) => void;
    onClose: () => void;
}

// Inline creator for an off-statement transaction (money in OR out) — e.g. a cash sale, a cash
// purchase, or money paid into the account. Surfaces the previously-unused addTransactions op.
// Stays open after each save (cleared) so several can be entered in a row.
const AddTransactionRow = ({ account, categories, onAddCategory, onClose }: AddTransactionRowProps) => {
    const { addTransactions } = useData();
    const toast = useToast();
    const today = toYYYYMMDD(new Date());

    const [date, setDate] = useState(today);
    const [description, setDescription] = useState('');
    const [amountStr, setAmountStr] = useState('');
    const [direction, setDirection] = useState<'out' | 'in'>('out');
    const [category, setCategory] = useState('');
    const [vatRate, setVatRate] = useState<0 | 20>(0);
    const [isTransfer, setIsTransfer] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [justSaved, setJustSaved] = useState(false);

    const descRef = useRef<HTMLInputElement>(null);
    useEffect(() => { descRef.current?.focus(); }, []);

    const amount = parseFloat(amountStr);
    const canSave = description.trim() !== '' && !isNaN(amount) && amount > 0 && !isSaving;

    const reset = () => {
        setDescription('');
        setAmountStr('');
        setCategory('');
        setVatRate(0);
        setIsTransfer(false);
    };

    const handleSave = async () => {
        if (!canSave) return;
        setIsSaving(true);
        const signed = direction === 'out' ? -Math.abs(amount) : Math.abs(amount);

        let tx: NewStatementTransaction;
        if (isTransfer) {
            tx = {
                date, description: description.trim(), amount: signed,
                type: account.type, accountId: account.id, method: 'Manual',
                category: 'Transfer', vatRate: 0, vatAmount: 0,
                status: 'Reconciled', reconciliationType: 'transfer',
            };
        } else {
            // Categorise inline only for money-out (expense categories). Money-in lands in the
            // queue Unreconciled so it gets the correct income control there.
            const cat = direction === 'out' ? category.trim() : '';
            const vatAmount = cat && vatRate === 20 ? Math.abs(signed) / 6 : 0;
            tx = {
                date, description: description.trim(), amount: signed,
                type: account.type, accountId: account.id, method: 'Manual',
                category: cat || 'Other',
                vatRate: cat ? vatRate : 0,
                vatAmount,
                status: cat ? 'Reconciled' : 'Unreconciled',
                reconciliationType: null,
            };
        }

        try {
            await addTransactions([tx]);
            reset();
            setJustSaved(true);
            setTimeout(() => setJustSaved(false), 1500);
            descRef.current?.focus();
        } catch (err) {
            console.error('Failed to add manual transaction:', err);
            toast.error('Could not add the transaction. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation(); // don't let typing reach the queue's global keyboard handler
        if (e.key === 'Enter' && canSave) { e.preventDefault(); handleSave(); }
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };

    return (
        <div onKeyDown={onKeyDown} className="bg-gray-800 border border-brand-700/50 rounded-lg p-4 mb-3 shadow-lg animate-in fade-in-0 slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Add a transaction to {account.name}</h3>
                <button type="button" onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700" aria-label="Close">
                    <XMarkIcon className="h-5 w-5" />
                </button>
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-gray-700 p-1 mb-3 w-full sm:w-72">
                <button type="button" onClick={() => setDirection('out')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${direction === 'out' ? 'bg-red-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Money out (−)</button>
                <button type="button" onClick={() => setDirection('in')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${direction === 'in' ? 'bg-green-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Money in (+)</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                <div className="sm:col-span-3">
                    <label className="block text-xs font-medium text-gray-400 mb-1">Date</label>
                    <UkDateInput id="add-tx-date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div className="sm:col-span-5">
                    <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
                    <input ref={descRef} type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Cash sale — AB12 CDE" className="block w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3 text-white text-sm focus:outline-none focus:ring-brand-500 focus:border-brand-500" />
                </div>
                <div className="sm:col-span-4">
                    <label className="block text-xs font-medium text-gray-400 mb-1">Amount</label>
                    <CurrencyInput id="add-tx-amount" value={amountStr} onChange={e => setAmountStr(e.target.value)} />
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
                    <input type="checkbox" checked={isTransfer} onChange={e => setIsTransfer(e.target.checked)} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600 focus:ring-brand-500" />
                    Transfer between own accounts
                </label>

                {!isTransfer && direction === 'out' && (
                    <>
                        <div className="w-44">
                            <label className="block text-xs font-medium text-gray-400 mb-1">Category (optional)</label>
                            <InlineCategoryCombobox categories={categories} value={category || undefined} recentFirst={[]} onSelect={setCategory} onAddCategory={onAddCategory} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">VAT</label>
                            <div className="flex items-center gap-1 rounded-lg bg-gray-700 p-0.5">
                                <button type="button" onClick={() => setVatRate(0)} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${vatRate === 0 ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>0%</button>
                                <button type="button" onClick={() => setVatRate(20)} className={`px-3 py-1.5 text-xs font-semibold rounded-md ${vatRate === 20 ? 'bg-brand-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>20%</button>
                            </div>
                        </div>
                    </>
                )}

                <div className="ml-auto flex items-center gap-3">
                    {justSaved && <span className="inline-flex items-center gap-1 text-xs text-green-400"><CheckCircleIcon className="h-4 w-4" /> Added</span>}
                    <button type="button" onClick={handleSave} disabled={!canSave} className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-md text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                        {isSaving ? <Spinner className="h-4 w-4" /> : 'Add'}
                    </button>
                </div>
            </div>

            <p className="mt-3 text-[11px] text-gray-500">
                {direction === 'in' && !isTransfer
                    ? 'Money-in is added to the list below so you can categorise it (Car Sale, etc.) with the right controls.'
                    : 'Manually-added rows aren’t matched against statement uploads, so avoid re-entering a line that will also import from your bank.'}
            </p>
        </div>
    );
};

export default AddTransactionRow;
