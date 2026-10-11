import React, { useState, useEffect, useMemo } from 'react';
import { NewMiscInvoice, StatementTransaction, Customer, NewCustomer, BusinessDetails, MiscInvoice, MiscInvoiceUpdate } from '../../types';
import * as dataService from '../../services/dataService';
import { XMarkIcon, PlusIcon, TrashIcon } from '../icons';
import CurrencyInput from '../common/CurrencyInput';
import UkDateInput from '../common/UkDateInput';
import PrintableMiscInvoice from './PrintableMiscInvoice';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import Select from '../common/Select';
import { useToast, Button, IconButton, Input, Field, Checkbox } from '../ui';
import { controlFrame, controlInput, cx } from '../ui/cx';
import { Money, Line } from '../accountant/hubShared';

const textareaCls = cx(controlFrame(), 'block w-full px-3.5 py-3 text-base leading-snug text-ink placeholder:text-ink-3 focus-visible:outline-none');


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
    const toast = useToast();
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [isVatInvoice, setIsVatInvoice] = useState(false);
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
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
            setInvoiceDate(editingInvoice.invoiceDate);
        } else if (transaction) {
            setTotalStr(String(Math.abs(transaction.amount)));
            setItems([{ description: transaction.description || 'Miscellaneous Income', amount: 0, amountStr: '' }]);
            setInvoiceDate(transaction.date);
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
                    setIsVatInvoice(!!customer.isBusiness);
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
            invoiceDate,
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
                const { invoiceNumber, ...updateData } = previewData;
                await onSubmit(updateData, editingInvoice!.id);
            } else {
                await onSubmit(previewData as NewMiscInvoice, undefined, transaction?.id);
            }
        } catch (error) {
            console.error(error);
            toast.error("Could not save the invoice. Please try again.");
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
                isSubmitting={isSubmitting}
            />
        );
    }

    const fromTx = !!transaction && !isEditing;
    const shownSubtotal = fromTx ? subtotal : totalFromItems;
    const shownVat = fromTx ? vat : totalFromItems * 0.2;
    const shownTotal = isVatInvoice ? (fromTx ? total : totalFromItems * 1.2) : (fromTx ? total : totalFromItems);

    return (
        <div className="flex h-full w-full flex-col">
            <header className="flex items-center justify-between gap-3 border-b border-line py-2 pe-2 ps-4">
                <h2 className="min-w-0 truncate text-lg font-bold text-ink">{isEditing ? <>Edit invoice <span className="num">#{editingInvoice.invoiceNumber}</span></> : 'New income invoice'}</h2>
                <IconButton label="Close" icon={<XMarkIcon />} onClick={onClose} />
            </header>
            <form id="misc-invoice-form" onSubmit={handleGeneratePreview} className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
                <Field label="Customer" htmlFor="customer">
                    <div className="flex gap-2">
                        <Select id="customer" value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)} wrapperClassName="flex-1">
                            <option value="">Type the name and address below</option>
                            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </Select>
                        <IconButton variant="outlined" label={isAddingCustomer ? 'Close new customer form' : 'Add a new customer'} icon={<PlusIcon />} onClick={() => setIsAddingCustomer(!isAddingCustomer)} aria-expanded={isAddingCustomer} />
                    </div>
                </Field>

                <Field label="Date" htmlFor="invoiceDate">
                    <UkDateInput id="invoiceDate" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required />
                </Field>

                {isAddingCustomer && (
                    <div className="space-y-4 rounded-card border border-line bg-surface-2 p-4">
                        <h3 className="font-bold text-ink">New customer</h3>
                        <Input label="Name" value={newCustomer.name || ''} onChange={e => setNewCustomer(p => ({...p, name: e.target.value}))} required />
                        <Field label="Address">
                            <textarea value={newCustomer.address || ''} onChange={e => setNewCustomer(p => ({...p, address: e.target.value}))} rows={2} className={textareaCls} required />
                        </Field>
                        {/* FIX: Changed isVatRegistered to isBusiness */}
                        <Checkbox id="isBusiness" label="This is a business" checked={newCustomer.isBusiness} onChange={e => setNewCustomer(p => ({...p, isBusiness: e.target.checked}))} />
                        <Button type="button" variant="secondary" block onClick={handleAddCustomer}>Save customer</Button>
                    </div>
                )}

                {(!selectedCustomerId || isEditing) && !isAddingCustomer && (
                    <div className="grid grid-cols-1 gap-4">
                        <Input label="Full name" id="customerName" value={customerName} onChange={e => setCustomerName(e.target.value)} required />
                        <Field label="Address" htmlFor="customerAddress">
                            <textarea id="customerAddress" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} required rows={3} className={textareaCls} />
                        </Field>
                    </div>
                )}

                {isVatRegistered && <Checkbox id="isVatInvoice" label="This is a VAT invoice" checked={isVatInvoice} onChange={e => setIsVatInvoice(e.target.checked)} />}

                {fromTx ? (
                    <div className="space-y-4">
                        <Field label="Total received" htmlFor="total">
                            <CurrencyInput id="total" value={totalStr} onChange={e => setTotalStr(e.target.value)} />
                        </Field>
                        <Input label="Description" id="description" placeholder="Monthly rent" value={items[0].description} onChange={e => handleItemChange(0, 'description', e.target.value)} />
                    </div>
                ) : (
                    <div>
                        <h3 className="text-base font-bold text-ink">What it is for</h3>
                        <div className="mt-2 space-y-2">
                            {items.map((item, index) => (
                                <div key={index} className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1"><label htmlFor={`desc-${index}`} className="sr-only">Description</label><div className={controlFrame()}><input id={`desc-${index}`} type="text" placeholder="Full service" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className={controlInput} /></div></div>
                                    <div className="w-32 flex-none sm:w-36"><label htmlFor={`cost-${index}`} className="sr-only">Amount</label><CurrencyInput id={`cost-${index}`} value={item.amountStr} onChange={e => handleItemChange(index, 'amountStr', e.target.value)} /></div>
                                    <IconButton label={`Remove line ${index + 1}`} icon={<TrashIcon />} onClick={() => removeItem(index)} disabled={items.length <= 1} className="hover:text-danger" />
                                </div>
                            ))}
                            <Button type="button" variant="ghost" size="sm" onClick={addItem} icon={<PlusIcon />}>Add line</Button>
                        </div>
                    </div>
                )}

                <div className="border-t border-line pt-3">
                    <Line label="Subtotal"><Money value={shownSubtotal} /></Line>
                    {isVatInvoice && <Line label="VAT (20%)"><Money value={shownVat} /></Line>}
                    <Line total label="Total"><Money value={shownTotal} className="text-lg" /></Line>
                </div>

            </form>
            <footer className="flex flex-none items-center justify-between gap-3 border-t border-line bg-surface p-4">
                <div>
                    {isEditing && (
                        <Button type="button" variant="ghost" onClick={handleDelete} disabled={isSubmitting} icon={<TrashIcon />} className="text-danger hover:bg-danger-soft">
                            Delete invoice
                        </Button>
                    )}
                </div>
                <Button type="submit" form="misc-invoice-form" loading={isSubmitting}>Preview invoice</Button>
            </footer>
        </div>
    );
};

export default MiscInvoiceEditor;