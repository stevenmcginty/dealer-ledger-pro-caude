
import React, { useState, useMemo } from 'react';
import { StatementTransaction, Receipt, StatementTransactionUpdate, Vehicle, ExpenseCategory, PaymentMethod, Payment } from '../../types';
import { BanknotesIcon, CreditCardIcon, CheckCircleIcon, SparklesIcon, EditIcon, UndoIcon, CarIcon, TagIcon, DocumentTextIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import Spinner from '../common/Spinner';
import * as dataService from '../../services/dataService';
import * as ai from '../../utils/ai';
import { useData } from '../../hooks/useData';

type AiSuggestion = { category: string } | { match: { vehicle?: Vehicle, receipts?: Receipt[] } };

interface StatementReconcilerProps {
    type: 'Bank' | 'Credit Card';
    accountName: string;
    transactions: StatementTransaction[];
    receipts: Receipt[];
    onEdit: (transaction: StatementTransaction) => void;
    onUndo: (transaction: StatementTransaction) => void;
    isSelectionMode?: boolean;
    selectedTxIds?: string[];
    onSelectionChange?: (txId: string, isSelected: boolean) => void;
    hasActiveFilters: boolean;
}

const getKeywordSuggestion = (description: string, categories: ExpenseCategory[]): string | null => {
    const descLower = description.toLowerCase();
    const keywordCategories: Record<string, string> = {
        'shell': 'Fuel', 'bp': 'Fuel', 'esso': 'Fuel', 'texaco': 'Fuel', 'total': 'Fuel', 'jet': 'Fuel', 'm6 toll': 'Transport', 'petrol': 'Fuel', 'diesel': 'Fuel', 'applegreen': 'Fuel', 'circle k': 'Fuel', 'gulf': 'Fuel',
        'bca': 'Auction Fees', 'manheim': 'Auction Fees', 'synetiq': 'Auction Fees', 'copart': 'Auction Fees', 'british car auctions': 'Auction Fees', 'astolus': 'Auction Fees', 'g3': 'Auction Fees',
        'dvla': 'Transport', 'post office': 'Transport', 'parking': 'Transport', 'train': 'Transport', 'uber': 'Transport', 'ringgo': 'Transport', 'paybyphone': 'Transport', 'apcoa': 'Transport',
        'halfords': 'Repairs', 'euro car parts': 'Repairs', 'gsf': 'Repairs', 'screwfix': 'Repairs', 'toolstation': 'Repairs', 'garage': 'Repairs', 'tyres': 'Repairs', 'kwik fit': 'Repairs', 'national tyres': 'Repairs', 'autos': 'Repairs',
        'insurance': 'Insurance', 'lv': 'Insurance', 'admiral': 'Insurance', 'hastings': 'Insurance', 'direct line': 'Insurance', 'aviva': 'Insurance', 'axa': 'Insurance',
        'adobe': 'Subscriptions', 'netflix': 'Subscriptions', 'google': 'Subscriptions', 'xero': 'Subscriptions', 'quickbooks': 'Subscriptions', 'autotrader': 'Advertising', 'ebay': 'Repairs', 'amazon': 'Repairs', 'motors': 'Advertising', 'cargurus': 'Advertising',
        'card payment': 'Credit Card Payment', 'payment received': 'Credit Card Payment', 'monthly fee': 'Bank Fees', 'bank charges': 'Bank Fees',
        'accountant': 'Accountant', 'accountancy': 'Accountant', 'cpa': 'Accountant', 'bookkeeping': 'Accountant',
    };

    for (const [key, catName] of Object.entries(keywordCategories)) {
        if (descLower.includes(key)) {
            // Verify category exists in user's list to avoid suggesting deleted categories
            // Or if it's a known standard category that might be created on the fly
            if (categories.some(c => c.name === catName)) return catName;
        }
    }
    return null;
};

const StatementReconciler = ({ type, accountName, transactions, receipts, onEdit, onUndo, isSelectionMode = false, selectedTxIds = [], onSelectionChange = () => {}, hasActiveFilters }: StatementReconcilerProps) => {
    const { 
        expenseCategories, updateTransaction, vehicles, reconcileTransactionFromSuggestion, 
        transactions: allTransactions, salesDocs, miscInvoices, jobInvoices,
        reconcileSalePayment, reconcileMiscInvoicePayment, reconcileJobInvoicePayment
    } = useData();
    
    const [showReconciled, setShowReconciled] = useState(false);
    const [suggestingForTxId, setSuggestingForTxId] = useState<string | null>(null);
    // We keep aiSuggestions only for manual overrides/explicit requests
    const [manualAiSuggestions, setManualAiSuggestions] = useState<Map<string, AiSuggestion | null>>(new Map());
    const [vatSelections, setVatSelections] = useState<Record<string, number>>({});
    
    // Auto-calculate matches (Vehicles/Receipts/Income)
    const heuristicSuggestions = useMemo(() => 
        dataService.getReconciliationSuggestions(transactions, receipts, vehicles, salesDocs, miscInvoices, jobInvoices), 
        [transactions, receipts, vehicles, salesDocs, miscInvoices, jobInvoices]
    );

    // Calculate VAT stats per category from history to determine if a category typically attracts VAT
    const categoryVatStats = useMemo(() => {
        const stats = new Map<string, { total: number, withVat: number }>();
        allTransactions.forEach(tx => {
            if (tx.status === 'Reconciled' && tx.category && tx.category !== 'Other' && tx.amount < 0) {
                const current = stats.get(tx.category) || { total: 0, withVat: 0 };
                current.total++;
                // We consider it a VAT transaction if there is a rate or an amount recorded
                if ((tx.vatRate && tx.vatRate > 0) || (tx.vatAmount && tx.vatAmount > 0)) {
                    current.withVat++;
                }
                stats.set(tx.category, current);
            }
        });
        return stats;
    }, [allTransactions]);

    // Create a history lookup map for instant category learning
    // This maps a description string to the most recently used category for that description
    const historyMap = useMemo(() => {
        const map = new Map<string, string>();
        // Process in chronological order so later transactions overwrite earlier ones
        const sortedHistory = [...allTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        sortedHistory.forEach(tx => {
            if (tx.status === 'Reconciled' && tx.category && tx.category !== 'Other') {
                // Normalize description to improve matching hits
                const cleanDesc = tx.description.trim().toLowerCase();
                map.set(cleanDesc, tx.category);
            }
        });
        return map;
    }, [allTransactions]);

    // Create a history lookup map for VAT rates based on vendor/description
    const vatHistoryMap = useMemo(() => {
        const map = new Map<string, number>();
        const sortedHistory = [...allTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        sortedHistory.forEach(tx => {
            if (tx.status === 'Reconciled' && tx.amount < 0) {
                const cleanDesc = tx.description.trim().toLowerCase();
                let rate = tx.vatRate || 0;
                // If rate is 0 but amount implies 20%, infer it (tolerance for rounding)
                if (rate === 0 && tx.vatAmount && tx.amount) {
                     const ratio = Math.abs(tx.vatAmount) / Math.abs(tx.amount);
                     // 20% VAT on Gross is ~0.1666 (1/6)
                     if (Math.abs(ratio - (1/6)) < 0.02) rate = 20;
                }
                map.set(cleanDesc, rate);
            }
        });
        return map;
    }, [allTransactions]);

    const getAutoSuggestion = (tx: StatementTransaction) => {
        // 1. High Confidence Data Match (Vehicle/Receipt/Income)
        const match = heuristicSuggestions.get(tx.id);
        if (match) {
            return { type: 'match', data: match };
        }

        // 2. Historical Match (Dynamic Learning)
        const cleanDesc = tx.description.trim().toLowerCase();
        if (historyMap.has(cleanDesc)) {
            return { type: 'category', category: historyMap.get(cleanDesc)! };
        }

        // 3. Keyword Heuristic
        const keywordCat = getKeywordSuggestion(tx.description, expenseCategories);
        if (keywordCat) {
            return { type: 'category', category: keywordCat };
        }

        return null;
    };

    const getEffectiveVatRate = (tx: StatementTransaction, suggestedCategory?: string): number => {
        // 1. User Override
        if (vatSelections[tx.id] !== undefined) return vatSelections[tx.id];

        // 2. Description History (Vendor prediction)
        const cleanDesc = tx.description.trim().toLowerCase();
        if (vatHistoryMap.has(cleanDesc)) return vatHistoryMap.get(cleanDesc)!;

        // 3. Category Prediction (if available)
        if (suggestedCategory) {
             const stat = categoryVatStats.get(suggestedCategory);
             if (stat && stat.total > 0) {
                 if ((stat.withVat / stat.total) > 0.85) return 20;
             } else {
                 const standardVatCategories = ['Fuel', 'Repairs', 'Auction Fees', 'Transport', 'Subscriptions', 'Part Purchase', 'Tyres', 'Advertising', 'Garage Consumables', 'Accountant'];
                 if (standardVatCategories.includes(suggestedCategory)) return 20;
             }
        }
        
        return 0;
    };

    const toggleVatRate = (tx: StatementTransaction, currentRate: number) => {
        const newRate = currentRate === 20 ? 0 : 20;
        setVatSelections(prev => ({...prev, [tx.id]: newRate}));
    };

    const handleAiSmartSuggest = async (tx: StatementTransaction) => {
        setSuggestingForTxId(tx.id);
        setManualAiSuggestions(prev => new Map(prev).set(tx.id, null));

        try {
            const categoryNames = expenseCategories.map(c => c.name);
            const unreconciledReceipts = receipts.filter(r => r.status === 'Unpaid');
            const result = await ai.getSmartReconciliationSuggestion(tx, unreconciledReceipts, categoryNames, vehicles, allTransactions);

            if (result.match) {
                const matchedVehicle = vehicles.find(v => v.id === result.match!.vehicleId);
                const matchedReceipts = receipts.filter(r => result.match!.receiptIds?.includes(r.id));
                setManualAiSuggestions(prev => new Map(prev).set(tx.id, { match: { vehicle: matchedVehicle, receipts: matchedReceipts } }));

            } else if (result.suggestion?.category) {
                setManualAiSuggestions(prev => new Map(prev).set(tx.id, { category: result.suggestion!.category }));
            } else {
                 setManualAiSuggestions(prev => new Map(prev).set(tx.id, { category: 'Other' }));
            }

        } catch (error) {
            console.error("AI smart suggestion failed:", error);
            setManualAiSuggestions(prev => new Map(prev).set(tx.id, { category: 'Error' }));
        } finally {
            setSuggestingForTxId(null);
        }
    };

    const handleAcceptSuggestion = async (txId: string, suggestion: { vehicleId?: string; receiptIds?: string[] }) => {
        await reconcileTransactionFromSuggestion(txId, suggestion);
        setManualAiSuggestions(prev => {
            const newMap = new Map(prev);
            newMap.delete(txId);
            return newMap;
        });
    };
    
    const handleAcceptIncomeSuggestion = async (tx: StatementTransaction, match: dataService.HeuristicSuggestion) => {
        const payment: Payment = {
            method: (tx.method as PaymentMethod) || 'Bank Transfer',
            amount: tx.amount,
            notes: `Auto-matched from bank statement: ${tx.description}`
        };

        if (match.salesDocId) {
            await reconcileSalePayment(tx.id, match.salesDocId, payment);
        } else if (match.jobInvoiceId) {
            await reconcileJobInvoicePayment(tx.id, match.jobInvoiceId, payment);
        } else if (match.miscInvoiceId) {
            await reconcileMiscInvoicePayment(tx.id, match.miscInvoiceId);
        }
    };
    
    const handleAcceptCategorySuggestion = async (txId: string, category: string, amount: number, vatRateOverride?: number) => {
        let vatRate = vatRateOverride ?? 0;
        let vatAmount = 0;
        
        if (amount < 0 && vatRate > 0) {
            // Calculate inclusive VAT (e.g. 20% rate means VAT is 1/6 of gross)
            vatAmount = Math.abs(amount) * (vatRate / (100 + vatRate));
        }
        
        const updates: StatementTransactionUpdate = { 
            category, 
            vatRate, 
            vatAmount, 
            status: 'Reconciled' 
        };
        await updateTransaction(txId, updates);
        setManualAiSuggestions(prev => { const newMap = new Map(prev); newMap.delete(txId); return newMap; });
        // Clear selection state
        setVatSelections(prev => { const newMap = {...prev}; delete newMap[txId]; return newMap; });
    };

    const unreconciledTxs = transactions.filter(tx => tx.status === 'Unreconciled');
    const reconciledTxs = transactions.filter(tx => tx.status === 'Reconciled');
    const transactionsToShow = showReconciled ? reconciledTxs : unreconciledTxs;

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        transactionsToShow.forEach(tx => {
            const isCurrentlySelected = selectedTxIds.includes(tx.id);
            if ((isChecked && !isCurrentlySelected) || (!isChecked && isCurrentlySelected)) {
                onSelectionChange(tx.id, isChecked);
            }
        });
    };
    
    const isAllSelected = transactionsToShow.length > 0 && transactionsToShow.every(tx => selectedTxIds.includes(tx.id));

    const Icon = type === 'Bank' ? BanknotesIcon : CreditCardIcon;
    
    const Toggle = () => (
        <div className="flex items-center space-x-2 rounded-lg bg-gray-700/60 p-1 mb-4">
            <button onClick={() => setShowReconciled(false)} className={`flex-1 justify-center gap-x-2 inline-flex items-center py-2 text-sm font-semibold rounded-md transition-colors ${!showReconciled ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>To Reconcile <span className="bg-yellow-400/20 text-yellow-300 text-xs font-bold px-2 py-0.5 rounded-full">{unreconciledTxs.length}</span></button>
            <button onClick={() => setShowReconciled(true)} className={`flex-1 justify-center gap-x-2 inline-flex items-center py-2 text-sm font-semibold rounded-md transition-colors ${showReconciled ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Reconciled <span className="bg-green-400/20 text-green-300 text-xs font-bold px-2 py-0.5 rounded-full">{reconciledTxs.length}</span></button>
        </div>
    );

    const EmptyState = () => (
        <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
             {hasActiveFilters ? (
                 <><Icon className="h-12 w-12 text-gray-500 mx-auto" /><h3 className="mt-4 text-lg font-medium text-white">No Transactions Match Filter</h3><p className="mt-1 text-sm text-gray-400">Try adjusting your search or date range.</p></>
             ) : showReconciled ? (
                 <><Icon className="h-12 w-12 text-gray-500 mx-auto" /><h3 className="mt-4 text-lg font-medium text-white">No Reconciled Transactions</h3><p className="mt-1 text-sm text-gray-400">Categorize transactions in {accountName} to see them here.</p></>
             ) : ( unreconciledTxs.length === 0 && transactions.length > 0 ? (
                <><CheckCircleIcon className="h-12 w-12 text-green-400 mx-auto" /><h3 className="mt-4 text-lg font-medium text-white">All Caught Up!</h3><p className="mt-1 text-sm text-gray-400">No transactions left to reconcile in {accountName}.</p></>
                ) : (
                <><Icon className="h-12 w-12 text-gray-500 mx-auto" /><h3 className="mt-4 text-lg font-medium text-white">No Transactions</h3><p className="mt-1 text-sm text-gray-400">Upload your statement for {accountName} to get started.</p></>
                )
             )}
        </div>
    );
    
    // Renders the PURPLE suggestion button automatically
    const SuggestionCell = ({ tx }: { tx: StatementTransaction }) => {
        if (tx.status === 'Reconciled') return null;

        // Check for Manual AI result first
        const manualAiResult = manualAiSuggestions.get(tx.id);
        
        let activeSuggestion = null;

        // Priority 1: Manual AI Result (if user clicked 'Suggest' previously)
        if (manualAiResult) {
            if ('match' in manualAiResult) activeSuggestion = { type: 'match', data: manualAiResult.match };
            else if ('category' in manualAiResult && manualAiResult.category !== 'Error') activeSuggestion = { type: 'category', category: manualAiResult.category };
        } 
        
        // Priority 2: Auto Suggestion (Instant)
        if (!activeSuggestion) {
            const auto = getAutoSuggestion(tx);
            if (auto) activeSuggestion = auto;
        }

        // Render based on what we found
        if (activeSuggestion) {
            if (activeSuggestion.type === 'match') {
                const matchData = activeSuggestion.data as dataService.HeuristicSuggestion;
                let text = 'Match Found';
                let subtext = '';
                let handler = () => {};
                let icon = <SparklesIcon className="h-4 w-4" />;

                // Income Matches
                if (matchData.salesDocId) {
                    const doc = salesDocs.find(d => d.id === matchData.salesDocId);
                    const car = doc?.carDetails || vehicles.find(v => v.id === doc?.vehicleId);
                    const name = doc?.customerName?.split(' ')[0] || 'Customer';
                    const reg = car?.reg || doc?.invoiceNumber;
                    
                    text = `Match: ${reg}`;
                    subtext = `${name} (${matchData.details || 'Payment'})`;
                    
                    icon = <DocumentTextIcon className="h-4 w-4" />;
                    handler = () => handleAcceptIncomeSuggestion(tx, matchData);
                } else if (matchData.jobInvoiceId) {
                    const inv = jobInvoices.find(j => j.id === matchData.jobInvoiceId);
                    const name = inv?.customerDetails?.name?.split(' ')[0] || 'Customer';
                    text = `Match: Job ${inv?.invoiceNumber || ''}`;
                    subtext = `${name} (${matchData.details || 'Payment'})`;
                    icon = <DocumentTextIcon className="h-4 w-4" />;
                    handler = () => handleAcceptIncomeSuggestion(tx, matchData);
                } else if (matchData.miscInvoiceId) {
                    const inv = miscInvoices.find(m => m.id === matchData.miscInvoiceId);
                    const name = inv?.customerName?.split(' ')[0] || 'Customer';
                    text = `Match: Inv ${inv?.invoiceNumber || ''}`;
                    subtext = `${name} (${matchData.details || 'Payment'})`;
                    icon = <DocumentTextIcon className="h-4 w-4" />;
                    handler = () => handleAcceptIncomeSuggestion(tx, matchData);
                } 
                // Expense Matches
                else if (matchData.vehicleId) {
                    const v = vehicles.find(veh => veh.id === matchData.vehicleId);
                    text = `Match: ${v?.reg || 'Vehicle'}`;
                    icon = <CarIcon className="h-4 w-4" />;
                    handler = () => handleAcceptSuggestion(tx.id, { vehicleId: matchData.vehicleId, receiptIds: matchData.receiptIds });
                } else if (matchData.receiptIds) {
                    const rIds = matchData.receiptIds;
                    text = rIds.length > 1 ? `Match: ${rIds.length} Receipts` : 'Match: Receipt';
                    handler = () => handleAcceptSuggestion(tx.id, { receiptIds: rIds });
                }

                return (
                    <button onClick={handler} className="w-full flex flex-col items-center justify-center text-center px-3 py-1.5 rounded-md bg-purple-600 text-white hover:bg-purple-500 shadow-sm transition-all border border-purple-500 hover:border-purple-400">
                        <div className="flex items-center gap-1 text-xs font-semibold">
                            {icon} {text}
                        </div>
                        {subtext && <div className="text-[10px] opacity-90">{subtext}</div>}
                    </button>
                );
            }

            if (activeSuggestion.type === 'category') {
                const cat = (activeSuggestion as any).category;
                const effectiveVatRate = getEffectiveVatRate(tx, cat);
                return (
                    <button onClick={() => handleAcceptCategorySuggestion(tx.id, cat, tx.amount, effectiveVatRate)} className="w-full inline-flex items-center justify-center gap-x-2 text-xs font-semibold text-center px-3 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-500 shadow-sm transition-all border border-purple-500 hover:border-purple-400">
                        <TagIcon className="h-4 w-4" /> {cat}
                    </button>
                );
            }
        }

        // Fallback: Show small AI suggest icon if nothing found automatically
        return (
            <button onClick={() => handleAiSmartSuggest(tx)} disabled={suggestingForTxId === tx.id} className="w-full inline-flex items-center justify-center gap-x-2 text-xs font-medium text-center px-3 py-2 rounded-md bg-gray-700 text-purple-400 hover:text-white hover:bg-purple-600/20 border border-transparent hover:border-purple-500/50 transition-all disabled:opacity-50" title="Ask AI for a suggestion">
                {suggestingForTxId === tx.id ? <Spinner className="h-4 w-4" /> : <><SparklesIcon className="h-4 w-4" /> Ask AI</>}
            </button>
        );
    };

    return (
        <div>
            <Toggle />
            {transactionsToShow.length === 0 ? <EmptyState /> : (
                <>
                    <div className="hidden md:block overflow-x-auto bg-gray-800 rounded-lg shadow">
                        <table className="min-w-full">
                            <thead className="bg-gray-900/50">
                                <tr>
                                    {isSelectionMode && (
                                        <th scope="col" className="relative py-3.5 pl-4 pr-3 sm:pl-6 w-10">
                                            <input 
                                                type="checkbox"
                                                className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-400 bg-gray-700 text-brand-600 focus:ring-brand-500"
                                                checked={isAllSelected}
                                                onChange={handleSelectAll}
                                                aria-label="Select all transactions"
                                            />
                                        </th>
                                    )}
                                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6 w-24">Date</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Description</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white w-20">Type</th>
                                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white w-28">Amount</th>
                                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white w-32">Category</th>
                                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white w-24">{showReconciled ? 'VAT' : 'VAT Rate'}</th>
                                    {!showReconciled && <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-white w-48">Suggestion</th>}
                                    <th scope="col" className="px-3 py-3.5 text-center text-sm font-semibold text-white w-28">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/50">
                                {transactionsToShow.map(tx => {
                                    const isSelected = selectedTxIds.includes(tx.id);
                                    
                                    // Determine the effective VAT rate for display in unreconciled view
                                    const suggestion = getAutoSuggestion(tx);
                                    const suggestedCategory = suggestion && suggestion.type === 'category' ? (suggestion as any).category : undefined;
                                    const effectiveVatRate = getEffectiveVatRate(tx, suggestedCategory);

                                    return (
                                        <tr key={tx.id} className={`${isSelected ? 'bg-brand-900/50' : 'even:bg-gray-800/50'}`}>
                                            {isSelectionMode && (
                                                <td className="relative py-4 pl-4 pr-3 sm:pl-6">
                                                    <input
                                                        type="checkbox"
                                                        className="absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-400 bg-gray-700 text-brand-600 focus:ring-brand-500"
                                                        checked={isSelected}
                                                        onChange={(e) => onSelectionChange(tx.id, e.target.checked)}
                                                        aria-label={`Select transaction ${tx.description}`}
                                                    />
                                                </td>
                                            )}
                                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-xs text-white sm:pl-6">{formatDate(tx.date, { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                                            <td className="px-3 py-4 text-sm text-gray-300 max-w-xs truncate" title={tx.description}>{tx.description}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-xs text-gray-400">{tx.method || '-'}</td>
                                            <td className={`whitespace-nowrap px-3 py-4 text-sm text-right font-bold ${tx.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>{formatCurrency(tx.amount)}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-xs text-gray-300 truncate max-w-[120px]">{tx.category}</td>
                                            
                                            <td className="whitespace-nowrap px-3 py-4 text-xs text-right text-gray-400 align-middle">
                                                {!showReconciled && tx.amount < 0 ? (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); toggleVatRate(tx, effectiveVatRate); }}
                                                        className={`inline-flex items-center justify-center px-2 py-1 rounded text-xs font-bold w-12 transition-colors ${
                                                            effectiveVatRate === 20 
                                                            ? 'bg-blue-900 text-blue-300 ring-1 ring-blue-700 hover:bg-blue-800' 
                                                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                                                        }`}
                                                        title="Toggle predicted VAT Rate (0% or 20%)"
                                                    >
                                                        {effectiveVatRate}%
                                                    </button>
                                                ) : (
                                                    tx.vatAmount > 0 ? formatCurrency(tx.vatAmount) : '-'
                                                )}
                                            </td>
                                            
                                            {!showReconciled && (
                                                <td className="px-3 py-4 text-center align-middle">
                                                    <SuggestionCell tx={tx} />
                                                </td>
                                            )}

                                            <td className="whitespace-nowrap px-3 py-4 text-center align-middle">
                                                 {tx.status === 'Reconciled' ? (
                                                    <div className="flex items-center justify-center gap-x-2">
                                                        <button onClick={() => onEdit(tx)} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" title="Edit Transaction"><EditIcon className="h-4 w-4" /></button>
                                                        <button onClick={() => onUndo(tx)} className="p-1.5 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white" title="Undo Reconciliation"><UndoIcon className="h-4 w-4" /></button>
                                                    </div>
                                                ) : (
                                                    <button onClick={(e) => { e.stopPropagation(); onEdit(tx); }} className="inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-700 hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 shadow-sm">
                                                        Reconcile
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="md:hidden space-y-3">
                        {transactionsToShow.map(tx => {
                             const isIncome = tx.amount > 0;
                             const isSelected = selectedTxIds.includes(tx.id);
                             const suggestion = getAutoSuggestion(tx);
                             const suggestedCategory = suggestion && suggestion.type === 'category' ? (suggestion as any).category : undefined;
                             const effectiveVatRate = getEffectiveVatRate(tx, suggestedCategory);

                             return (
                             <div key={tx.id} className={`relative rounded-lg shadow-md transition-all ${isSelected ? 'bg-brand-900/50 ring-2 ring-brand-500' : 'bg-gray-800'}`}>
                                 {isSelectionMode && (
                                     <div className="absolute top-3 left-3 z-10">
                                        <input
                                            type="checkbox"
                                            className="h-5 w-5 rounded border-gray-400 bg-gray-900 text-brand-600 focus:ring-brand-500"
                                            checked={isSelected}
                                            onChange={(e) => onSelectionChange(tx.id, e.target.checked)}
                                            aria-label={`Select transaction ${tx.description}`}
                                        />
                                    </div>
                                )}
                                <div className={`p-4 space-y-2 ${isSelectionMode ? 'pl-10' : ''}`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 pr-2">
                                            <p className="text-xs text-gray-400">{formatDate(tx.date)}</p>
                                            <p className="text-sm text-white break-words mt-0.5">{tx.description}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`text-lg font-bold whitespace-nowrap ${isIncome ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(tx.amount)}</p>
                                            {!showReconciled && !isIncome ? (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); toggleVatRate(tx, effectiveVatRate); }}
                                                    className={`mt-1 inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold w-10 ${effectiveVatRate === 20 ? 'bg-blue-900 text-blue-300' : 'bg-gray-700 text-gray-400'}`}
                                                >
                                                    {effectiveVatRate}%
                                                </button>
                                            ) : (
                                                tx.vatAmount > 0 && <p className="text-xs text-gray-500">VAT: {formatCurrency(tx.vatAmount)}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-gray-700/50">
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tx.status === 'Reconciled' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>{tx.status}</span>
                                            <span className="text-xs text-gray-400">{tx.category}</span>
                                        </div>
                                    </div>
                                    
                                    {tx.status === 'Unreconciled' && (
                                        <div className="grid grid-cols-2 gap-3 mt-3">
                                            <div className="col-span-1">
                                                <SuggestionCell tx={tx} />
                                            </div>
                                            <div className="col-span-1">
                                                <button onClick={(e) => { e.stopPropagation(); onEdit(tx); }} className="w-full flex items-center justify-center px-3 py-2 border border-transparent text-xs font-medium rounded text-white bg-green-700 hover:bg-green-600 shadow-sm">
                                                    Manual Reconcile
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {tx.status === 'Reconciled' && (
                                        <div className="flex justify-end gap-3 mt-2">
                                            <button onClick={() => onEdit(tx)} className="text-gray-400 hover:text-white text-xs flex items-center gap-1"><EditIcon className="h-4 w-4" /> Edit</button>
                                            <button onClick={() => onUndo(tx)} className="text-gray-400 hover:text-white text-xs flex items-center gap-1"><UndoIcon className="h-4 w-4" /> Undo</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )})}
                    </div>
                </>
            )}
        </div>
    );
};

export default StatementReconciler;
