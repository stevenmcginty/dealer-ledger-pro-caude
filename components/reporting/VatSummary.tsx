import React, { useState, useMemo, useRef } from 'react';
import { formatCurrency, formatDate, toYYYYMMDD } from '../../utils/helpers';
import { DocumentTextIcon, PlusIcon, TrashIcon, ArrowDownTrayIcon, BanknotesIcon, CheckCircleIcon, CalculatorIcon, ChevronRightIcon } from '../icons';
import { useData } from '../../hooks/useData';
import UkDateInput from '../common/UkDateInput';
import { useToast, Button, Badge, IconButton, Field, Input } from '../ui';
import { cx, eyebrow } from '../ui/cx';
import Select from '../common/Select';
import { useUI } from '../../hooks/useUI';
import { chipClass, HubCard, Money, moneyText, Eyebrow, Line } from '../accountant/hubShared';
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

type VatFigures = ReturnType<typeof computeVatSummary>;

/** The nine return boxes, exactly as the MTD sheet exports them. Shown on screen from the same numbers. */
const mtdBoxes = (vatData: VatFigures): number[] => {
    const round2 = (value: number) => Math.round(value * 100) / 100;
    const box1 = round2(vatData.totalOutputVat);
    const box2 = 0;
    const box3 = round2(box1 + box2);
    const box4 = round2(vatData.totalInputVat);
    const box5 = round2(box3 - box4);
    return [box1, box2, box3, box4, box5, Math.floor(vatData.totalSalesNet - vatData.totalMarginVat), Math.floor(vatData.totalExpensesNet), 0, 0];
};

const BOX_LABELS: { label: string; note?: string; total?: boolean }[] = [
    { label: 'VAT due on sales and other outputs' },
    { label: 'VAT due on goods brought in from the EU', note: 'Northern Ireland only' },
    { label: 'Total VAT due', note: 'Box 1 + box 2', total: true },
    { label: 'VAT reclaimed on purchases and other inputs' },
    { label: 'Net VAT', note: 'Box 3 − box 4', total: true },
    { label: 'Total sales, not counting VAT', note: 'Whole pounds' },
    { label: 'Total purchases, not counting VAT', note: 'Whole pounds' },
    { label: 'Goods supplied to the EU', note: 'Northern Ireland only' },
    { label: 'Goods brought in from the EU', note: 'Northern Ireland only' },
];

/** Online VAT returns are due one calendar month and 7 days after the period ends. Display only. */
const returnDueDate = (endDate: string): Date | null => {
    const [y, m, d] = endDate.split('-').map(Number);
    if (!y || !m || !d) return null;
    const lastDay = (yy: number, mm: number) => new Date(yy, mm + 1, 0).getDate(); // mm is 0-based
    const monthEnd = d === lastDay(y, m - 1);
    const day = monthEnd ? lastDay(y, m) : Math.min(d, lastDay(y, m));
    return new Date(y, m, day + 7);
};

const dayText = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const shortDay = (s: string) => formatDate(s, { day: 'numeric', month: 'short', year: 'numeric' });

const boxLabel = (box: VatAdjustment['box']) => box === 'input' ? 'VAT to claim back' : 'VAT to pay';

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
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2"
            onSubmit={async e => {
                e.preventDefault(); if (!valid || busy) return; setBusy(true);
                try { await onSave({ date, box, amount: Math.round(Math.abs(value) * 100) / 100, description: description.trim() }); setAmount(''); setDescription(''); }
                finally { setBusy(false); }
            }}
        >
            <Field label="Date" htmlFor="vat-adjustment-date">
                <UkDateInput id="vat-adjustment-date" name="vat-adjustment-date" value={date} onChange={e => setDate(e.target.value)} />
            </Field>
            <Field label="Type" htmlFor="vat-adjustment-box">
                <Select id="vat-adjustment-box" value={box} onChange={e => setBox(e.target.value as VatAdjustment['box'])}>
                    <option value="input">Input VAT to claim back</option>
                    <option value="output">Output VAT to pay</option>
                </Select>
            </Field>
            <Input label="Amount" id="vat-adjustment-amount" affix="£" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="num text-end" />
            <Input label="What it is for" id="vat-adjustment-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Late claim: BCA invoice 88213" />
            <div className="sm:col-span-2 lg:col-span-1 2xl:col-span-2">
                <Button type="submit" variant="secondary" size="sm" disabled={!valid} loading={busy} icon={<PlusIcon />}>Add adjustment</Button>
            </div>
        </form>
    );
};

/** Optional controlled period (the Accountant hub drives it). Without it the report keeps its own dates. */
interface ControlledPeriodProps { startDate?: string; endDate?: string; hidePeriodBar?: boolean; }

