
// ... existing imports
import { db, storage, auth } from './firebase';
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';
import 'firebase/compat/storage';
import {
    Vehicle, NewVehicle, VehicleUpdate, Receipt, NewReceipt, ReceiptUpdate, SalesDocument,
    NewSalesDocument, StatementTransaction, NewStatementTransaction, StatementTransactionUpdate,
    FinanceCompany, NewFinanceCompany, ExpenseCategory, NewExpenseCategory, SalesDocumentUpdate,
    BusinessDetails, ToDoItem, NewToDoItem, ToDoItemUpdate, WorkSheet, NewWorkSheet, Customer,
    NewCustomer, MiscInvoice, NewMiscInvoice, Payment, InformalVehicle, NewInformalVehicle,
    GarageCost, NewGarageCost, Supplier, NewSupplier, SupplierUpdate, CanvasItem, NewCanvasItem,
    CanvasItemUpdate, MiscInvoiceUpdate, FinancialAccount, NewFinancialAccount, UploadBatch,
    JobInvoice, NewJobInvoice, JobInvoiceUpdate, WorkSheetUpdate,
    Lead, NewLead, LeadUpdate, LeadStage, Activity, InboxEmail, NewInboxEmail, InboxEmailUpdate,
    EmailTemplate, NewEmailTemplate, EmailTemplateUpdate,
    ScheduledAutoResponse, NewScheduledAutoResponse, ScheduledAutoResponseUpdate, AutoRepliedEmail
} from '../types';
import { robustDateParser, isWithinDays, generateStockNumber, toYYYYMMDD } from '../utils/helpers';
import type { User } from './firebase';
import Papa from 'papaparse';

// --- Multi-tenancy Refs ---
const companyRoot = (companyId: string) => `companies/${companyId}`;
export const FOLDER_ROOTS = (companyId: string) => ({
    vehicles: `${companyRoot(companyId)}/vehicles`,
    receipts: `${companyRoot(companyId)}/receipts`,
    salesDocuments: `${companyRoot(companyId)}/salesDocuments`,
    transactions: `${companyRoot(companyId)}/transactions`,
    financeCompanies: `${companyRoot(companyId)}/financeCompanies`,
    expenseCategories: `${companyRoot(companyId)}/expenseCategories`,
    businessDetails: `${companyRoot(companyId)}/businessDetails`,
    todos: `${companyRoot(companyId)}/todos`,
    workSheets: `${companyRoot(companyId)}/workSheets`,
    customers: `${companyRoot(companyId)}/customers`,
    miscInvoices: `${companyRoot(companyId)}/miscInvoices`,
    jobInvoices: `${companyRoot(companyId)}/jobInvoices`,
    informalVehicles: `${companyRoot(companyId)}/informalVehicles`,
    garageCosts: `${companyRoot(companyId)}/garageCosts`,
    canvas: `${companyRoot(companyId)}/canvas`,
    suppliers: `${companyRoot(companyId)}/suppliers`,
    financialAccounts: `${companyRoot(companyId)}/financialAccounts`,
    uploadBatches: `${companyRoot(companyId)}/uploadBatches`,
    // CRM Collections
    leads: `${companyRoot(companyId)}/leads`,
    inboxEmails: `${companyRoot(companyId)}/inboxEmails`,
    emailTemplates: `${companyRoot(companyId)}/emailTemplates`,
    // Auto-Response Collections
    scheduledResponses: `${companyRoot(companyId)}/scheduledResponses`,
    autoRepliedEmails: `${companyRoot(companyId)}/autoRepliedEmails`,
    crmSettings: `${companyRoot(companyId)}/crmSettings`,
});

// --- User & Company Management ---

const getCompanySeedData = (companyName: string): any => {
    const categoriesToSeed: NewExpenseCategory[] = [
        { name: 'Fuel', icon: 'FuelIcon', color: 'bg-orange-500', order: 0 },
        { name: 'Repairs', icon: 'WrenchScrewdriverIcon', color: 'bg-sky-500', order: 1 },
        { name: 'Auction Fees', icon: 'BanknotesIcon', color: 'bg-indigo-500', order: 2},
        { name: 'Transport', icon: 'CarIcon', color: 'bg-pink-500', order: 3 },
        { name: 'Insurance', icon: 'DocumentTextIcon', color: 'bg-teal-500', order: 4 },
        { name: 'Subscriptions', icon: 'CreditCardIcon', color: 'bg-purple-500', order: 5 },
        { name: 'Credit Card Payment', icon: 'BanknotesIcon', color: 'bg-emerald-500', order: 6 },
        { name: 'Miscellaneous Income', icon: 'BanknotesIcon', color: 'bg-green-500', order: 7 },
        { name: 'SOR Payout', icon: 'BanknotesIcon', color: 'bg-violet-500', order: 8},
        { name: 'Vehicle Purchase', icon: 'CarIcon', color: 'bg-rose-500', order: 9 },
        { name: 'Other', icon: 'TagIcon', color: 'bg-gray-500', order: 10 },
    ];
    
    const expenseCategories: { [key: string]: NewExpenseCategory } = {};
    categoriesToSeed.forEach(cat => {
        const catKey = db.ref().push().key;
        if (catKey) {
            expenseCategories[catKey] = cat;
        }
    });

    return {
        businessDetails: { 
            name: companyName, 
            address: "123 Main Street\nTownsville\nTS1 1AA", 
            theme: 'blue', 
            isVatRegistered: false, 
            operatingMode: 'dealership' 
        },
        expenseCategories,
    };
};

export const provisionAccountForNewUser = async (adminUser: User, newUserUid: string, newUserEmail: string): Promise<void> => {
    // The new user's own UID will become their companyId.
    const companyId = newUserUid; 

    const updates: { [key: string]: any } = {};

    // 1. Create the user-to-company link
    updates[`users/${newUserUid}`] = { companyId, email: newUserEmail };
    
    // 2. Create the company record with metadata
    updates[`companies/${companyId}/meta`] = {
        ownerUid: newUserUid,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        provisionedBy: adminUser.uid,
    };

    // 3. Add the new user as a member of their own company
    updates[`companies/${companyId}/users/${newUserUid}`] = true;

    // 4. Seed the new company with default data
    const seedData = getCompanySeedData(newUserEmail.split('@')[0] + "'s Business");
    updates[`companies/${companyId}/businessDetails`] = seedData.businessDetails;
    updates[`companies/${companyId}/expenseCategories`] = seedData.expenseCategories;

    // Execute all writes in a single atomic operation.
    // This is allowed because the security rules now grant the admin permission.
    await db.ref().update(updates);
};


export const getCompanyForUser = async (user: User): Promise<string> => {
    const userRef = db.ref(`users/${user.uid}`);
    const userSnap = await userRef.get();

    if (userSnap.exists() && userSnap.val().companyId) {
        return userSnap.val().companyId;
    } else {
        // Instead of auto-provisioning, we throw a specific error
        // that the UI can catch to show the "Account Not Linked" screen.
        throw new Error('ACCOUNT_NOT_LINKED');
    }
};


// This function can be used by any "repair" mechanisms in the settings.
export const linkNewUser = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) throw new Error("No authenticated user found. Please sign out and sign in again.");
    // This is now an admin function. We pass the admin user and the new user's details.
    // This function itself is deprecated in favor of the more explicit `provisionAccountForNewUser`.
    // Keeping it for now to avoid breaking existing calls, but it should be removed.
    // For now, it will fail as it doesn't have the new user's UID.
    console.warn("linkNewUser is deprecated and will not function correctly. Use provisionAccountForNewUser.");
};


// --- Generic Helpers ---
export const handleSnapshot = <T,>(snapshot: firebase.database.DataSnapshot, sortFn?: (a: T, b: T) => number): T[] => {
    if (!snapshot.exists()) return [];
    const data = snapshot.val();
    if (typeof data !== 'object' || data === null) {
      console.warn(`Data at path ${snapshot.ref.toString()} is not an object, returning empty array. Value:`, data);
      return [];
    }
    const arr = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    if (sortFn) arr.sort(sortFn);
    return arr as T[];
};

const createSubscription = <T,>(path: string, cb: (data: T[]) => void, sortFn?: (a: T, b: T) => number) => {
    const dataRef = db.ref(path);
    const itemsMap = new Map<string, T>();
    let initialLoadDone = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const rebuildAndNotify = () => {
        // Debounce during initial child_added burst to avoid 100s of re-renders
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const arr = Array.from(itemsMap.values());
            if (sortFn) arr.sort(sortFn);
            cb(arr);
        }, initialLoadDone ? 0 : 50);
    };

    // Use ONLY child listeners — no .once('value') which double-downloads everything.
    // child_added fires once for each existing child (initial load), then for new ones.
    const onAdd = dataRef.on('child_added', (snap) => {
        if (snap.key) {
            itemsMap.set(snap.key, { id: snap.key, ...snap.val() } as T);
            rebuildAndNotify();
        }
    });

    const onChange = dataRef.on('child_changed', (snap) => {
        if (snap.key) {
            itemsMap.set(snap.key, { id: snap.key, ...snap.val() } as T);
            rebuildAndNotify();
        }
    });

    const onRemove = dataRef.on('child_removed', (snap) => {
        if (snap.key) {
            itemsMap.delete(snap.key);
            rebuildAndNotify();
        }
    });

    // Mark initial load done after a short delay (all child_added events fire synchronously)
    setTimeout(() => { initialLoadDone = true; }, 100);

    return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        dataRef.off('child_added', onAdd);
        dataRef.off('child_changed', onChange);
        dataRef.off('child_removed', onRemove);
    };
};

