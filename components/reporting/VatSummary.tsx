import React, { useState, useMemo, useRef } from 'react';
import { formatCurrency, formatDate, toYYYYMMDD } from '../../utils/helpers';
import { DocumentTextIcon, CreditCardIcon, PlusIcon, TrashIcon } from '../icons';
import { useData } from '../../hooks/useData';
import UkDateInput from '../common/UkDateInput';
import { useToast } from '../ui';
import { exportMtdVatSheet } from '../../utils/mtdVatExport';
import type { SalesDocument, Vehicle, MiscInvoice, StatementTransaction, JobInvoice, VatAdjustment, NewVatAdjustment } from '../../types';

const getVatPeriod = (targetDate: Date, vatAnchorDateStr?: string): { start: Date; end: Date } => {
    // Fallback to standard calendar quarters if no anchor date is set or is invalid
    if (!vatAnchorDateStr || vatAnchorDateStr.length < 10) {
        const quarter = Math.floor(targetDate.getMonth() / 3);
        const start = new Date(targetDate.getFullYear(), quarter * 3, 1);
        const end = new Date(targetDate.getFullYear(), quarter * 3 + 3, 0);
        return { start, end };
    }

    const anchorDate = new Date(vatAnchorDateStr);
    const anchorMonth = anchorDate.getMonth(); // 0-11

    const quarterStartMonths = [
        anchorMonth,
        (anchorMonth + 3) % 12,
        (anchorMonth + 6) % 12,
        (anchorMonth + 9) % 12
    ].sort((a, b) => a - b); // e.g. [1, 4, 7, 10] for a Feb start

    const targetMonth = targetDate.getMonth();
    const targetYear = targetDate.getFullYear();

    let startMonth, startYear;

    // Find the start month for the quarter the target date is in
    const currentQuarterStartMonth = quarterStartMonths.slice().reverse().find(m => m <= targetMonth);
    
    if (currentQuarterStartMonth !== undefined) {
        startMonth = currentQuarterStartMonth;
        startYear = targetYear;
    } else {
        // Target month is before the first quarter start month of the year (e.g., target is Jan, quarters start in Feb)
        // so it belongs to the last quarter of the previous year.
        startMonth = quarterStartMonths[3];
        startYear = targetYear - 1;
    }

    const start = new Date(startYear, startMonth, 1);
    const end = new Date(startYear, startMonth + 3, 0); // Day 0 of the month after the end of the quarter is the last day of the quarter

    return { start, end };
};

/**
 * The VAT Summary figures for a period. Moved out of the component unchanged so the
 * Accountant hub's Overview shows the same VAT due as this screen. Optional VAT
 * adjustments (late claims, corrections) dated in the period add to Box 1 / Box 4 only.
 */
