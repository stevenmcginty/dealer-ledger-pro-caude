// Hand-built ledger records for the accounting tests. Each helper fills the required
// fields with harmless defaults so a test only states what it is about.
import type { Vehicle, SalesDocument, Receipt, StatementTransaction, MiscInvoice, JobInvoice } from '../../types';

export const vehicle = (o: Partial<Vehicle> & { id: string }): Vehicle => ({
    reg: `REG-${o.id}`, make: 'Ford', model: 'Focus', year: 2018, mileage: 50000, stockNumber: o.id,
    purchasePrice: 5000, purchaseDate: '2026-01-10', vatScheme: 'Margin', status: 'Available',
    ownershipType: 'Owned Stock', createdAt: 0, ...o,
});

export const sale = (o: Partial<SalesDocument> & { id: string; vehicleId: string }): SalesDocument => ({
    invoiceNumber: `INV-${o.id}`, documentType: 'Sales Invoice', invoiceDate: '2026-07-15', stockNumber: '',
    vatScheme: 'Margin', customerName: 'A Buyer', customerAddress: '', carDetails: {} as SalesDocument['carDetails'],
    price: 10000, pxValue: 0, subtotal: 10000, payments: [], balance: 0, createdAt: 0, ...o,
});

export const receipt = (o: Partial<Receipt> & { id: string }): Receipt => ({
    vendor: 'Supplier', amount: 120, vat: 20, date: '2026-07-10', category: 'Repairs',
    paymentType: 'Direct', status: 'Unpaid', createdAt: 0, ...o,
});

export const tx = (o: Partial<StatementTransaction> & { id: string; amount: number }): StatementTransaction => ({
    date: '2026-07-20', description: 'Bank line', type: 'Bank', category: 'Other', vatRate: 0, vatAmount: 0,
    status: 'Reconciled', createdAt: 0, ...o,
});

export const misc = (o: Partial<MiscInvoice> & { id: string }): MiscInvoice => ({
    invoiceNumber: `M-${o.id}`, invoiceDate: '2026-07-05', customerName: 'C', customerAddress: '', isVatInvoice: true,
    items: [], subtotal: 100, vat: 20, total: 120, createdAt: 0, ...o,
});

export const job = (o: Partial<JobInvoice> & { id: string }): JobInvoice => ({
    invoiceNumber: `J-${o.id}`, invoiceDate: '2026-07-05', customerId: 'c1', customerDetails: {} as JobInvoice['customerDetails'],
    status: 'Invoice', items: [], subtotal: 200, vat: 40, total: 240, payments: [], balance: 0, createdAt: 0, ...o,
});

export const Q3 = { start: '2026-07-01', end: '2026-09-30' };

export const emptyLedger = {
    salesDocs: [] as SalesDocument[], vehicles: [] as Vehicle[], receipts: [] as Receipt[],
    transactions: [] as StatementTransaction[], miscInvoices: [] as MiscInvoice[], jobInvoices: [] as JobInvoice[],
};
