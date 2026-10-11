import React, { useState, useEffect, useMemo } from 'react';
import { NewJobInvoice, JobInvoice, JobInvoiceUpdate, Customer, BusinessDetails, Payment } from '../../types';
import { useData } from '../../hooks/useData';
import { TrashIcon } from '../icons';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/helpers';
import PrintableJobInvoice from './PrintableJobInvoice';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';
import { useToast, Button, Field, IconButton, Segmented } from '../ui';
import EditorFrame, { AddLineButton, FrameInput, TotalLine } from '../work-sheets/EditorFrame';

interface JobInvoiceEditorProps {
    editingInvoice?: JobInvoice | null;
    onSubmit: (data: NewJobInvoice | JobInvoiceUpdate, id?: string) => Promise<void>;
    onCancel: () => void;
    businessDetails: BusinessDetails | null;
}

interface LineItem {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    quantityStr: string;
    unitPriceStr: string;
}

const JobInvoiceEditor = ({ editingInvoice, onSubmit, onCancel, businessDetails }: JobInvoiceEditorProps) => {
    const { customers, isVatRegistered } = useData();
    const toast = useToast();
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [customerDetails, setCustomerDetails] = useState<Omit<Customer, 'id' | 'createdAt'>>({ name: '', address: '', isBusiness: false });
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
    const [status, setStatus] = useState<'Quote' | 'Invoice'>('Quote');
    const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: 0, total: 0, quantityStr: '1', unitPriceStr: '' }]);
    const [notes, setNotes] = useState('');
    const [payments, setPayments] = useState<Payment[]>([]);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewData, setPreviewData] = useState<JobInvoice | null>(null);

    const isEditing = !!editingInvoice;

    useEffect(() => {
        if (isEditing && editingInvoice) {
            setSelectedCustomerId(editingInvoice.customerId);
            setCustomerDetails(editingInvoice.customerDetails);
            setInvoiceDate(editingInvoice.invoiceDate);
            setStatus(editingInvoice.status);
            setItems(editingInvoice.items.map(item => ({...item, quantityStr: String(item.quantity), unitPriceStr: String(item.unitPrice)})));
            setNotes(editingInvoice.notes || '');
            setPayments(editingInvoice.payments || []);
        }
    }, [editingInvoice, isEditing]);

    useEffect(() => {
        if (selectedCustomerId) {
            const customer = customers.find(c => c.id === selectedCustomerId);
            if (customer) {
                const { id, createdAt, ...details } = customer;
                setCustomerDetails(details);
            }
        }
    }, [selectedCustomerId, customers]);
    
    const handleItemChange = (index: number, field: keyof LineItem, value: string) => {
        const newItems = [...items];
        const item = { ...newItems[index] };
        
        if (field === 'description') {
            item.description = value;
        } else if (field === 'quantityStr') {
            item.quantityStr = value;
            item.quantity = parseFloat(value) || 0;
        } else if (field === 'unitPriceStr') {
            item.unitPriceStr = value;
            item.unitPrice = parseFloat(value) || 0;
        }
        
        item.total = item.quantity * item.unitPrice;
        newItems[index] = item;
        setItems(newItems);
    };

    const addItem = () => setItems([...items, { description: '', quantity: 1, unitPrice: 0, total: 0, quantityStr: '1', unitPriceStr: '' }]);
    const removeItem = (index: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== index)); };

    const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.total, 0), [items]);
    const vat = customerDetails.isBusiness && isVatRegistered ? subtotal * 0.2 : 0;
    const total = subtotal + vat;

    const handleGeneratePreview = (e: React.FormEvent) => {
        e.preventDefault();
        
        const finalItems = items
            .map(({ quantityStr, unitPriceStr, ...rest }) => rest)
            .filter(item => item.description.trim() !== '');

        if (finalItems.length === 0) {
            toast.error('Please add at least one line item.');
            return;
        }

        const invoiceData: JobInvoice = {
            id: editingInvoice?.id || 'temp-preview',
            invoiceNumber: editingInvoice?.invoiceNumber || String(Math.floor(10000 + Math.random() * 90000)),
            invoiceDate,
            customerId: selectedCustomerId,
            customerDetails,
            status,
            items: finalItems,
            subtotal,
            vat,
            total,
            payments,
            balance: total - payments.reduce((sum, p) => sum + p.amount, 0),
            notes,
            createdAt: editingInvoice?.createdAt || Date.now()
        };
        setPreviewData(invoiceData);
    };

    const handleConfirmSave = async () => {
        if (!previewData) return;
        setIsSubmitting(true);
        try {
            const { id, createdAt, ...submissionData } = previewData;
            await onSubmit(submissionData, isEditing ? editingInvoice.id : undefined);
        } catch (e) {
            console.error(e);
            toast.error("Could not save the invoice. Please try again.");
            setPreviewData(null);
        } finally {
            setIsSubmitting(false);
        }
    }
    
    if (previewData) {
        return (
            <PrintableJobInvoice 
                invoice={previewData}
                businessDetails={businessDetails}
                onClose={onCancel}
                isPreview
                onBack={() => setPreviewData(null)}
                onConfirm={handleConfirmSave}
                isSubmitting={isSubmitting}
            />
        )
    }

    return (
        <EditorFrame
            title={isEditing ? <>Edit {editingInvoice.status.toLowerCase()} <span className="num">#{editingInvoice.invoiceNumber}</span></> : 'New quote or invoice'}
            onClose={onCancel}
            formId="job-invoice-form"
            onSubmit={handleGeneratePreview}
            footer={<>
                <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button type="submit" form="job-invoice-form" loading={isSubmitting} disabled={!selectedCustomerId}>
                    {status === 'Quote' ? 'Preview quote' : 'Preview invoice'}
                </Button>
            </>}
        >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Customer" htmlFor="jobInvoiceCustomer">
                    <Select id="jobInvoiceCustomer" value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} required>
                        <option value="">Choose a customer</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                </Field>
                <Field label="Date" htmlFor="invoiceDate">
                    <UkDateInput id="invoiceDate" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required />
                </Field>
            </div>

            <div className="flex flex-col gap-1.5">
                <span id="jobInvoiceType" className="text-sm font-semibold text-ink">Document</span>
                <Segmented
                    ariaLabel="Document"
                    full
                    value={status}
                    onChange={v => setStatus(v)}
                    options={[{ value: 'Quote', label: 'Quote' }, { value: 'Invoice', label: 'Invoice' }]}
                />
            </div>

            <fieldset>
                <legend className="mb-2 text-base font-bold text-ink">Items</legend>
                <div className="divide-y divide-line rounded-card border border-line">
                    {items.map((item, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2 p-2.5 md:flex-nowrap">
                            <div className="min-w-0 basis-full md:flex-1 md:basis-0">
                                <label htmlFor={`job-desc-${index}`} className="sr-only">Description, line {index + 1}</label>
                                <FrameInput id={`job-desc-${index}`} type="text" placeholder="Description" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} />
                            </div>
                            <div className="w-20 flex-none">
                                <label htmlFor={`job-qty-${index}`} className="sr-only">Quantity, line {index + 1}</label>
                                <FrameInput id={`job-qty-${index}`} type="number" inputMode="decimal" placeholder="Qty" value={item.quantityStr} onChange={e => handleItemChange(index, 'quantityStr', e.target.value)} className="num fl-no-spin text-end" />
                            </div>
                            <div className="min-w-0 flex-1 md:w-36 md:flex-none">
                                <label htmlFor={`price-${index}`} className="sr-only">Unit price, line {index + 1}</label>
                                <CurrencyInput id={`price-${index}`} value={item.unitPriceStr} onChange={e => handleItemChange(index, 'unitPriceStr', e.target.value)} />
                            </div>
                            <span className="num hidden w-28 flex-none text-end text-base text-ink sm:block" aria-label={`Line ${index + 1} total`}>{formatCurrency(item.total)}</span>
                            <IconButton label={`Remove line ${index + 1}`} icon={<TrashIcon />} onClick={() => removeItem(index)} disabled={items.length <= 1} />
                        </div>
                    ))}
                </div>
                <div className="mt-2">
                    <AddLineButton onClick={addItem} />
                </div>
            </fieldset>

            <div className="space-y-1.5 border-t border-line pt-4">
                <TotalLine label="Subtotal" value={formatCurrency(subtotal)} />
                {isVatRegistered && customerDetails.isBusiness && (
                    <TotalLine label="VAT (20%)" value={formatCurrency(vat)} />
                )}
                <TotalLine strong label="Total" value={formatCurrency(total)} />
            </div>
        </EditorFrame>
    )
}

export default JobInvoiceEditor;