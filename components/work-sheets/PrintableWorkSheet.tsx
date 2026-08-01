import React from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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

    const workDateLabel = sheet?.workDate ? formatDate(sheet.workDate) : null;

    // Mileage recorded on the sheet wins; otherwise fall back to the vehicle snapshot.
    const odometer = typeof sheet?.serviceMileage === 'number' ? sheet.serviceMileage : car.mileage;

    const makeModel = [car.make, car.model].filter(Boolean).join(' ');
    const vehicleSubtitle = [car.color, car.year ? `Model Year ${car.year}` : null].filter(Boolean).join('  |  ');

    const fileName = `${isInternal ? 'Internal-Work-Record' : 'Work-Receipt'}-${sheet?.workSheetNumber || 'draft'}-${car.reg || 'vehicle'}.pdf`;

    const handleDownloadPdf = async () => {
        const input = document.getElementById('printable-worksheet');
        if (!input) return;

        const canvas = await html2canvas(input, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const imgProps = pdf.getImageProperties(imgData);
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
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
                        <button onClick={handleDownloadPdf} className="p-2 mr-1 rounded-full text-gray-300 hover:bg-gray-700" title="Download PDF"><ArrowDownTrayIcon className="h-5 w-5" /></button>
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
                                        <div className="flex justify-between py-1.5 border-t-2 border-brand-800 text-[13px] font-bold text-gray-900">
                                            <span>{isInternal ? 'Total internal cost' : 'Total due'}</span>
                                            <span>{formatCurrency(totalAmount)}</span>
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
