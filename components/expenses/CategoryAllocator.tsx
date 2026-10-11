import React, { useState, useRef, useMemo } from 'react';
import { StatementTransaction, ExpenseCategory, StatementTransactionUpdate } from '../../types';
import { XMarkIcon, PlusIcon, Bars3Icon, CheckIcon, MagnifyingGlassIcon } from '../icons';
import { formatDate, isLikelyOwnAccountTransfer } from '../../utils/helpers';
import CurrencyInput from '../common/CurrencyInput';
import { IconButton, Button, Field, Segmented, Switch, Alert } from '../ui';
import { controlFrame, controlInput, cx } from '../ui/cx';
import { Money } from './ledgerUi';

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
            <header className="sticky top-0 z-sticky flex items-start gap-3 border-b border-line bg-surface px-4 pb-3 pt-1 sm:px-5 sm:pt-5">
                <div className="min-w-0 flex-1 pt-1.5">
                    <h2 className="text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">{isIncome ? 'What was this money in?' : 'What was this spend?'}</h2>
                </div>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={onClose} className="-me-2" />
            </header>
            <div className="space-y-5 p-4 sm:p-5">
                {/* The bank line, as it reads on the statement. */}
                <div className="rounded-card border border-line bg-surface-2 px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                        <p className="num text-sm text-ink-3">{formatDate(transaction.date)}</p>
                        <Money amount={transaction.amount} signed tone className="text-xl font-bold text-ink" />
                    </div>
                    <p className="mt-1 break-words text-base font-semibold text-ink">{transaction.description}</p>
                </div>

                {/* Transfer between own accounts (e.g. a sweep to savings) — not income/expense */}
                <div className="rounded-card border border-line px-4 py-1">
                    <Switch
                        checked={isTransfer}
                        onChange={() => setIsTransfer(v => !v)}
                        label="Transfer between own accounts"
                        description="Money moved to savings or another of your own accounts. Not income or a cost."
                    />
                </div>

                {isTransfer && (
                    <div className="space-y-2 text-sm text-ink-2">
                        <p>
                            It isn’t income or a cost, so it stays out of your expense breakdown, profit and VAT. The money is
                            still yours, just in a different pot.
                        </p>
                        <p className="text-ink-3">A transfer fee, if there is one, goes on its own line as a bank charge.</p>
                    </div>
                )}

                {!isTransfer && (<>
                <div className="space-y-3">
                    <Field label="Category" htmlFor="category-search">
                        {ids => (
                            <div className={controlFrame()}>
                                <span className="flex flex-none ps-3.5 text-ink-3" aria-hidden="true"><MagnifyingGlassIcon className="h-5 w-5" /></span>
                                <input
                                    id={ids.id}
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Search, or type a new one"
                                    className={cx(controlInput, 'ps-2')}
                                    autoFocus
                                />
                            </div>
                        )}
                    </Field>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {filteredCategories.map((cat, index) => {
                            const selected = category === cat.name;
                            return (
                                <div key={cat.id} draggable onDragStart={(e) => handleDragStart(e, index)} onDragEnter={(e) => handleDragEnter(e, index)} onDragEnd={handleDragEnd} onDragOver={(e) => e.preventDefault()} className="group relative">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCategory(cat.name);
                                            setSearchTerm('');
                                        }}
                                        className={cx(
                                            'flex min-h-[48px] w-full items-center gap-2.5 rounded-control border px-3 text-start text-sm font-semibold transition-colors duration-quick ease-out',
                                            selected ? 'border-accent bg-accent-soft text-accent-soft-ink shadow-[inset_0_0_0_1px_rgb(var(--c-accent))]' : 'border-line-strong bg-surface text-ink hover:bg-surface-2',
                                        )}
                                        aria-pressed={selected}
                                    >
                                        <span className={`h-3 w-3 flex-none rounded-full ${cat.color}`} aria-hidden="true" />
                                        <span className="min-w-0 flex-1 truncate">{cat.name}</span>
                                        {selected && <CheckIcon className="h-4 w-4 flex-none" />}
                                    </button>
                                    <span className="pointer-events-none absolute end-1 top-1 hidden cursor-grab text-ink-3 opacity-0 transition-opacity duration-quick group-hover:opacity-100 [@media(pointer:fine)]:block" aria-hidden="true"><Bars3Icon className="h-3.5 w-3.5" /></span>
                                </div>
                            );
                        })}
                    </div>

                    {filteredCategories.length === 0 && searchTerm.trim() !== '' && (
                        <button
                            type="button"
                            onClick={handleAddNewCategoryFromSearch}
                            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-control border border-dashed border-line-strong px-3 text-sm font-semibold text-accent-text transition-colors duration-quick ease-out hover:bg-surface-2"
                        >
                            <PlusIcon className="h-5 w-5" />
                            Add “{searchTerm.trim()}” as a new category
                        </button>
                    )}
                </div>

                <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold leading-5 text-ink" id="alloc-vat-label">VAT</span>
                        <button type="button" onClick={() => setVatMode(vatMode === 'toggle' ? 'manual' : 'toggle')} className="min-h-[40px] rounded-control text-sm font-semibold text-accent-text underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-[48px]">
                            {vatMode === 'toggle' ? 'Type the VAT amount' : 'Use 0% / 20%'}
                        </button>
                    </div>
                    {isIncome && <Alert tone="warning">VAT on money in is paid to HMRC.</Alert>}
                    {vatMode === 'toggle' ? (
                        <Segmented
                            ariaLabel="VAT rate"
                            full
                            value={String(vatRate) === '20' ? '20' : '0'}
                            onChange={v => setVatRate(v === '20' ? 20 : 0)}
                            options={[{ value: '0', label: '0%' }, { value: '20', label: '20%' }]}
                        />
                    ) : (
                        <CurrencyInput id="manualVat" value={manualVat} onChange={e => setManualVat(e.target.value)} placeholder="VAT amount" aria-labelledby="alloc-vat-label" />
                    )}
                </div>
                </>)}
            </div>
            <footer className="sticky bottom-0 z-sticky mt-auto border-t border-line bg-surface px-4 py-3 sm:px-5">
                <Button block onClick={handleUpdate}>{isTransfer ? 'Save as transfer' : isIncome ? 'Save money in' : 'Save expense'}</Button>
            </footer>
        </>
    );
};

export default CategoryAllocator;
