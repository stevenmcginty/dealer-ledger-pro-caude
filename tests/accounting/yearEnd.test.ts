import { describe, expect, it } from 'vitest';
import {
    financialYearContaining, financialYearEnding, lastFinancialYear, parseYearEnd, thisFinancialYear, toDay, daysInclusive,
} from '../../utils/accounting/yearEnd';

const oct1 = new Date(2026, 9, 1);

describe('accounting year from the year-end setting', () => {
    it('defaults to a 31 March year end', () => {
        expect(parseYearEnd(undefined)).toEqual({ month: 3, day: 31 });
        expect(parseYearEnd('13-01')).toEqual({ month: 3, day: 31 });
        expect(thisFinancialYear(undefined, oct1)).toMatchObject({ start: '2026-04-01', end: '2027-03-31', periodKey: '2026-04-01_2027-03-31' });
        expect(lastFinancialYear(undefined, oct1)).toMatchObject({ start: '2025-04-01', end: '2026-03-31', label: 'Year to 31 Mar 2026' });
    });

    it('the year-end day itself belongs to the year that ends on it', () => {
        expect(financialYearContaining('2026-03-31', '03-31')).toMatchObject({ start: '2025-04-01', end: '2026-03-31' });
        expect(financialYearContaining('2026-04-01', '03-31')).toMatchObject({ start: '2026-04-01', end: '2027-03-31' });
    });

    it('supports a 31 December year end', () => {
        expect(thisFinancialYear('12-31', oct1)).toMatchObject({ start: '2026-01-01', end: '2026-12-31' });
        expect(lastFinancialYear('12-31', oct1)).toMatchObject({ start: '2025-01-01', end: '2025-12-31' });
    });

    it('supports a mid-month year end', () => {
        expect(thisFinancialYear('09-30', oct1)).toMatchObject({ start: '2026-10-01', end: '2027-09-30' });
        expect(lastFinancialYear('09-30', oct1)).toMatchObject({ start: '2025-10-01', end: '2026-09-30' });
    });

    it('a February month-end follows leap years', () => {
        expect(financialYearEnding(2028, '02-28')).toMatchObject({ start: '2027-03-01', end: '2028-02-29' });
        expect(financialYearEnding(2027, '02-29')).toMatchObject({ start: '2026-03-01', end: '2027-02-28' });
    });
});

describe('date helpers', () => {
    it('toDay reads ISO, UK and timestamp dates', () => {
        expect(toDay('2026-07-01')).toBe('2026-07-01');
        expect(toDay('2026-07-01T23:30:00Z')).toBe('2026-07-01');
        expect(toDay('01/07/2026')).toBe('2026-07-01');
        expect(toDay('')).toBeNull();
        expect(toDay('not a date')).toBeNull();
        expect(toDay(new Date(2026, 6, 1, 12).getTime())).toBe('2026-07-01');
    });

    it('daysInclusive counts both ends', () => {
        expect(daysInclusive('2026-04-01', '2026-04-01')).toBe(1);
        expect(daysInclusive('2025-04-01', '2026-03-31')).toBe(365);
    });
});
