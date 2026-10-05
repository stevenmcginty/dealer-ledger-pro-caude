import { describe, expect, it } from 'vitest';
import {
    buildCarPickerRows,
    formatReg,
    normaliseReg,
    searchCarPicker,
    titleHasReg,
    type PickerStockItem,
    type PickerVehicle,
} from '../utils/carPickerSearch';

const vehicle = (over: Partial<PickerVehicle> & { id: string }): PickerVehicle => ({
    reg: '',
    make: 'Ford',
    model: 'Focus',
    status: 'Available',
    year: 2018,
    stockNumber: '',
    purchaseDate: '2026-01-01',
    ...over,
});

const VEHICLES: PickerVehicle[] = [
    vehicle({ id: 'v1', reg: 'AB12 CDE', make: 'Porsche', model: 'Boxster', year: 2005, stockNumber: 'R101', purchaseDate: '2026-03-01' }),
    vehicle({ id: 'v2', reg: 'XY66ZZZ', make: 'Ford', model: 'Focus ST-3', status: 'Sold', purchaseDate: '2025-06-01' }),
    vehicle({ id: 'v3', reg: 'ab12cdf', make: 'Mazda', model: 'MX-5', status: 'Deposit Paid', purchaseDate: '2026-02-01' }),
    vehicle({ id: 'v4', reg: 'KL19 MNO', make: 'Ford', model: 'Fiesta', status: 'Sold', purchaseDate: '2026-04-01' }),
    vehicle({ id: 'v5', reg: 'PQ20 RST', make: 'Ford', model: 'Kuga', purchaseDate: '2026-05-01' }),
];

const STOCK: PickerStockItem[] = [
    // Same car as v1 by reg: the ledger vehicle wins.
    { id: 's1', title: 'Porsche Boxster 3.2 S', reg: 'AB12CDE', status: 'available', ownerCompanyId: 'steve' },
    // Matched to v5 by id: dropped.
    { id: 's2', title: 'Ford Kuga', reg: '', ledgerVehicleId: 'v5', status: 'available', ownerCompanyId: 'steve' },
    // Chris's car, only on the stock index.
    { id: 's3', title: 'BMW 320d M Sport', make: 'BMW', model: '320d', year: 2019, reg: 'BM19 WWW', status: 'reserved', ownerCompanyId: 'chris' },
];

const keys = (rows: { key: string }[]) => rows.map(r => r.key);

describe('reg helpers', () => {
    it('normalises and formats regs', () => {
        expect(normaliseReg(' ab12 cde ')).toBe('AB12CDE');
        expect(formatReg('ab12cde')).toBe('AB12 CDE');
        expect(formatReg('A1 ABC')).toBe('A1ABC');
        expect(titleHasReg('2005 Porsche Boxster AB12 CDE', 'ab12cde')).toBe(true);
        expect(titleHasReg('2005 Porsche Boxster', 'AB12CDE')).toBe(false);
        expect(titleHasReg('Anything', '')).toBe(false);
    });
});

describe('buildCarPickerRows', () => {
    const rows = buildCarPickerRows(VEHICLES, STOCK, 'steve');

    it('dedupes stock against the ledger, ledger vehicle winning', () => {
        expect(keys(rows)).toEqual(['v:v1', 'v:v2', 'v:v3', 'v:v4', 'v:v5', 's:s3']);
    });

    it('builds titles, regs, statuses and the other-ledger flag', () => {
        const v1 = rows.find(r => r.key === 'v:v1')!;
        expect(v1).toMatchObject({ kind: 'ledger', title: '2005 Porsche Boxster', reg: 'AB12CDE', status: 'in_stock', otherLedger: false });
        expect(rows.find(r => r.key === 'v:v3')!.status).toBe('deposit');
        const s3 = rows.find(r => r.key === 's:s3')!;
        expect(s3).toMatchObject({ kind: 'stock', id: 's3', title: '2019 BMW 320d M Sport', reg: 'BM19WWW', status: 'deposit', otherLedger: true });
    });
});

describe('searchCarPicker', () => {
    const rows = buildCarPickerRows(VEHICLES, STOCK, 'steve');

    it('empty query: in stock first, then deposit, then sold, newest purchase first', () => {
        expect(keys(searchCarPicker(rows, ''))).toEqual(['v:v5', 'v:v1', 'v:v3', 's:s3', 'v:v4', 'v:v2']);
    });

    it('caps the list', () => {
        expect(searchCarPicker(rows, '', 2)).toHaveLength(2);
    });

    it('matches a reg ignoring spaces and case, prefix or contained', () => {
        expect(keys(searchCarPicker(rows, 'ab12'))).toEqual(['v:v1', 'v:v3']);
        expect(keys(searchCarPicker(rows, '12 cd'))).toEqual(['v:v1', 'v:v3']);
        expect(keys(searchCarPicker(rows, 'MNO'))).toEqual(['v:v4']);
    });

    it('puts an exact reg first, ahead of status order', () => {
        // AB12CDF is on deposit, AB12CDE is in stock; typing the exact deposit reg lifts it.
        expect(keys(searchCarPicker(rows, 'ab12 cdf'))).toEqual(['v:v3']);
        const many = buildCarPickerRows([
            vehicle({ id: 'a', reg: 'AA11AAA', status: 'Sold' }),
            vehicle({ id: 'b', reg: 'AA11AAAB', status: 'Available' }),
        ]);
        expect(keys(searchCarPicker(many, 'aa11 aaa'))).toEqual(['v:a', 'v:b']);
    });

    it('matches make, model, "make model" and stock number', () => {
        expect(keys(searchCarPicker(rows, 'ford'))).toEqual(['v:v5', 'v:v4', 'v:v2']);
        expect(keys(searchCarPicker(rows, 'ford focus'))).toEqual(['v:v2']);
        expect(keys(searchCarPicker(rows, 'Boxster'))).toEqual(['v:v1']);
        expect(keys(searchCarPicker(rows, 'r101'))).toEqual(['v:v1']);
        expect(keys(searchCarPicker(rows, 'bmw 320'))).toEqual(['s:s3']);
    });

    it('returns nothing when nothing matches', () => {
        expect(searchCarPicker(rows, 'lamborghini')).toEqual([]);
    });
});
