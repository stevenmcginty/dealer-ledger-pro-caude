import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Vehicle, NewSalesDocument, FinanceCompany, DocumentType, SalesDocument, SalesDocumentUpdate, Payment, BusinessDetails, PartExchangeVehicle } from '../../types';
import { addFinanceCompany } from '../../services/dataService';
import { PlusIcon, TrashIcon } from '../icons';
import { Button, Checkbox, DocChip, IconButton, Input, Plate } from '../ui';
import { controlFrame, controlInput, cx, eyebrow } from '../ui/cx';
import Select from '../common/Select';
import { SheetBody, SheetFooter, SheetFrame, SheetHeader } from '../crm/SheetParts';
import { DOC_KIND, DOC_NAME } from './docMeta';
import CurrencyInput from '../common/CurrencyInput';
import UkDateInput from '../common/UkDateInput';
import { formatCurrency } from '../../utils/helpers';
import PrintableView from './PrintableView';
import { useData } from '../../hooks/useData';
import { planCustomerContactSync, resolveContactCustomer } from '../../utils/customerContact';

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

const FieldLabel: React.FC<{ htmlFor: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold leading-5 text-ink">{children}</label>
);

const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, readOnly, ...props }) => (
    <div className={controlFrame({ disabled: readOnly })}>
        <textarea readOnly={readOnly} {...props} className={cx(controlInput, 'resize-y', readOnly && 'text-ink-3', className)} />
    </div>
);

