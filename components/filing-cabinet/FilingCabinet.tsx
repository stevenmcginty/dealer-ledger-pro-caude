
import React, { useState, useMemo } from 'react';
import { formatCurrency, formatDate, toYYYYMMDD } from '../../utils/helpers';
import * as dataService from '../../services/dataService';
import Drawer from './Drawer';
import DocumentListItem, { ReceiptChip } from './DocumentListItem';
import { useData } from '../../hooks/useData';
import { useUI } from '../../hooks/useUI';
import { Button, DocChip, EmptyState, IconButton, Plate, Search, useToast } from '../ui';
import type { DocKind } from '../ui';
import { cx, eyebrow } from '../ui/cx';
import { ArchiveBoxIcon, DocumentTextIcon, TrashIcon, ArrowDownTrayIcon, ArrowUpTrayIcon } from '../icons';
import { DocumentType, SalesDocument } from '../../types';
import UkDateInput from '../common/UkDateInput';
import Select from '../common/Select';
import JSZip from 'jszip';
import ActivityIndicator, { ActivityState } from '../common/ActivityIndicator';


const DOC_KIND: Record<DocumentType, DocKind> = {
    'Sales Invoice': 'SI',
    'Proforma Invoice': 'PF',
    'Deposit Slip': 'DS',
    'Purchase Invoice': 'PI',
};

type Period = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter';
const PERIODS: { id: Period; label: string }[] = [
    { id: 'this_month', label: 'This month' },
    { id: 'last_month', label: 'Last month' },
    { id: 'this_quarter', label: 'This quarter' },
    { id: 'last_quarter', label: 'Last quarter' },
];

