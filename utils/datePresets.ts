import { toYYYYMMDD } from './helpers';

export type DatePreset = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year';

export function getPresetRange(preset: DatePreset, today: Date = new Date()): { start: string; end: string } {
    let start: Date;
    let end: Date;

    switch (preset) {
        case 'this_month':
            start = new Date(today.getFullYear(), today.getMonth(), 1);
            end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            break;
        case 'last_month':
            start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            end = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'this_quarter': {
            const quarter = Math.floor(today.getMonth() / 3);
            start = new Date(today.getFullYear(), quarter * 3, 1);
            end = new Date(today.getFullYear(), quarter * 3 + 3, 0);
            break;
        }
        case 'last_quarter': {
            const currentQuarter = Math.floor(today.getMonth() / 3);
            start = new Date(today.getFullYear(), (currentQuarter - 1) * 3, 1);
            end = new Date(today.getFullYear(), currentQuarter * 3, 0);
            break;
        }
        case 'this_year':
            start = new Date(today.getFullYear(), 0, 1);
            end = new Date(today.getFullYear(), 11, 31);
            break;
    }
    return { start: toYYYYMMDD(start), end: toYYYYMMDD(end) };
}
