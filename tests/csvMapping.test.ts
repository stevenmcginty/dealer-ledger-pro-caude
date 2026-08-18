import { describe, it, expect } from 'vitest';
import {
    parseCsvText,
    extractCSVHeaders,
    previewCSVRows,
    parseStatementDate,
    applyColumnMapping,
    isMappingComplete,
} from '../utils/csvMapping';

describe('parseCsvText', () => {
    it('parses headers and rows into objects keyed by header', () => {
        const csv = 'Date,Description,Amount\n2024-01-05,Coffee,4.50\n2024-01-06,Fuel,70.00';
        const { headers, rows } = parseCsvText(csv);
        expect(headers).toEqual(['Date', 'Description', 'Amount']);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({ Date: '2024-01-05', Description: 'Coffee', Amount: '4.50' });
    });

    it('trims header whitespace and drops a trailing empty header (trailing comma)', () => {
        const csv = ' Date , Description ,\n01/02/2024, Widgets,';
        const { headers, rows } = parseCsvText(csv);
        expect(headers).toEqual(['Date', 'Description']);
        expect(rows[0]).toEqual({ Date: '01/02/2024', Description: ' Widgets' });
    });

    it('skips empty and whitespace-only rows', () => {
        const csv = 'A,B\n\n1,2\n   \n3,4';
        const { rows } = parseCsvText(csv);
        expect(rows).toHaveLength(2);
    });

    it('handles CRLF line endings', () => {
        const csv = 'A,B\r\n1,2\r\n';
        const { headers, rows } = parseCsvText(csv);
        expect(headers).toEqual(['A', 'B']);
        expect(rows).toEqual([{ A: '1', B: '2' }]);
    });

    it('returns empty output for empty input', () => {
        expect(parseCsvText('')).toEqual({ headers: [], rows: [] });
        expect(parseCsvText('\n\n')).toEqual({ headers: [], rows: [] });
    });

    it('keeps short rows, filling only the headers it has', () => {
        const { rows } = parseCsvText('A,B,C\n1');
        expect(rows).toEqual([{ A: '1', B: undefined, C: undefined }]);
    });
});

describe('extractCSVHeaders / previewCSVRows', () => {
    const csv = 'Date,Description,Amount\n1,a,10\n2,b,20\n3,c,30\n4,d,40\n5,e,50\n6,f,60';

    it('returns just the headers', () => {
        expect(extractCSVHeaders(csv)).toEqual(['Date', 'Description', 'Amount']);
    });

    it('previews at most the requested number of rows', () => {
        expect(previewCSVRows(csv)).toHaveLength(5);
        expect(previewCSVRows(csv, 2)).toEqual([
            { Date: '1', Description: 'a', Amount: '10' },
            { Date: '2', Description: 'b', Amount: '20' },
        ]);
    });
});

describe('parseStatementDate', () => {
    it('parses YYYY-MM-DD with dashes or slashes', () => {
        expect(parseStatementDate('2024-12-25', 'YYYY-MM-DD')).toBe('2024-12-25');
        expect(parseStatementDate('2024/12/25', 'YYYY-MM-DD')).toBe('2024-12-25');
        // Single-digit month/day are padded
        expect(parseStatementDate('2024-1-5', 'YYYY-MM-DD')).toBe('2024-01-05');
    });

    it('parses MM/DD/YYYY as month-first', () => {
        expect(parseStatementDate('12/25/2024', 'MM/DD/YYYY')).toBe('2024-12-25');
    });

    it('parses DD/MM/YYYY (and DD-MM-YYYY) as day-first', () => {
        expect(parseStatementDate('25/12/2024', 'DD/MM/YYYY')).toBe('2024-12-25');
        expect(parseStatementDate('25-12-2024', 'DD-MM-YYYY')).toBe('2024-12-25');
    });

    it('expands two-digit years to 2000s', () => {
        expect(parseStatementDate('25/12/24', 'DD/MM/YYYY')).toBe('2024-12-25');
    });

    it('returns null for empty or non-date input', () => {
        expect(parseStatementDate('', 'DD/MM/YYYY')).toBeNull();
        expect(parseStatementDate('not a date', 'YYYY-MM-DD')).toBeNull();
    });

    it('rejects impossible day/month values instead of rolling them over', () => {
        expect(parseStatementDate('32/12/2024', 'DD/MM/YYYY')).toBeNull();
        expect(parseStatementDate('12/32/2024', 'MM/DD/YYYY')).toBeNull();
    });

    it('falls back to the robust parser when no format matches', () => {
        // No format given: the robust parser assumes day-first.
        expect(parseStatementDate('25/12/2024')).toBe('2024-12-25');
    });
});

