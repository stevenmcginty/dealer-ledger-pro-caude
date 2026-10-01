// The "Expenses & VAT" list: one row per cost or income line the owner booked in
// Expenses, with the money split into net / VAT / gross and a flag saying whether the
// line is in the P&L.
//
// Rules (accruals basis):
//   - A receipt counts on its receipt date, paid or not, reconciled or not, including
//     bills left "On Account" with the supplier.
//   - A reconciled bank or card line counts on its bank date, unless a receipt is linked
//     to it (receipt.reconciledByTxId). Then the receipt carries the cost and the bank
//     line is never counted a second time.
//   - Unreconciled bank lines are not booked yet, so they are left out (the P&L warns).
//   - VAT-registered: the P&L amount is net of VAT. Not registered: VAT cannot be
//     reclaimed, so net = gross and the VAT column is 0.

import type { Receipt, StatementTransaction, FinancialAccount } from '../../types';
import { classifyReceipt, classifyTransaction, displayCategory, NotInPnlGroup } from './categories';
import { DateRange, inRange, toDay } from './yearEnd';
import { accountIdOfTx } from '../accountTransfers';

export type ExpenseRowSource = 'receipt' | 'bank' | 'card';

export interface ExpenseRow {
    /** 'receipt:<id>' or 'tx:<id>' — unique across the list. */
    id: string;
    date: string;
    /** Supplier for a receipt, bank description for a bank/card line. */
    description: string;
    category: string;
    /** Account name of the bank/card line (or of the line that paid the receipt); 'On supplier account' / 'Not paid yet' for unpaid receipts. */
    account: string;
    source: ExpenseRowSource;
    /** 'expense' = money out / a cost; 'income' = money in. */
    direction: 'expense' | 'income';
    /** true when the line is matched to the bank: a receipt linked to a bank line, or a reconciled bank line. */
    reconciled: boolean;
    /** Amounts are positive for normal lines (a credit note receipt is negative). */
    net: number;
    vat: number;
    gross: number;
    receiptUrl?: string;
    receiptId?: string;
    /** The bank/card line itself, or the one that paid this receipt. */
    transactionId?: string;
    vehicleId?: string;
    paymentType?: Receipt['paymentType'];
    inPnl: boolean;
    notInPnlGroup?: NotInPnlGroup;
    notInPnlLabel?: string;
}

export interface ExpenseRowsInput {
    range: DateRange;
    receipts: Receipt[];
    transactions: StatementTransaction[];
    financialAccounts?: FinancialAccount[];
    isVatRegistered: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Money split for one line. `vatRecorded` is what the owner booked; it only reduces net when VAT-registered. */
function split(gross: number, vatRecorded: number, isVatRegistered: boolean) {
    const vat = isVatRegistered ? (Number(vatRecorded) || 0) : 0;
    return { gross: round2(gross), vat: round2(vat), net: round2(gross - vat) };
}

/** Every receipt and bank/card line in the range, as rows. Sorted by date, then description. */
export function buildExpenseRows(input: ExpenseRowsInput): ExpenseRow[] {
    const { range, receipts, transactions, financialAccounts = [], isVatRegistered } = input;
    const accountName = new Map(financialAccounts.map(a => [a.id, a.name]));
    const txById = new Map(transactions.map(t => [t.id, t]));
    const txLabel = (tx: StatementTransaction) => {
        const accountId = accountIdOfTx(tx, financialAccounts);
        return (accountId && accountName.get(accountId)) || (tx.type === 'Credit Card' ? 'Credit card' : 'Bank');
    };

    // Bank lines that a receipt (from any date) points at: the receipt carries the cost.
    const linkedTxIds = new Set<string>();
    for (const r of receipts) if (r.reconciledByTxId) linkedTxIds.add(r.reconciledByTxId);

    const rows: ExpenseRow[] = [];

    for (const r of receipts) {
        const date = toDay(r.date);
        if (!inRange(date, range)) continue;
        const cls = classifyReceipt(r);
        const paidBy = r.reconciledByTxId ? txById.get(r.reconciledByTxId) : undefined;
        const account = paidBy
            ? txLabel(paidBy)
            : r.paymentType === 'On Account'
                ? 'On supplier account'
                : r.status === 'Paid' ? 'Paid (no bank match)' : 'Not paid yet';
        rows.push({
            id: `receipt:${r.id}`,
            date: date!,
            description: (r.vendor || '').trim() || 'Receipt',
            category: displayCategory(r.category),
            account,
            source: 'receipt',
            direction: 'expense',
            reconciled: !!r.reconciledByTxId,
            ...split(Number(r.amount) || 0, r.vat, isVatRegistered),
            receiptUrl: r.receiptUrl,
            receiptId: r.id,
            transactionId: r.reconciledByTxId,
            vehicleId: r.vehicleId,
            paymentType: r.paymentType,
            inPnl: cls.inPnl,
            ...(cls.inPnl ? {} : { notInPnlGroup: cls.group, notInPnlLabel: cls.label }),
        });
    }

    for (const tx of transactions) {
        if (tx.status !== 'Reconciled') continue;
        if (linkedTxIds.has(tx.id)) continue;
        const date = toDay(tx.date);
        if (!inRange(date, range)) continue;
        const amount = Number(tx.amount) || 0;
        const cls = classifyTransaction(tx);
        rows.push({
            id: `tx:${tx.id}`,
            date: date!,
            description: (tx.description || '').trim(),
            category: displayCategory(tx.category),
            account: txLabel(tx),
            source: tx.type === 'Credit Card' ? 'card' : 'bank',
            direction: amount > 0 ? 'income' : 'expense',
            reconciled: true,
            ...split(Math.abs(amount), tx.vatAmount, isVatRegistered),
            transactionId: tx.id,
            vehicleId: tx.linkedVehicleId,
            inPnl: cls.inPnl,
            ...(cls.inPnl ? {} : { notInPnlGroup: cls.group, notInPnlLabel: cls.label }),
        });
    }

    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));
}

export interface ExpenseRowTotals {
    net: number;
    vat: number;
    gross: number;
    count: number;
}

/** Sum a set of rows (e.g. after the screen filters them). */
export function totalExpenseRows(rows: ExpenseRow[]): ExpenseRowTotals {
    const t = rows.reduce((acc, r) => ({ net: acc.net + r.net, vat: acc.vat + r.vat, gross: acc.gross + r.gross }), { net: 0, vat: 0, gross: 0 });
    return { net: round2(t.net), vat: round2(t.vat), gross: round2(t.gross), count: rows.length };
}
