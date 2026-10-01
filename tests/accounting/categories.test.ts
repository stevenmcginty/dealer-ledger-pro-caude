import { describe, expect, it } from 'vitest';
import { classifyCategory, classifyTransaction } from '../../utils/accounting/categories';
import { buildExpenseRows, totalExpenseRows } from '../../utils/accounting/expenseRows';
import { receipt, tx, Q3 } from './fixtures';

const group = (name: string, dir: 'in' | 'out' = 'out') => {
    const c = classifyCategory(name, dir);
    return c.inPnl ? 'P&L' : c.group;
};

describe('classifyCategory', () => {
    it('keeps ordinary costs and income in the P&L', () => {
        for (const name of ['Fuel', 'Repairs', 'Transport', 'Office', 'Rent', 'wages', 'Fees/fines', 'Accountant', 'Bank', 'Refund', 'cash back', 'Commission', 'Part Sale', '']) {
            expect(group(name), name).toBe('P&L');
        }
    });

    it('matches names case-insensitively and trimmed', () => {
        expect(group('  VEHICLE sale ', 'in')).toBe('sale_money');
        expect(group('car purchase')).toBe('stock_purchase');
        expect(group('Sor', 'in')).toBe('sale_money');
        expect(group('SOR', 'out')).toBe('sor_payout');
        expect(group('SOR Payout')).toBe('sor_payout');
    });

    it('excludes every non-trading group', () => {
        expect(group('Transfer')).toBe('transfer');
        expect(group('Sales Deposit', 'in')).toBe('sale_money');
        expect(group('Job Invoice Payment', 'in')).toBe('sale_money');
        expect(group('Miscellaneous Income', 'in')).toBe('sale_money');
        expect(group('Sales Income', 'in')).toBe('sale_money');
        expect(group('Credit Card Payment', 'in')).toBe('credit_card_payment');
        expect(group('VAT')).toBe('vat_hmrc');
        expect(group('VAT refund', 'in')).toBe('vat_hmrc');
        expect(group('Tax')).toBe('hmrc_tax');
        expect(group('Corporation tax')).toBe('corporation_tax');
        expect(group('Drawings')).toBe('drawings');
        expect(group('Directors Loan', 'in')).toBe('director_loan');
        expect(group('Loan repayment')).toBe('loan');
        expect(group('BBL')).toBe('loan');
        expect(group('Dividend')).toBe('dividend');
    });

    it('a line flagged as a transfer is excluded whatever its category', () => {
        const c = classifyTransaction({ category: 'Fuel', amount: -50, reconciliationType: 'transfer' });
        expect(c.inPnl).toBe(false);
    });
});

describe('buildExpenseRows', () => {
    it('gives one row per receipt and unlinked reconciled bank line, with net / VAT / gross', () => {
        const rows = buildExpenseRows({
            range: Q3,
            isVatRegistered: true,
            financialAccounts: [{ id: 'acc1', name: 'Allica', type: 'Bank' }],
            receipts: [receipt({ id: 'r1', amount: 120, vat: 20, reconciledByTxId: 't1', receiptUrl: 'https://x/r1.pdf' })],
            transactions: [
                tx({ id: 't1', amount: -120, vatAmount: 20, accountId: 'acc1' }),
                tx({ id: 't2', amount: -30, vatAmount: 5, category: 'Phone', type: 'Credit Card' }),
                tx({ id: 't3', amount: 400, category: 'Car Sale', accountId: 'acc1' }),
            ],
        });
        expect(rows.map(r => r.id)).toEqual(['receipt:r1', 'tx:t2', 'tx:t3']);
        expect(rows[0]).toMatchObject({ source: 'receipt', account: 'Allica', reconciled: true, net: 100, vat: 20, gross: 120, receiptUrl: 'https://x/r1.pdf', inPnl: true });
        expect(rows[1]).toMatchObject({ source: 'card', direction: 'expense', net: 25, account: 'Credit card', inPnl: true });
        expect(rows[2]).toMatchObject({ direction: 'income', inPnl: false, notInPnlGroup: 'sale_money' });
        expect(totalExpenseRows(rows.filter(r => r.inPnl))).toEqual({ net: 125, vat: 25, gross: 150, count: 2 });
    });
});
