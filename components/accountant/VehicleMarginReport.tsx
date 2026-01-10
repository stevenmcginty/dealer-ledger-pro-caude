import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { useData } from '../../hooks/useData';
import { formatCurrency, formatDate, toYYYYMMDD } from '../../utils/helpers';
import { ArrowDownTrayIcon, DocumentTextIcon } from '../icons';
import { SalesDocument, Vehicle } from '../../types';
import UkDateInput from '../common/UkDateInput';

interface MarginData {
    doc: SalesDocument;
    vehicle: Vehicle;
    margin: number;
    displayPurchasePrice: number;
    vatOnMargin: number;
}

const VehicleMarginReport = () => {
    const { salesDocs, vehicles, isVatRegistered } = useData();
    
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const [startDate, setStartDate] = useState(toYYYYMMDD(firstDayOfMonth));
    const [endDate, setEndDate] = useState(toYYYYMMDD(lastDayOfMonth));

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
            alert("No data to download for the selected period.");
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
            
            {marginData.length === 0 ? (
                 <div className="text-center py-16 px-6 bg-gray-800 rounded-lg shadow-inner">
                    <DocumentTextIcon className="h-12 w-12 text-gray-500 mx-auto" />
                    <h3 className="mt-4 text-lg font-medium text-white">No Sales Found</h3>
                    <p className="mt-1 text-sm text-gray-400">There are no vehicle sales in the selected date range.</p>
                </div>
            ) : (
                <div className="overflow-x-auto bg-gray-800 rounded-lg shadow">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-900/50">
                            <tr>
                                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-white sm:pl-6">Sale Date</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Stock #</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Registration</th>
                                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-white">Vehicle</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white">Purchase Price</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white">Sale Price</th>
                                <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white">Margin</th>
                                {isVatRegistered && <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-white sm:pr-6">VAT on Margin</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {marginData.map(item => (
                                <tr key={item.doc.id} className="even:bg-gray-800/50">
                                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-300 sm:pl-6">{formatDate(item.doc.invoiceDate)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-400">{item.vehicle.stockNumber}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-white">{item.vehicle.reg}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{item.vehicle.make} {item.vehicle.model}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-300">{formatCurrency(item.displayPurchasePrice)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-300">{formatCurrency(item.doc.price)}</td>
                                    <td className={`whitespace-nowrap px-3 py-4 text-sm text-right font-bold ${item.margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(item.margin)}</td>
                                    {isVatRegistered && <td className="whitespace-nowrap px-3 py-4 text-sm text-right text-gray-300 sm:pr-6">{formatCurrency(item.vatOnMargin)}</td>}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-900/50">
                            <tr>
                                <td colSpan={6} className="px-3 py-3.5 text-right text-sm font-bold text-white sm:pl-6">Totals</td>
                                <td className={`px-3 py-3.5 text-right text-sm font-bold ${totalMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(totalMargin)}</td>
                                {isVatRegistered && <td className="px-3 py-3.5 text-right text-sm font-bold text-white sm:pr-6">{formatCurrency(totalVatOnMargin)}</td>}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
};

export default VehicleMarginReport;