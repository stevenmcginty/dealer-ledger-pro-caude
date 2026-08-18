
import React, { useState, useMemo } from 'react';
import { formatCurrency, formatDate, toYYYYMMDD } from '../../utils/helpers';
import * as dataService from '../../services/dataService';
import Drawer from './Drawer';
import DocumentListItem from './DocumentListItem';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { useToast } from '../ui';
import { ArchiveBoxIcon, DocumentTextIcon, TrashIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from '../icons';
import { SalesDocument } from '../../types';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';
import JSZip from 'jszip';
import ActivityIndicator, { ActivityState } from '../common/ActivityIndicator';


interface SalesDocListItemProps {
    doc: SalesDocument;
}

const SalesDocListItem: React.FC<SalesDocListItemProps> = ({ doc }) => {
    const { openModal } = useUI();
    const { vehicles, deleteSalesDocument } = useData();
    const vehicle = vehicles.find(v => v.id === doc.vehicleId);
    
    const handleDelete = () => {
        if (doc.documentType === 'Sales Invoice') {
            openModal('undoSaleConfirm', doc);
        } else if (doc.documentType === 'Deposit Slip') {
            openModal('undoDepositConfirm', doc);
        } else { // Proforma or Purchase Invoice
            if (window.confirm(`Are you sure you want to delete this ${doc.documentType.toLowerCase()}? This cannot be undone.`)) {
                if (deleteSalesDocument) {
                    deleteSalesDocument(doc.id);
                }
            }
        }
    };

    return (
        <li className="flex items-center justify-between p-3 bg-gray-900/30 hover:bg-gray-800/50 rounded-xl transition-colors border border-white/5">
            <div>
                <p className="text-sm font-semibold text-white truncate" title={`${doc.documentType} #${doc.invoiceNumber}`}>
                    {doc.documentType} #{doc.invoiceNumber}
                </p>
                <p className="text-xs text-gray-400">
                    {formatDate(doc.invoiceDate)} - {vehicle?.reg || doc.customerName} - {formatCurrency(doc.subtotal)}
                </p>
            </div>
            <div className="flex-shrink-0 ml-4 flex items-center gap-2">
                <button
                    onClick={() => openModal('invoice', { viewOnly: true, document: doc })}
                    className="p-2 rounded-lg text-gray-400 hover:bg-brand-500/20 hover:text-brand-300 transition-colors"
                    title="View Document"
                >
                    <DocumentTextIcon className="h-5 w-5" />
                </button>
                <button
                    onClick={handleDelete}
                    className="p-2 rounded-lg text-gray-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                    title="Delete Document"
                >
                    <TrashIcon className="h-5 w-5" />
                </button>
            </div>
        </li>
    );
};

const FilingCabinet = () => {
    const { companyId, salesDocs, vehicles, allReceipts, deleteSalesDocument, deleteReceiptFileOnly } = useData();
    const { openModal } = useUI();
    const toast = useToast();

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [startDate, setStartDate] = useState(toYYYYMMDD(firstDayOfMonth));
    const [endDate, setEndDate] = useState(toYYYYMMDD(today));
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
    
    // Activity State for Progress Bar
    const [activity, setActivity] = useState<ActivityState>({ status: 'idle', message: '' });

    const setPeriod = (period: 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter') => {
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
            case 'last_quarter':
                const currentQuarter = Math.floor(today.getMonth() / 3);
                start = new Date(today.getFullYear(), (currentQuarter - 1) * 3, 1);
                end = new Date(today.getFullYear(), currentQuarter * 3, 0);
                break;
        }
        if (start && end) {
            setStartDate(toYYYYMMDD(start));
            setEndDate(toYYYYMMDD(end));
        }
    };
    
    const {
        filteredSalesInvoices,
        filteredPurchaseInvoicesFromDocs,
        filteredPurchaseInvoicesFromVehicles,
        filteredReceipts
    } = useMemo(() => {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        const lowerSearchTerm = searchTerm.toLowerCase();

        const sortFn = (a: { date: string }, b: { date: string }) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
        };

        const sales = salesDocs
            .filter(doc => doc.documentType !== 'Purchase Invoice')
            .filter(doc => {
                const docDate = new Date(doc.invoiceDate);
                const dateMatch = docDate >= start && docDate <= end;
                if (!dateMatch) return false;
                if (lowerSearchTerm) {
                    const vehicle = vehicles.find(v => v.id === doc.vehicleId);
                    return doc.customerName.toLowerCase().includes(lowerSearchTerm) ||
                           doc.invoiceNumber.toLowerCase().includes(lowerSearchTerm) ||
                           vehicle?.reg.toLowerCase().includes(lowerSearchTerm);
                }
                return true;
            })
            .map(doc => ({...doc, date: doc.invoiceDate}))
            .sort(sortFn);

        const purchaseDocs = salesDocs
            .filter(doc => doc.documentType === 'Purchase Invoice')
            .filter(doc => {
                const docDate = new Date(doc.invoiceDate);
                const dateMatch = docDate >= start && docDate <= end;
                if (!dateMatch) return false;
                if (lowerSearchTerm) {
                    const vehicle = vehicles.find(v => v.id === doc.vehicleId);
                    return doc.customerName.toLowerCase().includes(lowerSearchTerm) ||
                           doc.invoiceNumber.toLowerCase().includes(lowerSearchTerm) ||
                           vehicle?.reg.toLowerCase().includes(lowerSearchTerm);
                }
                return true;
            })
            .map(doc => ({...doc, date: doc.invoiceDate}))
            .sort(sortFn);

        const purchaseVehicles = vehicles
            .filter(v => v.invoiceUrl && !purchaseDocs.some(doc => doc.vehicleId === v.id))
            .filter(v => {
                 const docDate = new Date(v.purchaseDate);
                const dateMatch = docDate >= start && docDate <= end;
                if (!dateMatch) return false;
                if(lowerSearchTerm) {
                    return v.reg.toLowerCase().includes(lowerSearchTerm) ||
                           v.make.toLowerCase().includes(lowerSearchTerm) ||
                           v.model.toLowerCase().includes(lowerSearchTerm);
                }
                return true;
            })
            .map(v => ({
                id: v.id,
                name: `Purchase - ${v.reg}`,
                date: v.purchaseDate,
                downloadUrl: v.invoiceUrl!,
            }))
            .sort(sortFn);
        
        const receipts = allReceipts
            .filter(r => r.receiptUrl)
            .filter(r => {
                const docDate = new Date(r.date);
                const dateMatch = docDate >= start && docDate <= end;
                if(!dateMatch) return false;
                if(lowerSearchTerm) {
                    return r.vendor.toLowerCase().includes(lowerSearchTerm) ||
                           r.category.toLowerCase().includes(lowerSearchTerm);
                }
                return true;
            })
            .sort(sortFn);

        return {
            filteredSalesInvoices: sales,
            filteredPurchaseInvoicesFromDocs: purchaseDocs,
            filteredPurchaseInvoicesFromVehicles: purchaseVehicles,
            filteredReceipts: receipts
        };
    }, [startDate, endDate, searchTerm, sortOrder, salesDocs, vehicles, allReceipts]);

    const handleDownloadVisible = async () => {
        const totalFiles = filteredReceipts.length + filteredPurchaseInvoicesFromVehicles.length;
        
        if (totalFiles === 0) {
            toast.info("No downloadable files found in current view.");
            return;
        }

        setActivity({ status: 'running', message: 'Preparing download...', total: totalFiles, current: 0 });
        
        const zip = new JSZip();
        const filesFolder = zip.folder("files");
        
        let processedCount = 0;

        try {
            // Process Receipts
            for (const r of filteredReceipts) {
                if (r.receiptUrl) {
                    try {
                        const response = await fetch(r.receiptUrl);
                        if (response.ok) {
                            const blob = await response.blob();
                            const ext = r.receiptUrl.split('?')[0].split('.').pop() || 'jpg';
                            filesFolder?.file(`Receipt-${r.vendor}-${r.date}.${ext}`, blob);
                        }
                    } catch (e) { 
                        console.error("Error fetching receipt", e); 
                    }
                    processedCount++;
                    setActivity(prev => ({ ...prev, message: `Processing Receipts...`, current: processedCount }));
                }
            }

            // Process Purchase Invoices
            for (const v of filteredPurchaseInvoicesFromVehicles) {
                if (v.downloadUrl) {
                    try {
                        const response = await fetch(v.downloadUrl);
                        if (response.ok) {
                            const blob = await response.blob();
                            const ext = v.downloadUrl.split('?')[0].split('.').pop() || 'jpg';
                            filesFolder?.file(`Purchase-${v.name}.${ext}`, blob);
                        }
                    } catch (e) { 
                        console.error("Error fetching invoice", e); 
                    }
                    processedCount++;
                    setActivity(prev => ({ ...prev, message: `Processing Invoices...`, current: processedCount }));
                }
            }

            setActivity(prev => ({ ...prev, message: 'Compressing archive...' }));
            
            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.download = `Cabinet_Export_${startDate}_to_${endDate}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setActivity({ status: 'success', message: 'Download Complete' });
            setTimeout(() => setActivity({ status: 'idle', message: '' }), 3000);

        } catch (error) {
            console.error(error);
            setActivity({ status: 'error', message: 'Download failed. Please try again.' });
            setTimeout(() => setActivity({ status: 'idle', message: '' }), 3000);
        }
    };

    const handleArchivePeriod = () => {
        // Prepare items for the archive modal
        const itemsToArchive: any[] = [];
        
        filteredReceipts.forEach(r => itemsToArchive.push({ type: 'receipt', id: r.id, data: r, fileUrl: r.receiptUrl, fileName: `Receipt-${r.vendor}-${r.date}` }));
        filteredPurchaseInvoicesFromVehicles.forEach(v => itemsToArchive.push({ type: 'purchaseInvoice', id: v.id, data: vehicles.find(veh => veh.id === v.id), fileUrl: v.downloadUrl, fileName: v.name }));
        filteredSalesInvoices.forEach(s => itemsToArchive.push({ type: 'salesDoc', id: s.id, data: s })); // Sales docs don't have fileUrls stored, just data
        
        if (itemsToArchive.length === 0) {
            toast.info("No items to archive in current view.");
            return;
        }

        openModal('archiveDrawer', itemsToArchive);
    };

    const handleRestore = () => {
        openModal('restoreDrawer');
    };

    const salesInvoices = filteredSalesInvoices;
    const purchaseInvoicesFromDocs = filteredPurchaseInvoicesFromDocs;
    const purchaseInvoicesFromVehicles = filteredPurchaseInvoicesFromVehicles;
    const receipts = filteredReceipts;
    
    return (
        <div className="space-y-6 pb-24"> {/* Added padding bottom for floating ActivityIndicator */}
            <ActivityIndicator activity={activity} />
            
            <div className="glass-card p-4 rounded-xl flex flex-col xl:flex-row items-center gap-4">
                <div className="relative w-full xl:w-auto xl:flex-1">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" /></svg>
                    </div>
                    <input
                        type="search"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full rounded-xl border-0 bg-gray-900/50 py-2.5 pl-10 pr-3 text-white ring-1 ring-inset ring-gray-700 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-brand-500 sm:text-sm"
                        placeholder="Search documents..."
                    />
                </div>
                <div className="flex items-center gap-4 flex-wrap w-full xl:w-auto justify-end">
                    <div className="flex items-center gap-2">
                        <UkDateInput id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
                        <span className="text-gray-400 text-sm">to</span>
                        <UkDateInput id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" />
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setPeriod('this_month')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg transition-colors">This Month</button>
                        <button onClick={() => setPeriod('last_quarter')} className="px-3 py-2 text-sm font-medium text-gray-300 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg transition-colors">Last Qtr</button>
                    </div>
                    <div>
                        <Select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}>
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-3 justify-end">
                <button onClick={handleRestore} className="inline-flex items-center gap-x-2 rounded-xl bg-gray-800/50 border border-gray-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 transition-all">
                    <ArrowUpTrayIcon className="-ml-1 h-5 w-5 text-gray-400" /> Restore Archive
                </button>
                <button onClick={handleDownloadVisible} disabled={activity.status === 'running'} className="inline-flex items-center gap-x-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-500 transition-all disabled:opacity-50">
                    <ArrowDownTrayIcon className="-ml-1 h-5 w-5" /> Download Visible
                </button>
                <button onClick={handleArchivePeriod} className="inline-flex items-center gap-x-2 rounded-xl bg-red-900/50 border border-red-800/50 px-4 py-2.5 text-sm font-semibold text-red-200 shadow-sm hover:bg-red-800/50 transition-all">
                    <ArchiveBoxIcon className="-ml-1 h-5 w-5" /> Wipe & Archive Period
                </button>
            </div>

            {salesInvoices.length === 0 && purchaseInvoicesFromDocs.length === 0 && purchaseInvoicesFromVehicles.length === 0 && receipts.length === 0 && (
                <div className="text-center py-20 px-6 glass-card rounded-2xl">
                    <ArchiveBoxIcon className="h-16 w-16 text-gray-600 mx-auto" />
                    <h3 className="mt-4 text-xl font-bold text-white">Filing Cabinet is Empty</h3>
                    <p className="mt-2 text-gray-400">Your generated invoices and uploaded receipts will appear here.</p>
                </div>
            )}

            {salesInvoices.length > 0 && (
                <Drawer
                    title="Sales Invoices"
                    count={salesInvoices.length}
                >
                    {salesInvoices.map(doc => <SalesDocListItem key={doc.id} doc={doc} />)}
                </Drawer>
            )}

            {(purchaseInvoicesFromDocs.length > 0 || purchaseInvoicesFromVehicles.length > 0) && (
                 <Drawer
                    title="Purchase Invoices"
                    count={purchaseInvoicesFromDocs.length + purchaseInvoicesFromVehicles.length}
                >
                    {purchaseInvoicesFromDocs.map(doc => <SalesDocListItem key={doc.id} doc={doc} />)}
                    {purchaseInvoicesFromVehicles.map(file => (
                        <DocumentListItem
                            key={file.id}
                            name={file.name}
                            updated={file.date}
                            size={0} // Don't have size info here
                            downloadUrl={file.downloadUrl}
                            onDelete={() => {
                                if (!companyId) return;
                                if (window.confirm(`Are you sure you want to delete the purchase invoice for ${file.name}? The file will be removed but the vehicle record will be kept.`)) {
                                    dataService.deleteVehiclePurchaseInvoice(companyId, file.id);
                                }
                            }}
                        />
                    ))}
                </Drawer>
            )}

            {receipts.length > 0 && (
                <Drawer
                    title="Receipts"
                    count={receipts.length}
                >
                    {receipts.map(receipt => (
                        <DocumentListItem
                            key={receipt.id}
                            name={`${receipt.vendor} - ${formatCurrency(receipt.amount)}`}
                            updated={receipt.date}
                            size={0} // No size info
                            downloadUrl={receipt.receiptUrl!}
                             onDelete={() => {
                                if (window.confirm(`Are you sure you want to delete the file for ${receipt.vendor}? The expense record will be kept.`)) {
                                    deleteReceiptFileOnly(receipt.id);
                                }
                            }}
                        />
                    ))}
                </Drawer>
            )}
        </div>
    );
};

export default FilingCabinet;