export function computeVatSummary({ startDate, endDate, salesDocs, vehicles, miscInvoices, transactions, isServiceBusiness, jobInvoices, vatAdjustments = [] }: {
  startDate: string; endDate: string; salesDocs: SalesDocument[]; vehicles: Vehicle[]; miscInvoices: MiscInvoice[];
  transactions: StatementTransaction[]; isServiceBusiness: boolean; jobInvoices: JobInvoice[]; vatAdjustments?: VatAdjustment[];
}) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const periodSales = salesDocs.filter(doc => doc.documentType === 'Sales Invoice' && new Date(doc.invoiceDate) >= start && new Date(doc.invoiceDate) <= end);
    const periodJobInvoices = jobInvoices.filter(inv => new Date(inv.invoiceDate) >= start && new Date(inv.invoiceDate) <= end);
    const periodMiscInvoices = miscInvoices.filter(inv => new Date(inv.invoiceDate) >= start && new Date(inv.invoiceDate) <= end);
    // Internal transfers between own accounts (e.g. to savings) are not income or
    // an expense, so they're excluded from all VAT figures below.
    const periodTransactions = transactions.filter(tx => tx.status === 'Reconciled' && tx.reconciliationType !== 'transfer' && new Date(tx.date) >= start && new Date(tx.date) <= end);
    const periodAdjustments = vatAdjustments.filter(a => new Date(a.date) >= start && new Date(a.date) <= end);
    const adjustmentOutputVat = periodAdjustments.filter(a => a.box === 'output').reduce((sum, a) => sum + a.amount, 0);
    const adjustmentInputVat = periodAdjustments.filter(a => a.box === 'input').reduce((sum, a) => sum + a.amount, 0);

    // --- Output VAT Calculation ---
    let totalMarginVat = 0;
    let otherOutputVat = 0;

    if (isServiceBusiness) {
        otherOutputVat += periodJobInvoices.reduce((sum, inv) => sum + (inv.vat || 0), 0);
    } else {
        // VAT from Vehicle Sales
        periodSales.forEach(doc => {
            const vehicle = vehicles.find(v => v.id === doc.vehicleId);
            if (!vehicle) return;
            
            const isMarginScheme = vehicle.vatScheme === 'Margin' || vehicle.ownershipType === 'Sale or Return';
            
            if (isMarginScheme) {
                const margin = doc.price - vehicle.purchasePrice;
                if (margin > 0) {
                    totalMarginVat += margin / 6;
                }
            } else { // Qualifying or Commercial
                otherOutputVat += doc.vat || 0;
            }
        });
    }

    // VAT from Miscellaneous Invoices
    otherOutputVat += periodMiscInvoices.reduce((sum, inv) => sum + (inv.vat || 0), 0);

    // VAT from other reconciled income
    otherOutputVat += periodTransactions
      .filter(tx => tx.amount > 0 && !['Vehicle Sale', 'Sales Deposit', 'Miscellaneous Income', 'Job Invoice Payment'].includes(tx.category))
      .reduce((sum, tx) => sum + (tx.vatAmount || 0), 0);

    const totalOutputVat = totalMarginVat + otherOutputVat + adjustmentOutputVat;

    // --- Input VAT Calculation ---
    const totalInputVat = periodTransactions
      .filter(tx => tx.amount < 0)
      .reduce((sum, tx) => sum + (tx.vatAmount || 0), 0) + adjustmentInputVat;

    const vatDue = totalOutputVat - totalInputVat;

    // --- Net Sales & Expenses for display ---
    const totalSalesNet = isServiceBusiness 
        ? periodJobInvoices.reduce((sum, inv) => sum + inv.subtotal, 0)
        : periodSales.reduce((sum, doc) => sum + (doc.price - (doc.vat || 0)), 0) + periodMiscInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);
        
    const totalExpensesNet = periodTransactions
        .filter(tx => tx.amount < 0)
        .reduce((sum, tx) => sum + (Math.abs(tx.amount) - (tx.vatAmount || 0)), 0);

    return { 
        totalSalesNet,
        totalMarginVat,
        otherOutputVat,
        totalOutputVat,
        totalExpensesNet,
        totalInputVat,
        adjustmentInputVat,
        adjustmentOutputVat,
        vatDue 
    };
}

const inputCls = 'block w-full min-w-0 rounded-md border-0 bg-gray-700 px-3 py-2 text-sm text-white ring-1 ring-inset ring-gray-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-brand-500';
const boxLabel = (box: VatAdjustment['box']) => box === 'input' ? 'Input VAT (claim back)' : 'Output VAT (pay)';

