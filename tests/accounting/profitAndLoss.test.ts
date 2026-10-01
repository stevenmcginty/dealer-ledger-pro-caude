import { describe, expect, it } from 'vitest';
import { computeProfitAndLoss, ProfitAndLossInput } from '../../utils/accounting/profitAndLoss';
import { vehicle, sale, receipt, tx, misc, job, Q3, emptyLedger } from './fixtures';

const pnl = (o: Partial<ProfitAndLossInput>) =>
    computeProfitAndLoss({ ...emptyLedger, range: Q3, isVatRegistered: true, ...o });

describe('revenue', () => {
    it('adds up every sale, not just the last one (bug 1)', () => {
        const r = pnl({
            isVatRegistered: false,
            vehicles: [vehicle({ id: 'a' }), vehicle({ id: 'b' }), vehicle({ id: 'c' })],
            salesDocs: [
                sale({ id: 's1', vehicleId: 'a', price: 10000 }),
                sale({ id: 's2', vehicleId: 'b', price: 12000 }),
                sale({ id: 's3', vehicleId: 'c', price: 8000 }),
            ],
        });
        expect(r.revenue.vehicleSales).toBe(30000);
        expect(r.sales).toHaveLength(3);
    });

    it('a Qualifying sale has VAT on top, so the net revenue is the price (bug 4)', () => {
        const r = pnl({
            vehicles: [vehicle({ id: 'q', vatScheme: 'Qualifying', purchasePrice: 7000 })],
            salesDocs: [sale({ id: 's', vehicleId: 'q', vatScheme: 'Qualifying', price: 10000, vat: 2000, subtotal: 12000 })],
        });
        expect(r.revenue.vehicleSales).toBe(10000);
        expect(r.sales[0].vat).toBe(2000);
    });

    it('a Margin sale has VAT inside the price: net = price - (price - cost)/6', () => {
        const r = pnl({
            vehicles: [vehicle({ id: 'm', purchasePrice: 7000 })],
            salesDocs: [sale({ id: 's', vehicleId: 'm', price: 10000, vat: 500 })],
        });
        expect(r.sales[0].vat).toBe(500);
        expect(r.revenue.vehicleSales).toBe(9500);
    });

    it('adds the delivery charge and surcharge (bug 5)', () => {
        const r = pnl({
            vehicles: [vehicle({ id: 'm', purchasePrice: 7000 })],
            salesDocs: [sale({ id: 's', vehicleId: 'm', price: 10000, deliveryCharge: 100, surcharge: 50 })],
        });
        expect(r.revenue.vehicleSales).toBe(9650);
    });

    it('counts only Sales Invoices, by invoice date', () => {
        const r = pnl({
            isVatRegistered: false,
            vehicles: [vehicle({ id: 'a' })],
            salesDocs: [
                sale({ id: 'd', vehicleId: 'a', documentType: 'Deposit Slip', price: 500 }),
                sale({ id: 'p', vehicleId: 'a', documentType: 'Proforma Invoice', price: 9000 }),
                sale({ id: 'old', vehicleId: 'a', invoiceDate: '2026-06-30', price: 9000 }),
            ],
        });
        expect(r.revenue.vehicleSales).toBe(0);
    });

    it('counts job invoices for a dealer too, but never quotes (bug 9)', () => {
        const r = pnl({
            jobInvoices: [job({ id: 'j1', subtotal: 200 }), job({ id: 'j2', subtotal: 999, status: 'Quote' })],
            miscInvoices: [misc({ id: 'm1', subtotal: 100 })],
        });
        expect(r.revenue.jobInvoices).toBe(200);
        expect(r.revenue.miscInvoices).toBe(100);
        expect(r.revenue.total).toBe(300);
    });

    it('treats positive trading lines not tied to an invoice as other income, net of VAT', () => {
        const r = pnl({
            transactions: [
                tx({ id: 'cb', amount: 50, category: 'cash back' }),
                tx({ id: 'cm', amount: 820.3, category: 'Commission' }),
                tx({ id: 'rf', amount: 120, vatAmount: 20, category: 'Refund', type: 'Credit Card' }),
            ],
        });
        expect(r.revenue.otherIncome).toBe(970.3);
        expect(r.expenses.total).toBe(0);
    });
});

