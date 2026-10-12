import React, { useMemo, useState } from 'react';
import { SalesDocument, BusinessDetails, Vehicle, PartExchangeVehicle } from '../../types';
import { XMarkIcon, PrinterIcon, ArrowDownTrayIcon } from '../icons';
import { formatDate, formatCurrency } from '../../utils/helpers';
import { downloadPrintablePdf } from './printablePdf';
import { showsTermsPage, includesTermsPage, cancellationFormGoods, cancellationFormRecipient, oneLine } from '../../utils/salesTermsPage';
import SendDocumentPanel from './SendDocumentPanel';
import { useData } from '../../hooks/useData';
import { Button, Checkbox, DocChip, IconButton, useToast } from '../ui';
import { DOC_KIND, DOC_NAME } from './docMeta';

interface PrintableViewProps {
    document: SalesDocument;
    businessDetails: BusinessDetails | null;
    onClose: () => void;
    isPreview?: boolean;
    onConfirm?: () => void;
    onBack?: () => void;
    isSubmitting?: boolean;
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


const PrintableView: React.FC<PrintableViewProps> = ({ document: doc, businessDetails, onClose, isPreview, onConfirm, onBack, isSubmitting = false }) => {
    const { isVatRegistered } = useData();
    const toast = useToast();
    
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
        try {
            await downloadPrintablePdf(`${doc.documentType.replace(/\s/g, '-')}-${doc.invoiceNumber}.pdf`);
        } catch (error) {
            console.error("Error generating PDF:", error);
            toast.error("Could not generate the PDF. Please try again.");
        }
    };

    // Sending is for saved documents — the preview before saving has no id to
    // attach the contact to yet.
    const canSendToCustomer = !isPreview && !!doc.id && doc.id !== 'temp-id';

    // A purchase invoice is the car we bought: the other party is the seller, and our
    // bank details and sales warranty terms don't belong on it.
    const isPurchase = doc.documentType === 'Purchase Invoice';

    // Page 2 (terms + cancellation form) is offered when the company has set it up,
    // and added only when the desk ticks it for this view. Off every time the view opens.
    const [addTermsPage, setAddTermsPage] = useState(false);
    const termsPageAvailable = !isPreview && showsTermsPage(doc.documentType, businessDetails);
    const showTermsPage = includesTermsPage(doc.documentType, businessDetails, { ticked: addTermsPage, isPreview });

     const docTitles = { 
        'Sales Invoice': "INVOICE", 
        'Proforma Invoice': "PROFORMA INVOICE", 
        'Deposit Slip': "DEPOSIT SLIP",
        'Purchase Invoice': "PURCHASE INVOICE"
    };

    // Company details line at the foot of every page.
    const companyDetails = (
        <div className="pt-1.5 border-t border-black text-center text-black text-[8px]">
            <p>
                {businessDetails?.companyNumber && `Company No: ${businessDetails.companyNumber}`}
                {businessDetails?.companyNumber && isVatRegistered && businessDetails?.vatNumber && ' | '}
                {isVatRegistered && businessDetails?.vatNumber && `VAT No: ${businessDetails.vatNumber}`}
            </p>
            <p>{businessDetails?.address?.replace(/\n/g, ', ')}</p>
            <p>
                {businessDetails?.phone && `Tel: ${businessDetails.phone}`}
                {businessDetails?.phone && businessDetails?.email && ' | '}
                {businessDetails?.email && `Email: ${businessDetails.email}`}
            </p>
        </div>
    );

