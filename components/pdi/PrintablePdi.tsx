import React from 'react';
import { PDI, BusinessDetails, PdiCheckStatus } from '../../types';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '../icons';
import { formatDate } from '../../utils/helpers';
import { SheetPage, SheetBand, SheetBody, SheetSection, SheetRow, SheetFooter, SheetToolbar } from '../common/SpecSheet';
import { PDI_STATUS_LABEL, TYRE_POSITIONS, pdiExceptions, treadVerdict, withPdiDefaults, LEGAL_TREAD_MM } from '../../utils/pdi';

interface PrintablePdiProps {
    pdi: PDI;
    businessDetails: BusinessDetails | null;
    onClose: () => void;
    isPreview?: boolean;
    onConfirm?: () => void;
    onBack?: () => void;
    /** Disables Confirm & Save while the caller is persisting the record. */
    isSubmitting?: boolean;
}

/** Print colours, chosen to stay legible when a certificate is photocopied in mono. */
const STATUS_RGB: Record<PdiCheckStatus, [number, number, number]> = {
    pass: [21, 128, 61],
    advisory: [180, 83, 9],
    fail: [185, 28, 28],
    na: [115, 115, 115],
};

/** Four characters or fewer, so the token never crowds the label in a two-column grid. */
const STATUS_TOKEN: Record<PdiCheckStatus, string> = {
    pass: 'PASS',
    advisory: 'ADV',
    fail: 'FAIL',
    na: 'N/A',
};

const STATUS_TEXT_CLASS: Record<PdiCheckStatus, string> = {
    pass: 'text-green-700',
    advisory: 'text-amber-700',
    fail: 'text-red-700',
    na: 'text-gray-500',
};

const STATUS_DOT_CLASS: Record<PdiCheckStatus, string> = {
    pass: 'bg-green-600',
    advisory: 'bg-amber-500',
    fail: 'bg-red-600',
    na: 'bg-gray-400',
};

