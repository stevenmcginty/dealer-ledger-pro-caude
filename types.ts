

export type View = 'dashboard' | 'stock' | 'sales' | 'expenses' | 'income' | 'ledger' | 'vat' | 'filingCabinet' | 'settings' | 'accountant' | 'garage' | 'canvas' | 'workSheets' | 'workPrep' | 'jobInvoices' | 'pipeline' | 'inbox' | 'leadDetail';

export type ModalType = 'vehicle' | 'expense' | 'invoice' | 'editInvoice' | 'jobInvoice' | 'transactionAllocator' | 'categoryAllocator' | 'incomeAllocator' | 'multiReconciler' | 'progress' | 'categoryManager' | 'customerManager' | 'customerDetailView' | 'workSheet' | 'deleteWorkSheetConfirm' | 'miscInvoice' | 'editMiscInvoice' | 'deleteMiscInvoiceConfirm' | 'deleteJobInvoiceConfirm' | 'addInformalVehicle' | 'addGarageCost' | 'assignInvoice' | 'bulkDeleteConfirm' | 'supplier' | 'canvasItem' | 'vehicleActions' | 'invoicePicker' | 'todo' | 'confirmClearData' | 'undoSaleConfirm' | 'undoDepositConfirm' | 'forceUndoSaleConfirm' | 'deleteTodoConfirm' | 'archivePrepConfirm' | 'unarchivePrepConfirm' | 'markMonthPaidConfirm' | 'resequenceConfirm' | 'deleteUploadConfirm' | 'bulkReceiptWizard' | 'archiveDrawer' | 'restoreDrawer' | 'lead' | 'emailComposer' | 'convertLeadToSale' | 'addNote' | 'logCall' | 'createLeadFromEmail' | 'analyzeEmail' | 'addTestEmail' | 'statementMapping';

export type ModalState = { type: ModalType; data?: any } | null;

export type PaymentMethod = 'Bank Transfer' | 'Card' | 'Cash' | 'Finance' | 'Deposit' | 'Other';

export interface Payment {
    method: PaymentMethod;
    amount: number;
    notes?: string;
    date?: string;
}

export interface Vehicle {
    id: string;
    reg: string;
    make: string;
    model: string;
    year: number;
    mileage: number;
    color?: string;
    vin?: string;
    engineSize?: string;
    stockNumber: string;
    purchasePrice: number;
    purchaseDate: string;
    vatScheme: 'Margin' | 'Qualifying' | 'Commercial';
    status: 'Available' | 'Deposit Paid' | 'Sold';
    ownershipType: 'Owned Stock' | 'Sale or Return';
    sorOwner?: { name: string; address: string };
    purchaseTransactionId?: string;
    invoiceUrl?: string; // Purchase invoice file
    v5cUrl?: string; // Legacy field
    v5cUrls?: string[]; // Multiple V5C pages
    motDueDate?: string;
    firstRegistered?: string;
    businessId?: string; // Owner's Firebase UID for multi-business routing
    createdAt: number;
}

export type NewVehicle = Omit<Vehicle, 'id' | 'createdAt' | 'status'>;
export type VehicleUpdate = Partial<NewVehicle> & { status?: Vehicle['status'] };

export interface Receipt {
    id: string;
    vendor: string;
    amount: number;
    vat: number;
    date: string;
    category: string;
    receiptUrl?: string;
    paymentType: 'Direct' | 'On Account';
    status: 'Paid' | 'Unpaid';
    vehicleId?: string;
    reconciledByTxId?: string;
    salesDocumentId?: string; // For SOR payouts
    createdAt: number;
}

export type NewReceipt = Omit<Receipt, 'id' | 'status' | 'createdAt'>;
export type ReceiptUpdate = Partial<NewReceipt> & { status?: Receipt['status'] };