describe('expenses', () => {
    it("a 'Vehicle Sale' bank line is sale money, not a negative expense (bug 2)", () => {
        const r = pnl({ transactions: [tx({ id: 't', amount: 10000, category: 'Vehicle Sale' })] });
        expect(r.expenses.total).toBe(0);
        expect(r.revenue.otherIncome).toBe(0);
        const g = r.notInPnl.byGroup.find(x => x.group === 'sale_money');
        expect(g?.moneyIn).toBe(10000);
    });

    it('a receipt and the bank line it is linked to count once, by the receipt', () => {
        const r = pnl({
            receipts: [receipt({ id: 'r1', amount: 120, vat: 20, reconciledByTxId: 't1', status: 'Paid' })],
            transactions: [tx({ id: 't1', amount: -120, vatAmount: 20, category: 'Repairs' })],
        });
        expect(r.expenses.total).toBe(100);
        expect(r.expenses.byCategory).toEqual([{ category: 'Repairs', net: 100, vat: 20, gross: 120, count: 1 }]);
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0]).toMatchObject({ source: 'receipt', reconciled: true, transactionId: 't1' });
    });

    it('a bank line paying a receipt from an earlier period is not counted again', () => {
        const r = pnl({
            receipts: [receipt({ id: 'r1', date: '2026-06-20', reconciledByTxId: 't1' })],
            transactions: [tx({ id: 't1', amount: -120, date: '2026-07-02', category: 'Repairs' })],
        });
        expect(r.expenses.total).toBe(0);
        expect(r.rows).toHaveLength(0);
    });

    it('counts receipts that are not reconciled yet, including On Account bills (bug 6)', () => {
        const r = pnl({
            receipts: [
                receipt({ id: 'a', amount: 240, vat: 40, paymentType: 'On Account', status: 'Unpaid' }),
                receipt({ id: 'b', amount: 60, vat: 10, category: 'Fuel' }),
                receipt({ id: 'june', amount: 999, vat: 0, date: '2026-06-30' }),
            ],
        });
        expect(r.expenses.total).toBe(250);
        expect(r.rows.find(x => x.receiptId === 'a')?.account).toBe('On supplier account');
    });

    it('counts reconciled bank lines with no receipt (direct debits)', () => {
        const r = pnl({
            transactions: [
                tx({ id: 'dd', amount: -60, vatAmount: 10, category: 'Phone' }),
                tx({ id: 'open', amount: -500, category: 'Phone', status: 'Unreconciled' }),
            ],
        });
        expect(r.expenses.total).toBe(50);
        expect(r.warnings.map(w => w.code)).toContain('unreconciled_bank_lines');
    });

    it('expenses are gross when not VAT-registered', () => {
        const r = pnl({ isVatRegistered: false, receipts: [receipt({ id: 'a', amount: 120, vat: 20 })] });
        expect(r.expenses.total).toBe(120);
    });

    it('keeps non-trading lines out of the P&L and lists them by group (bug 3)', () => {
        const r = pnl({
            transactions: [
                tx({ id: 'vat', amount: -6404.77, category: 'Tax', description: 'HMRC E VAT' }),
                tx({ id: 'vat2', amount: -1000, category: 'VAT Payment' }),
                tx({ id: 'ct', amount: -3000, category: 'Corporation Tax' }),
                tx({ id: 'pers', amount: -200, category: 'Personal' }),
                tx({ id: 'bbl', amount: -852.22, category: 'BBL' }),
                tx({ id: 'dla', amount: 5000, category: "Director's Loan" }),
                tx({ id: 'div', amount: -2000, category: 'Dividends' }),
                tx({ id: 'cc', amount: -1321.95, category: 'Credit Card' }),
                tx({ id: 'ccin', amount: 1321.95, category: 'Credit Card Payment', type: 'Credit Card' }),
                tx({ id: 'tr', amount: -5000, category: 'Savings', reconciliationType: 'transfer' }),
                tx({ id: 'car', amount: -4000, category: 'Car Purchase' }),
                tx({ id: 'sorOut', amount: -7450, category: 'SOR' }),
                tx({ id: 'sorIn', amount: 1681, category: 'sor' }),
                tx({ id: 'cs', amount: 9000, category: ' Car Sale ' }),
                tx({ id: 'dep', amount: 500, category: 'Deposit' }),
            ],
        });
        expect(r.expenses.total).toBe(0);
        expect(r.revenue.otherIncome).toBe(0);
        expect(r.netProfit).toBe(0);
        const byGroup = Object.fromEntries(r.notInPnl.byGroup.map(g => [g.group, g]));
        expect(byGroup.hmrc_tax.moneyOut).toBe(6404.77);
        expect(byGroup.vat_hmrc.moneyOut).toBe(1000);
        expect(byGroup.corporation_tax.moneyOut).toBe(3000);
        expect(byGroup.drawings.moneyOut).toBe(200);
        expect(byGroup.loan.moneyOut).toBe(852.22);
        expect(byGroup.director_loan.moneyIn).toBe(5000);
        expect(byGroup.dividend.moneyOut).toBe(2000);
        expect(byGroup.credit_card_payment).toMatchObject({ moneyOut: 1321.95, moneyIn: 1321.95, count: 2 });
        expect(byGroup.transfer.moneyOut).toBe(5000);
        expect(byGroup.stock_purchase.moneyOut).toBe(4000);
        expect(byGroup.sor_payout.moneyOut).toBe(7450);
        expect(byGroup.sale_money.moneyIn).toBe(1681 + 9000 + 500);
        expect(r.notInPnl.totalIn).toBe(5000 + 1321.95 + 1681 + 9000 + 500);
    });

    it('an SOR payout receipt is not an expense (the payout is already cost of sales)', () => {
        const r = pnl({ receipts: [receipt({ id: 'p', category: 'SOR Payout', amount: 8000, vat: 0, paymentType: 'On Account' })] });
        expect(r.expenses.total).toBe(0);
        expect(r.notInPnl.byGroup[0]).toMatchObject({ group: 'sor_payout', moneyOut: 8000 });
    });

    it('groups category names case-insensitively', () => {
        const r = pnl({
            receipts: [receipt({ id: 'a', category: 'Fuel', amount: 12, vat: 2 }), receipt({ id: 'b', category: 'fuel ', amount: 24, vat: 4 })],
        });
        expect(r.expenses.byCategory).toHaveLength(1);
        expect(r.expenses.byCategory[0]).toMatchObject({ category: 'Fuel', net: 30, count: 2 });
    });
});

