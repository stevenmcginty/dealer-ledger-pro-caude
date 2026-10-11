import React, { useState, useMemo } from 'react';
import { StatementTransaction, StatementTransactionUpdate, SalesDocument, MiscInvoice, PaymentMethod, Payment, JobInvoice } from '../../types';
import { XMarkIcon } from '../icons';
import { formatCurrency, formatDate, isLikelyOwnAccountTransfer } from '../../utils/helpers';
import CurrencyInput from '../common/CurrencyInput';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { useToast, Button, IconButton, Input, Badge, Segmented, Switch } from '../ui';

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

    const lineSummary = (
        <div className="rounded-card border border-line bg-surface-2 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
                <p className="num text-sm text-ink-3">{formatDate(transaction.date)}</p>
                <p className="num text-xl font-bold text-success">+{formatCurrency(transaction.amount)}</p>
            </div>
            <p className="mt-1 truncate text-ink">{transaction.description}</p>
        </div>
    );

    const renderMatchView = () => (
        <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
                {lineSummary}
                <div>
                    <h3 className="mb-2 text-base font-bold text-ink">Which invoice did this pay?</h3>
                    <div className="-me-2 max-h-80 space-y-2 overflow-y-auto pe-2">
                        {receivables.length > 0 ? receivables.map(item => {
                            const isSelected = selectedReceivable?.id === item.id;
                            const isSuggested = Math.abs(transactionAmount - item.amountDue) < 0.05;
                            return (
                                <button type="button" key={`${item.type}-${item.id}`} aria-pressed={isSelected} onClick={() => setSelectedReceivable(item)}
                                    className={`block min-h-[56px] w-full rounded-control border p-3 text-start transition-colors duration-quick ease-out ${isSelected ? 'border-accent bg-accent-soft' : isSuggested ? 'border-warning bg-surface hover:bg-surface-2' : 'border-line-strong bg-surface hover:bg-surface-2'}`}>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <p className="min-w-0 truncate font-semibold text-ink">{item.customerName}</p>
                                        <p className="num flex-none font-bold text-ink">{formatCurrency(item.amountDue)}</p>
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-3">
                                        <span className="min-w-0 truncate">{item.details}</span>
                                        <span className="flex items-center gap-2">
                                            {isSuggested && <Badge variant="warning" size="sm" dot>Same amount</Badge>}
                                            <span className="num">{formatDate(item.date)}</span>
                                        </span>
                                    </div>
                                </button>
                            );
                        }) : (
                            <p className="py-6 text-center text-ink-3">No unpaid invoices to match. Choose a category instead, or make a new invoice.</p>
                        )}
                    </div>
                </div>
            </div>
            <footer className="grid flex-none grid-cols-1 gap-2 border-t border-line bg-surface p-4 sm:grid-cols-[1fr_1fr_auto]">
                <Button type="button" variant="secondary" onClick={() => setView('categorize')}>Choose a category</Button>
                <Button type="button" variant="secondary" onClick={handleCreateNewInvoice}>New invoice</Button>
                <Button onClick={handleReconcile} disabled={!selectedReceivable} loading={isSubmitting}>Match to invoice</Button>
            </footer>
        </>
    );

    const renderCategorizeView = () => (
         <>
            <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
                {lineSummary}

                {/* Transfer between own accounts (e.g. moving money between bank accounts) — not income */}
                <div className="rounded-card border border-line px-4 py-1">
                    <Switch
                        label="Transfer between own accounts"
                        description="Money from another of your own accounts. Not income."
                        checked={isTransfer}
                        onChange={e => setIsTransfer(e.target.checked)}
                    />
                </div>

                {isTransfer && (
                    <div className="space-y-2 rounded-card border border-line bg-surface-2 p-4">
                        <p className="text-sm leading-5 text-ink-2">
                            Use this for money moved between your own accounts, such as cash coming back from your
                            savings account, or moving funds between two business bank accounts. It is not income,
                            so it stays out of your turnover and VAT totals. The money is still yours, just in a
                            different pot.
                        </p>
                        <p className="text-sm leading-5 text-ink-3">
                            A transfer fee, if any, is reconciled on its own as a bank charge.
                        </p>
                    </div>
                )}

                {!isTransfer && (<>
                <div>
                    <p className="mb-2 text-sm font-semibold text-ink" id="income-category-label">Category</p>
                    <div role="group" aria-labelledby="income-category-label" className="grid grid-cols-2 gap-2">
                        {["Car Sale", "Part Sale", "Rent", 'Other'].map((cat) => {
                            const on = (isOther && cat === 'Other') || (!isOther && category === cat);
                            return (
                                <button
                                    key={cat} type="button" aria-pressed={on}
                                    onClick={() => { cat === 'Other' ? setIsOther(true) : setCategory(cat); if (cat !== 'Other') setIsOther(false); }}
                                    className={`min-h-[48px] rounded-control border px-4 text-sm font-semibold transition-colors duration-quick ease-out ${on ? 'border-accent bg-accent-soft text-accent-soft-ink' : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2'}`}
                                >{cat}</button>
                            );
                        })}
                    </div>
                </div>

                {isOther && (
                    <Input label="Category name" id="otherCategory" value={otherCategory} onChange={(e) => setOtherCategory(e.target.value)} placeholder="Refund" />
                )}

                <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-ink">VAT</p>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setVatMode(vatMode === 'toggle' ? 'manual' : 'toggle')}>{vatMode === 'toggle' ? 'Type the amount' : 'Pick a rate'}</Button>
                    </div>
                    {vatMode === 'toggle' ? (
                        <Segmented
                            full
                            ariaLabel="VAT rate"
                            value={vatRate === 20 ? '20' : vatRate === 0 ? '0' : ''}
                            onChange={v => setVatRate(v === '20' ? 20 : 0)}
                            options={[{ value: '0', label: '0%' }, { value: '20', label: '20%' }]}
                        />
                    ) : (
                        <CurrencyInput id="manualVat" value={manualVat} onChange={e => setManualVat(e.target.value)} placeholder="VAT amount" />
                    )}
                    <p className="mt-2 text-sm text-ink-3">VAT on income is paid to HMRC.</p>
                </div>
                </>)}
            </div>
             <footer className="sticky bottom-0 z-sticky flex gap-2 border-t border-line bg-surface p-4">
                <Button type="button" variant="secondary" onClick={() => setView('match')}>Back to matching</Button>
                <Button onClick={handleUpdate} className="flex-1">{isTransfer ? 'Save transfer' : 'Save income'}</Button>
             </footer>
        </>
    );

    return (
        <div className="flex h-full max-h-[90vh] w-full flex-col">
            <header className="flex items-center justify-between gap-3 border-b border-line py-2 pe-2 ps-4">
                <h2 className="text-lg font-bold text-ink">Match money in</h2>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={onClose} />
            </header>
            {view === 'match' ? renderMatchView() : renderCategorizeView()}
        </div>
    );
};

export default IncomeAllocatorModal;