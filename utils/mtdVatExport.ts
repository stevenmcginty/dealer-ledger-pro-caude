import JSZip from 'jszip';
import { formatDate } from './helpers';

export interface MtdVatExportOptions {
    companyName: string;
    vatNumber: string;
    periodStart: string;
    periodEnd: string;
    boxes: number[];
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const BOX_DESCRIPTIONS = [
    'VAT due on sales and other outputs',
    'VAT due on acquisitions of goods made in Northern Ireland from EU Member States',
    'Total VAT due (sum of boxes 1 and 2)',
    'VAT reclaimed on purchases and other inputs (including acquisitions from the EU)',
    'Net VAT to be paid or reclaimed (difference between boxes 3 and 4)',
    'Total value of sales and other outputs (excluding VAT)',
    'Total value of purchases and other inputs (excluding VAT)',
    'Total value of supplies of goods and related costs (excluding VAT) to EU Member States',
    'Total value of acquisitions of goods and related costs (excluding VAT) from EU Member States',
];

const STYLE_HEADER_LABEL = 1;
const STYLE_HEADER_VALUE = 2;
const STYLE_BOX_NUMBER = 3;
const STYLE_BOX_DESCRIPTION = 4;
const STYLE_BOX_DECIMAL = 5;
const STYLE_BOX_WHOLE = 6;

const escapeXml = (value: string): string => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const textCell = (ref: string, style: number, value: string): string =>
    `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;

const numberCell = (ref: string, style: number, value: number): string =>
    `<c r="${ref}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;

const toUkDate = (value: string): string => formatDate(value, { day: '2-digit', month: '2-digit', year: 'numeric' });

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="VAT Return" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

const THIN_BORDER = '<border><left style="thin"><color rgb="FFB7B7B7"/></left><right style="thin"><color rgb="FFB7B7B7"/></right><top style="thin"><color rgb="FFB7B7B7"/></top><bottom style="thin"><color rgb="FFB7B7B7"/></bottom><diagonal/></border>';

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E7145"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAD3"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F3F3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${THIN_BORDER}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const buildSheetXml = ({ companyName, vatNumber, periodStart, periodEnd, boxes }: MtdVatExportOptions): string => {
    const headerRows = [
        ['Company Name:', companyName],
        ['VAT Registration (VRN):', vatNumber],
        ['Submission Period', `${toUkDate(periodStart)} - ${toUkDate(periodEnd)}`],
    ];

    const rows = headerRows.map(([label, value], index) => {
        const r = index + 2;
        return `<row r="${r}">${textCell(`B${r}`, STYLE_HEADER_LABEL, label)}${textCell(`C${r}`, STYLE_HEADER_VALUE, value)}</row>`;
    });

    BOX_DESCRIPTIONS.forEach((description, index) => {
        const r = index + 6;
        const isWholePounds = index >= 5;
        rows.push(
            `<row r="${r}">${textCell(`B${r}`, STYLE_BOX_NUMBER, String(index + 1))}${textCell(`C${r}`, STYLE_BOX_DESCRIPTION, description)}${numberCell(`D${r}`, isWholePounds ? STYLE_BOX_WHOLE : STYLE_BOX_DECIMAL, boxes[index])}</row>`
        );
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="B2:D14"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><cols><col min="1" max="1" width="3" customWidth="1"/><col min="2" max="2" width="26" customWidth="1"/><col min="3" max="3" width="80" customWidth="1"/><col min="4" max="4" width="18" customWidth="1"/></cols><sheetData>${rows.join('')}</sheetData></worksheet>`;
};

export const createMtdVatWorkbook = (options: MtdVatExportOptions): Promise<Blob> => {
    const zip = new JSZip();
    const noFolders = { createFolders: false };
    zip.file('[Content_Types].xml', CONTENT_TYPES_XML, noFolders);
    zip.file('_rels/.rels', ROOT_RELS_XML, noFolders);
    zip.file('xl/workbook.xml', WORKBOOK_XML, noFolders);
    zip.file('xl/_rels/workbook.xml.rels', WORKBOOK_RELS_XML, noFolders);
    zip.file('xl/styles.xml', STYLES_XML, noFolders);
    zip.file('xl/worksheets/sheet1.xml', buildSheetXml(options), noFolders);
    return zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME });
};

export const exportMtdVatSheet = async (options: MtdVatExportOptions): Promise<void> => {
    const blob = await createMtdVatWorkbook(options);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MTD-VAT-Return-${options.periodStart}-to-${options.periodEnd}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