describe('cost of sales and stock (bug 7)', () => {
    const vehicles = [
        vehicle({ id: 'A', purchaseDate: '2026-05-01', purchasePrice: 5000 }),                // in stock all period
        vehicle({ id: 'B', purchaseDate: '2026-06-01', purchasePrice: 6000 }),                // opening, sold in period
        vehicle({ id: 'C', purchaseDate: '2026-07-15', purchasePrice: 4000 }),                // bought in period, unsold
        vehicle({ id: 'D', purchaseDate: '2026-08-01', purchasePrice: 3000 }),                // bought and sold in period
        vehicle({ id: 'E', purchaseDate: '2026-03-01', purchasePrice: 2000 }),                // sold before the period
        vehicle({ id: 'F', purchaseDate: '2026-06-01', purchasePrice: 8000, ownershipType: 'Sale or Return' }), // SOR sold in period
        vehicle({ id: 'G', purchaseDate: '2026-10-05', purchasePrice: 9000 }),                // bought after the period
    ];
    const salesDocs = [
        sale({ id: 'sB', vehicleId: 'B', invoiceDate: '2026-08-01', price: 7000 }),
        sale({ id: 'sD', vehicleId: 'D', invoiceDate: '2026-09-01', price: 4000 }),
        sale({ id: 'sE', vehicleId: 'E', invoiceDate: '2026-06-15', price: 2500 }),
        sale({ id: 'sF', vehicleId: 'F', invoiceDate: '2026-08-10', price: 9000 }),
    ];

    it('values stock from owned cars at the dates, never SOR cars', () => {
        const r = pnl({ isVatRegistered: false, vehicles, salesDocs });
        expect(r.costOfSales.openingStock).toBe(11000);   // A + B
        expect(r.costOfSales.purchases).toBe(7000);       // C + D
        expect(r.costOfSales.closingStock).toBe(9000);    // A + C
        expect(r.costOfSales.ownedCarsSold).toBe(9000);   // B + D
        expect(r.costOfSales.sorPayouts).toBe(8000);      // F, grossed up
        expect(r.costOfSales.total).toBe(17000);
        expect(r.revenue.vehicleSales).toBe(7000 + 4000 + 9000);
        expect(r.grossProfit).toBe(20000 - 17000);
    });

    it('warns about a sale with no vehicle record or a zero cost instead of hiding it', () => {
        const r = pnl({
            vehicles: [vehicle({ id: 'z', purchasePrice: 0 })],
            salesDocs: [sale({ id: 'ghost', vehicleId: 'missing' }), sale({ id: 'free', vehicleId: 'z' })],
        });
        const codes = r.warnings.map(w => w.code);
        expect(codes).toContain('sale_without_vehicle');
        expect(codes).toContain('zero_cost');
        expect(r.warnings.find(w => w.code === 'sale_without_vehicle')?.refIds).toEqual(['ghost']);
    });

    it('warns about an owned car marked Sold with no Sales Invoice', () => {
        const r = pnl({ vehicles: [vehicle({ id: 'x', status: 'Sold', purchaseDate: '2026-01-01' })] });
        expect(r.warnings.map(w => w.code)).toContain('sold_without_invoice');
        expect(r.costOfSales.closingStock).toBe(5000);
    });
});

describe('net profit', () => {
    it('is revenue - cost of sales - expenses', () => {
        const r = pnl({
            isVatRegistered: false,
            vehicles: [vehicle({ id: 'a', purchaseDate: '2026-07-01', purchasePrice: 6000 })],
            salesDocs: [sale({ id: 's', vehicleId: 'a', price: 10000 })],
            receipts: [receipt({ id: 'r', amount: 500, vat: 0 })],
            transactions: [tx({ id: 'cb', amount: 25, category: 'cash back' }), tx({ id: 'cs', amount: 10000, category: 'Car Sale' })],
        });
        expect(r.revenue.total).toBe(10025);
        expect(r.costOfSales.total).toBe(6000);
        expect(r.expenses.total).toBe(500);
        expect(r.netProfit).toBe(3525);
    });
});
