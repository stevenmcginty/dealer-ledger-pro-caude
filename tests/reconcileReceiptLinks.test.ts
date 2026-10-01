import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Receipt, StatementTransaction } from '../types';

// In-memory stand-in for the Realtime Database: get() reads `store`, update() records the patch.
const store: Record<string, any> = {};
const patches: Record<string, any>[] = [];
vi.mock('../services/firebase', () => ({
    db: {
        ref: (path = '') => ({
            get: async () => ({ val: () => store[path] ?? null, exists: () => store[path] != null }),
            update: async (u: Record<string, any>) => { patches.push(u); },
            push: () => ({ key: 'new-key' }),
        }),
    },
    storage: {},
    auth: {},
    reconnectDatabase: () => {},
}));

const { reconcileTransactionFromSuggestion, tryAutoReconciliation, getReconciliationSuggestions } = await import('../services/dataService');

const CO = 'co1';
const R = `companies/${CO}/receipts`;
const T = `companies/${CO}/transactions`;

const receipt = (over: Partial<Receipt>): Receipt => ({
    id: 'r1', vendor: 'Car Dealer 5', amount: 132, vat: 22, date: '2026-09-01', category: 'Advertising',
    paymentType: 'Direct', status: 'Unpaid', ...over,
} as Receipt);

const tx = (over: Partial<StatementTransaction>): StatementTransaction => ({
    id: 't1', date: '2026-09-01', description: 'To CAR DEALER 5 LTD', amount: -132, category: 'Advertising',
    vatRate: 0, vatAmount: 22, status: 'Reconciled', type: 'Bank', ...over,
} as StatementTransaction);

beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    patches.length = 0;
});

describe('reconcileTransactionFromSuggestion (Confirm Match)', () => {
    it('sets vatRate 20 with the VAT when it is gross/6 (re-match after Undo)', async () => {
        store[R] = { r1: receipt({}) };
        await reconcileTransactionFromSuggestion(CO, 't1', { receiptIds: ['r1'] });
        const [u] = patches;
        expect(u[`${T}/t1/vatAmount`]).toBe(22);
        expect(u[`${T}/t1/vatRate`]).toBe(20);
        expect(u[`${R}/r1/reconciledByTxId`]).toBe('t1');
        expect(u[`${R}/r1/status`]).toBe('Paid');
    });

    it('sets vatRate 0 for a receipt with no VAT, and leaves it alone for an odd split', async () => {
        store[R] = { r1: receipt({ vat: 0 }), r2: receipt({ id: 'r2', vat: 5 }) };
        await reconcileTransactionFromSuggestion(CO, 't1', { receiptIds: ['r1'] });
        await reconcileTransactionFromSuggestion(CO, 't2', { receiptIds: ['r2'] });
        expect(patches[0][`${T}/t1/vatRate`]).toBe(0);
        expect(`${T}/t2/vatRate` in patches[1]).toBe(false);
        expect(patches[1][`${T}/t2/vatAmount`]).toBe(5);
    });
});

describe('tryAutoReconciliation (new receipt saved)', () => {
    it('links to the one reconciled line and writes only the receipt (no tx change)', async () => {
        const res = await tryAutoReconciliation(CO, receipt({}), [tx({})], []);
        expect(res?.kind).toBe('linked');
        expect(res?.transaction.id).toBe('t1');
        expect(patches).toHaveLength(1);
        expect(patches[0]).toEqual({ [`${R}/r1/status`]: 'Paid', [`${R}/r1/reconciledByTxId`]: 't1' });
    });

    it('prefers an open line, and does nothing when the reconciled line already has a receipt', async () => {
        store[R] = { r1: receipt({}) };
        const open = tx({ id: 't2', status: 'Unreconciled', vatAmount: 0 });
        const res = await tryAutoReconciliation(CO, receipt({}), [tx({}), open], []);
        expect(res).toEqual({ kind: 'reconciled', transaction: open });

        patches.length = 0;
        const none = await tryAutoReconciliation(CO, receipt({}), [tx({})], [receipt({ id: 'r9', reconciledByTxId: 't1' })]);
        expect(none).toBeNull();
        expect(patches).toHaveLength(0);
    });

    it('does not link when an older unlinked receipt of the same amount fits the line', async () => {
        const legacy = receipt({ id: 'old', status: 'Paid', date: '2026-08-31' });
        expect(await tryAutoReconciliation(CO, receipt({}), [tx({})], [legacy])).toBeNull();
        expect(patches).toHaveLength(0);
    });

    it('skips On Account receipts', async () => {
        expect(await tryAutoReconciliation(CO, receipt({ paymentType: 'On Account' }), [tx({})], [])).toBeNull();
        expect(patches).toHaveLength(0);
    });
});

describe('getReconciliationSuggestions (one-click purple button)', () => {
    it('suggests an Unpaid receipt but never an old Paid one with no link', () => {
        const open = tx({ id: 't1', status: 'Unreconciled', vatAmount: 0 });
        const paid = receipt({ id: 'rPaid', status: 'Paid' });
        expect(getReconciliationSuggestions([open], [paid], []).has('t1')).toBe(false);
        expect(getReconciliationSuggestions([open], [receipt({ id: 'rOpen' })], []).get('t1')?.receiptIds).toEqual(['rOpen']);
    });
});