const DocumentCreator = ({ companyId, vehicle, documentType, priorDeposit, editingDocument, prefillData, onSubmit, onCancel, financeCompanies, businessDetails }: DocumentCreatorProps) => {
    const { isVatRegistered, customers, addCustomer, updateCustomer } = useData();
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

        const match = resolveContactCustomer(customers, { customerName });
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

    /**
     * Put the typed email and mobile on the customer's own record.
     *
     * Until now they lived on the invoice and nowhere else, so the CRM, the next
     * invoice and the agent inbox never learned them. The END customer is the
     * one they belong to — on a finance invoice that is the person driving the
     * car away, not the finance house the invoice is addressed to, which is why
     * this reads the form state rather than the document payload.
     *
     * Never allowed to fail the save: the document is what Steve pressed the
     * button for.
     */
    const syncCustomerContact = async (): Promise<string | undefined> => {
        const plan = planCustomerContactSync(customers, {
            customerId,
            customerName,
            customerAddress,
            customerEmail,
            customerPhone,
        });
        try {
            if (plan.action === 'update') {
                await updateCustomer(plan.customerId, plan.updates);
                return plan.customerId;
            }
            if (plan.action === 'create') {
                return await addCustomer(plan.customer);
            }
        } catch (error) {
            console.warn('Could not save the customer contact details', error);
        }
        return customerId;
    };

    const handleConfirmSave = async () => {
        if (!previewData) return;
        setIsSubmitting(true);
        setSubmissionError(null);
        try {
            const syncedId = await syncCustomerContact();
            if (syncedId && syncedId !== customerId) setCustomerId(syncedId);
            await onSubmit(
                syncedId ? { ...previewData, customerId: syncedId } : previewData,
                editingDocument?.id
            );
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
                    <p role="alert" className="m-4 mb-0 flex-none rounded-control bg-danger-soft px-3.5 py-3 text-sm text-danger-ink">{submissionError}</p>
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
    const docName = DOC_NAME[documentType].toLowerCase();
    const title = isEditing ? `Edit ${docName}` : `New ${docName}`;
    const finance = !!financeCompany;

    return (
        <SheetFrame>
            <SheetHeader
                title={title}
                description={
                    <span className="flex min-w-0 items-center gap-2">
                        <DocChip kind={DOC_KIND[documentType]} label={null} />
                        {vehicle.reg && <Plate reg={vehicle.reg} size="sm" />}
                        <span className="truncate">{vehicle.make} {vehicle.model}</span>
                    </span>
                }
                onClose={onCancel}
            />
            <SheetBody className="pt-2">
            <form id="doc-creator-form" onSubmit={handleGeneratePreview} className="space-y-7">
                {/* ---- Buyer ---- */}
                <section className="space-y-4" aria-labelledby="dc-buyer">
                    <h3 id="dc-buyer" className={eyebrow}>Buyer</h3>
                    <Input
                        id="customerName"
                        label={finance ? 'Invoice to (finance company)' : 'Name'}
                        value={finance ? financeCompany!.name : customerName}
                        onChange={e => !finance && setCustomerName(e.target.value)}
                        readOnly={finance}
                        required
                        className={finance ? 'text-ink-3' : undefined}
                    />
                    <div>
                        <FieldLabel htmlFor="customerAddress">{finance ? 'Finance company address' : 'Address'}</FieldLabel>
                        <TextArea id="customerAddress" value={finance ? financeCompany!.address : customerAddress} onChange={e => !finance && setCustomerAddress(e.target.value)} readOnly={finance} required rows={3} />
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Input
                            id="customerEmail"
                            label="Email"
                            type="email"
                            inputMode="email"
                            value={customerEmail}
                            onChange={e => setCustomerEmail(e.target.value)}
                            placeholder="name@example.com"
                            hint={`To email the ${docTitles[documentType].toLowerCase()}`}
                        />
                        <Input
                            id="customerPhone"
                            label="Mobile"
                            type="tel"
                            inputMode="tel"
                            value={customerPhone}
                            onChange={e => setCustomerPhone(e.target.value)}
                            placeholder="07123 456789"
                            hint={`To WhatsApp the ${docTitles[documentType].toLowerCase()}`}
                            className="num"
                        />
                    </div>
                    <Checkbox
                        id="useDeliveryAddress"
                        checked={useDeliveryAddress}
                        onChange={e => setUseDeliveryAddress(e.target.checked)}
                        disabled={finance}
                        label="Different delivery address, or a finance company"
                    />

                    {useDeliveryAddress && (
                        <div className="space-y-4 rounded-card border border-line bg-surface-2 p-4">
                            <div>
                                <FieldLabel htmlFor="dc-finco">Finance company</FieldLabel>
                                <div className="flex items-center gap-2">
                                    <Select id="dc-finco" value={selectedFinCo} onChange={e => setSelectedFinCo(e.target.value)} wrapperClassName="min-w-0 flex-1">
                                        <option value="">No finance company</option>
                                        {financeCompanies.map(fc => <option key={fc.id} value={fc.id}>{fc.name}</option>)}
                                    </Select>
                                    <Button type="button" variant="ghost" onClick={() => setIsAddingFinCo(!isAddingFinCo)} className="flex-none px-3">
                                        {isAddingFinCo ? 'Cancel' : 'Add new'}
                                    </Button>
                                </div>
                            </div>
                            {isAddingFinCo && (
                                <div className="space-y-3 rounded-control border border-line bg-surface p-3">
                                    <Input id="dc-finco-name" label="Company name" value={newFinCoName} onChange={e => setNewFinCoName(e.target.value)} required />
                                    <div>
                                        <FieldLabel htmlFor="dc-finco-address">Company address</FieldLabel>
                                        <TextArea id="dc-finco-address" value={newFinCoAddress} onChange={e => setNewFinCoAddress(e.target.value)} required rows={2} />
                                    </div>
                                    <Button type="button" variant="secondary" block onClick={handleAddFinanceCompany}>Save finance company</Button>
                                </div>
                            )}
                            <Input
                                id="deliveryName"
                                label={finance ? 'Deliver to (customer name)' : 'Delivery name'}
                                value={finance ? customerName : deliveryName}
                                onChange={e => finance ? setCustomerName(e.target.value) : setDeliveryName(e.target.value)}
                            />
                            <div>
                                <FieldLabel htmlFor="deliveryAddress">{finance ? 'Delivery address (customer)' : 'Delivery address'}</FieldLabel>
                                <TextArea id="deliveryAddress" value={finance ? customerAddress : deliveryAddress} onChange={e => finance ? setCustomerAddress(e.target.value) : setDeliveryAddress(e.target.value)} rows={3} />
                            </div>
                        </div>
                    )}
                </section>

                {/* ---- Price ---- */}
                <section className="space-y-4" aria-labelledby="dc-price">
                    <h3 id="dc-price" className={eyebrow}>Price</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 sm:col-span-1"><FieldLabel htmlFor="invoiceDate">Date</FieldLabel><UkDateInput id="invoiceDate" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required/></div>
                        <div className="col-span-2 sm:col-span-1"><FieldLabel htmlFor="price">Car price</FieldLabel><CurrencyInput id="price" value={priceStr} onChange={e => setPriceStr(e.target.value)} required /></div>
                        <div><FieldLabel htmlFor="deliveryCharge">Delivery</FieldLabel><CurrencyInput id="deliveryCharge" value={deliveryChargeStr} onChange={e => setDeliveryChargeStr(e.target.value)} /></div>
                        <div><FieldLabel htmlFor="surcharge">Surcharge</FieldLabel><CurrencyInput id="surcharge" value={surchargeStr} onChange={e => setSurchargeStr(e.target.value)} /></div>
                    </div>

                    <Checkbox id="hasPartExchange" checked={hasPartExchange} onChange={e => setHasPartExchange(e.target.checked)} label="Part exchange" description="Their car goes against the price" />
                    {hasPartExchange && (
                        <div className="grid grid-cols-1 gap-4 rounded-card border border-line bg-surface-2 p-4 md:grid-cols-2">
                            <div className="md:col-span-2"><FieldLabel htmlFor="pxValue">Part-exchange value</FieldLabel><CurrencyInput id="pxValue" value={pxValueStr} onChange={e => setPxValueStr(e.target.value)} required /></div>
                            <Input id="pxReg" label="Registration" autoCapitalize="characters" value={partExchangeDetails.reg || ''} onChange={e => setPartExchangeDetails(p => ({...p, reg: e.target.value.toUpperCase()}))} className="font-mono uppercase tracking-[0.08em]" />
                            <Input id="pxMake" label="Make" value={partExchangeDetails.make || ''} onChange={e => setPartExchangeDetails(p => ({...p, make: e.target.value}))} />
                            <Input id="pxModel" label="Model" value={partExchangeDetails.model || ''} onChange={e => setPartExchangeDetails(p => ({...p, model: e.target.value}))} />
                            <Input id="pxMileage" label="Mileage" type="number" inputMode="numeric" value={partExchangeDetails.mileage || ''} onChange={e => setPartExchangeDetails(p => ({...p, mileage: parseInt(e.target.value)}))} trailing={<span className="text-sm">mi</span>} className="num" />
                        </div>
                    )}
                </section>

                {/* ---- Payments ---- */}
                <section className="space-y-3" aria-labelledby="dc-payments">
                    <h3 id="dc-payments" className={eyebrow}>Payments taken</h3>
                    {payments.length === 0 && <p className="text-sm text-ink-3">Nothing paid yet.</p>}
                    {payments.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                                <label htmlFor={`payment-method-${i}`} className="sr-only">Payment {i + 1} method</label>
                                <Select id={`payment-method-${i}`} value={p.method} onChange={e => handlePaymentChange(i, 'method', e.target.value)}>
                                    <option>Bank Transfer</option><option>Card</option><option>Cash</option><option>Finance</option><option>Deposit</option><option>Other</option>
                                </Select>
                            </div>
                            <div className="w-36 flex-none sm:w-44">
                                <label htmlFor={`payment-amount-${i}`} className="sr-only">Payment {i + 1} amount</label>
                                <CurrencyInput id={`payment-amount-${i}`} value={p.amount} onChange={e => handlePaymentChange(i, 'amount', e.target.value)} />
                            </div>
                            <IconButton label={`Remove payment ${i + 1}`} icon={<TrashIcon />} onClick={() => removePayment(i)} className="-me-2 hover:bg-danger-soft hover:text-danger" />
                        </div>
                    ))}
                    <Button type="button" variant="secondary" icon={<PlusIcon />} onClick={addPayment} block className="border-dashed">
                        Add payment
                    </Button>
                </section>

                {/* ---- Notes ---- */}
                <section aria-labelledby="dc-notes">
                    <h3 id="dc-notes" className={cx(eyebrow, 'mb-3')}>Notes</h3>
                    <FieldLabel htmlFor="additionalNotes">On the document <span className="font-normal text-ink-3">(optional)</span></FieldLabel>
                    <TextArea id="additionalNotes" value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} rows={3} placeholder={documentType === 'Deposit Slip' ? 'Enter any prep work to be done here...' : ''} />
                </section>

                {/* ---- Totals: what the paper will say ---- */}
                <dl className="m-0 divide-y divide-line rounded-card border border-line bg-surface-2 text-sm">
                    <div className="flex items-center justify-between px-4 py-2.5"><dt className="text-ink-2">Subtotal</dt><dd className="num m-0 font-semibold text-ink">{formatCurrency(subtotal)}</dd></div>
                    <div className="flex items-center justify-between px-4 py-2.5"><dt className="text-ink-2">Payments</dt><dd className="num m-0 font-semibold text-ink">({formatCurrency(totalPayments)})</dd></div>
                    {hasPartExchange && <div className="flex items-center justify-between px-4 py-2.5"><dt className="text-ink-2">Part exchange</dt><dd className="num m-0 font-semibold text-ink">({formatCurrency(pxValue)})</dd></div>}
                    <div className="flex items-center justify-between px-4 py-3"><dt className="text-base font-bold text-ink">Balance due</dt><dd className="num m-0 text-xl font-bold text-ink">{formatCurrency(balance)}</dd></div>
                </dl>
            </form>
            </SheetBody>
            <SheetFooter>
                <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button type="submit" form="doc-creator-form" loading={isSubmitting}>
                    Preview {docName}
                </Button>
            </SheetFooter>
        </SheetFrame>
    );
};

export default DocumentCreator;