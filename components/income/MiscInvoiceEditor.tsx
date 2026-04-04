import React, { useState, useEffect, useMemo } from 'react';
import { NewMiscInvoice, StatementTransaction, Customer, NewCustomer, BusinessDetails, MiscInvoice, MiscInvoiceUpdate } from '../../types';
import * as dataService from '../../services/dataService';
import { XMarkIcon, PlusIcon, TrashIcon } from '../icons';
import Spinner from '../common/Spinner';
import CurrencyInput from '../common/CurrencyInput';
import { formatCurrency } from '../../utils/helpers';
import PrintableMiscInvoice from './PrintableMiscInvoice';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import Select from '../common/Select';


interface MiscInvoiceEditorProps {
    companyId: string;
    transaction?: StatementTransaction;
    editingInvoice?: MiscInvoice | null;
    customers: Customer[];
    onSubmit: (data: NewMiscInvoice | MiscInvoiceUpdate, id?: string, transactionId?: string) => Promise<void>;
    onClose: () => void;
    businessDetails: BusinessDetails | null;
}

interface LineItem {
    description: string;
    amount: number;
    amountStr: string;
}

const MiscInvoiceEditor = ({ companyId, transaction, editingInvoice, customers, onSubmit, onClose, businessDetails }: MiscInvoiceEditorProps) => {
    const { openModal } = useUI();
    const { isVatRegistered } = useData();
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [isVatInvoice, setIsVatInvoice] = useState(false);
    const [items, setItems] = useState<LineItem[]>([{ description: '', amount: 0, amountStr: '' }]);
    const [totalStr, setTotalStr] = useState('');
    
    const [isAddingCustomer, setIsAddingCustomer] = useState(false);
    // FIX: Changed isVatRegistered to isBusiness to match NewCustomer type
    const [newCustomer, setNewCustomer] = useState<Partial<NewCustomer>>({ name: '', address: '', isBusiness: true });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [previewData, setPreviewData] = useState<NewMiscInvoice | MiscInvoice | null>(null);

    const isEditing = !!editingInvoice;

    useEffect(() => {
        if (isEditing && editingInvoice) {
            const customer = customers.find(c => c.name === editingInvoice.customerName && c.address === editingInvoice.customerAddress);
            setSelectedCustomerId(customer?.id || '');
            setCustomerName(editingInvoice.customerName);
            setCustomerAddress(editingInvoice.customerAddress);
            setIsVatInvoice(editingInvoice.isVatInvoice);
            setItems(editingInvoice.items.map(item => ({...item, amountStr: String(item.amount)})));
        } else if (transaction) {
            setTotalStr(String(Math.abs(transaction.amount)));
            setItems([{ description: transaction.description || 'Miscellaneous Income', amount: 0, amountStr: '' }]);
        }
    }, [editingInvoice, isEditing, transaction, customers]);

    useEffect(() => {
        if (selectedCustomerId) {
            const customer = customers.find(c => c.id === selectedCustomerId);
            if (customer) {
                setCustomerName(customer.name);
                setCustomerAddress(customer.address);
                // Only auto-set VAT checkbox from customer when creating new invoices,
                // not when editing — editing should preserve the stored value
                if (!isEditing) {
                    setIsVatInvoice(customer.isBusiness);
                }
                setIsAddingCustomer(false);
            }
        } else if (!isEditing) {
            setCustomerName('');
            setCustomerAddress('');
        }
    }, [selectedCustomerId, customers, isEditing]);

    const totalFromItems = items.reduce((sum, item) => sum + item.amount, 0);
    const total = parseFloat(totalStr) || 0;
    const shouldCalculateVat = isVatRegistered && isVatInvoice;
    const vat = shouldCalculateVat ? total / 6 : 0;
    const subtotal = total - vat;

    const handleItemChange = (index: number, field: keyof LineItem, value: string) => {
        const newItems = [...items];
        const item = { ...newItems[index] };
        if (field === 'amountStr') {
            item.amountStr = value;
            item.amount = parseFloat(value) || 0;
        } else if (field === 'description') {
            item.description = value;
        }
        newItems[index] = item;
        setItems(newItems);
    };

    const addItem = () => setItems([...items, { description: '', amount: 0, amountStr: '' }]);
    const removeItem = (index: number) => { if (items.length > 1) setItems(items.filter((_, i) => i !== index)); };

    const handleAddCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newCustomer.name && newCustomer.address) {
            const newId = await dataService.addCustomer(companyId, newCustomer as NewCustomer);
            setSelectedCustomerId(newId);
            setNewCustomer({ name: '', address: '', isBusiness: true });
        }
    };
    
    const handleGeneratePreview = (e: React.FormEvent) => {
        e.preventDefault();
        
        let finalItems: { description: string; amount: number }[];
        let finalSubtotal: number;
        let finalVat: number;
        let finalTotal: number;

        if (transaction && !isEditing) {
            finalTotal = parseFloat(totalStr) || 0;
            finalVat = isVatInvoice ? finalTotal / 6 : 0;
            finalSubtotal = finalTotal - finalVat;
            finalItems = [{ description: items[0]?.description || transaction.description || 'Miscellaneous Income', amount: finalSubtotal }];
        } else {
            finalItems = items.map(({ amountStr, ...rest}) => rest).filter(i => i.description.trim() !== '');
            finalSubtotal = finalItems.reduce((sum, item) => sum + item.amount, 0);
            finalVat = isVatInvoice ? finalSubtotal * 0.2 : 0;
            finalTotal = finalSubtotal + finalVat;
        }

        const invoiceData: NewMiscInvoice = {
            invoiceNumber: editingInvoice?.invoiceNumber || String(Math.floor(10000 + Math.random() * 90000)),
            invoiceDate: editingInvoice?.invoiceDate || transaction?.date || new Date().toISOString().split('T')[0],
            customerName,
            customerAddress,
            isVatInvoice: isVatInvoice,
            items: finalItems,
            subtotal: finalSubtotal,
            vat: finalVat,
            total: finalTotal,
        };
        setPreviewData(invoiceData);
    };
    
    const handleConfirmSave = async () => {
        if (!previewData) return;
        setIsSubmitting(true);
        try {
            if (isEditing) {
                const { invoiceNumber, invoiceDate, ...updateData } = previewData;
                await onSubmit(updateData, editingInvoice!.id);
            } else {
                await onSubmit(previewData as NewMiscInvoice, undefined, transaction?.id);
            }
        } catch (error) {
            console.error(error);
            setPreviewData(null);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDelete = () => {
        if (!isEditing) return;
        onClose();
        openModal('deleteMiscInvoiceConfirm', editingInvoice);
    };

    if (previewData) {
        const { id, createdAt, ...newInvoiceData } = previewData as MiscInvoice;
        const docForPreview: MiscInvoice = {
            id: editingInvoice?.id || 'temp-id',
            createdAt: editingInvoice?.createdAt || Date.now(),
            linkedTransactionId: editingInvoice?.linkedTransactionId,
            ...newInvoiceData,
        };
        return (
            <PrintableMiscInvoice
                invoice={docForPreview}
                businessDetails={businessDetails}
                onClose={onClose}
                isPreview={true}
                onBack={() => setPreviewData(null)}
                onConfirm={handleConfirmSave}
            />
        );
    }

    return (
        <div className="w-full flex flex-col h-full">
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{isEditing ? `Edit Invoice #${editingInvoice.invoiceNumber}` : 'Create Income Invoice'}</h2>
                <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-700"><XMarkIcon className="h-6 w-6" /></button>
            </header>
            <form id="misc-invoice-form" onSubmit={handleGeneratePreview} className="p-6 space-y-6 flex-1 overflow-y-auto">
                 <div>
                    <label htmlFor="customer" className="block text-sm font-medium text-gray-300">Customer</label>
                    <div className="flex gap-2 mt-1">
                        <Select id="customer" value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)}>
                            <option value="">-- Manual Entry --</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                        <button type="button" onClick={() => setIsAddingCustomer(!isAddingCustomer)} className="p-2 rounded-md bg-gray-600 text-white hover:bg-gray-500"><PlusIcon className="h-5 w-5"/></button>
                    </div>
                </div>

                {isAddingCustomer && (
                    <div className="p-4 bg-gray-700/50 rounded-lg space-y-4">
                         <h3 className="font-semibold text-white">Add New Customer</h3>
                         <input type="text" placeholder="New Customer Name" value={newCustomer.name || ''} onChange={e => setNewCustomer(p => ({...p, name: e.target.value}))} className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" required/>
                         <textarea placeholder="Customer Address" value={newCustomer.address || ''} onChange={e => setNewCustomer(p => ({...p, address: e.target.value}))} rows={2} className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" required/>
                         {/* FIX: Changed isVatRegistered to isBusiness */}
                         <div className="relative flex items-start"><div className="flex h-6 items-center"><input id="isBusiness" type="checkbox" checked={newCustomer.isBusiness} onChange={e => setNewCustomer(p => ({...p, isBusiness: e.target.checked}))} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600" /></div><div className="ml-3 text-sm"><label htmlFor="isBusiness" className="font-medium text-gray-300">This is a business account</label></div></div>
                         <button type="button" onClick={handleAddCustomer} className="w-full px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md">Save Customer</button>
                    </div>
                )}

                {(!selectedCustomerId || isEditing) && !isAddingCustomer && (
                    <div className="grid grid-cols-1 gap-4">
                        <div><label htmlFor="customerName" className="block text-sm font-medium text-gray-300">Full Name</label><input type="text" id="customerName" value={customerName} onChange={e => setCustomerName(e.target.value)} required className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                        <div><label htmlFor="customerAddress" className="block text-sm font-medium text-gray-300">Address</label><textarea id="customerAddress" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} required rows={3} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white" /></div>
                    </div>
                )}
                
                {isVatRegistered && <div className="relative flex items-start"><div className="flex h-6 items-center"><input id="isVatInvoice" type="checkbox" checked={isVatInvoice} onChange={e => setIsVatInvoice(e.target.checked)} className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-brand-600" /></div><div className="ml-3 text-sm"><label htmlFor="isVatInvoice" className="font-medium text-gray-300">This is a VAT Invoice</label></div></div>}
                
                {transaction && !isEditing ? (
                    <div>
                        <label htmlFor="total" className="block text-sm font-medium text-gray-300">Total Amount Received</label>
                        <CurrencyInput id="total" value={totalStr} onChange={e => setTotalStr(e.target.value)} />
                        <label htmlFor="description" className="mt-2 block text-sm font-medium text-gray-300">Description</label>
                        <input id="description" type="text" placeholder="e.g., Monthly Rent" value={items[0].description} onChange={e => handleItemChange(0, 'description', e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"/>
                    </div>
                ) : (
                     <div>
                        <h3 className="text-base font-semibold text-white">Invoice Items</h3>
                         <div className="mt-2 space-y-3">
                            {items.map((item, index) => (
                                <div key={index} className="flex items-start gap-2">
                                    <div className="flex-1"><label htmlFor={`desc-${index}`} className="sr-only">Description</label><input id={`desc-${index}`} type="text" placeholder="e.g., Full Service" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="block w-full bg-gray-700 border-gray-600 rounded-md py-2 px-3 text-white"/></div>
                                    <div className="w-36"><label htmlFor={`cost-${index}`} className="sr-only">Amount</label><CurrencyInput id={`cost-${index}`} value={item.amountStr} onChange={e => handleItemChange(index, 'amountStr', e.target.value)} /></div>
                                    <button type="button" onClick={() => removeItem(index)} disabled={items.length <= 1} className="p-2 text-gray-400 hover:text-red-400 disabled:opacity-50"><TrashIcon className="h-5 w-5"/></button>
                                </div>
                            ))}
                            <button type="button" onClick={addItem} className="w-full text-sm font-semibold text-brand-400 hover:text-brand-300 flex items-center justify-center gap-2 p-2 border-2 border-dashed border-gray-600 rounded-lg hover:border-gray-500"><PlusIcon className="h-4 w-4"/> Add Line Item</button>
                        </div>
                    </div>
                )}

                <div className="pt-4 border-t border-gray-700 space-y-2">
                    <div className="flex justify-between items-center text-sm"><span className="text-gray-400">Subtotal</span><span className="font-medium text-white">{formatCurrency(transaction && !isEditing ? subtotal : totalFromItems)}</span></div>
                    {isVatInvoice && <div className="flex justify-between items-center text-sm"><span className="text-gray-400">VAT (20%)</span><span className="font-medium text-white">{formatCurrency(transaction && !isEditing ? vat : totalFromItems * 0.2)}</span></div>}
                    <div className="flex justify-between items-center text-lg font-bold"><span className="text-white">Total</span><span className="font-bold text-white">{formatCurrency(isVatInvoice ? (transaction && !isEditing ? total : totalFromItems * 1.2) : (transaction && !isEditing ? total : totalFromItems))}</span></div>
                </div>

            </form>
            <footer className="flex-shrink-0 p-4 border-t border-gray-700 flex justify-between items-center bg-gray-800">
                <div>
                    {isEditing && (
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isSubmitting}
                            className="inline-flex items-center text-sm font-medium text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                            <TrashIcon className="h-5 w-5 mr-2 -ml-1" />
                            Delete Invoice
                        </button>
                    )}
                </div>
                <button type="submit" form="misc-invoice-form" disabled={isSubmitting} className="inline-flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50">
                    {isSubmitting ? <Spinner /> : 'Generate Preview'}
                </button>
            </footer>
        </div>
    );
};

export default MiscInvoiceEditor;