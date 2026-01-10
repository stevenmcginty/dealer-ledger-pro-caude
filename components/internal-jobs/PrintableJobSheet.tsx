import React from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { InternalJob, BusinessDetails } from '../../types';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '../icons';
import { formatDate, formatCurrency } from '../../utils/helpers';

interface PrintableJobSheetProps {
    job: InternalJob;
    businessDetails: BusinessDetails | null;
    onClose: () => void;
    isPreview?: boolean;
    onConfirm?: () => void;
    onBack?: () => void;
}

const DetailRow = ({ label, value }: { label: string, value?: string | number | null }) => (
    <div className="grid grid-cols-3 gap-4 py-1.5 px-2">
        <span className="text-xs font-bold text-gray-600 col-span-1">{label}</span>
        <span className="text-xs text-gray-800 col-span-2">{value || 'N/A'}</span>
    </div>
);

const PrintableJobSheet = ({ job, businessDetails, onClose, isPreview, onConfirm, onBack }: PrintableJobSheetProps) => {
    
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
        pdf.save(`Job-Sheet-${job.jobSheetNumber}-${job.carDetails.reg}.pdf`);
    };
    
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-600 font-sans print:bg-white">
             <header className="bg-gray-800 p-2 flex justify-between items-center print:hidden flex-shrink-0">
                <h3 className="font-bold text-white ml-2">{isPreview ? 'Job Sheet Preview' : `Job Sheet #${job.jobSheetNumber}`}</h3>
                <div>
                    {!isPreview && (
                         <>
                            <button onClick={handleDownloadPdf} className="p-2 mr-1 rounded-full text-gray-300 hover:bg-gray-700" title="Download PDF"><ArrowDownTrayIcon className="h-5 w-5" /></button>
                            <button onClick={() => window.print()} className="p-2 mr-1 rounded-full text-gray-300 hover:bg-gray-700" title="Print"><PrinterIcon className="h-5 w-5" /></button>
                         </>
                    )}
                    <button onClick={onClose} className="p-2 rounded-full text-gray-300 hover:bg-gray-700" title="Close"><XMarkIcon className="h-5 w-5" /></button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto print:overflow-visible bg-white" id="pdf-content-wrapper">
              <div id="printable-job-sheet" className="p-4 bg-white w-full max-w-[210mm] mx-auto text-gray-900 text-sm print:max-w-none print:min-h-0 print:m-0 print:shadow-none">
                <header className="grid grid-cols-2 gap-8 pb-4 border-b border-gray-300">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">INTERNAL JOB SHEET</h1>
                        <p className="text-sm text-gray-500">Not a VAT Invoice</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-2xl font-bold text-gray-800">{businessDetails?.name}</h2>
                        <p className="text-xs text-gray-500 whitespace-pre-line">{businessDetails?.address}</p>
                    </div>
                </header>
                
                <section className="grid grid-cols-2 gap-8 py-4">
                     <div className="border border-gray-300 p-2 text-xs">
                        <p className="font-bold">Job Date:</p>
                        <p>{formatDate(job.jobDate)}</p>
                    </div>
                     <div className="border border-gray-300 p-2 text-xs">
                        <p className="font-bold">Job Sheet No:</p>
                        <p>{job.jobSheetNumber}</p>
                    </div>
                </section>

                <section className="mt-6">
                    <h3 className="font-bold text-gray-800 border-b-2 border-gray-800 pb-1 mb-2">Vehicle Details</h3>
                    <div className="border border-gray-300">
                         <DetailRow label="Registration" value={job.carDetails.reg} />
                         <DetailRow label="Make & Model" value={`${job.carDetails.make} ${job.carDetails.model}`} />
                         <DetailRow label="Stock Number" value={job.carDetails.stockNumber} />
                         <DetailRow label="VIN / Chassis No." value={job.carDetails.vin} />
                    </div>
                </section>
                
                <section className="mt-8">
                     <h3 className="font-bold text-gray-800 border-b-2 border-gray-800 pb-1 mb-2">Work Carried Out</h3>
                     <table className="w-full text-left">
                        <thead>
                            <tr className="border-b-2 border-gray-400">
                                <th className="py-2 font-bold">Description</th>
                                <th className="py-2 font-bold text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {job.items.map((item, index) => (
                                <tr key={index} className="border-b border-gray-200">
                                    <td className="py-2 pr-4">{item.description}</td>
                                    <td className="py-2 text-right">{formatCurrency(item.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="font-bold">
                                <td className="py-4 text-right">Total Internal Cost:</td>
                                <td className="py-4 text-right text-lg">{formatCurrency(job.totalAmount)}</td>
                            </tr>
                        </tfoot>
                     </table>
                </section>

                <footer className="mt-auto pt-12 text-center text-xs text-gray-500 border-t border-gray-300">
                    <p>This is an internal document for cost tracking purposes only.</p>
                </footer>
              </div>
            </main>
             {isPreview && onConfirm && onBack && (
                <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-between items-center bg-gray-800 print:hidden">
                    <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                        Back to Edit
                    </button>
                    <button type="button" onClick={onConfirm} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-blue-600 hover:bg-brand-blue-700">
                        Confirm & Save
                    </button>
                </footer>
            )}
        </div>
    );
};

export default PrintableJobSheet;