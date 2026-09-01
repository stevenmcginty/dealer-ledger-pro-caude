import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle, NewSalesDocument, FinanceCompany, DocumentType, SalesDocument, SalesDocumentUpdate, Payment, BusinessDetails, PartExchangeVehicle } from '../../types';
import { addFinanceCompany } from '../../services/dataService';
import { XMarkIcon, PlusIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import UkDateInput from '../common/UkDateInput';
import { formatCurrency } from '../../utils/helpers';
import PrintableView from './PrintableView';
import { useData } from '../../hooks/useData';

interface DocumentCreatorProps {
    companyId: string;
    vehicle: Vehicle;
    documentType: DocumentType;
    priorDeposit: SalesDocument | null;
    editingDocument?: SalesDocument | null;
    prefillData?: Partial<NewSalesDocument>;
    onSubmit: (data: NewSalesDocument | SalesDocumentUpdate, id?: string) => Promise<void>;
    onCancel: () => void;
    financeCompanies: FinanceCompany[];
    businessDetails: BusinessDetails | null;
}

// While editing, amounts are held as raw strings so part-typed values ("12", "12.5")
// survive re-renders instead of being round-tripped through parseFloat.
type PaymentDraft = Omit<Payment, 'amount'> & { amount: string };

const toDraft = (p: Payment): PaymentDraft => ({ ...p, amount: p.amount ? String(p.amount) : '' });
const toPayment = (p: PaymentDraft): Payment => ({ ...p, amount: parseFloat(p.amount) || 0 });

const DocumentCreator = ({ companyId, vehicle, documentType, priorDeposit, editingDocument, prefillData, onSubmit, onCancel, financeCompanies, businessDetails }: DocumentCreatorProps) => {
    const { isVatRegistered, customers } = useData();
    // These states now always refer to the END customer
    const [customerName, setCustomerName] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerId, setCustomerId] = useState<string | undefined>(undefined);

    const [useDeliveryAddress, setUseDeliveryAddress] = useState(false);
    // These states are for a non-finance separate delivery address
    const [deliveryName, setDeliveryName] = useState('');
    const [deliveryAddress, setDeliveryAddress] = useState('');
    
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
    const [priceStr, setPriceStr] = useState('');
    const [deliveryChargeStr, setDeliveryChargeStr] = useState('');
    const [surchargeStr, setSurchargeStr] = useState('');
    const [payments, setPayments] = useState<PaymentDraft[]>([]);
    
    const [hasPartExchange, setHasPartExchange] = useState(false);
    const [pxValueStr, setPxValueStr] = useState('');
    const [partExchangeDetails, setPartExchangeDetails] = useState<Partial<PartExchangeVehicle>>({ reg: '', make: '', model: '' });


    const [additionalNotes, setAdditionalNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionError, setSubmissionError] = useState<string | null>(null);

    const [isAddingFinCo, setIsAddingFinCo] = useState(false);
    const [newFinCoName, setNewFinCoName] = useState('');
    const [newFinCoAddress, setNewFinCoAddress] = useState('');
    const [selectedFinCo, setSelectedFinCo] = useState('');

    const [previewData, setPreviewData] = useState<NewSalesDocument | SalesDocumentUpdate | null>(null);

    const isEditing = !!editingDocument;
    
    const financeCompany = useMemo(() => financeCompanies.find(fc => fc.id === selectedFinCo), [selectedFinCo, financeCompanies]);

    // The form is only ever populated once per document. Parents rebuild the `vehicle`
    // prop on every render, so without this guard any re-render of the app (a window
    // resize, the mobile keyboard opening, a Firebase snapshot) would wipe unsaved edits.
    const populatedForRef = useRef<string | null>(null);

    useEffect(() => {
        const populationKey = [
            editingDocument?.id ?? 'new',
            priorDeposit?.id ?? 'none',
            vehicle.id,
            documentType,
        ].join('|');
        if (populatedForRef.current === populationKey) return;
        populatedForRef.current = populationKey;

        // For editing an existing document
        if (isEditing && editingDocument) {
            // Check if it was a finance deal by seeing if a known finance company name matches the customerName
            const wasFinanceDeal = financeCompanies.some(fc => fc.name === editingDocument.customerName);
            if(wasFinanceDeal) {
                // It's a finance deal, so 'deliveryName' is the end customer
                setCustomerName(editingDocument.deliveryName || '');
                setCustomerAddress(editingDocument.deliveryAddress || '');
                const finCo = financeCompanies.find(fc => fc.name === editingDocument.customerName);
                if (finCo) setSelectedFinCo(finCo.id);
            } else {
                // Normal deal
                setCustomerName(editingDocument.customerName || '');
                setCustomerAddress(editingDocument.customerAddress || '');
                setUseDeliveryAddress(!!editingDocument.deliveryName || !!editingDocument.deliveryAddress);
                setDeliveryName(editingDocument.deliveryName || '');
                setDeliveryAddress(editingDocument.deliveryAddress || '');
            }

            setInvoiceDate(editingDocument.invoiceDate || new Date().toISOString().split('T')[0]);
            setCustomerEmail(editingDocument.customerEmail || '');
            setCustomerPhone(editingDocument.customerPhone || '');
            setCustomerId(editingDocument.customerId || undefined);
            setPriceStr(String(editingDocument.price || ''));
            setDeliveryChargeStr(String(editingDocument.deliveryCharge || ''));
            setSurchargeStr(String(editingDocument.surcharge || ''));
            const existingPayments: Payment[] = editingDocument.payments || (editingDocument.deposit ? [{ method: 'Deposit', amount: editingDocument.deposit }] : []);
            setPayments(existingPayments.map(toDraft));
            setAdditionalNotes(editingDocument.additionalNotes || '');
            const pxExists = editingDocument.pxValue && editingDocument.pxValue > 0;
            setHasPartExchange(!!pxExists);
            setPxValueStr(pxExists ? String(editingDocument.pxValue) : '');
            setPartExchangeDetails(editingDocument.partExchangeDetails || { reg: '', make: '', model: '' });
            return;
        }

        // For creating a new document
        let initialPrice = '0';
        let initialPayments: PaymentDraft[] = [];
        let initialCustomerName = '';
        let initialCustomerAddress = '';
        let initialCustomerEmail = '';
        let initialCustomerPhone = '';
        let initialCustomerId: string | undefined = undefined;
        let initialAdditionalNotes = '';
        let initialHasPx = false;
        let initialPxValue = '';
        let initialPxDetails: Partial<PartExchangeVehicle> = { reg: '', make: '', model: '' };

        if (priorDeposit && (documentType === 'Sales Invoice' || documentType === 'Proforma Invoice')) {
            initialCustomerName = priorDeposit.customerName;
            initialCustomerAddress = priorDeposit.customerAddress;
            initialCustomerEmail = priorDeposit.customerEmail || '';
            initialCustomerPhone = priorDeposit.customerPhone || '';
            initialCustomerId = priorDeposit.customerId;
            initialAdditionalNotes = priorDeposit.additionalNotes || '';
            initialPrice = String(priorDeposit.price || '0');
            
            initialHasPx = !!priorDeposit.pxValue && priorDeposit.pxValue > 0;
            initialPxValue = initialHasPx ? String(priorDeposit.pxValue) : '';
            initialPxDetails = priorDeposit.partExchangeDetails || { reg: '', make: '', model: '' };

            const totalDepositPaid = priorDeposit.payments?.reduce((sum, p) => sum + p.amount, 0) || priorDeposit.deposit || 0;
            if (totalDepositPaid > 0) {
                initialPayments.push({ method: 'Deposit', amount: String(totalDepositPaid), notes: `From Deposit Slip #${priorDeposit.invoiceNumber}` });
            }
        }
        
        setCustomerName(initialCustomerName);
        setCustomerAddress(initialCustomerAddress);
        setCustomerEmail(initialCustomerEmail);
        setCustomerPhone(initialCustomerPhone);
        setCustomerId(initialCustomerId);
        setUseDeliveryAddress(documentType === 'Proforma Invoice');
        setDeliveryName('');
        setDeliveryAddress('');
        setInvoiceDate(new Date().toISOString().split('T')[0]);
        setPriceStr(initialPrice);
        setDeliveryChargeStr('');
        setSurchargeStr('');
        setPayments(initialPayments);
        setAdditionalNotes(initialAdditionalNotes);
        setHasPartExchange(initialHasPx);
        setPxValueStr(initialPxValue);
        setPartExchangeDetails(initialPxDetails);

    }, [editingDocument, priorDeposit, vehicle, documentType, isEditing, financeCompanies]);

     useEffect(() => {
        // This effect reacts to updates from the Gemini assistant, allowing it to overwrite data
        if (prefillData) {
            if (prefillData.customerName !== undefined) setCustomerName(prefillData.customerName);
            if (prefillData.customerAddress !== undefined) setCustomerAddress(prefillData.customerAddress);
            if (prefillData.price !== undefined) setPriceStr(String(prefillData.price));
            if (prefillData.payments !== undefined) setPayments(prefillData.payments.map(toDraft));
        }
    }, [prefillData]);

    // Autocomplete: when the typed name matches an existing Customer, pull their
    // contact details in so the invoice can be emailed / WhatsApped after saving.
    useEffect(() => {
        if (financeCompany) return;
        // Until the customer list has loaded there is nothing to match against, and
        // a document being edited already carries the right id — leave it alone.
        if (!customers.length) return;

        const name = customerName.trim().toLowerCase();
        const match = name ? customers.find(c => c.name.trim().toLowerCase() === name) : undefined;
        if (match?.id === customerId) return;

        // The name now belongs to somebody else, or to nobody. Drop the old link
        // either way: the send bar saves a typed email onto whoever this id names,
        // so a stale id writes the new customer's address onto the previous one.
        setCustomerId(match?.id);
        if (!match) return;
        if (!customerEmail.trim() && match.email) setCustomerEmail(match.email);
        if (!customerPhone.trim() && match.phone) setCustomerPhone(match.phone);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customerName, customers]);

    const price = parseFloat(priceStr) || 0;
    const deliveryCharge = parseFloat(deliveryChargeStr) || 0;
    const surcharge = parseFloat(surchargeStr) || 0;
    const pxValue = hasPartExchange ? (parseFloat(pxValueStr) || 0) : 0;
    const numericPayments = useMemo(() => payments.map(toPayment), [payments]);
    const totalPayments = numericPayments.reduce((sum, p) => sum + p.amount, 0);
    
    const isSor = vehicle.ownershipType === 'Sale or Return';
    const commission = isSor ? price - vehicle.purchasePrice : 0;
    const margin = price - vehicle.purchasePrice;

    const isVatAddedOnTop = vehicle.vatScheme === 'Qualifying' || vehicle.vatScheme === 'Commercial';

    let vat = 0;
    if (isVatRegistered && documentType !== 'Deposit Slip') {
        if (isSor) {
            vat = commission > 0 ? commission / 6 : 0;
        } else if (vehicle.vatScheme === 'Margin') {
            vat = margin > 0 ? margin / 6 : 0;
        } else if (isVatAddedOnTop) {
            vat = price * 0.20;
        }
    }

    const subtotal = (isVatAddedOnTop ? price + vat : price) + deliveryCharge + surcharge;
    const balance = subtotal - totalPayments - pxValue;
    
    useEffect(() => {
        if (selectedFinCo) {
            setUseDeliveryAddress(true);
        }
    }, [selectedFinCo]);
    
    useEffect(() => {
        if (!hasPartExchange) {
            setPxValueStr('');
        }
    }, [hasPartExchange]);


    const handleAddFinanceCompany = async () => {
        if(newFinCoName.trim() && newFinCoAddress.trim()) {
            await addFinanceCompany(companyId, {name: newFinCoName, address: newFinCoAddress});
            setNewFinCoName('');
            setNewFinCoAddress('');
            setIsAddingFinCo(false);
        }
    }

    const handlePaymentChange = (index: number, field: keyof PaymentDraft, value: any) => {
        setPayments(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
    };

    const addPayment = () => {
        setPayments(prev => [...prev, { method: 'Bank Transfer', amount: '' }]);
    };

    const removePayment = (index: number) => {
        setPayments(prev => prev.filter((_, i) => i !== index));
    };

    const handleGeneratePreview = (e: React.FormEvent) => {
        e.preventDefault();
        
        const { id, createdAt, status, ...carDetails } = vehicle;

        let docCustomerName, docCustomerAddress, docDeliveryName, docDeliveryAddress;

        if (financeCompany) {
            docCustomerName = financeCompany.name;
            docCustomerAddress = financeCompany.address;
            docDeliveryName = customerName;
            docDeliveryAddress = customerAddress;
        } else {
            docCustomerName = customerName;
            docCustomerAddress = customerAddress;
            if (useDeliveryAddress) {
                docDeliveryName = deliveryName;
                docDeliveryAddress = deliveryAddress;
            }
        }
        
        const baseData: Partial<NewSalesDocument> = {
            invoiceDate,
            customerName: docCustomerName, customerAddress: docCustomerAddress, price, deliveryCharge, surcharge, vat, subtotal, payments: numericPayments,
            balance, deliveryName: docDeliveryName, deliveryAddress: docDeliveryAddress, additionalNotes,
            customerId,
            customerEmail: customerEmail.trim() || undefined,
            customerPhone: customerPhone.trim() || undefined,
            pxValue: hasPartExchange ? pxValue : 0,
            partExchangeDetails: (hasPartExchange && partExchangeDetails.reg) ? (partExchangeDetails as PartExchangeVehicle) : undefined,
            commission: isSor ? commission : undefined,
        };

        const cleanData = Object.entries(baseData).reduce((acc, [key, value]) => {
            if (value !== undefined && value !== null && value !== '' && !(typeof value === 'number' && isNaN(value))) {
                acc[key] = value;
            }
            return acc;
        }, {} as any);
        
        if (isEditing) {
            setPreviewData(cleanData);
        } else {
             const invoiceNumber = String(Math.floor(10000 + Math.random() * 90000));
             const newDocData: NewSalesDocument = {
                ...cleanData,
                invoiceNumber,
                stockNumber: vehicle.stockNumber,
                vehicleId: vehicle.id,
                vatScheme: vehicle.vatScheme || 'Margin',
                documentType,
                carDetails,
             };
             setPreviewData(newDocData);
        }
    };

    const handleConfirmSave = async () => {
        if (!previewData) return;
        setIsSubmitting(true);
        setSubmissionError(null);
        try {
            await onSubmit(previewData, editingDocument?.id);
        } catch (error: any) {
            console.error("Submission failed:", error);
            setSubmissionError(error.message || "Failed to save document. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (previewData) {
        // When editing, the preview data only carries the fields this form owns.
        // Layer it over the saved document so untouched fields — invoice number,
        // stock number, car details — still show, exactly as the patched save leaves them.
        const docForPreview: SalesDocument = {
            ...(isEditing ? editingDocument : { invoiceNumber: '', stockNumber: '', vehicleId: '', vatScheme: 'Margin', documentType }),
            ...previewData,
            id: editingDocument?.id || 'temp-id',
            createdAt: editingDocument?.createdAt || Date.now()
        } as SalesDocument;
        return (
            <div className="w-full flex flex-col h-full">
                {submissionError && (
                    <div className="flex-shrink-0 m-4 mb-0 p-3 rounded-md bg-red-900/50 border border-red-700 text-sm text-red-200">{submissionError}</div>
                )}
                <PrintableView
                    document={docForPreview}
                    businessDetails={businessDetails}
                    onClose={onCancel}
                    isPreview={true}
                    onBack={() => { setSubmissionError(null); setPreviewData(null); }}
                    onConfirm={handleConfirmSave}
                    isSubmitting={isSubmitting}
                />
            </div>
        );
    }
    
    const docTitles: Record<DocumentType, string> = {
        'Sales Invoice': 'Sales Invoice',
        'Proforma Invoice': 'Proforma Invoice',
        'Deposit Slip': 'Deposit Slip',
        'Purchase Invoice': 'Purchase Invoice'
    };
    const title = isEditing ? `Edit ${editingDocument?.documentType}` : `Create ${docTitles[documentType]}`;
    
    return (
        <div className="w-full flex flex-col h-full">
             <header className="p-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-white">{title}</h2>
                    <p className="text-sm text-gray-400">{vehicle.reg} - {vehicle.make} {vehicle.model}</p>
                </div>
                <button onClick={onCancel} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <form id="doc-creator-form" onSubmit={handleGeneratePreview} className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div>
                    <label htmlFor="customerName" className="block text-sm font-medium text-gray-300">{financeCompany ? 'Invoice To (Finance Co.)' : 'Customer Name'}</label>
                    <input type="text" id="customerName" value={financeCompany ? financeCompany.name : customerName} onChange={e => !financeCompany && setCustomerName(e.target.value)} readOnly={!!financeCompany} required className={`mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white ${!!financeCompany && 'bg-gray-900 text-gray-400'}`} />
                </div>
                <div>
                    <label htmlFor="customerAddress" className="block text-sm font-medium text-gray-300">{financeCompany ? 'Finance Co. Address' : 'Customer Address'}</label>
                    <textarea id="customerAddress" value={financeCompany ? financeCompany.address : customerAddress} onChange={e => !financeCompany && setCustomerAddress(e.target.value)} readOnly={!!financeCompany} required rows={3} className={`mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white ${!!financeCompany && 'bg-gray-900 text-gray-400'}`} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="customerEmail" className="block text-sm font-medium text-gray-300">Customer Email <span className="text-gray-500">(to send the {docTitles[documentType].toLowerCase()})</span></label>
                        <input type="email" id="customerEmail" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="name@example.com" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                    </div>
                    <div>
                        <label htmlFor="customerPhone" className="block text-sm font-medium text-gray-300">Customer Mobile <span className="text-gray-500">(to WhatsApp the {docTitles[documentType].toLowerCase()})</span></label>
                        <input type="tel" id="customerPhone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="07123 456789" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                    </div>
                </div>
                <div className="relative flex items-start">
                    <div className="flex h-6 items-center"><input id="useDeliveryAddress" type="checkbox" checked={useDeliveryAddress} onChange={e => setUseDeliveryAddress(e.target.checked)} disabled={!!financeCompany} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600 disabled:opacity-70" /></div>
                    <div className="ml-3 text-sm"><label htmlFor="useDeliveryAddress" className="font-medium text-gray-300">Use separate delivery/finance company address</label></div>
                </div>

                {useDeliveryAddress && (
                    <div className="p-4 border border-gray-700 rounded-lg space-y-4">
                        <div className="flex items-center gap-4">
                             <select value={selectedFinCo} onChange={e => setSelectedFinCo(e.target.value)} className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white">
                                <option value="">-- Select Finance Company --</option>
                                {financeCompanies.map(fc => <option key={fc.id} value={fc.id}>{fc.name}</option>)}
                            </select>
                            <button type="button" onClick={() => setIsAddingFinCo(!isAddingFinCo)} className="p-2 text-sm font-semibold text-brand-400 hover:text-brand-300 whitespace-nowrap">{isAddingFinCo ? 'Cancel' : 'Add New'}</button>
                        </div>
                        {isAddingFinCo && (
                            <div className="space-y-2 p-2 bg-gray-900/50 rounded-md">
                                <input type="text" placeholder="Company Name" value={newFinCoName} onChange={e => setNewFinCoName(e.target.value)} required className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                                <textarea placeholder="Company Address" value={newFinCoAddress} onChange={e => setNewFinCoAddress(e.target.value)} required rows={2} className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                                <button type="button" onClick={handleAddFinanceCompany} className="w-full px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md">Save Company</button>
                            </div>
                        )}
                        <div>
                            <label htmlFor="deliveryName" className="block text-sm font-medium text-gray-300">{financeCompany ? 'Deliver To (Customer Name)' : 'Delivery Name'}</label>
                            <input type="text" id="deliveryName" value={financeCompany ? customerName : deliveryName} onChange={e => financeCompany ? setCustomerName(e.target.value) : setDeliveryName(e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                        </div>
                        <div>
                            <label htmlFor="deliveryAddress" className="block text-sm font-medium text-gray-300">{financeCompany ? 'Delivery Address (Customer)' : 'Delivery Address'}</label>
                            <textarea id="deliveryAddress" value={financeCompany ? customerAddress : deliveryAddress} onChange={e => financeCompany ? setCustomerAddress(e.target.value) : setDeliveryAddress(e.target.value)} rows={3} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" />
                        </div>
                    </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div><label htmlFor="invoiceDate" className="block text-sm font-medium text-gray-300">Date</label><UkDateInput id="invoiceDate" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="mt-1" required/></div>
                    <div><label htmlFor="price" className="block text-sm font-medium text-gray-300">Vehicle Price</label><CurrencyInput id="price" value={priceStr} onChange={e => setPriceStr(e.target.value)} required /></div>
                    <div><label htmlFor="deliveryCharge" className="block text-sm font-medium text-gray-300">Delivery Charge</label><CurrencyInput id="deliveryCharge" value={deliveryChargeStr} onChange={e => setDeliveryChargeStr(e.target.value)} /></div>
                    <div><label htmlFor="surcharge" className="block text-sm font-medium text-gray-300">Surcharge</label><CurrencyInput id="surcharge" value={surchargeStr} onChange={e => setSurchargeStr(e.target.value)} /></div>
                </div>

                <div className="relative flex items-start">
                    <div className="flex h-6 items-center"><input id="hasPartExchange" type="checkbox" checked={hasPartExchange} onChange={e => setHasPartExchange(e.target.checked)} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600" /></div>
                    <div className="ml-3 text-sm"><label htmlFor="hasPartExchange" className="font-medium text-gray-300">Part Exchange</label></div>
                </div>
                {hasPartExchange && (
                    <div className="p-4 border border-gray-700 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2"><label htmlFor="pxValue" className="block text-sm font-medium text-gray-300">Part Exchange Value</label><CurrencyInput id="pxValue" value={pxValueStr} onChange={e => setPxValueStr(e.target.value)} required /></div>
                        <div><label htmlFor="pxReg" className="block text-sm font-medium text-gray-300">Registration</label><input type="text" id="pxReg" value={partExchangeDetails.reg || ''} onChange={e => setPartExchangeDetails(p => ({...p, reg: e.target.value.toUpperCase()}))} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white uppercase" /></div>
                        <div><label htmlFor="pxMake" className="block text-sm font-medium text-gray-300">Make</label><input type="text" id="pxMake" value={partExchangeDetails.make || ''} onChange={e => setPartExchangeDetails(p => ({...p, make: e.target.value}))} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                        <div><label htmlFor="pxModel" className="block text-sm font-medium text-gray-300">Model</label><input type="text" id="pxModel" value={partExchangeDetails.model || ''} onChange={e => setPartExchangeDetails(p => ({...p, model: e.target.value}))} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                        <div><label htmlFor="pxMileage" className="block text-sm font-medium text-gray-300">Mileage</label><input type="number" id="pxMileage" value={partExchangeDetails.mileage || ''} onChange={e => setPartExchangeDetails(p => ({...p, mileage: parseInt(e.target.value)}))} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                    </div>
                )}

                <div>
                    <h3 className="text-base font-semibold text-white">Payments</h3>
                    {payments.map((p, i) => (
                         <div key={i} className="flex items-end gap-2 mt-2">
                             <div className="flex-1"><label className="sr-only">Method</label><select value={p.method} onChange={e => handlePaymentChange(i, 'method', e.target.value)} className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"><option>Bank Transfer</option><option>Card</option><option>Cash</option><option>Finance</option><option>Deposit</option><option>Other</option></select></div>
                             <div className="w-36"><label className="sr-only">Amount</label><CurrencyInput id={`payment-amount-${i}`} value={p.amount} onChange={e => handlePaymentChange(i, 'amount', e.target.value)} /></div>
                             <button type="button" onClick={() => removePayment(i)} className="p-2 text-gray-400 hover:text-red-400"><TrashIcon className="h-5 w-5"/></button>
                         </div>
                    ))}
                    <button type="button" onClick={addPayment} className="mt-2 w-full text-sm font-semibold text-brand-400 hover:text-brand-300 flex items-center justify-center gap-2 p-2 border-2 border-dashed border-gray-600 rounded-lg hover:border-gray-500"><PlusIcon className="h-4 w-4"/> Add Payment</button>
                </div>

                <div>
                    <label htmlFor="additionalNotes" className="block text-sm font-medium text-gray-300">Additional Notes</label>
                    <textarea id="additionalNotes" value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} rows={3} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" placeholder={documentType === 'Deposit Slip' ? 'Enter any prep work to be done here...' : ''} />
                </div>

                 <div className="pt-4 border-t border-gray-700 space-y-2">
                    <div className="flex justify-between items-center text-sm"><span className="text-gray-400">Subtotal</span><span className="font-medium text-white">{formatCurrency(subtotal)}</span></div>
                    <div className="flex justify-between items-center text-sm"><span className="text-gray-400">Total Payments</span><span className="font-medium text-white">({formatCurrency(totalPayments)})</span></div>
                    {hasPartExchange && <div className="flex justify-between items-center text-sm"><span className="text-gray-400">Part Exchange</span><span className="font-medium text-white">({formatCurrency(pxValue)})</span></div>}
                    <div className="flex justify-between items-center text-lg font-bold"><span className="text-white">Balance Due</span><span className="text-white">{formatCurrency(balance)}</span></div>
                </div>

            </form>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end space-x-3 items-center bg-gray-800">
                <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 hover:bg-gray-500 rounded-md">Cancel</button>
                <button type="submit" form="doc-creator-form" disabled={isSubmitting} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : 'Generate Preview'}
                </button>
            </footer>
        </div>
    );
};

export default DocumentCreator;