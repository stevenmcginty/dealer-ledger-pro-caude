import React, { useState, useEffect, useMemo } from 'react';
import { Customer, NewCustomer } from '../../types';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { PlusIcon, TrashIcon, EditIcon, ClockIcon } from '../icons';
import { Badge, Button, Checkbox, IconButton, Input } from '../ui';
import { controlFrame, controlInput, cx } from '../ui/cx';
import { SheetBody, SheetFooter, SheetFrame, SheetHeader } from '../crm/SheetParts';
import { formatCurrency } from '../../utils/helpers';

interface CustomerEditorProps {
    customer: Customer | null;
    onSave: (data: NewCustomer | Partial<NewCustomer>, id?: string) => Promise<void>;
    onCancel: () => void;
}

const CustomerEditor: React.FC<CustomerEditorProps> = ({ customer, onSave, onCancel }) => {
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [isBusiness, setIsBusiness] = useState(false);
    const [vatNumber, setVatNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (customer) {
            setName(customer.name);
            setAddress(customer.address);
            setEmail(customer.email || '');
            setPhone(customer.phone || '');
            setIsBusiness(customer.isBusiness || false);
            setVatNumber(customer.vatNumber || '');
        }
    }, [customer]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const data = { name, address, email, phone, isBusiness, vatNumber };
        await onSave(data, customer?.id);
        setIsSubmitting(false);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-card border border-line bg-surface-2 p-4">
            <h3 className="text-base font-bold text-ink">{customer ? 'Edit customer' : 'New customer'}</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input id={`cust-name-${customer?.id ?? 'new'}`} label="Name" value={name} onChange={e => setName(e.target.value)} required wrapperClassName="md:col-span-2" />
                <Input id={`cust-email-${customer?.id ?? 'new'}`} label="Email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} />
                <Input id={`cust-phone-${customer?.id ?? 'new'}`} label="Phone" type="text" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} className="num" />
            </div>
            <div>
                <label htmlFor={`cust-address-${customer?.id ?? 'new'}`} className="mb-1.5 block text-sm font-semibold leading-5 text-ink">Address</label>
                <div className={controlFrame()}>
                    <textarea id={`cust-address-${customer?.id ?? 'new'}`} value={address} onChange={e => setAddress(e.target.value)} required rows={2} className={cx(controlInput, 'resize-y')} />
                </div>
            </div>
            <Checkbox checked={isBusiness} onChange={e => setIsBusiness(e.target.checked)} label="This is a business" />
            {isBusiness && (
                <Input id={`cust-vat-${customer?.id ?? 'new'}`} label="VAT number" value={vatNumber} onChange={e => setVatNumber(e.target.value)} className="num uppercase" wrapperClassName="max-w-xs" />
            )}
            <div className="flex flex-wrap justify-end gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
                <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
                <Button type="submit" loading={isSubmitting}>Save customer</Button>
            </div>
        </form>
    );
};

const CustomerManagerModal = () => {
    const { closeModal, openModal } = useUI();
    const { customers, jobInvoices, addCustomer, updateCustomer, deleteCustomer } = useData();
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    const customerStats = useMemo(() => {
        const stats = new Map<string, { jobCount: number, lifetimeValue: number }>();
        jobInvoices.forEach(invoice => {
            if (invoice.status === 'Invoice') {
                const current = stats.get(invoice.customerId) || { jobCount: 0, lifetimeValue: 0 };
                current.jobCount += 1;
                current.lifetimeValue += invoice.total;
                stats.set(invoice.customerId, current);
            }
        });
        return stats;
    }, [jobInvoices]);

    const handleSave = async (data: NewCustomer | Partial<NewCustomer>, id?: string) => {
        if (id) {
            await updateCustomer(id, data);
        } else {
            await addCustomer(data as NewCustomer);
        }
        setEditingCustomer(null);
        setIsAdding(false);
    };
    
    const handleDelete = (customer: Customer) => {
        if(window.confirm(`Delete ${customer.name}? Their contact details go too. You can't undo this.`)){
            deleteCustomer(customer.id);
        }
    }

    return (
        <SheetFrame className="max-h-[90vh]">
            <SheetHeader
                title="Customers"
                description={`${customers.length} ${customers.length === 1 ? 'person or business' : 'people and businesses'}`}
                onClose={closeModal}
            />
            <SheetBody className="space-y-3">
                {!isAdding && (
                    <Button variant="secondary" block icon={<PlusIcon />} onClick={() => setIsAdding(true)} className="border-dashed">
                        Add a customer
                    </Button>
                )}
                {isAdding && !editingCustomer && <CustomerEditor customer={null} onSave={handleSave} onCancel={() => setIsAdding(false)} />}

                <ul role="list" className="m-0 list-none space-y-2 p-0">
                    {customers.map(c => {
                        const stats = customerStats.get(c.id);
                        return (
                            <li key={c.id}>
                                {editingCustomer?.id === c.id ? (
                                    <CustomerEditor customer={c} onSave={handleSave} onCancel={() => setEditingCustomer(null)} />
                                ) : (
                                    <div className="rounded-card border border-line bg-surface py-3 pe-1 ps-4">
                                        <div className="flex items-start gap-2">
                                            <div className="min-w-0 flex-1 pt-1">
                                                <p className="flex items-center gap-2">
                                                    <span className="truncate text-base font-semibold text-ink">{c.name}</span>
                                                    {c.isBusiness && <Badge size="sm">Business</Badge>}
                                                </p>
                                                <p className="truncate text-sm text-ink-3">{c.address.split('\n')[0]}</p>
                                                {/* How to reach them, at a glance — the list used to show the
                                                    address only, so a contact captured on an invoice was invisible. */}
                                                {(c.email || c.phone) && (
                                                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-2">
                                                        {c.email && <span className="break-all">{c.email}</span>}
                                                        {c.phone && <span className="num">{c.phone}</span>}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex flex-none items-center">
                                                <IconButton label={`History for ${c.name}`} icon={<ClockIcon />} onClick={() => openModal('customerDetailView', c)} />
                                                <IconButton label={`Edit ${c.name}`} icon={<EditIcon />} onClick={() => setEditingCustomer(c)} />
                                                <IconButton label={`Delete ${c.name}`} icon={<TrashIcon />} onClick={() => handleDelete(c)} className="hover:bg-danger-soft hover:text-danger" />
                                            </div>
                                        </div>
                                        {stats && (
                                            <p className="me-3 mt-2 flex items-center gap-4 border-t border-line pt-2 text-sm text-ink-3">
                                                <span>Jobs <span className="num font-semibold text-ink">{stats.jobCount}</span></span>
                                                <span>Lifetime <span className="num font-semibold text-ink">{formatCurrency(stats.lifetimeValue)}</span></span>
                                            </p>
                                        )}
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            </SheetBody>
            <SheetFooter>
                <Button type="button" onClick={closeModal}>Done</Button>
            </SheetFooter>
        </SheetFrame>
    );
};

export default CustomerManagerModal;
