import { describe, it, expect } from 'vitest';
import { pickAutoMatches, supplierOverlap, AutoMatchTx, AutoMatchReceipt } from '../utils/statementAutoMatch';

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
