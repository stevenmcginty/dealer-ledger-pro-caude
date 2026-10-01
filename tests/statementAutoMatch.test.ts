import { describe, it, expect } from 'vitest';
import {
    pickAutoMatches, supplierOverlap, isMatchableReceipt, findReconciledLineForReceipt, vatRateForVat,
    AutoMatchTx, AutoMatchReceipt, LinkableTx,
} from '../utils/statementAutoMatch';

const tx = (date: string, description: string, amount: number): AutoMatchTx =>
    ({ date, description, amount, status: 'Unreconciled' });

const receipt = (id: string, vendor: string, amount: number, date: string): AutoMatchReceipt =>
    ({ id, vendor, amount, date, status: 'Unpaid', paymentType: 'Direct' });

describe('supplierOverlap', () => {
    it('matches a shared supplier word', () => {
        expect(supplierOverlap('Esso', 'ESSO ST ALBANS')).toBe(true);
    });

    it('matches when one word sits inside a run-together description', () => {
        expect(supplierOverlap('Grouptyre Wholesale Ltd', 'www.grouptyrewholesale.coAylesbury')).toBe(true);
    });

    it('ignores stop words and unrelated suppliers', () => {
        expect(supplierOverlap('Esso', 'PRIME VIDEO*AB12CD')).toBe(false);
        expect(supplierOverlap('Shell Station Ltd', 'TRAINLINE STATION LTD')).toBe(false);
    });
});

describe('pickAutoMatches', () => {
    it('does not match Prime Video £8.99 to an Esso £8.95 fuel receipt', () => {
        const m = pickAutoMatches(
            [tx('2026-08-10', 'PRIME VIDEO*AB12CD', -8.99)],
            [receipt('r1', 'Esso', 8.95, '2026-08-09')],
        );
        expect(m.size).toBe(0);
    });

    it('uses one receipt for only one of two identical bank lines', () => {
        const m = pickAutoMatches(
            [tx('2026-08-10', 'ESSO ST ALBANS', -16.0), tx('2026-08-11', 'ESSO ST ALBANS', -16.0)],
            [receipt('r1', 'Esso', 16.0, '2026-08-10')],
        );
        expect(m.size).toBe(1);
        expect(m.get(0)).toBe('r1');
    });

    it('matches the same supplier at a 1p difference', () => {
        const m = pickAutoMatches(
            [tx('2026-08-10', 'www.grouptyrewholesale.coAylesbury', -120.01)],
            [receipt('r1', 'Grouptyre Wholesale Ltd', 120.0, '2026-08-08')],
        );
        expect(m.get(0)).toBe('r1');
    });

    it('matches a penny-exact amount even when the supplier differs', () => {
        const m = pickAutoMatches(
            [tx('2026-08-10', 'CARD 1234 SOMEWHERE', -42.17)],
            [receipt('r1', 'Halfords', 42.17, '2026-08-12')],
        );
        expect(m.get(0)).toBe('r1');
    });

    it('does not match when two receipts are equally good', () => {
        const m = pickAutoMatches(
            [tx('2026-08-10', 'ESSO ST ALBANS', -30.0)],
            [receipt('r1', 'Esso', 30.0, '2026-08-08'), receipt('r2', 'Esso', 30.0, '2026-08-08')],
        );
        expect(m.size).toBe(0);
    });

    it('does not match a receipt 25 days away', () => {
        const m = pickAutoMatches(
            [tx('2026-08-30', 'ESSO ST ALBANS', -16.0)],
            [receipt('r1', 'Esso', 16.0, '2026-08-05')],
        );
        expect(m.size).toBe(0);
    });

    it('never matches a money-in line', () => {
        const m = pickAutoMatches(
            [tx('2026-08-10', 'ESSO REFUND', 16.0)],
            [receipt('r1', 'Esso', 16.0, '2026-08-10')],
        );
        expect(m.size).toBe(0);
    });

    it('prefers exact + same supplier over exact alone, and skips paid or on-account receipts', () => {
        const paid = { ...receipt('r0', 'Esso', 16.0, '2026-08-10'), status: 'Paid' };
        const onAccount = { ...receipt('r00', 'Esso', 16.0, '2026-08-10'), paymentType: 'On Account' };
        const m = pickAutoMatches(
            [tx('2026-08-10', 'ESSO ST ALBANS', -16.0)],
            [paid, onAccount, receipt('r1', 'Tesco', 16.0, '2026-08-10'), receipt('r2', 'Esso', 16.0, '2026-08-14')],
        );
        expect(m.get(0)).toBe('r2');
    });
});

describe('isMatchableReceipt', () => {
    it('offers Unpaid receipts and Paid Direct receipts that no bank line carries', () => {
        expect(isMatchableReceipt({ status: 'Unpaid', paymentType: 'Direct' })).toBe(true);
        expect(isMatchableReceipt({ status: 'Unpaid', paymentType: 'On Account' })).toBe(true);
        expect(isMatchableReceipt({ status: 'Paid', paymentType: 'Direct' })).toBe(true);
    });

    it('skips linked receipts, Paid On Account receipts and Pending ones', () => {
        expect(isMatchableReceipt({ status: 'Paid', paymentType: 'Direct', reconciledByTxId: 't1' })).toBe(false);
        expect(isMatchableReceipt({ status: 'Unpaid', paymentType: 'Direct', reconciledByTxId: 't1' })).toBe(false);
        expect(isMatchableReceipt({ status: 'Paid', paymentType: 'On Account' })).toBe(false);
        expect(isMatchableReceipt({ status: 'Pending', paymentType: 'Direct' })).toBe(false);
    });
});

