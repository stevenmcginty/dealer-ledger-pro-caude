

import React from 'react';
import { Vehicle, SalesDocument, DocumentType, PDI } from '../../types';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { XMarkIcon, EditIcon, UndoIcon, DocumentTextIcon, ShieldCheckIcon } from '../icons';

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
        className={`w-full text-left p-4 text-sm font-medium rounded-lg transition-colors flex items-center gap-3 ${className}`}
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
            <header className="p-4 border-b border-gray-700 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-white">Actions for {vehicle.reg}</h2>
                    <p className="text-sm text-gray-400">{vehicle.make} {vehicle.model}</p>
                </div>
                <button onClick={closeModal} className="p-1 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white">
                    <XMarkIcon className="h-6 w-6" />
                </button>
            </header>
            <div className="p-4 space-y-2">
                <ActionButton onClick={onEditClick} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                    <EditIcon className="h-5 w-5" />
                    <span>Edit Vehicle Details</span>
                </ActionButton>

                {latestPdi ? (
                    <>
                        <ActionButton onClick={() => onViewPdiClick(latestPdi)} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                            <ShieldCheckIcon className="h-5 w-5 text-emerald-400" />
                            <span>View PDI #{latestPdi.pdiNumber}</span>
                        </ActionButton>
                        <ActionButton onClick={onNewPdiClick} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                            <ShieldCheckIcon className="h-5 w-5 text-emerald-400" />
                            <span>New PDI</span>
                        </ActionButton>
                    </>
                ) : (
                    <ActionButton onClick={onNewPdiClick} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                        <ShieldCheckIcon className="h-5 w-5 text-emerald-400" />
                        <span>Create PDI</span>
                    </ActionButton>
                )}

                {vehicle.status === 'Available' && (
                    <>
                        {salesDoc && (
                            <>
                                <p className="text-xs text-yellow-300">This vehicle is in stock but still has a sales invoice attached — it will show as sold in reports.</p>
                                <ActionButton onClick={() => onViewDocClick(salesDoc)} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                    <DocumentTextIcon className="h-5 w-5 text-green-400" />
                                    <span>View Sales Invoice</span>
                                </ActionButton>
                                <ActionButton onClick={() => onUndoClick(salesDoc)} className="bg-red-900/50 hover:bg-red-800 text-red-300">
                                    <UndoIcon className="h-5 w-5" />
                                    <span>Remove Stray Sales Invoice</span>
                                </ActionButton>
                            </>
                        )}
                        <ActionButton onClick={() => onActionClick('Deposit Slip')} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                            <DocumentTextIcon className="h-5 w-5 text-cyan-400" />
                            <span>Create Deposit Slip</span>
                        </ActionButton>
                        {proformaDoc ? (
                            <>
                                <ActionButton onClick={() => onViewDocClick(proformaDoc)} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                    <DocumentTextIcon className="h-5 w-5 text-yellow-400" />
                                    <span>View Proforma</span>
                                </ActionButton>
                                <ActionButton onClick={() => onEditDocClick(proformaDoc)} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                    <EditIcon className="h-5 w-5" />
                                    <span>Edit Proforma</span>
                                </ActionButton>
                            </>
                        ) : (
                            <ActionButton onClick={() => onActionClick('Proforma Invoice')} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                <DocumentTextIcon className="h-5 w-5 text-yellow-400" />
                                <span>Create Proforma</span>
                            </ActionButton>
                        )}
                        <ActionButton onClick={() => onActionClick('Sales Invoice')} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                           <DocumentTextIcon className="h-5 w-5 text-green-400" />
                           <span>Create Sales Invoice</span>
                        </ActionButton>
                    </>
                )}

                {vehicle.status === 'Deposit Paid' && (
                    <>
                        {depositDoc && (
                             <ActionButton onClick={() => onViewDocClick(depositDoc)} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                <DocumentTextIcon className="h-5 w-5 text-cyan-400" />
                                <span>View Deposit Slip</span>
                            </ActionButton>
                        )}
                        {depositDoc && (
                             <ActionButton onClick={() => onEditDocClick(depositDoc)} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                <EditIcon className="h-5 w-5" />
                                <span>Edit Deposit Slip</span>
                            </ActionButton>
                        )}
                        {proformaDoc ? (
                            <>
                                <ActionButton onClick={() => onViewDocClick(proformaDoc)} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                    <DocumentTextIcon className="h-5 w-5 text-yellow-400" />
                                    <span>View Proforma</span>
                                </ActionButton>
                                <ActionButton onClick={() => onEditDocClick(proformaDoc)} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                    <EditIcon className="h-5 w-5" />
                                    <span>Edit Proforma</span>
                                </ActionButton>
                            </>
                        ) : (
                            <ActionButton onClick={() => onActionClick('Proforma Invoice')} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                <DocumentTextIcon className="h-5 w-5 text-yellow-400" />
                                <span>Create Proforma</span>
                            </ActionButton>
                        )}
                        <ActionButton onClick={() => onActionClick('Sales Invoice')} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                            <DocumentTextIcon className="h-5 w-5 text-green-400" />
                            <span>Finalise Sale</span>
                        </ActionButton>
                        {depositDoc && (
                             <ActionButton onClick={() => onUndoDepositClick(depositDoc)} className="bg-red-900/50 hover:bg-red-800 text-red-300">
                                <UndoIcon className="h-5 w-5" />
                                <span>Undo Deposit</span>
                            </ActionButton>
                        )}
                    </>
                )}

                {vehicle.status === 'Sold' && (
                     <>
                        {salesDoc ? (
                             <>
                                <ActionButton onClick={() => onViewDocClick(salesDoc)} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                    <DocumentTextIcon className="h-5 w-5 text-green-400" />
                                    <span>View Sales Invoice</span>
                                </ActionButton>
                                <ActionButton onClick={() => onEditDocClick(salesDoc)} className="bg-gray-700/50 hover:bg-gray-700 text-white">
                                    <EditIcon className="h-5 w-5" />
                                    <span>Edit Sales Invoice</span>
                                </ActionButton>
                                <ActionButton onClick={() => onUndoClick(salesDoc)} className="bg-red-900/50 hover:bg-red-800 text-red-300">
                                    <UndoIcon className="h-5 w-5" />
                                    <span>Undo Sale</span>
                                </ActionButton>
                            </>
                        ) : (
                            <ActionButton onClick={() => onForceUndoClick(vehicle)} className="bg-yellow-900/50 hover:bg-yellow-800 text-yellow-300">
                                <UndoIcon className="h-5 w-5" />
                                <span>Fix Sale Status</span>
                            </ActionButton>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default VehicleActionsModal;