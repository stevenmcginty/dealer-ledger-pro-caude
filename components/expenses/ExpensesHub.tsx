import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Receipt, StatementTransaction, Supplier, FinancialAccount } from '../../types';
import ReceiptManager from './ReceiptManager';
import StatementReconciler from './StatementReconciler';
import PayablesManager from './PayablesManager';
import { ArrowUpTrayIcon, TrashIcon, CameraIcon, TagIcon, ChevronDownIcon, BanknotesIcon, CreditCardIcon, DocumentTextIcon } from '../icons';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { toYYYYMMDD } from '../../utils/helpers';
import { accountIdOfTx, accountsForTabs, accountsForUpload } from '../../utils/accountTransfers';
import UkDateInput from '../common/UkDateInput';
import { Button, Tabs, Search, EmptyState } from '../ui';
import { cx } from '../ui/cx';
import { Chip, eyebrowClass } from './ledgerUi';

type Period = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter';

const PERIODS: { id: Period; label: string }[] = [
    { id: 'this_month', label: 'This month' },
    { id: 'last_month', label: 'Last month' },
    { id: 'this_quarter', label: 'This quarter' },
    { id: 'last_quarter', label: 'Last quarter' },
];

// Same ranges the period buttons have always set; also used to show which one is on.
const periodRange = (period: Period): { start: string; end: string } | null => {
    const today = new Date();
    let start: Date | undefined;
    let end: Date | undefined;
    switch (period) {
        case 'this_month':
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
        case 'last_month':
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'this_quarter': {
            const quarter = Math.floor(today.getMonth() / 3);
            start = new Date(today.getFullYear(), quarter * 3, 1);
            end = new Date(today.getFullYear(), quarter * 3 + 3, 0);
            break;
        }
        case 'last_quarter': {
            const currentQuarter = Math.floor(today.getMonth() / 3);
            start = new Date(today.getFullYear(), (currentQuarter - 1) * 3, 1);
            end = new Date(today.getFullYear(), currentQuarter * 3, 0);
            break;
        }
    }
    return start && end ? { start: toYYYYMMDD(start), end: toYYYYMMDD(end) } : null;
};

/** No bank account exists yet, but the Bank section is open. */
const BANK_PLACEHOLDER = '__bank__';

interface ExpensesHubProps {
    allReceipts: Receipt[];
    transactions: StatementTransaction[];
    suppliers: Supplier[];
    onUpload: (file: File, account: FinancialAccount) => void;
}