// --- Subscriptions ---
export const subscribeToVehicles = (companyId: string, cb: (data: Vehicle[]) => void) => createSubscription<Vehicle>(FOLDER_ROOTS(companyId).vehicles, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToReceipts = (companyId: string, cb: (data: Receipt[]) => void) => createSubscription<Receipt>(FOLDER_ROOTS(companyId).receipts, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToSalesDocuments = (companyId: string, cb: (data: SalesDocument[]) => void) => createSubscription<SalesDocument>(FOLDER_ROOTS(companyId).salesDocuments, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToTransactions = (companyId: string, cb: (data: StatementTransaction[]) => void) => createSubscription<StatementTransaction>(FOLDER_ROOTS(companyId).transactions, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToFinanceCompanies = (companyId: string, cb: (data: FinanceCompany[]) => void) => createSubscription<FinanceCompany>(FOLDER_ROOTS(companyId).financeCompanies, cb, (a, b) => a.name.localeCompare(b.name));
export const subscribeToExpenseCategories = (companyId: string, cb: (data: ExpenseCategory[]) => void) => createSubscription<ExpenseCategory>(FOLDER_ROOTS(companyId).expenseCategories, cb);
export const subscribeToBusinessDetails = (companyId: string, cb: (data: BusinessDetails | null) => void) => {
    const detailsRef = db.ref(FOLDER_ROOTS(companyId).businessDetails);
    const listener = (s: firebase.database.DataSnapshot) => cb(s.exists() ? s.val() : null);
    detailsRef.on('value', listener);
    return () => detailsRef.off('value', listener);
}
export const subscribeToToDos = (companyId: string, cb: (data: ToDoItem[]) => void) => createSubscription<ToDoItem>(FOLDER_ROOTS(companyId).todos, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToWorkSheets = (companyId: string, cb: (data: WorkSheet[]) => void) => createSubscription<WorkSheet>(FOLDER_ROOTS(companyId).workSheets, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToCustomers = (companyId: string, cb: (data: Customer[]) => void) => createSubscription<Customer>(FOLDER_ROOTS(companyId).customers, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToMiscInvoices = (companyId: string, cb: (data: MiscInvoice[]) => void) => createSubscription<MiscInvoice>(FOLDER_ROOTS(companyId).miscInvoices, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToJobInvoices = (companyId: string, cb: (data: JobInvoice[]) => void) => createSubscription<JobInvoice>(FOLDER_ROOTS(companyId).jobInvoices, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToInformalVehicles = (companyId: string, cb: (data: InformalVehicle[]) => void) => createSubscription<InformalVehicle>(FOLDER_ROOTS(companyId).informalVehicles, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToGarageCosts = (companyId: string, cb: (data: GarageCost[]) => void) => createSubscription<GarageCost>(FOLDER_ROOTS(companyId).garageCosts, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToCompanyUsers = (companyId: string, cb: (data: { [uid: string]: { email: string } }) => void) => {
    const usersRef = db.ref(`companies/${companyId}/users`);
    const listener = (s: firebase.database.DataSnapshot) => cb(s.exists() ? s.val() : {});
    usersRef.on('value', listener);
    return () => usersRef.off('value', listener);
};
export const subscribeToSuppliers = (companyId: string, cb: (data: Supplier[]) => void) => createSubscription<Supplier>(FOLDER_ROOTS(companyId).suppliers, cb, (a, b) => a.name.localeCompare(b.name));
export const subscribeToCanvasItems = (companyId: string, cb: (data: CanvasItem[]) => void) => createSubscription<CanvasItem>(FOLDER_ROOTS(companyId).canvas, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToFinancialAccounts = (companyId: string, cb: (data: FinancialAccount[]) => void) => createSubscription<FinancialAccount>(FOLDER_ROOTS(companyId).financialAccounts, cb, (a, b) => a.name.localeCompare(b.name));
export const subscribeToUploadBatches = (companyId: string, cb: (data: UploadBatch[]) => void) => createSubscription<UploadBatch>(FOLDER_ROOTS(companyId).uploadBatches, cb, (a, b) => b.uploadedAt - a.uploadedAt);

// CRM Subscriptions
export const subscribeToLeads = (companyId: string, cb: (data: Lead[]) => void) => createSubscription<Lead>(FOLDER_ROOTS(companyId).leads, cb, (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
export const subscribeToInboxEmails = (companyId: string, cb: (data: InboxEmail[]) => void) => createSubscription<InboxEmail>(FOLDER_ROOTS(companyId).inboxEmails, cb, (a, b) => b.createdAt - a.createdAt);
export const subscribeToEmailTemplates = (companyId: string, cb: (data: EmailTemplate[]) => void) => createSubscription<EmailTemplate>(FOLDER_ROOTS(companyId).emailTemplates, cb, (a, b) => a.name.localeCompare(b.name));


// --- Write Operations ---
export const addVehicle = async (
    companyId: string, 
    data: NewVehicle, 
    sellerDetails?: { name: string; address: string },
    deliveryDetails?: { amount: number; vat: number; vendor: string; date: string; } | null
) => {
    const roots = FOLDER_ROOTS(companyId);
    const newVehicleKey = db.ref(roots.vehicles).push().key;
    if (!newVehicleKey) throw new Error("Failed to create key for new vehicle.");

    const updates: { [key: string]: any } = {};
    updates[`${roots.vehicles}/${newVehicleKey}`] = { ...data, status: 'Available', createdAt: firebase.database.ServerValue.TIMESTAMP };

    if (sellerDetails && sellerDetails.name && sellerDetails.address) {
        const newDocKey = db.ref(roots.salesDocuments).push().key;
        if (!newDocKey) throw new Error("Failed to create key for purchase invoice.");
        const carDetailsForDoc: Omit<Vehicle, 'id' | 'createdAt' | 'status'> = { ...data };
        const purchaseInvoice: NewSalesDocument = {
            invoiceNumber: data.stockNumber, documentType: 'Purchase Invoice', invoiceDate: data.purchaseDate,
            vehicleId: newVehicleKey, stockNumber: data.stockNumber, vatScheme: data.vatScheme,
            customerName: sellerDetails.name, customerAddress: sellerDetails.address, carDetails: carDetailsForDoc,
            price: data.purchasePrice, subtotal: data.purchasePrice, payments: [{ method: 'Bank Transfer', amount: data.purchasePrice }],
            pxValue: 0, balance: 0, vat: 0,
        };
        updates[`${roots.salesDocuments}/${newDocKey}`] = { ...purchaseInvoice, createdAt: firebase.database.ServerValue.TIMESTAMP };
    }

    if (deliveryDetails && deliveryDetails.amount > 0) {
        const newReceiptKey = db.ref(roots.receipts).push().key;
        if (!newReceiptKey) throw new Error("Failed to create key for delivery receipt.");
        
        const deliveryReceipt: NewReceipt = {
            vendor: deliveryDetails.vendor,
            amount: deliveryDetails.amount,
            vat: deliveryDetails.vat,
            date: deliveryDetails.date,
            category: 'Transport', // A sensible default
            paymentType: 'Direct',
            vehicleId: newVehicleKey,
        };
        updates[`${roots.receipts}/${newReceiptKey}`] = { ...deliveryReceipt, status: 'Unpaid', createdAt: firebase.database.ServerValue.TIMESTAMP };
    }

    return db.ref().update(updates);
};
export const updateVehicle = async (companyId: string, id: string, data: VehicleUpdate) => db.ref(`${FOLDER_ROOTS(companyId).vehicles}/${id}`).update(data);

export const deleteVehiclePurchaseInvoice = async (companyId: string, vehicleId: string) => {
    const vehicleRef = db.ref(`${FOLDER_ROOTS(companyId).vehicles}/${vehicleId}`);
    const vehicleSnap = await vehicleRef.get();
    if (!vehicleSnap.exists()) {
        console.warn(`Vehicle with ID ${vehicleId} not found.`);
        return;
    }

    const vehicle = vehicleSnap.val();
    const invoiceUrl = vehicle.invoiceUrl;

    if (!invoiceUrl) return; // No file to delete

    // 1. Delete file from storage
    try {
        const fileRef = storage.refFromURL(invoiceUrl);
        await fileRef.delete();
    } catch (error) {
        console.error(`Failed to delete vehicle invoice file from storage: ${invoiceUrl}`, error);
    }
    
    await vehicleRef.update({ invoiceUrl: null });
};

export const addReceipt = async (companyId: string, data: NewReceipt, allRegs?: string[]): Promise<string> => {
    const roots = FOLDER_ROOTS(companyId);
    const newReceiptRef = db.ref(roots.receipts).push();
    const newReceiptId = newReceiptRef.key;
    if (!newReceiptId) throw new Error("Failed to get key for new receipt");

    const updates: { [key: string]: any } = {};
    updates[`${roots.receipts}/${newReceiptId}`] = { ...data, status: 'Unpaid', createdAt: firebase.database.ServerValue.TIMESTAMP };

    // Check if the vendor contains a known vehicle registration and create a garage cost
    if (allRegs && allRegs.length > 0) {
        const vendorLower = data.vendor.toLowerCase().replace(/\s/g, '');
        const matchedReg = allRegs.find(reg => vendorLower.includes(reg.toLowerCase().replace(/\s/g, '')));
        
        if (matchedReg) {
            const newGarageCostKey = db.ref(roots.garageCosts).push().key;
            if (newGarageCostKey) {
                const newCost: NewGarageCost = {
                    vehicleReg: matchedReg,
                    description: `From receipt: ${data.vendor}`,
                    amount: data.amount,
                    receiptId: newReceiptId,
                };
                updates[`${roots.garageCosts}/${newGarageCostKey}`] = { ...newCost, createdAt: firebase.database.ServerValue.TIMESTAMP };
            }
        }
    }
    
    await db.ref().update(updates);
    return newReceiptId;
};
export const updateReceipt = async (companyId: string, id: string, data: ReceiptUpdate) => db.ref(`${FOLDER_ROOTS(companyId).receipts}/${id}`).update(data);
export const deleteReceipt = async (companyId: string, receiptId: string) => {
    const roots = FOLDER_ROOTS(companyId);
    const receiptRef = db.ref(`${roots.receipts}/${receiptId}`);
    const receiptSnap = await receiptRef.get();
    if (!receiptSnap.exists()) {
        console.warn(`Receipt with ID ${receiptId} not found for deletion.`);
        return;
    }

    const receipt = receiptSnap.val();
    const receiptUrl = receipt.receiptUrl;

    const updates: { [key: string]: null } = {};
    updates[`${roots.receipts}/${receiptId}`] = null;

    // Unlink from any associated garage costs
    const costsRef = db.ref(roots.garageCosts);
    const costsSnap = await costsRef.get();
    if (costsSnap.exists()) {
        const costsData = costsSnap.val();
        for (const costId in costsData) {
            if (costsData[costId].receiptId === receiptId) {
                updates[`${roots.garageCosts}/${costId}/receiptId`] = null;
            }
        }
    }

    await db.ref().update(updates);

    if (receiptUrl) {
        try {
            const fileRef = storage.refFromURL(receiptUrl);
            await fileRef.delete();
        } catch (error) {
            // Log error but don't fail the whole operation, DB entry is gone.
            console.error(`Failed to delete file from storage: ${receiptUrl}`, error);
        }
    }
};

export const deleteReceiptFileOnly = async (companyId: string, receiptId: string) => {
    const roots = FOLDER_ROOTS(companyId);
    const receiptRef = db.ref(`${roots.receipts}/${receiptId}`);
    const receiptSnap = await receiptRef.get();
    if (!receiptSnap.exists()) {
        console.warn(`Receipt with ID ${receiptId} not found for file deletion.`);
        return;
    }

    const receipt = receiptSnap.val();
    const receiptUrl = receipt.receiptUrl;

    if (!receiptUrl) return; // No file to delete

    // 1. Delete file from storage
    try {
        const fileRef = storage.refFromURL(receiptUrl);
        await fileRef.delete();
    } catch (error) {
        console.error(`Failed to delete receipt file from storage: ${receiptUrl}`, error);
        // We'll continue to unlink from DB even if a broken link.
    }
    
    // 2. Remove URL from receipt record
    await receiptRef.update({ receiptUrl: null });
};


export const addSalesDocument = async (companyId: string, data: NewSalesDocument) => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};
    const vehicleSnap = await db.ref(`${roots.vehicles}/${data.vehicleId}`).get();
    if (!vehicleSnap.exists()) throw new Error("Vehicle not found for sale.");
    const vehicle: Vehicle = vehicleSnap.val();
    
    const newDocKey = db.ref(roots.salesDocuments).push().key;
    if (!newDocKey) throw new Error("Failed to generate a key for the sales document.");
    
    let docData = { ...data };
    
    if (vehicle.ownershipType === 'Sale or Return' && vehicle.sorOwner && data.documentType === 'Sales Invoice') {
        const newReceiptKey = db.ref(roots.receipts).push().key;
        if (!newReceiptKey) throw new Error("Failed to generate key for SOR payable receipt.");
        
        const payableReceipt: NewReceipt = {
            vendor: vehicle.sorOwner.name, amount: vehicle.purchasePrice, date: data.invoiceDate,
            category: 'SOR Payout', vat: 0, paymentType: 'On Account', salesDocumentId: newDocKey,
        };
        updates[`${roots.receipts}/${newReceiptKey}`] = { ...payableReceipt, status: 'Unpaid', createdAt: firebase.database.ServerValue.TIMESTAMP };
        docData.sorPayableReceiptId = newReceiptKey;
    }

    updates[`${roots.salesDocuments}/${newDocKey}`] = { ...docData, createdAt: firebase.database.ServerValue.TIMESTAMP };
    
    let status: Vehicle['status'] = 'Sold';
    if (data.documentType === 'Deposit Slip') status = 'Deposit Paid';
    updates[`${roots.vehicles}/${data.vehicleId}/status`] = status;
    
    if (data.documentType === 'Sales Invoice' && data.pxValue > 0 && data.partExchangeDetails) {
        const pxVehicleKey = db.ref(roots.vehicles).push().key;
        if (!pxVehicleKey) throw new Error("Failed to generate a key for the part-exchange vehicle.");
        const newVehicleData: Omit<Vehicle, 'id'> = {
            reg: data.partExchangeDetails.reg, make: data.partExchangeDetails.make, model: data.partExchangeDetails.model,
            year: data.partExchangeDetails.year || new Date().getFullYear(), mileage: data.partExchangeDetails.mileage || 0,
            vin: data.partExchangeDetails.vin || '', purchasePrice: data.pxValue, purchaseDate: data.invoiceDate,
            vatScheme: 'Margin', status: 'Available', ownershipType: 'Owned Stock', stockNumber: generateStockNumber(),
            createdAt: firebase.database.ServerValue.TIMESTAMP as any,
        };
        updates[`${roots.vehicles}/${pxVehicleKey}`] = newVehicleData;
    }

    const notes = data.additionalNotes;
    if ((data.documentType === 'Deposit Slip' || data.documentType === 'Sales Invoice') && notes) {
        notes.split('\n').filter(task => task.trim() !== '').forEach(taskDescription => {
            const newToDoKey = db.ref(roots.todos).push().key;
            if(newToDoKey) {
                updates[`${roots.todos}/${newToDoKey}`] = {
                    vehicleId: data.vehicleId, 
                    vehicleReg: data.carDetails.reg, 
                    description: taskDescription.trim(),
                    isComplete: false, 
                    priority: 'high',
                    type: 'prep',
                    origin: data.documentType === 'Deposit Slip' ? 'deposit' : 'invoice',
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                };
            }
        });
    }

    return db.ref().update(updates);
};
export const updateSalesDocument = async (companyId: string, id: string, data: SalesDocumentUpdate) => db.ref(`${FOLDER_ROOTS(companyId).salesDocuments}/${id}`).update(data);
export const deleteSalesDocument = async (companyId: string, id: string) => db.ref(`${FOLDER_ROOTS(companyId).salesDocuments}/${id}`).remove();

export const addFinanceCompany = async (companyId: string, data: NewFinanceCompany) => db.ref(FOLDER_ROOTS(companyId).financeCompanies).push().set(data);

export const addTransactions = async (companyId: string, data: NewStatementTransaction[]): Promise<string[]> => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: {[key: string]: any} = {};
    const newKeys: string[] = [];
    data.forEach(tx => {
        const k = db.ref(roots.transactions).push().key;
        if (k) {
            updates[`${roots.transactions}/${k}`] = {...tx, createdAt: firebase.database.ServerValue.TIMESTAMP};
            newKeys.push(k);
        }
    });
    await db.ref().update(updates);
    return newKeys;
};
export const updateTransaction = async (companyId: string, id: string, data: StatementTransactionUpdate) => db.ref(`${FOLDER_ROOTS(companyId).transactions}/${id}`).update(data);
export const deleteTransactions = async (companyId: string, transactionIds: string[]) => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: null } = {};
    transactionIds.forEach(id => {
        updates[`${roots.transactions}/${id}`] = null;
    });
    if (Object.keys(updates).length > 0) {
        return db.ref().update(updates);
    }
};


export const addExpenseCategory = async (companyId: string, data: NewExpenseCategory) => db.ref(FOLDER_ROOTS(companyId).expenseCategories).push().set(data);
export const updateExpenseCategories = async (companyId: string, categories: ExpenseCategory[]) => { const updates: {[key: string]: any} = {}; categories.forEach(c => { updates[`${c.id}/order`] = c.order; }); await db.ref(FOLDER_ROOTS(companyId).expenseCategories).update(updates); };
export const deleteExpenseCategory = async (companyId: string, id: string) => db.ref(`${FOLDER_ROOTS(companyId).expenseCategories}/${id}`).remove();

export const updateBusinessDetails = async (companyId: string, data: BusinessDetails) => db.ref(FOLDER_ROOTS(companyId).businessDetails).set(data);

export const renameCategoryAndUpdateReferences = async (companyId: string, categoryId: string, newName: string, receipts: Receipt[], transactions: StatementTransaction[]): Promise<void> => {
    const roots = FOLDER_ROOTS(companyId);
    const oldCategorySnap = await db.ref(`${roots.expenseCategories}/${categoryId}`).get();
    if (!oldCategorySnap.exists()) { throw new Error("Category to rename not found."); }
    const oldName = oldCategorySnap.val().name;
    if (oldName === newName) return;
    const updates: { [key: string]: any } = {};
    updates[`${roots.expenseCategories}/${categoryId}/name`] = newName;
    receipts.forEach(r => { if (r.category === oldName) { updates[`${roots.receipts}/${r.id}/category`] = newName; } });
    transactions.forEach(t => { if (t.category === oldName) { updates[`${roots.transactions}/${t.id}/category`] = newName; } });
    if (Object.keys(updates).length > 1) { await db.ref().update(updates); }
};

// --- Financial Accounts ---
export const addFinancialAccount = async (companyId: string, data: NewFinancialAccount) => db.ref(FOLDER_ROOTS(companyId).financialAccounts).push().set(data);
export const updateFinancialAccount = async (companyId: string, id: string, data: Partial<NewFinancialAccount>) => db.ref(`${FOLDER_ROOTS(companyId).financialAccounts}/${id}`).update(data);
export const deleteFinancialAccount = async (companyId: string, id: string) => db.ref(`${FOLDER_ROOTS(companyId).financialAccounts}/${id}`).remove();


// --- To-Do & Work Sheet Write Operations ---
export const addToDo = async (companyId: string, data: NewToDoItem) => { const newKey = db.ref(FOLDER_ROOTS(companyId).todos).push().key; if (!newKey) throw new Error("Failed to create key for new to-do."); return db.ref(`${FOLDER_ROOTS(companyId).todos}/${newKey}`).set({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP }); };
export const addToDoAndReturnId = async (companyId: string, data: NewToDoItem): Promise<string> => { const newRef = db.ref(FOLDER_ROOTS(companyId).todos).push(); if (!newRef.key) throw new Error("Failed to create key for new to-do."); await newRef.set({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP }); return newRef.key; };
export const updateToDo = async (companyId: string, id: string, data: ToDoItemUpdate) => db.ref(`${FOLDER_ROOTS(companyId).todos}/${id}`).update(data);
export const deleteToDo = async (companyId: string, id: string) => db.ref(`${FOLDER_ROOTS(companyId).todos}/${id}`).remove();
export const archiveToDos = async (companyId: string, todoIds: string[]) => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};
    const completionDate = toYYYYMMDD(new Date());

    todoIds.forEach(id => {
        const todoRef = `${roots.todos}/${id}`;
        updates[`${todoRef}/isComplete`] = true;
        updates[`${todoRef}/completionDate`] = completionDate;
    });

    if (Object.keys(updates).length > 0) {
        return db.ref().update(updates);
    }
};
export const unarchiveToDos = async (companyId: string, todoIds: string[]) => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};

    todoIds.forEach(id => {
        const todoRef = `${roots.todos}/${id}`;
        updates[`${todoRef}/isComplete`] = false;
        updates[`${todoRef}/completionDate`] = null;
    });

    if (Object.keys(updates).length > 0) {
        return db.ref().update(updates);
    }
};
export const markToDosAsComplete = async (companyId: string, todoIds: string[]) => { const updates: { [key: string]: any } = {}; todoIds.forEach(id => { updates[`${FOLDER_ROOTS(companyId).todos}/${id}/isComplete`] = true; }); if (Object.keys(updates).length > 0) return db.ref().update(updates); };
export const reclassifyToDo = async (companyId: string, todoId: string, targetCategory: 'general' | 'vehicle', vehicle?: { id: string; reg: string; }) => { const updates: { [key: string]: any } = {}; const todoRef = `${FOLDER_ROOTS(companyId).todos}/${todoId}`; if (targetCategory === 'general') { updates[`${todoRef}/vehicleId`] = null; updates[`${todoRef}/vehicleReg`] = null; } else if (targetCategory === 'vehicle' && vehicle) { updates[`${todoRef}/vehicleId`] = vehicle.id; updates[`${todoRef}/vehicleReg`] = vehicle.reg; updates[`${todoRef}/dueDate`] = null; } else { throw new Error("Invalid reclassification request."); } return db.ref().update(updates); };
export const addWorkSheet = async (companyId: string, data: NewWorkSheet) => { const newKey = db.ref(FOLDER_ROOTS(companyId).workSheets).push().key; if (!newKey) throw new Error("Failed to create key for new work sheet."); return db.ref(`${FOLDER_ROOTS(companyId).workSheets}/${newKey}`).set({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP }); };
export const updateWorkSheet = async (companyId: string, id: string, data: WorkSheetUpdate) => db.ref(`${FOLDER_ROOTS(companyId).workSheets}/${id}`).update(data);
export const deleteWorkSheet = async (companyId: string, id: string) => db.ref(`${FOLDER_ROOTS(companyId).workSheets}/${id}`).remove();

// --- Customer & Misc Invoice Operations ---
export const addCustomer = async (companyId: string, data: NewCustomer): Promise<string> => { const newKey = db.ref(FOLDER_ROOTS(companyId).customers).push().key; if (!newKey) throw new Error("Failed to create key for new customer."); await db.ref(`${FOLDER_ROOTS(companyId).customers}/${newKey}`).set({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP }); return newKey; };
export const updateCustomer = async (companyId: string, id: string, data: Partial<NewCustomer>) => db.ref(`${FOLDER_ROOTS(companyId).customers}/${id}`).update(data);
export const deleteCustomer = async (companyId: string, id: string) => db.ref(`${FOLDER_ROOTS(companyId).customers}/${id}`).remove();
export const addMiscInvoice = async (companyId: string, data: NewMiscInvoice) => { const newKey = db.ref(FOLDER_ROOTS(companyId).miscInvoices).push().key; if (!newKey) throw new Error("Failed to create key for new misc invoice."); return db.ref(`${FOLDER_ROOTS(companyId).miscInvoices}/${newKey}`).set({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP }); }
export const updateMiscInvoice = async (companyId: string, id: string, data: MiscInvoiceUpdate) => db.ref(`${FOLDER_ROOTS(companyId).miscInvoices}/${id}`).update(data);
export const deleteMiscInvoice = async (companyId: string, id: string) => db.ref(`${FOLDER_ROOTS(companyId).miscInvoices}/${id}`).remove();
export const addMiscInvoiceAndReconcile = async (companyId: string, invoiceData: NewMiscInvoice, transactionId: string) => { const roots = FOLDER_ROOTS(companyId); const updates: { [key: string]: any } = {}; const newDocKey = db.ref(roots.miscInvoices).push().key; if (!newDocKey) throw new Error("Failed to generate a key for the misc invoice."); updates[`${roots.miscInvoices}/${newDocKey}`] = { ...invoiceData, linkedTransactionId: transactionId, createdAt: firebase.database.ServerValue.TIMESTAMP }; const vatRate = invoiceData.subtotal > 0 ? (invoiceData.vat / invoiceData.subtotal) * 100 : 0; updates[`${roots.transactions}/${transactionId}/status`] = 'Reconciled'; updates[`${roots.transactions}/${transactionId}/category`] = 'Miscellaneous Income'; updates[`${roots.transactions}/${transactionId}/vatAmount`] = invoiceData.vat; updates[`${roots.transactions}/${transactionId}/vatRate`] = vatRate; return db.ref().update(updates); };

// --- Job Invoice Operations ---
export const addJobInvoice = async (companyId: string, data: NewJobInvoice) => { const newKey = db.ref(FOLDER_ROOTS(companyId).jobInvoices).push().key; if (!newKey) throw new Error("Failed to create key for new job invoice."); return db.ref(`${FOLDER_ROOTS(companyId).jobInvoices}/${newKey}`).set({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP }); }
export const updateJobInvoice = async (companyId: string, id: string, data: JobInvoiceUpdate) => db.ref(`${FOLDER_ROOTS(companyId).jobInvoices}/${id}`).update(data);
export const deleteJobInvoice = async (companyId: string, id: string) => db.ref(`${FOLDER_ROOTS(companyId).jobInvoices}/${id}`).remove();

// --- Garage (Informal Tracking) Operations ---
export const addInformalVehicle = async (companyId: string, data: NewInformalVehicle) => {
    const newKey = db.ref(FOLDER_ROOTS(companyId).informalVehicles).push().key;
    if (!newKey) throw new Error("Failed to create key for new informal vehicle.");
    return db.ref(`${FOLDER_ROOTS(companyId).informalVehicles}/${newKey}`).set({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
};

export const deleteInformalVehicle = async (companyId: string, vehicleId: string) => {
    // Also delete associated costs
    const roots = FOLDER_ROOTS(companyId);
    const vehicleRef = db.ref(`${roots.informalVehicles}/${vehicleId}`);
    const vehicleSnap = await vehicleRef.get();
    if (!vehicleSnap.exists()) return;
    const vehicleReg = vehicleSnap.val().reg;

    const costsQuery = db.ref(roots.garageCosts);
    const costsSnap = await costsQuery.get();
    const updates: { [key: string]: null } = {};
    updates[`${roots.informalVehicles}/${vehicleId}`] = null;
    if (costsSnap.exists()) {
        const costs = costsSnap.val();
        for (const costId in costs) {
            if (costs[costId].vehicleReg === vehicleReg) {
                updates[`${roots.garageCosts}/${costId}`] = null;
            }
        }
    }
    return db.ref().update(updates);
};

export const addGarageCost = async (companyId: string, data: NewGarageCost) => {
    const newKey = db.ref(FOLDER_ROOTS(companyId).garageCosts).push().key;
    if (!newKey) throw new Error("Failed to create key for new garage cost.");
    return db.ref(`${FOLDER_ROOTS(companyId).garageCosts}/${newKey}`).set({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
};

export const deleteGarageCost = async (companyId: string, costId: string) => {
    return db.ref(`${FOLDER_ROOTS(companyId).garageCosts}/${costId}`).remove();
};

// --- Supplier Operations ---
export const addSupplier = async (companyId: string, data: NewSupplier) => {
    const newKey = db.ref(FOLDER_ROOTS(companyId).suppliers).push().key;
    if (!newKey) throw new Error("Failed to create key for new supplier.");
    return db.ref(`${FOLDER_ROOTS(companyId).suppliers}/${newKey}`).set(data);
};

export const updateSupplier = async (companyId: string, id: string, data: SupplierUpdate) => {
    return db.ref(`${FOLDER_ROOTS(companyId).suppliers}/${id}`).update(data);
};

export const deleteSupplier = async (companyId: string, id: string) => {
    const roots = FOLDER_ROOTS(companyId);
    const supplierSnap = await db.ref(`${roots.suppliers}/${id}`).get();
    if (!supplierSnap.exists()) return;
    const supplierName = supplierSnap.val().name;

    const receiptsSnap = await db.ref(roots.receipts).orderByChild('vendor').equalTo(supplierName).get();
    if (receiptsSnap.exists()) {
        const receiptsData = receiptsSnap.val();
        const receipts: Receipt[] = Object.values(receiptsData);
        const unpaidOnAccount = receipts.some(r => r.status === 'Unpaid' && r.paymentType === 'On Account');
        if (unpaidOnAccount) {
            throw new Error(`Cannot delete supplier "${supplierName}" as there are unpaid "On Account" receipts associated with it.`);
        }
    }
    
    return db.ref(`${roots.suppliers}/${id}`).remove();
};

export const deleteUploadBatch = async (companyId: string, batchId: string) => {
    const roots = FOLDER_ROOTS(companyId);
    const batchRef = db.ref(`${roots.uploadBatches}/${batchId}`);
    const batchSnap = await batchRef.get();
    if (!batchSnap.exists()) {
        console.warn(`Upload batch with ID ${batchId} not found.`);
        return;
    }

    const batch: UploadBatch = batchSnap.val();
    const updates: { [key: string]: null } = {};

    // Delete the batch record
    updates[`${roots.uploadBatches}/${batchId}`] = null;

    // Delete all associated transactions
    if (batch.transactionIds && batch.transactionIds.length > 0) {
        batch.transactionIds.forEach(txId => {
            updates[`${roots.transactions}/${txId}`] = null;
        });
    }
    await db.ref().update(updates);
};

// --- Canvas Operations ---
export const addCanvasItem = async (companyId: string, data: NewCanvasItem): Promise<string> => {
    const newKey = db.ref(FOLDER_ROOTS(companyId).canvas).push().key;
    if (!newKey) throw new Error("Failed to create key for new canvas item.");
    await db.ref(`${FOLDER_ROOTS(companyId).canvas}/${newKey}`).set({ ...data, createdAt: firebase.database.ServerValue.TIMESTAMP });
    return newKey;
};
export const updateCanvasItem = async (companyId: string, id: string, data: CanvasItemUpdate) => {
    return db.ref(`${FOLDER_ROOTS(companyId).canvas}/${id}`).update(data);
};
export const deleteCanvasItem = async (companyId: string, item: CanvasItem) => {
    const updates: { [key: string]: null } = {};
    updates[`${FOLDER_ROOTS(companyId).canvas}/${item.id}`] = null;
    await db.ref().update(updates);

    if (item.fileUrl) {
        try {
            const fileRef = storage.refFromURL(item.fileUrl);
            await fileRef.delete();
        } catch (error) {
            console.error(`Failed to delete canvas file from storage: ${item.fileUrl}`, error);
        }
    }
};


// --- File Storage ---
export const uploadFile = async (companyId: string, userId: string, file: File, path: string): Promise<string> => {
    const fileRef = storage.ref(`${companyId}/${userId}/${path}/${Date.now()}_${file.name}`);
    const snapshot = await fileRef.put(file);
    return snapshot.ref.getDownloadURL();
};
export const uploadBlob = async (companyId: string, userId: string, blob: Blob, path: string, name: string): Promise<string> => {
    const fileRef = storage.ref(`${companyId}/${userId}/${path}/${name}`);
    const snapshot = await fileRef.put(blob);
    return snapshot.ref.getDownloadURL();
};

async function listAllFilesRecursive(ref: firebase.storage.Reference): Promise<firebase.storage.Reference[]> {
    let items: firebase.storage.Reference[] = [];
    try {
        const res = await ref.listAll();
        items.push(...res.items);
        for (const prefixRef of res.prefixes) {
            const subItems = await listAllFilesRecursive(prefixRef);
            items.push(...subItems);
        }
    } catch(e) {
        console.warn("Could not list files in ", ref.fullPath, e);
    }
    return items;
}

export const listAllCompanyFiles = async (companyId: string): Promise<{ name: string; fullPath: string; size: number; updated: string; contentType?: string; downloadUrl: string; userId: string; }[]> => {
    if (!companyId) return [];
    
    const companyFolderRef = storage.ref(companyId);
    
    try {
        const allFileRefs = await listAllFilesRecursive(companyFolderRef);

        const files = await Promise.all(allFileRefs.map(async (itemRef) => {
            const [metadata, downloadUrl] = await Promise.all([itemRef.getMetadata(), itemRef.getDownloadURL()]);
            
            const pathParts = metadata.fullPath.split('/');
            let fileUserId = 'company_legacy';
            
            // Heuristic to find user ID: often a 28-char string
            const potentialUserId = pathParts[1];
            if (potentialUserId && potentialUserId.length === 28) {
                fileUserId = potentialUserId;
            }

            return {
                name: metadata.name,
                fullPath: metadata.fullPath,
                size: metadata.size,
                updated: metadata.updated,
                contentType: metadata.contentType,
                downloadUrl,
                userId: fileUserId
            };
        }));

        return files.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime());
    } catch (error) {
        if ((error as any).code !== 'storage/object-not-found') {
            console.error(`Error listing all files for company ${companyId}:`, error);
        }
        return [];
    }
};

export const deleteFileFromStorage = async (fullPath: string) => {
    const fileRef = storage.ref(fullPath);
    await fileRef.delete();
};

export const deleteMultipleFiles = async (files: { fullPath: string }[]): Promise<void> => {
    const deletePromises = files.map(file => {
        const fileRef = storage.ref(file.fullPath);
        return fileRef.delete().catch(e => console.error(`Failed to delete ${file.fullPath}`, e));
    });
    await Promise.allSettled(deletePromises);
};


// --- Business Logic ---
export const undoSale = async (companyId: string, document: SalesDocument, allVehicles: Vehicle[]) => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};
    updates[`${roots.vehicles}/${document.vehicleId}/status`] = 'Available';
    if (document.partExchangeDetails && document.pxValue > 0) {
        const pxVehicleToDelete = allVehicles.find(v => v.reg === document.partExchangeDetails?.reg && v.purchasePrice === document.pxValue && v.purchaseDate === document.invoiceDate && v.make === document.partExchangeDetails.make && v.model === document.partExchangeDetails.model );
        if (pxVehicleToDelete) {
            updates[`${roots.vehicles}/${pxVehicleToDelete.id}`] = null;
        }
    }
    if (document.sorPayableReceiptId) {
        updates[`${roots.receipts}/${document.sorPayableReceiptId}`] = null;
    }
    updates[`${roots.salesDocuments}/${document.id}`] = null;
    return db.ref().update(updates);
};

export const undoDeposit = async (companyId: string, document: SalesDocument, allTodos: ToDoItem[]) => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};

    // 1. Reset vehicle status
    updates[`${roots.vehicles}/${document.vehicleId}/status`] = 'Available';

    // 2. Delete the deposit slip document
    updates[`${roots.salesDocuments}/${document.id}`] = null;

    // 3. Find and delete associated prep tasks from this deposit
    const todosToDelete = allTodos.filter(todo => todo.vehicleId === document.vehicleId && todo.origin === 'deposit');
    todosToDelete.forEach(todo => {
        updates[`${roots.todos}/${todo.id}`] = null;
    });

    return db.ref().update(updates);
};

export const resequenceStockNumbers = async (companyId: string, vehicles: Vehicle[]): Promise<void> => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};

    // Filter for vehicles with non-numeric stock numbers, and sort them by purchase date.
    const vehiclesToResequence = vehicles
        .filter(v => isNaN(parseInt(v.stockNumber, 10)))
        .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());

    // Find the highest existing numerical stock number to start from.
    const existingNumericalStockNumbers = vehicles
        .map(v => parseInt(v.stockNumber, 10))
        .filter(n => !isNaN(n));

    let nextStockNumber = existingNumericalStockNumbers.length > 0 ? Math.max(1000, ...existingNumericalStockNumbers) + 1 : 1000;
    
    vehiclesToResequence.forEach(vehicle => {
        updates[`${roots.vehicles}/${vehicle.id}/stockNumber`] = String(nextStockNumber);
        nextStockNumber++;
    });

    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
    }
};

