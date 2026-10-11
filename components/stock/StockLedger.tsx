
import React, { useState, useMemo } from 'react';
import { Vehicle, SalesDocument } from '../../types';
import { CarIcon, FunnelIcon, ArrowDownTrayIcon } from '../icons';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { useUI } from '../../hooks/useUI';
import { useWindowSize } from '../../hooks/useWindowSize';
import Modal from '../common/Modal';
import UkDateInput from '../common/UkDateInput';
import {
    Button, EmptyState, Field, List, ListRow, Plate, Search, Segmented, SkeletonList, StatusChip,
    DataTable, THead, TBody, Th, Tr, Td,
} from '../ui';
import type { SortDir } from '../ui';
import { cx } from '../ui/cx';
import { PageHead, VehicleStatusChip, motWarning, wholePounds } from './parts';

interface StockLedgerProps {
    vehicles: Vehicle[];
    salesDocs: SalesDocument[];
}

type EnrichedVehicle = Vehicle & { daysInStock: number; saleDate: string | null };

type SortKey = 'reg' | 'make' | 'daysInStock' | 'saleDate';
type SortDirection = 'ascending' | 'descending';

/** Cars that have sat this long get their day count in amber. */
const SLOW_DAYS = 60;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/** Chips on the end of a stock row: MOT warning first (it needs doing), then sale state, then SOR. */
const RowChips: React.FC<{ vehicle: EnrichedVehicle }> = ({ vehicle }) => {
    const mot = motWarning(vehicle);
    return (
        <span className="ms-auto flex flex-none items-center gap-1.5">
            {mot && <StatusChip status="due">{mot}</StatusChip>}
            <VehicleStatusChip status={vehicle.status} />
            {vehicle.ownershipType === 'Sale or Return' && <StatusChip status="neutral">SOR</StatusChip>}
        </span>
    );
};

/** The asking price when there is one; otherwise what it cost, marked as such. */
const RowPrice: React.FC<{ vehicle: Vehicle }> = ({ vehicle }) =>
    vehicle.advertisedPrice ? (
        <>{wholePounds(vehicle.advertisedPrice)}</>
    ) : (
        <span className="text-ink-3">
            {wholePounds(vehicle.purchasePrice)}<span className="ms-1 font-sans text-xs font-semibold">cost</span>
        </span>
    );

const DaysText: React.FC<{ vehicle: EnrichedVehicle }> = ({ vehicle }) => (
    <span className={vehicle.status !== 'Sold' && vehicle.daysInStock >= SLOW_DAYS ? 'font-semibold text-warning' : undefined}>
        {plural(vehicle.daysInStock, 'day')}
    </span>
);

