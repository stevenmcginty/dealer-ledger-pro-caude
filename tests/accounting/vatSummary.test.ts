import { describe, expect, it } from 'vitest';
import { computeVatSummary } from '../../components/reporting/VatSummary';
import type { VatAdjustment } from '../../types';
import { vehicle, sale, tx, Q3, emptyLedger } from './fixtures';

// A small Q3 ledger: one margin sale (£5,000 margin), one VAT-able bank receipt and one
// expense bank line with £20 VAT.
const ledger = {
    ...emptyLedger,
    vehicles: [vehicle({ id: 'v1', purchasePrice: 5000 })],
    salesDocs: [sale({ id: 's1', vehicleId: 'v1', price: 10000 })],
    transactions: [
        tx({ id: 't-in', amount: 600, vatAmount: 100, date: '2026-08-01' }),
        tx({ id: 't-out', amount: -120, vatAmount: 20, date: '2026-08-02' }),
    ],
};
const run = (vatAdjustments?: VatAdjustment[]) => computeVatSummary({
    startDate: Q3.start, endDate: Q3.end, salesDocs: ledger.salesDocs, vehicles: ledger.vehicles,
    miscInvoices: ledger.miscInvoices, transactions: ledger.transactions, isServiceBusiness: false,
    jobInvoices: ledger.jobInvoices, vatAdjustments,
});
const adj = (o: Partial<VatAdjustment> & { id: string; amount: number }): VatAdjustment =>
    ({ date: '2026-09-30', box: 'input', description: 'Late claim', ...o });

describe('computeVatSummary — VAT adjustments', () => {
    it('without adjustments gives the same figures as before', () => {
        const r = run();
        expect(r.totalMarginVat).toBeCloseTo(5000 / 6, 6);
        expect(r.otherOutputVat).toBe(100);
        expect(r.totalOutputVat).toBeCloseTo(5000 / 6 + 100, 6);
        expect(r.totalInputVat).toBe(20);
        expect(r.vatDue).toBeCloseTo(5000 / 6 + 100 - 20, 6);
        expect(r.totalSalesNet).toBe(10000);
        expect(r.totalExpensesNet).toBe(100);
        expect(r.adjustmentInputVat).toBe(0);
        expect(r.adjustmentOutputVat).toBe(0);
        expect(run([])).toEqual(r);
    });

    it('an input adjustment in the period raises input VAT and lowers VAT due by exactly its amount', () => {
        const base = run();
        const r = run([adj({ id: 'a1', amount: 1844.57 })]);
        expect(r.adjustmentInputVat).toBe(1844.57);
        expect(r.totalInputVat).toBeCloseTo(base.totalInputVat + 1844.57, 6);
        expect(r.vatDue).toBeCloseTo(base.vatDue - 1844.57, 6);
        expect(r.totalOutputVat).toBe(base.totalOutputVat);
    });

    it('counts the period end day and ignores the day after (and the day before the start)', () => {
        const base = run();
        expect(run([adj({ id: 'end', amount: 50, date: '2026-09-30' })]).totalInputVat).toBeCloseTo(base.totalInputVat + 50, 6);
        expect(run([adj({ id: 'start', amount: 50, date: '2026-07-01' })]).totalInputVat).toBeCloseTo(base.totalInputVat + 50, 6);
        const outside = run([adj({ id: 'after', amount: 50, date: '2026-10-01' }), adj({ id: 'before', amount: 70, date: '2026-06-30', box: 'output' })]);
        expect(outside).toEqual(base);
    });

    it('an output adjustment raises output VAT and VAT due by exactly its amount', () => {
        const base = run();
        const r = run([adj({ id: 'o1', amount: 250, box: 'output' })]);
        expect(r.adjustmentOutputVat).toBe(250);
        expect(r.totalOutputVat).toBeCloseTo(base.totalOutputVat + 250, 6);
        expect(r.vatDue).toBeCloseTo(base.vatDue + 250, 6);
        expect(r.totalInputVat).toBe(base.totalInputVat);
    });

    it('leaves net sales and net expenses (Box 6 / Box 7) unchanged', () => {
        const base = run();
        const r = run([adj({ id: 'a1', amount: 1844.57 }), adj({ id: 'o1', amount: 250, box: 'output' })]);
        expect(r.totalExpensesNet).toBe(base.totalExpensesNet);
        expect(r.totalSalesNet).toBe(base.totalSalesNet);
    });
});
