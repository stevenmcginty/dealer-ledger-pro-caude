import React from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { WorkSheet, BusinessDetails } from '../../types';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '../icons';
import { formatDate, formatCurrency } from '../../utils/helpers';

interface PrintableWorkSheetProps {
    sheet: WorkSheet;
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

const PrintableWorkSheet = ({ sheet, businessDetails, onClose, isPreview, onConfirm, onBack }: PrintableWorkSheetProps) => {
    
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
        pdf.save(`Invoice-${sheet?.workSheetNumber}-${sheet?.carDetails?.reg}.pdf`);
    };

    const hasAmounts = sheet?.items && sheet.items.length > 0 && sheet.items.some(item => typeof item.amount === 'number');
    const totalAmount = hasAmounts ? sheet.items.reduce((sum, item) => sum + (item.amount || 0), 0) : 0;
    
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm print:bg-white">
             <header className="bg-gray-800 p-2 flex justify-between items-center print:hidden flex-shrink-0">
                <h3 className="font-bold text-white ml-2">{isPreview ? 'Invoice Preview' : `Invoice #${sheet?.workSheetNumber}`}</h3>
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

            <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-500">
              <div id="printable-worksheet" className="p-8 bg-white text-black w-full max-w-4xl mx-auto font-sans text-sm print:shadow-none print:p-0 min-h-[297mm] relative">
                <header className="flex justify-between items-start pb-4 mb-4">
                    <div>
                        <h1 className="text-4xl font-bold text-black">INVOICE</h1>
                    </div>
                    <div className="text-right">
                        <h2 className="text-lg font-bold text-black">{businessDetails?.name}</h2>
                        <p className="whitespace-pre-line text-black text-xs leading-snug">{businessDetails?.address}</p>
                        <p className="text-black text-xs mt-1">{businessDetails?.phone}</p>
                    </div>
                </header>

                <section className="grid grid-cols-2 gap-8 border-y border-black py-2 mb-4 text-xs text-black">
                    <div className="text-black">Date: <span className="font-semibold text-black">{sheet?.workDate ? formatDate(sheet.workDate) : 'N/A'}</span></div>
                    <div className="text-right text-black">Invoice #: <span className="font-semibold text-black">{sheet?.workSheetNumber || 'N/A'}</span></div>
                </section>
                
                <section className="mb-8">
                    {sheet?.customerName ? (
                        <>
                            <h3 className="font-bold text-black uppercase tracking-wider text-xs mb-1">INVOICE TO:</h3>
                            <p className="font-semibold text-base text-black">{sheet.customerName}</p>
                            <p className="whitespace-pre-line text-black text-sm leading-snug mt-2">
                                Re: {sheet?.carDetails.make} {sheet?.carDetails.model} ({sheet?.carDetails.reg})
                            </p>
                        </>
                    ) : (
                        <div>
                             <h3 className="font-bold text-black uppercase tracking-wider text-xs mb-1">VEHICLE DETAILS:</h3>
                             <p className="whitespace-pre-line text-black text-sm leading-snug mt-2">
                                {sheet?.carDetails.make} {sheet?.carDetails.model} ({sheet?.carDetails.reg})<br/>
                                {`Stock #: ${sheet?.carDetails.stockNumber}`}<br/>
                                {`VIN: ${sheet?.carDetails.vin}`}<br/>
                                {`Mileage: ${sheet?.carDetails.mileage?.toLocaleString()}`}
                            </p>
                        </div>
                    )}
                </section>
                
                <section>
                     <table className="w-full text-left text-sm">
                        <thead className="bg-white">
                            <tr className="border-y-2 border-black">
                                <th className="py-2 text-left font-bold text-black uppercase text-xs tracking-wider">Description</th>
                                <th className="py-2 w-32 text-right font-bold text-black uppercase text-xs tracking-wider">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sheet?.items && sheet.items.length > 0 ? (
                                sheet.items.map((item, index) => (
                                    <tr key={index} className="border-b border-gray-300">
                                        <td className="py-2 pr-4 align-top text-black">{item.description || 'N/A'}</td>
                                        <td className="py-2 text-right align-top font-medium text-black">{hasAmounts ? formatCurrency(item.amount) : ''}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={2} className="py-4 text-center text-black">No work items listed.</td>
                                </tr>
                            )}
                        </tbody>
                     </table>
                     
                     {hasAmounts && (
                        <div className="flex justify-end mt-4">
                            <div className="w-1/2 space-y-1 text-sm text-black">
                                 <div className="flex justify-between py-1 border-b border-black text-black">
                                     <span className="text-black">Subtotal</span>
                                     <span className="font-semibold text-black">{formatCurrency(totalAmount)}</span>
                                 </div>
                                 <div className="flex justify-between items-center py-2 border-t-2 border-black mt-2 text-black">
                                    <span className="font-bold text-base text-black">Total Due</span>
                                    <span className="font-bold text-base text-black">{formatCurrency(totalAmount)}</span>
                                </div>
                            </div>
                        </div>
                     )}
                </section>

                <footer className="mt-16 text-xs text-black space-y-4 absolute bottom-8 w-[calc(100%-4rem)]">
                    {businessDetails?.invoiceTerms && (
                        <div>
                            <p className="text-black whitespace-pre-line">{businessDetails.invoiceTerms}</p>
                        </div>
                    )}
                    {businessDetails?.bankDetails && (
                        <div>
                            <h3 className="font-bold border-b border-black pb-1 mb-2 text-black">Payment Details</h3>
                            <p className="text-black whitespace-pre-line">{businessDetails.bankDetails}</p>
                        </div>
                    )}
                    <div className="text-center w-full pt-4 border-t border-black text-black text-[9px]">
                        <p className="text-black">
                            {businessDetails?.companyNumber && `Company No: ${businessDetails.companyNumber}`}
                            {businessDetails?.companyNumber && businessDetails?.vatNumber && ' | '}
                            {businessDetails?.vatNumber && `VAT No: ${businessDetails.vatNumber}`}
                        </p>
                        <p className="mt-1 text-black">{businessDetails?.address?.replace(/\n/g, ' - ')}</p>
                        <p className="mt-1 text-black">
                            {businessDetails?.phone && `Tel: ${businessDetails.phone}`}
                            {businessDetails?.phone && businessDetails?.email && ' | '}
                            {businessDetails?.email && `Email: ${businessDetails.email}`}
                        </p>
                    </div>
                </footer>
              </div>
            </main>
             {isPreview && onConfirm && onBack && (
                <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-between items-center bg-gray-800 print:hidden">
                    <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                        Back to Edit
                    </button>
                    <button type="button" onClick={onConfirm} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700">
                        Confirm & Save
                    </button>
                </footer>
            )}
        </div>
    );
};

export default PrintableWorkSheet;