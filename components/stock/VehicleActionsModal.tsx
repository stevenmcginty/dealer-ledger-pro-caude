

import React from 'react';
import { Vehicle, SalesDocument, DocumentType, PDI } from '../../types';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { PanelHeader } from './parts';
import { EditIcon, UndoIcon, DocumentTextIcon, ShieldCheckIcon } from '../icons';

interface VehicleActionsModalProps {
    data: {
        vehicle: Vehicle;
        depositDoc?: SalesDocument;
        salesDoc?: SalesDocument;
        proformaDoc?: SalesDocument;
    };
}

type ActionButtonProps = {
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
};

const ActionButton: React.FC<ActionButtonProps> = ({ onClick, children, className = '' }) => (
    <button
        onClick={onClick}
        className={`flex min-h-[56px] w-full items-center gap-3 rounded-control px-4 text-start text-base font-semibold transition-colors duration-quick ease-out active:bg-surface-3 ${className}`}
    >
        {children}
    </button>
);

const VehicleActionsModal = ({ data }: VehicleActionsModalProps) => {
    const { openModal, closeModal } = useUI();
    const { pdis } = useData();
    const { vehicle, depositDoc, salesDoc, proformaDoc } = data;

    // The most recent inspection for this car, if there is one. Looked up here
    // rather than passed in, so every caller of this modal gets it for free.
    const latestPdi: PDI | undefined = (pdis as PDI[])
        .filter(pdi => pdi.vehicleId === vehicle.id)
        .sort((a, b) => (b.inspectionDate || '').localeCompare(a.inspectionDate || '') || (b.createdAt || 0) - (a.createdAt || 0))[0];

    const handleAction = (action: () => void) => {
        closeModal(); // Close this modal first
        action(); // Then execute the action (which might open another modal)
    };

    const onEditClick = () => handleAction(() => openModal('vehicle', vehicle));
    const onActionClick = (docType: DocumentType) => handleAction(() => openModal('invoice', { vehicle, docType }));
    const onViewDocClick = (doc: SalesDocument) => handleAction(() => openModal('invoice', { viewOnly: true, document: doc }));
    const onEditDocClick = (doc: SalesDocument) => handleAction(() => openModal('editInvoice', doc));
    const onUndoClick = (doc: SalesDocument) => handleAction(() => openModal('undoSaleConfirm', doc));
    const onUndoDepositClick = (doc: SalesDocument) => handleAction(() => openModal('undoDepositConfirm', doc));
    const onForceUndoClick = (veh: Vehicle) => handleAction(() => openModal('forceUndoSaleConfirm', veh));
    const onNewPdiClick = () => handleAction(() => openModal('pdi', { vehicle }));
    const onViewPdiClick = (pdi: PDI) => handleAction(() => openModal('pdi', { viewOnly: true, pdi }));

    return (
        <div className="w-full">
            <PanelHeader title={<>Car <span className="num">#{vehicle.stockNumber}</span></>} subtitle={`${vehicle.reg} · ${vehicle.make} ${vehicle.model}`} onClose={closeModal} />
            <div className="space-y-1 p-2">
                <ActionButton onClick={onEditClick} className="text-ink hover:bg-surface-2">
                    <EditIcon className="h-5 w-5 text-ink-2" />
                    <span>Edit car details</span>
                </ActionButton>

                {latestPdi ? (
                    <>
                        <ActionButton onClick={() => onViewPdiClick(latestPdi)} className="text-ink hover:bg-surface-2">
                            <ShieldCheckIcon className="h-5 w-5 text-ink-2" />
                            <span>View PDI #{latestPdi.pdiNumber}</span>
                        </ActionButton>
                        <ActionButton onClick={onNewPdiClick} className="text-ink hover:bg-surface-2">
                            <ShieldCheckIcon className="h-5 w-5 text-ink-2" />
                            <span>New PDI</span>
                        </ActionButton>
                    </>
                ) : (
                    <ActionButton onClick={onNewPdiClick} className="text-ink hover:bg-surface-2">
                        <ShieldCheckIcon className="h-5 w-5 text-ink-2" />
                        <span>Start PDI</span>
                    </ActionButton>
                )}

                {vehicle.status === 'Available' && (
                    <>
                        {salesDoc && (
                            <>
                                <p className="px-4 py-2 text-sm font-semibold text-warning-ink">This vehicle is in stock but still has a sales invoice attached — it will show as sold in reports.</p>
                                <ActionButton onClick={() => onViewDocClick(salesDoc)} className="text-ink hover:bg-surface-2">
                                    <DocumentTextIcon className="h-5 w-5 text-ink-2" />
                                    <span>View sales invoice</span>
                                </ActionButton>
                                <ActionButton onClick={() => onUndoClick(salesDoc)} className="text-danger hover:bg-danger-soft">
                                    <UndoIcon className="h-5 w-5" />
                                    <span>Remove stray sales invoice</span>
                                </ActionButton>
                            </>
                        )}
                        <ActionButton onClick={() => onActionClick('Deposit Slip')} className="text-ink hover:bg-surface-2">
                            <DocumentTextIcon className="h-5 w-5 text-ink-2" />
                            <span>Take a deposit</span>
                        </ActionButton>
                        {proformaDoc ? (
                            <>
                                <ActionButton onClick={() => onViewDocClick(proformaDoc)} className="text-ink hover:bg-surface-2">
                                    <DocumentTextIcon className="h-5 w-5 text-ink-2" />
                                    <span>View proforma</span>
                                </ActionButton>
                                <ActionButton onClick={() => onEditDocClick(proformaDoc)} className="text-ink hover:bg-surface-2">
                                    <EditIcon className="h-5 w-5 text-ink-2" />
                                    <span>Edit proforma</span>
                                </ActionButton>
                            </>
                        ) : (
                            <ActionButton onClick={() => onActionClick('Proforma Invoice')} className="text-ink hover:bg-surface-2">
                                <DocumentTextIcon className="h-5 w-5 text-ink-2" />
                                <span>Make a proforma</span>
                            </ActionButton>
                        )}
                        <ActionButton onClick={() => onActionClick('Sales Invoice')} className="text-ink hover:bg-surface-2">
                           <DocumentTextIcon className="h-5 w-5 text-ink-2" />
                           <span>Sell this car</span>
                        </ActionButton>
                    </>
                )}

                {vehicle.status === 'Deposit Paid' && (
                    <>
                        {depositDoc && (
                             <ActionButton onClick={() => onViewDocClick(depositDoc)} className="text-ink hover:bg-surface-2">
                                <DocumentTextIcon className="h-5 w-5 text-ink-2" />
                                <span>View deposit slip</span>
                            </ActionButton>
                        )}
                        {depositDoc && (
                             <ActionButton onClick={() => onEditDocClick(depositDoc)} className="text-ink hover:bg-surface-2">
                                <EditIcon className="h-5 w-5 text-ink-2" />
                                <span>Edit deposit slip</span>
                            </ActionButton>
                        )}
                        {proformaDoc ? (
                            <>
                                <ActionButton onClick={() => onViewDocClick(proformaDoc)} className="text-ink hover:bg-surface-2">
                                    <DocumentTextIcon className="h-5 w-5 text-ink-2" />
                                    <span>View proforma</span>
                                </ActionButton>
                                <ActionButton onClick={() => onEditDocClick(proformaDoc)} className="text-ink hover:bg-surface-2">
                                    <EditIcon className="h-5 w-5 text-ink-2" />
                                    <span>Edit proforma</span>
                                </ActionButton>
                            </>
                        ) : (
                            <ActionButton onClick={() => onActionClick('Proforma Invoice')} className="text-ink hover:bg-surface-2">
                                <DocumentTextIcon className="h-5 w-5 text-ink-2" />
                                <span>Make a proforma</span>
                            </ActionButton>
                        )}
                        <ActionButton onClick={() => onActionClick('Sales Invoice')} className="text-ink hover:bg-surface-2">
                            <DocumentTextIcon className="h-5 w-5 text-ink-2" />
                            <span>Finish sale</span>
                        </ActionButton>
                        {depositDoc && (
                             <ActionButton onClick={() => onUndoDepositClick(depositDoc)} className="text-danger hover:bg-danger-soft">
                                <UndoIcon className="h-5 w-5" />
                                <span>Undo deposit</span>
                            </ActionButton>
                        )}
                    </>
                )}

                {vehicle.status === 'Sold' && (
                     <>
                        {salesDoc ? (
                             <>
                                <ActionButton onClick={() => onViewDocClick(salesDoc)} className="text-ink hover:bg-surface-2">
                                    <DocumentTextIcon className="h-5 w-5 text-ink-2" />
                                    <span>View sales invoice</span>
                                </ActionButton>
                                <ActionButton onClick={() => onEditDocClick(salesDoc)} className="text-ink hover:bg-surface-2">
                                    <EditIcon className="h-5 w-5 text-ink-2" />
                                    <span>Edit sales invoice</span>
                                </ActionButton>
                                <ActionButton onClick={() => onUndoClick(salesDoc)} className="text-danger hover:bg-danger-soft">
                                    <UndoIcon className="h-5 w-5" />
                                    <span>Undo sale</span>
                                </ActionButton>
                            </>
                        ) : (
                            <ActionButton onClick={() => onForceUndoClick(vehicle)} className="text-warning-ink bg-warning-soft hover:bg-warning-soft">
                                <UndoIcon className="h-5 w-5" />
                                <span>Fix sale status</span>
                            </ActionButton>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default VehicleActionsModal;