const VatSummary = ({ startDate: startProp, endDate: endProp, hidePeriodBar = false }: ControlledPeriodProps = {}) => {
  // FIX: Replaced `isPaintShop` with `isServiceBusiness` which is available in the data context.
  const { transactions, salesDocs, vehicles, miscInvoices, businessDetails, isServiceBusiness, jobInvoices, vatAdjustments, addVatAdjustment, deleteVatAdjustment } = useData();
  const { setView } = useUI();
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
        backgroundColor: `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--c-surface').trim().split(/\s+/).join(',')})`,
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
  const boxes = useMemo(() => mtdBoxes(vatData), [vatData]);

  // The adjustments listed on screen: the same period filter computeVatSummary uses.
  const periodAdjustments = useMemo(() => {
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);
    return vatAdjustments
      .filter(a => new Date(a.date) >= start && new Date(a.date) <= end)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [vatAdjustments, startDate, endDate]);

  // Bank and card lines in the period that are not reconciled yet: the figures leave them out.
  const openLines = useMemo(() => {
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);
    return transactions.filter(tx => tx.status !== 'Reconciled' && new Date(tx.date) >= start && new Date(tx.date) <= end).length;
  }, [transactions, startDate, endDate]);

  const handleAddAdjustment = async (a: NewVatAdjustment) => {
    try { await addVatAdjustment(a); }
    catch (err) { console.error('Add VAT adjustment failed:', err); toast.error("Could not save the VAT adjustment. Please try again."); }
  };

  const handleExportMtdSheet = async () => {
    try {
      await exportMtdVatSheet({
        companyName: businessDetails?.name ?? '',
        vatNumber: businessDetails?.vatNumber ?? '',
        periodStart: startDate,
        periodEnd: endDate,
        boxes,
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
  // Which quick period (if any) the dates match, for the pressed state only.
  const quickActive = (period: 'this_quarter' | 'last_quarter') => {
    const today = new Date();
    const targetDate = period === 'last_quarter' ? new Date(today.getFullYear(), today.getMonth() - 3, 15) : today;
    const { start, end } = getVatPeriod(targetDate, businessDetails?.vatStartDate);
    return toYYYYMMDD(start) === startDate && toYYYYMMDD(end) === endDate;
  };

  // The headline is Box 5 exactly as the return and the MTD sheet show it.
  const box5 = boxes[4];
  const toPay = box5 >= 0;
  const periodDays = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
  const due = periodDays > 0 && periodDays <= 93 ? returnDueDate(endDate) : null;
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const daysLeft = due ? Math.round((due.getTime() - today0.getTime()) / 86400000) : 0;
  const inputVatBooked = vatData.totalInputVat - vatData.adjustmentInputVat;

  return (
    <div className="min-w-0 space-y-5">
        {/* Period and actions */}
        <div className="flex flex-col gap-3 print:hidden lg:flex-row lg:items-end lg:justify-between">
            {!hidePeriodBar && (
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2 sm:flex">
                        <div className="min-w-0">
                            <label htmlFor="start-date" className={cx(eyebrow, 'mb-1.5 block')}>From</label>
                            <UkDateInput id="start-date" name="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="sm:w-44" />
                        </div>
                        <span aria-hidden="true" className="pb-3.5 text-ink-3">–</span>
                        <div className="min-w-0">
                            <label htmlFor="end-date" className={cx(eyebrow, 'mb-1.5 block')}>To</label>
                            <UkDateInput id="end-date" name="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="sm:w-44" />
                        </div>
                    </div>
                    <div role="group" aria-label="Quick periods" className="flex gap-1.5">
                        <button type="button" onClick={() => setPeriod('this_quarter')} aria-pressed={quickActive('this_quarter')} className={chipClass(quickActive('this_quarter'))}>This quarter</button>
                        <button type="button" onClick={() => setPeriod('last_quarter')} aria-pressed={quickActive('last_quarter')} className={chipClass(quickActive('last_quarter'))}>Last quarter</button>
                    </div>
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2 lg:ms-auto">
                <Button variant="secondary" size="sm" onClick={handleExportPdf} loading={exportingPdf} icon={<DocumentTextIcon />}>
                    {exportingPdf ? 'Saving PDF…' : 'Save PDF'}
                </Button>
                {businessDetails?.mtdVatExportEnabled && (
                    <Button size="sm" onClick={handleExportMtdSheet} icon={<ArrowDownTrayIcon />}>Export MTD sheet</Button>
                )}
            </div>
        </div>

        <div ref={summaryRef} className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:items-start">
            {/* The number first, the deadline second, then what blocks filing. Right-hand column on desktop. */}
            <div className="min-w-0 space-y-5 lg:col-span-5 lg:col-start-8 lg:row-start-1">
                <section aria-labelledby="vat-due-label" className="rounded-card border border-line bg-surface p-4 sm:p-5">
                    <p id="vat-due-label" className={eyebrow}>{toPay ? 'To pay HMRC' : 'To reclaim from HMRC'} · estimate</p>
                    <p className="num mt-2 text-[2.25rem] font-bold leading-[1.1] tracking-[-0.04em] text-ink sm:text-[2.75rem]">
                        {formatCurrency(Math.abs(box5))}
                    </p>
                    <p className="mt-1 text-sm text-ink-2">{shortDay(startDate)} to {shortDay(endDate)}</p>
                    {due && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {daysLeft >= 0 ? (
                                <Badge variant={daysLeft <= 30 ? 'warning' : 'default'} size="md" dot>
                                    Return due {dayText(due)} · <span className="num">{daysLeft}</span> {daysLeft === 1 ? 'day' : 'days'}
                                </Badge>
                            ) : (
                                <Badge variant="default" size="md">Return was due {dayText(due)}</Badge>
                            )}
                        </div>
                    )}
                </section>

                <section aria-labelledby="vat-check-label" data-html2canvas-ignore="true" className="print:hidden">
                    <h3 id="vat-check-label" className="mb-2 text-lg font-bold leading-6 text-ink">Before you file</h3>
                    <ul className="overflow-hidden rounded-card border border-line bg-surface">
                        <li className="flex min-h-[56px] items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-b-0">
                            <span aria-hidden="true" className={cx('grid h-8 w-8 flex-none place-items-center rounded-control [&_svg]:h-5 [&_svg]:w-5', openLines ? 'bg-warning-soft text-warning-ink' : 'bg-success-soft text-success-ink')}>
                                {openLines ? <BanknotesIcon /> : <CheckCircleIcon />}
                            </span>
                            <span className="min-w-0 flex-1 text-sm leading-5">
                                {openLines
                                    ? <><span className="block font-semibold text-ink"><span className="num">{openLines}</span> bank {openLines === 1 ? 'line' : 'lines'} to check</span><span className="block text-ink-3">Not in these figures until they are reconciled.</span></>
                                    : <span className="text-ink-2">Every bank and card line in this period is reconciled.</span>}
                            </span>
                            {openLines > 0 && <Button variant="ghost" size="sm" onClick={() => setView('expenses', { tab: 'bank' })} iconEnd={<ChevronRightIcon />}>Open</Button>}
                        </li>
                        <li className="flex min-h-[56px] items-center gap-3 px-3.5 py-2.5">
                            <span aria-hidden="true" className="grid h-8 w-8 flex-none place-items-center rounded-control bg-surface-2 text-ink-2 [&_svg]:h-5 [&_svg]:w-5"><CalculatorIcon /></span>
                            <span className="min-w-0 flex-1 text-sm leading-5 text-ink-2">
                                {periodAdjustments.length
                                    ? <><span className="num">{periodAdjustments.length}</span> {periodAdjustments.length === 1 ? 'adjustment is' : 'adjustments are'} in boxes 1 and 4. Check them below.</>
                                    : 'No adjustments in this period.'}
                            </span>
                        </li>
                    </ul>
                </section>
            </div>

            {/* Boxes 1 to 9, laid out like the return. Left-hand column on desktop. */}
            <div className="min-w-0 space-y-5 lg:col-span-7 lg:col-start-1 lg:row-span-2 lg:row-start-1">
                <HubCard title="VAT return" subtitle={`Boxes 1 to 9 · ${shortDay(startDate)} to ${shortDay(endDate)}`} bodyClassName="px-4 pb-2 pt-1 sm:px-5">
                    <table className="w-full text-sm">
                        <caption className="sr-only">VAT return boxes 1 to 9</caption>
                        <thead className="sr-only">
                            <tr><th scope="col">Box</th><th scope="col">What it is</th><th scope="col">Amount</th></tr>
                        </thead>
                        <tbody>
                            {BOX_LABELS.map((b, i) => {
                                const n = i + 1;
                                const value = boxes[i];
                                const net = n === 5;
                                return (
                                    <tr key={n} className={cx(
                                        b.total ? 'border-t border-line-strong' : '',
                                        net ? 'border-b-[3px] [border-bottom-style:double] border-b-ink-2' : n < 9 && !BOX_LABELS[i + 1]?.total ? 'border-b [border-bottom-style:dashed] border-b-line' : '',
                                    )}>
                                        <th scope="row" className="w-10 py-2.5 pe-3 text-start align-top">
                                            <span className={cx('num inline-grid h-7 min-w-[28px] place-items-center rounded-chip border text-xs font-bold', net ? 'border-ink bg-ink text-surface' : 'border-line-strong text-ink-2')}>{n}</span>
                                        </th>
                                        <td className={cx('py-2.5 pe-3 align-top leading-5', b.total ? 'font-bold text-ink' : 'text-ink-2')}>
                                            {b.label}
                                            {net && <span className="font-normal text-ink-3"> · {value >= 0 ? 'to pay' : 'to reclaim'}</span>}
                                            {b.note && <span className="block text-ink-3 font-normal">{b.note}</span>}
                                        </td>
                                        <td className={cx('num whitespace-nowrap py-2.5 text-end align-top', b.total ? 'font-bold text-ink' : 'font-semibold text-ink', net && 'text-base', !b.total && value === 0 && 'text-ink-3 font-normal')}>
                                            {net ? formatCurrency(Math.abs(value)) : moneyText(value)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </HubCard>

                <HubCard title="How boxes 1 and 4 are made">
                    <Eyebrow as="h4" className="mb-1">VAT on sales</Eyebrow>
                    <div className="mb-4">
                        {!isServiceBusiness && <Line indent label="Margin-scheme cars (margin ÷ 6)"><Money value={vatData.totalMarginVat} /></Line>}
                        <Line indent label={isServiceBusiness ? 'VAT on job invoices and other income' : 'Other VAT on sales (20% cars, invoices, other income)'}><Money value={vatData.otherOutputVat} /></Line>
                        {vatData.adjustmentOutputVat !== 0 && <Line indent label="Adjustments to pay"><Money value={vatData.adjustmentOutputVat} /></Line>}
                        <Line total label="Box 1"><Money value={vatData.totalOutputVat} /></Line>
                    </div>
                    <Eyebrow as="h4" className="mb-1">VAT on costs</Eyebrow>
                    <div className="mb-4">
                        <Line indent label="VAT on reconciled bank and card lines"><Money value={inputVatBooked} /></Line>
                        {vatData.adjustmentInputVat !== 0 && <Line indent label="Adjustments to claim back"><Money value={vatData.adjustmentInputVat} /></Line>}
                        <Line total label="Box 4"><Money value={vatData.totalInputVat} /></Line>
                    </div>
                    <Eyebrow as="h4" className="mb-1">Net figures</Eyebrow>
                    <div>
                        <Line indent label="Sales, not counting VAT"><Money value={vatData.totalSalesNet} /></Line>
                        <Line indent label="Costs, not counting VAT"><Money value={vatData.totalExpensesNet} /></Line>
                    </div>
                </HubCard>
            </div>

            {/* Adjustments: after the boxes on a phone, under the checklist on desktop. */}
            <div className="min-w-0 lg:col-span-5 lg:col-start-8 lg:row-start-2">
                <HubCard title="Adjustments" subtitle="Late claims and corrections dated in this period. They are in the boxes and the MTD sheet." bodyClassName="">
                    {periodAdjustments.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-ink-3 sm:px-5">None yet.</p>
                    ) : (
                        <ul>
                            {periodAdjustments.map(a => (
                                <li key={a.id} className="flex items-center gap-3 border-b border-dashed border-line py-1.5 pe-2 ps-4 sm:ps-5">
                                    <div className="min-w-0 flex-1 py-1">
                                        <p className="truncate text-sm font-semibold text-ink" title={a.description}>{a.description}</p>
                                        <p className="text-sm text-ink-3"><span className="num">{formatDate(a.date)}</span> · {boxLabel(a.box)}</p>
                                    </div>
                                    <Money value={a.amount} className="text-sm font-semibold text-ink" />
                                    <span data-html2canvas-ignore="true" className="print:hidden">
                                        <IconButton label={`Delete ${a.description}`} icon={<TrashIcon />} size="sm" className="hover:text-danger" onClick={() => { if (window.confirm(`Delete "${a.description}"?`)) deleteVatAdjustment(a.id); }} />
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div data-html2canvas-ignore="true" className="border-t border-line bg-surface-2 px-4 py-4 print:hidden sm:px-5">
                        <Eyebrow as="h4" className="mb-3">New adjustment</Eyebrow>
                        <VatAdjustmentForm key={endDate} defaultDate={endDate} onSave={handleAddAdjustment} />
                    </div>
                </HubCard>
            </div>
        </div>
    </div>
  );
};

export default VatSummary;
