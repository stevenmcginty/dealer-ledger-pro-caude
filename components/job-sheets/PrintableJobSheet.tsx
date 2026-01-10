
import React from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { WorkSheet, BusinessDetails } from '../../types';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '../icons';
import { formatDate } from '../../utils/helpers';

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
        pdf.save(`Work-Sheet-${sheet.workSheetNumber}-${sheet.carDetails.reg}.pdf`);
    };
    
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm print:bg-white">
             <header className="bg-gray-800 p-2 flex justify-between items-center print:hidden flex-shrink-0">
                <h3 className="font-bold text-white ml-2">{isPreview ? 'Work Sheet Preview' : `Work Sheet #${sheet.workSheetNumber}`}</h3>
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
              <div id="printable-worksheet" className="p-10 bg-white w-full max-w-4xl mx-auto text-black font-sans text-sm print:shadow-none print:p-0">
                <header className="grid grid-cols-2 gap-8 pb-4 border-b border-gray-300">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">WORK SHEET</h1>
                        <p className="text-sm text-gray-500">This is not a VAT Invoice</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-2xl font-bold text-gray-800">{businessDetails?.name}</h2>
                        <p className="text-xs text-gray-500 whitespace-pre-line">{businessDetails?.address}</p>
                    </div>
                </header>
                
                <section className="grid grid-cols-2 gap-8 py-4">
                     <div className="border border-gray-300 p-2 text-xs">
                        <p className="font-bold">Date:</p>
                        <p>{formatDate(sheet.workDate)}</p>
                    </div>
                     <div className="border border-gray-300 p-2 text-xs">
                        <p className="font-bold">Reference No:</p>
                        <p>{sheet.workSheetNumber}</p>
                    </div>
                </section>

                <section className="mt-6">
                    <h3 className="font-bold text-gray-800 border-b-2 border-gray-800 pb-1 mb-2">Vehicle Details</h3>
                    <div className="border border-gray-300">
                         <DetailRow label="Registration" value={sheet.carDetails.reg} />
                         <DetailRow label="Make & Model" value={`${sheet.carDetails.make} ${sheet.carDetails.model}`} />
                         <DetailRow label="Stock Number" value={sheet.carDetails.stockNumber} />
                         <DetailRow label="VIN / Chassis No." value={sheet.carDetails.vin} />
                    </div>
                </section>
                
                <section className="mt-8">
                     <h3 className="font-bold text-gray-800 border-b-2 border-gray-800 pb-1 mb-2">Work Carried Out</h3>
                     <ul className="list-disc list-inside space-y-2 mt-4 text-gray-800">
                        {sheet.items.map((item, index) => (
                            <li key={index} className="pl-2 text-sm">{item.description}</li>
                        ))}
                    </ul>
                </section>

                <footer className="mt-auto pt-12 text-center text-xs text-gray-500 border-t border-gray-300">
                     <p>This document details preparation work carried out on the above vehicle.</p>
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
