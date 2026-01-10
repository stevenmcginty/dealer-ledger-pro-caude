import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { useData } from '../../hooks/useData';
import { formatCurrency, formatDate, toYYYYMMDD } from '../../utils/helpers';
import { ArrowDownTrayIcon, DocumentTextIcon } from '../icons';
import { JobInvoice } from '../../types';
import UkDateInput from '../common/UkDateInput';

interface ReportData {
    invoice: JobInvoice;
}

const JobsReport = () => {
    const { jobInvoices } = useData();
    
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const [startDate, setStartDate] = useState(toYYYYMMDD(firstDayOfMonth));
    const [endDate, setEndDate] = useState(toYYYYMMDD(lastDayOfMonth));

    const reportData = useMemo<ReportData[]>(() => {
        const periodInvoices = jobInvoices.filter(inv => {
            return inv.status === 'Invoice' && inv.invoiceDate >= startDate && inv.invoiceDate <= endDate;
        });

        return periodInvoices.map(inv => {
            return { invoice: inv };
        }).sort((a, b) => new Date(b.invoice.invoiceDate).getTime() - new Date(a.invoice.invoiceDate).getTime());

    }, [startDate, endDate, jobInvoices]);
    
    const totals = useMemo(() => {
        return reportData.reduce((acc, item) => {
            acc.subtotal += item.invoice.subtotal;
            acc.vat += item.invoice.vat;
            acc.total += item.invoice.total;
            return acc;
        }, { subtotal: 0, vat: 0, total: 0 });
    }, [reportData]);
    
    const setPeriod = (period: 'this_month' | 'last_month' | 'this_quarter' | 'this_year') => {
        const today = new Date();
        let start, end;
        
        switch (period) {
            case 'this_month':
                start = new Date(today.getFullYear(), today.getMonth(), 1);
                end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case 'last_month':
                start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                end = new Date(today.getFullYear(), today.getMonth(), 0);
                break;
            case 'this_quarter':
                const quarter = Math.floor(today.getMonth() / 3);
                start = new Date(today.getFullYear(), quarter * 3, 1);
                end = new Date(today.getFullYear(), quarter * 3 + 3, 0);
                break;
            case 'this_year':
                start = new Date(today.getFullYear(), 0, 1);
                end = new Date(today.getFullYear(), 11, 31);
                break;
        }
        setStartDate(toYYYYMMDD(start));
        setEndDate(toYYYYMMDD(end));
    };

    const handleDownload = () => {
        const csvData = reportData.map(item => ({
            'Date': formatDate(item.invoice.invoiceDate),
            'Invoice #': item.invoice.invoiceNumber,
            'Customer': item.invoice.customerDetails.name,
            'Description': item.invoice.items.map(i => i.description).join('; '),
            'Net': item.invoice.subtotal.toFixed(2),
            'VAT': item.invoice.vat.toFixed(2),
            'Total': item.invoice.total.toFixed(2),
        }));
        
        const totalsRow = {
            'Date': 'TOTALS',
            'Invoice #': '',
            'Customer': '',
            'Description': '',
            'Net': totals.subtotal.toFixed(2),
            'VAT': totals.vat.toFixed(2),
            'Total': totals.total.toFixed(2),
        };
        csvData.push(totalsRow);

        if (reportData.length === 0) {
            alert("No data to download for the selected period.");
            return;
        }
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `Jobs_Report_${startDate}_to_${endDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="p-4 bg-gray-800 rounded-lg shadow-md flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                    <div>
                        <label htmlFor="start-date" className="block text-sm font-medium text-gray-400">Start Date</label>
                        <UkDateInput id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1"/>
                    </div>
                    <div>
                        <label htmlFor="end-date" className="block text-sm font-medium text-gray-400">End Date</label>
                        <UkDateInput id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="mt-1"/>
                    </div>
                     <div className="self-end flex items-center gap-2">
                        <button onClick={() => setPeriod('this_month')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">This Month</button>
                        <button onClick={() => setPeriod('last_month')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">Last Month</button>
                        <button onClick={() => setPeriod('this_quarter')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">This Quarter</button>
                        <button onClick={() => setPeriod('this_year')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md">This Year</button>
                     </div>
                </div>
                <button onClick={handleDownload} className="inline-flex items-center gap-x-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-500">
                    <ArrowDownTrayIcon className="-ml-1 h-5 w-5" />
                    Download CSV
                </button>
            </div>
            
            {reportData.length === 0 ? (
                 <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
                    <DocumentTextIcon className="h-12 w-12 text-gray-500 mx-auto" />
                    <h3 className="mt-4 text-lg font-medium text-white">No Jobs Found</h3>
                    <p className="mt-1 text-sm text-gray-400">There are no completed invoices in the selected date range.</p>
                </div>
            ) : (
                <div className="overflow-x-auto bg-gray-800 rounded-lg shadow">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-900/50">
                            <tr>
                                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Date</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Invoice #</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Customer</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Description</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white">Net</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white">VAT</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white sm:pr-6">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {reportData.map(item => (
                                <tr key={item.invoice.id} className="even:bg-gray-800/50">
                                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-300 sm:pl-6">{formatDate(item.invoice.invoiceDate)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">{item.invoice.invoiceNumber}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-white">{item.invoice.customerDetails.name}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300 max-w-sm truncate">{item.invoice.items.map(i => i.description).join(', ')}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-300">{formatCurrency(item.invoice.subtotal)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-300">{formatCurrency(item.invoice.vat)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right font-bold text-white sm:pr-6">{formatCurrency(item.invoice.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-900/50">
                            <tr>
                                <td colSpan={4} className="px-3 py-3.5 text-right text-sm font-bold text-white sm:pl-6">Totals</td>
                                <td className="px-3 py-3.5 text-right text-sm font-bold text-white">{formatCurrency(totals.subtotal)}</td>
                                <td className="px-3 py-3.5 text-right text-sm font-bold text-white">{formatCurrency(totals.vat)}</td>
                                <td className="px-3 py-3.5 text-right text-sm font-bold text-white sm:pr-6">{formatCurrency(totals.total)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
};

export default JobsReport;