// FIX: Implement convertQuoteToInvoice to change a quote to an invoice.
export const convertQuoteToInvoice = async (companyId: string, quoteId: string) => {
    const roots = FOLDER_ROOTS(companyId);
    const invRef = db.ref(`${roots.jobInvoices}/${quoteId}`);

    const invSnap = await invRef.get();
    if (!invSnap.exists() || invSnap.val().status !== 'Quote') {
        throw new Error("Quote not found or is already an invoice.");
    }

    // Also update the date to today when converting
    return invRef.update({ status: 'Invoice', invoiceDate: new Date().toISOString().split('T')[0] });
};

// --- Reconciliation Logic ---
export const undoReconciliation = async (companyId: string, transaction: StatementTransaction, allMiscInvoices: MiscInvoice[], allReceipts: Receipt[]) => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};

    // Reset the transaction itself
    updates[`${roots.transactions}/${transaction.id}/status`] = 'Unreconciled';
    updates[`${roots.transactions}/${transaction.id}/category`] = 'Other';
    updates[`${roots.transactions}/${transaction.id}/vatRate`] = 0;
    updates[`${roots.transactions}/${transaction.id}/vatAmount`] = 0;
    updates[`${roots.transactions}/${transaction.id}/linkedVehicleId}`] = null;

    if (transaction.linkedVehicleId) {
        updates[`${roots.vehicles}/${transaction.linkedVehicleId}/purchaseTransactionId}`] = null;
    }
    
    // If it was linked to a miscellaneous income invoice, unlink it
    if (transaction.category === 'Miscellaneous Income') {
        const linkedInvoice = allMiscInvoices.find(inv => inv.linkedTransactionId === transaction.id);
        if (linkedInvoice) {
            updates[`${roots.miscInvoices}/${linkedInvoice.id}/linkedTransactionId}`] = null;
        }
    }
    
    // Find any receipts reconciled by this transaction and reset them
    const linkedReceipts = allReceipts.filter(r => r.reconciledByTxId === transaction.id);
    linkedReceipts.forEach(receipt => {
        updates[`${roots.receipts}/${receipt.id}/status`] = 'Unpaid';
        updates[`${roots.receipts}/${receipt.id}/reconciledByTxId}`] = null;
    });


    return db.ref().update(updates);
};

