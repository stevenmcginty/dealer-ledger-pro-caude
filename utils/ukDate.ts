// Pure UK date helpers for the shared date field (components/common/UkDateInput.tsx).
// Values are always 'YYYY-MM-DD' built from local date parts — never toISOString(),
// which shifts the day for anyone east/west of UTC.

export interface DateParts { y: number; m: number; d: number } // m is 1-12

const pad = (n: number) => String(n).padStart(2, '0');

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export const daysInMonth = (y: number, m: number): number => new Date(y, m, 0).getDate();

export const isValidParts = ({ y, m, d }: DateParts): boolean =>
    Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d) &&
    y >= MIN_YEAR && y <= MAX_YEAR && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);

export const partsToIso = ({ y, m, d }: DateParts): string => `${y}-${pad(m)}-${pad(d)}`;

/** 'YYYY-MM-DD' (optionally followed by a time) → parts, or null. */
export const isoToParts = (iso: string | null | undefined): DateParts | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!match) return null;
    const parts = { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
    return isValidParts(parts) ? parts : null;
};

export const dateToIso = (date: Date): string =>
    partsToIso({ y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() });

export const todayIso = (): string => dateToIso(new Date());

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'; anything unreadable → ''. */
export const formatUkDate = (iso: string | null | undefined): string => {
    const p = isoToParts(iso);
    return p ? `${pad(p.d)}/${pad(p.m)}/${p.y}` : '';
};

// Two-digit years within ten years ahead of now are 20xx, older ones 19xx (so '98' on a V5 is 1998).
const expandYear = (raw: string): number => {
    if (raw.length !== 2) return Number(raw);
    const yy = Number(raw);
    return yy <= (new Date().getFullYear() % 100) + 10 ? 2000 + yy : 1900 + yy;
};

/**
 * Parse what a UK user types into 'YYYY-MM-DD'.
 * Accepts D/M/YY, DD/MM/YYYY with '/', '-', '.' or space separators, DDMMYY, DDMMYYYY,
 * and a pasted ISO 'YYYY-MM-DD'. Two-digit years up to ten years ahead mean 20xx, older ones 19xx.
 * Returns '' for blank input and null when the text is not a real date (e.g. 31/02/2026).
 */
export const parseUkDate = (input: string): string | null => {
    const text = (input || '').trim();
    if (!text) return '';

    let parts: DateParts | null = null;
    let m: RegExpExecArray | null;

    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text))) {
        parts = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
    } else if ((m = /^(\d{1,2})\s*[/.\-\s]\s*(\d{1,2})\s*[/.\-\s]\s*(\d{2}|\d{4})$/.exec(text))) {
        parts = { d: Number(m[1]), m: Number(m[2]), y: expandYear(m[3]) };
    } else if ((m = /^(\d{2})(\d{2})(\d{4}|\d{2})$/.exec(text))) {
        parts = { d: Number(m[1]), m: Number(m[2]), y: expandYear(m[3]) };
    }

    return parts && isValidParts(parts) ? partsToIso(parts) : null;
};

/** Shift a date by whole days (local calendar arithmetic, DST-safe). */
export const addDays = (iso: string, days: number): string => {
    const p = isoToParts(iso);
    if (!p) return iso;
    return dateToIso(new Date(p.y, p.m - 1, p.d + days));
};

/** Shift a date by whole months, clamping the day (31 Jan + 1 month → 28/29 Feb). */
export const addMonths = (iso: string, months: number): string => {
    const p = isoToParts(iso);
    if (!p) return iso;
    const first = new Date(p.y, p.m - 1 + months, 1);
    const y = first.getFullYear();
    const m = first.getMonth() + 1;
    return partsToIso({ y, m, d: Math.min(p.d, daysInMonth(y, m)) });
};

/** 0 = Monday … 6 = Sunday. */
export const mondayIndex = (iso: string): number => {
    const p = isoToParts(iso);
    if (!p) return 0;
    return (new Date(p.y, p.m - 1, p.d).getDay() + 6) % 7;
};

export interface CalendarDay { iso: string; day: number; inMonth: boolean }

/** Six Monday-first weeks (42 days) covering the given month (m is 1-12). */
export const buildMonthGrid = (y: number, m: number): CalendarDay[] => {
    const first = partsToIso({ y, m, d: 1 });
    const start = addDays(first, -mondayIndex(first));
    const out: CalendarDay[] = [];
    for (let i = 0; i < 42; i++) {
        const iso = addDays(start, i);
        const p = isoToParts(iso)!;
        out.push({ iso, day: p.d, inMonth: p.m === m && p.y === y });
    }
    return out;
};

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
