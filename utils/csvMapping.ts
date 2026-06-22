import Papa from 'papaparse';
import { StatementColumnMapping, StatementDateFormat } from '../types';
import { robustDateParser } from './helpers';

// Parse raw CSV text into a trimmed header row + array of row-objects keyed by header.
// Mirrors the tolerant parsing used in dataService.processStatement (trailing-comma handling, empty-row skip).
export const parseCsvText = (text: string): { headers: string[]; rows: Record<string, string>[] } => {
    const result = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
    const data = (result.data || []) as string[][];
    if (data.length === 0) return { headers: [], rows: [] };

    let headers = (data[0] || []).map(h => (h ? String(h).trim() : ''));
    // A trailing empty header usually means a trailing comma in the header row.
    if (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();

    const rows = data.slice(1)
        .filter(row => row.some(field => field && String(field).trim() !== ''))
        .map(row => {
            const obj: Record<string, string> = {};
            headers.forEach((header, i) => { obj[header] = row[i]; });
            return obj;
        });

    return { headers, rows };
};

export const extractCSVHeaders = (text: string): string[] => parseCsvText(text).headers;

export const previewCSVRows = (text: string, count = 5): Record<string, string>[] =>
    parseCsvText(text).rows.slice(0, count);

// Parse a date string using a known format, falling back to the app's robust parser.
// Returns YYYY-MM-DD or null.
export const parseStatementDate = (dateStr: string, format?: StatementDateFormat): string | null => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const cleaned = dateStr.trim();

    let day: string | undefined, month: string | undefined, year: string | undefined;
    if (format === 'YYYY-MM-DD') {
        const m = cleaned.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (m) { year = m[1]; month = m[2]; day = m[3]; }
    } else if (format === 'MM/DD/YYYY') {
        const m = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (m) { month = m[1]; day = m[2]; year = m[3]; }
    } else if (format === 'DD/MM/YYYY' || format === 'DD-MM-YYYY') {
        const m = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (m) { day = m[1]; month = m[2]; year = m[3]; }
    }

    if (day && month && year) {
        if (year.length === 2) year = String(2000 + parseInt(year, 10));
        const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const date = new Date(`${iso}T00:00:00Z`);
        if (!isNaN(date.getTime())) return iso;
    }

    // Unknown/odd format — let the robust parser have a go.
    return robustDateParser(cleaned);
};

export interface MappedTransaction {
    date: string | null;
    description: string;
    amount: number;
    method?: string;
    valid: boolean;
}

// Resolve a column reference (stored as header text) against a row, case-insensitively.
const getCell = (row: Record<string, string>, column?: string): string | undefined => {
    if (!column) return undefined;
    const target = column.trim().toLowerCase();
    const key = Object.keys(row).find(k => k.trim().toLowerCase() === target);
    return key !== undefined ? row[key] : undefined;
};

const toNumber = (raw?: string): number => {
    if (raw === undefined || raw === null) return 0;
    const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
    return isNaN(n) ? 0 : n;
};

// Apply a saved column mapping to a single parsed CSV row.
export const applyColumnMapping = (row: Record<string, string>, mapping: StatementColumnMapping): MappedTransaction => {
    const date = parseStatementDate(getCell(row, mapping.dateColumn) || '', mapping.dateFormat);
    const description = (getCell(row, mapping.descriptionColumn) || '').trim();

    let amount = 0;
    if (mapping.amountMode === 'split') {
        const debit = toNumber(getCell(row, mapping.debitColumn));
        const credit = toNumber(getCell(row, mapping.creditColumn));
        amount = credit - debit; // money in positive, money out negative
    } else {
        const rawCell = getCell(row, mapping.amountColumn);
        const raw = rawCell !== undefined ? parseFloat(String(rawCell).replace(/[^\d.-]/g, '')) : NaN;
        amount = isNaN(raw) ? 0 : (mapping.invertAmountSign ? -raw : raw);
    }

    const methodCell = getCell(row, mapping.methodColumn);
    return {
        date,
        description,
        amount,
        method: methodCell || undefined,
        valid: !!date && !!description && amount !== 0,
    };
};

// True when a mapping has the minimum required columns to be usable.
export const isMappingComplete = (m?: StatementColumnMapping): boolean => {
    if (!m) return false;
    if (!m.dateColumn || !m.descriptionColumn || !m.dateFormat) return false;
    if (m.amountMode === 'single') return !!m.amountColumn;
    if (m.amountMode === 'split') return !!(m.debitColumn && m.creditColumn);
    return false;
};