export const reconcileTransactionFromSuggestion = async (companyId: string, transactionId: string, match: { vehicleId?: string; receiptIds?: string[] }) => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};
    const txRef = `${roots.transactions}/${transactionId}`;
    updates[`${txRef}/status`] = 'Reconciled';

    // Case 1: Match includes a vehicle purchase
    if (match.vehicleId) {
        const vehicleRef = `${roots.vehicles}/${match.vehicleId}`;
        updates[`${txRef}/category`] = 'Vehicle Purchase';
        updates[`${txRef}/linkedVehicleId}`] = match.vehicleId;
        updates[`${vehicleRef}/purchaseTransactionId}`] = transactionId;
    }

    // Case 2: Match includes one or more receipts
    if (match.receiptIds && match.receiptIds.length > 0) {
        const receiptsSnap = await db.ref(roots.receipts).get();
        const allReceipts = receiptsSnap.val();
        let totalVat = 0;

        match.receiptIds.forEach(receiptId => {
            updates[`${roots.receipts}/${receiptId}/status`] = 'Paid';
            updates[`${roots.receipts}/${receiptId}/reconciledByTxId}`] = transactionId;
            if (allReceipts && allReceipts[receiptId]) {
                totalVat += allReceipts[receiptId].vat || 0;
            }
        });

        updates[`${txRef}/vatAmount`] = totalVat;
        // If it's a combo (vehicle + receipt), category is already 'Vehicle Purchase' which is correct.
        // If it's just receipts, set category from the first one.
        if (!match.vehicleId && allReceipts && allReceipts[match.receiptIds[0]]) {
            updates[`${txRef}/category`] = allReceipts[match.receiptIds[0]].category;
        }
    }
    
    return db.ref().update(updates);
};


