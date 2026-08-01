import React from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { InternalJob, BusinessDetails } from '../../types';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '../icons';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { SheetPage, SheetBand, SheetBody, SheetSection, SheetRow, SheetFooter, SheetToolbar } from '../common/SpecSheet';

interface PrintableJobSheetProps {
    job: InternalJob;
    businessDetails: BusinessDetails | null;
    onClose: () => void;
    isPreview?: boolean;
    onConfirm?: () => void;
    onBack?: () => void;
}

const PrintableJobSheet = ({ job, businessDetails, onClose, isPreview, onConfirm, onBack }: PrintableJobSheetProps) => {
    const car = job?.carDetails || ({} as InternalJob['carDetails']);
    const items = job?.items || [];
    const jobDateLabel = job?.jobDate ? formatDate(job.jobDate) : null;

    const makeModel = [car.make, car.model].filter(Boolean).join(' ');
    const vehicleSubtitle = [car.color, car.year ? `Model Year ${car.year}` : null].filter(Boolean).join('  |  ');

    const handleDownloadPdf = async () => {
        const input = document.getElementById('printable-job-sheet');
        if (!input) return;

        const canvas = await html2canvas(input, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });

        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const imgProps = pdf.getImageProperties(imgData);
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Internal-Job-Sheet-${job?.jobSheetNumber}-${car.reg || 'vehicle'}.pdf`);
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm print:bg-white">
            <SheetToolbar title={isPreview ? 'Internal Job Sheet Preview' : `Internal Job Sheet #${job?.jobSheetNumber}`}>
                {!isPreview && (
                    <>
                        <button onClick={handleDownloadPdf} className="p-2 mr-1 rounded-full text-gray-300 hover:bg-gray-700" title="Download PDF"><ArrowDownTrayIcon className="h-5 w-5" /></button>
                        <button onClick={() => window.print()} className="p-2 mr-1 rounded-full text-gray-300 hover:bg-gray-700" title="Print"><PrinterIcon className="h-5 w-5" /></button>
                    </>
                )}
                <button onClick={onClose} className="p-2 rounded-full text-gray-300 hover:bg-gray-700" title="Close"><XMarkIcon className="h-5 w-5" /></button>
            </SheetToolbar>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-500 print:p-0 print:bg-white print:overflow-visible">
                <SheetPage id="printable-job-sheet">
                    <SheetBand
                        title={businessDetails?.name || 'Internal Job Sheet'}
                        subtitle="Internal Job Sheet"
                        rightTitle={makeModel || car.reg}
                        rightSubtitle={vehicleSubtitle || car.reg}
                    />

                    <SheetBody>
                        <SheetSection title="Record">
                            <SheetRow label="Job date" value={jobDateLabel} />
                            <SheetRow label="Reference" value={job?.jobSheetNumber} />
                            <SheetRow label="Type" value="Internal / in-house work" note="not a VAT invoice" />
                        </SheetSection>

                        <SheetSection title="Vehicle">
                            <SheetRow label="Registration" value={car.reg} />
                            <SheetRow label="Make & Model" value={makeModel} note={car.year ? `Model year ${car.year}` : undefined} />
                            <SheetRow label="VIN" value={car.vin} />
                            <SheetRow label="Stock number" value={car.stockNumber} />
                            <SheetRow
                                label="Odometer"
                                value={typeof car.mileage === 'number' ? `${car.mileage.toLocaleString()} miles` : undefined}
                                note={jobDateLabel ? `recorded ${jobDateLabel}` : undefined}
                            />
                            <SheetRow label="Exterior" value={car.color} />
                            <SheetRow label="Engine" value={car.engineSize} />
                        </SheetSection>

                        <SheetSection title="Work Carried Out">
                            {items.length === 0 ? (
                                <p className="text-[12px] text-gray-500 py-1">No work items listed.</p>
                            ) : (
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-300">
                                            <th className="py-1 text-left text-[10px] font-bold uppercase tracking-wide text-gray-500">Description</th>
                                            <th className="py-1 w-32 text-right text-[10px] font-bold uppercase tracking-wide text-gray-500">Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, index) => (
                                            <tr key={index} className="border-b border-gray-200">
                                                <td className="py-1.5 pr-4 align-top text-[12px] text-gray-800">{item.description || '-'}</td>
                                                <td className="py-1.5 align-top text-right text-[12px] font-semibold text-gray-900">{formatCurrency(item.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            <div className="mt-3 flex justify-end">
                                <div className="w-1/2">
                                    <div className="flex justify-between py-1.5 border-t-2 border-brand-800 text-[13px] font-bold text-gray-900">
                                        <span>Total internal cost</span>
                                        <span>{formatCurrency(job?.totalAmount)}</span>
                                    </div>
                                </div>
                            </div>
                        </SheetSection>

                        <SheetFooter lines={[
                            [businessDetails?.name, jobDateLabel && `Prepared ${jobDateLabel}`].filter(Boolean).join('  |  '),
                            'Internal document for cost tracking purposes only. This is not a VAT invoice.',
                            businessDetails?.address?.replace(/\n/g, ' - '),
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

export default PrintableJobSheet;