const ExpensesHub = ({ allReceipts, transactions, suppliers, onUpload }: ExpensesHubProps) => {
    const { openModal, closeModal, setView } = useUI();
    const { undoReconciliation, financialAccounts, deleteTransactions } = useData();
    // /app/expenses?tab=bank (the Today "bank lines to check" row) opens the Bank section.
    const wantBankRef = useRef(new URLSearchParams(window.location.search).get('tab') === 'bank');
    const [activeTab, setActiveTab] = useState<string>(() => (wantBankRef.current ? BANK_PLACEHOLDER : 'receipts'));
    const [isUploadMenuOpen, setUploadMenuOpen] = useState(false);
    const uploadMenuRef = useRef<HTMLDivElement>(null);
    const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
    const bulkInputRef = useRef<HTMLInputElement>(null);
    // The bank account last looked at, so the Bank section reopens on it.
    const lastAccountRef = useRef<string | null>(null);

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [startDate, setStartDate] = useState(toYYYYMMDD(firstDayOfMonth));
    const [endDate, setEndDate] = useState(toYYYYMMDD(today));
    const [searchTerm, setSearchTerm] = useState('');
    const [showClosed, setShowClosed] = useState(false);

    useEffect(() => {
        if(financialAccounts.length > 0) {
            if (wantBankRef.current) {
                // Deep link: open the first bank account once the accounts are here.
                // (Cleared when the user leaves the Bank section, so a re-run stays put.)
                setActiveTab(accountsForTabs(financialAccounts, false)[0]?.id || BANK_PLACEHOLDER);
            } else {
                setActiveTab('receipts');
            }
        }
    }, [financialAccounts]);

    // Clear selection when changing tabs/accounts
    useEffect(() => {
        setSelectedTxIds([]);
    }, [activeTab]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, account: FinancialAccount) => {
        const file = e.target.files?.[0];
        if (file) onUpload(file, account);
        if(e.target) e.target.value = ''; // Reset input
    };
    
    const handleBulkUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            openModal('bulkReceiptWizard', { files: Array.from(files) });
        }
        if(e.target) e.target.value = '';
    };
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target as Node)) {
                setUploadMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleClearSelection = () => {
        setSelectedTxIds([]);
    };

    const handleSelectionChange = (txId: string, isSelected: boolean) => {
        setSelectedTxIds(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(txId);
            } else {
                newSet.delete(txId);
            }
            return Array.from(newSet);
        });
    };
    
    const handleDeleteSelected = () => {
        openModal('bulkDeleteConfirm', {
            count: selectedTxIds.length,
            itemType: selectedTxIds.length === 1 ? 'transaction' : 'transactions',
            onConfirm: async () => {
                await deleteTransactions(selectedTxIds);
                closeModal();
                setSelectedTxIds([]);
            }
        });
    };

    const handleAllocationClick = (transaction: StatementTransaction) => {
      if (transaction.amount < 0) { // This is an expense
          if (transaction.status === 'Reconciled') {
              const linkedReceipts = allReceipts.filter(r => r.reconciledByTxId === transaction.id);
              if (linkedReceipts.length > 0) {
                  // If a transaction is linked to one or more receipts, open the editor for the first one.
                  // This allows the user to view/edit the expense details and upload a file.
                  openModal('expense', linkedReceipts[0]);
                  return;
              }
              // If reconciled but no linked receipt (e.g., manual categorization), fall through to allocator.
          }
          
          if (transaction.status === 'Unreconciled') {
              const txDescLower = transaction.description.toLowerCase();
              let matchedSupplier: Supplier | undefined;

              for (const supplier of suppliers) {
                  const keys = [supplier.name, ...(supplier.reconciliationKeys || [])].map(k => k.toLowerCase()).filter(Boolean);
                  if (keys.some(key => txDescLower.includes(key))) {
                      matchedSupplier = supplier;
                      break;
                  }
              }

              if (matchedSupplier) {
                  const unpaidForVendor = allReceipts.filter(r => r.vendor === matchedSupplier!.name && r.status === 'Unpaid' && r.paymentType === 'On Account');
                  if (unpaidForVendor.length > 0) {
                      openModal('multiReconciler', { transaction, receipts: unpaidForVendor });
                      return;
                  }
              }
          }
          openModal('transactionAllocator', transaction);
      } else { // This is income
          openModal('incomeAllocator', transaction);
      }
    }
    
    const setPeriod = (period: Period) => {
        const range = periodRange(period);
        if (range) {
            setStartDate(range.start);
            setEndDate(range.end);
        }
    };

    const hasActiveFilters = useMemo(() => searchTerm.trim() !== '', [searchTerm]);

    const filteredTransactions = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        const lowerSearchTerm = searchTerm.toLowerCase();

        return transactions.filter(tx => {
            const txDate = new Date(tx.date);
            const dateMatch = txDate >= start && txDate <= end;
            if (!dateMatch) return false;

            if (hasActiveFilters) {
                return (
                    tx.description.toLowerCase().includes(lowerSearchTerm) ||
                    tx.category.toLowerCase().includes(lowerSearchTerm) ||
                    String(tx.amount).includes(lowerSearchTerm)
                );
            }
            return true;
        });
    }, [transactions, startDate, endDate, searchTerm, hasActiveFilters]);
    
    const filteredReceipts = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        const lowerSearchTerm = searchTerm.toLowerCase();

        return allReceipts.filter(r => {
            const rDate = new Date(r.date);
            const dateMatch = rDate >= start && rDate <= end;
            if (!dateMatch) return false;

            if (hasActiveFilters) {
                return (
                    r.vendor.toLowerCase().includes(lowerSearchTerm) ||
                    r.category.toLowerCase().includes(lowerSearchTerm) ||
                    String(r.amount).includes(lowerSearchTerm)
                );
            }
            return true;
        });
    }, [allReceipts, startDate, endDate, searchTerm, hasActiveFilters]);

    const closedCount = financialAccounts.filter(acc => acc.closed).length;
    const uploadAccounts = accountsForUpload(financialAccounts);
    const bankAccounts = accountsForTabs(financialAccounts, showClosed, activeTab);

    const activeAccount = financialAccounts.find(acc => acc.id === activeTab);
    const section: 'receipts' | 'payables' | 'bank' =
        activeTab === 'receipts' ? 'receipts' : activeTab === 'payables' ? 'payables' : 'bank';

    useEffect(() => {
        if (activeAccount) lastAccountRef.current = activeAccount.id;
    }, [activeAccount]);

    // Keep ?tab=bank in step with the section, so reload and Back reopen the same place.
    useEffect(() => {
        if (section !== 'bank') wantBankRef.current = false;
        const params = new URLSearchParams(window.location.search);
        if ((params.get('tab') === 'bank') === (section === 'bank')) return;
        if (section === 'bank') params.set('tab', 'bank'); else params.delete('tab');
        const search = params.toString();
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
    }, [section]);

    const transactionsForActiveTab = filteredTransactions.filter(t => {
        if (!activeAccount) return false;
        return accountIdOfTx(t, financialAccounts) === activeAccount.id;
    });

    const directPaymentReceipts = useMemo(() => filteredReceipts.filter(r => r.paymentType !== 'On Account'), [filteredReceipts]);
    const payableReceipts = useMemo(() => filteredReceipts.filter(r => r.paymentType === 'On Account' && r.status === 'Unpaid'), [filteredReceipts]);

    // Lines still to check in the chosen period, per account (shown as counts only).
    const toCheckByAccount = useMemo(() => {
        const counts = new Map<string, number>();
        filteredTransactions.forEach(t => {
            if (t.status !== 'Unreconciled') return;
            const id = accountIdOfTx(t, financialAccounts);
            if (id) counts.set(id, (counts.get(id) || 0) + 1);
        });
        return counts;
    }, [filteredTransactions, financialAccounts]);
    const bankToCheck = bankAccounts.reduce((n, a) => n + (toCheckByAccount.get(a.id) || 0), 0);

    const openBank = () => {
        const last = lastAccountRef.current;
        const target = last && bankAccounts.some(a => a.id === last) ? last : bankAccounts[0]?.id;
        setActiveTab(target || BANK_PLACEHOLDER);
    };

    const sectionTabs = [
        { id: 'receipts', label: 'Receipts', count: directPaymentReceipts.length || undefined },
        { id: 'payables', label: 'To pay', count: payableReceipts.length || undefined },
        { id: 'bank', label: 'Bank', count: bankToCheck || undefined },
    ];

    // One hidden picker serves every account in the Upload menu.
    const statementInputRef = useRef<HTMLInputElement>(null);
    const uploadTargetRef = useRef<FinancialAccount | null>(null);
    const pickStatementFor = (acc: FinancialAccount) => {
        uploadTargetRef.current = acc;
        setUploadMenuOpen(false);
        statementInputRef.current?.click();
    };

    const activePeriod = PERIODS.find(p => {
        const r = periodRange(p.id);
        return r && r.start === startDate && r.end === endDate;
    })?.id;

    const categoriesButton = (
        <>
            <Button variant="ghost" icon={<TagIcon />} onClick={() => openModal('categoryManager')} className="hidden sm:inline-flex">
                Categories
            </Button>
            <button
                type="button"
                onClick={() => openModal('categoryManager')}
                aria-label="Categories"
                title="Categories"
                className="grid h-12 w-12 flex-none place-items-center rounded-control text-ink-2 transition-colors duration-quick ease-out hover:bg-surface-2 hover:text-ink active:bg-surface-3 sm:hidden [&_svg]:h-6 [&_svg]:w-6"
            >
                <TagIcon />
            </button>
        </>
    );

    return (
        <div className="space-y-4">
            <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                ref={bulkInputRef}
                onChange={handleBulkUploadChange}
                className="hidden"
            />
            <input
                type="file"
                ref={statementInputRef}
                accept=".csv,text/csv,application/vnd.ms-excel,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => { if (uploadTargetRef.current) handleFileChange(e, uploadTargetRef.current); }}
                className="hidden"
            />

            {/* Receipts · To pay · Bank. The bank is its own screen here, on the same /expenses URL. */}
            <Tabs
                tabs={sectionTabs}
                activeTab={section}
                onChange={id => (id === 'bank' ? openBank() : setActiveTab(id))}
                ariaLabel="Expenses sections"
            />

            {section === 'bank' ? (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 space-y-2">
                        {bankAccounts.length > 0 && (
                            <>
                                <p className={eyebrowClass}>Account</p>
                                <Tabs
                                    variant="pills"
                                    tabs={bankAccounts.map(acc => ({
                                        id: acc.id,
                                        label: acc.closed ? `${acc.name} (closed)` : acc.name,
                                        icon: acc.type === 'Credit Card' ? <CreditCardIcon /> : <BanknotesIcon />,
                                        count: toCheckByAccount.get(acc.id) || undefined,
                                    }))}
                                    activeTab={activeTab}
                                    onChange={setActiveTab}
                                    ariaLabel="Bank and card accounts"
                                />
                            </>
                        )}
                        {closedCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowClosed(s => !s)}
                                className="block min-h-[40px] rounded-control text-sm font-semibold text-accent-text underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-[48px]"
                            >
                                {showClosed ? 'Hide closed accounts' : `Show closed accounts (${closedCount})`}
                            </button>
                        )}
                    </div>
                    <div className="flex flex-none items-center gap-2">
                        <div className="relative flex-1 lg:flex-none" ref={uploadMenuRef}>
                            <Button
                                block
                                icon={<ArrowUpTrayIcon />}
                                iconEnd={<ChevronDownIcon />}
                                aria-haspopup="menu"
                                aria-expanded={isUploadMenuOpen}
                                onClick={() => setUploadMenuOpen(!isUploadMenuOpen)}
                            >
                                Upload statement
                            </Button>
                            {isUploadMenuOpen && (
                                <div role="menu" aria-label="Upload a statement to" className="absolute end-0 z-dropdown mt-2 w-full min-w-[16rem] overflow-hidden rounded-card border border-line bg-surface py-1 shadow-e2">
                                    <p className={cx(eyebrowClass, 'px-4 pb-1 pt-2')}>Upload to</p>
                                    {uploadAccounts.map(acc => (
                                        <button
                                            key={acc.id}
                                            type="button"
                                            role="menuitem"
                                            onClick={() => pickStatementFor(acc)}
                                            className="flex min-h-[48px] w-full items-center gap-3 px-4 text-start text-base text-ink transition-colors duration-quick ease-out hover:bg-surface-2 active:bg-surface-3 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-ink-3"
                                        >
                                            {acc.type === 'Credit Card' ? <CreditCardIcon /> : <BanknotesIcon />}
                                            <span className="min-w-0 flex-1 truncate">{acc.name}</span>
                                        </button>
                                    ))}
                                    {uploadAccounts.length === 0 && (
                                        <p className="px-4 py-3 text-sm text-ink-3">No accounts yet. Add one in Settings.</p>
                                    )}
                                </div>
                            )}
                        </div>
                        {categoriesButton}
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-2">
                    <Button icon={<CameraIcon />} onClick={() => openModal('expense')} className="flex-1 sm:flex-none">
                        Add expense
                    </Button>
                    <Button variant="secondary" icon={<DocumentTextIcon />} onClick={() => bulkInputRef.current?.click()}>
                        Add many
                    </Button>
                    <span className="hidden flex-1 sm:block" />
                    {categoriesButton}
                </div>
            )}

            {/* Search and period: one quiet strip between hairlines, no card. */}
            <div className="flex flex-col gap-3 border-y border-line py-3 2xl:flex-row 2xl:items-center">
                <Search
                    value={searchTerm}
                    onChange={setSearchTerm}
                    label={section === 'bank' ? 'Search bank lines' : 'Search expenses'}
                    placeholder={section === 'bank' ? 'Search description, category, amount' : 'Search supplier, category, amount'}
                    className="2xl:w-80 2xl:flex-none"
                />
                <div className="flex flex-wrap items-center gap-3 2xl:flex-1">
                    <div className="flex max-w-full gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Period">
                        {PERIODS.map(p => (
                            <Chip key={p.id} active={activePeriod === p.id} onClick={() => setPeriod(p.id)}>{p.label}</Chip>
                        ))}
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 md:ms-auto md:flex md:w-auto md:items-center">
                        <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-center md:gap-2">
                            <label htmlFor="start-date" className="text-sm font-semibold text-ink-3">From</label>
                            <UkDateInput id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="min-w-0 md:w-44" />
                        </div>
                        <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-center md:gap-2">
                            <label htmlFor="end-date" className="text-sm font-semibold text-ink-3">To</label>
                            <UkDateInput id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="min-w-0 md:w-44" />
                        </div>
                    </div>
                </div>
            </div>

            {selectedTxIds.length > 0 && activeAccount && (
                <div className="sticky top-0 z-sticky flex items-center justify-between gap-3 rounded-card border border-line-strong bg-surface py-1.5 pe-1.5 ps-4 shadow-e1">
                    <p className="text-sm font-semibold text-ink">
                        <span className="num">{selectedTxIds.length}</span> line{selectedTxIds.length !== 1 ? 's' : ''} selected
                    </p>
                    <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={handleClearSelection}>Clear</Button>
                        <Button size="sm" variant="danger" icon={<TrashIcon />} onClick={handleDeleteSelected}>
                            Delete {selectedTxIds.length === 1 ? 'line' : `${selectedTxIds.length} lines`}
                        </Button>
                    </div>
                </div>
            )}

            <div>
                {section === 'receipts' && <ReceiptManager receipts={directPaymentReceipts} hasActiveFilters={hasActiveFilters} />}
                {section === 'payables' && <PayablesManager receipts={payableReceipts} suppliers={suppliers} hasActiveFilters={hasActiveFilters} />}
                {section === 'bank' && activeAccount && (
                    <StatementReconciler
                        type={activeAccount.type}
                        accountName={activeAccount.name}
                        accountId={activeAccount.id}
                        transactions={transactionsForActiveTab}
                        receipts={allReceipts}
                        onEdit={handleAllocationClick}
                        onUndo={undoReconciliation}
                        isSelectionMode={true}
                        selectedTxIds={selectedTxIds}
                        onSelectionChange={handleSelectionChange}
                        hasActiveFilters={hasActiveFilters}
                    />
                )}
                {section === 'bank' && !activeAccount && (
                    <EmptyState
                        className="rounded-card border border-line bg-surface"
                        icon={<BanknotesIcon />}
                        title="No bank accounts yet"
                        description="Add your bank and card accounts in Settings. Then upload a statement here and tick off each line."
                        actionLabel="Open Settings"
                        onAction={() => setView('settings')}
                    />
                )}
            </div>
        </div>
    );
};

export default ExpensesHub;