export const reconcileSalePayment = async (companyId: string, transactionId: string, salesDocId: string, payment: Payment) => {
    const roots = FOLDER_ROOTS(companyId);
    const docRef = db.ref(`${roots.salesDocuments}/${salesDocId}`);
    const docSnap = await docRef.get();

    if (!docSnap.exists()) {
        throw new Error("Sales document not found.");
    }

    const doc: SalesDocument = docSnap.val();
    const existingPayments = doc.payments || [];
    const newPayments = [...existingPayments, payment];
    const newTotalPayments = newPayments.reduce((sum, p) => sum + p.amount, 0);

    const newBalance = doc.subtotal - newTotalPayments - doc.pxValue;

    const updates: { [key: string]: any } = {};
    updates[`${roots.salesDocuments}/${salesDocId}/payments`] = newPayments;
    updates[`${roots.salesDocuments}/${salesDocId}/balance`] = newBalance;
    updates[`${roots.transactions}/${transactionId}/status`] = 'Reconciled';
    updates[`${roots.transactions}/${transactionId}/category`] = doc.documentType === 'Deposit Slip' ? 'Sales Deposit' : 'Vehicle Sale';

    return db.ref().update(updates);
};

export const reconcileMiscInvoicePayment = async (companyId: string, transactionId: string, miscInvoiceId: string) => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};
    const txRef = `${roots.transactions}/${transactionId}`;
    const invRef = `${roots.miscInvoices}/${miscInvoiceId}`;

    const invSnap = await db.ref(invRef).get();
    if (!invSnap.exists()) throw new Error("Misc invoice not found.");
    const inv: MiscInvoice = invSnap.val();

    updates[`${txRef}/status`] = 'Reconciled';
    updates[`${txRef}/category`] = 'Miscellaneous Income';
    updates[`${txRef}/vatAmount`] = inv.vat || 0;
    updates[`${txRef}/vatRate`] = inv.isVatInvoice && inv.subtotal > 0 ? (inv.vat / inv.subtotal) * 100 : 0;
    updates[`${invRef}/linkedTransactionId}`] = transactionId;

    return db.ref().update(updates);
};