export interface StatementTransaction {
    id: string;
    date: string;
    description: string;
    amount: number;
    type: 'Bank' | 'Credit Card';
    accountId?: string;
    method?: string;
    category: string;
    vatRate: number;
    vatAmount: number;
    status: 'Reconciled' | 'Unreconciled';
    // 'transfer' = money moved between the business's own accounts (e.g. a sweep
    // to savings, or moving funds between two bank accounts). It is not income or
    // an expense, so it's excluded from the VAT return and the profit/expense
    // reports. (null is used only on write to clear a previously-set flag.)
    reconciliationType?: 'transfer' | null;
    linkedVehicleId?: string;
    createdAt: number;
}

export type NewStatementTransaction = Omit<StatementTransaction, 'id' | 'createdAt'>;
export type StatementTransactionUpdate = Partial<NewStatementTransaction>;

export interface FinanceCompany {
    id: string;
    name: string;
    address: string;
}
export type NewFinanceCompany = Omit<FinanceCompany, 'id'>;

export interface ExpenseCategory {
    id: string;
    name: string;
    icon: string;
    color: string;
    order: number;
}
export type NewExpenseCategory = Omit<ExpenseCategory, 'id'>;

export interface BusinessDetails {
    name: string;
    address: string;
    phone: string;
    email: string;
    vatNumber: string;
    companyNumber: string;
    bankDetails: string;
    invoiceTerms: string;
    theme: string;
    vatStartDate: string;
    operatingMode: 'dealership' | 'paint_shop' | 'mechanic';
    isVatRegistered: boolean;
}

export interface ToDoItem {
    id: string;
    description: string;
    isComplete: boolean;
    priority: 'normal' | 'high';
    type: 'general' | 'prep' | 'warranty';
    dueDate?: string;
    dueTime?: string;
    vehicleId?: string;
    vehicleReg?: string;
    remedy?: string;
    origin?: 'deposit' | 'invoice';
    completionDate?: string;
    createdAt: number;
    googleCalendarEventId?: string;
    googleTaskId?: string;
    recurringEventId?: string;
}
export type NewToDoItem = Omit<ToDoItem, 'id' | 'createdAt'>;
export type ToDoItemUpdate = Partial<NewToDoItem>;

export interface WorkSheet {
    id: string;
    workSheetNumber: string;
    vehicleId: string;
    carDetails: Omit<Vehicle, 'id' | 'createdAt' | 'status'>; // Snapshot
    customerName?: string;
    workDate: string;
    items: { description: string; amount?: number }[];
    createdAt: number;
}
export type NewWorkSheet = Omit<WorkSheet, 'id' | 'createdAt'>;
export type WorkSheetUpdate = Partial<NewWorkSheet>;

export interface Customer {
    id: string;
    name: string;
    address: string;
    email?: string;
    phone?: string;
    isBusiness?: boolean;
    vatNumber?: string;
    createdAt: number;
}
export type NewCustomer = Omit<Customer, 'id' | 'createdAt'>;

export interface MiscInvoice {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    customerName: string;
    customerAddress: string;
    isVatInvoice: boolean;
    items: { description: string; amount: number }[];
    subtotal: number;
    vat: number;
    total: number;
    linkedTransactionId?: string;
    createdAt: number;
}
export type NewMiscInvoice = Omit<MiscInvoice, 'id' | 'createdAt' | 'linkedTransactionId'>;
export type MiscInvoiceUpdate = Partial<NewMiscInvoice>;

export interface PartExchangeVehicle {
    reg: string;
    make: string;
    model: string;
    year?: number;
    mileage?: number;
    vin?: string;
}

export type DocumentType = 'Sales Invoice' | 'Proforma Invoice' | 'Deposit Slip' | 'Purchase Invoice';

export interface SalesDocument {
    id: string;
    invoiceNumber: string;
    documentType: DocumentType;
    invoiceDate: string;
    vehicleId: string;
    stockNumber: string;
    vatScheme: 'Margin' | 'Qualifying' | 'Commercial';
    customerName: string;
    customerAddress: string;
    deliveryName?: string;
    deliveryAddress?: string;
    carDetails: Omit<Vehicle, 'id' | 'createdAt' | 'status'>;
    price: number;
    deliveryCharge?: number;
    surcharge?: number;
    pxValue: number;
    partExchangeDetails?: PartExchangeVehicle;
    subtotal: number;
    vat?: number;
    payments: Payment[];
    balance: number;
    deposit?: number; // legacy
    additionalNotes?: string;
    commission?: number; // For SOR
    sorPayableReceiptId?: string;
    createdAt: number;
}
export type NewSalesDocument = Omit<SalesDocument, 'id' | 'createdAt'>;
export type SalesDocumentUpdate = Partial<NewSalesDocument>;

