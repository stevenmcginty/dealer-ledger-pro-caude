
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StatementTransaction, Receipt, StatementTransactionUpdate, Vehicle, ExpenseCategory, PaymentMethod, Payment } from '../../types';
import { BanknotesIcon, CreditCardIcon, CheckCircleIcon, SparklesIcon, EditIcon, UndoIcon, CarIcon, TagIcon, DocumentTextIcon, PlusIcon, ArrowPathIcon, CheckIcon, ChevronDownIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { Button, IconButton, Tabs, EmptyState, StatusChip, DataTable, THead, TBody, Th, Tr, Td } from '../ui';
import { cx } from '../ui/cx';
import { Money, Kbd, RowCheck } from './ledgerUi';
import * as dataService from '../../services/dataService';
import * as ai from '../../utils/ai';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import InlineCategoryCombobox, { CategoryComboboxHandle } from './InlineCategoryCombobox';
import AddTransactionRow from './AddTransactionRow';
import { useReconcileQueueKeyboard } from '../../hooks/useReconcileQueueKeyboard';
import ReceiptThumb from '../common/ReceiptThumb';
import { isMatchableReceipt } from '../../utils/statementAutoMatch';
import { findTransferPartners, rankAutoSuggestion } from '../../utils/accountTransfers';

type AiSuggestion = { category: string } | { match: { vehicle?: Vehicle, receipts?: Receipt[] } };

// Income lines have no managed category list, so offer the common income types inline.
// 'Transfer' is a synthetic entry handled specially (own-account move, excluded from reports).
const INCOME_COMBO: Pick<ExpenseCategory, 'id' | 'name' | 'color'>[] = [
    { id: '__inc_car', name: 'Car Sale', color: 'bg-success' },
    { id: '__inc_part', name: 'Part Sale', color: 'bg-success' },
    { id: '__inc_rent', name: 'Rent', color: 'bg-info' },
    { id: '__transfer__', name: 'Transfer', color: 'bg-info' },
];

interface StatementReconcilerProps {
    type: 'Bank' | 'Credit Card';
    accountName: string;
    accountId?: string;
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

const StatementReconciler = ({ type, accountName, accountId, transactions, receipts, onEdit, onUndo, isSelectionMode = false, selectedTxIds = [], onSelectionChange = () => {}, hasActiveFilters }: StatementReconcilerProps) => {
    const {
        expenseCategories, updateTransaction, vehicles, reconcileTransactionFromSuggestion,
        transactions: allTransactions, salesDocs, miscInvoices, jobInvoices,
        reconcileSalePayment, reconcileMiscInvoicePayment, reconcileJobInvoicePayment,
        addExpenseCategory, financialAccounts
    } = useData();
    const { modal } = useUI();

    // Which queue is showing: lines to check, the ones we have a suggestion for, or the done ones.
    const [queue, setQueue] = useState<'check' | 'suggested' | 'done'>('check');
    const showReconciled = queue === 'done';
    // Phone/tablet cards: lines opened to show the category, VAT and Match controls.
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [suggestingForTxId, setSuggestingForTxId] = useState<string | null>(null);
    // We keep aiSuggestions only for manual overrides/explicit requests
    const [manualAiSuggestions, setManualAiSuggestions] = useState<Map<string, AiSuggestion | null>>(new Map());
    const [vatSelections, setVatSelections] = useState<Record<string, number>>({});

    // Inline / keyboard reconciliation state
    const [showAddRow, setShowAddRow] = useState(false);
    const [lastCommittedTxId, setLastCommittedTxId] = useState<string | null>(null);
    const [hasFinePointer, setHasFinePointer] = useState(false);
    const comboRefs = useRef<Map<string, CategoryComboboxHandle>>(new Map());

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        // Shortcuts work where the table shows (1280px and up, with a mouse).
        const mq = window.matchMedia('(min-width: 1280px) and (pointer: fine)');
        const update = () => setHasFinePointer(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    // Receipts with an attached file, keyed by the bank line they reconcile (display only).
    const receiptFilesByTx = useMemo(() => {
        const map = new Map<string, Receipt[]>();
        receipts.forEach(r => {
            if (!r.reconciledByTxId || !r.receiptUrl) return;
            const list = map.get(r.reconciledByTxId);
            if (list) list.push(r); else map.set(r.reconciledByTxId, [r]);
        });
        return map;
    }, [receipts]);

    const renderReceiptThumbs = (txId: string, size: 'sm' | 'md') => {
        const files = receiptFilesByTx.get(txId);
        if (!files) return null;
        const [first] = files;
        return (
            <span className="inline-flex shrink-0 items-center gap-1">
                <ReceiptThumb url={first.receiptUrl!} label={`${first.vendor} · ${formatDate(first.date)}`} size={size} />
                {files.length > 1 && <span className="text-xs font-semibold text-ink-3" title={`${files.length} receipts attached`}>+{files.length - 1}</span>}
            </span>
        );
    };

    // Auto-calculate matches (Vehicles/Receipts/Income)
    const heuristicSuggestions = useMemo(() =>
        dataService.getReconciliationSuggestions(transactions, receipts, vehicles, salesDocs, miscInvoices, jobInvoices),
        [transactions, receipts, vehicles, salesDocs, miscInvoices, jobInvoices]
    );

    // Same amount out of one own bank and into another within 3 days (see utils/accountTransfers).
    const transferPartners = useMemo(() => findTransferPartners(allTransactions, financialAccounts), [allTransactions, financialAccounts]);

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

    // Categories most-recently used on expenses, floated to the top of the inline picker.
    const recentCategoryNames = useMemo(() => {
        const sorted = [...allTransactions]
            .filter(t => t.status === 'Reconciled' && t.category && t.category !== 'Other' && t.amount < 0)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const seen = new Set<string>();
        const out: string[] = [];
        for (const t of sorted) {
            if (!seen.has(t.category)) { seen.add(t.category); out.push(t.category); }
            if (out.length >= 8) break;
        }
        return out;
    }, [allTransactions]);

    // Expense category options for the inline picker, with a synthetic 'Transfer' entry appended.
    const expenseComboCategories = useMemo(() => {
        const base = expenseCategories.map(c => ({ id: c.id, name: c.name, color: c.color }));
        if (expenseCategories.some(c => c.name === 'Transfer')) return base;
        return [...base, { id: '__transfer__', name: 'Transfer', color: 'bg-info' }];
    }, [expenseCategories]);

    const getAutoSuggestion = (tx: StatementTransaction) => {
        // 1. High Confidence Data Match (Vehicle/Receipt/Income) always wins.
        // 2. Money moved between own banks: the same amount leaves one and arrives in another.
        // 3. Historical Match (Dynamic Learning). 4. Keyword Heuristic.
        const pair = transferPartners.get(tx.id);
        return rankAutoSuggestion({
            match: heuristicSuggestions.get(tx.id),
            transferAccountName: pair ? (financialAccounts.find(a => a.id === pair.partnerAccountId)?.name || 'other account') : null,
            historyCategory: historyMap.get(tx.description.trim().toLowerCase()),
            keywordCategory: getKeywordSuggestion(tx.description, expenseCategories),
        });
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
            const unreconciledReceipts = receipts.filter(isMatchableReceipt);
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
        setLastCommittedTxId(txId);
        await reconcileTransactionFromSuggestion(txId, suggestion);
        setManualAiSuggestions(prev => {
            const newMap = new Map(prev);
            newMap.delete(txId);
            return newMap;
        });
    };

    const handleAcceptIncomeSuggestion = async (tx: StatementTransaction, match: dataService.HeuristicSuggestion) => {
        setLastCommittedTxId(tx.id);
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
        setLastCommittedTxId(txId);
        // A learned "Transfer" suggestion (a recurring own-account move) must be booked as a
        // transfer, not an expense — no VAT, and flagged so the reports exclude it.
        if (category === 'Transfer') {
            await updateTransaction(txId, { category: 'Transfer', vatRate: 0, vatAmount: 0, reconciliationType: 'transfer', status: 'Reconciled' });
            setManualAiSuggestions(prev => { const newMap = new Map(prev); newMap.delete(txId); return newMap; });
            setVatSelections(prev => { const newMap = {...prev}; delete newMap[txId]; return newMap; });
            return;
        }

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
    // A line has a suggestion when an AI answer or the instant auto-suggestion can place it.
    const hasSuggestion = (tx: StatementTransaction): boolean => {
        const manual = manualAiSuggestions.get(tx.id);
        if (manual && ('match' in manual || ('category' in manual && manual.category !== 'Error'))) return true;
        return !!getAutoSuggestion(tx);
    };
    const suggestedTxs = unreconciledTxs.filter(hasSuggestion);
    const transactionsToShow = showReconciled ? reconciledTxs : queue === 'suggested' ? suggestedTxs : unreconciledTxs;

    // The effective VAT rate to show on an unreconciled row (expense = predicted, income = user toggle).
    const getRowVatRate = (tx: StatementTransaction): number => {
        if (tx.amount < 0) {
            const suggestion = getAutoSuggestion(tx);
            const suggestedCategory = suggestion && suggestion.type === 'category' ? (suggestion as any).category : undefined;
            return getEffectiveVatRate(tx, suggestedCategory);
        }
        return vatSelections[tx.id] ?? (tx.vatRate || 0);
    };

    // Inline income categorize — mirrors IncomeAllocatorModal.handleUpdate (inclusive VAT, not a transfer).
    const commitIncomeInline = async (tx: StatementTransaction, category: string, rate: number) => {
        setLastCommittedTxId(tx.id);
        const vatAmount = rate === 20 ? Math.abs(tx.amount) / 6 : 0;
        await updateTransaction(tx.id, { category, vatRate: rate, vatAmount, status: 'Reconciled', reconciliationType: null });
        setManualAiSuggestions(prev => { const m = new Map(prev); m.delete(tx.id); return m; });
        setVatSelections(prev => { const m = { ...prev }; delete m[tx.id]; return m; });
    };

    const commitTransfer = (tx: StatementTransaction) => handleAcceptCategorySuggestion(tx.id, 'Transfer', tx.amount, 0);

    // Inline category pick from the combobox: routes to the correct report-safe commit path.
    const handleRowCategorySelect = (tx: StatementTransaction, name: string) => {
        if (name === 'Transfer') { commitTransfer(tx); return; }
        if (tx.amount < 0) handleAcceptCategorySuggestion(tx.id, name, tx.amount, getRowVatRate(tx));
        else commitIncomeInline(tx, name, getRowVatRate(tx));
    };

    // The handler the focused row's primary suggestion would run (for keyboard Enter). Matches are
    // routed through the proper reconcile* cascades; plain categories through the inline path.
    const buildSuggestionHandler = (tx: StatementTransaction): (() => void) | null => {
        const manual = manualAiSuggestions.get(tx.id);
        if (manual && 'category' in manual && manual.category && manual.category !== 'Error') {
            const cat = manual.category;
            return () => handleAcceptCategorySuggestion(tx.id, cat, tx.amount, getEffectiveVatRate(tx, cat));
        }
        const auto = getAutoSuggestion(tx);
        if (!auto) return null;
        if (auto.type === 'transfer') return () => commitTransfer(tx);
        if (auto.type === 'category') {
            const cat = (auto as any).category as string;
            return () => handleAcceptCategorySuggestion(tx.id, cat, tx.amount, getEffectiveVatRate(tx, cat));
        }
        const m = (auto as any).data as dataService.HeuristicSuggestion;
        if (m.salesDocId || m.jobInvoiceId || m.miscInvoiceId) return () => handleAcceptIncomeSuggestion(tx, m);
        if (m.vehicleId) return () => handleAcceptSuggestion(tx.id, { vehicleId: m.vehicleId, receiptIds: m.receiptIds });
        if (m.receiptIds) return () => handleAcceptSuggestion(tx.id, { receiptIds: m.receiptIds });
        return null;
    };

    const openRowCombo = (index: number) => {
        const tx = transactionsToShow[index];
        if (tx) comboRefs.current.get(tx.id)?.open();
    };

    const keyboardEnabled = hasFinePointer && !showReconciled && !modal && !showAddRow;

    const { focusedIndex, setFocusedIndex, registerRow, showLegend, setShowLegend } = useReconcileQueueKeyboard({
        enabled: keyboardEnabled,
        itemCount: transactionsToShow.length,
        actions: {
            onAccept: (idx) => {
                const tx = transactionsToShow[idx];
                if (!tx) return;
                const h = buildSuggestionHandler(tx);
                if (h) h(); else openRowCombo(idx);
            },
            onCategorise: openRowCombo,
            onVat: (idx, rate) => {
                const tx = transactionsToShow[idx];
                if (!tx) return;
                if (rate === undefined) toggleVatRate(tx, getRowVatRate(tx));
                else setVatSelections(prev => ({ ...prev, [tx.id]: rate }));
            },
            onTransfer: (idx) => { const tx = transactionsToShow[idx]; if (tx) commitTransfer(tx); },
            onMatch: (idx) => { const tx = transactionsToShow[idx]; if (tx) onEdit(tx); },
            onAddNew: () => { if (accountId) setShowAddRow(true); },
            onUndo: () => {
                if (!lastCommittedTxId) return;
                const tx = allTransactions.find(t => t.id === lastCommittedTxId);
                if (tx) onUndo(tx);
                setLastCommittedTxId(null);
            },
        },
    });

    const handleSelectAll = (isChecked: boolean) => {
        transactionsToShow.forEach(tx => {
            const isCurrentlySelected = selectedTxIds.includes(tx.id);
            if ((isChecked && !isCurrentlySelected) || (!isChecked && isCurrentlySelected)) {
                onSelectionChange(tx.id, isChecked);
            }
        });
    };

    const isAllSelected = transactionsToShow.length > 0 && transactionsToShow.every(tx => selectedTxIds.includes(tx.id));

    const Icon = type === 'Bank' ? BanknotesIcon : CreditCardIcon;

    const toggleExpanded = (txId: string) => setExpandedIds(prev => {
        const next = new Set(prev);
        if (next.has(txId)) next.delete(txId); else next.add(txId);
        return next;
    });

    type ResolvedSuggestion = { kind: 'transfer' | 'match' | 'category'; icon: React.ReactNode; text: string; subtext?: string; title?: string; handler: () => void };

    // What the line's suggestion is and what accepting it does. Same priority and the same
    // commit paths as always: a manual AI answer first, then the instant auto-suggestion.
    const resolveSuggestion = (tx: StatementTransaction): ResolvedSuggestion | null => {
        if (tx.status === 'Reconciled') return null;

        const manualAiResult = manualAiSuggestions.get(tx.id);
        let activeSuggestion: any = null;

        // Priority 1: Manual AI Result (if user clicked 'Ask AI' previously)
        if (manualAiResult) {
            if ('match' in manualAiResult) activeSuggestion = { type: 'match', data: manualAiResult.match };
            else if ('category' in manualAiResult && manualAiResult.category !== 'Error') activeSuggestion = { type: 'category', category: manualAiResult.category };
        }

        // Priority 2: Auto Suggestion (Instant)
        if (!activeSuggestion) {
            const auto = getAutoSuggestion(tx);
            if (auto) activeSuggestion = auto;
        }

        if (!activeSuggestion) return null;

        if (activeSuggestion.type === 'transfer') {
            return {
                kind: 'transfer',
                icon: <ArrowPathIcon />,
                text: `Transfer ↔ ${activeSuggestion.accountName}`,
                subtext: 'Own accounts · no VAT',
                title: 'Book both sides as a transfer between your own accounts (no VAT, not in the P&L)',
                handler: () => commitTransfer(tx),
            };
        }

        if (activeSuggestion.type === 'match') {
            const matchData = activeSuggestion.data as dataService.HeuristicSuggestion;
            let text = 'Match found';
            let subtext = '';
            let handler = () => {};
            let icon: React.ReactNode = <SparklesIcon />;

            // Income Matches
            if (matchData.salesDocId) {
                const doc = salesDocs.find(d => d.id === matchData.salesDocId);
                const car = doc?.carDetails || vehicles.find(v => v.id === doc?.vehicleId);
                const name = doc?.customerName?.split(' ')[0] || 'Customer';
                const reg = car?.reg || doc?.invoiceNumber;

                text = `Match: ${reg}`;
                subtext = `${name} (${matchData.details || 'Payment'})`;

                icon = <DocumentTextIcon />;
                handler = () => handleAcceptIncomeSuggestion(tx, matchData);
            } else if (matchData.jobInvoiceId) {
                const inv = jobInvoices.find(j => j.id === matchData.jobInvoiceId);
                const name = inv?.customerDetails?.name?.split(' ')[0] || 'Customer';
                text = `Match: Job ${inv?.invoiceNumber || ''}`;
                subtext = `${name} (${matchData.details || 'Payment'})`;
                icon = <DocumentTextIcon />;
                handler = () => handleAcceptIncomeSuggestion(tx, matchData);
            } else if (matchData.miscInvoiceId) {
                const inv = miscInvoices.find(m => m.id === matchData.miscInvoiceId);
                const name = inv?.customerName?.split(' ')[0] || 'Customer';
                text = `Match: Inv ${inv?.invoiceNumber || ''}`;
                subtext = `${name} (${matchData.details || 'Payment'})`;
                icon = <DocumentTextIcon />;
                handler = () => handleAcceptIncomeSuggestion(tx, matchData);
            }
            // Expense Matches
            else if (matchData.vehicleId) {
                const v = vehicles.find(veh => veh.id === matchData.vehicleId);
                text = `Match: ${v?.reg || 'Vehicle'}`;
                icon = <CarIcon />;
                handler = () => handleAcceptSuggestion(tx.id, { vehicleId: matchData.vehicleId, receiptIds: matchData.receiptIds });
            } else if (matchData.receiptIds) {
                const rIds = matchData.receiptIds;
                text = rIds.length > 1 ? `Match: ${rIds.length} receipts` : 'Match: receipt';
                handler = () => handleAcceptSuggestion(tx.id, { receiptIds: rIds });
            }

            return { kind: 'match', icon, text, subtext, handler };
        }

        if (activeSuggestion.type === 'category') {
            const cat = activeSuggestion.category as string;
            const effectiveVatRate = getEffectiveVatRate(tx, cat);
            return {
                kind: 'category',
                icon: <TagIcon />,
                text: cat,
                subtext: tx.amount < 0 ? `${effectiveVatRate}% VAT` : undefined,
                handler: () => handleAcceptCategorySuggestion(tx.id, cat, tx.amount, effectiveVatRate),
            };
        }
        return null;
    };

    // The suggestion as one tap: what we think it is, then "Accept".
    const SuggestionButton = ({ s }: { s: ResolvedSuggestion }) => (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); s.handler(); }}
            title={s.title}
            className="flex min-h-[48px] w-full items-center gap-2.5 rounded-control border border-accent bg-accent-soft py-1.5 pe-3 ps-3 text-start text-accent-soft-ink transition-[box-shadow,transform] duration-quick ease-out hover:shadow-[inset_0_0_0_1px_rgb(var(--c-accent))] active:scale-[.98] active:duration-press [&>svg]:h-5 [&>svg]:w-5 [&>svg]:flex-none"
        >
            {s.icon}
            <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-semibold">{s.text}</span>
                {s.subtext && <span className="mt-0.5 block truncate text-xs">{s.subtext}</span>}
            </span>
            <span className="inline-flex flex-none items-center gap-1 text-sm font-bold">
                <CheckIcon className="h-4 w-4" /> Accept
            </span>
        </button>
    );

    const AskAiButton = ({ tx }: { tx: StatementTransaction }) => (
        <Button
            size="sm"
            variant="ghost"
            onClick={(e) => { e.stopPropagation(); handleAiSmartSuggest(tx); }}
            loading={suggestingForTxId === tx.id}
            icon={<SparklesIcon />}
            title="Ask AI for a suggestion"
        >
            Ask AI
        </Button>
    );

    const VatToggle = ({ tx, rate }: { tx: StatementTransaction; rate: number }) => (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleVatRate(tx, rate); }}
            aria-pressed={rate === 20}
            aria-label={`VAT ${rate}%. Switch to ${rate === 20 ? '0' : '20'}%`}
            title="Toggle VAT rate (0% or 20%)"
            className={cx(
                'num inline-flex min-h-[40px] min-w-[60px] items-center justify-center rounded-control border px-2 text-sm font-semibold transition-colors duration-quick ease-out [@media(pointer:coarse)]:min-h-[48px]',
                rate === 20
                    ? 'border-info bg-info-soft text-info-ink'
                    : 'border-line-strong bg-surface text-ink-3 hover:bg-surface-2 hover:text-ink',
            )}
        >
            {rate}%
        </button>
    );

    const MatchButton = ({ tx }: { tx: StatementTransaction }) => (
        <Button
            size="sm"
            variant="secondary"
            onClick={(e) => { e.stopPropagation(); onEdit(tx); }}
            title="Match to a receipt, vehicle or invoice, or upload a receipt"
        >
            Match…
        </Button>
    );

    const renderCombobox = (tx: StatementTransaction, register: boolean) => {
        const isIncome = tx.amount > 0;
        return (
            <InlineCategoryCombobox
                ref={register ? (h => { if (h) comboRefs.current.set(tx.id, h); else comboRefs.current.delete(tx.id); }) : undefined}
                categories={isIncome ? INCOME_COMBO : expenseComboCategories}
                recentFirst={isIncome ? [] : recentCategoryNames}
                onSelect={name => handleRowCategorySelect(tx, name)}
                onAddCategory={isIncome ? undefined : addExpenseCategory}
                allowCustom={isIncome}
                large
                placeholder={isIncome ? 'Income type…' : 'Category…'}
            />
        );
    };

    const meta = (tx: StatementTransaction) => (
        <>
            <span className="num">{formatDate(tx.date, { day: '2-digit', month: 'short', year: '2-digit' })}</span>
            {tx.method ? <> · {tx.method}</> : null}
        </>
    );

    const emptyCopy = (): { title: string; description: string; done?: boolean } => {
        if (hasActiveFilters) return { title: 'No lines match', description: 'Try other words, or pick a wider period.' };
        if (showReconciled) return { title: 'Nothing ticked off yet', description: `Lines you tick off in ${accountName} show here.` };
        if (queue === 'suggested' && unreconciledTxs.length > 0) return { title: 'No suggestions right now', description: 'Lines we can’t place stay in To check. Pick a category or tap Match.' };
        if (unreconciledTxs.length === 0 && transactions.length > 0) return { title: 'All ticked off', description: `Every line in ${accountName} for this period is done.`, done: true };
        return { title: 'No lines yet', description: `Upload a statement for ${accountName} to start.` };
    };

    const empty = emptyCopy();

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Tabs
                    variant="pills"
                    ariaLabel="Which lines"
                    activeTab={queue}
                    onChange={id => setQueue(id as 'check' | 'suggested' | 'done')}
                    tabs={[
                        { id: 'check', label: 'To check', count: unreconciledTxs.length },
                        { id: 'suggested', label: 'Suggested', count: suggestedTxs.length },
                        { id: 'done', label: 'Done', count: reconciledTxs.length },
                    ]}
                />
                {!showReconciled && (
                    <div className="flex items-center gap-1">
                        {hasFinePointer && (
                            <Button size="sm" variant="ghost" aria-pressed={showLegend} onClick={() => setShowLegend(s => !s)} title="Keyboard shortcuts (?)">
                                Shortcuts
                            </Button>
                        )}
                        {accountId && (
                            <Button size="sm" variant="secondary" icon={<PlusIcon />} aria-expanded={showAddRow} onClick={() => setShowAddRow(s => !s)}>
                                Add transaction
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {!showReconciled && hasFinePointer && showLegend && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-2">
                    <span className="inline-flex items-center gap-1"><Kbd>J</Kbd><Kbd>K</Kbd> move</span>
                    <span className="inline-flex items-center gap-1"><Kbd>Enter</Kbd> accept</span>
                    <span className="inline-flex items-center gap-1"><Kbd>C</Kbd> category</span>
                    <span className="inline-flex items-center gap-1"><Kbd>0</Kbd><Kbd>2</Kbd> VAT</span>
                    <span className="inline-flex items-center gap-1"><Kbd>T</Kbd> transfer</span>
                    <span className="inline-flex items-center gap-1"><Kbd>M</Kbd> match</span>
                    <span className="inline-flex items-center gap-1"><Kbd>N</Kbd> add</span>
                    <span className="inline-flex items-center gap-1"><Kbd>U</Kbd> undo</span>
                </div>
            )}
            {!showReconciled && showAddRow && accountId && (
                <AddTransactionRow
                    account={{ id: accountId, type, name: accountName }}
                    categories={expenseCategories}
                    onAddCategory={addExpenseCategory}
                    onClose={() => setShowAddRow(false)}
                />
            )}

            {transactionsToShow.length === 0 ? (
                <EmptyState
                    className="rounded-card border border-line bg-surface"
                    icon={empty.done ? <CheckCircleIcon className="text-success" /> : <Icon />}
                    title={empty.title}
                    description={empty.description}
                />
            ) : (
                <>
                    {/* Wide desktop: the ledger as a table. Below 1280 (sidebar open) it would not fit, so cards. */}
                    <div className="hidden xl:block">
                        <DataTable ariaLabel={`${accountName} lines`} minWidth={showReconciled ? 720 : 900} className="[&_table]:table-fixed">
                            <THead>
                                <tr>
                                    {isSelectionMode && (
                                        <Th className="w-12 px-0" style={{ width: 48 }}>
                                            <RowCheck checked={isAllSelected} onChange={handleSelectAll} label="Select all lines" />
                                        </Th>
                                    )}
                                    <Th className="w-[92px]">Date</Th>
                                    <Th>Description</Th>
                                    <Th numeric className="w-[104px]">Amount</Th>
                                    <Th className="w-[148px]">Category</Th>
                                    <Th numeric className="w-[68px]">VAT</Th>
                                    {!showReconciled && <Th className="w-[256px]">Suggestion</Th>}
                                    <Th className={showReconciled ? 'w-[112px]' : 'w-[92px]'}><span className="sr-only">Actions</span></Th>
                                </tr>
                            </THead>
                            <TBody>
                                {transactionsToShow.map((tx, rowIndex) => {
                                    const isSelected = selectedTxIds.includes(tx.id);
                                    const isFocused = !showReconciled && rowIndex === focusedIndex;
                                    const rowVatRate = getRowVatRate(tx);
                                    const s = !showReconciled ? resolveSuggestion(tx) : null;

                                    return (
                                        <Tr
                                            key={tx.id}
                                            selected={isSelected}
                                            aria-current={isFocused ? 'true' : undefined}
                                            onClick={() => { if (keyboardEnabled) setFocusedIndex(rowIndex); }}
                                            className={cx(isFocused && '[&>td:first-child]:shadow-[inset_3px_0_0_rgb(var(--c-focus))] [&>td]:bg-surface-2')}
                                        >
                                            {isSelectionMode && (
                                                <Td className="px-0">
                                                    <RowCheck checked={isSelected} onChange={checked => onSelectionChange(tx.id, checked)} label={`Select ${tx.description}`} />
                                                </Td>
                                            )}
                                            <Td className="num text-ink-2">
                                                {/* Registered for the keyboard queue: keeps the focused line in view. */}
                                                <span ref={el => registerRow(rowIndex, el)}>{formatDate(tx.date, { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                                            </Td>
                                            <Td className="max-w-0 whitespace-normal py-2">
                                                <span className="flex min-w-0 items-center gap-2.5">
                                                    {renderReceiptThumbs(tx.id, 'sm')}
                                                    <span className="min-w-0 leading-tight">
                                                        <span className="block truncate font-semibold" title={tx.description}>{tx.description}</span>
                                                        {tx.method && <span className="mt-0.5 block truncate text-xs text-ink-3">{tx.method}</span>}
                                                    </span>
                                                </span>
                                            </Td>
                                            <Td numeric className="font-semibold"><Money amount={tx.amount} signed tone /></Td>
                                            <Td className="py-1.5">
                                                {showReconciled ? (
                                                    <span className="block max-w-[170px] truncate text-ink-2">{tx.category}</span>
                                                ) : renderCombobox(tx, true)}
                                            </Td>
                                            <Td numeric className="py-1.5">
                                                {showReconciled
                                                    ? (tx.vatAmount > 0 ? <Money amount={tx.vatAmount} className="text-ink-2" /> : <span className="text-ink-3">—</span>)
                                                    : <VatToggle tx={tx} rate={rowVatRate} />}
                                            </Td>
                                            {!showReconciled && (
                                                <Td className="py-1.5">
                                                    {s ? <SuggestionButton s={s} /> : <AskAiButton tx={tx} />}
                                                </Td>
                                            )}
                                            <Td className="pe-2">
                                                {tx.status === 'Reconciled' ? (
                                                    <span className="flex items-center justify-end gap-1">
                                                        <IconButton size="sm" label="Edit line" icon={<EditIcon />} onClick={() => onEdit(tx)} className="[&_svg]:h-5 [&_svg]:w-5" />
                                                        <IconButton size="sm" label="Undo tick-off" icon={<UndoIcon />} onClick={() => onUndo(tx)} className="[&_svg]:h-5 [&_svg]:w-5" />
                                                    </span>
                                                ) : (
                                                    <span className="flex justify-end"><MatchButton tx={tx} /></span>
                                                )}
                                            </Td>
                                        </Tr>
                                    );
                                })}
                            </TBody>
                        </DataTable>
                    </div>

                    {/* Phone: one card per line. Tablet and small desktop: two columns. */}
                    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:hidden" aria-label={`${accountName} lines`}>
                        {transactionsToShow.map(tx => {
                            const isSelected = selectedTxIds.includes(tx.id);
                            const rowVatRate = getRowVatRate(tx);
                            const s = resolveSuggestion(tx);
                            const open = !s || expandedIds.has(tx.id);

                            return (
                                <li
                                    key={tx.id}
                                    className={cx(
                                        'flex min-w-0 flex-col rounded-card border transition-colors duration-quick ease-out',
                                        isSelected ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
                                    )}
                                >
                                    <div className="flex gap-1 pe-3.5 ps-1 pt-1">
                                        {isSelectionMode && (
                                            <RowCheck checked={isSelected} onChange={checked => onSelectionChange(tx.id, checked)} label={`Select ${tx.description}`} />
                                        )}
                                        <div className={cx('min-w-0 flex-1 pb-1 pt-2.5', !isSelectionMode && 'ps-2.5')}>
                                            <div className="flex items-baseline justify-between gap-3">
                                                <p className="min-w-0 truncate text-sm text-ink-3">{meta(tx)}</p>
                                                <Money amount={tx.amount} signed tone className="text-lg font-semibold leading-tight text-ink" />
                                            </div>
                                            <div className="mt-1 flex items-start gap-3">
                                                <p className="min-w-0 flex-1 break-words text-base font-semibold leading-snug text-ink">{tx.description}</p>
                                                {renderReceiptThumbs(tx.id, 'md')}
                                            </div>
                                        </div>
                                    </div>

                                    {tx.status === 'Unreconciled' ? (
                                        <div className="mt-auto space-y-2 px-3.5 pb-3.5 pt-2">
                                            {s ? <SuggestionButton s={s} /> : <p className="text-sm text-ink-3">No suggestion. What was it?</p>}
                                            {open && (
                                                <>
                                                    <div className="grid grid-cols-[1fr_auto] gap-2">
                                                        {renderCombobox(tx, false)}
                                                        <VatToggle tx={tx} rate={rowVatRate} />
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <MatchButton tx={tx} />
                                                        {!s && <AskAiButton tx={tx} />}
                                                    </div>
                                                </>
                                            )}
                                            {s && (
                                                <button
                                                    type="button"
                                                    aria-expanded={open}
                                                    onClick={() => toggleExpanded(tx.id)}
                                                    className="inline-flex min-h-[48px] items-center gap-1 rounded-control text-sm font-semibold text-accent-text"
                                                >
                                                    {open ? 'Fewer options' : 'Something else…'}
                                                    <ChevronDownIcon className={cx('h-4 w-4 transition-transform duration-quick ease-out', open && 'rotate-180')} />
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-3.5 py-2">
                                            <StatusChip status="sold">Done</StatusChip>
                                            <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
                                                {tx.category}
                                                {tx.vatAmount > 0 && <> · VAT <Money amount={tx.vatAmount} /></>}
                                            </span>
                                            <span className="flex items-center">
                                                <Button size="sm" variant="ghost" icon={<EditIcon />} onClick={() => onEdit(tx)}>Edit</Button>
                                                <Button size="sm" variant="ghost" icon={<UndoIcon />} onClick={() => onUndo(tx)}>Undo</Button>
                                            </span>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </div>
    );
};

export default StatementReconciler;
