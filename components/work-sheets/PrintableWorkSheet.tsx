import React from 'react';
import { WorkSheet, BusinessDetails, workSheetRecordType } from '../../types';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '../icons';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { SheetPage, SheetBand, SheetBody, SheetSection, SheetRow, SheetBullet, SheetFooter, SheetToolbar } from '../common/SpecSheet';

interface PrintableWorkSheetProps {
    sheet: WorkSheet;
    businessDetails: BusinessDetails | null;
    onClose: () => void;
    isPreview?: boolean;
    onConfirm?: () => void;
    onBack?: () => void;
}

const PrintableWorkSheet = ({ sheet, businessDetails, onClose, isPreview, onConfirm, onBack }: PrintableWorkSheetProps) => {
    const car = sheet?.carDetails || ({} as WorkSheet['carDetails']);
    const isInternal = workSheetRecordType(sheet || {}) === 'internal';
    const docType = isInternal ? 'Internal Work Record' : 'Work Receipt';

    const items = sheet?.items || [];
    const hasAmounts = items.length > 0 && items.some(item => typeof item.amount === 'number');
    const totalAmount = hasAmounts ? items.reduce((sum, item) => sum + (item.amount || 0), 0) : 0;
    const vatAmount = !isInternal && sheet?.vatApplied ? totalAmount * 0.2 : 0;
    const totalDue = totalAmount + vatAmount;

    const workDateLabel = sheet?.workDate ? formatDate(sheet.workDate) : null;

    // Mileage recorded on the sheet wins; otherwise fall back to the vehicle snapshot.
    const odometer = typeof sheet?.serviceMileage === 'number' ? sheet.serviceMileage : car.mileage;

    const makeModel = [car.make, car.model].filter(Boolean).join(' ');
    const vehicleSubtitle = [car.color, car.year ? `Model Year ${car.year}` : null].filter(Boolean).join('  |  ');

    const fileName = `${isInternal ? 'Internal-Work-Record' : 'Work-Receipt'}-${sheet?.workSheetNumber || 'draft'}-${car.reg || 'vehicle'}.pdf`;

    const handleDownloadPdf = async () => {
        // Build the PDF from the worksheet values instead of rasterising the
        // DOM. This keeps the PDF's text selectable/searchable and gives the
        // same A4 result in desktop browsers, PWAs, and Android WebViews.
        const { default: jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 16;
        const contentWidth = pageWidth - margin * 2;
        const readThemeColor = (name: string, fallback: [number, number, number]): [number, number, number] => {
            const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            const parts = value.split(/\s+/).map(Number);
            return parts.length === 3 && parts.every(Number.isFinite) ? parts as [number, number, number] : fallback;
        };
        const brand = readThemeColor('--color-brand-800', [7, 89, 133]);
        const brandAccent = readThemeColor('--color-brand-600', [2, 132, 199]);
        let fontFamily = 'helvetica';

        // Embed the same Inter font used by the app so PDF viewers do not
        // substitute a different device font with different glyph metrics.
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
            console.warn('Could not embed Inter in worksheet PDF; using a standard PDF font.', error);
        }
        let y = 16;

        const addPageIfNeeded = (height: number) => {
            if (y + height <= pageHeight - margin) return;
            pdf.addPage();
            y = margin;
        };

        const addWrappedText = (value: string, x: number, width: number, size: number, color: [number, number, number], weight: 'normal' | 'bold' = 'normal') => {
            pdf.setFont(fontFamily, weight);
            pdf.setFontSize(size);
            pdf.setTextColor(...color);
            const lines = pdf.splitTextToSize(value, width) as string[];
            pdf.text(lines, x, y);
            y += lines.length * (size * 0.42);
            return lines.length;
        };

        const addHeader = () => {
            pdf.setFillColor(...brand);
            pdf.rect(0, 0, pageWidth, 31, 'F');
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(18);
            pdf.setTextColor(255, 255, 255);
            pdf.text(businessDetails?.name || docType, margin, 13);
            if (businessDetails?.name) {
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(8.5);
                pdf.text(docType, margin, 19);
            }
            const rightTitle = makeModel || car.reg;
            const rightSubtitle = vehicleSubtitle || car.reg;
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(11);
            pdf.text(rightTitle || '', pageWidth - margin, 13, { align: 'right' });
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(8.5);
            pdf.text(rightSubtitle || '', pageWidth - margin, 19, { align: 'right' });
            y = 42;
        };

        const addSection = (title: string) => {
            addPageIfNeeded(12);
            pdf.setDrawColor(190, 190, 190);
            pdf.setLineWidth(0.25);
            pdf.line(margin, y + 2, pageWidth - margin, y + 2);
            pdf.setFillColor(...brandAccent);
            pdf.rect(margin, y - 5, 1.2, 5, 'F');
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(8.5);
            pdf.setTextColor(...brand);
            pdf.text(title.toUpperCase(), margin + 4, y - 1);
            y += 8;
        };

        const addRow = (label: string, value?: string | number | null, note?: string | null) => {
            if (value === undefined || value === null || value === '') return;
            const valueText = String(value);
            const noteWidth = note ? 46 : 0;
            const valueWidth = contentWidth - 39 - noteWidth;
            const valueLines = pdf.splitTextToSize(valueText, valueWidth) as string[];
            const rowHeight = Math.max(5, valueLines.length * 4.5);
            addPageIfNeeded(rowHeight + 1);
            pdf.setFont(fontFamily, 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(105, 105, 105);
            pdf.text(label, margin, y);
            pdf.setFont(fontFamily, 'bold');
            pdf.setTextColor(25, 25, 25);
            pdf.text(valueLines, margin + 39, y);
            if (note) {
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(7.2);
                pdf.setTextColor(105, 105, 105);
                pdf.text(pdf.splitTextToSize(note, noteWidth) as string[], pageWidth - margin, y, { align: 'right' });
            }
            y += rowHeight;
        };

        addHeader();
        addSection(isInternal ? 'Record' : 'Work Receipt');
        addRow('Date', workDateLabel);
        addRow('Reference', sheet?.workSheetNumber);
        if (!isInternal) addRow('Customer', sheet?.customerName);
        addRow('Type', isInternal ? 'Internal / in-house work' : 'Chargeable work', isInternal ? 'not a VAT invoice' : null);

        addSection('Vehicle');
        addRow('Registration', car.reg);
        addRow('Make & Model', makeModel, car.year ? `Model year ${car.year}` : null);
        addRow('VIN', car.vin);
        addRow('Stock number', car.stockNumber);
        addRow('Odometer', typeof odometer === 'number' ? `${odometer.toLocaleString()} miles` : null, workDateLabel ? `recorded ${workDateLabel}` : null);
        addRow('Exterior', car.color);
        addRow('Engine', car.engineSize);
        addRow('MOT due', car.motDueDate ? formatDate(car.motDueDate) : null);

        addSection('Work Carried Out');
        if (items.length === 0) {
            addRow('', 'No work items listed.');
        } else if (hasAmounts) {
            addPageIfNeeded(10);
            pdf.setFont(fontFamily, 'bold');
            pdf.setFontSize(7.5);
            pdf.setTextColor(105, 105, 105);
            pdf.text('DESCRIPTION', margin, y);
            pdf.text('AMOUNT', pageWidth - margin, y, { align: 'right' });
            y += 5;
            items.forEach(item => {
                const descriptionLines = pdf.splitTextToSize(item.description || '-', contentWidth - 35) as string[];
                const rowHeight = Math.max(5, descriptionLines.length * 4.5);
                addPageIfNeeded(rowHeight + 1);
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(8);
                pdf.setTextColor(35, 35, 35);
                pdf.text(descriptionLines, margin, y);
                pdf.setFont(fontFamily, 'bold');
                pdf.text(typeof item.amount === 'number' ? formatCurrency(item.amount) : '', pageWidth - margin, y, { align: 'right' });
                y += rowHeight;
                pdf.setDrawColor(225, 225, 225);
                pdf.line(margin, y - 1.5, pageWidth - margin, y - 1.5);
            });
            y += 3;
            const totalsX = pageWidth - margin - 65;
            const addTotal = (label: string, amount: number, bold = false) => {
                pdf.setFont(fontFamily, bold ? 'bold' : 'normal');
                pdf.setFontSize(bold ? 9 : 8);
                pdf.setTextColor(35, 35, 35);
                pdf.text(label, totalsX, y);
                pdf.text(formatCurrency(amount), pageWidth - margin, y, { align: 'right' });
                y += bold ? 6 : 5;
            };
            addTotal('Subtotal', totalAmount);
            if (!isInternal && sheet?.vatApplied) addTotal('VAT (20%)', vatAmount);
            pdf.setDrawColor(...brand);
            pdf.setLineWidth(0.6);
            pdf.line(totalsX, y - 2, pageWidth - margin, y - 2);
            addTotal(isInternal ? 'Total internal cost' : 'Total due', totalDue, true);
        } else {
            items.forEach(item => addRow('', `- ${item.description || ''}`));
        }

        if (!isInternal && businessDetails?.invoiceTerms) {
            addSection('Terms');
            addWrappedText(businessDetails.invoiceTerms, margin, contentWidth, 8, [70, 70, 70]);
            y += 3;
        }
        if (!isInternal && hasAmounts && businessDetails?.bankDetails) {
            addSection('Payment Details');
            addWrappedText(businessDetails.bankDetails, margin, contentWidth, 8, [70, 70, 70]);
            y += 3;
        }

        const footerLines = [
            [businessDetails?.name, workDateLabel && `Prepared ${workDateLabel}`].filter(Boolean).join('  |  '),
            isInternal && 'Internal record for cost tracking only. This is not a VAT invoice.',
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
            footerLines.forEach(line => {
                pdf.setFont(fontFamily, 'normal');
                pdf.setFontSize(7);
                pdf.setTextColor(105, 105, 105);
                pdf.text(pdf.splitTextToSize(line, contentWidth) as string[], margin, y);
                y += 4;
            });
        }

        pdf.save(fileName);
    };

    const contactLine = [
        businessDetails?.phone && `Tel: ${businessDetails.phone}`,
        businessDetails?.email,
    ].filter(Boolean).join('  |  ');

    const registrationLine = [
        businessDetails?.companyNumber && `Company No: ${businessDetails.companyNumber}`,
        businessDetails?.vatNumber && `VAT No: ${businessDetails.vatNumber}`,
    ].filter(Boolean).join('  |  ');

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm print:bg-white">
            <SheetToolbar title={isPreview ? `${docType} Preview` : `${docType} #${sheet?.workSheetNumber}`}>
                {!isPreview && (
                    <>
                        <button onClick={handleDownloadPdf} aria-label="Download worksheet as PDF" className="inline-flex items-center gap-2 px-3 py-2 mr-1 rounded-md text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 active:bg-brand-700 shadow-sm" title="Download PDF"><ArrowDownTrayIcon className="h-5 w-5" /><span>Download PDF</span></button>
                        <button onClick={() => window.print()} className="p-2 mr-1 rounded-full text-gray-300 hover:bg-gray-700" title="Print"><PrinterIcon className="h-5 w-5" /></button>
                    </>
                )}
                <button onClick={onClose} className="p-2 rounded-full text-gray-300 hover:bg-gray-700" title="Close"><XMarkIcon className="h-5 w-5" /></button>
            </SheetToolbar>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-500 print:p-0 print:bg-white print:overflow-visible">
                <SheetPage id="printable-worksheet">
                    <SheetBand
                        title={businessDetails?.name || docType}
                        subtitle={businessDetails?.name ? docType : null}
                        rightTitle={makeModel || car.reg}
                        rightSubtitle={vehicleSubtitle || car.reg}
                    />

                    <SheetBody>
                        <SheetSection title={isInternal ? 'Record' : 'Work Receipt'}>
                            <SheetRow label="Date" value={workDateLabel} />
                            <SheetRow label="Reference" value={sheet?.workSheetNumber} />
                            {!isInternal && <SheetRow label="Customer" value={sheet?.customerName} />}
                            <SheetRow
                                label="Type"
                                value={isInternal ? 'Internal / in-house work' : 'Chargeable work'}
                                note={isInternal ? 'not a VAT invoice' : undefined}
                            />
                        </SheetSection>

                        <SheetSection title="Vehicle">
                            <SheetRow label="Registration" value={car.reg} />
                            <SheetRow label="Make & Model" value={makeModel} note={car.year ? `Model year ${car.year}` : undefined} />
                            <SheetRow label="VIN" value={car.vin} />
                            <SheetRow label="Stock number" value={car.stockNumber} />
                            <SheetRow
                                label="Odometer"
                                value={typeof odometer === 'number' ? `${odometer.toLocaleString()} miles` : undefined}
                                note={workDateLabel ? `recorded ${workDateLabel}` : undefined}
                            />
                            <SheetRow label="Exterior" value={car.color} />
                            <SheetRow label="Engine" value={car.engineSize} />
                            <SheetRow label="MOT due" value={car.motDueDate ? formatDate(car.motDueDate) : undefined} />
                        </SheetSection>

                        <SheetSection title="Work Carried Out">
                            {items.length === 0 ? (
                                <p className="text-[12px] text-gray-500 py-1">No work items listed.</p>
                            ) : hasAmounts ? (
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-300">
                                            <th className="py-1 text-left text-[10px] font-bold uppercase tracking-wide text-gray-500">Description</th>
                                            <th className="py-1 w-32 text-right text-[10px] font-bold uppercase tracking-wide text-gray-500">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, index) => (
                                            <tr key={index} className="border-b border-gray-200">
                                                <td className="py-1.5 pr-4 align-top text-[12px] text-gray-800">{item.description || '-'}</td>
                                                <td className="py-1.5 align-top text-right text-[12px] font-semibold text-gray-900">
                                                    {typeof item.amount === 'number' ? formatCurrency(item.amount) : ''}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                items.map((item, index) => <SheetBullet key={index}>{item.description}</SheetBullet>)
                            )}

                            {hasAmounts && (
                                <div className="mt-3 flex justify-end">
                                    <div className="w-1/2">
                                        <div className="flex justify-between py-1 text-[12px] text-gray-700">
                                            <span>Subtotal</span>
                                            <span className="font-semibold text-gray-900">{formatCurrency(totalAmount)}</span>
                                        </div>
                                        {!isInternal && sheet?.vatApplied && (
                                            <div className="flex justify-between py-1 text-[12px] text-gray-700">
                                                <span>VAT (20%)</span>
                                                <span className="font-semibold text-gray-900">{formatCurrency(vatAmount)}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between py-1.5 border-t-2 border-brand-800 text-[13px] font-bold text-gray-900">
                                            <span>{isInternal ? 'Total internal cost' : 'Total due'}</span>
                                            <span>{formatCurrency(totalDue)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </SheetSection>

                        {!isInternal && businessDetails?.invoiceTerms && (
                            <SheetSection title="Terms">
                                <p className="text-[11px] leading-relaxed text-gray-700 whitespace-pre-line">{businessDetails.invoiceTerms}</p>
                            </SheetSection>
                        )}

                        {!isInternal && hasAmounts && businessDetails?.bankDetails && (
                            <SheetSection title="Payment Details">
                                <p className="text-[11px] leading-relaxed text-gray-700 whitespace-pre-line">{businessDetails.bankDetails}</p>
                            </SheetSection>
                        )}

                        <SheetFooter lines={[
                            [businessDetails?.name, workDateLabel && `Prepared ${workDateLabel}`].filter(Boolean).join('  |  '),
                            isInternal && 'Internal record for cost tracking only. This is not a VAT invoice.',
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
                    <button type="button" onClick={onConfirm} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700">
                        Confirm &amp; Save
                    </button>
                </footer>
            )}
        </div>
    );
};

export default PrintableWorkSheet;