// FIX: Implement reconcileJobInvoicePayment to handle payments for job invoices.
export const reconcileJobInvoicePayment = async (companyId: string, transactionId: string, jobInvoiceId: string, payment: Payment) => {
    const roots = FOLDER_ROOTS(companyId);
    const invRef = db.ref(`${roots.jobInvoices}/${jobInvoiceId}`);
    const invSnap = await invRef.get();

    if (!invSnap.exists()) {
        throw new Error("Job invoice not found.");
    }

    const invoice: JobInvoice = invSnap.val();
    const existingPayments = invoice.payments || [];
    const newPayments = [...existingPayments, payment];
    const newTotalPayments = newPayments.reduce((sum, p) => sum + p.amount, 0);

    const newBalance = invoice.total - newTotalPayments;

    const updates: { [key: string]: any } = {};
    updates[`${roots.jobInvoices}/${jobInvoiceId}/payments`] = newPayments;
    updates[`${roots.jobInvoices}/${jobInvoiceId}/balance`] = newBalance;
    updates[`${roots.transactions}/${transactionId}/status`] = 'Reconciled';
    updates[`${roots.transactions}/${transactionId}/category`] = 'Job Invoice Payment';

    return db.ref().update(updates);
};

export const tryAutoReconciliation = async (companyId: string, receipt: Receipt, transactions: StatementTransaction[]) => { 
    if (receipt.paymentType !== 'Direct') return; 
    const unreconciledTxs = transactions.filter(tx => tx.status === 'Unreconciled'); 
    const receiptAmountPence = Math.round(receipt.amount * 100); 
    // Increased window to 21 days to catch invoices received well before payment
    const matchedTx = unreconciledTxs.find(tx => Math.round(Math.abs(tx.amount) * 100) === receiptAmountPence && isWithinDays(tx.date, receipt.date, 21)); 
    if (matchedTx) { await reconcileTransactionWithReceipt(companyId, matchedTx, receipt); } 
};
export const reconcileTransactionWithReceipt = async (companyId: string, transaction: StatementTransaction, receipt: Receipt) => { 
    return reconcileTransactionFromSuggestion(companyId, transaction.id, { receiptIds: [receipt.id] });
};
export const reconcilePaymentWithMultipleReceipts = async (companyId: string, transactionId: string, receiptIds: string[]) => { 
    return reconcileTransactionFromSuggestion(companyId, transactionId, { receiptIds });
};
export const reconcilePaymentWithAdjustment = async (companyId: string, transactionId: string, receiptIds: string[], transactionAmount: number) => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};

    // Calculate VAT based on the actual amount paid, assuming 20% rate for supplier payments
    const vatAmount = Math.abs(transactionAmount) / 6;

    updates[`${roots.transactions}/${transactionId}/status`] = 'Reconciled';
    updates[`${roots.transactions}/${transactionId}/category`] = 'Supplier Payment';
    updates[`${roots.transactions}/${transactionId}/vatAmount`] = vatAmount;
    updates[`${roots.transactions}/${transactionId}/vatRate`] = 20; // Assume 20% for this override
    
    receiptIds.forEach(id => {
        updates[`${roots.receipts}/${id}/status`] = 'Paid';
        updates[`${roots.receipts}/${id}/reconciledByTxId}`] = transactionId;
    });

    await db.ref().update(updates);
};

export const markReceiptsAsPaid = async (companyId: string, receiptIds: string[]): Promise<void> => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};
    receiptIds.forEach(id => {
        updates[`${roots.receipts}/${id}/status`] = 'Paid';
    });
    if (Object.keys(updates).length > 0) {
        return db.ref().update(updates);
    }
};

export type HeuristicSuggestion = { 
    // Expense
    vehicleId?: string; 
    receiptId?: string; // Legacy
    receiptIds?: string[];
    // Income
    salesDocId?: string;
    miscInvoiceId?: string;
    jobInvoiceId?: string;
    // Enhanced Matching Info
    matchType?: 'exact_amount' | 'metadata' | 'partial_amount';
    details?: string;
};

export const getReconciliationSuggestions = (
    transactions: StatementTransaction[], 
    receipts: Receipt[], 
    vehicles: Vehicle[],
    salesDocs: SalesDocument[] = [],
    miscInvoices: MiscInvoice[] = [],
    jobInvoices: JobInvoice[] = []
): Map<string, HeuristicSuggestion> => {
    const unreconciledTxs = transactions.filter(t => t.status === 'Unreconciled');
    const unpaidReceipts = receipts.filter(r => r.status === 'Unpaid');
    const unreconciledVehicles = vehicles.filter(v => v.status !== 'Sold' && !v.purchaseTransactionId);

    const suggestions = new Map<string, HeuristicSuggestion>();
    const usedReceiptIds = new Set<string>();
    const usedVehicleIds = new Set<string>();

    unreconciledTxs.forEach(tx => {
        const txAmountPence = Math.round(Math.abs(tx.amount) * 100);
        const txDesc = tx.description.toLowerCase().replace(/\s/g, '');

        // --- INCOME MATCHING (Money coming in) ---
        if (tx.amount > 0) {
            // Scoring system for income matches to prioritize best fit
            let bestMatch: HeuristicSuggestion | null = null;
            let maxScore = 0;

            const checkMatch = (doc: any, type: 'sales' | 'job' | 'misc') => {
                let score = 0;
                let details = '';
                
                // --- Metadata Matching (Reg, Name, Invoice #) ---
                let metaMatch = false;
                
                // Name Check
                const customerName = (doc.customerName || doc.customerDetails?.name || '').toLowerCase().replace(/\s/g, '');
                if (customerName && txDesc.includes(customerName)) {
                    score += 20;
                    metaMatch = true;
                }

                // Reg Check (Strong indicator)
                const reg = (doc.carDetails?.reg || '').toLowerCase().replace(/\s/g, '');
                if (reg && txDesc.includes(reg)) {
                    score += 40; // Higher weight for Reg
                    metaMatch = true;
                }

                // Invoice # Check
                const invNum = (doc.invoiceNumber || '').toLowerCase().replace(/\s/g, '');
                if (invNum && invNum.length > 3 && txDesc.includes(invNum)) {
                    score += 30;
                    metaMatch = true;
                }

                // --- Amount Matching ---
                // We check against Balance, Deposit, and Total Price to catch partial/deposit payments
                const balancePence = Math.round((doc.balance || doc.total || 0) * 100);
                const depositPence = Math.round((doc.deposit || 0) * 100);
                const totalPence = Math.round((doc.price || doc.total || 0) * 100);

                let amountMatch = false;
                
                if (Math.abs(txAmountPence - balancePence) <= 5) {
                    score += 30;
                    amountMatch = true;
                    details = 'Balance';
                } else if (depositPence > 0 && Math.abs(txAmountPence - depositPence) <= 5) {
                    score += 30;
                    amountMatch = true;
                    details = 'Deposit';
                } else if (Math.abs(txAmountPence - totalPence) <= 5) {
                    score += 30;
                    amountMatch = true;
                    details = 'Full Price';
                }

                // Penalty for closed documents unless they match metadata or specific deposit logic
                if (doc.balance <= 0 && !metaMatch && type !== 'sales') {
                    score -= 50; 
                }

                if (score > maxScore && score > 25) { // Minimum threshold
                    maxScore = score;
                    if (type === 'sales') bestMatch = { salesDocId: doc.id, matchType: amountMatch ? 'exact_amount' : 'metadata', details };
                    if (type === 'job') bestMatch = { jobInvoiceId: doc.id, matchType: amountMatch ? 'exact_amount' : 'metadata', details };
                    if (type === 'misc') bestMatch = { miscInvoiceId: doc.id, matchType: amountMatch ? 'exact_amount' : 'metadata', details };
                }
            };

            // Run checks against all document types
            salesDocs.forEach(d => checkMatch(d, 'sales'));
            jobInvoices.forEach(d => checkMatch(d, 'job'));
            miscInvoices.filter(m => !m.linkedTransactionId).forEach(d => checkMatch(d, 'misc'));

            if (bestMatch) {
                suggestions.set(tx.id, bestMatch);
            }
            return; 
        }

        // --- EXPENSE MATCHING ---
        
        // Priority 1: Check for vehicle + delivery combo
        for (const v of unreconciledVehicles) {
            if (usedVehicleIds.has(v.id)) continue;
            
            const deliveryReceipt = unpaidReceipts.find(r => r.vehicleId === v.id && r.category === 'Transport' && !usedReceiptIds.has(r.id));
            if (deliveryReceipt) {
                const combinedAmountPence = Math.round((v.purchasePrice + deliveryReceipt.amount) * 100);
                // Increased window to 21 days for vehicle purchase combo
                if (Math.abs(txAmountPence - combinedAmountPence) <= 5 && isWithinDays(tx.date, v.purchaseDate, 21)) {
                    suggestions.set(tx.id, { vehicleId: v.id, receiptIds: [deliveryReceipt.id], matchType: 'exact_amount' });
                    usedVehicleIds.add(v.id);
                    usedReceiptIds.add(deliveryReceipt.id);
                    return; // Found a match, move to next transaction
                }
            }
        }
        
        // Priority 2: Try to match a single receipt
        const bestReceiptMatch = unpaidReceipts
            .filter(r => !usedReceiptIds.has(r.id) && r.paymentType === 'Direct')
            // Increased window to 21 days for receipt matching
            .map(r => ({ receipt: r, diff: Math.abs(txAmountPence - Math.round(r.amount * 100))}))
            .filter(m => m.diff <= 5 && isWithinDays(tx.date, m.receipt.date, 21))
            .sort((a, b) => a.diff - b.diff)[0];

        if (bestReceiptMatch) {
            suggestions.set(tx.id, { receiptIds: [bestReceiptMatch.receipt.id], matchType: 'exact_amount' });
            usedReceiptIds.add(bestReceiptMatch.receipt.id);
            return;
        }

        // Priority 3: Try to match a single vehicle purchase
        const bestVehicleMatch = unreconciledVehicles
            .filter(v => !usedVehicleIds.has(v.id))
            .map(v => ({ vehicle: v, diff: Math.abs(txAmountPence - Math.round(v.purchasePrice * 100))}))
            // Increased window to 21 days for vehicle purchase matching
            .filter(m => m.diff <= 5 && isWithinDays(tx.date, m.vehicle.purchaseDate, 21))
            .sort((a, b) => a.diff - b.diff)[0];
        
        if (bestVehicleMatch) {
            suggestions.set(tx.id, { vehicleId: bestVehicleMatch.vehicle.id, matchType: 'exact_amount' });
            usedVehicleIds.add(bestVehicleMatch.vehicle.id);
        }
    });
    return suggestions;
};