    // A label, then a ruled line to write on (pre-filled when the doc already knows the answer).
    const formLine = (label: string, value = '') => (
        <div className="flex items-end gap-2 mt-2">
            <span className="whitespace-nowrap">{label}</span>
            {/* Bottom padding keeps the text clear of the rule — html2canvas draws text lower than the browser does. */}
            <span className="flex-1 border-b border-black leading-normal" style={{ minHeight: '14px', paddingBottom: '4px' }}>{value}</span>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface-3 print:bg-white">
            {/* Viewer chrome (screen only). Phones: title + close, then the terms
                tick box with download and print. Wider: one bar. */}
            <header className="flex flex-none flex-wrap items-center gap-x-1 border-b border-line bg-surface px-2 py-1 text-ink sm:flex-nowrap sm:px-3 print:hidden">
                <div className="order-1 flex min-w-0 flex-1 items-center gap-2.5 ps-2">
                    <DocChip kind={DOC_KIND[doc.documentType]} label={null} />
                    <h3 className="min-w-0 truncate text-base font-bold leading-tight">
                        {isPreview
                            ? <>Preview <span className="font-normal text-ink-3">· not saved yet</span></>
                            : <>{DOC_NAME[doc.documentType]} <span className="num">#{doc.invoiceNumber}</span></>}
                    </h3>
                </div>
                {(termsPageAvailable || !isPreview) && (
                    <div className="order-3 flex basis-full items-center justify-between gap-1 border-t border-line ps-2 sm:order-2 sm:basis-auto sm:justify-end sm:border-t-0 sm:ps-0">
                        {termsPageAvailable ? (
                            <Checkbox
                                checked={addTermsPage}
                                onChange={e => setAddTermsPage(e.target.checked)}
                                label="Add terms page"
                                title="Add the terms and cancellation page as page 2"
                                className="me-2 text-sm font-semibold text-ink-2"
                            />
                        ) : <span />}
                        {!isPreview && (
                            <span className="flex items-center">
                                <IconButton label="Download PDF" icon={<ArrowDownTrayIcon />} onClick={handleDownloadPdf} />
                                <IconButton label="Print" icon={<PrinterIcon />} onClick={() => window.print()} />
                            </span>
                        )}
                    </div>
                )}
                <IconButton label="Close" icon={<XMarkIcon />} onClick={onClose} className="order-2 sm:order-3" />
            </header>

            {canSendToCustomer && <SendDocumentPanel doc={doc} />}

            <main className="flex-1 overflow-y-auto bg-surface-3 p-4 sm:p-8">
                <div id="printable-content" className="bg-white w-full max-w-4xl mx-auto text-black font-paper text-sm print:shadow-none print:p-0 relative" style={{ padding: '6mm 10mm 70mm 10mm', minHeight: '277mm', maxHeight: '277mm', overflow: 'hidden' }}>
                    <header className="flex justify-between items-start pb-2">
                        <div className="text-black">
                            <h1 className="text-2xl font-bold uppercase text-black">{docTitles[doc.documentType]} #{doc.invoiceNumber}</h1>
                        </div>
                         <div className="text-right">
                             <h2 className="text-lg font-bold text-black">{businessDetails?.name}</h2>
                             <p className="whitespace-pre-line text-black text-sm leading-snug">{businessDetails?.address}</p>
                             <p className="text-black text-sm mt-1">{businessDetails?.phone}</p>
                        </div>
                    </header>
                    <section className="grid grid-cols-2 gap-6 mb-3">
                        <div className="border border-black p-2 text-black">
                            <h3 className="font-bold text-black uppercase tracking-wider text-xs mb-1">{isPurchase ? 'Purchased From:' : 'Invoice To:'}</h3>
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
                                 <div className="flex justify-between items-center py-1 border-t-2 border-black mt-1 bg-gray-100 px-2 rounded-md">
                                    <span className="font-bold text-base text-black">Balance Due</span>
                                    <span className="font-bold text-base text-black">{formatCurrency(doc.balance)}</span>
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
                    <section className="mt-3">
                         <h2 className="font-bold border-b border-black pb-0.5 mb-1 text-xs tracking-wider text-black">Additional Notes/Comments</h2>
                         <p className="text-xs text-black whitespace-pre-line">{doc.additionalNotes || 'None'}</p>
                    </section>
                    <footer className="absolute bottom-0 left-0 right-0 text-black" style={{ padding: '0 10mm 8mm 10mm' }}>
                        {/* Payment Details (left) + Signature/Date (right) */}
                        <div className="flex justify-between items-start border-t border-black pt-2 mb-2">
                            <div className="w-1/2 pr-4">
                                {!isPurchase && businessDetails?.bankDetails && (
                                    <>
                                        <h2 className="font-bold text-[10px] mb-0.5 text-black">Payment Details</h2>
                                        <p className="text-[9px] text-black whitespace-pre-line leading-tight">{businessDetails.bankDetails}</p>
                                    </>
                                )}
                            </div>
                            <div className="w-2/5">
                                <div className="mb-6">
                                    <div className="border-b border-black" style={{ height: '20px' }}></div>
                                    <p className="text-[9px] text-black mt-0.5">{isPurchase ? 'Seller Signature' : 'Customer Signature'}</p>
                                </div>
                                <div>
                                    <div className="border-b border-black" style={{ height: '20px' }}></div>
                                    <p className="text-[9px] text-black mt-0.5">Date</p>
                                </div>
                            </div>
                        </div>
                        {/* Warranty terms */}
                        {!isPurchase && businessDetails?.invoiceTerms && (
                            <p className="text-[7px] leading-tight text-black whitespace-pre-line mb-2">{businessDetails.invoiceTerms}</p>
                        )}
                        {/* Company details */}
                        {companyDetails}
                    </footer>
                </div>
                {showTermsPage && (
                    <div id="printable-terms" className="bg-white w-full max-w-4xl mx-auto mt-6 text-black font-paper text-sm print:shadow-none print:p-0 print:mt-0 print:break-before-page relative" style={{ padding: '6mm 10mm 30mm 10mm', minHeight: '277mm', maxHeight: '277mm', overflow: 'hidden' }}>
                        <header className="flex justify-between items-start border-b-2 border-black pb-1 mb-3">
                            <div className="text-black">
                                <h1 className="text-lg font-bold uppercase text-black">Terms and your right to cancel</h1>
                                <p className="text-[10px] text-black">{docTitles[doc.documentType]} #{doc.invoiceNumber}</p>
                            </div>
                            <h2 className="text-base font-bold text-right text-black">{businessDetails?.name}</h2>
                        </header>
                        {businessDetails?.termsPage?.trim() && (
                            <p className="text-[9px] leading-snug text-black whitespace-pre-line">{businessDetails.termsPage.trim()}</p>
                        )}
                        {businessDetails?.cancellationForm && (
                            <section className="mt-4 border border-black p-3 text-[9px] leading-snug text-black">
                                <h2 className="font-bold text-sm text-black">Cancellation form</h2>
                                <p className="italic">(Complete and return this form only if you wish to cancel the contract.)</p>
                                <p className="mt-2">To: {cancellationFormRecipient(businessDetails)}</p>
                                <p className="mt-2">I/We* hereby give notice that I/We* cancel my/our* contract of sale of the following goods: {cancellationFormGoods(doc)}</p>
                                {formLine('Ordered on* / received on*:')}
                                {formLine('Name of consumer(s):', doc.customerName || '')}
                                {formLine('Address of consumer(s):', oneLine(doc.customerAddress))}
                                {formLine('Signature of consumer(s) (only if this form is notified on paper):')}
                                {formLine('Date:')}
                                <p className="mt-2 text-[8px]">* Delete as appropriate</p>
                            </section>
                        )}
                        <footer className="absolute bottom-0 left-0 right-0 text-black" style={{ padding: '0 10mm 8mm 10mm' }}>
                            {companyDetails}
                        </footer>
                    </div>
                )}
            </main>
            
            {isPreview && onConfirm && onBack && (
                <footer className="flex flex-none items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3 print:hidden [&>*]:flex-1 sm:[&>*]:flex-none">
                    <Button type="button" variant="secondary" onClick={onBack} disabled={isSubmitting}>
                        Back to edit
                    </Button>
                    <Button type="button" onClick={onConfirm} loading={isSubmitting}>
                        Save {DOC_NAME[doc.documentType].toLowerCase()}
                    </Button>
                </footer>
            )}
        </div>
    );
};

export default PrintableView;