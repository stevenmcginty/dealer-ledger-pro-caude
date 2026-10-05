/**
 * The search behind the Agent Inbox car picker.
 *
 * Steve types a bit of a reg, a make, a model or a stock number and gets the
 * ledger's cars back in the order he is most likely to want them: an exact reg
 * first, then cars in stock, on deposit, and sold — newest purchase first in each.
 * The sales-agent stock index (the website's cars, both ledgers on a shared
 * inbox) is folded in so a car on the other ledger can be picked too; where the
 * same car is in both, the ledger vehicle wins.
 */

import type { Vehicle } from '../types';

export type CarPickerStatus = 'in_stock' | 'deposit' | 'sold';

/** The fields of a ledger vehicle the picker needs. */
export type PickerVehicle = Pick<Vehicle, 'id' | 'reg' | 'make' | 'model' | 'status'>
    & Partial<Pick<Vehicle, 'year' | 'stockNumber' | 'purchaseDate' | 'createdAt'>>;

/** One car from `companies/{id}/salesAgent/stock` (mirror of functions StockItem, picker fields only). */
export interface PickerStockItem {
    id: string;
    title?: string;
    reg?: string;
    make?: string;
    model?: string;
    year?: number;
    status?: 'available' | 'reserved' | 'sold';
    ledgerVehicleId?: string;
    ownerCompanyId?: string;
    indexedAt?: number;
}

export interface CarPickerRow {
    /** Unique across both kinds: `v:<vehicleId>` or `s:<stockId>`. */
    key: string;
    kind: 'ledger' | 'stock';
    /** Ledger vehicle id, or stock listing id. */
    id: string;
    title: string;
    /** No spaces, upper case. Empty when the car has no reg on file. */
    reg: string;
    status: CarPickerStatus;
    /** A stock item that belongs to another ledger on the shared inbox. */
    otherLedger: boolean;
    stockNumber?: string;
    /** Newest-first sort key (purchase date, else when it was added). */
    sortAt: number;
    haystack: string;
}

export const CAR_PICKER_LIMIT = 50;

export const normaliseReg = (reg: string | undefined | null): string =>
    String(reg || '').replace(/\s+/g, '').toUpperCase();

/** "AB12CDE" → "AB12 CDE". Anything that is not a current-style UK reg is left as it is. */
export const formatReg = (reg: string | undefined | null): string => {
    const r = normaliseReg(reg);
    return /^[A-Z]{2}\d{2}[A-Z]{3}$/.test(r) ? `${r.slice(0, 4)} ${r.slice(4)}` : r;
};

/** True when the reg is already written in the title, so it need not be shown twice. */
export const titleHasReg = (title: string | undefined | null, reg: string | undefined | null): boolean => {
    const r = normaliseReg(reg);
    return !!r && normaliseReg(title).includes(r);
};

const STATUS_RANK: Record<CarPickerStatus, number> = { in_stock: 0, deposit: 1, sold: 2 };

const vehicleStatus = (status: Vehicle['status']): CarPickerStatus =>
    status === 'Sold' ? 'sold' : status === 'Deposit Paid' ? 'deposit' : 'in_stock';

const stockStatus = (status: PickerStockItem['status']): CarPickerStatus =>
    status === 'sold' ? 'sold' : status === 'reserved' ? 'deposit' : 'in_stock';

const dateMs = (value: string | undefined): number => {
    if (!value) return 0;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
};

const joinTitle = (...parts: Array<string | number | undefined>): string =>
    parts.map(p => String(p ?? '').trim()).filter(Boolean).join(' ');

/**
 * Every pickable car, ledger vehicles first. A stock item is dropped when it is
 * the same car as a ledger vehicle (same reg, or matched to that vehicle).
 */
export const buildCarPickerRows = (
    vehicles: PickerVehicle[],
    stock: PickerStockItem[] = [],
    companyId?: string | null
): CarPickerRow[] => {
    const rows: CarPickerRow[] = [];
    const regs = new Set<string>();
    const ids = new Set<string>();

    vehicles.forEach(v => {
        if (!v?.id) return;
        const reg = normaliseReg(v.reg);
        const title = joinTitle(v.year, v.make, v.model) || formatReg(reg) || 'Car';
        if (reg) regs.add(reg);
        ids.add(v.id);
        rows.push({
            key: `v:${v.id}`,
            kind: 'ledger',
            id: v.id,
            title,
            reg,
            status: vehicleStatus(v.status),
            otherLedger: false,
            ...(v.stockNumber ? { stockNumber: String(v.stockNumber) } : {}),
            sortAt: dateMs(v.purchaseDate) || v.createdAt || 0,
            haystack: joinTitle(v.year, v.make, v.model, v.stockNumber, reg).toLowerCase(),
        });
    });

    stock.forEach(item => {
        if (!item?.id) return;
        const reg = normaliseReg(item.reg);
        if (reg && regs.has(reg)) return;
        if (item.ledgerVehicleId && ids.has(item.ledgerVehicleId)) return;
        if (reg) regs.add(reg);
        const name = (item.title || '').trim() || joinTitle(item.make, item.model);
        const title = joinTitle(item.year, name) || formatReg(reg) || 'Car';
        rows.push({
            key: `s:${item.id}`,
            kind: 'stock',
            id: item.id,
            title,
            reg,
            status: stockStatus(item.status),
            otherLedger: !!item.ownerCompanyId && !!companyId && item.ownerCompanyId !== companyId,
            sortAt: item.indexedAt || 0,
            haystack: joinTitle(item.year, item.make, item.model, name, item.id, reg).toLowerCase(),
        });
    });

    return rows;
};

const compareRows = (exactReg: string) => (a: CarPickerRow, b: CarPickerRow): number => {
    if (exactReg) {
        const ax = a.reg === exactReg ? 0 : 1;
        const bx = b.reg === exactReg ? 0 : 1;
        if (ax !== bx) return ax - bx;
    }
    const s = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (s !== 0) return s;
    return b.sortAt - a.sortAt;
};

/**
 * The rows that match what was typed, best first. A match is the reg containing
 * the query (spaces and case ignored), or every typed word appearing somewhere in
 * year / make / model / stock number / reg. An empty query lists in-stock cars first.
 */
export const searchCarPicker = (
    rows: CarPickerRow[],
    query: string,
    limit: number = CAR_PICKER_LIMIT
): CarPickerRow[] => {
    const q = query.trim().toLowerCase();
    const qReg = normaliseReg(q);
    const words = q.split(/\s+/).filter(Boolean);

    const matched = q
        ? rows.filter(row =>
            (!!qReg && !!row.reg && row.reg.includes(qReg))
            || words.every(word => row.haystack.includes(word)))
        : rows.slice();

    return matched.sort(compareRows(qReg)).slice(0, limit);
};
