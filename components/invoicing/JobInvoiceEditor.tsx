import React, { useState, useEffect, useMemo } from 'react';
import { NewJobInvoice, JobInvoice, JobInvoiceUpdate, Customer, BusinessDetails, Payment } from '../../types';
import { useData } from '../../hooks/useData';
import { XMarkIcon, PlusIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/helpers';
import PrintableJobInvoice from './PrintableJobInvoice';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';

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
            alert('Please add at least one line item.');
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
            />
        )
    }

    return (
        <div className="w-full flex flex-col h-full">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{isEditing ? `Edit ${editingInvoice.status} #${editingInvoice.invoiceNumber}` : 'Create Job Quote/Invoice'}</h2>
                <button onClick={onCancel} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <form id="job-invoice-form" onSubmit={handleGeneratePreview} className="p-6 space-y-6 flex-1 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Customer</label>
                        <Select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} required wrapperClassName="mt-1">
                            <option value="">-- Select a Customer --</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Date</label>
                        <UkDateInput id="invoiceDate" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="mt-1" required/>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300">Document Type</label>
                    <div className="mt-2 flex items-center space-x-2 rounded-lg bg-gray-700 p-1">
                        <button type="button" onClick={() => setStatus('Quote')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${status === 'Quote' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Quote</button>
                        <button type="button" onClick={() => setStatus('Invoice')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${status === 'Invoice' ? 'bg-brand-600 text-white shadow' : 'text-gray-300 hover:bg-gray-600'}`}>Invoice</button>
                    </div>
                </div>

                <div>
                    <h3 className="text-base font-semibold text-white">Invoice Items</h3>
                     <div className="mt-2 space-y-3">
                        {items.map((item, index) => (
                            <div key={index} className="flex items-end gap-2">
                                <div className="flex-1"><label className="sr-only">Description</label><input type="text" placeholder="Description" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="block w-full bg-gray-700 rounded-md py-2 px-3 text-white"/></div>
                                <div className="w-24"><label className="sr-only">Qty</label><input type="number" placeholder="Qty" value={item.quantityStr} onChange={e => handleItemChange(index, 'quantityStr', e.target.value)} className="block w-full bg-gray-700 rounded-md py-2 px-3 text-white"/></div>
                                <div className="w-36"><label className="sr-only">Unit Price</label><CurrencyInput id={`price-${index}`} value={item.unitPriceStr} onChange={e => handleItemChange(index, 'unitPriceStr', e.target.value)} /></div>
                                <div className="w-36 text-right py-2 px-3 text-white">{formatCurrency(item.total)}</div>
                                <button type="button" onClick={() => removeItem(index)} disabled={items.length <= 1} className="p-2 text-gray-400 hover:text-red-400 disabled:opacity-50"><TrashIcon className="h-5 w-5"/></button>
                            </div>
                        ))}
                        <button type="button" onClick={addItem} className="w-full text-sm font-semibold text-brand-400 hover:text-brand-300 flex items-center justify-center gap-2 p-2 border-2 border-dashed border-gray-600 rounded-lg hover:border-gray-500">
                            <PlusIcon className="h-4 w-4"/> Add Line Item
                        </button>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-700 space-y-2">
                    <div className="flex justify-between items-center text-sm"><span className="text-gray-400">Subtotal</span><span className="font-medium text-white">{formatCurrency(subtotal)}</span></div>
                    {isVatRegistered && customerDetails.isBusiness && (
                         <div className="flex justify-between items-center text-sm"><span className="text-gray-400">VAT (20%)</span><span className="font-medium text-white">{formatCurrency(vat)}</span></div>
                    )}
                    <div className="flex justify-between items-center text-lg font-bold"><span className="text-white">Total</span><span className="font-bold text-white">{formatCurrency(total)}</span></div>
                </div>

            </form>
             <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-end">
                <button type="submit" form="job-invoice-form" disabled={isSubmitting || !selectedCustomerId} className="inline-flex items-center px-4 py-2 border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : 'Generate Preview'}
                </button>
            </footer>
        </div>
    )
}

export default JobInvoiceEditor;