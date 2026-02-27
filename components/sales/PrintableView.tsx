import React, { useMemo } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { SalesDocument, BusinessDetails, Vehicle, PartExchangeVehicle } from '../../types';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '../icons';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { useData } from '../../hooks/useData';

interface PrintableViewProps {
    document: SalesDocument;
    businessDetails: BusinessDetails | null;
    onClose: () => void;
    isPreview?: boolean;
    onConfirm?: () => void;
    onBack?: () => void;
}

const VehicleDetailGridItem: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => {
    if (value === null || value === undefined || value === '') return null;
    // Defensive check to ensure we only render primitives.
    if (typeof value !== 'string' && typeof value !== 'number') {
        console.warn(`Invalid value for VehicleDetailGridItem label "${label}":`, value);
        return null;
    }
    return (
        <div className="flex justify-between text-black text-xs">
            <span className="text-black">{label}</span>
            <span className="font-semibold text-right text-black">{value}</span>
        </div>
    );
};


const PrintableView: React.FC<PrintableViewProps> = ({ document: doc, businessDetails, onClose, isPreview, onConfirm, onBack }) => {
    const { isVatRegistered } = useData();
    
    // Create sanitized, safe-to-render versions of details to prevent crashes from bad data.
    const safeCarDetails = useMemo(() => {
        const details = doc.carDetails || {};
        const sanitized: Partial<Omit<Vehicle, 'id' | 'createdAt' | 'status'>> = {};
        const keysToSanitize: (keyof Omit<Vehicle, 'id' | 'createdAt' | 'status'>)[] = [
            'make', 'model', 'year', 'reg', 'color', 'vin', 
            'mileage', 'engineSize', 'firstRegistered'
        ];

        for (const key of keysToSanitize) {
            const value = details[key as keyof typeof details];
            if (typeof value === 'string' || typeof value === 'number') {
                // FIX: Cast sanitized to 'any' to allow dynamic property assignment.
                // This resolves a TypeScript error where the compiler cannot determine the
                // specific type of 'key' at compile time, leading to an incorrect 'never' type inference.
                (sanitized as any)[key] = value;
            }
        }
        return sanitized;
    }, [doc.carDetails]);
    
    const safePxDetails = useMemo(() => {
        const details = doc.partExchangeDetails || {};
        const sanitized: Partial<PartExchangeVehicle> = {};
        const keysToSanitize: (keyof PartExchangeVehicle)[] = ['reg', 'make', 'model', 'year', 'mileage', 'vin'];

        for (const key of keysToSanitize) {
            const value = details[key as keyof typeof details];
            if (typeof value === 'string' || typeof value === 'number') {
                // FIX: Cast sanitized to 'any' to allow dynamic property assignment.
                // This resolves a TypeScript error where the compiler cannot determine the
                // specific type of 'key' at compile time, leading to an incorrect 'never' type inference.
                (sanitized as any)[key] = value;
            }
        }
        return sanitized;
    }, [doc.partExchangeDetails]);

    const handleDownloadPdf = async () => {
        const elementToPrint = document.getElementById('printable-content');
        const pdfRenderer = document.getElementById('pdf-renderer');

        if (!elementToPrint || !pdfRenderer) {
            console.error("Required elements for PDF generation are not found.");
            return;
        }

        const clone = elementToPrint.cloneNode(true) as HTMLElement;

        // Render at exact A4 proportions so it fits one page
        clone.style.width = '210mm';
        clone.style.minHeight = '277mm';
        clone.style.maxHeight = '277mm';
        clone.style.padding = '8mm 10mm';
        clone.style.boxSizing = 'border-box';
        clone.style.display = 'flex';
        clone.style.flexDirection = 'column';
        clone.style.overflow = 'hidden';
        
        pdfRenderer.innerHTML = '';
        pdfRenderer.appendChild(clone);
        pdfRenderer.classList.remove('hidden');

        try {
            const canvas = await html2canvas(clone, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            // Single page — fit to A4 exactly
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`${doc.documentType.replace(/\s/g, '-')}-${doc.invoiceNumber}.pdf`);
        } catch (error) {
            console.error("Error generating PDF:", error);
        } finally {
            pdfRenderer.innerHTML = '';
            pdfRenderer.classList.add('hidden');
        }
    };

     const docTitles = { 
        'Sales Invoice': "INVOICE", 
        'Proforma Invoice': "PROFORMA INVOICE", 
        'Deposit Slip': "DEPOSIT SLIP",
        'Purchase Invoice': "PURCHASE INVOICE"
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm print:bg-white">
            <header className="bg-gray-800 p-2 flex justify-between items-center print:hidden flex-shrink-0">
                <h3 className="font-bold text-white ml-2">{isPreview ? 'Invoice Preview' : `${doc.documentType} #${doc.invoiceNumber}`}</h3>
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
                <div id="printable-content" className="bg-white w-full max-w-4xl mx-auto text-black font-sans text-sm print:shadow-none print:p-0 flex flex-col" style={{ padding: '8mm 10mm', minHeight: '277mm', maxHeight: '277mm', overflow: 'hidden' }}>
                    <header className="flex justify-between items-start pb-3">
                        <div className="text-black">
                            <h1 className="text-3xl font-bold uppercase text-black">{docTitles[doc.documentType]} #{doc.invoiceNumber}</h1>
                        </div>
                         <div className="text-right">
                             <h2 className="text-lg font-bold text-black">{businessDetails?.name}</h2>
                             <p className="whitespace-pre-line text-black text-sm leading-snug">{businessDetails?.address}</p>
                             <p className="text-black text-sm mt-1">{businessDetails?.phone}</p>
                        </div>
                    </header>
                    <section className="grid grid-cols-2 gap-6 mb-3">
                        <div className="border border-black p-2 text-black">
                            <h3 className="font-bold text-black uppercase tracking-wider text-xs mb-1">Invoice To:</h3>
                            <p className="font-semibold text-base text-black">{doc.customerName}</p>
                            <p className="whitespace-pre-line text-black text-sm leading-snug">{doc.customerAddress}</p>
                        </div>
                        {(doc.deliveryName || doc.deliveryAddress) && (
                            <div className="border border-black p-3 text-black">
                                <h3 className="font-bold text-black uppercase tracking-wider text-xs mb-1">Deliver To:</h3>
                                <p className="font-semibold text-base text-black">{doc.deliveryName}</p>
                                <p className="whitespace-pre-line text-black text-sm leading-snug">{doc.deliveryAddress}</p>
                            </div>
                        )}
                    </section>
                     <section className="grid grid-cols-2 gap-6 border-y border-black py-1 mb-4 text-sm text-black">
                        <div className="text-black">Date: <span className="font-semibold text-black">{formatDate(doc.invoiceDate)}</span></div>
                        <div className="text-right text-black">Invoice #: <span className="font-semibold text-black">{doc.invoiceNumber}</span></div>
                    </section>
                     <section>
                        <h2 className="font-bold border-b-2 border-black pb-1 mb-2 text-base tracking-wider text-black">DESCRIPTION</h2>
                        <div className="flex justify-between items-start py-2 border-b border-black text-black">
                            <span className="font-bold text-lg text-black">{safeCarDetails.make} {safeCarDetails.model}</span>
                            <span className="font-bold text-lg text-black">{formatCurrency(doc.price)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-12 p-2">
                            <div>
                                <VehicleDetailGridItem label="Make" value={safeCarDetails.make} />
                                <VehicleDetailGridItem label="Year" value={safeCarDetails.year} />
                                <VehicleDetailGridItem label="Registration No." value={safeCarDetails.reg} />
                                <VehicleDetailGridItem label="Colour" value={safeCarDetails.color} />
                                <VehicleDetailGridItem label="VIN / Chassis No." value={safeCarDetails.vin} />
                            </div>
                             <div>
                                <VehicleDetailGridItem label="Model" value={safeCarDetails.model} />
                                <VehicleDetailGridItem label="Mileage" value={safeCarDetails.mileage ? `${(safeCarDetails.mileage as number).toLocaleString()} miles` : null} />
                                <VehicleDetailGridItem label="Stock No." value={doc.stockNumber} />
                                <VehicleDetailGridItem label="Engine Size" value={safeCarDetails.engineSize} />
                                <VehicleDetailGridItem label="First Registered" value={safeCarDetails.firstRegistered ? formatDate(safeCarDetails.firstRegistered as string) : null} />
                            </div>
                        </div>
                    </section>
                    <section className="mt-4">
                         <h2 className="font-bold border-b-2 border-black pb-1 mb-1 text-base tracking-wider text-right text-black">AMOUNT</h2>
                         <div className="flex justify-end">
                             <div className="w-1/2 space-y-1 text-sm">
                                 <div className="flex justify-between py-1 border-b border-black text-black">
                                     <span className="text-black">Subtotal</span>
                                     <span className="font-semibold text-black">{formatCurrency(doc.subtotal)}</span>
                                 </div>
                                 {doc.payments && doc.payments.map((p, i) => (
                                      <div key={i} className="flex justify-between py-1 text-black">
                                        <span className="text-black">{p.method} Paid</span>
                                        <span className="text-black">({formatCurrency(p.amount)})</span>
                                    </div>
                                 ))}
                                 {doc.pxValue > 0 && (
                                      <div className="flex justify-between py-1 text-black">
                                        <span className="text-black">Part Exchange</span>
                                        <span className="text-black">({formatCurrency(doc.pxValue)})</span>
                                    </div>
                                 )}
                                 <div className="flex justify-between items-center py-2 border-t-2 border-black mt-2 bg-gray-100 p-2 rounded-md">
                                    <span className="font-bold text-lg text-black">Balance Due</span>
                                    <span className="font-bold text-lg text-black">{formatCurrency(doc.balance)}</span>
                                </div>
                             </div>
                         </div>
                    </section>
                     {doc.pxValue > 0 && doc.partExchangeDetails && (
                         <section className="mt-4">
                             <h2 className="font-bold border-b border-black pb-1 mb-2 text-base tracking-wider text-black">Part Exchange Details</h2>
                             <div className="grid grid-cols-2 gap-x-12 p-2">
                                <div>
                                    <VehicleDetailGridItem label="Registration" value={safePxDetails.reg} />
                                    <VehicleDetailGridItem label="Model" value={safePxDetails.model} />
                                </div>
                                <div>
                                     <VehicleDetailGridItem label="Make" value={safePxDetails.make} />
                                     <VehicleDetailGridItem label="Mileage" value={safePxDetails.mileage ? `${(safePxDetails.mileage as number).toLocaleString()}` : null} />
                                </div>
                             </div>
                         </section>
                    )}
                    <section className="mt-4">
                         <h2 className="font-bold border-b border-black pb-1 mb-1 text-base tracking-wider text-black">Additional Notes/Comments</h2>
                         <p className="text-sm text-black mt-1 whitespace-pre-line">{doc.additionalNotes || 'None'}</p>
                    </section>
                     {businessDetails?.bankDetails && (
                         <section className="mt-4">
                             <h2 className="font-bold border-b border-black pb-1 mb-1 text-base tracking-wider text-black">Payment Details</h2>
                             <p className="text-sm text-black mt-1 whitespace-pre-line">{businessDetails.bankDetails}</p>
                        </section>
                    )}
                    {/* Spacer pushes footer to bottom of the A4 page */}
                    <div className="flex-1" />
                    <footer className="mt-auto text-black">
                         {businessDetails?.invoiceTerms && <p className="text-xs text-black whitespace-pre-line">{businessDetails.invoiceTerms}</p>}
                        <div className="flex justify-between mt-8 text-black">
                            <div className="w-2/5 border-t border-black pt-1">Customer Signature</div>
                            <div className="w-1/5 border-t border-black pt-1">Date</div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-black text-center text-black text-[9px]">
                            <p>
                                {businessDetails?.companyNumber && `Company No: ${businessDetails.companyNumber}`}
                                {businessDetails?.companyNumber && isVatRegistered && businessDetails?.vatNumber && ' | '}
                                {isVatRegistered && businessDetails?.vatNumber && `VAT No: ${businessDetails.vatNumber}`}
                            </p>
                            <p className="mt-0.5">{businessDetails?.address?.replace(/\n/g, ', ')}</p>
                            <p className="mt-0.5">
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

export default PrintableView;