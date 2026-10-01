import { describe, expect, it } from 'vitest';
import { addDays, addMonths, buildMonthGrid, formatUkDate, isoToParts, parseUkDate } from '../utils/ukDate';

describe('parseUkDate', () => {
    it('reads DD/MM/YYYY', () => {
        expect(parseUkDate('30/09/2026')).toBe('2026-09-30');
    });

    it('reads the friendly forms', () => {
        expect(parseUkDate('1/2/26')).toBe('2026-02-01');
        expect(parseUkDate('30-09-2026')).toBe('2026-09-30');
        expect(parseUkDate('30.09.2026')).toBe('2026-09-30');
        expect(parseUkDate('30 9 2026')).toBe('2026-09-30');
        expect(parseUkDate('30092026')).toBe('2026-09-30');
        expect(parseUkDate('300926')).toBe('2026-09-30');
        expect(parseUkDate('  5/4/2026 ')).toBe('2026-04-05');
    });

    it('accepts a pasted ISO date', () => {
        expect(parseUkDate('2026-09-30')).toBe('2026-09-30');
    });

    it('treats recent two-digit years as 20xx and old ones as 19xx', () => {
        expect(parseUkDate('01/01/00')).toBe('2000-01-01');
        expect(parseUkDate('30/09/26')).toBe('2026-09-30');
        expect(parseUkDate('31/12/99')).toBe('1999-12-31');
    });

    it('returns empty string for blank input', () => {
        expect(parseUkDate('')).toBe('');
        expect(parseUkDate('   ')).toBe('');
    });

    it('rejects dates that do not exist', () => {
        expect(parseUkDate('31/02/2026')).toBeNull();
        expect(parseUkDate('31/04/2026')).toBeNull();
        expect(parseUkDate('00/01/2026')).toBeNull();
        expect(parseUkDate('12/13/2026')).toBeNull();
    });

    it('allows 29 February only in leap years', () => {
        expect(parseUkDate('29/02/2028')).toBe('2028-02-29');
        expect(parseUkDate('29/02/2024')).toBe('2024-02-29');
        expect(parseUkDate('29/02/2026')).toBeNull();
        expect(parseUkDate('29/02/2100')).toBeNull();
    });

    it('rejects junk and out-of-range years', () => {
        expect(parseUkDate('hello')).toBeNull();
        expect(parseUkDate('30/09')).toBeNull();
        expect(parseUkDate('30/09/202')).toBeNull();
        expect(parseUkDate('30/09/3026')).toBeNull();
        expect(parseUkDate('3009202')).toBeNull();
    });
});

describe('formatUkDate', () => {
    it('formats ISO as DD/MM/YYYY', () => {
        expect(formatUkDate('2026-09-30')).toBe('30/09/2026');
        expect(formatUkDate('2026-01-05T10:00:00')).toBe('05/01/2026');
    });

    it('returns empty for missing or broken values', () => {
        expect(formatUkDate('')).toBe('');
        expect(formatUkDate(undefined)).toBe('');
        expect(formatUkDate('2026-02-31')).toBe('');
    });

    it('round-trips through parseUkDate', () => {
        expect(parseUkDate(formatUkDate('2028-02-29'))).toBe('2028-02-29');
    });
});

describe('calendar arithmetic', () => {
    it('adds days across month, year and DST boundaries', () => {
        expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
        expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
    });

    it('adds months and clamps the day', () => {
        expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
        expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
        expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
        expect(addMonths('2026-03-31', -3)).toBe('2025-12-31');
    });

    it('builds a Monday-first six-week grid', () => {
        const grid = buildMonthGrid(2026, 9); // 1 Sep 2026 is a Tuesday
        expect(grid).toHaveLength(42);
        expect(grid[0]).toEqual({ iso: '2026-08-31', day: 31, inMonth: false });
        expect(grid[1]).toEqual({ iso: '2026-09-01', day: 1, inMonth: true });
        expect(grid.filter(d => d.inMonth)).toHaveLength(30);
        expect(isoToParts(grid[41].iso)).toEqual({ y: 2026, m: 10, d: 11 });
    });

    it('starts on the 1st when the month begins on a Monday', () => {
        const grid = buildMonthGrid(2026, 6); // 1 Jun 2026 is a Monday
        expect(grid[0].iso).toBe('2026-06-01');
    });
});
