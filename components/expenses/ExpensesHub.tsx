
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Receipt, StatementTransaction, Supplier, FinancialAccount } from '../../types';
import ReceiptManager from './ReceiptManager';
import StatementReconciler from './StatementReconciler';
import PayablesManager from './PayablesManager';
import { ArrowUpTrayIcon, TrashIcon, DocumentTextIcon, PlusIcon, XMarkIcon } from '../icons';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { toYYYYMMDD } from '../../utils/helpers';
import UkDateInput from '../common/UkDateInput';

interface ExpensesHubProps {
    allReceipts: Receipt[];
    transactions: StatementTransaction[];
    suppliers: Supplier[];
    onUpload: (file: File, account: FinancialAccount) => void;
}

const ExpensesHub = ({ allReceipts, transactions, suppliers, onUpload }: ExpensesHubProps) => {
    const { openModal, closeModal } = useUI();
    const { undoReconciliation, financialAccounts, deleteTransactions } = useData();
    const [activeTab, setActiveTab] = useState<string>('receipts');
    const [isUploadMenuOpen, setUploadMenuOpen] = useState(false);
    const uploadMenuRef = useRef<HTMLDivElement>(null);
    const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
    const bulkInputRef = useRef<HTMLInputElement>(null);
    
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [startDate, setStartDate] = useState(toYYYYMMDD(firstDayOfMonth));
    const [endDate, setEndDate] = useState(toYYYYMMDD(today));
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if(financialAccounts.length > 0) {
            setActiveTab('receipts');
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
    
    const setPeriod = (period: 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter') => {
        const today = new Date();
        let start, end;
    
        switch (period) {
            case 'this_month':
                start = new Date(today.getFullYear(), today.getMonth(), 1);
                end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case 'last_month':
                start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                end = new Date(today.getFullYear(), today.getMonth(), 0);
                break;
            case 'this_quarter':
                const quarter = Math.floor(today.getMonth() / 3);
                start = new Date(today.getFullYear(), quarter * 3, 1);
                end = new Date(today.getFullYear(), quarter * 3 + 3, 0);
                break;
            case 'last_quarter':
                const currentQuarter = Math.floor(today.getMonth() / 3);
                start = new Date(today.getFullYear(), (currentQuarter - 1) * 3, 1);
                end = new Date(today.getFullYear(), currentQuarter * 3, 0);
                break;
        }
        if (start && end) {
            setStartDate(toYYYYMMDD(start));
            setEndDate(toYYYYMMDD(end));
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

    const tabs = [
        { id: 'receipts', name: 'All Receipts' },
        { id: 'payables', name: 'Payables' },
        ...financialAccounts.map(acc => ({ id: acc.id, name: acc.name })),
    ];
    
    const activeAccount = financialAccounts.find(acc => acc.id === activeTab);

    const transactionsForActiveTab = filteredTransactions.filter(t => {
        if (!activeAccount) return false;
        return t.accountId === activeAccount.id || (!t.accountId && t.type === activeAccount.type);
    });

    const directPaymentReceipts = useMemo(() => filteredReceipts.filter(r => r.paymentType !== 'On Account'), [filteredReceipts]);
    const payableReceipts = useMemo(() => filteredReceipts.filter(r => r.paymentType === 'On Account' && r.status === 'Unpaid'), [filteredReceipts]);

    return (
        <div className="space-y-6">
             <input 
                type="file" 
                multiple 
                accept="image/*,application/pdf" 
                ref={bulkInputRef} 
                onChange={handleBulkUploadChange} 
                className="hidden" 
            />
             {selectedTxIds.length > 0 && activeAccount && (
                <div className="sticky top-0 md:top-24 z-30 bg-brand-900/90 backdrop-blur-md p-3 rounded-lg shadow-lg flex items-center justify-between animate-in fade-in-0 slide-in-from-top-2 duration-300 border border-brand-700/50">
                    <p className="text-sm font-semibold text-white pl-2">{selectedTxIds.length} transaction{selectedTxIds.length !== 1 ? 's' : ''} selected</p>
                    <div className="flex items-center gap-2">
                        <button onClick={handleClearSelection} className="px-3 py-1.5 text-xs font-medium text-brand-200 hover:text-white hover:bg-brand-800 rounded-md">Deselect All</button>
                        <button onClick={handleDeleteSelected} className="inline-flex items-center gap-x-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-md shadow-sm">
                           <TrashIcon className="h-4 w-4" /> Delete Selected
                        </button>
                    </div>
                </div>
            )}
             <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                 <div className="hidden sm:block flex-1" />
                 <div className="flex-shrink-0 w-full sm:w-auto flex flex-wrap sm:flex-nowrap items-stretch sm:items-center gap-2">
                    <button type="button" onClick={() => openModal('categoryManager')} className="flex-1 sm:flex-initial inline-flex justify-center items-center gap-x-2 rounded-md bg-gray-700 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-gray-600">
                        Categories
                    </button>
                    <button
                        type="button"
                        onClick={() => bulkInputRef.current?.click()}
                        className="flex-1 sm:flex-initial inline-flex justify-center items-center gap-x-2 rounded-md bg-purple-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-purple-500"
                    >
                        <DocumentTextIcon className="-ml-1 h-4 w-4 sm:h-5 sm:w-5" /> <span className="hidden sm:inline">Bulk Upload</span><span className="sm:hidden">Bulk</span>
                    </button>
                    <div className="relative flex-1 sm:flex-initial sm:w-56" ref={uploadMenuRef}>
                        <button
                            type="button"
                            onClick={() => setUploadMenuOpen(!isUploadMenuOpen)}
                            className="w-full justify-center inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-brand-500"
                        >
                            <ArrowUpTrayIcon className="-ml-1 h-4 w-4 sm:h-5 sm:w-5" /> <span className="hidden sm:inline">Upload Statement</span><span className="sm:hidden">Upload</span>
                        </button>
                        {isUploadMenuOpen && (
                            <div className="absolute right-0 mt-2 w-full origin-top-right rounded-md bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                                <div className="py-1">
                                    <div className="px-4 pt-2 pb-1 text-xs font-semibold text-gray-400 uppercase">Upload to:</div>
                                    {financialAccounts.map(acc => (
                                        <label key={acc.id} className="w-full text-left flex items-center px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer">
                                            <input type="file" accept=".csv,text/csv,application/vnd.ms-excel,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { handleFileChange(e, acc); setUploadMenuOpen(false); }} className="hidden" />
                                            {acc.name}
                                        </label>
                                    ))}
                                    {financialAccounts.length === 0 && (
                                        <p className="px-4 py-2 text-sm text-gray-400">No accounts configured. Please add one in Settings.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-4 bg-gray-800 rounded-lg shadow-md flex flex-col sm:flex-row items-center gap-4">
                 <div className="relative w-full sm:w-auto sm:flex-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" /></svg>
                    </div>
                    <input
                        type="search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full rounded-md border-0 bg-gray-700 py-2 pl-10 pr-3 text-white ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-500 sm:text-sm"
                        placeholder="Search description, vendor, amount..."
                    />
                </div>
                <div className="flex items-center gap-4 flex-wrap w-full sm:w-auto justify-end">
                    <div className="flex items-center gap-2">
                        <UkDateInput id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span className="text-gray-400">to</span>
                        <UkDateInput id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setPeriod('this_month')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">This Month</button>
                        <button onClick={() => setPeriod('last_month')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">Last Month</button>
                        <button onClick={() => setPeriod('this_quarter')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">This Quarter</button>
                        <button onClick={() => setPeriod('last_quarter')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">Last Quarter</button>
                    </div>
                </div>
            </div>

            <div className="w-full sm:w-auto overflow-x-auto">
                 <div className="border-b border-gray-700">
                    <nav className="-mb-px flex space-x-4 sm:space-x-8" aria-label="Tabs">
                        {tabs.map((tab) => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`${tab.id === activeTab ? 'border-brand-500 text-brand-400' : 'border-transparent text-gray-400 hover:border-gray-500 hover:text-gray-300'} group inline-flex items-center whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium`}>
                                <span>{tab.name}</span>
                            </button>
                        ))}
                    </nav>
                 </div>
            </div>

            <div className="mt-2">
                {activeTab === 'receipts' && <ReceiptManager receipts={directPaymentReceipts} hasActiveFilters={hasActiveFilters} />}
                {activeTab === 'payables' && <PayablesManager receipts={payableReceipts} suppliers={suppliers} hasActiveFilters={hasActiveFilters} />}
                {activeAccount && (
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
            </div>
        </div>
    );
};

export default ExpensesHub;
