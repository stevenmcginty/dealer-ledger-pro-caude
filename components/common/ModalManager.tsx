


import React, { useMemo } from 'react';
import { useUI } from '../../hooks/useUI';
import { useData } from '../../hooks/useData';
import { SalesDocument, Vehicle, NewVehicle, VehicleUpdate, NewReceipt, ReceiptUpdate, NewSalesDocument, SalesDocumentUpdate, StatementTransaction, StatementTransactionUpdate, NewWorkSheet, NewMiscInvoice, Receipt, MiscInvoiceUpdate, WorkSheet, JobInvoice, NewJobInvoice, JobInvoiceUpdate, WorkSheetUpdate } from '../../types';
import * as dataService from '../../services/dataService';

// Import Modal/Editor Components
import Modal from './Modal';
import VehicleEditor from '../stock/VehicleEditor';
import ExpenseEditor from '../expenses/ExpenseEditor';
import DocumentCreator from '../sales/DocumentCreator';
import CategoryAllocator from '../expenses/CategoryAllocator';
import UploadProgress from './UploadProgress';
import PrintableView from '../sales/PrintableView';
import MultiReceiptReconciler from '../expenses/MultiReceiptReconciler';
import CategoryManager from '../expenses/CategoryManager';
import WorkSheetEditor from '../work-sheets/WorkSheetEditor';
import PrintableWorkSheet from '../work-sheets/PrintableWorkSheet';
import MiscInvoiceEditor from '../income/MiscInvoiceEditor';
import IncomeAllocatorModal from '../income/IncomeAllocatorModal';
import AddInformalVehicleModal from '../garage/AddInformalVehicleModal';
import AddGarageCostModal from '../garage/AddGarageCostModal';
import ConfirmClearDataModal from './ConfirmClearDataModal';
import UndoSaleConfirmModal from './UndoSaleConfirmModal';
import UndoDepositConfirmModal from './UndoDepositConfirmModal';
import DeleteTodoConfirmModal from './DeleteTodoConfirmModal';
import ArchivePrepConfirmModal from './DeletePrepConfirmModal';
import UnarchivePrepConfirmModal from './UnarchivePrepConfirmModal';
import AssignInvoiceModal from '../filing-cabinet/AssignInvoiceModal';
import BulkDeleteConfirmModal from './BulkDeleteConfirmModal';
import SupplierEditorModal from '../settings/SupplierEditorModal';
import CanvasItemModal from '../canvas/CanvasItemModal';
import ForceUndoSaleConfirmModal from './ForceUndoSaleConfirmModal';
import VehicleActionsModal from '../stock/VehicleActionsModal';
import ToDoEditor from '../todo/ToDoEditor';
import DeleteMiscInvoiceConfirmModal from './DeleteMiscInvoiceConfirmModal';
import TransactionAllocatorModal from './TransactionAllocatorModal';
import MarkMonthPaidConfirmModal from './MarkMonthPaidConfirmModal';
import ResequenceConfirmModal from './ResequenceConfirmModal';
import DeleteUploadConfirmModal from './DeleteUploadConfirmModal';
import CustomerManagerModal from '../customers/CustomerManagerModal';
import JobInvoiceEditor from '../invoicing/JobInvoiceEditor';
import PrintableJobInvoice from '../invoicing/PrintableJobInvoice';
import CustomerDetailView from '../customers/CustomerDetailView';
import DeleteWorkSheetConfirmModal from './DeleteWorkSheetConfirmModal';
import BulkReceiptWizard from '../expenses/BulkReceiptWizard';
import ArchiveDrawer from '../filing-cabinet/ArchiveModal';
import RestoreDrawer from '../filing-cabinet/RestoreModal';
import LeadForm from '../crm/LeadForm';
import AddNoteModal from '../crm/AddNoteModal';
import LogCallModal from '../crm/LogCallModal';
import CreateLeadFromEmailModal from '../crm/CreateLeadFromEmailModal';
import EmailComposer from '../crm/EmailComposer';
import AddTestEmailModal from '../crm/AddTestEmailModal';
import ConvertToSaleModal from '../crm/ConvertToSaleModal';
import StatementMappingWizard from '../expenses/StatementMappingWizard';