export interface JobInvoice {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    customerId: string;
    customerDetails: Omit<Customer, 'id' | 'createdAt'>;
    status: 'Quote' | 'Invoice';
    items: { description: string; quantity: number; unitPrice: number; total: number }[];
    subtotal: number;
    vat: number;
    total: number;
    payments: Payment[];
    balance: number;
    notes?: string;
    createdAt: number;
}
export type NewJobInvoice = Omit<JobInvoice, 'id' | 'createdAt'>;
export type JobInvoiceUpdate = Partial<NewJobInvoice>;

export interface InternalJob {
    id: string;
    jobSheetNumber: string;
    vehicleId: string;
    carDetails: Vehicle;
    jobDate: string;
    items: { description: string; amount: number }[];
    totalAmount: number;
    createdAt: number;
}
export type NewInternalJob = Omit<InternalJob, 'id' | 'createdAt'>;

export interface InformalVehicle {
    id: string;
    reg: string;
    make: string;
    model: string;
    createdAt: number;
}
export type NewInformalVehicle = Omit<InformalVehicle, 'id' | 'createdAt'>;

export interface GarageCost {
    id: string;
    vehicleReg: string;
    description: string;
    amount: number;
    receiptId?: string;
    createdAt: number;
}
export type NewGarageCost = Omit<GarageCost, 'id' | 'createdAt'>;

export interface Supplier {
    id: string;
    name: string;
    reconciliationKeys: string[];
}
export type NewSupplier = Omit<Supplier, 'id'>;
export type SupplierUpdate = Partial<NewSupplier>;

export interface CanvasItem {
    id: string;
    itemType?: 'file' | 'note';
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    headline: string;
    notes: string;
    color?: 'yellow' | 'pink' | 'blue' | 'green';
    createdAt: number;
}
export type NewCanvasItem = Omit<CanvasItem, 'id' | 'createdAt'>;
export type CanvasItemUpdate = Partial<NewCanvasItem>;

// --- Bank statement column mapping (teaches the importer an unknown bank's CSV layout) ---
export type StatementDateFormat = 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
export type StatementAmountMode = 'single' | 'split';

export interface StatementColumnMapping {
    // Stored as the literal header TEXT the user selected (matched case-insensitively at parse time).
    dateColumn: string;
    descriptionColumn: string;
    amountMode: StatementAmountMode;
    amountColumn?: string;   // used when amountMode === 'single' (one signed column)
    debitColumn?: string;    // used when amountMode === 'split'
    creditColumn?: string;   // used when amountMode === 'split'
    methodColumn?: string;   // optional (e.g. "Transaction Type")
    dateFormat: StatementDateFormat;
    invertAmountSign?: boolean; // for single-column statements where spend shows as positive (common on credit cards)
}

export interface FinancialAccount {
    id: string;
    name: string;
    type: 'Bank' | 'Credit Card';
    columnMapping?: StatementColumnMapping; // saved bank-statement format for this account
}
export type NewFinancialAccount = Omit<FinancialAccount, 'id'>;

export interface UploadBatch {
    id: string;
    filename: string;
    accountId: string;
    accountName: string;
    transactionCount: number;
    uploadedAt: number;
    transactionIds?: string[];
}

export interface Notification {
    id: string;
    type: 'mot';
    message: string;
    vehicleId?: string;
    date: string;
}

export interface GeminiAction {
    intent: string;
    entities: any;
    responseText: string;
}

// CRM Types
export enum LeadStage {
    NEW = 'New Lead',
    QUALIFIED = 'Qualified',
    TEST_DRIVE = 'Test Drive',
    NEGOTIATION = 'Negotiation',
    WON = 'Sold',
    LOST = 'Lost'
}

