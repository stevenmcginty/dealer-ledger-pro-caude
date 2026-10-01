import { describe, it, expect } from 'vitest';
import {
    accountIdOfTx, isOnAccountForDedupe, findTransferPartners, rankAutoSuggestion, accountsForTabs, accountsForUpload, TransferLine,
} from '../utils/accountTransfers';
import { parseCsvText, readRowByHeaderAliases } from '../utils/csvMapping';
import { buildExpenseRows } from '../utils/accounting/expenseRows';
import { tx, Q3 } from './accounting/fixtures';

// Push ids sort by creation time: 'acc-a' (Lloyds) is older than 'acc-b' (Allica).
const accounts = [
    { id: 'acc-b', type: 'Bank' as const },
    { id: 'acc-a', type: 'Bank' as const },
    { id: 'acc-card', type: 'Credit Card' as const },
];

const line = (id: string, accountId: string | undefined, date: string, amount: number, extra: Partial<TransferLine> = {}): TransferLine =>
    ({ id, accountId, date, amount, type: 'Bank', status: 'Unreconciled', category: 'Other', ...extra });

describe('accountIdOfTx', () => {
    it('uses the line accountId when it has one', () => {
        expect(accountIdOfTx({ accountId: 'acc-b', type: 'Bank' }, accounts)).toBe('acc-b');
    });

    it('puts a line with no accountId on the OLDEST account of its type, not on every one', () => {
        expect(accountIdOfTx({ type: 'Bank' }, accounts)).toBe('acc-a');
        expect(accountIdOfTx({ type: 'Credit Card' }, accounts)).toBe('acc-card');
        expect(accountIdOfTx({ type: 'Bank' }, [])).toBeUndefined();
    });
});

describe('isOnAccountForDedupe', () => {
    it('only counts lines on the account being uploaded to (plus legacy lines of the same type)', () => {
        const lloyds = { id: 'acc-a', type: 'Bank' as const };
        expect(isOnAccountForDedupe({ accountId: 'acc-a', type: 'Bank' }, lloyds)).toBe(true);
        expect(isOnAccountForDedupe({ accountId: 'acc-b', type: 'Bank' }, lloyds)).toBe(false);
        expect(isOnAccountForDedupe({ type: 'Bank' }, lloyds)).toBe(true);
        expect(isOnAccountForDedupe({ type: 'Credit Card' }, lloyds)).toBe(false);
    });
});

describe('findTransferPartners', () => {
    it('pairs money out of one bank with the same money into another within 3 days, both ways', () => {
        const out = line('out', 'acc-a', '2026-08-28', -5200);
        const into = line('in', 'acc-b', '2026-08-30', 5200);
        const pairs = findTransferPartners([out, into, line('x', 'acc-b', '2026-08-28', -12)], accounts);
        expect(pairs.get('out')).toEqual({ partner: into, partnerAccountId: 'acc-b' });
        expect(pairs.get('in')).toEqual({ partner: out, partnerAccountId: 'acc-a' });
        expect(pairs.has('x')).toBe(false);
    });

    it('uses the oldest-account fallback for lines with no accountId', () => {
        const pairs = findTransferPartners([line('out', undefined, '2026-08-28', -100), line('in', 'acc-b', '2026-08-28', 100)], accounts);
        expect(pairs.get('in')?.partnerAccountId).toBe('acc-a');
    });

    it('ignores the same account, a different amount, more than 3 days apart, and credit cards', () => {
        expect(findTransferPartners([line('o', 'acc-a', '2026-08-01', -50), line('i', 'acc-a', '2026-08-01', 50)], accounts).size).toBe(0);
        expect(findTransferPartners([line('o', 'acc-a', '2026-08-01', -50), line('i', 'acc-b', '2026-08-01', 50.01)], accounts).size).toBe(0);
        expect(findTransferPartners([line('o', 'acc-a', '2026-08-01', -50), line('i', 'acc-b', '2026-08-05', 50)], accounts).size).toBe(0);
        expect(findTransferPartners([line('o', 'acc-a', '2026-08-01', -50), line('i', 'acc-card', '2026-08-01', 50, { type: 'Credit Card' })], accounts).size).toBe(0);
    });

    it('leaves ambiguous pairs alone (one line with two possible partners)', () => {
        const pairs = findTransferPartners([
            line('o', 'acc-a', '2026-07-20', -1000),
            line('i1', 'acc-b', '2026-07-20', 1000),
            line('i2', 'acc-b', '2026-07-21', 1000),
        ], accounts);
        expect(pairs.size).toBe(0);
    });

    it('skips lines already reconciled as something else, but offers the other side of a booked transfer', () => {
        const booked = line('o', 'acc-a', '2026-07-06', -8000, { status: 'Reconciled', category: 'Transfer', reconciliationType: 'transfer' });
        const open = line('i', 'acc-b', '2026-07-06', 8000);
        expect(findTransferPartners([booked, open], accounts).get('i')?.partner).toBe(booked);

        const sale = line('o2', 'acc-a', '2026-07-06', -300, { status: 'Reconciled', category: 'Repairs' });
        expect(findTransferPartners([sale, line('i2', 'acc-b', '2026-07-06', 300)], accounts).size).toBe(0);

        const bothBooked = line('i3', 'acc-b', '2026-07-06', 8000, { status: 'Reconciled', category: 'Transfer', reconciliationType: 'transfer' });
        expect(findTransferPartners([booked, bothBooked], accounts).size).toBe(0);
    });
});

