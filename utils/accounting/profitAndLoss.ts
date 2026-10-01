// Profit & Loss for any date range, on the accruals basis.
//
// Revenue
//   - Vehicle sales: 'Sales Invoice' documents by invoice date (never deposit slips,
//     proformas or quotes). Net of VAT when VAT-registered:
//       Qualifying / Commercial: VAT is added on top, so net = price.
//       Margin scheme / SOR: VAT is inside the price, so net = price - margin VAT, where
//       margin VAT = (price - cost) / 6, the same figure the VAT Summary returns to HMRC.
//     Delivery charge and surcharge are added (no VAT is charged on them).
//   - Job invoices (status 'Invoice', never 'Quote') and misc invoices: subtotal (ex VAT).
//   - Other income: reconciled money in that is not sale money, a transfer, a loan etc.
//     and not tied to an invoice (cash back, commission, supplier refunds…), net of VAT.
// Cost of sales
//   - Owned cars only (SOR cars are never stock). Opening = owned cars bought before the
//     start and not sold before the start. Purchases = owned cars bought in the period.
//     Closing = owned cars bought by the end and not sold by the end.
//     Owned COGS = opening + purchases - closing.
//   - SOR sales stay grossed up: the full sale is revenue, the owner's payout is a cost.
// Expenses: see expenseRows.ts. Lines that are not trading (transfers, VAT to HMRC,
// drawings, loans, stock purchases, sale money…) are listed under notInPnl instead.

import type {
    SalesDocument, Vehicle, Receipt, StatementTransaction, MiscInvoice, JobInvoice, FinancialAccount,
} from '../../types';
import { buildExpenseRows, ExpenseRow } from './expenseRows';
import { NotInPnlGroup } from './categories';
import { DateRange, inRange, toDay } from './yearEnd';

export interface ProfitAndLossInput {
    range: DateRange;
    salesDocs: SalesDocument[];
    vehicles: Vehicle[];
    receipts: Receipt[];
    transactions: StatementTransaction[];
    miscInvoices: MiscInvoice[];
    jobInvoices: JobInvoice[];
    financialAccounts?: FinancialAccount[];
    isVatRegistered: boolean;
}

export interface SaleLine {
    salesDocId: string;
    invoiceNumber: string;
    date: string;
    vehicleId: string;
    reg: string;
    vatScheme: SalesDocument['vatScheme'];
    isSor: boolean;
    /** Car price as invoiced (for Qualifying/Commercial this is before the VAT on top). */
    price: number;
    deliveryAndSurcharge: number;
    vat: number;
    /** Revenue counted in the P&L. */
    netRevenue: number;
    /** Vehicle cost (owned) or owner payout (SOR). 0 when unknown — see warnings. */
    cost: number;
    grossMargin: number;
}

export interface CategoryTotal {
    category: string;
    net: number;
    vat: number;
    gross: number;
    count: number;
}

export interface StockLine {
    vehicleId: string;
    reg: string;
    purchaseDate: string;
    cost: number;
}

export interface NotInPnlTotal {
    group: NotInPnlGroup;
    label: string;
    moneyIn: number;
    moneyOut: number;
    count: number;
    /** The categories found in this group, with their own totals. */
    categories: { category: string; moneyIn: number; moneyOut: number; count: number }[];
}

export type PnlWarningCode =
    | 'sale_without_vehicle'
    | 'zero_cost'
    | 'missing_purchase_date'
    | 'sold_before_bought'
    | 'unreconciled_bank_lines'
    | 'sold_without_invoice';

export interface PnlWarning {
    code: PnlWarningCode;
    message: string;
    /** Sales document, vehicle or transaction ids the warning is about. */
    refIds: string[];
}

