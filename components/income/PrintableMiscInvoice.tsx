import React from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { MiscInvoice, BusinessDetails } from '../../types';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '../icons';
import { formatDate, formatCurrency } from '../../utils/helpers';

interface PrintableMiscInvoiceProps {
    invoice: MiscInvoice;
    businessDetails: BusinessDetails | null;
    onClose: () => void;
    isPreview?: boolean;
    onConfirm?: () => void;
    onBack?: () => void;
}

const PrintableMiscInvoice = ({ invoice, businessDetails, onClose, isPreview, onConfirm, onBack }: PrintableMiscInvoiceProps) => {
    
    const handleDownloadPdf = async () => {
        const input = document.getElementById('printable-misc-invoice');
        if (!input) return;
        
        const canvas = await html2canvas(input, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.8);
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const imgProps = pdf.getImageProperties(imgData);
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Misc-Invoice-${invoice.invoiceNumber}.pdf`);
    };
    
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm font-sans">
             <header className="bg-gray-800 p-2 flex justify-between items-center print:hidden flex-shrink-0">
                <h3 className="font-bold text-white ml-2">{isPreview ? 'Invoice Preview' : `Invoice #${invoice.invoiceNumber}`}</h3>
                <div>
                    <button onClick={handleDownloadPdf} className="p-2 mr-1 rounded-full text-gray-300 hover:bg-gray-700" title="Download PDF"><ArrowDownTrayIcon className="h-5 w-5" /></button>
                    <button onClick={() => window.print()} className="p-2 mr-1 rounded-full text-gray-300 hover:bg-gray-700" title="Print"><PrinterIcon className="h-5 w-5" /></button>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-300 hover:bg-gray-700" title="Close"><XMarkIcon className="h-5 w-5" /></button>
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8 bg-gray-500">
              <div id="printable-misc-invoice" className="p-10 bg-white w-full max-w-4xl mx-auto text-black font-sans text-xs print:shadow-none print:p-0">
                    <div className="flex justify-between items-start mb-4">
                        <h1 className="text-3xl font-bold uppercase text-black">INVOICE</h1>
                        <div className="text-right">
                            <h2 className="text-xl font-bold text-black">{businessDetails?.name}</h2>
                            <p className="whitespace-pre-line text-black">{businessDetails?.address}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-10 border-y border-black py-2 mb-6 text-black">
                        <div className="flex justify-between"><span className="text-black">Invoice Date:</span> <span className="font-semibold text-black">{formatDate(invoice.invoiceDate)}</span></div>
                        <div className="flex justify-between"><span className="text-black">Invoice #:</span> <span className="font-semibold text-black">{invoice.invoiceNumber}</span></div>
                    </div>

                    <div className="mb-6">
                        <h3 className="font-bold text-black uppercase tracking-wider">Invoice To:</h3>
                        <p className="font-semibold mt-1 text-black">{invoice.customerName}</p>
                        <p className="whitespace-pre-line text-black">{invoice.customerAddress}</p>
                    </div>
                    
                    <table className="w-full text-left text-xs">
                        <thead className="bg-white">
                            <tr className="border-b-2 border-black">
                                <th className="p-2 font-bold uppercase tracking-wider text-black">Description</th>
                                <th className="p-2 font-bold uppercase tracking-wider text-right text-black">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.items.map((item, index) => (
                                <tr key={index} className="border-b border-black">
                                    <td className="p-2 pr-4 text-black">{item.description}</td>
                                    <td className="p-2 text-right text-black">{formatCurrency(item.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="flex justify-end mt-4">
                        <div className="w-1/2">
                            <div className="flex justify-between py-0.5 text-black"><span className="text-black">Subtotal</span> <span className="font-semibold text-black">{formatCurrency(invoice.subtotal)}</span></div>
                            {invoice.isVatInvoice && <div className="flex justify-between py-0.5 text-black"><span className="text-black">VAT (20%)</span> <span className="font-semibold text-black">{formatCurrency(invoice.vat)}</span></div>}
                            <div className="flex justify-between py-2 border-t-2 border-black mt-2 text-black">
                                <span className="font-bold text-base text-black">Total Due</span>
                                <span className="font-bold text-base text-black">{formatCurrency(invoice.total)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="mt-auto pt-8">
                        {businessDetails?.invoiceTerms && (
                            <div className="mt-8 text-xs">
                                <p className="text-black whitespace-pre-line">{businessDetails.invoiceTerms}</p>
                            </div>
                        )}
                        {businessDetails?.bankDetails && (
                            <div className="mt-8 text-xs">
                                <h3 className="font-bold border-b border-black pb-1 mb-2 text-black">Payment Details</h3>
                                <p className="text-black whitespace-pre-line">{businessDetails.bankDetails}</p>
                            </div>
                        )}
                        <footer className="mt-16 pt-2 border-t border-black text-center text-black text-[9px]" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                            <p className="text-black">
                                {businessDetails?.companyNumber && `Company No: ${businessDetails.companyNumber}`}
                                {businessDetails?.companyNumber && businessDetails?.vatNumber && ' | '}
                                {businessDetails?.vatNumber && `VAT No: ${businessDetails.vatNumber}`}
                            </p>
                            <p className="mt-1 text-black">{businessDetails?.address?.replace(/\n/g, ', ')}</p>
                             <p className="mt-1 text-black">
                                {businessDetails?.phone && `Tel: ${businessDetails.phone}`}
                                {businessDetails?.phone && businessDetails?.email && ' | '}
                                {businessDetails?.email && `Email: ${businessDetails.email}`}
                            </p>
                        </footer>
                    </div>
              </div>
            </main>
             {isPreview && onConfirm && onBack && (
                <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-between items-center bg-gray-800 print:hidden">
                    <button type="button" onClick={onBack} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">
                        Back to Edit
                    </button>
                    <button type="button" onClick={onConfirm} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700">
                        {invoice.linkedTransactionId ? 'Confirm & Reconcile' : 'Confirm & Save'}
                    </button>
                </footer>
            )}
        </div>
    );
};

export default PrintableMiscInvoice;
