import React from 'react';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { PlusIcon, TruckIcon } from '../icons';
import { Button, EmptyState, ListRow } from '../ui';
import { Panel, PanelSection } from './SettingsKit';

const SupplierManagement = () => {
    const { suppliers } = useData();
    const { openModal } = useUI();

    return (
        <Panel ariaLabel="Suppliers">
            <PanelSection
                title="On-account suppliers"
                description="Bank lines that mention a supplier’s words are matched to it, so one payment can clear several invoices."
                action={<Button variant="secondary" icon={<PlusIcon />} onClick={() => openModal('supplier')}>Add supplier</Button>}
            />
            {suppliers.length > 0 ? (
                <ul className="m-0 list-none p-0">
                    {suppliers.map(supplier => (
                        <li key={supplier.id} className="[&>*]:px-4 sm:[&>*]:px-5 [&:last-child>*]:rounded-b-card [&:last-child>*]:border-b-0">
                            <ListRow
                                title={supplier.name}
                                meta={supplier.reconciliationKeys?.length ? `Matches: ${supplier.reconciliationKeys.join(', ')}` : 'No match words yet'}
                                onClick={() => openModal('supplier', supplier)}
                            />
                        </li>
                    ))}
                </ul>
            ) : (
                <EmptyState
                    icon={<TruckIcon />}
                    title="No suppliers yet"
                    description="Add a supplier you pay on account, with the words their bank lines use. Matching then happens on its own."
                    actionLabel="Add supplier"
                    onAction={() => openModal('supplier')}
                />
            )}
        </Panel>
    );
};

export default SupplierManagement;
