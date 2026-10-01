import { describe, expect, it } from 'vitest';
import {
    computeDirectorSalary, readDirectorSalaries, salaryPaymentOwner, monthEndsBetween, unpaidSalaryDeadline, unpaidSalaryByYear,
} from '../../utils/accounting/directorSalary';
import { computeProfitAndLoss, ProfitAndLossInput } from '../../utils/accounting/profitAndLoss';
import type { DirectorSalary } from '../../types';
import { tx, receipt, emptyLedger } from './fixtures';

const FY = { start: '2025-04-01', end: '2026-03-31' };
const jo: DirectorSalary = { name: 'Jo Bloggs', monthlyGross: 1000, from: '2025-04-01' };
const wage = (id: string, date: string, amount: number, description = 'JO BLOGGS SALARY') =>
    tx({ id, date, amount: -amount, description, category: 'Wages' });

describe('readDirectorSalaries', () => {
    it('empty or missing setting = no salaries', () => {
        expect(readDirectorSalaries(undefined)).toEqual([]);
        expect(readDirectorSalaries([])).toEqual([]);
    });

    it('accepts an object (as the database may return it) and drops bad entries', () => {
        const r = readDirectorSalaries({
            0: { name: ' Jo Bloggs ', monthlyGross: '1000', from: '2025-04-01', to: '' },
            1: { name: '', monthlyGross: 500, from: '2025-04-01' },
            2: { name: 'No Amount', monthlyGross: 0, from: '2025-04-01' },
            3: { name: 'No Date', monthlyGross: 500, from: '' },
        });
        expect(r).toEqual([{ name: 'Jo Bloggs', monthlyGross: 1000, from: '2025-04-01' }]);
    });
});

describe('payroll months', () => {
    it('month-ends in a range, inclusive', () => {
        expect(monthEndsBetween('2025-11-15', '2026-02-28')).toEqual(['2025-11-30', '2025-12-31', '2026-01-31', '2026-02-28']);
        expect(monthEndsBetween('2026-01-01', '2026-01-30')).toEqual([]);
    });

    it('a full year from 1 April is 12 months due', () => {
        const r = computeDirectorSalary({ range: FY, salaries: [jo], transactions: [] });
        expect(r.lines[0].monthsDue).toBe(12);
        expect(r.due).toBe(12000);
    });

    it('starts at the from-date and stops at the to-date', () => {
        const r = computeDirectorSalary({ range: FY, salaries: [{ ...jo, from: '2025-10-01', to: '2026-01-31' }], transactions: [] });
        expect(r.lines[0].monthsDue).toBe(4); // Oct, Nov, Dec, Jan
    });
});

describe('paid and owed', () => {
    it('Steve-shaped year: £12,000 due, £1,960 paid, business owes £10,040', () => {
        const r = computeDirectorSalary({
            range: FY,
            salaries: [{ ...jo, name: 'Steven McGinty' }],
            transactions: [
                wage('n', '2025-11-28', 960, 'STEVEN MCGINTY NOV'),
                wage('d', '2025-12-30', 1000, 'To Steven Mcginty, Loan'),
            ],
        });
        const l = r.lines[0];
        expect(l.due).toBe(12000);
        expect(l.paid).toBe(1960);
        expect(l.balance).toBe(10040);
        expect(l.status).toBe('owed');
        expect(l.message).toBe("the business owes Steven McGinty £10,040.00 (unpaid salary, director's loan account)");
        expect(r.paymentTxIds.sort()).toEqual(['d', 'n']);
    });

    it('the balance runs from the salary start to the period end, not just the period', () => {
        const r = computeDirectorSalary({
            range: { start: '2026-04-01', end: '2026-06-30' },
            salaries: [jo],
            transactions: [wage('old', '2025-12-30', 2000), wage('new', '2026-05-28', 500)],
        });
        const l = r.lines[0];
        expect(l.due).toBe(3000);
        expect(l.paid).toBe(500);
        expect(l.dueToDate).toBe(15000);
        expect(l.paidToDate).toBe(2500);
        expect(l.balance).toBe(12500);
        expect(r.paymentTxIds).toEqual(['new']);
    });

    it('taking more than the salary is an overdrawn loan account', () => {
        const r = computeDirectorSalary({
            range: { start: '2025-04-01', end: '2025-04-30' },
            salaries: [jo],
            transactions: [wage('big', '2025-04-20', 5000)],
        });
        expect(r.lines[0].balance).toBe(-4000);
        expect(r.lines[0].status).toBe('overdrawn');
        expect(r.lines[0].message).toBe("Jo Bloggs has taken £4,000.00 more than salary (overdrawn director's loan account — check with the accountant)");
    });

    it('only counts reconciled wages lines out, with the surname, on or after the start', () => {
        const owner = (t: ReturnType<typeof tx>) => salaryPaymentOwner(t, [jo])?.name ?? null;
        expect(owner(wage('ok', '2025-05-01', 100, 'BLOGGS J'))).toBe('Jo Bloggs');
        expect(owner(wage('staff', '2025-05-01', 100, 'A SMITH WAGES'))).toBeNull();
        expect(owner(wage('early', '2025-03-31', 100))).toBeNull();
        expect(owner(tx({ id: 'cat', date: '2025-05-01', amount: -100, description: 'JO BLOGGS', category: 'Drawings' }))).toBeNull();
        expect(owner(tx({ id: 'in', date: '2025-05-01', amount: 100, description: 'JO BLOGGS', category: 'Wages' }))).toBeNull();
        expect(owner({ ...wage('u', '2025-05-01', 100), status: 'Unreconciled' } as ReturnType<typeof tx>)).toBeNull();
    });
});