const PrintablePdi = ({ pdi, businessDetails, onClose, isPreview, onConfirm, onBack, isSubmitting }: PrintablePdiProps) => {
    const car = pdi?.carDetails || ({} as PDI['carDetails']);
    const { sections, tyres } = withPdiDefaults(pdi);
    const fittedTyres = tyres.filter(tyre => tyre.fitted !== false);

    const exceptions = pdiExceptions({ sections, tyres });
    const failCount = exceptions.filter(item => item.status === 'fail').length;
    const advisoryCount = exceptions.filter(item => item.status === 'advisory').length;
    const checkCount = sections.reduce((total, section) => total + section.items.length, 0);

    const inspectionDateLabel = pdi?.inspectionDate ? formatDate(pdi.inspectionDate) : null;
    const makeModel = [car.make, car.model].filter(Boolean).join(' ');
    const vehicleSubtitle = [car.color, car.year ? `Model Year ${car.year}` : null].filter(Boolean).join('  |  ');
    const odometer = typeof pdi?.mileage === 'number' ? pdi.mileage : car.mileage;

    const verdictTitle = pdi?.roadworthy
        ? failCount > 0
            ? 'Roadworthy — with faults recorded'
            : advisoryCount > 0
                ? 'Roadworthy — with advisories'
                : 'Roadworthy — no faults found'
        : 'Not presented as roadworthy';
    const verdictSummary = [
        `${checkCount} checks completed`,
        failCount ? `${failCount} fail${failCount === 1 ? '' : 's'}` : null,
        advisoryCount ? `${advisoryCount} advisor${advisoryCount === 1 ? 'y' : 'ies'}` : null,
        !failCount && !advisoryCount ? 'no exceptions' : null,
    ].filter(Boolean).join('  ·  ');
    const verdictStatus: PdiCheckStatus = !pdi?.roadworthy || failCount > 0 ? 'fail' : advisoryCount > 0 ? 'advisory' : 'pass';

    const fileName = `PDI-${pdi?.pdiNumber || 'draft'}-${car.reg || 'vehicle'}.pdf`;

    const contactLine = [
        businessDetails?.phone && `Tel: ${businessDetails.phone}`,
        businessDetails?.email,
    ].filter(Boolean).join('  |  ');

    const registrationLine = [
        businessDetails?.companyNumber && `Company No: ${businessDetails.companyNumber}`,
        businessDetails?.vatNumber && `VAT No: ${businessDetails.vatNumber}`,
    ].filter(Boolean).join('  |  ');

    const disclaimer = 'This inspection records the condition of the vehicle on the date shown and is not a warranty, an MOT test, or a guarantee of future condition.';

    const tyreLabel = (position: string) => TYRE_POSITIONS.find(p => p.position === position)?.label || position;

    const handleDownloadPdf = async () => {
        // Drawn from the record rather than rasterised from the DOM, so the text
        // stays selectable and the same A4 output comes out of desktop browsers,
        // the PWA, and Android WebViews alike.
        const { default: jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 16;
        const contentWidth = pageWidth - margin * 2;
        const columnGap = 8;
        const columnWidth = (contentWidth - columnGap) / 2;

        const readThemeColor = (name: string, fallback: [number, number, number]): [number, number, number] => {
            const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            const parts = value.split(/\s+/).map(Number);
            return parts.length === 3 && parts.every(Number.isFinite) ? parts as [number, number, number] : fallback;
        };
        const brand = readThemeColor('--color-brand-800', [7, 89, 133]);
        const brandAccent = readThemeColor('--color-brand-600', [2, 132, 199]);
        let fontFamily = 'helvetica';

        // Embed the same Inter the app uses so PDF viewers do not substitute a
        // device font with different glyph metrics and reflow the columns.
        try {
            const fontUrls = [
                'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf',
                'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf',
            ];
            const toBase64 = async (url: string) => {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Font request failed: ${response.status}`);
                const bytes = new Uint8Array(await response.arrayBuffer());
                let binary = '';
                bytes.forEach(byte => { binary += String.fromCharCode(byte); });
                return btoa(binary);
            };
            const [regular, bold] = await Promise.all(fontUrls.map(toBase64));
            pdf.addFileToVFS('Inter-Regular.ttf', regular);
            pdf.addFileToVFS('Inter-Bold.ttf', bold);
            pdf.addFont('Inter-Regular.ttf', 'Inter', 'normal');
            pdf.addFont('Inter-Bold.ttf', 'Inter', 'bold');
            fontFamily = 'Inter';
        } catch (error) {
            console.warn('Could not embed Inter in the PDI PDF; using a standard PDF font.', error);
        }

        let y = 16;

        const addPageIfNeeded = (height: number) => {
            if (y + height <= pageHeight - margin) return;
            pdf.addPage();
            y = margin;
        };

        const addHeader = () => {
            pdf.setFillColor(...brand);
            pdf.rect(0, 0, pageWidth, 31, 'F');
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(18);
            pdf.setTextColor(255, 255, 255);
            pdf.text(businessDetails?.name || 'Pre-Delivery Inspection', margin, 13);
            if (businessDetails?.name) {
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(8.5);
                pdf.text('Pre-Delivery Inspection', margin, 19);
            }
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(11);
            pdf.text(makeModel || car.reg || '', pageWidth - margin, 13, { align: 'right' });
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(8.5);
            pdf.text(vehicleSubtitle || car.reg || '', pageWidth - margin, 19, { align: 'right' });
            y = 42;
        };

        /**
         * Section heading drawn downward from the cursor. `keepWith` is the
         * height of the content that must start on the same page, so a heading
         * never lands orphaned at the foot of a page with its section overleaf.
         */
        const addSection = (title: string, keepWith = 12) => {
            y += 4;
            const reserved = Math.min(keepWith, pageHeight - margin * 2 - 12);
            if (y + 12 + reserved > pageHeight - margin) {
                pdf.addPage();
                y = margin;
            }
            pdf.setFillColor(...brandAccent);
            pdf.rect(margin, y, 1.2, 5, 'F');
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(8.5);
            pdf.setTextColor(...brand);
            pdf.text(title.toUpperCase(), margin + 4, y + 4);
            pdf.setDrawColor(190, 190, 190);
            pdf.setLineWidth(0.25);
            pdf.line(margin, y + 7, pageWidth - margin, y + 7);
            y += 12;
        };

        const addRow = (label: string, value?: string | number | null, note?: string | null) => {
            if (value === undefined || value === null || value === '') return;
            const noteWidth = note ? 46 : 0;
            const valueWidth = contentWidth - 39 - noteWidth;
            // Split with the font each piece is drawn in, or the wrap points lie.
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(8);
            const valueLines = pdf.splitTextToSize(String(value), valueWidth) as string[];
            let noteLines: string[] = [];
            if (note) {
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(7.2);
                noteLines = pdf.splitTextToSize(note, noteWidth) as string[];
            }
            const rowHeight = Math.max(5, valueLines.length * 4.5, noteLines.length * 3.3 + 1.5);
            addPageIfNeeded(rowHeight + 1);
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(105, 105, 105);
            pdf.text(label, margin, y);
            pdf.setFont(fontFamily, 'bold');
            pdf.setTextColor(25, 25, 25);
            pdf.text(valueLines, margin + 39, y);
            if (noteLines.length) {
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(7.2);
                pdf.setTextColor(105, 105, 105);
                pdf.text(noteLines, pageWidth - margin, y, { align: 'right' });
            }
            y += rowHeight;
        };

        /** The overall verdict, boxed so it reads first on a handed-over certificate. */
        const addVerdict = () => {
            const tint: [number, number, number] = verdictStatus === 'pass' ? [240, 249, 243] : verdictStatus === 'advisory' ? [254, 249, 235] : [254, 242, 242];
            const rule: [number, number, number] = verdictStatus === 'pass' ? [187, 224, 200] : verdictStatus === 'advisory' ? [246, 213, 152] : [248, 190, 190];
            const accent = STATUS_RGB[verdictStatus];
            const boxHeight = 21;
            addPageIfNeeded(boxHeight + 4);
            pdf.setFillColor(...tint);
            pdf.setDrawColor(...rule);
            pdf.setLineWidth(0.3);
            pdf.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(6.4);
            pdf.setTextColor(...accent);
            pdf.text('INSPECTION RESULT', margin + 5, y + 6);
            pdf.setFontSize(11);
            pdf.text(verdictTitle, margin + 5, y + 12.5);
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(80, 80, 80);
            pdf.text(verdictSummary, margin + 5, y + 17.5);
            y += boxHeight + 4;
        };

        type CheckItem = { label: string; status: PdiCheckStatus; note?: string | null };

        /** An advisory or fail carries the visual weight; a pass or N/A stays quiet. */
        const isException = (status: PdiCheckStatus) => status === 'advisory' || status === 'fail';

        /** Height of one checklist item, measured in the fonts it is drawn in. */
        const measureCheck = (item: CheckItem) => {
            pdf.setFont(fontFamily, isException(item.status) ? 'bold' : 'normal');
            pdf.setFontSize(7.6);
            const labelLines = (pdf.splitTextToSize(item.label, columnWidth - 18) as string[]).length;
            let noteLines = 0;
            if (item.note) {
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(6.6);
                noteLines = (pdf.splitTextToSize(item.note, columnWidth - 18) as string[]).length;
            }
            return Math.max(5, labelLines * 3.9 + noteLines * 3.3 + 1.2);
        };

        const measureCheckGrid = (items: CheckItem[]) => {
            const half = Math.ceil(items.length / 2);
            const columns = [items.slice(0, half), items.slice(half)];
            return Math.max(...columns.map(column => column.reduce((total, item) => total + measureCheck(item), 0)), 0);
        };

        /** One checklist item inside a column: marker, label, right-aligned status token. */
        const drawCheck = (x: number, top: number, item: CheckItem) => {
            const { label, status, note } = item;
            const color = STATUS_RGB[status];
            pdf.setFont(fontFamily, isException(status) ? 'bold' : 'normal');
            pdf.setFontSize(7.6);
            const labelLines = pdf.splitTextToSize(label, columnWidth - 18) as string[];
            pdf.setFillColor(...color);
            pdf.circle(x + 1.4, top - 1.2, 1.15, 'F');
            pdf.setTextColor(45, 45, 45);
            pdf.text(labelLines, x + 4.5, top);
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(6.6);
            pdf.setTextColor(...color);
            pdf.text(STATUS_TOKEN[status], x + columnWidth, top, { align: 'right' });
            let used = labelLines.length * 3.9;
            if (note) {
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(6.6);
                pdf.setTextColor(120, 120, 120);
                const noteLines = pdf.splitTextToSize(note, columnWidth - 18) as string[];
                pdf.text(noteLines, x + 4.5, top + used);
                used += noteLines.length * 3.3;
            }
            return Math.max(5, used + 1.2);
        };

        const drawCheckGrid = (items: CheckItem[]) => {
            const half = Math.ceil(items.length / 2);
            const columns = [items.slice(0, half), items.slice(half)];
            addPageIfNeeded(measureCheckGrid(items));
            const top = y;
            let lowest = y;
            columns.forEach((column, index) => {
                let cursor = top;
                const x = margin + index * (columnWidth + columnGap);
                column.forEach(item => {
                    cursor += drawCheck(x, cursor, item);
                });
                lowest = Math.max(lowest, cursor);
            });
            y = lowest + 2;
        };

        /**
         * Checks run down the left column then the right, and the grid is kept
         * whole: today's tallest section is far shorter than a page. If a future
         * template section ever outgrows a full page, it is split into page-sized
         * grids rather than silently drawn off the bottom edge.
         */
        const addCheckGrid = (items: CheckItem[]) => {
            const pageCapacity = pageHeight - margin * 2;
            if (measureCheckGrid(items) <= pageCapacity) {
                drawCheckGrid(items);
                return;
            }
            let chunk: CheckItem[] = [];
            items.forEach(item => {
                if (chunk.length && measureCheckGrid([...chunk, item]) > pageCapacity) {
                    drawCheckGrid(chunk);
                    chunk = [];
                }
                chunk.push(item);
            });
            if (chunk.length) drawCheckGrid(chunk);
        };

        /** First line of `text` that fits `width`, ellipsised. Measures in the current font. */
        const clampLine = (text: string, width: number) => {
            const lines = pdf.splitTextToSize(text, width) as string[];
            return lines.length > 1 ? `${lines[0].replace(/\s+\S*$/, '')}…` : lines[0];
        };

        const addTyreTable = () => {
            const columns: [string, number, 'left' | 'right'][] = [
                ['POSITION', 0, 'left'],
                ['MAKE', 42, 'left'],
                ['SIZE', 100, 'left'],
                ['TREAD', 142, 'right'],
                ['STATUS', contentWidth, 'right'],
            ];
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(6.8);
            pdf.setTextColor(105, 105, 105);
            columns.forEach(([label, offset, align]) => pdf.text(label, margin + offset, y, { align }));
            y += 4.5;
            fittedTyres.forEach(tyre => {
                addPageIfNeeded(7);
                const measured = treadVerdict(tyre.treadDepth);
                const status: PdiCheckStatus = tyre.status === 'pass' && measured ? measured : tyre.status;
                const color = STATUS_RGB[status];
                pdf.setFont(fontFamily, 'bold');
                pdf.setFontSize(7.8);
                pdf.setTextColor(35, 35, 35);
                pdf.text(tyreLabel(tyre.position), margin, y);
                pdf.setFont(fontFamily, 'normal');
                pdf.setTextColor(70, 70, 70);
                pdf.text(tyre.make ? clampLine(tyre.make, 54) : '—', margin + 42, y);
                pdf.text(tyre.size ? clampLine(tyre.size, 30) : '—', margin + 100, y);
                pdf.setFont(fontFamily, 'bold');
                if (tyre.treadDepth != null) {
                    pdf.setTextColor(...color);
                    pdf.text(`${tyre.treadDepth}mm`, margin + 142, y, { align: 'right' });
                } else {
                    pdf.setTextColor(150, 150, 150);
                    pdf.text('—', margin + 142, y, { align: 'right' });
                }
                pdf.setFontSize(6.6);
                pdf.setTextColor(...color);
                pdf.text(STATUS_TOKEN[status], margin + contentWidth, y, { align: 'right' });
                y += 5;
                pdf.setDrawColor(228, 228, 228);
                pdf.setLineWidth(0.2);
                pdf.line(margin, y - 1.6, pageWidth - margin, y - 1.6);
            });
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(6.6);
            pdf.setTextColor(120, 120, 120);
            y += 2;
            pdf.text(`Legal minimum tread depth is ${LEGAL_TREAD_MM}mm across the centre three quarters of the tyre.`, margin, y);
            y += 4;
        };

        const addSignature = () => {
            addPageIfNeeded(24);
            const half = (contentWidth - 12) / 2;
            pdf.setDrawColor(140, 140, 140);
            pdf.setLineWidth(0.3);
            y += 10;
            pdf.line(margin, y, margin + half, y);
            pdf.line(margin + half + 12, y, pageWidth - margin, y);
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(120, 120, 120);
            pdf.text('Signature of inspector', margin, y + 4);
            pdf.text('Date', margin + half + 12, y + 4);
            if (pdi?.inspectedBy) {
                pdf.setFont(fontFamily, 'bold');
                pdf.setFontSize(8);
                pdf.setTextColor(45, 45, 45);
                pdf.text(pdi.inspectedBy, margin, y - 2);
            }
            if (inspectionDateLabel) {
                pdf.setFont(fontFamily, 'bold');
                pdf.setFontSize(8);
                pdf.setTextColor(45, 45, 45);
                pdf.text(inspectionDateLabel, margin + half + 12, y - 2);
            }
            y += 10;
        };

        /** One advisory/fail: coloured status word, bold item, grey detail below, section group at right. */
        const addException = (item: { status: PdiCheckStatus; label: string; detail: string; group: string }) => {
            const valueWidth = contentWidth - 39 - 46;
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(8);
            const labelLines = pdf.splitTextToSize(item.label, valueWidth) as string[];
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(7.2);
            const detailLines = item.detail ? pdf.splitTextToSize(item.detail, valueWidth) as string[] : [];
            const groupLines = item.group ? pdf.splitTextToSize(item.group, 46) as string[] : [];
            const leftHeight = labelLines.length * 4.5 + detailLines.length * 3.3;
            const rowHeight = Math.max(6, leftHeight + 1.5, groupLines.length * 3.3 + 2.5);
            addPageIfNeeded(rowHeight);
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(7.2);
            pdf.setTextColor(...STATUS_RGB[item.status]);
            pdf.text(PDI_STATUS_LABEL[item.status].toUpperCase(), margin, y);
            pdf.setFontSize(8);
            pdf.setTextColor(25, 25, 25);
            pdf.text(labelLines, margin + 39, y);
            if (detailLines.length) {
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(7.2);
                pdf.setTextColor(105, 105, 105);
                pdf.text(detailLines, margin + 39, y + labelLines.length * 4.5);
            }
            if (groupLines.length) {
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(7.2);
                pdf.setTextColor(140, 140, 140);
                pdf.text(groupLines, pageWidth - margin, y, { align: 'right' });
            }
            y += rowHeight;
        };

        addHeader();
        addVerdict();

        addSection('Inspection');
        addRow('Date', inspectionDateLabel);
        addRow('Reference', pdi?.pdiNumber);
        addRow('Inspected by', pdi?.inspectedBy);

        addSection('Vehicle');
        addRow('Registration', car.reg);
        addRow('Make & Model', makeModel, car.year ? `Model year ${car.year}` : null);
        addRow('VIN', car.vin);
        addRow('Stock number', car.stockNumber);
        addRow('Odometer', typeof odometer === 'number' ? `${odometer.toLocaleString()} miles` : null, inspectionDateLabel ? `recorded ${inspectionDateLabel}` : null);
        addRow('Exterior', car.color);
        addRow('Engine', car.engineSize);
        addRow('Fuel', car.fuelType);
        addRow('MOT due', car.motDueDate ? formatDate(car.motDueDate) : null);

        if (fittedTyres.length) {
            // Keep the heading with the column captions and first two tyre rows.
            addSection('Tyres', 4.5 + Math.min(fittedTyres.length, 2) * 5);
            addTyreTable();
            if (pdi?.lockingWheelNutLocation) {
                y += 2.5;
                addRow('Locking wheel nut key', pdi.lockingWheelNutLocation);
            }
        }

        sections.forEach(section => {
            const items = section.items.map(item => ({ label: item.label, status: item.status, note: item.note }));
            addSection(section.title, measureCheckGrid(items));
            addCheckGrid(items);
        });

        if (exceptions.length) {
            addSection('Advisories & Faults', 16);
            exceptions.forEach(addException);
        }

        if (pdi?.advisoryNotes) {
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(8);
            const lines = pdf.splitTextToSize(pdi.advisoryNotes, contentWidth) as string[];
            addSection('Notes', Math.min(lines.length, 5) * 4);
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(70, 70, 70);
            // Line by line so a long note flows over a page break instead of off the sheet.
            lines.forEach(line => {
                addPageIfNeeded(4);
                pdf.text(line, margin, y);
                y += 4;
            });
        }

        pdf.setFont(fontFamily, 'normal');
        pdf.setFontSize(7.6);
        const declarationLines = pdf.splitTextToSize(disclaimer, contentWidth) as string[];
        // Reserve the declaration and the signature block as one unit.
        addSection('Declaration', declarationLines.length * 4 + 24);
        pdf.setFont(fontFamily, 'normal');
        pdf.setFontSize(7.6);
        pdf.setTextColor(90, 90, 90);
        pdf.text(declarationLines, margin, y);
        y += declarationLines.length * 4;
        addSignature();

        const footerLines = [
            [businessDetails?.name, inspectionDateLabel && `Inspected ${inspectionDateLabel}`].filter(Boolean).join('  |  '),
            registrationLine,
            businessDetails?.address?.replace(/\n/g, ' - '),
            contactLine,
        ].filter((line): line is string => typeof line === 'string' && line.trim() !== '');
        if (footerLines.length) {
            addPageIfNeeded(10 + footerLines.length * 4);
            pdf.setDrawColor(190, 190, 190);
            pdf.setLineWidth(0.25);
            pdf.line(margin, y, pageWidth - margin, y);
            y += 6;
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(105, 105, 105);
            footerLines.forEach(line => {
                const wrapped = pdf.splitTextToSize(line, contentWidth) as string[];
                pdf.text(wrapped, margin, y);
                y += wrapped.length * 4;
            });
        }

        pdf.save(fileName);
    };

    const CheckLine = ({ label, status, note }: { label: string; status: PdiCheckStatus; note?: string | null }) => (
        <div className="flex items-baseline gap-2 py-[3px] break-inside-avoid">
            <span className={`mt-[5px] h-[6px] w-[6px] flex-shrink-0 rounded-full ${STATUS_DOT_CLASS[status]}`} />
            <span className={`flex-1 text-[11px] leading-snug ${status === 'advisory' || status === 'fail' ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>
                {label}
                {note && <span className="block text-[9.5px] font-normal text-gray-500">{note}</span>}
            </span>
            <span className={`flex-shrink-0 text-[9px] font-bold tracking-wide ${STATUS_TEXT_CLASS[status]}`}>{STATUS_TOKEN[status]}</span>
        </div>
    );

    const verdictClasses = verdictStatus === 'pass'
        ? 'border-green-200 bg-green-50 text-green-800'
        : verdictStatus === 'advisory'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-red-200 bg-red-50 text-red-800';

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm print:bg-white">
            <SheetToolbar title={isPreview ? 'PDI Preview' : `PDI #${pdi?.pdiNumber}`}>
                {!isPreview && (
                    <>
                        <button onClick={handleDownloadPdf} aria-label="Download PDI as PDF" className="inline-flex items-center gap-2 px-3 py-2 mr-1 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 active:bg-brand-700 shadow-sm" title="Download PDF">
                            <ArrowDownTrayIcon className="h-5 w-5" />
                            <span>Download PDF</span>
                        </button>
                        <button onClick={() => window.print()} className="p-2 mr-1 rounded-full text-gray-300 hover:bg-gray-700" title="Print">
                            <PrinterIcon className="h-5 w-5" />
                        </button>
                    </>
                )}
                <button onClick={onClose} className="p-2 rounded-full text-gray-300 hover:bg-gray-700" title="Close">
                    <XMarkIcon className="h-5 w-5" />
                </button>
            </SheetToolbar>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-500 print:p-0 print:bg-white print:overflow-visible">
                <SheetPage id="printable-pdi">
                    <SheetBand
                        title={businessDetails?.name || 'Pre-Delivery Inspection'}
                        subtitle={businessDetails?.name ? 'Pre-Delivery Inspection' : null}
                        rightTitle={makeModel || car.reg}
                        rightSubtitle={vehicleSubtitle || car.reg}
                    />

                    <SheetBody>
                        <div className={`mb-5 flex flex-col gap-1 rounded border px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 ${verdictClasses}`}>
                            <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-70">Inspection Result</p>
                                <p className="mt-0.5 text-[15px] font-bold leading-tight">{verdictTitle}</p>
                            </div>
                            <p className="text-[10px] font-medium opacity-80 sm:flex-shrink-0 sm:text-right">{verdictSummary}</p>
                        </div>

                        <SheetSection title="Inspection">
                            <SheetRow label="Date" value={inspectionDateLabel} />
                            <SheetRow label="Reference" value={pdi?.pdiNumber} />
                            <SheetRow label="Inspected by" value={pdi?.inspectedBy} />
                        </SheetSection>

                        <SheetSection title="Vehicle">
                            <SheetRow label="Registration" value={car.reg} />
                            <SheetRow label="Make & Model" value={makeModel} note={car.year ? `Model year ${car.year}` : undefined} />
                            <SheetRow label="VIN" value={car.vin} />
                            <SheetRow label="Stock number" value={car.stockNumber} />
                            <SheetRow
                                label="Odometer"
                                value={typeof odometer === 'number' ? `${odometer.toLocaleString()} miles` : undefined}
                                note={inspectionDateLabel ? `recorded ${inspectionDateLabel}` : undefined}
                            />
                            <SheetRow label="Exterior" value={car.color} />
                            <SheetRow label="Engine" value={car.engineSize} />
                            <SheetRow label="Fuel" value={car.fuelType} />
                            <SheetRow label="MOT due" value={car.motDueDate ? formatDate(car.motDueDate) : undefined} />
                        </SheetSection>

                        {fittedTyres.length > 0 && (
                            <SheetSection title="Tyres">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-300 text-[9px] font-bold uppercase tracking-wide text-gray-500">
                                            <th className="py-1 text-left">Position</th>
                                            <th className="py-1 text-left">Make</th>
                                            <th className="py-1 text-left">Size</th>
                                            <th className="py-1 text-right">Tread</th>
                                            <th className="py-1 w-16 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fittedTyres.map(tyre => {
                                            const measured = treadVerdict(tyre.treadDepth);
                                            const status: PdiCheckStatus = tyre.status === 'pass' && measured ? measured : tyre.status;
                                            return (
                                                <tr key={tyre.position} className="border-b border-gray-200">
                                                    <td className="py-1.5 pr-3 text-[11px] font-semibold text-gray-900">{tyreLabel(tyre.position)}</td>
                                                    <td className="py-1.5 pr-3 text-[11px] text-gray-700">{tyre.make || '—'}</td>
                                                    <td className="py-1.5 pr-3 text-[11px] text-gray-700">{tyre.size || '—'}</td>
                                                    <td className={`py-1.5 pr-3 text-right text-[11px] font-bold ${tyre.treadDepth != null ? STATUS_TEXT_CLASS[status] : 'text-gray-400'}`}>
                                                        {tyre.treadDepth != null ? `${tyre.treadDepth}mm` : '—'}
                                                    </td>
                                                    <td className={`py-1.5 text-right text-[9px] font-bold tracking-wide ${STATUS_TEXT_CLASS[status]}`}>{STATUS_TOKEN[status]}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <p className="mt-1.5 text-[9px] text-gray-500">
                                    Legal minimum tread depth is {LEGAL_TREAD_MM}mm across the centre three quarters of the tyre.
                                </p>
                                {pdi?.lockingWheelNutLocation && (
                                    <div className="mt-2">
                                        <SheetRow label="Locking wheel nut key" value={pdi.lockingWheelNutLocation} />
                                    </div>
                                )}
                            </SheetSection>
                        )}

                        {sections.map(section => {
                            // Split half-and-half down the left column then the right,
                            // matching the PDF's reading order; single column on phones.
                            const half = Math.ceil(section.items.length / 2);
                            const columns = [section.items.slice(0, half), section.items.slice(half)];
                            return (
                                <SheetSection key={section.id} title={section.title}>
                                    <div className="grid gap-x-8 sm:grid-cols-2 print:grid-cols-2">
                                        {columns.map((column, index) => (
                                            <div key={index}>
                                                {column.map(item => (
                                                    <CheckLine key={item.id} label={item.label} status={item.status} note={item.note} />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </SheetSection>
                            );
                        })}

                        {exceptions.length > 0 && (
                            <SheetSection title="Advisories & Faults">
                                {exceptions.map((item, index) => (
                                    <div key={index} className="flex items-baseline py-[3px]">
                                        <span className={`w-[26%] flex-shrink-0 text-[9px] font-bold tracking-wide ${STATUS_TEXT_CLASS[item.status]}`}>
                                            {PDI_STATUS_LABEL[item.status].toUpperCase()}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[12px] font-semibold text-gray-900">{item.label}</span>
                                            {item.detail && <span className="block text-[10px] text-gray-500">{item.detail}</span>}
                                        </span>
                                        {item.group && <span className="w-[32%] flex-shrink-0 pl-3 text-right text-[10px] text-gray-400">{item.group}</span>}
                                    </div>
                                ))}
                            </SheetSection>
                        )}

                        {pdi?.advisoryNotes && (
                            <SheetSection title="Notes">
                                <p className="text-[11px] leading-relaxed text-gray-700 whitespace-pre-line">{pdi.advisoryNotes}</p>
                            </SheetSection>
                        )}

                        <SheetSection title="Declaration">
                            <p className="text-[10.5px] leading-relaxed text-gray-600">{disclaimer}</p>
                            <div className="mt-8 flex gap-12">
                                <div className="flex-1">
                                    {pdi?.inspectedBy && <p className="text-[11px] font-semibold text-gray-900">{pdi.inspectedBy}</p>}
                                    <div className="mt-1 border-t border-gray-400" />
                                    <p className="mt-1 text-[9px] text-gray-500">Signature of inspector</p>
                                </div>
                                <div className="w-1/3">
                                    {inspectionDateLabel && <p className="text-[11px] font-semibold text-gray-900">{inspectionDateLabel}</p>}
                                    <div className="mt-1 border-t border-gray-400" />
                                    <p className="mt-1 text-[9px] text-gray-500">Date</p>
                                </div>
                            </div>
                        </SheetSection>

                        <SheetFooter lines={[
                            [businessDetails?.name, inspectionDateLabel && `Inspected ${inspectionDateLabel}`].filter(Boolean).join('  |  '),
                            registrationLine,
                            businessDetails?.address?.replace(/\n/g, ' - '),
                            contactLine,
                        ]} />
                    </SheetBody>
                </SheetPage>
            </main>

            {isPreview && onConfirm && onBack && (
                <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-between items-center bg-gray-800 print:hidden">
                    <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                        Back to Edit
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isSubmitting}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Saving…' : 'Confirm & Save'}
                    </button>
                </footer>
            )}
        </div>
    );
};

export default PrintablePdi;