export type LeadSource =
    | 'Website'
    | 'Walk-in'
    | 'Referral'
    | 'Motors.co.uk'
    | 'CarGurus'
    | 'AutoTrader'
    | 'eBay'
    | 'Facebook'
    | 'Other';

export type ActivityType =
    | 'EMAIL_IN'
    | 'EMAIL_OUT'
    | 'SMS_IN'
    | 'SMS_OUT'
    | 'WHATSAPP_IN'
    | 'WHATSAPP_OUT'
    | 'CALL_LOG'
    | 'NOTE'
    | 'SYSTEM';

export interface Activity {
    id: string;
    type: ActivityType;
    content: string;
    timestamp: string;
    performedBy?: string;
}

export interface Lead {
    id: string;
    ownerId: string; // Firebase user ID for routing
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    source: LeadSource;
    vehicleOfInterest?: string; // Vehicle reg or description
    vehicleId?: string; // Link to Vehicle record
    stage: LeadStage;
    history: Activity[];
    value?: number;
    hasReceivedAutoReply: boolean;
    createdAt: string;
    updatedAt: string;
}
export type NewLead = Omit<Lead, 'id' | 'history' | 'hasReceivedAutoReply'> & {
    history?: Activity[];
    hasReceivedAutoReply?: boolean;
};
export type LeadUpdate = Partial<NewLead>;

export type EmailStatus =
    | 'UNREAD'
    | 'ANALYZING'
    | 'NEEDS_REVIEW'
    | 'SCHEDULED'
    | 'SENT'
    | 'ARCHIVED';

export interface InboxEmail {
    id: string;
    leadId?: string;
    source: string;
    senderName: string;
    senderEmail: string;
    subject: string;
    body: string;
    receivedAt: string;
    status: EmailStatus;
    analysis?: {
        vehicleExtracted?: string;
        suggestedVehicleId?: string;
        suggestedOwner?: string;
        intent?: string;
    };
    createdAt: number;
}
export type NewInboxEmail = Omit<InboxEmail, 'id' | 'createdAt'>;
export type InboxEmailUpdate = Partial<NewInboxEmail>;

export interface EmailTemplate {
    id: string;
    name: string;
    category: string;
    subject: string;
    body: string;
    createdAt: number;
}
export type NewEmailTemplate = Omit<EmailTemplate, 'id' | 'createdAt'>;
export type EmailTemplateUpdate = Partial<NewEmailTemplate>;

// CRM Settings
export interface CRMSettings {
    id: string;
    // Gmail Integration
    gmailConnected: boolean;
    gmailEmail?: string;
    gmailAccessToken?: string;
    gmailRefreshToken?: string;
    gmailTokenExpiry?: number;

    // Auto-response Settings
    autoResponseEnabled: boolean;
    autoResponseDelay: number; // minutes
    autoResponseTemplate?: string;

    // AI Settings
    aiEnabled: boolean;
    aiModel: 'gemini' | 'openai';
    aiAutoAnalyze: boolean;
    aiAutoRespond: boolean;
    aiRequireApproval: boolean;

    // Lead Settings
    autoCreateLeads: boolean;
    defaultLeadOwner?: string;
    leadNotifications: boolean;

    // WhatsApp Integration
    whatsappConnected: boolean;
    whatsappPhoneId?: string;
    whatsappBusinessId?: string;
    whatsappAccessToken?: string;

    // Twilio Integration
    twilioConnected: boolean;
    twilioAccountSid?: string;
    twilioAuthToken?: string;
    twilioPhoneNumber?: string;

    createdAt: number;
    updatedAt: number;
}
export type CRMSettingsUpdate = Partial<Omit<CRMSettings, 'id' | 'createdAt'>>;

