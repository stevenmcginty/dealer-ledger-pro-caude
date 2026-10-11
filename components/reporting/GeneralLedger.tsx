import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { StatementTransaction, SalesDocument, Vehicle } from '../../types';
import { CalculatorIcon, ArrowDownTrayIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { useData } from '../../hooks/useData';
import UkDateInput from '../common/UkDateInput';
import { useToast, Button, Segmented, EmptyState, DataTable, THead, TBody, Th, Tr, Td } from '../ui';
import { cx, eyebrow } from '../ui/cx';
import { Money, moneyText, FootCell } from '../accountant/hubShared';
import { readDirectorSalaries, salaryMonthEnds, salaryPaymentOwner } from '../../utils/accounting/directorSalary';
import { dayOf } from '../../utils/accounting/yearEnd';

interface LedgerEntry {
    date: string;
    details: string;
    account: string;
    ref: string;
    debit: number;
    credit: number;
    vat: number;
    balance?: number;
    sourceId: string;
    sourceType: 'vehicle' | 'sale' | 'transaction' | 'accrual';
    accountType?: 'Bank' | 'Credit Card';
}

/** Optional controlled period (the Accountant hub drives it). Without it the report keeps its own dates. */
interface ControlledPeriodProps { startDate?: string; endDate?: string; hidePeriodBar?: boolean; }

const GeneralLedger = ({ startDate: startProp, endDate: endProp, hidePeriodBar = false }: ControlledPeriodProps = {}) => {
    const { transactions, salesDocs, vehicles, businessDetails } = useData();
    const directorSalaries = useMemo(() => readDirectorSalaries(businessDetails?.directorSalaries), [businessDetails?.directorSalaries]);
    const toast = useToast();
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const [ownStart, setStartDate] = useState(firstDayOfMonth.toISOString().split('T')[0]);
    const [ownEnd, setEndDate] = useState(today.toISOString().split('T')[0]);
    const startDate = startProp ?? ownStart;
    const endDate = endProp ?? ownEnd;
    const [accountFilter, setAccountFilter] = useState<'all' | 'Bank' | 'Credit Card'>('all');

    const ledgerEntries = useMemo(() => {
        const entries: LedgerEntry[] = [];
        // FIX: Explicitly type the Map to prevent type inference issues that may arise from other type errors.
        const txMap = new Map<string, StatementTransaction>(transactions.map(tx => [tx.id, tx]));

        // 1. Vehicle Purchases (Asset acquisition = Debit) for OWNED STOCK only
        vehicles.forEach(v => {
            if (v.ownershipType === 'Owned Stock') {
                const purchaseTx = v.purchaseTransactionId ? txMap.get(v.purchaseTransactionId) : undefined;
                entries.push({
                    date: v.purchaseDate,
                    details: `Purchase: ${v.make} ${v.model}`,
                    account: 'Vehicle Stock',
                    ref: `S#${v.stockNumber}`,
                    debit: v.purchasePrice,
                    credit: 0,
                    vat: 0, // VAT on purchase is part of the transaction entry below
                    sourceId: v.id,
                    sourceType: 'vehicle',
                    accountType: purchaseTx?.type,
                });
            }
        });

        // 2. Vehicle Sales (Revenue = Credit & COGS = Debit)
        salesDocs.forEach(doc => {
            const vehicle = vehicles.find(v => v.id === doc.vehicleId);
            if (doc.documentType === 'Sales Invoice' && vehicle) {
                const isSorSale = vehicle.ownershipType === 'Sale or Return';
                
                if (isSorSale) {
                    const commission = doc.commission !== undefined ? doc.commission : (doc.price - vehicle.purchasePrice);
                    entries.push({
                        date: doc.invoiceDate,
                        details: `Commission: ${doc.carDetails.make} ${doc.carDetails.model}`,
                        account: 'Sales Commission',
                        ref: `INV#${doc.invoiceNumber}`,
                        debit: 0,
                        credit: commission,
                        vat: doc.vat || 0,
                        sourceId: doc.id,
                        sourceType: 'sale'
                    });
                } else {
                    entries.push({
                        date: doc.invoiceDate,
                        details: `Sale: ${doc.carDetails.make} ${doc.carDetails.model}`,
                        account: 'Sales Revenue',
                        ref: `INV#${doc.invoiceNumber}`,
                        debit: 0,
                        credit: doc.price,
                        vat: doc.vat || 0,
                        sourceId: doc.id,
                        sourceType: 'sale'
                    });
                    entries.push({
                        date: doc.invoiceDate,
                        details: `COGS: ${vehicle.make} ${vehicle.model}`,
                        account: 'Cost of Goods Sold',
                        ref: `S#${vehicle.stockNumber}`,
                        debit: vehicle.purchasePrice,
                        credit: 0,
                        vat: 0,
                        sourceId: vehicle.id,
                        sourceType: 'vehicle'
                    });
                }
            }
        });


        // 3. Other Transactions (Expenses = Debit, Other Income = Credit)
        // Internal transfers between own accounts are not income or expenses, so they
        // are omitted from the ledger's P&L entries.
        transactions.forEach(tx => {
            if (tx.status === 'Reconciled' && tx.reconciliationType !== 'transfer') {
                const vatAmount = tx.vatAmount || 0;
                const netAmount = Math.abs(tx.amount) - vatAmount;
                // A director's salary payment settles the accrued salary (below), so it goes to the loan account, not wages.
                const salaryOwner = directorSalaries.length ? salaryPaymentOwner(tx, directorSalaries) : null;
                entries.push({
                    date: tx.date,
                    details: tx.description,
                    account: salaryOwner ? `Director's loan account (salary paid to ${salaryOwner.name})` : tx.category,
                    ref: `TX#${tx.id.substring(0, 6)}`,
                    debit: tx.amount < 0 ? netAmount : 0,
                    credit: tx.amount > 0 ? netAmount : 0,
                    vat: vatAmount,
                    sourceId: tx.id,
                    sourceType: 'transaction',
                    accountType: tx.type,
                });
            }
        });

        return entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    }, [vehicles, salesDocs, transactions, directorSalaries]);

    const filteredEntries = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        const rows = ledgerEntries.filter(e => {
            const entryDate = new Date(e.date);
            const dateMatch = entryDate >= start && entryDate <= end;
            if (!dateMatch) return false;

            if (accountFilter === 'all') {
                return true;
            }
            
            return e.accountType === accountFilter;
        });
        // 4. Accrued director's salary (from the payroll setting): for each payroll month-end in the
        // period, up to today, debit Wages and credit the director's loan account.
        if (accountFilter === 'all' && directorSalaries.length) {
            const today = dayOf(new Date());
            const accrualRange = { start: startDate, end: endDate < today ? endDate : today };
            const accruals: LedgerEntry[] = directorSalaries.flatMap(s => salaryMonthEnds(s, accrualRange).flatMap(day => [{
                date: day,
                details: `Accrued director's salary: ${s.name}`,
                account: 'Wages',
                ref: 'PAYROLL',
                debit: s.monthlyGross,
                credit: 0,
                vat: 0,
                sourceId: `salary-${s.name}-${day}`,
                sourceType: 'accrual' as const,
            }, {
                date: day,
                details: `Accrued director's salary: ${s.name}`,
                account: `Director's loan account: ${s.name}`,
                ref: 'PAYROLL',
                debit: 0,
                credit: s.monthlyGross,
                vat: 0,
                sourceId: `salary-dla-${s.name}-${day}`,
                sourceType: 'accrual' as const,
            }]));
            if (accruals.length) return [...rows, ...accruals].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }
        return rows;
    }, [ledgerEntries, startDate, endDate, accountFilter, directorSalaries]);

    const handleDownload = () => {
        const csvData = filteredEntries.map(e => ({
            Date: e.date,
            Details: e.details,
            Account: e.account,
            Reference: e.ref,
            Debit_Net: e.debit.toFixed(2),
            Credit_Net: e.credit.toFixed(2),
            VAT: e.vat.toFixed(2),
        }));
        if (csvData.length === 0) {
            toast.info("No data to download for the selected period.");
            return;
        }
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `General_Ledger_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const totals = useMemo(() => filteredEntries.reduce((t, e) => ({ debit: t.debit + e.debit, credit: t.credit + e.credit, vat: t.vat + e.vat }), { debit: 0, credit: 0, vat: 0 }), [filteredEntries]);
    const blank = (n: number) => (n > 0 ? <Money value={n} /> : <span className="sr-only">none</span>);

    return (
        <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 print:hidden lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
                {!hidePeriodBar && (
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:flex">
                        <div className="min-w-0">
                            <label htmlFor="start-date" className={cx(eyebrow, 'mb-1.5 block')}>From</label>
                            <UkDateInput id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="sm:w-44" />
                        </div>
                        <span aria-hidden="true" className="pb-3.5 text-ink-3">–</span>
                        <div className="min-w-0">
                            <label htmlFor="end-date" className={cx(eyebrow, 'mb-1.5 block')}>To</label>
                            <UkDateInput id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="sm:w-44" />
                        </div>
                    </div>
                )}
                <div className="flex min-w-0 flex-wrap items-end gap-3 lg:ms-auto">
                    <div className="min-w-0">
                        <p className={cx(eyebrow, 'mb-1.5')} id="ledger-account-label">Account</p>
                        <Segmented
                            ariaLabel="Filter by account"
                            value={accountFilter}
                            onChange={setAccountFilter}
                            options={[{ value: 'all', label: 'All' }, { value: 'Bank', label: 'Bank' }, { value: 'Credit Card', label: 'Credit card' }]}
                        />
                    </div>
                    <Button onClick={handleDownload} icon={<ArrowDownTrayIcon />}>Download CSV</Button>
                </div>
            </div>

            {filteredEntries.length === 0 ? (
                <div className="rounded-card border border-line bg-surface">
                    <EmptyState
                        icon={<CalculatorIcon />}
                        title="No ledger entries"
                        description="Nothing is booked in these dates for this account. Car purchases, sales and reconciled bank lines show here."
                    />
                </div>
            ) : (
                <>
                    <p className="text-sm text-ink-3">
                        <span className="num">{filteredEntries.length}</span> {filteredEntries.length === 1 ? 'entry' : 'entries'} · {formatDate(startDate)} to {formatDate(endDate)} · figures net of VAT
                    </p>
                    <DataTable ariaLabel="General ledger" compact minWidth={760} maxHeight="70vh" className="print:max-h-none print:overflow-visible">
                        <THead>
                            <tr>
                                <Th className="ps-4">Date</Th>
                                <Th>Details</Th>
                                <Th>Account</Th>
                                <Th numeric>Debit</Th>
                                <Th numeric>Credit</Th>
                                <Th numeric className="pe-4">VAT</Th>
                            </tr>
                        </THead>
                        <TBody>
                            {filteredEntries.map((entry, index) => (
                                <Tr key={`${entry.sourceId}-${entry.sourceType}-${index}`}>
                                    <Td className="num ps-4 text-ink-2">{formatDate(entry.date)}</Td>
                                    <Td className="max-w-[22rem] py-1.5">
                                        <span className="block truncate text-ink" title={entry.details}>{entry.details}</span>
                                        <span className="num block text-xs text-ink-3">{entry.ref}</span>
                                    </Td>
                                    <Td className="max-w-[16rem] truncate text-ink-2" title={entry.account}>{entry.account}</Td>
                                    <Td numeric>{blank(entry.debit)}</Td>
                                    <Td numeric>{blank(entry.credit)}</Td>
                                    <Td numeric className="pe-4 text-ink-2">{blank(entry.vat)}</Td>
                                </Tr>
                            ))}
                        </TBody>
                        <tfoot className="sticky bottom-0 z-sticky">
                            <tr>
                                <FootCell colSpan={3} className="ps-4">Totals</FootCell>
                                <FootCell numeric>{moneyText(totals.debit)}</FootCell>
                                <FootCell numeric>{moneyText(totals.credit)}</FootCell>
                                <FootCell numeric className="pe-4">{moneyText(totals.vat)}</FootCell>
                            </tr>
                        </tfoot>
                    </DataTable>
                </>
            )}
        </div>
    );
};

export default GeneralLedger;
