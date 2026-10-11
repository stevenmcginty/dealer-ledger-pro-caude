import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { useData } from '../../hooks/useData';
import { formatDate, toYYYYMMDD } from '../../utils/helpers';
import { ArrowDownTrayIcon, DocumentTextIcon } from '../icons';
import { SalesDocument, Vehicle } from '../../types';
import UkDateInput from '../common/UkDateInput';
import DatePresetButtons from './DatePresetButtons';
import { useToast, Button, EmptyState, DataTable, THead, TBody, Th, Tr, Td, Plate } from '../ui';
import { cx, eyebrow } from '../ui/cx';
import { moneyText, FootCell } from './hubShared';

interface MarginData {
    doc: SalesDocument;
    vehicle: Vehicle;
    margin: number;
    displayPurchasePrice: number;
    vatOnMargin: number;
}

/** Optional controlled period (the Accountant hub drives it). Without it the report keeps its own dates. */
interface ControlledPeriodProps { startDate?: string; endDate?: string; hidePeriodBar?: boolean; }

const VehicleMarginReport = ({ startDate: startProp, endDate: endProp, hidePeriodBar = false }: ControlledPeriodProps = {}) => {
    const { salesDocs, vehicles, isVatRegistered } = useData();
    const toast = useToast();
    
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const [ownStart, setStartDate] = useState(toYYYYMMDD(firstDayOfMonth));
    const [ownEnd, setEndDate] = useState(toYYYYMMDD(lastDayOfMonth));
    const startDate = startProp ?? ownStart;
    const endDate = endProp ?? ownEnd;

    const marginData = useMemo<MarginData[]>(() => {
        const periodSales = salesDocs.filter(doc => {
            return doc.documentType === 'Sales Invoice' && doc.invoiceDate >= startDate && doc.invoiceDate <= endDate;
        });

        return periodSales.map(doc => {
            const vehicle = vehicles.find(v => v.id === doc.vehicleId);
            if (!vehicle) return null;

            const salePrice = doc.price;
            const isSorSale = vehicle.ownershipType === 'Sale or Return';

            // Always calculate margin based on the live vehicle's purchasePrice (cost or payout)
            // This ignores the potentially stale 'commission' field on the sales document.
            const margin = salePrice - vehicle.purchasePrice;
            
            // For both Owned and SOR stock, vehicle.purchasePrice holds the correct cost/payout value.
            const displayPurchasePrice = vehicle.purchasePrice;
            
            const vatOnMargin = isVatRegistered && ((vehicle.vatScheme === 'Margin' || isSorSale) && margin > 0)
                ? margin / 6
                : 0;
            
            return { doc, vehicle, margin, displayPurchasePrice, vatOnMargin };
        }).filter((item): item is MarginData => item !== null)
          .sort((a, b) => new Date(b.doc.invoiceDate).getTime() - new Date(a.doc.invoiceDate).getTime());

    }, [startDate, endDate, salesDocs, vehicles, isVatRegistered]);
    
    const totalMargin = useMemo(() => marginData.reduce((sum, item) => sum + item.margin, 0), [marginData]);
    const totalVatOnMargin = useMemo(() => marginData.reduce((sum, item) => sum + item.vatOnMargin, 0), [marginData]);
    
    const handleDownload = () => {
        const csvData = marginData.map(item => {
            const row: any = {
                'Sale Date': formatDate(item.doc.invoiceDate),
                'Stock #': item.vehicle.stockNumber,
                'Registration': item.vehicle.reg,
                'Vehicle': `${item.vehicle.make} ${item.vehicle.model}`,
                'Purchase Price': item.displayPurchasePrice.toFixed(2),
                'Sale Price': item.doc.price.toFixed(2),
                'Margin': item.margin.toFixed(2),
            };
            if (isVatRegistered) {
                row['VAT on Margin'] = item.vatOnMargin.toFixed(2);
            }
            return row;
        });
        
        const totalsRow: any = {
            'Sale Date': 'TOTALS',
            'Stock #': '',
            'Registration': '',
            'Vehicle': '',
            'Purchase Price': '',
            'Sale Price': '',
            'Margin': totalMargin.toFixed(2),
        };
        if (isVatRegistered) {
            totalsRow['VAT on Margin'] = totalVatOnMargin.toFixed(2);
        }
        csvData.push(totalsRow);

        if (csvData.length === 1) { // Only totals row
            toast.info("No data to download for the selected period.");
            return;
        }
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `Vehicle_Margin_Report_${startDate}_to_${endDate}.csv`);
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

            {marginData.length === 0 ? (
                <div className="rounded-card border border-line bg-surface">
                    <EmptyState icon={<DocumentTextIcon />} title="No cars sold in these dates" description="Each sales invoice in the period shows here with its cost, price and margin." />
                </div>
            ) : (
                <DataTable ariaLabel="Car margins" minWidth={isVatRegistered ? 860 : 760} className="print:overflow-visible">
                    <THead>
                        <tr>
                            <Th className="ps-4">Sold</Th>
                            <Th>Car</Th>
                            <Th numeric>Cost</Th>
                            <Th numeric>Sold for</Th>
                            <Th numeric className={isVatRegistered ? '' : 'pe-4'}>Margin</Th>
                            {isVatRegistered && <Th numeric className="pe-4">VAT on margin</Th>}
                        </tr>
                    </THead>
                    <TBody>
                        {marginData.map(item => (
                            <Tr key={item.doc.id}>
                                <Td className="num ps-4 text-ink-2">{formatDate(item.doc.invoiceDate)}</Td>
                                <Td className="py-2">
                                    <span className="flex items-center gap-2">
                                        <Plate reg={item.vehicle.reg} size="sm" />
                                        <span className="num text-sm text-ink-3">#{item.vehicle.stockNumber}</span>
                                    </span>
                                    <span className="mt-0.5 block max-w-[18rem] truncate text-sm text-ink-2">{item.vehicle.make} {item.vehicle.model}</span>
                                </Td>
                                <Td numeric className="text-ink-2">{moneyText(item.displayPurchasePrice)}</Td>
                                <Td numeric className="text-ink-2">{moneyText(item.doc.price)}</Td>
                                <Td numeric className={`font-bold ${isVatRegistered ? '' : 'pe-4'} ${item.margin < 0 ? 'text-danger' : 'text-ink'}`}>{moneyText(item.margin)}</Td>
                                {isVatRegistered && <Td numeric className="pe-4 text-ink-2">{moneyText(item.vatOnMargin)}</Td>}
                            </Tr>
                        ))}
                    </TBody>
                    <tfoot>
                        <tr>
                            <FootCell colSpan={4} className="ps-4">Totals · <span className="num">{marginData.length}</span> {marginData.length === 1 ? 'car' : 'cars'}</FootCell>
                            <FootCell numeric className={`${isVatRegistered ? '' : 'pe-4'} ${totalMargin < 0 ? 'text-danger' : ''}`}>{moneyText(totalMargin)}</FootCell>
                            {isVatRegistered && <FootCell numeric className="pe-4">{moneyText(totalVatOnMargin)}</FootCell>}
                        </tr>
                    </tfoot>
                </DataTable>
            )}
        </div>
    );
};

export default VehicleMarginReport;