export interface DataContextState {
    user: any;
    googleUser: any;
    companyId: string;
    userId: string;
    vehicles: Vehicle[];
    receipts: Receipt[]; // Deprecated, use allReceipts
    allReceipts: Receipt[];
    transactions: StatementTransaction[];
    financeCompanies: FinanceCompany[];
    expenseCategories: ExpenseCategory[];
    businessDetails: BusinessDetails | null;
    theme: string;
    todos: ToDoItem[];
    workSheets: WorkSheet[];
    customers: Customer[];
    miscInvoices: MiscInvoice[];
    salesDocs: SalesDocument[];
    jobInvoices: JobInvoice[];
    internalJobs: InternalJob[];
    informalVehicles: InformalVehicle[];
    garageCosts: GarageCost[];
    suppliers: Supplier[];
    canvasItems: CanvasItem[];
    financialAccounts: FinancialAccount[];
    uploadBatches: UploadBatch[];

    // CRM State
    leads: Lead[];
    inboxEmails: InboxEmail[];
    emailTemplates: EmailTemplate[];
    crmSettings: CRMSettings | null;
    selectedLeadId: string | null;

    isLoading: boolean;
    error: string | null;
    googleSyncError: string | null;
    googleConnectionMessage: string | null;
    isServiceBusiness: boolean;
    isVatRegistered: boolean;

    // Actions
    addVehicle: (data: NewVehicle, seller?: any, delivery?: any) => Promise<any>;
    updateVehicle: (id: string, data: VehicleUpdate) => Promise<void>;
    addReceipt: (data: NewReceipt) => Promise<string>;
    updateReceipt: (id: string, data: ReceiptUpdate) => Promise<void>;
    deleteReceipt: (id: string) => Promise<void>;
    addSalesDocument: (data: NewSalesDocument) => Promise<any>;
    updateSalesDocument: (id: string, data: SalesDocumentUpdate) => Promise<void>;
    deleteSalesDocument: (id: string) => Promise<void>;
    addTransactions: (data: NewStatementTransaction[]) => Promise<string[]>;
    updateTransaction: (id: string, data: StatementTransactionUpdate) => Promise<void>;
    deleteTransactions: (ids: string[]) => Promise<void>;
    addFinanceCompany: (data: NewFinanceCompany) => Promise<void>;
    addExpenseCategory: (name: string) => Promise<void>;
    renameCategory: (id: string, newName: string) => Promise<boolean>;
    deleteExpenseCategory: (id: string) => Promise<boolean>;
    updateExpenseCategories: (categories: ExpenseCategory[]) => Promise<void>;
    updateBusinessDetails: (data: BusinessDetails) => Promise<void>;
    addToDo: (data: NewToDoItem) => Promise<any>;
    updateToDo: (id: string, data: ToDoItemUpdate) => Promise<void>;
    deleteToDo: (id: string) => Promise<void>;
    reclassifyToDo: (id: string, targetCategory: 'general' | 'vehicle', vehicle?: {id: string, reg: string}) => Promise<void>;
    markToDosAsComplete: (ids: string[]) => Promise<void>;
    archivePrepTasks: (ids: string[]) => Promise<void>;
    unarchivePrepTasks: (ids: string[]) => Promise<void>;
    addWorkSheet: (data: NewWorkSheet) => Promise<any>;
    updateWorkSheet: (id: string, data: WorkSheetUpdate) => Promise<void>;
    deleteWorkSheet: (id: string) => Promise<void>;
    addCustomer: (data: NewCustomer) => Promise<string>;
    updateCustomer: (id: string, data: Partial<NewCustomer>) => Promise<void>;
    deleteCustomer: (id: string) => Promise<void>;
    addMiscInvoice: (data: NewMiscInvoice) => Promise<any>;
    updateMiscInvoice: (id: string, data: MiscInvoiceUpdate) => Promise<void>;
    deleteMiscInvoice: (id: string) => Promise<void>;
    addMiscInvoiceAndReconcile: (data: NewMiscInvoice, transactionId: string) => Promise<void>;
    addJobInvoice: (data: NewJobInvoice) => Promise<any>;
    updateJobInvoice: (id: string, data: JobInvoiceUpdate) => Promise<void>;
    deleteJobInvoice: (id: string) => Promise<void>;
    addInformalVehicle: (data: NewInformalVehicle) => Promise<any>;
    deleteInformalVehicle: (id: string) => Promise<void>;
    addGarageCost: (data: NewGarageCost) => Promise<any>;
    deleteGarageCost: (id: string) => Promise<void>;
    addSupplier: (data: NewSupplier) => Promise<any>;
    updateSupplier: (id: string, data: SupplierUpdate) => Promise<void>;
    deleteSupplier: (id: string) => Promise<void>;
    addCanvasItem: (data: NewCanvasItem) => Promise<string>;
    updateCanvasItem: (id: string, data: CanvasItemUpdate) => Promise<void>;
    deleteCanvasItem: (item: CanvasItem) => Promise<void>;
    addFinancialAccount: (data: NewFinancialAccount) => Promise<any>;
    updateFinancialAccount: (id: string, data: Partial<NewFinancialAccount>) => Promise<void>;
    deleteFinancialAccount: (id: string) => Promise<void>;
    deleteUploadBatch: (id: string) => Promise<void>;

