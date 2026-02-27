import React, { useState, useMemo, useRef } from 'react';
import { formatCurrency, formatDate, toYYYYMMDD } from '../../utils/helpers';
import { DocumentTextIcon, CreditCardIcon } from '../icons';
import { useData } from '../../hooks/useData';
import UkDateInput from '../common/UkDateInput';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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

const VatSummary = () => {
  // FIX: Replaced `isPaintShop` with `isServiceBusiness` which is available in the data context.
  const { transactions, salesDocs, vehicles, miscInvoices, businessDetails, isServiceBusiness, jobInvoices } = useData();
  
  const [startDate, setStartDate] = useState(() => toYYYYMMDD(getVatPeriod(new Date(), businessDetails?.vatStartDate).start));
  const [endDate, setEndDate] = useState(() => toYYYYMMDD(getVatPeriod(new Date(), businessDetails?.vatStartDate).end));
  const [exportingPdf, setExportingPdf] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const handleExportPdf = async () => {
    if (!summaryRef.current) return;
    setExportingPdf(true);
    try {
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
    } finally {
      setExportingPdf(false);
    }
  };

  const vatData = useMemo(() => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const periodSales = salesDocs.filter(doc => doc.documentType === 'Sales Invoice' && new Date(doc.invoiceDate) >= start && new Date(doc.invoiceDate) <= end);
    const periodJobInvoices = jobInvoices.filter(inv => new Date(inv.invoiceDate) >= start && new Date(inv.invoiceDate) <= end);
    const periodMiscInvoices = miscInvoices.filter(inv => new Date(inv.invoiceDate) >= start && new Date(inv.invoiceDate) <= end);
    const periodTransactions = transactions.filter(tx => tx.status === 'Reconciled' && new Date(tx.date) >= start && new Date(tx.date) <= end);

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

    const totalOutputVat = totalMarginVat + otherOutputVat;

    // --- Input VAT Calculation ---
    const totalInputVat = periodTransactions
      .filter(tx => tx.amount < 0)
      .reduce((sum, tx) => sum + (tx.vatAmount || 0), 0);

    const vatDue = totalOutputVat - totalInputVat;

    // --- Net Sales & Expenses for display ---
    const totalSalesNet = isServiceBusiness 
        ? periodJobInvoices.reduce((sum, inv) => sum + inv.subtotal, 0)
        : periodSales.reduce((sum, doc) => sum + (doc.price - doc.vat), 0) + periodMiscInvoices.reduce((sum, inv) => sum + inv.subtotal, 0);
        
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
        vatDue 
    };
  }, [startDate, endDate, salesDocs, vehicles, miscInvoices, transactions, isServiceBusiness, jobInvoices]);

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
        <div className="p-4 bg-gray-800 rounded-lg shadow-md flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
                <div><label htmlFor="start-date" className="block text-sm font-medium text-gray-400">Start Date</label><UkDateInput id="start-date" name="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1"/></div>
                <div><label htmlFor="end-date" className="block text-sm font-medium text-gray-400">End Date</label><UkDateInput id="end-date" name="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1"/></div>
            </div>
            <div className="flex items-center gap-2"><button onClick={() => setPeriod('this_quarter')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">This Quarter</button><button onClick={() => setPeriod('last_quarter')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">Last Quarter</button><button onClick={handleExportPdf} disabled={exportingPdf} className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-md flex items-center gap-1.5">{exportingPdf ? '⏳ Saving...' : '📄 Save PDF'}</button></div>
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
                    </div>
                    <div className="p-3 rounded-full bg-yellow-900/50 border-yellow-700"><CreditCardIcon className="h-6 w-6 text-yellow-400" /></div>
                 </div>
             </div>
        </div>

        <div className={`p-8 rounded-lg shadow-xl text-center ${vatData.vatDue >= 0 ? 'bg-gradient-to-tr from-red-800 to-orange-700' : 'bg-gradient-to-tr from-green-800 to-emerald-700'}`}>
            <p className="text-lg font-medium text-white/80">{vatData.vatDue >= 0 ? 'Total VAT Due to HMRC' : 'Total VAT Reclaimable'}</p>
            <p className="mt-2 text-5xl font-bold text-white tracking-tight">{formatCurrency(Math.abs(vatData.vatDue))}</p>
            <p className="mt-2 text-sm text-white/70">Based on the selected period</p>
        </div>
        </div>
    </div>
  );
};

export default VatSummary;