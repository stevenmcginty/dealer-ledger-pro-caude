import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { createMtdVatWorkbook, type MtdVatExportOptions } from '../utils/mtdVatExport';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const baseOptions: MtdVatExportOptions = {
    companyName: 'Prestige Motors Ltd',
    vatNumber: 'GB123456789',
    periodStart: '2024-01-01',
    periodEnd: '2024-03-31',
    boxes: [1000, 0, 1000, 400, 600, 5000, 3000, 0, 0],
};

// The workbook is built as a zip of XML parts; tests unpack it and assert on
// the sheet XML so failures point at the actual generated content.
const readSheet = async (options: MtdVatExportOptions): Promise<string> => {
    const blob = await createMtdVatWorkbook(options);
    const zip = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
    const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
    if (!sheet) throw new Error('sheet1.xml missing from workbook');
    return sheet;
};

describe('createMtdVatWorkbook', () => {
    it('produces an XLSX blob containing the required OOXML parts', async () => {
        const blob = await createMtdVatWorkbook(baseOptions);
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe(XLSX_MIME);

        const zip = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
        for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
            expect(zip.file(part), `${part} should exist`).toBeTruthy();
        }
    });

    it('writes the company header block with UK-formatted period dates', async () => {
        const sheet = await readSheet(baseOptions);
        expect(sheet).toContain('Company Name:');
        expect(sheet).toContain('Prestige Motors Ltd');
        expect(sheet).toContain('VAT Registration (VRN):');
        expect(sheet).toContain('GB123456789');
        // Submission period renders dd/mm/yyyy in en-GB
        expect(sheet).toContain('01/01/2024 - 31/03/2024');
    });

    it('writes all nine VAT boxes with their descriptions and values', async () => {
        const sheet = await readSheet(baseOptions);
        expect(sheet).toContain('VAT due on sales and other outputs');
        expect(sheet).toContain('Net VAT to be paid or reclaimed (difference between boxes 3 and 4)');
        expect(sheet).toContain('<v>1000</v>');
        expect(sheet).toContain('<v>400</v>');
        expect(sheet).toContain('<v>600</v>');
        // Box 6/7 whole-pound totals
        expect(sheet).toContain('<v>5000</v>');
        expect(sheet).toContain('<v>3000</v>');
    });

    it('XML-escapes company and VRN text', async () => {
        const sheet = await readSheet({ ...baseOptions, companyName: 'Smith & Sons <Ltd>', vatNumber: 'GB 1"2\'3' });
        expect(sheet).toContain('Smith &amp; Sons &lt;Ltd&gt;');
        expect(sheet).toContain('GB 1&quot;2&apos;3');
        // Raw unescaped angle brackets must not appear around the name
        expect(sheet).not.toContain('Smith & Sons');
    });

    it('replaces non-finite box values with 0 rather than emitting "NaN"', async () => {
        const sheet = await readSheet({ ...baseOptions, boxes: [NaN, Infinity, 1000, 400, 600, 5000, 3000, 0, 0] });
        expect(sheet).not.toContain('NaN');
        expect(sheet).not.toContain('Infinity');
    });

    it('writes penny-precision values as-is (rounding belongs to the caller)', async () => {
        // The export serialises exactly what it is given: 1234.5 stays one-decimal,
        // 1234.567 keeps its third decimal. The VAT page rounds to 2dp before calling.
        const sheet = await readSheet({ ...baseOptions, boxes: [1234.5, 0, 1234.5, 400.005, 834.495, 5000, 3000, 0, 0] });
        expect(sheet).toContain('<v>1234.5</v>');
        expect(sheet).toContain('<v>400.005</v>');
        expect(sheet).toContain('<v>834.495</v>');
    });

    it('styles boxes 1-5 as decimal and boxes 6-9 as whole pounds', async () => {
        const sheet = await readSheet(baseOptions);
        // Cell refs: box rows run from row 6 (box 1) to row 14 (box 9), value in column D.
        // STYLE_BOX_DECIMAL = 5, STYLE_BOX_WHOLE = 6 (see s= attribute).
        expect(sheet).toContain('<c r="D6" s="5">');
        expect(sheet).toContain('<c r="D10" s="5">');
        expect(sheet).toContain('<c r="D11" s="6">');
        expect(sheet).toContain('<c r="D14" s="6">');
    });

    it('handles an all-zero return', async () => {
        const sheet = await readSheet({ ...baseOptions, boxes: [0, 0, 0, 0, 0, 0, 0, 0, 0] });
        expect(sheet).toContain('<v>0</v>');
    });
});