// --- Statement Processing ---
export const processStatement = async (companyId: string, file: File, account: FinancialAccount, receipts: Receipt[], existingTxs: StatementTransaction[], onProgress: (p: any) => void) => {
    onProgress({ step: 'parsing', message: 'Parsing CSV...' });
    const text = await file.text();
    
    // Manually parse to handle potential trailing comma issues in headers
    const parseResult = Papa.parse(text, { 
        header: false, 
        skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
        console.error("CSV Parsing errors:", parseResult.errors);
        onProgress({ step: 'error', error: `Failed to parse CSV: ${parseResult.errors[0].message}` });
        return;
    }

    if (parseResult.data.length < 1) {
        onProgress({ step: 'error', error: 'CSV file is empty or has no header row.' });
        return;
    }

    let headers = (parseResult.data[0] as string[]).map(h => h ? h.trim() : '');
    const dataRows = parseResult.data.slice(1) as string[][];

    // Heuristic: If the last header is an empty string, it's likely a trailing comma.
    if (headers.length > 0 && headers[headers.length - 1] === '') {
        headers.pop();
    }
    
    // Reconstruct the array of objects that `header: true` would have created.
    const rows = dataRows
        .filter(row => row.some(field => field && field.trim() !== '')) // Ensure row is not completely empty
        .map(row => {
            const obj: { [key: string]: string } = {};
            // Only map values for the headers we've identified. This gracefully handles
            // rows that might have an extra empty field from a trailing comma.
            headers.forEach((header, i) => {
                obj[header] = row[i];
            });
            return obj;
        });

    onProgress({ step: 'parsing', message: 'Parsing complete.', total: rows.length });
    
    const getField = (row: { [key: string]: string }, possibleKeys: string[]): string | undefined => {
        for (const key of possibleKeys) {
            if (headers.includes(key) && row[key]) {
                return row[key];
            }
        }
        return undefined;
    };

    const newTransactions: NewStatementTransaction[] = [];
    for (const row of rows) {
        const dateStr = getField(row, ['Date', 'Transaction Date', 'Clearance Date']);
        const date = dateStr ? robustDateParser(dateStr) : null;
        
        const description = getField(row, ['Details', 'Transaction Description', 'Description', 'Merchant Name']);
        
        if (!date || !description) continue;
        
        let amount: number;
        const debitStr = getField(row, ['Out', 'Debit Amount', 'Debit']);
        const creditStr = getField(row, ['In', 'Credit Amount', 'Credit']);
        const amountStr = getField(row, ['Amount']);

        if (debitStr !== undefined || creditStr !== undefined) {
            const debit = parseFloat(debitStr || '0');
            const credit = parseFloat(creditStr || '0');
            amount = credit - debit;
        } else if (amountStr !== undefined) {
            const parsedAmount = parseFloat(amountStr);
            if (account.type === 'Credit Card') {
                const lowerDesc = description.toLowerCase();
                if (lowerDesc.includes('payment received') || lowerDesc.includes('payment thank you')) {
                    amount = parsedAmount;
                } else {
                    amount = -parsedAmount;
                }
            } else {
                amount = parsedAmount;
            }
        } else {
            continue;
        }
        
        const method = getField(row, ['Transaction Type']);

        const newTx: NewStatementTransaction = {
            date,
            description,
            amount,
            type: account.type,
            accountId: account.id,
            method: method,
            category: 'Other',
            vatRate: 0,
            vatAmount: 0,
            status: 'Unreconciled'
        };
        
        const lowerDesc = newTx.description.toLowerCase();
        if (account.type === 'Credit Card' && amount > 0 && (lowerDesc.includes('payment made') || lowerDesc.includes('direct debit') || lowerDesc.includes('payment received'))) {
            newTx.category = 'Credit Card Payment';
            newTx.status = 'Reconciled';
        }
        newTransactions.push(newTx);
    }
    
    if (rows.length > 0 && newTransactions.length === 0) {
        onProgress({ step: 'error', error: "CSV parsed, but no valid transaction rows could be identified. Please check column headers." });
        return;
    }

    onProgress({ step: 'deduplicating', message: 'Checking for duplicates...', total: newTransactions.length });
    const uniqueNewTxs = newTransactions.filter(newTx => !existingTxs.some(exTx => exTx.date === newTx.date && exTx.description === newTx.description && exTx.amount === newTx.amount));
    onProgress({ step: 'deduplicating', message: 'Deduplication complete.', total: newTransactions.length, newCount: uniqueNewTxs.length, duplicateCount: newTransactions.length - uniqueNewTxs.length });
    onProgress({ step: 'reconciling', message: 'Auto-reconciling...', total: uniqueNewTxs.length });
    let reconciledCount = 0;
    const unpaidReceipts = receipts.filter(r => r.status === 'Unpaid' && r.paymentType === 'Direct');
    for (const tx of uniqueNewTxs) {
        if (tx.status === 'Unreconciled' && tx.amount < 0) {
            // Increased window to 21 days for auto-reconcile on upload
            const receipt = unpaidReceipts.find(r => isWithinDays(tx.date, r.date, 21) && Math.abs(Math.abs(tx.amount) - r.amount) <= 0.05 );
            if (receipt) { 
                tx.status = 'Reconciled'; 
                tx.category = receipt.category; 
                tx.vatRate = receipt.vat > 0 ? 20 : 0; 
                tx.vatAmount = receipt.vat; 
                await updateReceipt(companyId, receipt.id, { status: 'Paid' }); 
                reconciledCount++; 
            }
        }
    }
    onProgress({ step: 'reconciling', message: 'Auto-reconciling complete.', total: uniqueNewTxs.length, reconciledCount });
    onProgress({ step: 'categorizing', message: 'AI categorization...', total: uniqueNewTxs.length });
    
    if (uniqueNewTxs.length > 0) {
        onProgress({ step: 'saving', message: 'Saving to ledger...', newCount: uniqueNewTxs.length });
        const newTxIds = await addTransactions(companyId, uniqueNewTxs);

        // Create a batch record for this upload
        const newBatchKey = db.ref(FOLDER_ROOTS(companyId).uploadBatches).push().key;
        if (newBatchKey) {
            const newBatch: Omit<UploadBatch, 'id'> = {
                filename: file.name,
                accountId: account.id,
                accountName: account.name,
                transactionCount: uniqueNewTxs.length,
                uploadedAt: firebase.database.ServerValue.TIMESTAMP as any,
                transactionIds: newTxIds,
            };
            await db.ref(`${FOLDER_ROOTS(companyId).uploadBatches}/${newBatchKey}`).set(newBatch);
        }
    }
    onProgress({ step: 'complete', message: 'Import successful!', newCount: uniqueNewTxs.length });
};

// --- Data Management & Backup/Restore ---
export const getAllDataForBackup = async (companyId: string): Promise<any> => {
    const data: { [key: string]: any } = {};
    const dataKeys = Object.keys(FOLDER_ROOTS(companyId));
    for (const key of dataKeys) {
        const snapshot = await db.ref(`companies/${companyId}/${key}`).get();
        if (snapshot.exists()) {
            data[key] = snapshot.val();
        }
    }
    return data;
};
export const restoreDataFromBackup = async (companyId: string, data: any, isPartial = false) => {
    const path = companyRoot(companyId);
    if (isPartial) {
        await db.ref(path).update(data);
    } else {
        const metaSnap = await db.ref(`${path}/meta`).get();
        const metaData = metaSnap.exists() ? metaSnap.val() : {};

        await db.ref(path).set(null); // Clear all data
        
        const restoreData = { ...data, meta: metaData };
        await db.ref(path).set(restoreData);
    }
};
export const deleteDataAndFilesByCategories = async (companyId: string, userId: string, categories: string[]) => {
    const allData = await getAllDataForBackup(companyId);
    const updates: { [key: string]: any } = {};
    const deletePromises: Promise<void>[] = [];
    const roots = FOLDER_ROOTS(companyId);

    if (categories.includes('transactions') && allData.receipts) {
        for (const receiptId of Object.keys(allData.receipts)) {
            const receipt = allData.receipts[receiptId];
            if (receipt.status === 'Paid') {
                updates[`${roots.receipts}/${receiptId}/status`] = 'Unpaid';
            }
        }
    }

    for (const category of categories) {
        updates[`${companyRoot(companyId)}/${category}`] = null;
        if (category === 'receipts' && allData.receipts) {
            for (const receipt of Object.values(allData.receipts) as any[]) {
                if (receipt.receiptUrl) {
                    try {
                        deletePromises.push(storage.refFromURL(receipt.receiptUrl).delete());
                    } catch (e) { console.error(`Could not delete file for receipt: ${receipt.receiptUrl}`, e); }
                }
            }
        } else if (category === 'vehicles' && allData.vehicles) {
            for (const vehicle of Object.values(allData.vehicles) as any[]) {
                if (vehicle.invoiceUrl) {
                    try {
                        deletePromises.push(storage.refFromURL(vehicle.invoiceUrl).delete());
                    } catch (e) { console.error(`Could not delete file for vehicle: ${vehicle.invoiceUrl}`, e); }
                }
            }
        }
    }
    await Promise.allSettled(deletePromises);
    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
    }
};
export const clearAllCompanyData = async (companyId: string) => { console.log(`Clearing all data for company ${companyId}...`); await db.ref(companyRoot(companyId)).set(null); console.log("All company data cleared."); };

// --- Batch Archive Operations ---
export const batchArchiveDelete = async (companyId: string, items: any[]): Promise<void> => {
    const updates: { [key: string]: any } = {}; // Changed from null to any to allow value updates
    const roots = FOLDER_ROOTS(companyId);
    const fileDeletePromises: Promise<void>[] = [];

    items.forEach(item => {
        if (item.type === 'receipt') {
            // UPDATED: Only remove the file link, preserving the expense record
            updates[`${roots.receipts}/${item.id}/receiptUrl`] = null; 
            if (item.fileUrl) {
                fileDeletePromises.push(storage.refFromURL(item.fileUrl).delete().catch(e => console.error(e)));
            }
        } else if (item.type === 'purchaseInvoice') {
            // For vehicle purchase invoices, we delete the file link from the vehicle record
            if (item.data && item.data.invoiceUrl) {
                 fileDeletePromises.push(storage.refFromURL(item.data.invoiceUrl).delete().catch(e => console.error(e)));
                 updates[`${roots.vehicles}/${item.id}/invoiceUrl`] = null;
            }
        } else if (item.type === 'salesDoc') {
            // Sales documents are records themselves, so we delete them entirely
            updates[`${roots.salesDocuments}/${item.id}`] = null;
        }
    });

    // Execute file deletions
    await Promise.allSettled(fileDeletePromises);
    
    // Execute DB deletions/updates
    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
    }
};