describe('applyColumnMapping', () => {
    it('maps a single-amount row end to end', () => {
        const row = { Date: '2024-06-01', Details: 'Shell Diesel', Value: '70.25', Method: 'CARD' };
        const mapping = {
            dateColumn: 'Date', dateFormat: 'YYYY-MM-DD',
            descriptionColumn: 'Details',
            amountMode: 'single', amountColumn: 'Value',
            methodColumn: 'Method',
        } as any;

        expect(applyColumnMapping(row, mapping)).toEqual({
            date: '2024-06-01',
            description: 'Shell Diesel',
            amount: 70.25,
            method: 'CARD',
            valid: true,
        });
    });

    it('matches column names case-insensitively and ignores surrounding spaces', () => {
        const row = { ' date ': '01/02/2024', 'details ': 'Widgets' };
        const mapping = {
            dateColumn: 'Date', dateFormat: 'DD/MM/YYYY',
            descriptionColumn: 'Details',
            amountMode: 'single', amountColumn: 'Amount',
        } as any;
        const result = applyColumnMapping(row, mapping);
        expect(result.date).toBe('2024-02-01');
        expect(result.description).toBe('Widgets');
    });

    it('strips currency symbols and thousands separators from amounts', () => {
        const row = { Amount: '£1,234.56' };
        const mapping = { dateColumn: 'D', dateFormat: 'DD/MM/YYYY', descriptionColumn: 'Desc', amountMode: 'single', amountColumn: 'Amount' } as any;
        expect(applyColumnMapping({ ...row, D: '01/01/2024', Desc: 'x' }, mapping).amount).toBe(1234.56);
    });

    it('inverts the sign when invertAmountSign is set', () => {
        const row = { D: '01/01/2024', Desc: 'x', Amount: '50.00' };
        const mapping = { dateColumn: 'D', dateFormat: 'DD/MM/YYYY', descriptionColumn: 'Desc', amountMode: 'single', amountColumn: 'Amount', invertAmountSign: true } as any;
        expect(applyColumnMapping(row, mapping).amount).toBe(-50);
    });

    it('treats unparseable amounts as 0 (and therefore invalid)', () => {
        const row = { D: '01/01/2024', Desc: 'x', Amount: 'N/A' };
        const mapping = { dateColumn: 'D', dateFormat: 'DD/MM/YYYY', descriptionColumn: 'Desc', amountMode: 'single', amountColumn: 'Amount' } as any;
        const result = applyColumnMapping(row, mapping);
        expect(result.amount).toBe(0);
        expect(result.valid).toBe(false);
    });

    it('split mode makes money-in positive and money-out negative', () => {
        const mapping = { dateColumn: 'D', dateFormat: 'DD/MM/YYYY', descriptionColumn: 'Desc', amountMode: 'split', debitColumn: 'Paid Out', creditColumn: 'Paid In' } as any;
        const moneyIn = applyColumnMapping({ D: '01/01/2024', Desc: 'sale', 'Paid In': '500.00' }, mapping);
        const moneyOut = applyColumnMapping({ D: '01/01/2024', Desc: 'fuel', 'Paid Out': '60.00' }, mapping);
        expect(moneyIn.amount).toBe(500);
        expect(moneyOut.amount).toBe(-60);
    });

    it('marks rows invalid when date, description or amount is missing/zero', () => {
        const mapping = { dateColumn: 'D', dateFormat: 'DD/MM/YYYY', descriptionColumn: 'Desc', amountMode: 'single', amountColumn: 'Amount' } as any;
        expect(applyColumnMapping({ Desc: 'no date', Amount: '5' }, mapping).valid).toBe(false);
        expect(applyColumnMapping({ D: '01/01/2024', Amount: '5' }, mapping).valid).toBe(false);
        expect(applyColumnMapping({ D: '01/01/2024', Desc: 'zero', Amount: '0' }, mapping).valid).toBe(false);
    });
});

describe('isMappingComplete', () => {
    it('rejects missing mappings', () => {
        expect(isMappingComplete(undefined)).toBe(false);
    });

    it('requires date, description and format columns', () => {
        expect(isMappingComplete({ dateColumn: 'Date', descriptionColumn: '', dateFormat: 'DD/MM/YYYY', amountMode: 'single', amountColumn: 'Amount' } as any)).toBe(false);
        expect(isMappingComplete({ dateColumn: 'Date', descriptionColumn: 'Desc', dateFormat: undefined, amountMode: 'single', amountColumn: 'Amount' } as any)).toBe(false);
    });

    it('single mode needs an amount column', () => {
        expect(isMappingComplete({ dateColumn: 'Date', descriptionColumn: 'Desc', dateFormat: 'DD/MM/YYYY', amountMode: 'single' } as any)).toBe(false);
        expect(isMappingComplete({ dateColumn: 'Date', descriptionColumn: 'Desc', dateFormat: 'DD/MM/YYYY', amountMode: 'single', amountColumn: 'Amount' } as any)).toBe(true);
    });

    it('split mode needs both debit and credit columns', () => {
        const base = { dateColumn: 'Date', descriptionColumn: 'Desc', dateFormat: 'DD/MM/YYYY', amountMode: 'split' } as any;
        expect(isMappingComplete({ ...base, debitColumn: 'Out' } as any)).toBe(false);
        expect(isMappingComplete({ ...base, debitColumn: 'Out', creditColumn: 'In' } as any)).toBe(true);
    });

    it('rejects unknown amount modes', () => {
        expect(isMappingComplete({ dateColumn: 'Date', descriptionColumn: 'Desc', dateFormat: 'DD/MM/YYYY', amountMode: 'mystery' } as any)).toBe(false);
    });
});