export interface ProfitAndLoss {
    range: DateRange;
    basis: 'accruals';
    isVatRegistered: boolean;
    revenue: {
        vehicleSales: number;
        jobInvoices: number;
        miscInvoices: number;
        otherIncome: number;
        otherIncomeByCategory: CategoryTotal[];
        total: number;
    };
    sales: SaleLine[];
    costOfSales: {
        openingStock: number;
        purchases: number;
        closingStock: number;
        /** opening + purchases - closing */
        ownedCarsSold: number;
        sorPayouts: number;
        total: number;
        openingStockLines: StockLine[];
        purchaseLines: StockLine[];
        closingStockLines: StockLine[];
    };
    grossProfit: number;
    expenses: {
        byCategory: CategoryTotal[];
        total: number;
    };
    netProfit: number;
    notInPnl: {
        byGroup: NotInPnlTotal[];
        totalIn: number;
        totalOut: number;
    };
    /** Every receipt / bank line in the period, the same rows the "Expenses & VAT" list shows. */
    rows: ExpenseRow[];
    warnings: PnlWarning[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v) || 0;

const isSorVehicle = (v: Vehicle | undefined) => v?.ownershipType === 'Sale or Return';

/** The Sales Invoice date for each vehicle (the earliest, if there is ever more than one). */
function saleDatesByVehicle(salesDocs: SalesDocument[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const doc of salesDocs) {
        if (doc.documentType !== 'Sales Invoice' || !doc.vehicleId) continue;
        const d = toDay(doc.invoiceDate);
        if (!d) continue;
        const prev = map.get(doc.vehicleId);
        if (!prev || d < prev) map.set(doc.vehicleId, d);
    }
    return map;
}

/** One sale's revenue split. Exported for the margin report and tests. */
export function saleRevenue(doc: SalesDocument, vehicle: Vehicle | undefined, isVatRegistered: boolean): { price: number; extras: number; vat: number; netRevenue: number } {
    const price = num(doc.price);
    const extras = num(doc.deliveryCharge) + num(doc.surcharge);
    const scheme = vehicle?.vatScheme ?? doc.vatScheme;
    const sor = isSorVehicle(vehicle);
    if (!isVatRegistered) return { price, extras, vat: 0, netRevenue: round2(price + extras) };

    if (!sor && (scheme === 'Qualifying' || scheme === 'Commercial')) {
        // VAT sits on top of the price (DocumentCreator: subtotal = price + vat + extras).
        return { price, extras, vat: round2(num(doc.vat)), netRevenue: round2(price + extras) };
    }
    // Margin scheme or SOR: VAT is inside the price. Use the same margin VAT as the VAT return.
    const vat = vehicle ? Math.max(0, price - num(vehicle.purchasePrice)) / 6 : num(doc.vat);
    return { price, extras, vat: round2(vat), netRevenue: round2(price - vat + extras) };
}

function addToCategory(map: Map<string, CategoryTotal>, row: ExpenseRow) {
    const key = row.category.toLowerCase();
    const t = map.get(key) ?? { category: row.category, net: 0, vat: 0, gross: 0, count: 0 };
    t.net += row.net; t.vat += row.vat; t.gross += row.gross; t.count += 1;
    map.set(key, t);
}

const finishCategories = (map: Map<string, CategoryTotal>): CategoryTotal[] =>
    [...map.values()]
        .map(t => ({ ...t, net: round2(t.net), vat: round2(t.vat), gross: round2(t.gross) }))
        .sort((a, b) => b.net - a.net || a.category.localeCompare(b.category));

export function computeProfitAndLoss(input: ProfitAndLossInput): ProfitAndLoss {
    const { range, salesDocs, vehicles, receipts, transactions, miscInvoices, jobInvoices, financialAccounts, isVatRegistered } = input;
    const warnings: PnlWarning[] = [];
    const vehicleById = new Map(vehicles.map(v => [v.id, v]));

    // --- Vehicle sales ---
    const sales: SaleLine[] = [];
    const noVehicle: string[] = [];
    const zeroCost: string[] = [];
    for (const doc of salesDocs) {
        if (doc.documentType !== 'Sales Invoice') continue;
        const date = toDay(doc.invoiceDate);
        if (!inRange(date, range)) continue;
        const vehicle = vehicleById.get(doc.vehicleId);
        const { price, extras, vat, netRevenue } = saleRevenue(doc, vehicle, isVatRegistered);
        const cost = vehicle ? num(vehicle.purchasePrice) : 0;
        if (!vehicle) noVehicle.push(doc.id);
        else if (cost <= 0) zeroCost.push(doc.id);
        sales.push({
            salesDocId: doc.id,
            invoiceNumber: doc.invoiceNumber,
            date: date!,
            vehicleId: doc.vehicleId,
            reg: vehicle?.reg ?? doc.carDetails?.reg ?? '',
            vatScheme: vehicle?.vatScheme ?? doc.vatScheme,
            isSor: isSorVehicle(vehicle),
            price,
            deliveryAndSurcharge: extras,
            vat,
            netRevenue,
            cost,
            grossMargin: round2(netRevenue - cost),
        });
    }
    sales.sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNumber.localeCompare(b.invoiceNumber));
    if (noVehicle.length) warnings.push({ code: 'sale_without_vehicle', message: `${noVehicle.length} sale(s) have no vehicle record, so their cost of sale is missing (counted as £0).`, refIds: noVehicle });
    if (zeroCost.length) warnings.push({ code: 'zero_cost', message: `${zeroCost.length} sale(s) are for a vehicle with a purchase price of £0.`, refIds: zeroCost });