export const batchRestore = async (companyId: string, manifest: { items: any[] }): Promise<void> => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};

    manifest.items.forEach(item => {
        // We restore the data record.
        // Files must have been re-uploaded by the UI layer before calling this,
        // and the `item.data` updated with the new downloadURL.
        
        if (item.type === 'receipt') {
            updates[`${roots.receipts}/${item.id}`] = item.data;
        } else if (item.type === 'salesDoc') {
            updates[`${roots.salesDocuments}/${item.id}`] = item.data;
        } else if (item.type === 'purchaseInvoice') {
            // Restore the invoiceUrl to the vehicle
            if (item.data.invoiceUrl) {
                updates[`${roots.vehicles}/${item.id}/invoiceUrl`] = item.data.invoiceUrl;
            }
        }
    });

    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
    }
};


export const getDefaultCategoryIcon = (): string => 'TagIcon';


// --- CRM Operations ---

// Lead Operations
export const addLead = async (companyId: string, data: NewLead): Promise<string> => {
    const roots = FOLDER_ROOTS(companyId);
    const newKey = db.ref(roots.leads).push().key;
    if (!newKey) throw new Error("Failed to create key for new lead.");

    const now = new Date().toISOString();
    const leadData: Omit<Lead, 'id'> = {
        ...data,
        history: data.history || [],
        hasReceivedAutoReply: data.hasReceivedAutoReply || false,
        createdAt: now,
        updatedAt: now,
    };

    await db.ref(`${roots.leads}/${newKey}`).set(leadData);
    return newKey;
};

export const updateLead = async (companyId: string, id: string, data: LeadUpdate): Promise<void> => {
    const updates: any = { ...data, updatedAt: new Date().toISOString() };
    await db.ref(`${FOLDER_ROOTS(companyId).leads}/${id}`).update(updates);
};

export const deleteLead = async (companyId: string, id: string): Promise<void> => {
    await db.ref(`${FOLDER_ROOTS(companyId).leads}/${id}`).remove();
};

export const updateLeadStage = async (companyId: string, id: string, stage: LeadStage): Promise<void> => {
    const updates = {
        stage,
        updatedAt: new Date().toISOString(),
    };
    await db.ref(`${FOLDER_ROOTS(companyId).leads}/${id}`).update(updates);
};

export const addLeadActivity = async (companyId: string, leadId: string, activity: Omit<Activity, 'id'>): Promise<void> => {
    const leadRef = db.ref(`${FOLDER_ROOTS(companyId).leads}/${leadId}`);
    const snapshot = await leadRef.get();

    if (!snapshot.exists()) throw new Error("Lead not found");

    const lead = snapshot.val() as Lead;
    const newActivity: Activity = {
        id: db.ref().push().key || Date.now().toString(),
        ...activity,
    };

    const updatedHistory = [...(lead.history || []), newActivity];
    await leadRef.update({
        history: updatedHistory,
        updatedAt: new Date().toISOString(),
    });
};

// Inbox Email Operations
export const addInboxEmail = async (companyId: string, data: NewInboxEmail): Promise<string> => {
    const roots = FOLDER_ROOTS(companyId);
    const newKey = db.ref(roots.inboxEmails).push().key;
    if (!newKey) throw new Error("Failed to create key for new inbox email.");

    await db.ref(`${roots.inboxEmails}/${newKey}`).set({
        ...data,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
    });
    return newKey;
};

export const updateInboxEmail = async (companyId: string, id: string, data: InboxEmailUpdate): Promise<void> => {
    await db.ref(`${FOLDER_ROOTS(companyId).inboxEmails}/${id}`).update(data);
};

export const deleteInboxEmail = async (companyId: string, id: string): Promise<void> => {
    await db.ref(`${FOLDER_ROOTS(companyId).inboxEmails}/${id}`).remove();
};

// Email Template Operations
export const addEmailTemplate = async (companyId: string, data: NewEmailTemplate): Promise<string> => {
    const roots = FOLDER_ROOTS(companyId);
    const newKey = db.ref(roots.emailTemplates).push().key;
    if (!newKey) throw new Error("Failed to create key for new email template.");

    await db.ref(`${roots.emailTemplates}/${newKey}`).set({
        ...data,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
    });
    return newKey;
};

export const updateEmailTemplate = async (companyId: string, id: string, data: EmailTemplateUpdate): Promise<void> => {
    await db.ref(`${FOLDER_ROOTS(companyId).emailTemplates}/${id}`).update(data);
};

export const deleteEmailTemplate = async (companyId: string, id: string): Promise<void> => {
    await db.ref(`${FOLDER_ROOTS(companyId).emailTemplates}/${id}`).remove();
};

// --- Scheduled Auto-Responses ---

export const subscribeToScheduledResponses = (companyId: string, cb: (data: ScheduledAutoResponse[]) => void) =>
    createSubscription<ScheduledAutoResponse>(
        FOLDER_ROOTS(companyId).scheduledResponses,
        cb,
        (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime()
    );

export const addScheduledResponse = async (companyId: string, data: NewScheduledAutoResponse): Promise<string> => {
    const roots = FOLDER_ROOTS(companyId);
    const newKey = db.ref(roots.scheduledResponses).push().key;
    if (!newKey) throw new Error("Failed to create key for scheduled response.");
    await db.ref(`${roots.scheduledResponses}/${newKey}`).set({
        ...data,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
    });
    return newKey;
};

export const updateScheduledResponse = async (companyId: string, id: string, data: ScheduledAutoResponseUpdate): Promise<void> => {
    await db.ref(`${FOLDER_ROOTS(companyId).scheduledResponses}/${id}`).update(data);
};

export const deleteScheduledResponse = async (companyId: string, id: string): Promise<void> => {
    await db.ref(`${FOLDER_ROOTS(companyId).scheduledResponses}/${id}`).remove();
};

export const getPendingScheduledResponses = async (companyId: string): Promise<ScheduledAutoResponse[]> => {
    const snapshot = await db.ref(FOLDER_ROOTS(companyId).scheduledResponses)
        .orderByChild('status')
        .equalTo('pending')
        .once('value');

    if (!snapshot.exists()) return [];

    const now = new Date();
    const results: ScheduledAutoResponse[] = [];

    snapshot.forEach((child) => {
        const response = { id: child.key!, ...child.val() } as ScheduledAutoResponse;
        // Only return responses that are due
        if (new Date(response.scheduledFor) <= now) {
            results.push(response);
        }
    });

    return results;
};

// --- Auto-Replied Emails (Track who has received auto-replies) ---

export const subscribeToAutoRepliedEmails = (companyId: string, cb: (data: AutoRepliedEmail[]) => void) =>
    createSubscription<AutoRepliedEmail>(
        FOLDER_ROOTS(companyId).autoRepliedEmails,
        cb,
        (a, b) => a.email.localeCompare(b.email)
    );

export const hasEmailReceivedAutoReply = async (companyId: string, email: string): Promise<boolean> => {
    const normalizedEmail = email.toLowerCase().trim();
    const snapshot = await db.ref(FOLDER_ROOTS(companyId).autoRepliedEmails)
        .orderByChild('email')
        .equalTo(normalizedEmail)
        .once('value');

    return snapshot.exists();
};

export const recordAutoReply = async (
    companyId: string,
    email: string,
    inboxEmailId: string,
    leadId?: string
): Promise<string> => {
    const roots = FOLDER_ROOTS(companyId);
    const normalizedEmail = email.toLowerCase().trim();

    // Check if already exists (double-check)
    const exists = await hasEmailReceivedAutoReply(companyId, normalizedEmail);
    if (exists) {
        throw new Error(`Auto-reply already sent to ${normalizedEmail}`);
    }

    const newKey = db.ref(roots.autoRepliedEmails).push().key;
    if (!newKey) throw new Error("Failed to create key for auto-replied email record.");

    await db.ref(`${roots.autoRepliedEmails}/${newKey}`).set({
        email: normalizedEmail,
        firstAutoReplyAt: new Date().toISOString(),
        inboxEmailId,
        leadId: leadId || null,
    });

    return newKey;
};

export const getAutoRepliedEmails = async (companyId: string): Promise<AutoRepliedEmail[]> => {
    const snapshot = await db.ref(FOLDER_ROOTS(companyId).autoRepliedEmails).once('value');
    if (!snapshot.exists()) return [];

    const results: AutoRepliedEmail[] = [];
    snapshot.forEach((child) => {
        results.push({ id: child.key!, ...child.val() });
    });
    return results;
};

// Convert Lead to Sale - creates a sales document and marks lead as won
export const convertLeadToSale = async (
    companyId: string,
    leadId: string,
    saleData: NewSalesDocument
): Promise<{ saleId: string }> => {
    const roots = FOLDER_ROOTS(companyId);
    const updates: { [key: string]: any } = {};

    // Create the sales document
    const saleKey = db.ref(roots.salesDocuments).push().key;
    if (!saleKey) throw new Error("Failed to create key for sales document.");

    updates[`${roots.salesDocuments}/${saleKey}`] = {
        ...saleData,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
    };

    // Update lead to WON stage
    const now = new Date().toISOString();
    updates[`${roots.leads}/${leadId}/stage`] = LeadStage.WON;
    updates[`${roots.leads}/${leadId}/updatedAt`] = now;

    // Add system activity to lead history
    const leadRef = db.ref(`${roots.leads}/${leadId}`);
    const leadSnap = await leadRef.get();
    if (leadSnap.exists()) {
        const lead = leadSnap.val() as Lead;
        const conversionActivity: Activity = {
            id: db.ref().push().key || Date.now().toString(),
            type: 'SYSTEM',
            content: `Lead converted to sale. Invoice #${saleData.invoiceNumber}`,
            timestamp: now,
        };
        updates[`${roots.leads}/${leadId}/history`] = [...(lead.history || []), conversionActivity];
    }

    // Update vehicle status if linked
    if (saleData.vehicleId) {
        updates[`${roots.vehicles}/${saleData.vehicleId}/status`] = 'Sold';
    }

    await db.ref().update(updates);
    return { saleId: saleKey };
};

// --- CRM Settings ---
export const getCRMSettings = async (companyId: string): Promise<any> => {
    const snapshot = await db.ref(FOLDER_ROOTS(companyId).crmSettings).once('value');
    return snapshot.val() || {};
};

export const updateCRMSettings = async (companyId: string, data: any): Promise<void> => {
    await db.ref(FOLDER_ROOTS(companyId).crmSettings).update({
        ...data,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
    });
};

export const subscribeToCRMSettings = (companyId: string, cb: (settings: any) => void) => {
    const settingsRef = db.ref(FOLDER_ROOTS(companyId).crmSettings);
    const listener = (snap: firebase.database.DataSnapshot) => cb(snap.val() || {});
    settingsRef.on('value', listener);
    return () => settingsRef.off('value', listener);
};

export const unsubscribeFromCRMSettings = (companyId: string) =>
    db.ref(FOLDER_ROOTS(companyId).crmSettings).off();
