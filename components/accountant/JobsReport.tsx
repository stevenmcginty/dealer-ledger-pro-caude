import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { useData } from '../../hooks/useData';
import { formatDate, toYYYYMMDD } from '../../utils/helpers';
import { ArrowDownTrayIcon, DocumentTextIcon } from '../icons';
import { JobInvoice } from '../../types';
import UkDateInput from '../common/UkDateInput';
import DatePresetButtons from './DatePresetButtons';
import { useToast, Button, EmptyState, DataTable, THead, TBody, Th, Tr, Td } from '../ui';
import { cx, eyebrow } from '../ui/cx';
import { moneyText, FootCell } from './hubShared';

interface ReportData {
    invoice: JobInvoice;
}

/** Optional controlled period (the Accountant hub drives it). Without it the report keeps its own dates. */
interface ControlledPeriodProps { startDate?: string; endDate?: string; hidePeriodBar?: boolean; }

const JobsReport = ({ startDate: startProp, endDate: endProp, hidePeriodBar = false }: ControlledPeriodProps = {}) => {
    const { jobInvoices } = useData();
    const toast = useToast();
    
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const [ownStart, setStartDate] = useState(toYYYYMMDD(firstDayOfMonth));
    const [ownEnd, setEndDate] = useState(toYYYYMMDD(lastDayOfMonth));
    const startDate = startProp ?? ownStart;
    const endDate = endProp ?? ownEnd;

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
            toast.info("No data to download for the selected period.");
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
        <div className="min-w-0 space-y-4">
            <div className="flex flex-col gap-3 print:hidden lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
                {!hidePeriodBar && (
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
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
                        <DatePresetButtons onSelect={r => { setStartDate(r.start); setEndDate(r.end); }} />
                    </div>
                )}
                <Button variant={hidePeriodBar ? 'secondary' : 'primary'} size="sm" onClick={handleDownload} icon={<ArrowDownTrayIcon />} className="self-start lg:ms-auto lg:self-auto">
                    Download CSV
                </Button>
            </div>

            {reportData.length === 0 ? (
                <div className="rounded-card border border-line bg-surface">
                    <EmptyState icon={<DocumentTextIcon />} title="No invoices in these dates" description="Job invoices (not quotes) dated in the period show here with their net, VAT and total." />
                </div>
            ) : (
                <DataTable ariaLabel="Jobs report" minWidth={820} className="print:overflow-visible">
                    <THead>
                        <tr>
                            <Th className="ps-4">Date</Th>
                            <Th>Invoice</Th>
                            <Th>Customer</Th>
                            <Th>Work</Th>
                            <Th numeric>Net</Th>
                            <Th numeric>VAT</Th>
                            <Th numeric className="pe-4">Total</Th>
                        </tr>
                    </THead>
                    <TBody>
                        {reportData.map(item => (
                            <Tr key={item.invoice.id}>
                                <Td className="num ps-4 text-ink-2">{formatDate(item.invoice.invoiceDate)}</Td>
                                <Td className="num text-ink-2">#{item.invoice.invoiceNumber}</Td>
                                <Td className="font-semibold">{item.invoice.customerDetails.name}</Td>
                                <Td className="max-w-[16rem] truncate text-ink-2" title={item.invoice.items.map(i => i.description).join(', ')}>{item.invoice.items.map(i => i.description).join(', ')}</Td>
                                <Td numeric className="text-ink-2">{moneyText(item.invoice.subtotal)}</Td>
                                <Td numeric className="text-ink-2">{moneyText(item.invoice.vat)}</Td>
                                <Td numeric className="pe-4 font-bold">{moneyText(item.invoice.total)}</Td>
                            </Tr>
                        ))}
                    </TBody>
                    <tfoot>
                        <tr>
                            <FootCell colSpan={4} className="ps-4">Totals · <span className="num">{reportData.length}</span> {reportData.length === 1 ? 'invoice' : 'invoices'}</FootCell>
                            <FootCell numeric>{moneyText(totals.subtotal)}</FootCell>
                            <FootCell numeric>{moneyText(totals.vat)}</FootCell>
                            <FootCell numeric className="pe-4">{moneyText(totals.total)}</FootCell>
                        </tr>
                    </tfoot>
                </DataTable>
            )}
        </div>
    );
};

export default JobsReport;