    const vehicleSales = round2(sales.reduce((s, l) => s + l.netRevenue, 0));
    const jobInvoiceRevenue = round2(jobInvoices
        .filter(inv => inv.status !== 'Quote' && inRange(toDay(inv.invoiceDate), range))
        .reduce((s, inv) => s + num(inv.subtotal), 0));
    const miscInvoiceRevenue = round2(miscInvoices
        .filter(inv => inRange(toDay(inv.invoiceDate), range))
        .reduce((s, inv) => s + num(inv.subtotal), 0));

    // --- Receipts and bank lines ---
    const rows = buildExpenseRows({ range, receipts, transactions, financialAccounts, isVatRegistered });
    const expenseMap = new Map<string, CategoryTotal>();
    const incomeMap = new Map<string, CategoryTotal>();
    const groups = new Map<NotInPnlGroup, NotInPnlTotal>();
    for (const row of rows) {
        if (row.inPnl) {
            addToCategory(row.direction === 'income' ? incomeMap : expenseMap, row);
            continue;
        }
        const g = groups.get(row.notInPnlGroup!) ?? { group: row.notInPnlGroup!, label: row.notInPnlLabel!, moneyIn: 0, moneyOut: 0, count: 0, categories: [] };
        const isIn = row.direction === 'income';
        if (isIn) g.moneyIn += row.gross; else g.moneyOut += row.gross;
        g.count += 1;
        let c = g.categories.find(x => x.category.toLowerCase() === row.category.toLowerCase());
        if (!c) { c = { category: row.category, moneyIn: 0, moneyOut: 0, count: 0 }; g.categories.push(c); }
        if (isIn) c.moneyIn += row.gross; else c.moneyOut += row.gross;
        c.count += 1;
        groups.set(row.notInPnlGroup!, g);
    }
    const otherIncomeByCategory = finishCategories(incomeMap);
    const otherIncome = round2(otherIncomeByCategory.reduce((s, c) => s + c.net, 0));
    const expenseByCategory = finishCategories(expenseMap);
    const totalExpenses = round2(expenseByCategory.reduce((s, c) => s + c.net, 0));
    const notInPnlGroups = [...groups.values()]
        .map(g => ({
            ...g,
            moneyIn: round2(g.moneyIn),
            moneyOut: round2(g.moneyOut),
            categories: g.categories.map(c => ({ ...c, moneyIn: round2(c.moneyIn), moneyOut: round2(c.moneyOut) })),
        }))
        .sort((a, b) => (b.moneyIn + b.moneyOut) - (a.moneyIn + a.moneyOut));

    const unreconciled = transactions.filter(t => t.status !== 'Reconciled' && inRange(toDay(t.date), range));
    if (unreconciled.length) warnings.push({ code: 'unreconciled_bank_lines', message: `${unreconciled.length} bank/card line(s) in this period are not reconciled yet, so they are not in the P&L.`, refIds: unreconciled.map(t => t.id) });

