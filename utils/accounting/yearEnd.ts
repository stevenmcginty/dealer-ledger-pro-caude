// Date ranges for the accounts: the company's accounting year (from the year-end
// setting) and the plain-string day handling the other accounting modules share.
//
// Every date is handled as a 'YYYY-MM-DD' string. Comparing those strings sorts by
// date, and avoids the UTC-vs-local shift of new Date('YYYY-MM-DD').

/** An inclusive range of days, both 'YYYY-MM-DD'. */
export interface DateRange {
    start: string;
    end: string;
}

export interface FinancialYear extends DateRange {
    /** e.g. 'Year to 31 Mar 2026' */
    label: string;
    /** Stable key for saved year-end adjustments, e.g. '2025-04-01_2026-03-31'. */
    periodKey: string;
}

/** The default accounting year end: 31 March. */
export const DEFAULT_YEAR_END = '03-31';

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** A local Date to 'YYYY-MM-DD'. */
export const dayOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Normalise a stored date to 'YYYY-MM-DD'. Accepts 'YYYY-MM-DD…' (ISO, with or
 * without time), 'DD/MM/YYYY' or 'DD-MM-YYYY' (UK), or a timestamp. null when unreadable.
 */
export function toDay(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : dayOf(d);
    }
    const s = String(value).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : dayOf(d);
}

export const inRange = (day: string | null, range: DateRange): boolean =>
    !!day && day >= range.start && day <= range.end;

/** Whole days from a to b inclusive ('2026-04-01'..'2026-04-01' = 1). */
export function daysInclusive(a: string, b: string): number {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000) + 1;
}

/** Add n days to a 'YYYY-MM-DD'. */
export function addDays(day: string, n: number): string {
    const [y, m, d] = day.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** '2026-03-31' -> '31 Mar 2026' */
export function formatDayShort(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Read a 'MM-DD' year-end setting. Falls back to 31 March when missing or invalid. */
export function parseYearEnd(yearEnd?: string | null): { month: number; day: number } {
    const m = (yearEnd ?? '').match(/^(\d{1,2})-(\d{1,2})$/);
    if (m) {
        const month = +m[1];
        const day = +m[2];
        if (month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(2024, month)) return { month, day };
    }
    return { month: 3, day: 31 };
}

/** The year-end day that falls in calendar year `year`. 29 Feb, or a Feb month-end, becomes 28 Feb in a non-leap year. */
function yearEndIn(year: number, ye: { month: number; day: number }): string {
    const day = Math.min(ye.day, daysInMonth(year, ye.month));
    // A Feb month-end (28 or 29) tracks the last day of February.
    const finalDay = ye.month === 2 && ye.day >= 28 ? daysInMonth(year, 2) : day;
    return `${year}-${pad(ye.month)}-${pad(finalDay)}`;
}

/** The accounting year that ends in calendar year `endYear`. */
export function financialYearEnding(endYear: number, yearEnd?: string | null): FinancialYear {
    const ye = parseYearEnd(yearEnd);
    const end = yearEndIn(endYear, ye);
    const start = addDays(yearEndIn(endYear - 1, ye), 1);
    return { start, end, label: `Year to ${formatDayShort(end)}`, periodKey: `${start}_${end}` };
}

/** The accounting year that contains `date`. */
export function financialYearContaining(date: Date | string, yearEnd?: string | null): FinancialYear {
    const day = typeof date === 'string' ? (toDay(date) ?? dayOf(new Date())) : dayOf(date);
    const year = +day.slice(0, 4);
    const thisYearEnd = financialYearEnding(year, yearEnd);
    return day <= thisYearEnd.end ? thisYearEnd : financialYearEnding(year + 1, yearEnd);
}

/** The accounting year running today (or on `today`). */
export const thisFinancialYear = (yearEnd?: string | null, today: Date = new Date()): FinancialYear =>
    financialYearContaining(today, yearEnd);

/** The accounting year before the one running today. */
export function lastFinancialYear(yearEnd?: string | null, today: Date = new Date()): FinancialYear {
    const current = financialYearContaining(today, yearEnd);
    return financialYearContaining(addDays(current.start, -1), yearEnd);
}

/** Key for saved adjustments that belong to any range (an accounting year or a custom period). */
export const periodKeyOf = (range: DateRange): string => `${range.start}_${range.end}`;