    // CRM Actions
    addLead: (data: NewLead) => Promise<string>;
    updateLead: (id: string, data: LeadUpdate) => Promise<void>;
    deleteLead: (id: string) => Promise<void>;
    updateLeadStage: (id: string, stage: LeadStage) => Promise<void>;
    addLeadActivity: (leadId: string, activity: Omit<Activity, 'id'>) => Promise<void>;
    addInboxEmail: (data: NewInboxEmail) => Promise<string>;
    updateInboxEmail: (id: string, data: InboxEmailUpdate) => Promise<void>;
    deleteInboxEmail: (id: string) => Promise<void>;
    addEmailTemplate: (data: NewEmailTemplate) => Promise<string>;
    updateEmailTemplate: (id: string, data: EmailTemplateUpdate) => Promise<void>;
    deleteEmailTemplate: (id: string) => Promise<void>;
    setSelectedLeadId: (id: string | null) => void;
    convertLeadToSale: (leadId: string, saleData: NewSalesDocument) => Promise<void>;
    updateCRMSettings: (data: CRMSettingsUpdate) => Promise<void>;
    connectGmail: () => Promise<void>;
    disconnectGmail: () => Promise<void>;
    sendEmail: (to: string, subject: string, body: string, leadId?: string) => Promise<void>;

    handleGoogleSignIn: () => void;
    handleGoogleSignOut: () => void;
    refreshGoogleCalendarEvents: () => Promise<void>;
    
    // Logic
    undoSale: (doc: SalesDocument) => Promise<void>;
    undoDeposit: (doc: SalesDocument) => Promise<void>;
    undoReconciliation: (tx: StatementTransaction) => Promise<void>;
    reconcileTransactionFromSuggestion: (txId: string, match: { vehicleId?: string; receiptIds?: string[] }) => Promise<void>;
    reconcilePaymentWithMultipleReceipts: (txId: string, receiptIds: string[]) => Promise<void>;
    reconcilePaymentWithAdjustment: (txId: string, receiptIds: string[], amount: number) => Promise<void>;
    reconcileSalePayment: (txId: string, docId: string, payment: Payment) => Promise<void>;
    reconcileMiscInvoicePayment: (txId: string, invId: string) => Promise<void>;
    reconcileJobInvoicePayment: (txId: string, invId: string, payment: Payment) => Promise<void>;
    markReceiptsAsPaid: (ids: string[]) => Promise<void>;
    deleteReceiptFileOnly: (id: string) => Promise<void>;
    convertQuoteToInvoice: (quoteId: string) => Promise<void>;
    tryAutoReconciliation: (receipt: Receipt) => Promise<void>;
    clearAllCompanyData: () => Promise<void>;
    resequenceStockNumbers: () => Promise<void>;
    deleteDataAndFilesByCategories: (categories: string[]) => Promise<void>;
    
    batchArchiveDelete: (items: any[]) => Promise<void>;
    batchRestore: (manifest: any) => Promise<void>;
}