const DeleteJobInvoiceConfirmModal = ({ invoice }: { invoice: JobInvoice }) => {
    const { deleteJobInvoice } = useData();
    const { closeModal } = useUI();
    
    const handleConfirm = () => {
        deleteJobInvoice(invoice.id);
        closeModal();
    }

    return (
        <div className="p-6 text-center">
            <h3 className="mt-4 text-lg font-semibold text-white">Delete Invoice</h3>
            <p className="mt-2 text-sm text-gray-400">Are you sure you want to delete invoice #{invoice.invoiceNumber}?</p>
            <div className="mt-6 flex justify-center gap-4">
                <button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-600 rounded-md">Cancel</button>
                <button onClick={handleConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md">Delete</button>
            </div>
        </div>
    );
};


const ModalManager = () => {
    const { modal, closeModal, openModal } = useUI();
    const data = useData();
    const { companyId, userId } = data;

    if (!modal || !companyId || !userId) return null;

    const handleVehicleSubmit = async (formData: NewVehicle | VehicleUpdate, id?: string, sellerDetails?: { name: string; address: string }, deliveryDetails?: any) => {
        if (id) {
            await data.updateVehicle(id, formData as VehicleUpdate);
        } else {
            await data.addVehicle(formData as NewVehicle, sellerDetails, deliveryDetails);
        }
        closeModal();
    };
    
    const handleExpenseSubmit = async (formData: NewReceipt | ReceiptUpdate, id?: string) => {
        if (id) {
            await data.updateReceipt(id, formData as ReceiptUpdate);
        } else {
            const newId = await data.addReceipt(formData as NewReceipt);
            const addedReceipt = { ...formData, id: newId, status: 'Unpaid' } as Receipt;
            await data.tryAutoReconciliation(addedReceipt);
        }
        closeModal();
    };

    const handleSalesDocSubmit = async (formData: NewSalesDocument | SalesDocumentUpdate, id?: string) => {
        if (id) {
            await data.updateSalesDocument(id, formData as SalesDocumentUpdate);
        } else {
            // Check if this is a lead conversion (opened from ConvertToSaleModal)
            const leadContext = modal?.data?.leadContext;
            if (leadContext?.leadId) {
                // Use convertLeadToSale to create sale AND update lead status
                await data.convertLeadToSale(leadContext.leadId, formData as NewSalesDocument);
            } else {
                await data.addSalesDocument(formData as NewSalesDocument);
            }
        }
        closeModal();
    };

    const handleTxUpdate = async (id: string, updates: StatementTransactionUpdate) => {
        await data.updateTransaction(id, updates);
        closeModal();
    };

     const handleMultiReconcile = async (txId: string, receiptIds: string[]) => {
        await data.reconcilePaymentWithMultipleReceipts(txId, receiptIds);
        closeModal();
    };

    const handleReconcileWithAdjustment = async (txId: string, receiptIds: string[], transactionAmount: number) => {
        await data.reconcilePaymentWithAdjustment(txId, receiptIds, transactionAmount);
        closeModal();
    };

    const handleOpenAllocatorFromMulti = (tx: StatementTransaction) => {
        closeModal();
        openModal('categoryAllocator', tx);
    };

    const handleWorkSheetSubmit = async (formData: NewWorkSheet | WorkSheetUpdate, id?: string) => {
        if (id) {
            await data.updateWorkSheet(id, formData as WorkSheetUpdate);
        } else {
            await data.addWorkSheet(formData as NewWorkSheet);
        }
        closeModal();
    };
    
    const handleMiscInvoiceSubmit = async (formData: NewMiscInvoice | MiscInvoiceUpdate, id?: string, transactionId?: string) => {
        if (id) {
            await data.updateMiscInvoice(id, formData as MiscInvoiceUpdate);
        } else if (transactionId) {
            await data.addMiscInvoiceAndReconcile(formData as NewMiscInvoice, transactionId);
        } else {
            await data.addMiscInvoice(formData as NewMiscInvoice);
        }
        closeModal();
    };
    
    const handleJobInvoiceSubmit = async (formData: NewJobInvoice | JobInvoiceUpdate, id?: string) => {
        if (id) {
            await data.updateJobInvoice(id, formData as JobInvoiceUpdate);
        } else {
            await data.addJobInvoice(formData as NewJobInvoice);
        }
        closeModal();
    };

    const vehiclesWithoutInvoice = useMemo(() => data.vehicles.filter(v => !v.invoiceUrl), [data.vehicles]);

    const handleAssignInvoice = async (vehicleId: string, file: File) => {
        if (!companyId || !userId || !vehicleId || !file) return;
        const invoiceUrl = await dataService.uploadFile(companyId, userId, file, 'invoices');
        await data.updateVehicle(vehicleId, { invoiceUrl });
        closeModal();
    };


    const renderModalContent = () => {
        switch (modal.type) {
            case 'vehicle': 
                return <VehicleEditor vehicles={data.vehicles} companyId={companyId} userId={userId} onSubmit={handleVehicleSubmit} onClear={closeModal} editingVehicle={modal.data || null} prefillData={modal.data?.prefillData} imageFile={modal.data?.imageFile} addReceipt={data.addReceipt} />;
            case 'expense': 
                return <ExpenseEditor companyId={companyId} userId={userId} onSubmit={handleExpenseSubmit} onClear={closeModal} editingReceipt={modal.data || null} prefillData={modal.data?.prefillData} imageFile={modal.data?.imageFile} categories={data.expenseCategories} allReceipts={data.allReceipts} />;
            case 'invoice': {
                if (modal.data?.viewOnly && modal.data?.document) {
                    let docForView = modal.data.document as SalesDocument;
                    
                    if (!docForView.carDetails) {
                        const vehicleForDoc = data.vehicles.find(v => v.id === docForView.vehicleId);
                        if (vehicleForDoc) {
                            const { id, createdAt, status, ...carDetails } = vehicleForDoc;
                            docForView = { ...docForView, carDetails };
                        } else {
                            docForView = { ...docForView, carDetails: {} as any };
                        }
                    }
                    
                    return <PrintableView document={docForView} businessDetails={data.businessDetails} onClose={closeModal} />;
                }
                const priorDeposit = modal.data.docType === 'Sales Invoice' ? data.salesDocs.find(d => d.vehicleId === modal.data.vehicle.id && d.documentType === 'Deposit Slip') : null;
                return <DocumentCreator companyId={companyId} onSubmit={handleSalesDocSubmit} onCancel={closeModal} vehicle={modal.data.vehicle} documentType={modal.data.docType} priorDeposit={priorDeposit} financeCompanies={data.financeCompanies} businessDetails={data.businessDetails} prefillData={modal.data.prefillData} />;
            }
            case 'editInvoice': {
                const docToEdit = modal.data as SalesDocument;
                
                // Ensure vehicleForDoc matches Vehicle interface
                const vehicleForDoc = docToEdit.carDetails 
                    ? { ...docToEdit.carDetails, id: docToEdit.vehicleId, status: 'Sold' as const, createdAt: 0 } as Vehicle 
                    : data.vehicles.find(v => v.id === docToEdit.vehicleId);

                if (!vehicleForDoc) {
                    return <div className="p-6 text-center"><h3 className="text-lg font-semibold text-white">Error</h3><p className="mt-2 text-sm text-gray-400">Could not find vehicle for this document.</p><div className="mt-6"><button onClick={closeModal} className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md">Close</button></div></div>;
                }
                return <DocumentCreator companyId={companyId} onSubmit={handleSalesDocSubmit} onCancel={closeModal} editingDocument={docToEdit} vehicle={vehicleForDoc} documentType={docToEdit.documentType} priorDeposit={null} financeCompanies={data.financeCompanies} businessDetails={data.businessDetails} />;
            }
            case 'jobInvoice': {
                 if (modal.data?.viewOnly && modal.data?.invoice) {
                    return <PrintableJobInvoice invoice={modal.data.invoice} businessDetails={data.businessDetails} onClose={closeModal} />;
                }
                return <JobInvoiceEditor onSubmit={handleJobInvoiceSubmit} onCancel={closeModal} editingInvoice={modal.data?.editingInvoice || null} businessDetails={data.businessDetails} />;
            }
            case 'transactionAllocator':
                return <TransactionAllocatorModal transaction={modal.data} />;
            case 'categoryAllocator': 
                return <CategoryAllocator transaction={modal.data} onUpdate={handleTxUpdate} onClose={closeModal} categories={data.expenseCategories} onAddCategory={data.addExpenseCategory} onReorderCategories={data.updateExpenseCategories} />;
            case 'incomeAllocator': 
                return <IncomeAllocatorModal transaction={modal.data} onUpdate={handleTxUpdate} onClose={closeModal} />;
            case 'multiReconciler': 
                return <MultiReceiptReconciler transaction={modal.data.transaction} receipts={modal.data.receipts} onReconcile={handleMultiReconcile} onReconcileWithAdjustment={handleReconcileWithAdjustment} onClose={closeModal} onCategorizeManually={handleOpenAllocatorFromMulti} />;
            case 'progress': 
                return <UploadProgress progress={modal.data || { step: 'parsing', message: 'Starting...'}} onClose={closeModal} />;
            case 'categoryManager': 
                return <CategoryManager categories={data.expenseCategories} onClose={closeModal} onRename={data.renameCategory} onDelete={data.deleteExpenseCategory} />;
            case 'customerManager':
                return <CustomerManagerModal />;
            case 'customerDetailView':
                return <CustomerDetailView customer={modal.data} />;
            case 'workSheet': {
                if (modal.data?.viewOnly && modal.data?.sheet) {
                    let sheetForView = modal.data.sheet as WorkSheet;
                    if (!sheetForView.carDetails) {
                        const vehicleForSheet = data.vehicles.find(v => v.id === sheetForView.vehicleId);
                        if (vehicleForSheet) {
                            const { id, createdAt, status, ...carDetails } = vehicleForSheet;
                            sheetForView = { ...sheetForView, carDetails };
                        } else {
                            sheetForView = { ...sheetForView, carDetails: {} as any };
                        }
                    }
                    return <PrintableWorkSheet sheet={sheetForView} businessDetails={data.businessDetails} onClose={closeModal} />;
                }
                return <WorkSheetEditor 
                            vehicles={data.vehicles} 
                            businessDetails={data.businessDetails} 
                            onSubmit={handleWorkSheetSubmit} 
                            onCancel={closeModal}
                            editingSheet={modal.data?.editingSheet || null}
                        />;
            }
            case 'deleteWorkSheetConfirm':
                return <DeleteWorkSheetConfirmModal sheet={modal.data} />;
            case 'miscInvoice': 
                return <MiscInvoiceEditor companyId={companyId} transaction={modal.data?.transaction} customers={data.customers} businessDetails={data.businessDetails} onSubmit={handleMiscInvoiceSubmit} onClose={closeModal} />;
            case 'editMiscInvoice':
                return <MiscInvoiceEditor companyId={companyId} editingInvoice={modal.data} customers={data.customers} businessDetails={data.businessDetails} onSubmit={handleMiscInvoiceSubmit} onClose={closeModal} />;
            case 'deleteMiscInvoiceConfirm':
                return <DeleteMiscInvoiceConfirmModal invoice={modal.data} />;
            case 'deleteJobInvoiceConfirm':
                return <DeleteJobInvoiceConfirmModal invoice={modal.data} />;
            case 'addInformalVehicle': 
                return <AddInformalVehicleModal />;
            case 'addGarageCost': 
                return <AddGarageCostModal vehicleReg={modal.data.reg} />;
            case 'assignInvoice':
                return <AssignInvoiceModal vehicles={vehiclesWithoutInvoice} onSubmit={handleAssignInvoice} onClose={closeModal} />;
            case 'bulkDeleteConfirm':
                return <BulkDeleteConfirmModal count={modal.data.count} itemType={modal.data.itemType} onConfirm={modal.data.onConfirm} onClose={closeModal} />;
            case 'supplier':
                return <SupplierEditorModal editingSupplier={modal.data || null} />;
            case 'canvasItem':
                return <CanvasItemModal item={modal.data} />;
            case 'vehicleActions':
                return <VehicleActionsModal data={modal.data} />;
            case 'todo':
                return <ToDoEditor type={modal.data.type} editingTodo={modal.data.editingTodo} prefillData={modal.data.prefillData} />;
            case 'confirmClearData': 
                return <ConfirmClearDataModal />;
            case 'undoSaleConfirm': 
                return <UndoSaleConfirmModal document={modal.data} />;
            case 'undoDepositConfirm':
                return <UndoDepositConfirmModal document={modal.data} />;
            case 'forceUndoSaleConfirm':
                return <ForceUndoSaleConfirmModal vehicle={modal.data} />;
            case 'deleteTodoConfirm': 
                return <DeleteTodoConfirmModal todo={modal.data} />;
            case 'archivePrepConfirm':
                return <ArchivePrepConfirmModal vehicle={modal.data.vehicle} tasks={modal.data.tasks} />;
            case 'unarchivePrepConfirm':
                return <UnarchivePrepConfirmModal data={modal.data} />;
            case 'markMonthPaidConfirm':
                return <MarkMonthPaidConfirmModal data={modal.data} />;
            case 'resequenceConfirm':
                return <ResequenceConfirmModal onConfirm={modal.data.onConfirm} onClose={closeModal} />;
            case 'deleteUploadConfirm':
                return <DeleteUploadConfirmModal batch={modal.data} />;
            case 'bulkReceiptWizard':
                return <BulkReceiptWizard files={modal.data.files} onClose={closeModal} companyId={companyId} userId={userId} expenseCategories={data.expenseCategories} allReceipts={data.allReceipts} onAddReceipt={data.addReceipt} />;
            case 'archiveDrawer':
                return <ArchiveDrawer items={modal.data} onClose={closeModal} companyId={companyId} />;
            case 'restoreDrawer':
                return <RestoreDrawer onClose={closeModal} companyId={companyId} userId={userId} />;
            case 'lead':
                return <LeadForm lead={modal.data?.editingLead} onClose={closeModal} />;
            case 'addNote':
                return <AddNoteModal lead={modal.data.lead} onClose={closeModal} />;
            case 'logCall':
                return <LogCallModal lead={modal.data.lead} onClose={closeModal} />;
            case 'createLeadFromEmail':
                return <CreateLeadFromEmailModal email={modal.data.email} onClose={closeModal} />;
            case 'emailComposer':
                return <EmailComposer email={modal.data?.email} lead={modal.data?.lead} replyTo={modal.data?.replyTo} onClose={closeModal} />;
            case 'addTestEmail':
                return <AddTestEmailModal onClose={closeModal} />;
            case 'convertToSale':
                return <ConvertToSaleModal lead={modal.data.lead} onClose={closeModal} />;
            case 'statementMapping':
                return <StatementMappingWizard account={modal.data.account} csvText={modal.data.csvText} file={modal.data.file} />;
            default:
                return null;
        }
    };
    
    const modalSize = () => {
        switch(modal.type) {
            case 'invoice':
            case 'editInvoice':
            case 'workSheet':
            case 'jobInvoice':
            case 'customerDetailView':
            case 'bulkReceiptWizard':
                return '2xl';
            case 'canvasItem':
                return '4xl';
            case 'vehicleActions':
                return 'sm';
            case 'todo':
            case 'customerManager':
            case 'archiveDrawer':
            case 'restoreDrawer':
            case 'lead':
            case 'addNote':
            case 'logCall':
            case 'createLeadFromEmail':
            case 'addTestEmail':
            case 'convertToSale':
                return 'lg';
            case 'emailComposer':
            case 'statementMapping':
                return '2xl';
            default:
                return 'lg';
        }
    }
    
    const content = renderModalContent();
    if (!content) return null;

    return (
        <Modal onClose={closeModal} size={modalSize()}>
            {content}
        </Modal>
    );
};

export default ModalManager;