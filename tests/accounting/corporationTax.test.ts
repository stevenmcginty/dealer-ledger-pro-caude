import { describe, expect, it } from 'vitest';
import { estimateCorporationTax, financialYearOfDay } from '../../utils/accounting/corporationTax';

const FY2025 = { start: '2025-04-01', end: '2026-03-31' };
const ct = (profit: number, extra: Partial<Parameters<typeof estimateCorporationTax>[0]> = {}) =>
    estimateCorporationTax({ period: FY2025, accountingProfit: profit, ...extra });

describe('estimateCorporationTax — rates', () => {
    it('£40k is all at the small profits rate (19%)', () => {
        const r = ct(40000);
        expect(r.tax).toBe(7600);
        expect(r.parts).toHaveLength(1);
        expect(r.parts[0].band).toBe('small_profits');
    });

    it('£100k gets marginal relief: 25% less 3/200 x (250k - 100k)', () => {
        const r = ct(100000);
        expect(r.parts[0].band).toBe('marginal_relief');
        expect(r.parts[0].marginalRelief).toBe(2250);
        expect(r.tax).toBe(22750);
    });

    it('£300k is all at the main rate (25%)', () => {
        expect(ct(300000).tax).toBe(75000);
    });

    it('the band edges: £50k = 19%, £250k = 25%', () => {
        expect(ct(50000).tax).toBe(9500);
        expect(ct(250000).tax).toBe(62500);
    });

    it('a loss or zero profit means no tax', () => {
        expect(ct(-5000).tax).toBe(0);
        expect(ct(0).tax).toBe(0);
    });
});

describe('estimateCorporationTax — limits', () => {
    it('one associated company halves the limits (£25k / £125k)', () => {
        const r = ct(100000, { associatedCompanies: 1 });
        expect(r.parts[0].lowerLimit).toBe(25000);
        expect(r.parts[0].upperLimit).toBe(125000);
        expect(r.tax).toBe(24625);
        expect(ct(40000, { associatedCompanies: 1 }).tax).toBe(8725);
    });

    it('a short period reduces the limits pro rata by days', () => {
        const r = estimateCorporationTax({ period: { start: '2025-04-01', end: '2025-09-30' }, accountingProfit: 60000 });
        expect(r.periodDays).toBe(183);
        expect(r.parts[0].upperLimit).toBeCloseTo(250000 * 183 / 365, 2);
        expect(r.tax).toBe(14019.86);
    });

    it('a 12-month period over a leap day still gets the full limits', () => {
        const r = estimateCorporationTax({ period: { start: '2023-04-01', end: '2024-03-31' }, accountingProfit: 50000 });
        expect(r.periodDays).toBe(366);
        expect(r.parts[0].lowerLimit).toBe(50000);
        expect(r.tax).toBe(9500);
    });
});

describe('estimateCorporationTax — periods spanning 1 April', () => {
    it('splits by days and taxes each part at its own FY rates', () => {
        // Calendar 2023: Jan-Mar is FY2022 (flat 19%), Apr-Dec is FY2023 (19% / 25% with relief).
        const r = estimateCorporationTax({ period: { start: '2023-01-01', end: '2023-12-31' }, accountingProfit: 100000 });
        expect(r.parts.map(p => [p.fy, p.start, p.end, p.days])).toEqual([
            [2022, '2023-01-01', '2023-03-31', 90],
            [2023, '2023-04-01', '2023-12-31', 275],
        ]);
        expect(r.parts[0].tax).toBe(4684.93);
        expect(r.parts[1].band).toBe('marginal_relief');
        expect(r.parts[1].tax).toBe(17140.41);
        expect(r.tax).toBe(21825.34);
    });

    it('when the rates match on both sides, the split gives the same tax as one year', () => {
        const r = estimateCorporationTax({ period: { start: '2026-01-01', end: '2026-12-31' }, accountingProfit: 100000 });
        expect(r.parts.map(p => p.fy)).toEqual([2025, 2026]);
        expect(r.tax).toBe(22750);
    });

    it('financialYearOfDay: 1 April starts the new FY', () => {
        expect(financialYearOfDay('2026-03-31')).toBe(2025);
        expect(financialYearOfDay('2026-04-01')).toBe(2026);
    });
});

describe('estimateCorporationTax — adjustments and steps', () => {
    it('applies add-backs, capital allowances, write-downs and losses brought forward', () => {
        const r = ct(40000, {
            adjustments: [
                { kind: 'add_back', amount: 5000 },
                { kind: 'capital_allowance', amount: 3000 },
                { kind: 'stock_write_down', amount: 1000 },
                { kind: 'other_deduction', amount: 1000 },
                { kind: 'loss_brought_forward', amount: 10000 },
            ],
        });
        expect(r.adjustedProfit).toBe(40000);
        expect(r.lossesUsed).toBe(10000);
        expect(r.taxableProfit).toBe(30000);
        expect(r.tax).toBe(5700);
        expect(r.lossesCarriedForward).toBe(0);
        expect(r.steps[0]).toEqual({ label: 'Net profit per the P&L', amount: 40000 });
        expect(r.steps[r.steps.length - 1]).toEqual({ label: 'Estimated corporation tax', amount: 5700 });
    });

    it('carries forward unused losses plus a loss made this year', () => {
        const r = ct(-5000, { adjustments: [{ kind: 'loss_brought_forward', amount: 2000 }] });
        expect(r.taxableProfit).toBe(0);
        expect(r.lossesUsed).toBe(0);
        expect(r.lossesCarriedForward).toBe(7000);
    });

    it('flags a financial year beyond the rate table as assumed', () => {
        const r = estimateCorporationTax({ period: { start: '2030-04-01', end: '2031-03-31' }, accountingProfit: 100000 });
        expect(r.parts[0].ratesAssumed).toBe(true);
        expect(r.warnings.length).toBeGreaterThan(0);
        expect(r.tax).toBe(22750);
    });
});