describe('P&L with a director salary', () => {
    const pnl = (o: Partial<ProfitAndLossInput>) =>
        computeProfitAndLoss({ ...emptyLedger, range: FY, isVatRegistered: true, ...o });
    const transactions = [
        wage('n', '2025-11-28', 960),
        wage('d', '2025-12-30', 1000),
        wage('staff', '2025-12-30', 300, 'A SMITH'),
        tx({ id: 'rent', date: '2025-06-01', amount: -500, category: 'Rent' }),
    ];

    it('no salary set: wages are the bank lines, exactly as before', () => {
        const r = pnl({ transactions });
        expect(r.expenses.byCategory.find(c => c.category === 'Wages')?.net).toBe(2260);
        expect(r.directorSalary).toBeUndefined();
        expect(r.netProfit).toBe(-2760);
    });

    it('salary set: wages = salary due + staff wages; the salary payments are not counted twice', () => {
        const r = pnl({ transactions, directorSalaries: [jo] });
        expect(r.expenses.byCategory.find(c => c.category === 'Wages')?.net).toBe(12300);
        expect(r.expenses.total).toBe(12800);
        expect(r.netProfit).toBe(-12800);
        expect(r.directorSalary?.paid).toBe(1960);
        expect(r.directorSalary?.balance).toBe(10040);
        // The Expenses & VAT rows are unchanged.
        expect(r.rows.filter(x => x.category === 'Wages')).toHaveLength(3);
    });

    it('adds a Wages line when there were no wages bank lines', () => {
        const r = pnl({ transactions: [], directorSalaries: [jo], range: { start: '2025-04-01', end: '2025-06-30' } });
        expect(r.expenses.byCategory).toEqual([{ category: 'Wages', net: 3000, vat: 0, gross: 3000, count: 3 }]);
    });
});

describe('unpaidSalaryDeadline', () => {
    it('is 9 months after the year end', () => {
        expect(unpaidSalaryDeadline('2026-03-31')).toBe('2026-12-31');
        expect(unpaidSalaryDeadline('2025-09-30')).toBe('2026-06-30');
        expect(unpaidSalaryDeadline('2026-05-31')).toBe('2027-02-28');
    });
});

describe('never due before the month has ended', () => {
    const steve: DirectorSalary = { name: 'Steven McGinty', monthlyGross: 1000, from: '2025-04-01' };
    const paid = [
        wage('n', '2025-11-28', 960, 'STEVEN MCGINTY NOV'),
        wage('d', '2025-12-30', 1000, 'To Steven Mcginty, Loan'),
        wage('s', '2026-09-25', 5000, 'STEVEN MCGINTY'),
    ];
    const thisQuarter = { start: '2026-10-01', end: '2026-12-31' };

    it('this quarter on 1 Oct 2026: nothing due yet in the quarter, owed £11,040 (not £14,040)', () => {
        const r = computeDirectorSalary({ range: thisQuarter, salaries: [steve], transactions: paid, today: '2026-10-01' });
        expect(r.asOf).toBe('2026-10-01');
        expect(r.lines[0].monthsDue).toBe(0);
        expect(r.lines[0].dueToDate).toBe(18000);
        expect(r.lines[0].balance).toBe(11040);
    });

    it('the P&L does not accrue month-ends after today', () => {
        const r = computeProfitAndLoss({ ...emptyLedger, range: thisQuarter, isVatRegistered: true, transactions: paid, directorSalaries: [steve], today: '2026-11-15' });
        expect(r.directorSalary?.due).toBe(1000); // October only
        expect(r.expenses.byCategory.find(c => c.category === 'Wages')?.net).toBe(1000);
    });

    it('splits the unpaid balance into this year and earlier years', () => {
        const fy2627 = unpaidSalaryByYear({ range: { start: '2026-04-01', end: '2027-03-31' }, salaries: [steve], transactions: paid, today: '2026-10-01', yearStart: '2026-04-01' });
        expect(fy2627).toEqual([{ name: 'Steven McGinty', thisYear: 1000, earlierYears: 10040, total: 11040 }]);
        const fy2526 = unpaidSalaryByYear({ range: FY, salaries: [steve], transactions: paid, today: '2026-10-01', yearStart: FY.start });
        expect(fy2526).toEqual([{ name: 'Steven McGinty', thisYear: 10040, earlierYears: 0, total: 10040 }]);
    });
});

describe('a receipt linked to a salary payment', () => {
    it('is not counted on top of the accrued salary', () => {
        const q = { start: '2025-04-01', end: '2025-06-30' };
        const r = computeProfitAndLoss({
            ...emptyLedger, range: q, isVatRegistered: true, today: '2026-10-01', directorSalaries: [jo],
            transactions: [wage('pay', '2025-05-28', 1000)],
            receipts: [receipt({ id: 'slip', date: '2025-05-28', amount: 1000, vat: 0, category: 'Wages', vendor: 'Jo Bloggs', reconciledByTxId: 'pay' })],
        });
        expect(r.expenses.byCategory.find(c => c.category === 'Wages')?.net).toBe(3000);
        expect(r.directorSalary?.paid).toBe(1000);
    });
});
