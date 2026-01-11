

import React, { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import { DataContextState, ToDoItem, BusinessDetails, Lead, InboxEmail, EmailTemplate, LeadStage } from '../types';
import * as dataService from '../services/dataService';
import { User, onAuthStateChanged } from '../services/firebase';
import * as syncManager from '../services/syncManager';
import * as google from '../services/google';

export const DataContext = createContext<DataContextState | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode; user: User }> = ({ children, user }) => {
    // Data States
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [receipts, setReceipts] = useState<any[]>([]);
    const [salesDocs, setSalesDocs] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [financeCompanies, setFinanceCompanies] = useState<any[]>([]);
    const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
    const [businessDetails, setBusinessDetails] = useState<BusinessDetails | null>(null);
    const [todos, setTodos] = useState<ToDoItem[]>([]);
    const [workSheets, setWorkSheets] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [miscInvoices, setMiscInvoices] = useState<any[]>([]);
    const [jobInvoices, setJobInvoices] = useState<any[]>([]);
    const [internalJobs, setInternalJobs] = useState<any[]>([]); // Future support
    const [informalVehicles, setInformalVehicles] = useState<any[]>([]);
    const [garageCosts, setGarageCosts] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [canvasItems, setCanvasItems] = useState<any[]>([]);
    const [financialAccounts, setFinancialAccounts] = useState<any[]>([]);
    const [uploadBatches, setUploadBatches] = useState<any[]>([]);

    // CRM States
    const [leads, setLeads] = useState<Lead[]>([]);
    const [inboxEmails, setInboxEmails] = useState<InboxEmail[]>([]);
    const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
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
                        { id: '1', reg: 'YK73 HJT', make: 'BMW', model: '320d M Sport', price: 18500, status: 'Available', days: 12, purchaseDate: '2025-01-15', motDueDate: '2025-06-15' },
                        { id: '2', reg: 'PE72 XYZ', make: 'Audi', model: 'A4 S-Line', price: 22750, status: 'Reserved', days: 5, purchaseDate: '2025-02-01', motDueDate: '2025-08-20' },
                        { id: '3', reg: 'LM71 ABC', make: 'Mercedes', model: 'C200 AMG', price: 24995, status: 'Available', days: 8, purchaseDate: '2025-02-10', motDueDate: '2025-11-05' },
                        { id: '4', reg: 'KX24 MNO', make: 'Land Rover', model: 'Defender 110', price: 68000, status: 'Available', days: 2, purchaseDate: '2025-02-14', motDueDate: '2027-02-14' },
                        { id: '5', reg: 'GL19 PQR', make: 'Volkswagen', model: 'Golf R', price: 29500, status: 'Deposit Paid', days: 15, purchaseDate: '2025-01-12', motDueDate: '2025-05-30' },
                        { id: '6', reg: 'RE23 STU', make: 'Tesla', model: 'Model 3 Perf', price: 34000, status: 'Available', days: 4, purchaseDate: '2025-02-12', motDueDate: '2026-02-12' },
                        { id: '7', reg: 'FD21 VWX', make: 'Ford', model: 'Ranger Wildtrak', price: 28500, status: 'Prep', days: 1, purchaseDate: '2025-02-15', motDueDate: '2025-04-10' },
                        { id: '8', reg: 'AB18 CDE', make: 'BMW', model: 'X5 30d', price: 42000, status: 'Sold', days: 25, purchaseDate: '2024-12-20', motDueDate: '2025-07-22' },
                        { id: '9', reg: 'XY67 ZZZ', make: 'Mini', model: 'Cooper S', price: 12500, status: 'Available', days: 45, purchaseDate: '2024-12-01', motDueDate: '2025-03-15' },
                        { id: '10', reg: 'GH69 JKL', make: 'Audi', model: 'Q7 S-Line', price: 38000, status: 'Available', days: 18, purchaseDate: '2025-01-28', motDueDate: '2025-09-01' },
                        { id: '11', reg: 'JK20 LMN', make: 'Porsche', model: 'Macan S', price: 45000, status: 'Reserved', days: 7, purchaseDate: '2025-02-09', motDueDate: '2025-10-10' },
                        { id: '12', reg: 'OP22 QRS', make: 'Range Rover', model: 'Evoque', price: 31000, status: 'Prep', days: 3, purchaseDate: '2025-02-13', motDueDate: '2025-12-25' },
                    ]);
                    setExpenseCategories([
                        { id: '1', name: 'Parts & Repairs', color: 'bg-blue-500', icon: 'WrenchIcon' },
                        { id: '2', name: 'Fuel', color: 'bg-green-500', icon: 'TruckIcon' },
                        { id: '3', name: 'Transport', color: 'bg-yellow-500', icon: 'MapIcon' },
                        { id: '4', name: 'Vehicle Purchase', color: 'bg-purple-500', icon: 'CarIcon' },
                        { id: '5', name: 'Valeting', color: 'bg-cyan-500', icon: 'SparklesIcon' },
                    ]);
                    setReceipts([
                        { id: '1', date: '2025-02-15', amount: 8750.00, supplier: 'BCA Auction', categoryId: '4', description: 'Purchase of FD21 VWX' },
                        { id: '2', date: '2025-02-14', amount: 234.50, supplier: 'Halfords Trade', categoryId: '1', description: 'Brake Pads & Discs' },
                        { id: '3', date: '2025-02-14', amount: 89.40, supplier: 'Shell Garage', categoryId: '2', description: 'Diesel for Ranger' },
                        { id: '4', date: '2025-02-13', amount: 175.00, supplier: 'RAC Transport', categoryId: '3', description: 'Delivery of RE23 STU' },
                        { id: '5', date: '2025-02-12', amount: 65.00, supplier: 'Tesco Fuel', categoryId: '2', description: 'Unleaded' },
                        { id: '6', date: '2025-02-12', amount: 450.00, supplier: 'Clean Car Co', categoryId: '5', description: 'Full Valet x3' },
                    ]);
                    setTodos([
                        { id: '1', type: 'general', description: 'Call James regarding BMW test drive', isComplete: false, dueDate: '2025-02-16', dueTime: '09:00' },
                        { id: '2', type: 'general', description: 'Submit VAT return for Q4', isComplete: false, dueDate: '2025-02-20' },
                        { id: '3', type: 'prep', vehicleId: '7', description: 'Full Service', isComplete: false, createdAt: Date.now() },
                        { id: '4', type: 'prep', vehicleId: '7', description: 'MOT Test', isComplete: false, createdAt: Date.now() },
                        { id: '5', type: 'prep', vehicleId: '7', description: 'Valet', isComplete: false, createdAt: Date.now() },
                        { id: '6', type: 'prep', vehicleId: '12', description: 'Alloy Wheel Refurb', isComplete: true, createdAt: Date.now() - 86400000 },
                    ]);
                    setLeads([
                        { id: '1', name: 'Sarah Mitchell', email: 'sarah@example.com', phone: '07700 900123', stage: 'Hot', vehicleInterest: 'Audi A4', notes: 'Looking to buy this week', createdAt: Date.now(), activities: [] },
                        { id: '2', name: 'Mark Thompson', email: 'mark@example.com', phone: '07700 900456', stage: 'Warm', vehicleInterest: 'BMW 320d', notes: 'Need to arrange finance', createdAt: Date.now() - 100000, activities: [] },
                        { id: '3', name: 'Emma Davies', email: 'emma@example.com', phone: '07700 900789', stage: 'New', vehicleInterest: 'Mercedes C200', notes: 'Enquired via Autotrader', createdAt: Date.now() - 200000, activities: [] },
                        { id: '4', name: 'David Jones', email: 'david@example.com', phone: '07700 900321', stage: 'Contacted', vehicleInterest: 'Land Rover', notes: 'Left voicemail', createdAt: Date.now() - 300000, activities: [] },
                        { id: '5', name: 'Lucy Smith', email: 'lucy@example.com', phone: '07700 900654', stage: 'New', vehicleInterest: 'Volkswagen Golf', notes: 'Wants a test drive Saturday', createdAt: Date.now() - 400000, activities: [] },
                    ]);
                    setBusinessDetails({
                        companyName: 'YOURCARDEALERSHIP',
                        vatNumber: 'GB123456789',
                        operatingMode: 'dealership',
                        isVatRegistered: true,
                        theme: 'blue'
                    } as any);
                }
                return;
            }

            try {
                setIsLoading(true);
                const cid = await dataService.getCompanyForUser(user);
                if (mounted) setCompanyId(cid);
            } catch (err: any) {
                console.error("Failed to get company:", err);
                if (mounted) setError(err.message || "Failed to load company data.");
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
            dataService.subscribeToCustomers(companyId, setCustomers),
            dataService.subscribeToMiscInvoices(companyId, setMiscInvoices),
            dataService.subscribeToJobInvoices(companyId, setJobInvoices),
            dataService.subscribeToInformalVehicles(companyId, setInformalVehicles),
            dataService.subscribeToGarageCosts(companyId, setGarageCosts),
            dataService.subscribeToSuppliers(companyId, setSuppliers),
            dataService.subscribeToCanvasItems(companyId, setCanvasItems),
            dataService.subscribeToFinancialAccounts(companyId, setFinancialAccounts),
            dataService.subscribeToUploadBatches(companyId, setUploadBatches),
            // CRM Subscriptions
            dataService.subscribeToLeads(companyId, setLeads),
            dataService.subscribeToInboxEmails(companyId, setInboxEmails),
            dataService.subscribeToEmailTemplates(companyId, setEmailTemplates),
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
        inboxEmails,
        emailTemplates,
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
        renameCategory: (id, newName) => dataService.renameCategoryAndUpdateReferences(companyId!, id, newName, receipts, transactions),
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
        addWorkSheet: (data) => dataService.addWorkSheet(companyId!, data),
        updateWorkSheet: (id, data) => dataService.updateWorkSheet(companyId!, id, data),
        deleteWorkSheet: (id) => dataService.deleteWorkSheet(companyId!, id),
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
        addInboxEmail: (data) => dataService.addInboxEmail(companyId!, data),
        updateInboxEmail: (id, data) => dataService.updateInboxEmail(companyId!, id, data),
        deleteInboxEmail: (id) => dataService.deleteInboxEmail(companyId!, id),
        addEmailTemplate: (data) => dataService.addEmailTemplate(companyId!, data),
        updateEmailTemplate: (id, data) => dataService.updateEmailTemplate(companyId!, id, data),
        deleteEmailTemplate: (id) => dataService.deleteEmailTemplate(companyId!, id),
        setSelectedLeadId,
        convertLeadToSale: (leadId, saleData) => dataService.convertLeadToSale(companyId!, leadId, saleData),

        handleGoogleSignIn,
        handleGoogleSignOut,
        refreshGoogleCalendarEvents,
        
        undoSale: (doc) => dataService.undoSale(companyId!, doc, vehicles),
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
    }), [companyId, user.uid, user, googleUser, vehicles, receipts, transactions, financeCompanies, expenseCategories, businessDetails, theme, mergedTodos, workSheets, customers, miscInvoices, salesDocs, jobInvoices, internalJobs, informalVehicles, garageCosts, suppliers, canvasItems, financialAccounts, uploadBatches, leads, inboxEmails, emailTemplates, selectedLeadId, isLoading, error, googleSyncError, googleConnectionMessage, isServiceBusiness, isVatRegistered, refreshGoogleCalendarEvents, handleGoogleSignIn, handleGoogleSignOut]);

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
};