describe('closed accounts', () => {
    const accs = [
        { id: 'acc-a', name: 'Lloyds', type: 'Bank' as const },
        { id: 'acc-card', name: 'Credit Card', type: 'Credit Card' as const, closed: true, closedAt: 1 },
    ];

    it('are hidden from the Expenses tabs and the upload menu unless asked for', () => {
        expect(accountsForTabs(accs, false).map(a => a.id)).toEqual(['acc-a']);
        expect(accountsForTabs(accs, true).map(a => a.id)).toEqual(['acc-a', 'acc-card']);
        expect(accountsForTabs(accs, false, 'acc-card').map(a => a.id)).toEqual(['acc-a', 'acc-card']);
        expect(accountsForUpload(accs).map(a => a.id)).toEqual(['acc-a']);
    });

    it('keep their lines in the Expenses & VAT rows (and so the P&L and VAT)', () => {
        const rows = buildExpenseRows({
            range: Q3,
            isVatRegistered: true,
            financialAccounts: accs,
            receipts: [],
            transactions: [
                tx({ id: 'c1', amount: -60, vatAmount: 10, category: 'Fuel', type: 'Credit Card', accountId: 'acc-card' }),
                tx({ id: 'c2', amount: -12, vatAmount: 2, category: 'Fuel', type: 'Credit Card' }), // legacy, no accountId
            ],
        });
        expect(rows.map(r => [r.id, r.account, r.inPnl, r.vat])).toEqual([
            ['tx:c1', 'Credit Card', true, 10],
            ['tx:c2', 'Credit Card', true, 2],
        ]);
    });
});

describe('rankAutoSuggestion', () => {
    it('keeps a sales-invoice match as the suggestion (and Enter action) when the line also has a transfer partner', () => {
        const into = line('in', 'acc-b', '2026-08-28', 5200);
        const pairs = findTransferPartners([line('out', 'acc-a', '2026-08-28', -5200), into], accounts);
        expect(pairs.has('in')).toBe(true);
        const invoiceMatch = { salesDocId: 'doc1', details: 'Deposit' };
        expect(rankAutoSuggestion({ match: invoiceMatch, transferAccountName: 'Lloyds', historyCategory: 'Car Sale' }))
            .toEqual({ type: 'match', data: invoiceMatch });
    });

    it('offers the transfer when there is no data match, ahead of learned and keyword categories', () => {
        expect(rankAutoSuggestion({ match: undefined, transferAccountName: 'Allica', historyCategory: 'Vehicle Sale', keywordCategory: 'Fuel' }))
            .toEqual({ type: 'transfer', accountName: 'Allica' });
        expect(rankAutoSuggestion({ historyCategory: 'Vehicle Sale', keywordCategory: 'Fuel' })).toEqual({ type: 'category', category: 'Vehicle Sale' });
        expect(rankAutoSuggestion({ keywordCategory: 'Fuel' })).toEqual({ type: 'category', category: 'Fuel' });
        expect(rankAutoSuggestion({})).toBeNull();
    });
});

// Rows copied from Steve's Lloyds export (Lloyds_32988760_2026-07-02_2026-09-30.csv).
const LLOYDS_CSV = [
    'Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance',
    "30/09/2026,FPI,'30-97-25,32988760,STRIPE PAYMENTS UK STRIPE XPOFZ1Q9C907274517 185008     10 30SEP26 08:08,,97.31,11396.04",
    "30/09/2026,SO,'30-97-25,32988760,CURTIS AND CO,180.00,,11298.73",
    "28/08/2026,FPO,'30-97-25,32988760,EASYWAYTOSELLMYCAR 100000001815295963 041376     10 28AUG26 09:11,5200.00,,3.34",
    "02/07/2026,DEB,'30-97-25,32988760,ANTHROPIC* CLAUDE CD 6747,173.83,,-1021.27",
].join('\n');

describe('Lloyds statement format (built-in header aliases)', () => {
    const { headers, rows } = parseCsvText(LLOYDS_CSV);
    const read = rows.map(r => readRowByHeaderAliases(r, headers, 'Bank'));

    it('reads dd/mm/yyyy dates, debit as money out, credit as money in, and the type code', () => {
        expect(read).toEqual([
            { date: '2026-09-30', description: 'STRIPE PAYMENTS UK STRIPE XPOFZ1Q9C907274517 185008     10 30SEP26 08:08', amount: 97.31, method: 'FPI' },
            { date: '2026-09-30', description: 'CURTIS AND CO', amount: -180, method: 'SO' },
            { date: '2026-08-28', description: 'EASYWAYTOSELLMYCAR 100000001815295963 041376     10 28AUG26 09:11', amount: -5200, method: 'FPO' },
            { date: '2026-07-02', description: 'ANTHROPIC* CLAUDE CD 6747', amount: -173.83, method: 'DEB' },
        ]);
    });

    it('pairs a Lloyds move to EASYWAYTOSELLMYCAR with the Allica money in as a transfer', () => {
        const lloydsOut = line('l', 'acc-a', read[2]!.date, read[2]!.amount);
        const allicaIn = line('a', 'acc-b', '2026-08-28', 5200); // "From Easy Way to Sell M, NOT PROVIDED"
        expect(findTransferPartners([lloydsOut, allicaIn], accounts).get('l')?.partner).toBe(allicaIn);
    });
});
