import React, { useEffect, useRef, useState } from 'react';
import { NewStatementTransaction, ExpenseCategory } from '../../types';
import { useData } from '../../hooks/useData';
import { toYYYYMMDD } from '../../utils/helpers';
import UkDateInput from '../common/UkDateInput';
import CurrencyInput from '../common/CurrencyInput';
import InlineCategoryCombobox from './InlineCategoryCombobox';
import { useToast, Button, IconButton, Segmented, Field, Checkbox } from '../ui';
import { controlFrame, controlInput } from '../ui/cx';
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
        <div onKeyDown={onKeyDown} className="rounded-card border border-line-strong bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold text-ink">Add a transaction to {account.name}</h3>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={onClose} className="-me-2 -mt-1" />
            </div>

            <Segmented
                ariaLabel="Money in or out"
                value={direction}
                onChange={setDirection}
                options={[
                    { value: 'out', label: 'Money out (−)' },
                    { value: 'in', label: 'Money in (+)' },
                ]}
                full
                className="mb-4 sm:w-80"
            />

            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-12">
                <Field label="Date" htmlFor="add-tx-date" className="sm:col-span-3">
                    <UkDateInput id="add-tx-date" value={date} onChange={e => setDate(e.target.value)} />
                </Field>
                <Field label="Description" htmlFor="add-tx-desc" className="sm:col-span-5">
                    {ids => (
                        <div className={controlFrame()}>
                            <input id={ids.id} ref={descRef} type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Cash sale — AB12 CDE" className={controlInput} />
                        </div>
                    )}
                </Field>
                <Field label="Amount" htmlFor="add-tx-amount" className="sm:col-span-4">
                    <CurrencyInput id="add-tx-amount" value={amountStr} onChange={e => setAmountStr(e.target.value)} />
                </Field>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
                <Checkbox label="Transfer between own accounts" checked={isTransfer} onChange={e => setIsTransfer(e.target.checked)} />

                {!isTransfer && direction === 'out' && (
                    <>
                        <div className="flex w-52 flex-col gap-1.5">
                            <span className="text-sm font-semibold leading-5 text-ink">Category <span className="font-normal text-ink-3">(optional)</span></span>
                            <InlineCategoryCombobox categories={categories} value={category || undefined} recentFirst={[]} onSelect={setCategory} onAddCategory={onAddCategory} placeholder="Choose…" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <span className="text-sm font-semibold leading-5 text-ink">VAT</span>
                            <Segmented
                                ariaLabel="VAT rate"
                                value={String(vatRate) as '0' | '20'}
                                onChange={v => setVatRate(v === '20' ? 20 : 0)}
                                options={[{ value: '0', label: '0%' }, { value: '20', label: '20%' }]}
                            />
                        </div>
                    </>
                )}

                <div className="ms-auto flex items-center gap-3">
                    {justSaved && (
                        <span role="status" className="inline-flex items-center gap-1 text-sm font-semibold text-success">
                            <CheckCircleIcon className="h-5 w-5" /> Added
                        </span>
                    )}
                    <Button onClick={handleSave} disabled={!canSave} loading={isSaving}>Add</Button>
                </div>
            </div>

            <p className="mt-3 text-sm text-ink-3">
                {direction === 'in' && !isTransfer
                    ? 'Money in goes to the list below, where you pick what it was (car sale and so on).'
                    : 'Lines you add by hand are not matched against statement uploads, so don’t add a line that will also come in from the bank.'}
            </p>
        </div>
    );
};

export default AddTransactionRow;