/** One filter pill with a 48px hit area around a 36px pill. */
const FilterChip: React.FC<{
    selected?: boolean;
    disabled?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    count?: number;
    marked?: boolean;
    ariaLabel?: string;
}> = ({ selected, disabled, onClick, children, count, marked, ariaLabel }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={ariaLabel}
        className="group/chip flex min-h-[48px] flex-none items-center disabled:cursor-not-allowed"
    >
        <span
            className={cx(
                'relative inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold',
                'transition-[background-color,border-color,color,transform] duration-quick ease-out group-active/chip:scale-[.97]',
                selected
                    ? 'border-ink bg-ink text-surface'
                    : 'border-line-strong bg-surface text-ink-2 group-hover/chip:bg-surface-2 group-hover/chip:text-ink',
                disabled && 'opacity-50',
            )}
        >
            {children}
            {count !== undefined && <span className={cx('num font-semibold', selected ? 'text-surface' : 'text-ink-3')}>{count}</span>}
            {marked && <span aria-hidden="true" className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg bg-accent" />}
        </span>
    </button>
);

const SORT_OPTIONS: Array<{ value: string; label: string; key: SortKey; direction: SortDirection }> = [
    { value: 'days-desc', label: 'Longest in', key: 'daysInStock', direction: 'descending' },
    { value: 'days-asc', label: 'Newest in', key: 'daysInStock', direction: 'ascending' },
    { value: 'make-asc', label: 'Make', key: 'make', direction: 'ascending' },
    { value: 'reg-asc', label: 'Reg', key: 'reg', direction: 'ascending' },
];

export const StockLedger = ({ vehicles, salesDocs }: StockLedgerProps) => {
    const { openModal, openVehicle } = useUI();
    const [statusFilter, setStatusFilter] = useState('Current Stock');
    const [searchTerm, setSearchTerm] = useState('');
    const [snapshotDate, setSnapshotDate] = useState(''); // empty = today (live view)
    const [isFilterSheetOpen, setFilterSheetOpen] = useState(false);

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'daysInStock', direction: 'descending' });
    const { width } = useWindowSize();
    // The table needs the desktop width; below it the stock book is a list.
    const isTable = width !== undefined && width >= 1024;

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const processedVehicles = useMemo(() => {
        const viewDate = snapshotDate ? new Date(snapshotDate + 'T23:59:59') : new Date();
        const isHistorical = !!snapshotDate;

        // Map each vehicle to the invoiceDate of its first 'Sales Invoice' doc (matching salesDocs.find semantics).
        const saleDateMap = new Map<string, string | null>();
        for (const doc of salesDocs) {
            if (doc.documentType === 'Sales Invoice' && !saleDateMap.has(doc.vehicleId)) {
                saleDateMap.set(doc.vehicleId, doc.invoiceDate || null);
            }
        }

        const getSaleDate = (vehicleId: string): Date | null => {
            const invoiceDate = saleDateMap.get(vehicleId);
            if (invoiceDate) {
                const d = new Date(invoiceDate);
                return isNaN(d.getTime()) ? null : d;
            }
            return null;
        };

        const calculateDaysInStock = (vehicle: Vehicle): number => {
            const purchaseDate = new Date(vehicle.purchaseDate);
            if (isNaN(purchaseDate.getTime())) return 0;

            let endDate = new Date(viewDate);

            if (vehicle.status === 'Sold') {
                const saleDate = getSaleDate(vehicle.id);
                if (saleDate && saleDate <= viewDate) {
                    endDate = saleDate;
                }
            }

            const diffTime = Math.max(0, endDate.getTime() - purchaseDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
        };

        // When viewing a historical date, filter to only vehicles that were in stock on that date
        let baseVehicles = vehicles;
        if (isHistorical) {
            baseVehicles = vehicles.filter(v => {
                const purchaseDate = new Date(v.purchaseDate);
                if (isNaN(purchaseDate.getTime()) || purchaseDate > viewDate) return false; // Not yet purchased
                if (v.status === 'Sold') {
                    const saleDate = getSaleDate(v.id);
                    if (saleDate && saleDate <= viewDate) return false; // Already sold by that date
                }
                return true;
            });
        }

        let enriched = baseVehicles.map(v => ({
            ...v,
            daysInStock: calculateDaysInStock(v),
            saleDate: saleDateMap.get(v.id) ?? null,
        }));

        // Status filter (only apply when NOT viewing historical — historical shows all stock on that date)
        let filtered: EnrichedVehicle[] = enriched;
        if (!isHistorical) {
            if (statusFilter === 'Current Stock') {
                filtered = enriched.filter(v => v.status !== 'Sold');
            } else if (statusFilter === 'Sold Stock') {
                filtered = enriched.filter(v => v.status === 'Sold');
            } else if (statusFilter === 'Deposit Paid') {
                filtered = enriched.filter(v => v.status === 'Deposit Paid');
            }
        }

        // Search filter
        if (searchTerm.trim() !== '') {
            const lowercasedTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(v =>
                String(v.reg || '').toLowerCase().includes(lowercasedTerm) ||
                String(v.make || '').toLowerCase().includes(lowercasedTerm) ||
                String(v.model || '').toLowerCase().includes(lowercasedTerm) ||
                String(v.stockNumber || '').toLowerCase().includes(lowercasedTerm) ||
                String(v.vin || '').toLowerCase().includes(lowercasedTerm)
            );
        }

        // Sorting
        filtered.sort((a, b) => {
            if (sortConfig.key === 'make') {
                const valA = a.make || '';
                const valB = b.make || '';
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            }
            if (sortConfig.key === 'reg') {
                const valA = a.reg || '';
                const valB = b.reg || '';
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            }
            if (sortConfig.key === 'daysInStock') {
                return sortConfig.direction === 'ascending' ? a.daysInStock - b.daysInStock : b.daysInStock - a.daysInStock;
            }
            if (sortConfig.key === 'saleDate') {
                const valA = a.saleDate;
                const valB = b.saleDate;
                // Vehicles with no sale date always sort last, regardless of direction.
                if (valA === null && valB === null) return 0;
                if (valA === null) return 1;
                if (valB === null) return -1;
                if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
                return 0;
            }
            return 0;
        });

        return filtered;
    }, [vehicles, salesDocs, statusFilter, searchTerm, sortConfig, snapshotDate]);

    const totalPurchasePrice = useMemo(() => {
        return processedVehicles.reduce((sum, v) => sum + (v.purchasePrice || 0), 0);
    }, [processedVehicles]);

    // Live counts for the filter chips (what each tab would show, before search).
    const counts = useMemo(() => {
        const list = vehicles || [];
        return {
            'Current Stock': list.filter(v => v.status !== 'Sold').length,
            'Deposit Paid': list.filter(v => v.status === 'Deposit Paid').length,
            'Sold Stock': list.filter(v => v.status === 'Sold').length,
        } as Record<string, number>;
    }, [vehicles]);

    // Show the sold date only on the live 'Sold Stock' tab (never in a historical snapshot).
    const showSoldDate = statusFilter === 'Sold Stock' && !snapshotDate;

    // When sorted by sale date on the Sold tab, group the list under month headers.
    const groupedVehicles = useMemo(() => {
        if (!(showSoldDate && sortConfig.key === 'saleDate')) return null;
        const groups: { label: string; vehicles: EnrichedVehicle[] }[] = [];
        for (const v of processedVehicles) {
            const label = v.saleDate
                ? new Date(v.saleDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
                : 'No sale date';
            const last = groups[groups.length - 1];
            if (last && last.label === label) {
                last.vehicles.push(v);
            } else {
                groups.push({ label, vehicles: [v] });
            }
        }
        return groups;
    }, [processedVehicles, showSoldDate, sortConfig.key]);

    const handleExportCSV = () => {
        const headers = ['Stock #', 'Registration', 'Make', 'Model', 'Year', 'Mileage', 'VIN', 'Purchase Price', 'Purchase Date', 'Sold Date', 'Status', 'Ownership', 'Days in Stock'];
        const rows = processedVehicles.map(v => [
            v.stockNumber,
            v.reg || '',
            v.make,
            v.model,
            v.year,
            v.mileage || '',
            v.vin || '',
            v.purchasePrice?.toFixed(2) ?? '0.00',
            v.purchaseDate,
            v.saleDate ?? '',
            v.status,
            v.ownershipType,
            v.daysInStock,
        ]);
        rows.push(['', '', '', '', '', '', '', totalPurchasePrice.toFixed(2), '', '', '', '', '']);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateLabel = snapshotDate || new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `stock-book-${dateLabel}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!vehicles) return <SkeletonList rows={5} label="Loading stock" />;

    const selectTab = (tab: string) => {
        setStatusFilter(tab);
        if (tab === 'Sold Stock') {
            setSortConfig({ key: 'saleDate', direction: 'descending' });
        } else {
            setSortConfig(prev => prev.key === 'saleDate' ? { key: 'daysInStock', direction: 'descending' } : prev);
        }
    };

    const tabs: Array<{ value: string; label: string }> = [
        { value: 'Current Stock', label: 'In stock' },
        { value: 'Deposit Paid', label: 'Reserved' },
        { value: 'Sold Stock', label: 'Sold' },
    ];

    const sortValue = SORT_OPTIONS.find(o => o.key === sortConfig.key && o.direction === sortConfig.direction)?.value ?? '';
    const isDefaultSort = sortConfig.key === (statusFilter === 'Sold Stock' ? 'saleDate' : 'daysInStock') && sortConfig.direction === 'descending';
    const filtersMarked = !!snapshotDate || !isDefaultSort;
    const snapshotLabel = snapshotDate ? formatDate(snapshotDate, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

    const thSort = (key: SortKey): SortDir => (sortConfig.key === key ? sortConfig.direction : 'none');

    const groupLabel = (label: string, n: number) => `${label} · ${plural(n, 'car')}`;

    const renderRow = (vehicle: EnrichedVehicle) => (
        <ListRow
            key={vehicle.id}
            onClick={() => openVehicle(vehicle.id)}
            chevron={false}
            top={
                <>
                    <Plate reg={vehicle.reg || '—'} size="sm" />
                    <span className="num text-sm font-semibold text-ink-3">#{vehicle.stockNumber || '—'}</span>
                    <RowChips vehicle={vehicle} />
                </>
            }
            title={`${vehicle.make} ${vehicle.model}`.trim() || 'Unnamed car'}
            amount={<RowPrice vehicle={vehicle} />}
            meta={
                <>
                    {[vehicle.year, vehicle.mileage ? `${vehicle.mileage.toLocaleString('en-GB')} mi` : null].filter(Boolean).join(' · ')}
                    {(vehicle.year || vehicle.mileage) ? ' · ' : ''}
                    {showSoldDate
                        ? <>Sold {vehicle.saleDate ? formatDate(vehicle.saleDate) : '—'}</>
                        : <DaysText vehicle={vehicle} />}
                </>
            }
        />
    );

    const renderTableRow = (vehicle: EnrichedVehicle) => {
        const name = `${vehicle.make} ${vehicle.model}`.trim() || 'Unnamed car';
        return (
            <Tr key={vehicle.id} onClick={() => openVehicle(vehicle.id)} className="cursor-pointer">
                <Td className="w-0 ps-4"><Plate reg={vehicle.reg || '—'} size="sm" /></Td>
                <Td className="max-w-[22rem]">
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); openVehicle(vehicle.id); }}
                        className="block max-w-full truncate rounded-chip text-start text-base font-semibold leading-tight text-ink hover:underline"
                    >
                        {name}
                    </button>
                    <span className="mt-0.5 block truncate text-sm text-ink-3">
                        <span className="num">#{vehicle.stockNumber || '—'}</span>
                        {vehicle.year ? ` · ${vehicle.year}` : ''}
                        {vehicle.fuelType ? ` · ${vehicle.fuelType}` : ''}
                    </span>
                </Td>
                <Td numeric className="text-ink-2">{vehicle.mileage ? vehicle.mileage.toLocaleString('en-GB') : '—'}</Td>
                <Td numeric><DaysText vehicle={vehicle} /></Td>
                <Td numeric>
                    {formatCurrency(vehicle.purchasePrice)}
                    <span className="block font-sans text-xs text-ink-3">{formatDate(vehicle.purchaseDate)}</span>
                </Td>
                <Td numeric>{vehicle.advertisedPrice ? formatCurrency(vehicle.advertisedPrice) : <span className="text-ink-3">—</span>}</Td>
                {showSoldDate && <Td numeric className="text-ink-2">{vehicle.saleDate ? formatDate(vehicle.saleDate) : '—'}</Td>}
                <Td className="pe-4"><span className="flex justify-end"><RowChips vehicle={vehicle} /></span></Td>
            </Tr>
        );
    };

    const colCount = showSoldDate ? 8 : 7;

    return (
        <div className="space-y-4 pb-6">
            <PageHead
                facts={
                    <>
                        {plural(processedVehicles.length, 'car')}
                        {' · '}
                        <span className="num font-semibold text-ink-2">{formatCurrency(totalPurchasePrice)}</span> at cost
                    </>
                }
            />

            <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-3">
                <Search
                    value={searchTerm}
                    onChange={setSearchTerm}
                    label="Search stock"
                    placeholder="Reg, make, model or stock no."
                    className="w-full lg:max-w-sm"
                />
                <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Show">
                    {tabs.map(tab => (
                        <FilterChip
                            key={tab.value}
                            selected={!snapshotDate && statusFilter === tab.value}
                            disabled={!!snapshotDate}
                            onClick={() => selectTab(tab.value)}
                            count={counts[tab.value]}
                        >
                            {tab.label}
                        </FilterChip>
                    ))}
                    <span aria-hidden="true" className="mx-0.5 h-6 w-px flex-none bg-line" />
                    <FilterChip
                        onClick={() => setFilterSheetOpen(true)}
                        marked={filtersMarked}
                        ariaLabel={filtersMarked ? 'Sort, date and export (changed)' : 'Sort, date and export'}
                    >
                        <FunnelIcon className="h-4 w-4" />
                        More
                    </FilterChip>
                </div>
            </div>

            {snapshotDate && (
                <div className="flex items-center justify-between gap-3 rounded-control border border-warning bg-warning-soft py-1.5 pe-1.5 ps-3.5 text-warning-ink">
                    <p className="text-sm font-semibold">Stock as it stood on <span className="num">{snapshotLabel}</span></p>
                    <Button size="sm" variant="secondary" onClick={() => setSnapshotDate('')}>Back to today</Button>
                </div>
            )}

            {processedVehicles.length === 0 ? (
                <div className="rounded-card border border-line bg-surface">
                    {searchTerm ? (
                        <EmptyState
                            icon={<CarIcon />}
                            title={`No cars match “${searchTerm}”`}
                            description="Search looks at the reg, make, model, stock number and VIN."
                            actionLabel="Clear search"
                            onAction={() => setSearchTerm('')}
                        />
                    ) : vehicles.length === 0 ? (
                        <EmptyState
                            icon={<CarIcon />}
                            title="No cars yet"
                            description="Every car you buy lands here with its costs, prep and paperwork."
                            actionLabel="Add car"
                            onAction={() => openModal('vehicle')}
                        />
                    ) : (
                        <EmptyState
                            icon={<CarIcon />}
                            title={statusFilter === 'Deposit Paid' ? 'No cars reserved' : statusFilter === 'Sold Stock' ? 'Nothing sold yet' : 'No cars in stock'}
                            description={snapshotDate ? `Nothing was in stock on ${snapshotLabel}.` : 'Cars move here as their status changes.'}
                        />
                    )}
                </div>
            ) : !isTable ? (
                <div className="space-y-4">
                    {groupedVehicles ? (
                        groupedVehicles.map(group => (
                            <section key={group.label} aria-label={group.label} className="space-y-2">
                                <h2 className="px-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">{groupLabel(group.label, group.vehicles.length)}</h2>
                                <List>{group.vehicles.map(renderRow)}</List>
                            </section>
                        ))
                    ) : (
                        <List ariaLabel="Cars">{processedVehicles.map(renderRow)}</List>
                    )}
                </div>
            ) : (
                <DataTable ariaLabel="Stock book" minWidth={900}>
                    <THead>
                        <tr>
                            <Th sort={thSort('reg')} onSort={() => requestSort('reg')} className="ps-4">Reg</Th>
                            <Th sort={thSort('make')} onSort={() => requestSort('make')}>Car</Th>
                            <Th numeric>Miles</Th>
                            <Th numeric sort={thSort('daysInStock')} onSort={() => requestSort('daysInStock')}>Days</Th>
                            <Th numeric>Bought</Th>
                            <Th numeric>Asking</Th>
                            {showSoldDate && <Th numeric sort={thSort('saleDate')} onSort={() => requestSort('saleDate')}>Sold</Th>}
                            <Th numeric className="pe-4">Status</Th>
                        </tr>
                    </THead>
                    <TBody>
                        {groupedVehicles ? (
                            groupedVehicles.map(group => (
                                <React.Fragment key={group.label}>
                                    <tr>
                                        <td colSpan={colCount} className="border-b border-line bg-surface-2 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3">
                                            {groupLabel(group.label, group.vehicles.length)}
                                        </td>
                                    </tr>
                                    {group.vehicles.map(renderTableRow)}
                                </React.Fragment>
                            ))
                        ) : (
                            processedVehicles.map(renderTableRow)
                        )}
                    </TBody>
                    <tfoot>
                        <tr>
                            <td colSpan={4} className="border-t border-line-strong bg-surface-2 px-4 py-3 text-sm font-semibold text-ink-2">
                                {plural(processedVehicles.length, 'car')}
                            </td>
                            <td className="num border-t border-line-strong bg-surface-2 px-2.5 py-3 text-end text-sm font-semibold text-ink">{formatCurrency(totalPurchasePrice)}</td>
                            <td colSpan={colCount - 5} className="border-t border-line-strong bg-surface-2" />
                        </tr>
                    </tfoot>
                </DataTable>
            )}

            {isFilterSheetOpen && (
                <Modal
                    onClose={() => setFilterSheetOpen(false)}
                    size="sm"
                    title="Sort and view"
                    footer={<Button block onClick={() => setFilterSheetOpen(false)}>Show {plural(processedVehicles.length, 'car')}</Button>}
                >
                    <div className="space-y-5">
                        {!showSoldDate && (
                            <Field label="Sort by">
                                <Segmented
                                    ariaLabel="Sort by"
                                    full
                                    value={sortValue}
                                    onChange={v => {
                                        const opt = SORT_OPTIONS.find(o => o.value === v);
                                        if (opt) setSortConfig({ key: opt.key, direction: opt.direction });
                                    }}
                                    options={SORT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                                />
                            </Field>
                        )}
                        <Field
                            label="Stock on a past date"
                            htmlFor="snapshot-date"
                            hint="Shows what was on the books at the end of that day. Leave empty for today."
                        >
                            <UkDateInput
                                id="snapshot-date"
                                name="snapshot-date"
                                value={snapshotDate}
                                onChange={e => {
                                    // Same limit the old date picker had (max = today): no future snapshots.
                                    const today = new Date().toISOString().split('T')[0];
                                    setSnapshotDate(e.target.value && e.target.value > today ? today : e.target.value);
                                }}
                            />
                        </Field>
                        {snapshotDate && (
                            <Button variant="ghost" size="sm" onClick={() => setSnapshotDate('')}>Back to today</Button>
                        )}
                        <div className="border-t border-line pt-4">
                            <Button
                                variant="secondary"
                                block
                                icon={<ArrowDownTrayIcon />}
                                onClick={handleExportCSV}
                                disabled={processedVehicles.length === 0}
                            >
                                Export {plural(processedVehicles.length, 'car')} as CSV
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};
