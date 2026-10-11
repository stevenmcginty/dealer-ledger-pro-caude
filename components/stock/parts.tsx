import React from 'react';
import { Vehicle, SalesDocument, PDI } from '../../types';
import { pdiExceptions, withPdiDefaults } from '../../utils/pdi';
import { IconButton, StatusChip } from '../ui';
import type { ChipStatus } from '../ui';
import { XMarkIcon } from '../icons';
import { cx } from '../ui/cx';

/*
 * Small shared pieces for the stock, car, garage, prep and PDI screens (S2).
 * Local on purpose: D1 owns components/ui. Candidates to fold in later:
 * PanelHeader, PageHead, SectionLabel.
 */

/** Header for a sheet/dialog body that draws its own top: title, one line, close. */
export const PanelHeader: React.FC<{
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    onClose?: () => void;
    closeLabel?: string;
    leading?: React.ReactNode;
}> = ({ title, subtitle, onClose, closeLabel = 'Close', leading }) => (
    <header className="sticky top-0 z-sticky flex flex-none items-center gap-3 border-b border-line bg-surface py-3 pe-2 ps-5">
        {leading}
        <div className="min-w-0 flex-1">
            <h2 className="truncate text-[1.375rem] font-bold leading-7 tracking-[-0.01em] text-ink">{title}</h2>
            {subtitle && <p className="truncate text-sm leading-5 text-ink-3">{subtitle}</p>}
        </div>
        {onClose && <IconButton label={closeLabel} icon={<XMarkIcon />} onClick={onClose} />}
    </header>
);

/**
 * The facts line under the shell's page title (the shell's header owns the
 * h1): counts and totals, with one optional action on the end.
 */
export const PageHead: React.FC<{ facts: React.ReactNode; action?: React.ReactNode }> = ({ facts, action }) => (
    <div className="flex min-h-[28px] items-center justify-between gap-3">
        <p className="min-w-0 text-base leading-6 text-ink-2">{facts}</p>
        {action}
    </div>
);

/** Mono eyebrow over a group. */
export const SectionLabel: React.FC<{ children: React.ReactNode; className?: string; as?: 'h2' | 'h3' | 'p' }> = ({ children, className, as: Tag = 'h2' }) => (
    <Tag className={cx('font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-3', className)}>{children}</Tag>
);

/** A car's sale state as the shared chip vocabulary. */
export const vehicleChip = (status: Vehicle['status'] | undefined): { status: ChipStatus; label: string } => {
    switch (status) {
        case 'Deposit Paid': return { status: 'reserved', label: 'Reserved' };
        case 'Sold': return { status: 'sold', label: 'Sold' };
        default: return { status: 'stock', label: 'For sale' };
    }
};

export const VehicleStatusChip: React.FC<{ status: Vehicle['status'] | undefined; size?: 'md' | 'lg' }> = ({ status, size }) => {
    const chip = vehicleChip(status);
    return <StatusChip status={chip.status} size={size}>{chip.label}</StatusChip>;
};

/** Whole days from today to a YYYY-MM-DD date (negative = in the past). */
export const daysUntil = (date: string | undefined): number | null => {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86_400_000);
};

/** MOT due inside a month (or gone) on a car that is still ours. */
export const motWarning = (vehicle: Pick<Vehicle, 'motDueDate' | 'status'>): string | null => {
    if (vehicle.status === 'Sold') return null;
    const days = daysUntil(vehicle.motDueDate);
    if (days === null || days > 30) return null;
    if (days < 0) return 'MOT ran out';
    if (days === 0) return 'MOT today';
    return `MOT ${days} day${days === 1 ? '' : 's'}`;
};

/** The documents a car has, as the actions modal and the Car page both need them. */
export const carDocs = (salesDocs: SalesDocument[], vehicleId: string) => ({
    depositDoc: salesDocs.find(doc => doc.vehicleId === vehicleId && doc.documentType === 'Deposit Slip'),
    salesDoc: salesDocs.find(doc => doc.vehicleId === vehicleId && doc.documentType === 'Sales Invoice'),
    proformaDoc: salesDocs.find(doc => doc.vehicleId === vehicleId && doc.documentType === 'Proforma Invoice'),
});

/** A PDI's headline, as the PDI list and the Car page both show it. */
export const pdiVerdict = (pdi: PDI): { status: ChipStatus; label: string } => {
    const exceptions = pdiExceptions(withPdiDefaults(pdi));
    const fails = exceptions.filter(e => e.status === 'fail').length;
    const advisories = exceptions.filter(e => e.status === 'advisory').length;
    if (!pdi.roadworthy) return { status: 'due', label: 'Not roadworthy' };
    if (fails > 0) return { status: 'due', label: `${fails} fail${fails === 1 ? '' : 's'}` };
    if (advisories > 0) return { status: 'prep', label: `${advisories} advisor${advisories === 1 ? 'y' : 'ies'}` };
    return { status: 'sold', label: 'All pass' };
};

/** "£8,495" for list rows where pence would be noise; the Car page shows pence. */
export const wholePounds = (amount: number | null | undefined): string =>
    typeof amount === 'number' ? `£${Math.round(amount).toLocaleString('en-GB')}` : '—';