describe('pickAutoMatches with old Paid receipts', () => {
    it('never auto-matches a Paid receipt, even one with no bank line link (could book it twice)', () => {
        const oldPaid = { ...receipt('r1', 'Esso', 16.0, '2026-08-10'), status: 'Paid' };
        const m = pickAutoMatches([tx('2026-08-11', 'ESSO ST ALBANS', -16.0)], [oldPaid]);
        expect(m.size).toBe(0);
    });
});

describe('findReconciledLineForReceipt', () => {
    const line = (id: string, date: string, amount: number, extra: Partial<LinkableTx> = {}): LinkableTx =>
        ({ id, date, description: 'ESSO ST ALBANS', amount, status: 'Reconciled', category: 'Fuel', ...extra });
    const fuel = { id: 'r1', amount: 45.5, date: '2026-09-10' };

    it('returns the one reconciled money-out line with the exact amount in the window', () => {
        const hit = findReconciledLineForReceipt(fuel, [line('t1', '2026-09-12', -45.5), line('t2', '2026-09-12', -45.49)], []);
        expect(hit?.id).toBe('t1');
    });

    it('uses a window of 5 days before to 35 days after the receipt date', () => {
        expect(findReconciledLineForReceipt(fuel, [line('t1', '2026-09-05', -45.5)], [])?.id).toBe('t1');
        expect(findReconciledLineForReceipt(fuel, [line('t1', '2026-09-04', -45.5)], [])).toBeNull();
        expect(findReconciledLineForReceipt(fuel, [line('t1', '2026-10-15', -45.5)], [])?.id).toBe('t1');
        expect(findReconciledLineForReceipt(fuel, [line('t1', '2026-10-16', -45.5)], [])).toBeNull();
    });

    it('returns null when two lines fit (ambiguous)', () => {
        expect(findReconciledLineForReceipt(fuel, [line('t1', '2026-09-11', -45.5), line('t2', '2026-09-20', -45.5)], [])).toBeNull();
    });

    it('skips lines that already carry a receipt, open lines, transfers and money in', () => {
        const txs = [
            line('linked', '2026-09-11', -45.5),
            line('open', '2026-09-11', -45.5, { status: 'Unreconciled' }),
            line('transfer', '2026-09-11', -45.5, { category: 'Transfer' }),
            line('in', '2026-09-11', 45.5),
        ];
        expect(findReconciledLineForReceipt(fuel, txs, [{ id: 'other', reconciledByTxId: 'linked' }])).toBeNull();
    });

    it('never links a credit note (amount <= 0) or a zero receipt', () => {
        const txs = [line('t1', '2026-09-11', -45.5)];
        expect(findReconciledLineForReceipt({ ...fuel, amount: -45.5 }, txs, [])).toBeNull();
        expect(findReconciledLineForReceipt({ ...fuel, amount: 0 }, [line('t0', '2026-09-11', -0)], [])).toBeNull();
    });

    it('skips car purchase lines (linkedVehicleId)', () => {
        expect(findReconciledLineForReceipt(fuel, [line('t1', '2026-09-11', -45.5, { linkedVehicleId: 'v1' })], [])).toBeNull();
    });

    it('is one-to-one: no link when another unlinked receipt with the same amount fits the line', () => {
        const txs = [line('t1', '2026-09-12', -45.5)];
        const legacyPaid = { id: 'old', amount: 45.5, date: '2026-09-11', paymentType: 'Direct' };
        expect(findReconciledLineForReceipt(fuel, txs, [legacyPaid])).toBeNull();
        // the rival's date must fit the line's window: 35 days before to 5 days after the line
        expect(findReconciledLineForReceipt(fuel, txs, [{ ...legacyPaid, date: '2026-08-07' }])?.id).toBe('t1');
        expect(findReconciledLineForReceipt(fuel, txs, [{ ...legacyPaid, date: '2026-09-18' }])?.id).toBe('t1');
    });

    it('ignores rivals that are linked, On Account, or a different amount', () => {
        const txs = [line('t1', '2026-09-12', -45.5)];
        const rivals = [
            { id: 'a', amount: 45.5, date: '2026-09-11', paymentType: 'Direct', reconciledByTxId: 'tX' },
            { id: 'b', amount: 45.5, date: '2026-09-11', paymentType: 'On Account' },
            { id: 'c', amount: 45.49, date: '2026-09-11', paymentType: 'Direct' },
        ];
        expect(findReconciledLineForReceipt(fuel, txs, rivals)?.id).toBe('t1');
    });

    it('does not count the receipt itself as already linking the line', () => {
        const hit = findReconciledLineForReceipt(fuel, [line('t1', '2026-09-11', -45.5)], [{ id: 'r1', reconciledByTxId: 't1' }]);
        expect(hit?.id).toBe('t1');
    });
});

describe('vatRateForVat', () => {
    it('is 20 when the VAT is gross/6 to the penny (e.g. £22.00 on £132.00)', () => {
        expect(vatRateForVat(132, 22)).toBe(20);
        expect(vatRateForVat(45.5, 7.58)).toBe(20);
    });

    it('is 0 when there is no VAT', () => {
        expect(vatRateForVat(132, 0)).toBe(0);
    });

    it('is undefined (keep the current rate) for any other split', () => {
        expect(vatRateForVat(132, 10)).toBeUndefined();
        expect(vatRateForVat(45.5, 7.57)).toBeUndefined();
    });
});
