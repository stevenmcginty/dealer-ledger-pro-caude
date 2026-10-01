// Director's salary run by the payroll (the accountant), and what the business still owes.
//
// Setting: businessDetails.directorSalaries, one entry per director: a gross monthly
// salary from a date (and optionally to a date). No entries = nothing changes anywhere.
//
// Rules:
//   - Salary due: one gross month for every month whose month-end falls in the period,
//     on or after `from` and (when set) on or before `to`. Whole payroll months only.
//     Never a month-end after today: salary is not owed before its month has ended.
//   - Paid: reconciled money-out bank/card lines categorised wages, on or after `from`,
//     whose description has the director's surname (the last word of the name). Wages
//     lines with no director's name are staff wages and stay ordinary wages.
//   - Balance (salary start to the period end) = all salary due - all salary paid.
//     Positive: the business owes the director (unpaid salary, a credit on the
//     director's loan account). Negative: the director took more than the salary
//     (overdrawn director's loan account).
//   - The P&L counts the salary due as Wages and does not count the paying bank lines a
//     second time: they settle what is owed.

import type { DirectorSalary, StatementTransaction } from '../../types';
import { normaliseCategory } from './categories';
import { DateRange, addDays, dayOf, daysInMonth, toDay } from './yearEnd';

export interface DirectorSalaryLine {
    name: string;
    monthlyGross: number;
    /** Payroll months due in the period. */
    monthsDue: number;
    /** Salary due in the period (accrued). */
    due: number;
    /** Salary paid in the period. */
    paid: number;
    /** From the salary start to the period end. */
    dueToDate: number;
    paidToDate: number;
    /** dueToDate - paidToDate. Positive = the business owes the director. */
    balance: number;
    status: 'owed' | 'overdrawn' | 'settled';
    /** One sentence for the accountant, e.g. "the business owes Jo Bloggs £3,000.00 (unpaid salary, director's loan account)". */
    message: string;
    /** Bank/card lines in the period that paid this salary. */
    paymentTxIds: string[];
}

export interface DirectorSalarySummary {
    range: DateRange;
    /** The day the figures run to: the period end, or today when the period ends later. */
    asOf: string;
    lines: DirectorSalaryLine[];
    due: number;
    paid: number;
    /** Sum of the balances. */
    balance: number;
    /** Every salary payment line in the period (all directors). */
    paymentTxIds: string[];
}