    // --- Stock (owned cars only) ---
    const soldOn = saleDatesByVehicle(salesDocs);
    const opening: StockLine[] = [];
    const purchases: StockLine[] = [];
    const closing: StockLine[] = [];
    const missingDate: string[] = [];
    const soldBeforeBought: string[] = [];
    const soldNoInvoice: string[] = [];
    for (const v of vehicles) {
        if (isSorVehicle(v)) continue;
        const sold = soldOn.get(v.id);
        if (!sold && v.status === 'Sold') soldNoInvoice.push(v.id);
        let bought = toDay(v.purchaseDate);
        if (!bought) {
            // No purchase date: assume it was bought the day it was sold, so a sale in
            // the period still carries its cost. Unsold and undated cars are left out.
            if (!sold) { missingDate.push(v.id); continue; }
            bought = sold;
            missingDate.push(v.id);
        }
        if (sold && sold < bought) soldBeforeBought.push(v.id);
        const line: StockLine = { vehicleId: v.id, reg: v.reg, purchaseDate: bought, cost: num(v.purchasePrice) };
        if (bought < range.start && !(sold && sold < range.start)) opening.push(line);
        if (bought >= range.start && bought <= range.end) purchases.push(line);
        if (bought <= range.end && !(sold && sold <= range.end)) closing.push(line);
    }
    if (missingDate.length) warnings.push({ code: 'missing_purchase_date', message: `${missingDate.length} owned vehicle(s) have no purchase date. Sold ones are treated as bought on the sale date; unsold ones are left out of stock.`, refIds: missingDate });
    if (soldNoInvoice.length) warnings.push({ code: 'sold_without_invoice', message: `${soldNoInvoice.length} owned vehicle(s) are marked Sold but have no Sales Invoice, so they still count as stock.`, refIds: soldNoInvoice });
    if (soldBeforeBought.length) warnings.push({ code: 'sold_before_bought', message: `${soldBeforeBought.length} vehicle(s) have a sale date before their purchase date. Check the dates.`, refIds: soldBeforeBought });

    const sumCost = (lines: StockLine[]) => round2(lines.reduce((s, l) => s + l.cost, 0));
    const openingStock = sumCost(opening);
    const purchaseTotal = sumCost(purchases);
    const closingStock = sumCost(closing);
    const ownedCarsSold = round2(openingStock + purchaseTotal - closingStock);
    const sorPayouts = round2(sales.filter(s => s.isSor).reduce((s, l) => s + l.cost, 0));
    const costOfSalesTotal = round2(ownedCarsSold + sorPayouts);

    const revenueTotal = round2(vehicleSales + jobInvoiceRevenue + miscInvoiceRevenue + otherIncome);
    const grossProfit = round2(revenueTotal - costOfSalesTotal);
    const netProfit = round2(grossProfit - totalExpenses);

    return {
        range,
        basis: 'accruals',
        isVatRegistered,
        revenue: {
            vehicleSales,
            jobInvoices: jobInvoiceRevenue,
            miscInvoices: miscInvoiceRevenue,
            otherIncome,
            otherIncomeByCategory,
            total: revenueTotal,
        },
        sales,
        costOfSales: {
            openingStock,
            purchases: purchaseTotal,
            closingStock,
            ownedCarsSold,
            sorPayouts,
            total: costOfSalesTotal,
            openingStockLines: opening,
            purchaseLines: purchases,
            closingStockLines: closing,
        },
        grossProfit,
        expenses: { byCategory: expenseByCategory, total: totalExpenses },
        netProfit,
        notInPnl: {
            byGroup: notInPnlGroups,
            totalIn: round2(notInPnlGroups.reduce((s, g) => s + g.moneyIn, 0)),
            totalOut: round2(notInPnlGroups.reduce((s, g) => s + g.moneyOut, 0)),
        },
        rows,
        warnings,
    };
}