const periodRange = (period: Period) => {
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
    return { start: toYYYYMMDD(start), end: toYYYYMMDD(end) };
};

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
            if (window.confirm(`Delete ${doc.documentType.toLowerCase()} ${doc.invoiceNumber}? You can't undo this.`)) {
                if (deleteSalesDocument) {
                    deleteSalesDocument(doc.id);
                }
            }
        }
    };

    return (
        <li className="flex min-h-[64px] items-center gap-3 py-2 pe-1.5 ps-3.5 sm:ps-4">
            <DocChip kind={DOC_KIND[doc.documentType]} label={null} />
            <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-2 text-base font-semibold leading-6 text-ink" title={`${doc.documentType} #${doc.invoiceNumber}`}>
                    {vehicle?.reg && <Plate reg={vehicle.reg} size="sm" />}
                    <span className="num truncate">{doc.invoiceNumber}</span>
                </p>
                <p className="truncate text-sm leading-5 text-ink-3">
                    <span className="num text-ink-2">{formatCurrency(doc.subtotal)}</span> · <span className="num">{formatDate(doc.invoiceDate)}</span> · {doc.customerName}
                </p>
            </div>
            <div className="flex flex-none items-center">
                <IconButton
                    label={`View ${doc.documentType.toLowerCase()} ${doc.invoiceNumber}`}
                    icon={<DocumentTextIcon />}
                    onClick={() => openModal('invoice', { viewOnly: true, document: doc })}
                />
                <IconButton
                    label={`Delete ${doc.documentType.toLowerCase()} ${doc.invoiceNumber}`}
                    icon={<TrashIcon />}
                    onClick={handleDelete}
                />
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

    const setPeriod = (period: Period) => {
        const { start, end } = periodRange(period);
        setStartDate(start);
        setEndDate(end);
    };
    const activePeriod = PERIODS.find(p => {
        const r = periodRange(p.id);
        return r.start === startDate && r.end === endDate;
    })?.id;

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
            toast.info("No files to download in these dates.");
            return;
        }

        setActivity({ status: 'running', message: 'Getting the files ready…', total: totalFiles, current: 0 });
        
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
                    setActivity(prev => ({ ...prev, message: `Adding receipts…`, current: processedCount }));
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
                    setActivity(prev => ({ ...prev, message: `Adding invoices…`, current: processedCount }));
                }
            }

            setActivity(prev => ({ ...prev, message: 'Zipping…' }));
            
            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(content);
            link.download = `Cabinet_Export_${startDate}_to_${endDate}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setActivity({ status: 'success', message: 'Files downloaded' });
            setTimeout(() => setActivity({ status: 'idle', message: '' }), 3000);

        } catch (error) {
            console.error(error);
            setActivity({ status: 'error', message: "Download didn't finish. Check your signal and try again." });
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
            toast.info("Nothing to archive in these dates.");
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
    
    const total = salesInvoices.length + purchaseInvoicesFromDocs.length + purchaseInvoicesFromVehicles.length + receipts.length;

    return (
        <div className="space-y-5 pb-24"> {/* Room for the floating ActivityIndicator */}
            <ActivityIndicator activity={activity} />

            {/* ---- Find: search, dates, order ---- */}
            <section aria-label="Find documents" className="space-y-3 rounded-card border border-line bg-surface p-2.5 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                    <Search
                        value={searchTerm}
                        onChange={setSearchTerm}
                        label="Search documents"
                        placeholder="Name, invoice number or reg"
                        shortcut="/"
                        className="sm:flex-1"
                    />
                    <Select
                        aria-label="Order"
                        value={sortOrder}
                        onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                        wrapperClassName="sm:w-44 sm:flex-none"
                    >
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                    </Select>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:w-[28rem] lg:flex-none">
                        <label htmlFor="start-date" className="text-sm font-semibold text-ink">From</label>
                        <UkDateInput id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <label htmlFor="end-date" className="text-sm font-semibold text-ink">To</label>
                        <UkDateInput id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <div className="-mx-2.5 flex gap-2 overflow-x-auto px-2.5 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 lg:flex-1 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Quick dates">
                        {PERIODS.map(p => (
                            <button
                                key={p.id}
                                type="button"
                                aria-pressed={activePeriod === p.id}
                                onClick={() => setPeriod(p.id)}
                                className={cx(
                                    'min-h-[44px] flex-none whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors duration-quick ease-out',
                                    activePeriod === p.id
                                        ? 'border-transparent bg-accent-soft text-accent-soft-ink'
                                        : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* ---- What's here, and what you can do with it ---- */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-ink-3" role="status">
                    <span className="num text-base font-semibold text-ink">{total}</span> {total === 1 ? 'document' : 'documents'} from <span className="num">{formatDate(startDate)}</span> to <span className="num">{formatDate(endDate)}</span>
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    <Button
                        variant="secondary"
                        icon={<ArrowDownTrayIcon />}
                        onClick={handleDownloadVisible}
                        loading={activity.status === 'running'}
                        className="col-span-2 sm:col-span-1"
                    >
                        Download files
                    </Button>
                    <Button variant="secondary" icon={<ArrowUpTrayIcon />} onClick={handleRestore}>
                        Restore
                    </Button>
                    <button
                        type="button"
                        onClick={handleArchivePeriod}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-5 text-base font-semibold text-danger transition-[background-color,color,transform] duration-quick ease-out hover:bg-danger-soft hover:text-danger-ink active:scale-[.97] active:duration-press [&_svg]:h-5 [&_svg]:w-5"
                    >
                        <ArchiveBoxIcon /> Archive
                    </button>
                </div>
            </div>

            {total === 0 ? (
                <div className="rounded-card border border-line bg-surface">
                    <EmptyState
                        icon={<ArchiveBoxIcon />}
                        title="Nothing filed in these dates"
                        description="Sales documents you make and receipts you upload are filed here. Try a wider date range or clear the search."
                        actionLabel={activePeriod === 'this_quarter' ? 'Show last quarter' : 'Show this quarter'}
                        onAction={() => setPeriod(activePeriod === 'this_quarter' ? 'last_quarter' : 'this_quarter')}
                    />
                </div>
            ) : (
                <section aria-label="Filing cabinet">
                    <p className={cx(eyebrow, 'px-1 pb-1.5')}>Cabinet</p>
                    {/* The cabinet: a frame with the drawers stacked inside it. */}
                    <div className="space-y-1.5 rounded-card border border-line-strong bg-surface-2 p-1.5">
                        {salesInvoices.length > 0 && (
                            <Drawer title="Sales documents" count={salesInvoices.length}>
                                {salesInvoices.map(doc => <SalesDocListItem key={doc.id} doc={doc} />)}
                            </Drawer>
                        )}

                        {(purchaseInvoicesFromDocs.length > 0 || purchaseInvoicesFromVehicles.length > 0) && (
                            <Drawer
                                title="Purchase invoices"
                                count={purchaseInvoicesFromDocs.length + purchaseInvoicesFromVehicles.length}
                            >
                                {purchaseInvoicesFromDocs.map(doc => <SalesDocListItem key={doc.id} doc={doc} />)}
                                {purchaseInvoicesFromVehicles.map(file => {
                                    const v = vehicles.find(veh => veh.id === file.id);
                                    return (
                                        <DocumentListItem
                                            key={file.id}
                                            name={file.name}
                                            updated={file.date}
                                            size={0} // Don't have size info here
                                            downloadUrl={file.downloadUrl}
                                            code={<DocChip kind="PI" label={null} />}
                                            title={v ? <><Plate reg={v.reg} size="sm" /><span className="truncate">{v.make} {v.model}</span></> : undefined}
                                            meta="Uploaded file"
                                            onDelete={() => {
                                                if (!companyId) return;
                                                if (window.confirm(`Delete the purchase invoice file for ${file.name}? The car's record stays.`)) {
                                                    dataService.deleteVehiclePurchaseInvoice(companyId, file.id);
                                                }
                                            }}
                                        />
                                    );
                                })}
                            </Drawer>
                        )}

                        {receipts.length > 0 && (
                            <Drawer title="Receipts" count={receipts.length}>
                                {receipts.map(receipt => (
                                    <DocumentListItem
                                        key={receipt.id}
                                        name={`${receipt.vendor} - ${formatCurrency(receipt.amount)}`}
                                        updated={receipt.date}
                                        size={0} // No size info
                                        downloadUrl={receipt.receiptUrl!}
                                        code={<ReceiptChip />}
                                        title={<span className="truncate">{receipt.vendor}</span>}
                                        meta={<><span className="num text-ink-2">{formatCurrency(receipt.amount)}</span>{receipt.category ? ` · ${receipt.category}` : ''}</>}
                                        onDelete={() => {
                                            if (window.confirm(`Delete the receipt file for ${receipt.vendor}? The expense stays.`)) {
                                                deleteReceiptFileOnly(receipt.id);
                                            }
                                        }}
                                    />
                                ))}
                            </Drawer>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
};

export default FilingCabinet;