export interface DirectorSalaryInput {
    range: DateRange;
    salaries: DirectorSalary[];
    transactions: StatementTransaction[];
    /** 'YYYY-MM-DD'. Month-ends after it are not due yet. Default: today. */
    today?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

/** Category names that mean wages / salary. */
const WAGES = ['wages', 'wage', 'salary', 'salaries', 'wages and salaries', 'wages & salaries', 'payroll'];
export const isWagesCategory = (category: string | null | undefined): boolean => WAGES.includes(normaliseCategory(category));

const gbp = (n: number) => `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Read the stored setting (an array, or an object if the database turned it into one). Bad entries are dropped. */
export function readDirectorSalaries(raw: unknown): DirectorSalary[] {
    if (!raw || typeof raw !== 'object') return [];
    const list = Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>);
    const out: DirectorSalary[] = [];
    for (const e of list) {
        if (!e || typeof e !== 'object') continue;
        const s = e as Partial<DirectorSalary>;
        const name = (s.name ?? '').toString().trim();
        const monthlyGross = Number(s.monthlyGross);
        const from = toDay(s.from);
        if (!name || !isFinite(monthlyGross) || monthlyGross <= 0 || !from) continue;
        const to = toDay(s.to);
        out.push({ name, monthlyGross: round2(monthlyGross), from, ...(to ? { to } : {}) });
    }
    return out;
}

/** The director's surname for matching bank descriptions: the last word of the name, lower case. */
const surnameOf = (name: string): string => {
    const words = name.toLowerCase().split(/[^a-z'-]+/).filter(w => w.length >= 2);
    return words[words.length - 1] ?? '';
};

/** The director a bank/card line paid salary to, or null. Ignores the date. */
export function salaryPaymentOwner(tx: StatementTransaction, salaries: DirectorSalary[]): DirectorSalary | null {
    if (tx.status !== 'Reconciled' || tx.reconciliationType === 'transfer') return null;
    if (!((Number(tx.amount) || 0) < 0) || !isWagesCategory(tx.category)) return null;
    const desc = (tx.description || '').toLowerCase();
    const day = toDay(tx.date);
    for (const s of salaries) {
        const surname = surnameOf(s.name);
        if (surname && desc.includes(surname) && day && day >= s.from) return s;
    }
    return null;
}

/** Month-ends (YYYY-MM-DD) from `start` to `end` inclusive. */
export function monthEndsBetween(start: string, end: string): string[] {
    const out: string[] = [];
    if (end < start) return out;
    let y = +start.slice(0, 4);
    let m = +start.slice(5, 7);
    for (;;) {
        const me = `${y}-${pad(m)}-${pad(daysInMonth(y, m))}`;
        if (me > end) break;
        if (me >= start) out.push(me);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return out;
}

/** Payroll month-ends of one salary that fall in the range. */
export function salaryMonthEnds(s: DirectorSalary, range: DateRange): string[] {
    const start = s.from > range.start ? s.from : range.start;
    const end = s.to && s.to < range.end ? s.to : range.end;
    return monthEndsBetween(start, end);
}

function messageFor(name: string, balance: number): { status: DirectorSalaryLine['status']; message: string } {
    if (balance > 0) return { status: 'owed', message: `the business owes ${name} ${gbp(balance)} (unpaid salary, director's loan account)` };
    if (balance < 0) return { status: 'overdrawn', message: `${name} has taken ${gbp(balance)} more than salary (overdrawn director's loan account — check with the accountant)` };
    return { status: 'settled', message: `${name}'s salary is paid up to date` };
}

export function computeDirectorSalary(input: DirectorSalaryInput): DirectorSalarySummary {
    const { range, salaries, transactions } = input;
    const today = input.today ?? dayOf(new Date());
    const asOf = range.end < today ? range.end : today;
    // Salary is due only for month-ends up to today; payments count up to the period end.
    const dueRange: DateRange = { start: range.start, end: asOf };
    const toDate: DateRange = { start: '0000-01-01', end: asOf };

    const paidIn = new Map<DirectorSalary, { period: number; toDate: number; ids: string[] }>();
    for (const s of salaries) paidIn.set(s, { period: 0, toDate: 0, ids: [] });
    for (const tx of transactions) {
        const owner = salaryPaymentOwner(tx, salaries);
        if (!owner) continue;
        const day = toDay(tx.date)!;
        if (day > range.end) continue;
        const amount = Math.abs(Number(tx.amount) || 0);
        const p = paidIn.get(owner)!;
        p.toDate += amount;
        if (day >= range.start) { p.period += amount; p.ids.push(tx.id); }
    }

    const lines: DirectorSalaryLine[] = salaries.map(s => {
        const monthsDue = salaryMonthEnds(s, dueRange).length;
        const monthsToDate = salaryMonthEnds(s, toDate).length;
        const p = paidIn.get(s)!;
        const dueToDate = round2(monthsToDate * s.monthlyGross);
        const paidToDate = round2(p.toDate);
        const balance = round2(dueToDate - paidToDate);
        return {
            name: s.name,
            monthlyGross: s.monthlyGross,
            monthsDue,
            due: round2(monthsDue * s.monthlyGross),
            paid: round2(p.period),
            dueToDate,
            paidToDate,
            balance,
            ...messageFor(s.name, balance),
            paymentTxIds: p.ids,
        };
    });

    return {
        range,
        asOf,
        lines,
        due: round2(lines.reduce((t, l) => t + l.due, 0)),
        paid: round2(lines.reduce((t, l) => t + l.paid, 0)),
        balance: round2(lines.reduce((t, l) => t + l.balance, 0)),
        paymentTxIds: lines.flatMap(l => l.paymentTxIds),
    };
}

/**
 * The last day unpaid salary for a year can be paid and still be deductible for that
 * year: 9 months after the year end (same day number, or the month's last day).
 */
export function unpaidSalaryDeadline(yearEndDay: string): string {
    const [y, m, d] = yearEndDay.split('-').map(Number);
    let ny = y, nm = m + 9;
    if (nm > 12) { nm -= 12; ny += 1; }
    return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

export interface UnpaidSalarySplit {
    name: string;
    /** Unpaid salary of this financial year: subject to the 9-month deadline. */
    thisYear: number;
    /** Unpaid salary carried in from earlier years. */
    earlierYears: number;
    total: number;
}

/**
 * Split each director's unpaid balance at `range.end` into this financial year's
 * salary and earlier years' arrears. Earlier years' arrears = the balance owed the day
 * before the year started (never more than what is still owed now); the rest is this
 * year's. Directors who are not owed anything are left out.
 */
export function unpaidSalaryByYear(input: DirectorSalaryInput & { yearStart: string }): UnpaidSalarySplit[] {
    const { yearStart, ...rest } = input;
    const now = computeDirectorSalary(rest);
    const before = computeDirectorSalary({ ...rest, range: { start: '0000-01-01', end: addDays(yearStart, -1) } });
    return now.lines.flatMap((l, i) => {
        if (l.balance <= 0) return [];
        const earlierYears = round2(Math.min(l.balance, Math.max(0, before.lines[i].balance)));
        return [{ name: l.name, thisYear: round2(l.balance - earlierYears), earlierYears, total: l.balance }];
    });
}
