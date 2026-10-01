import { describe, expect, it } from 'vitest';
import { getPresetRange } from '../utils/datePresets';

describe('getPresetRange', () => {
    const oct1 = new Date(2026, 9, 1);

    it('last_quarter on 1 Oct 2026 is Jul-Sep', () => {
        expect(getPresetRange('last_quarter', oct1)).toEqual({ start: '2026-07-01', end: '2026-09-30' });
    });
    it('this_quarter on 1 Oct 2026 is Oct-Dec', () => {
        expect(getPresetRange('this_quarter', oct1)).toEqual({ start: '2026-10-01', end: '2026-12-31' });
    });
    it('last_month on 1 Oct 2026 is September', () => {
        expect(getPresetRange('last_month', oct1)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    });
    it('this_year is the calendar year', () => {
        expect(getPresetRange('this_year', oct1)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    });
    it('last_quarter during Q1 is Oct-Dec of the previous year', () => {
        expect(getPresetRange('last_quarter', new Date(2026, 1, 15))).toEqual({ start: '2025-10-01', end: '2025-12-31' });
    });
    it('this_month end handles February', () => {
        expect(getPresetRange('this_month', new Date(2026, 1, 15)).end).toBe('2026-02-28');
    });
    it('last_month in January is December of the previous year', () => {
        expect(getPresetRange('last_month', new Date(2026, 0, 10))).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    });
});