/** Add form for one VAT adjustment. The date starts at the period end. */
const VatAdjustmentForm = ({ defaultDate, onSave }: { defaultDate: string; onSave: (a: NewVatAdjustment) => Promise<void> }) => {
    const [date, setDate] = useState(defaultDate);
    const [box, setBox] = useState<VatAdjustment['box']>('input');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const value = Number(amount);
    const valid = date !== '' && description.trim() !== '' && isFinite(value) && value > 0;
    return (
        <form
            className="grid grid-cols-1 gap-2 sm:grid-cols-[11rem_minmax(0,14rem)_8rem_minmax(0,1fr)_auto] sm:items-center"
            onSubmit={async e => {
                e.preventDefault(); if (!valid || busy) return; setBusy(true);
                try { await onSave({ date, box, amount: Math.round(Math.abs(value) * 100) / 100, description: description.trim() }); setAmount(''); setDescription(''); }
                finally { setBusy(false); }
            }}
        >
            <UkDateInput id="vat-adjustment-date" name="vat-adjustment-date" value={date} onChange={e => setDate(e.target.value)} />
            <select aria-label="Adjustment type" value={box} onChange={e => setBox(e.target.value as VatAdjustment['box'])} className={inputCls}>
                <option value="input">Input VAT to claim back</option>
                <option value="output">Output VAT to pay</option>
            </select>
            <input aria-label="Amount in pounds" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputCls} text-right tabular-nums`} />
            <input aria-label="Description" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Late claim: BCA invoice ..." className={inputCls} />
            <button type="submit" disabled={!valid || busy} className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40">
                <PlusIcon className="h-4 w-4" />Add
            </button>
        </form>
    );
};

/** Optional controlled period (the Accountant hub drives it). Without it the report keeps its own dates. */
interface ControlledPeriodProps { startDate?: string; endDate?: string; hidePeriodBar?: boolean; }

const VatSummary = ({ startDate: startProp, endDate: endProp, hidePeriodBar = false }: ControlledPeriodProps = {}) => {
  // FIX: Replaced `isPaintShop` with `isServiceBusiness` which is available in the data context.
  const { transactions, salesDocs, vehicles, miscInvoices, businessDetails, isServiceBusiness, jobInvoices, vatAdjustments, addVatAdjustment, deleteVatAdjustment } = useData();
  const toast = useToast();
  
  const [ownStart, setStartDate] = useState(() => toYYYYMMDD(getVatPeriod(new Date(), businessDetails?.vatStartDate).start));
  const [ownEnd, setEndDate] = useState(() => toYYYYMMDD(getVatPeriod(new Date(), businessDetails?.vatStartDate).end));
    const startDate = startProp ?? ownStart;
    const endDate = endProp ?? ownEnd;
  const [exportingPdf, setExportingPdf] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const handleExportPdf = async () => {
    if (!summaryRef.current) return;
    setExportingPdf(true);
    try {
      // Kept local (not utils/pdf.ts) because this export interleaves a title
      // page band between canvas capture and addImage; only the libraries load dynamically.
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const canvas = await html2canvas(summaryRef.current, {
        backgroundColor: '#1f2937',
        scale: 2,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // Add title
      pdf.setFontSize(16);
      pdf.setTextColor(255, 255, 255);
      pdf.setFillColor(31, 41, 55);
      pdf.rect(0, 0, pdfWidth, pdfHeight + 20, 'F');
      pdf.text(`VAT Summary: ${formatDate(startDate)} - ${formatDate(endDate)}`, 10, 12);
      
      pdf.addImage(imgData, 'PNG', 0, 18, pdfWidth, pdfHeight);
      pdf.save(`VAT-Summary-${startDate}-to-${endDate}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error("Could not export the PDF. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  };

  const vatData = useMemo(
    () => computeVatSummary({ startDate, endDate, salesDocs, vehicles, miscInvoices, transactions, isServiceBusiness, jobInvoices, vatAdjustments }),
    [startDate, endDate, salesDocs, vehicles, miscInvoices, transactions, isServiceBusiness, jobInvoices, vatAdjustments],
  );

  // The adjustments listed on screen: the same period filter computeVatSummary uses.
  const periodAdjustments = useMemo(() => {
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);
    return vatAdjustments
      .filter(a => new Date(a.date) >= start && new Date(a.date) <= end)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [vatAdjustments, startDate, endDate]);

  const handleAddAdjustment = async (a: NewVatAdjustment) => {
    try { await addVatAdjustment(a); }
    catch (err) { console.error('Add VAT adjustment failed:', err); toast.error("Could not save the VAT adjustment. Please try again."); }
  };

  const handleExportMtdSheet = async () => {
    const round2 = (value: number) => Math.round(value * 100) / 100;
    const box1 = round2(vatData.totalOutputVat);
    const box2 = 0;
    const box3 = round2(box1 + box2);
    const box4 = round2(vatData.totalInputVat);
    const box5 = round2(box3 - box4);
    try {
      await exportMtdVatSheet({
        companyName: businessDetails?.name ?? '',
        vatNumber: businessDetails?.vatNumber ?? '',
        periodStart: startDate,
        periodEnd: endDate,
        boxes: [box1, box2, box3, box4, box5, Math.floor(vatData.totalSalesNet - vatData.totalMarginVat), Math.floor(vatData.totalExpensesNet), 0, 0],
      });
    } catch (err) {
      console.error('MTD sheet export failed:', err);
      toast.error("Could not export the MTD VAT sheet. Please try again.");
    }
  };

  const setPeriod = (period: 'this_quarter' | 'last_quarter') => {
    const today = new Date();
    // Use day 15 to avoid month-end issues when subtracting months
    const targetDate = period === 'last_quarter' ? new Date(today.getFullYear(), today.getMonth() - 3, 15) : today;
    const { start, end } = getVatPeriod(targetDate, businessDetails?.vatStartDate);
    setStartDate(toYYYYMMDD(start));
    setEndDate(toYYYYMMDD(end));
  };

  return (
    <div className="space-y-6">
        <div className={hidePeriodBar ? 'flex flex-wrap items-center justify-end gap-3' : 'p-4 bg-gray-800 rounded-lg shadow-md flex flex-wrap items-center justify-between gap-4'}>
            <div className={`flex items-center gap-4 flex-wrap ${hidePeriodBar ? 'hidden' : ''}`}>
                <div><label htmlFor="start-date" className="block text-sm font-medium text-gray-400">Start Date</label><UkDateInput id="start-date" name="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1"/></div>
                <div><label htmlFor="end-date" className="block text-sm font-medium text-gray-400">End Date</label><UkDateInput id="end-date" name="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1"/></div>
            </div>
            <div className="flex flex-wrap items-center gap-2">{!hidePeriodBar && <><button onClick={() => setPeriod('this_quarter')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">This Quarter</button><button onClick={() => setPeriod('last_quarter')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">Last Quarter</button></>}<button onClick={handleExportPdf} disabled={exportingPdf} className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-md flex items-center gap-1.5">{exportingPdf ? '⏳ Saving...' : '📄 Save PDF'}</button>{businessDetails?.mtdVatExportEnabled && <button onClick={handleExportMtdSheet} className="px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-md flex items-center gap-1.5">📊 Export MTD Sheet</button>}</div>
        </div>

        <div ref={summaryRef} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-blue-900/50 border-blue-700 p-6 rounded-lg shadow-lg border">
                 <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-300">Total Sales (Net)</p>
                        <p className="mt-1 text-3xl font-bold text-white">{formatCurrency(vatData.totalSalesNet)}</p>
                        <div className="mt-2 text-xs text-gray-400 space-y-1">
                            {!isServiceBusiness && <p>VAT on Margin: <span className="font-semibold text-gray-200">{formatCurrency(vatData.totalMarginVat)}</span></p>}
                            <p>Other Output VAT: <span className="font-semibold text-gray-200">{formatCurrency(vatData.otherOutputVat)}</span></p>
                            {vatData.adjustmentOutputVat !== 0 && <p>Adjustments: pay <span className="font-semibold text-gray-200">{formatCurrency(vatData.adjustmentOutputVat)}</span></p>}
                            <p className="font-bold text-sm text-gray-200 pt-1 border-t border-blue-800">Total Output VAT: <span className="text-white">{formatCurrency(vatData.totalOutputVat)}</span></p>
                        </div>
                    </div>
                    <div className="p-3 rounded-full bg-blue-900/50 border-blue-700"><DocumentTextIcon className="h-6 w-6 text-blue-400" /></div>
                 </div>
             </div>
              <div className="bg-yellow-900/50 border-yellow-700 p-6 rounded-lg shadow-lg border">
                 <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm font-medium text-gray-300">Total Expenses (Net)</p>
                        <p className="mt-1 text-3xl font-bold text-white">{formatCurrency(vatData.totalExpensesNet)}</p>
                        <p className="mt-2 text-xs text-gray-400">VAT on Expenses (Input): <span className="font-semibold text-gray-200">{formatCurrency(vatData.totalInputVat)}</span></p>
                        {vatData.adjustmentInputVat !== 0 && <p className="mt-1 text-xs text-gray-400">Includes adjustments: claim <span className="font-semibold text-gray-200">{formatCurrency(vatData.adjustmentInputVat)}</span></p>}
                    </div>
                    <div className="p-3 rounded-full bg-yellow-900/50 border-yellow-700"><CreditCardIcon className="h-6 w-6 text-yellow-400" /></div>
                 </div>
             </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <p className="text-sm font-medium text-gray-300">VAT adjustments</p>
            <p className="mt-1 text-xs text-gray-500">Late claims and corrections dated in this period. Included in the totals above and in the MTD sheet.</p>
            {periodAdjustments.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">No adjustments in this period.</p>
            ) : (
                <ul className="mt-3 divide-y divide-gray-700/60 rounded-lg ring-1 ring-inset ring-gray-700/70">
                    {periodAdjustments.map(a => (
                        <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                            <span className="w-24 shrink-0 text-sm text-gray-400">{formatDate(a.date)}</span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-white">{a.description}</p>
                                <p className="text-xs text-gray-500">{boxLabel(a.box)}</p>
                            </div>
                            <span className="tabular-nums text-sm text-gray-200">{formatCurrency(a.amount)}</span>
                            <button type="button" data-html2canvas-ignore="true" aria-label={`Delete ${a.description}`} onClick={() => { if (window.confirm(`Delete "${a.description}"?`)) deleteVatAdjustment(a.id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-700 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"><TrashIcon className="h-4 w-4" /></button>
                        </li>
                    ))}
                </ul>
            )}
        </div>

        <div className={`p-8 rounded-lg shadow-xl text-center ${vatData.vatDue >= 0 ? 'bg-gradient-to-tr from-red-800 to-orange-700' : 'bg-gradient-to-tr from-green-800 to-emerald-700'}`}>
            <p className="text-lg font-medium text-white/80">{vatData.vatDue >= 0 ? 'Total VAT Due to HMRC' : 'Total VAT Reclaimable'}</p>
            <p className="mt-2 text-5xl font-bold text-white tracking-tight">{formatCurrency(Math.abs(vatData.vatDue))}</p>
            <p className="mt-2 text-sm text-white/70">Based on the selected period</p>
        </div>
        </div>

        <div className="rounded-lg bg-gray-800 p-4 shadow-md">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">New VAT adjustment</p>
            <VatAdjustmentForm key={endDate} defaultDate={endDate} onSave={handleAddAdjustment} />
        </div>
    </div>
  );
};

export default VatSummary;