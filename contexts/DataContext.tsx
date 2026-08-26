

import React, { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
    DataContextState, Vehicle, Receipt, SalesDocument, StatementTransaction, FinanceCompany,
    ExpenseCategory, WorkSheet, Customer, MiscInvoice, JobInvoice, InternalJob, InformalVehicle,
    GarageCost, Supplier, CanvasItem, FinancialAccount, UploadBatch, PDI,
    ToDoItem, BusinessDetails, Lead, EmailTemplate, LeadStage, CRMSettings
} from '../types';
import * as dataService from '../services/dataService';
import { User, onAuthStateChanged } from '../services/firebase';
import { readCachedCompanyId } from '../utils/companyCache';
import * as syncManager from '../services/syncManager';
import * as google from '../services/google';

export const DataContext = createContext<DataContextState | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode; user: User }> = ({ children, user }) => {
    // Data States
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [receipts, setReceipts] = useState<Receipt[]>([]);
    const [salesDocs, setSalesDocs] = useState<SalesDocument[]>([]);
    const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
    const [financeCompanies, setFinanceCompanies] = useState<FinanceCompany[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
    const [businessDetails, setBusinessDetails] = useState<BusinessDetails | null>(null);
    const [todos, setTodos] = useState<ToDoItem[]>([]);
    const [workSheets, setWorkSheets] = useState<WorkSheet[]>([]);
    const [pdis, setPdis] = useState<PDI[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [miscInvoices, setMiscInvoices] = useState<MiscInvoice[]>([]);
    const [jobInvoices, setJobInvoices] = useState<JobInvoice[]>([]);
    const [internalJobs, setInternalJobs] = useState<InternalJob[]>([]);
    const [informalVehicles, setInformalVehicles] = useState<InformalVehicle[]>([]);
    const [garageCosts, setGarageCosts] = useState<GarageCost[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
    const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
    const [uploadBatches, setUploadBatches] = useState<UploadBatch[]>([]);

    // CRM States
    const [leads, setLeads] = useState<Lead[]>([]);
    const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
    const [crmSettings, setCrmSettings] = useState<CRMSettings | null>(null);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

    // Loading & Error States
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Google Integration
    const [googleUser, setGoogleUser] = useState<any>(null);
    const [googleTodos, setGoogleTodos] = useState<ToDoItem[]>([]);
    const [googleSyncError, setGoogleSyncError] = useState<string | null>(null);
    const [googleConnectionMessage, setGoogleConnectionMessage] = useState<string | null>(null);

    // 1. Resolve Company ID on mount
    useEffect(() => {
        let mounted = true;
        
        const init = async () => {
            if (user.uid === 'demo') {
                if (mounted) {
                    setCompanyId('demo-company');
                    setIsLoading(false);
                    // Load Mock Data
                    setVehicles([
                        { id: '1', reg: 'AB12 CDE', make: 'Audi', model: 'A4', year: 2019, mileage: 45000, stockNumber: 'S001', purchasePrice: 12500, purchaseDate: '2025-01-15', vatScheme: 'Margin', status: 'Available', ownershipType: 'Owned Stock', createdAt: Date.now() },
                        { id: '2', reg: 'XY55 ZZZ', make: 'BMW', model: '3 Series', year: 2020, mileage: 32000, stockNumber: 'S002', purchasePrice: 15000, purchaseDate: '2025-02-01', vatScheme: 'Margin', status: 'Sold', ownershipType: 'Owned Stock', createdAt: Date.now() },
                        { id: '3', reg: 'GH88 JKL', make: 'Mercedes', model: 'C-Class', year: 2018, mileage: 68000, stockNumber: 'S003', purchasePrice: 18000, purchaseDate: '2025-02-10', vatScheme: 'Margin', status: 'Deposit Paid', ownershipType: 'Owned Stock', createdAt: Date.now() },
                    ]);
                    setExpenseCategories([
                        { id: '1', name: 'Parts', color: 'bg-blue-500', icon: 'WrenchIcon', order: 1 },
                        { id: '2', name: 'Fuel', color: 'bg-green-500', icon: 'TruckIcon', order: 2 },
                        { id: '3', name: 'Transport', color: 'bg-yellow-500', icon: 'MapIcon', order: 3 },
                    ]);
                    setReceipts([
                        { id: '1', vendor: 'Euro Car Parts', amount: 150.00, vat: 25.00, date: '2025-02-15', category: 'Parts', paymentType: 'Direct', status: 'Paid', createdAt: Date.now() },
                        { id: '2', vendor: 'Shell', amount: 65.00, vat: 10.83, date: '2025-02-16', category: 'Fuel', paymentType: 'Direct', status: 'Unpaid', createdAt: Date.now() },
                    ]);
                    setBusinessDetails({
                        name: 'Prestige Motors Ltd',
                        address: '12 Forecourt Road',
                        phone: '01234 567890',
                        email: 'sales@prestigemotors.example',
                        vatNumber: 'GB123456789',
                        companyNumber: '12345678',
                        bankDetails: '',
                        invoiceTerms: 'Payment on collection',
                        theme: 'blue',
                        vatStartDate: '',
                        operatingMode: 'dealership',
                        isVatRegistered: true
                    });
                }
                return;
            }

            try {
                const cached = readCachedCompanyId(user.uid);
                if (cached && mounted) {
                    // Open on last known company immediately so a stalled
                    // websocket never blocks the PWA on a timeout screen.
                    setCompanyId(cached);
                } else if (mounted) {
                    setIsLoading(true);
                }
                const cid = await dataService.getCompanyForUser(user);
                if (mounted) setCompanyId(cid);
            } catch (err: any) {
                console.error("Failed to get company:", err);
                if (!mounted) return;
                if (err?.message === 'ACCOUNT_NOT_LINKED') {
                    setCompanyId(null);
                    setError(err.message);
                    setIsLoading(false);
                    return;
                }
                if (!readCachedCompanyId(user.uid)) {
                    setError(err.message || "Failed to load company data.");
                    setIsLoading(false);
                }
            }
        };
        init();
        return () => { mounted = false; };
    }, [user]);

    // 2. Subscribe to data once Company ID is available
    useEffect(() => {
        if (!companyId || user.uid === 'demo') return;

        // Start listeners
        const unsubs = [
            dataService.subscribeToVehicles(companyId, setVehicles),
            dataService.subscribeToReceipts(companyId, setReceipts),
            dataService.subscribeToSalesDocuments(companyId, setSalesDocs),
            dataService.subscribeToTransactions(companyId, setTransactions),
            dataService.subscribeToFinanceCompanies(companyId, setFinanceCompanies),
            dataService.subscribeToExpenseCategories(companyId, setExpenseCategories),
            dataService.subscribeToBusinessDetails(companyId, setBusinessDetails),
            dataService.subscribeToToDos(companyId, setTodos),
            dataService.subscribeToWorkSheets(companyId, setWorkSheets),
            dataService.subscribeToPdis(companyId, setPdis),
            dataService.subscribeToCustomers(companyId, setCustomers),
            dataService.subscribeToMiscInvoices(companyId, setMiscInvoices),
            dataService.subscribeToJobInvoices(companyId, setJobInvoices),
            dataService.subscribeToInternalJobs(companyId, setInternalJobs),
            dataService.subscribeToInformalVehicles(companyId, setInformalVehicles),
            dataService.subscribeToGarageCosts(companyId, setGarageCosts),
            dataService.subscribeToSuppliers(companyId, setSuppliers),
            dataService.subscribeToCanvasItems(companyId, setCanvasItems),
            dataService.subscribeToFinancialAccounts(companyId, setFinancialAccounts),
            dataService.subscribeToUploadBatches(companyId, setUploadBatches),
            // CRM Subscriptions
            dataService.subscribeToLeads(companyId, setLeads),
            dataService.subscribeToEmailTemplates(companyId, setEmailTemplates),
            dataService.subscribeToCRMSettings(companyId, setCrmSettings),
        ];

        setIsLoading(false);

        return () => {
            unsubs.forEach(unsub => unsub());
        };
    }, [companyId, user.uid]);

    // 3. Initialize Google Client
    useEffect(() => {
        google.initializeGoogleClient(async (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
                setGoogleConnectionMessage("Connected! Syncing...");
                await syncGoogleData();
            }
        }).catch(err => {
            console.error("Failed to init Google Client", err);
            setGoogleSyncError("Google Client failed to initialize.");
        });
        
        // Check if user is already signed in (rudimentary check or profile fetch could go here)
        // For simplicity, we just init the client. Profile fetch happens on sign in.
    }, []);

    const syncGoogleData = async () => {
        try {
            setGoogleSyncError(null);
            const profile = await google.getUserProfile();
            if (profile) setGoogleUser(profile);

            const result = await syncManager.syncWithGoogle();
            setGoogleTodos(result.syncedTodos);
            if (result.error) {
                setGoogleSyncError(result.error); // Non-critical error
            }
            setGoogleConnectionMessage(null);
        } catch (err: any) {
            console.error("Google sync error:", err);
            setGoogleSyncError(err.message || "Failed to sync with Google.");
            setGoogleConnectionMessage(null);
        }
    };

    const handleGoogleSignIn = () => google.requestAccessToken(false);
    
    const handleGoogleSignOut = () => {
        const token = (window as any).gapi?.client?.getToken()?.access_token;
        if(token) google.revokeAccessToken(token);
        google.setGapiToken(null);
        setGoogleUser(null);
        setGoogleTodos([]);
        setGoogleConnectionMessage(null);
    };

    const refreshGoogleCalendarEvents = async () => {
        if(googleUser) await syncGoogleData();
    };

    // Merge local and google todos
    const mergedTodos = useMemo(() => {
        return [...todos, ...googleTodos];
    }, [todos, googleTodos]);

    // Computed Values
    const isServiceBusiness = businessDetails?.operatingMode !== 'dealership';
    const isVatRegistered = !!businessDetails?.isVatRegistered;
    const theme = businessDetails?.theme || 'blue';

    const value: DataContextState = useMemo(() => ({
        user,
        googleUser,
        companyId: companyId!,
        userId: user.uid,
        vehicles,
        receipts,
        allReceipts: receipts,
        transactions,
        financeCompanies,
        expenseCategories,
        businessDetails,
        theme,
        todos: mergedTodos,
        workSheets,
        pdis,
        customers,
        miscInvoices,
        salesDocs,
        jobInvoices,
        internalJobs,
        informalVehicles,
        garageCosts,
        suppliers,
        canvasItems,
        financialAccounts,
        uploadBatches,

        // CRM State
        leads,
        emailTemplates,
        crmSettings,
        selectedLeadId,

        isLoading,
        error,
        googleSyncError,
        googleConnectionMessage,
        isServiceBusiness,
        isVatRegistered,

        // Wrapped Actions
        addVehicle: (data, seller, delivery) => dataService.addVehicle(companyId!, data, seller, delivery),
        updateVehicle: (id, data) => dataService.updateVehicle(companyId!, id, data),
        addReceipt: (data) => dataService.addReceipt(companyId!, data, vehicles.map(v => v.reg)),
        updateReceipt: (id, data) => dataService.updateReceipt(companyId!, id, data),
        deleteReceipt: (id) => dataService.deleteReceipt(companyId!, id),
        addSalesDocument: (data) => dataService.addSalesDocument(companyId!, data),
        updateSalesDocument: (id, data) => dataService.updateSalesDocument(companyId!, id, data),
        deleteSalesDocument: (id) => dataService.deleteSalesDocument(companyId!, id),
        addTransactions: (data) => dataService.addTransactions(companyId!, data),
        updateTransaction: (id, data) => dataService.updateTransaction(companyId!, id, data),
        deleteTransactions: (ids) => dataService.deleteTransactions(companyId!, ids),
        addFinanceCompany: (data) => dataService.addFinanceCompany(companyId!, data),
        addExpenseCategory: (name) => dataService.addExpenseCategory(companyId!, { name, icon: 'TagIcon', color: 'bg-gray-500', order: expenseCategories.length }),
        renameCategory: (id, newName) => dataService.renameCategoryAndUpdateReferences(companyId!, id, newName, receipts, transactions).then(() => true).catch(() => false),
        deleteExpenseCategory: (id) => dataService.deleteExpenseCategory(companyId!, id).then(() => true).catch(() => false),
        updateExpenseCategories: (cats) => dataService.updateExpenseCategories(companyId!, cats),
        updateBusinessDetails: (data) => dataService.updateBusinessDetails(companyId!, data),
        addToDo: (data) => dataService.addToDo(companyId!, data),
        updateToDo: (id, data) => dataService.updateToDo(companyId!, id, data),
        deleteToDo: (id) => dataService.deleteToDo(companyId!, id),
        reclassifyToDo: (id, cat, veh) => dataService.reclassifyToDo(companyId!, id, cat, veh),
        markToDosAsComplete: (ids) => dataService.markToDosAsComplete(companyId!, ids),
        archivePrepTasks: (ids) => dataService.archiveToDos(companyId!, ids),
        unarchivePrepTasks: (ids) => dataService.unarchiveToDos(companyId!, ids),
        addPdi: (data) => dataService.addPdi(companyId!, data),
        updatePdi: (id, data) => dataService.updatePdi(companyId!, id, data),
        deletePdi: (id) => dataService.deletePdi(companyId!, id),
        addWorkSheet: (data) => dataService.addWorkSheet(companyId!, data),
        updateWorkSheet: (id, data) => dataService.updateWorkSheet(companyId!, id, data),
        deleteWorkSheet: (id) => dataService.deleteWorkSheet(companyId!, id),
        addInternalJob: (data) => dataService.addInternalJob(companyId!, data),
        updateInternalJob: (id, data) => dataService.updateInternalJob(companyId!, id, data),
        deleteInternalJob: (id) => dataService.deleteInternalJob(companyId!, id),
        addCustomer: (data) => dataService.addCustomer(companyId!, data),
        updateCustomer: (id, data) => dataService.updateCustomer(companyId!, id, data),
        deleteCustomer: (id) => dataService.deleteCustomer(companyId!, id),
        addMiscInvoice: (data) => dataService.addMiscInvoice(companyId!, data),
        updateMiscInvoice: (id, data) => dataService.updateMiscInvoice(companyId!, id, data),
        deleteMiscInvoice: (id) => dataService.deleteMiscInvoice(companyId!, id),
        addMiscInvoiceAndReconcile: (data, txId) => dataService.addMiscInvoiceAndReconcile(companyId!, data, txId),
        addJobInvoice: (data) => dataService.addJobInvoice(companyId!, data),
        updateJobInvoice: (id, data) => dataService.updateJobInvoice(companyId!, id, data),
        deleteJobInvoice: (id) => dataService.deleteJobInvoice(companyId!, id),
        addInformalVehicle: (data) => dataService.addInformalVehicle(companyId!, data),
        deleteInformalVehicle: (id) => dataService.deleteInformalVehicle(companyId!, id),
        addGarageCost: (data) => dataService.addGarageCost(companyId!, data),
        deleteGarageCost: (id) => dataService.deleteGarageCost(companyId!, id),
        addSupplier: (data) => dataService.addSupplier(companyId!, data),
        updateSupplier: (id, data) => dataService.updateSupplier(companyId!, id, data),
        deleteSupplier: (id) => dataService.deleteSupplier(companyId!, id),
        addCanvasItem: (data) => dataService.addCanvasItem(companyId!, data),
        updateCanvasItem: (id, data) => dataService.updateCanvasItem(companyId!, id, data),
        deleteCanvasItem: (item) => dataService.deleteCanvasItem(companyId!, item),
        addFinancialAccount: (data) => dataService.addFinancialAccount(companyId!, data),
        updateFinancialAccount: (id, data) => dataService.updateFinancialAccount(companyId!, id, data),
        deleteFinancialAccount: (id) => dataService.deleteFinancialAccount(companyId!, id),
        deleteUploadBatch: (id) => dataService.deleteUploadBatch(companyId!, id),

        // CRM Actions
        addLead: (data) => dataService.addLead(companyId!, data),
        updateLead: (id, data) => dataService.updateLead(companyId!, id, data),
        deleteLead: (id) => dataService.deleteLead(companyId!, id),
        updateLeadStage: (id, stage) => dataService.updateLeadStage(companyId!, id, stage),
        addLeadActivity: (leadId, activity) => dataService.addLeadActivity(companyId!, leadId, activity),
        addEmailTemplate: (data) => dataService.addEmailTemplate(companyId!, data),
        updateEmailTemplate: (id, data) => dataService.updateEmailTemplate(companyId!, id, data),
        deleteEmailTemplate: (id) => dataService.deleteEmailTemplate(companyId!, id),
        setSelectedLeadId,
        convertLeadToSale: (leadId, saleData) => dataService.convertLeadToSale(companyId!, leadId, saleData),
        updateCRMSettings: (data) => dataService.updateCRMSettings(companyId!, data),

        handleGoogleSignIn,
        handleGoogleSignOut,
        refreshGoogleCalendarEvents,
        
        undoSale: (doc) => dataService.undoSale(companyId!, doc, vehicles, salesDocs),
        undoDeposit: (doc) => dataService.undoDeposit(companyId!, doc, todos),
        undoReconciliation: (tx) => dataService.undoReconciliation(companyId!, tx, miscInvoices, receipts),
        reconcileTransactionFromSuggestion: (txId, match) => dataService.reconcileTransactionFromSuggestion(companyId!, txId, match),
        reconcilePaymentWithMultipleReceipts: (txId, rIds) => dataService.reconcilePaymentWithMultipleReceipts(companyId!, txId, rIds),
        reconcilePaymentWithAdjustment: (txId, rIds, amt) => dataService.reconcilePaymentWithAdjustment(companyId!, txId, rIds, amt),
        reconcileSalePayment: (txId, docId, payment) => dataService.reconcileSalePayment(companyId!, txId, docId, payment),
        reconcileMiscInvoicePayment: (txId, invId) => dataService.reconcileMiscInvoicePayment(companyId!, txId, invId),
        reconcileJobInvoicePayment: (txId, invId, payment) => dataService.reconcileJobInvoicePayment(companyId!, txId, invId, payment),
        markReceiptsAsPaid: (ids) => dataService.markReceiptsAsPaid(companyId!, ids),
        deleteReceiptFileOnly: (id) => dataService.deleteReceiptFileOnly(companyId!, id),
        convertQuoteToInvoice: (quoteId) => dataService.convertQuoteToInvoice(companyId!, quoteId),
        tryAutoReconciliation: (receipt) => dataService.tryAutoReconciliation(companyId!, receipt, transactions),
        clearAllCompanyData: () => dataService.clearAllCompanyData(companyId!),
        resequenceStockNumbers: () => dataService.resequenceStockNumbers(companyId!, vehicles),
        deleteDataAndFilesByCategories: (categories) => dataService.deleteDataAndFilesByCategories(companyId!, user.uid, categories),
        batchArchiveDelete: (items) => dataService.batchArchiveDelete(companyId!, items),
        batchRestore: (manifest) => dataService.batchRestore(companyId!, manifest),
    }), [companyId, user.uid, user, googleUser, vehicles, receipts, transactions, financeCompanies, expenseCategories, businessDetails, theme, mergedTodos, workSheets, pdis, customers, miscInvoices, salesDocs, jobInvoices, internalJobs, informalVehicles, garageCosts, suppliers, canvasItems, financialAccounts, uploadBatches, leads, emailTemplates, crmSettings, selectedLeadId, isLoading, error, googleSyncError, googleConnectionMessage, isServiceBusiness, isVatRegistered, refreshGoogleCalendarEvents, handleGoogleSignIn, handleGoogleSignOut]);

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
};