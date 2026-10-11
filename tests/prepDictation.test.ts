import { describe, expect, it } from 'vitest';
import {
    PREP_PROMPT,
    encodeWav16kMono,
    isOpenPrepDuplicate,
    mergeByCar,
    normalisePrepResult,
    resolvePrepCars,
    searchStock,
    toPrepToDos,
    toStockList,
    type PrepDictationResult,
} from '../utils/prepDictation';
import type { ToDoItem, Vehicle } from '../types';

const vehicle = (over: Partial<Vehicle> & { id: string }): Vehicle => ({
    reg: '',
    make: 'Ford',
    model: 'Focus',
    year: 2018,
    mileage: 50000,
    stockNumber: '',
    purchasePrice: 1000,
    purchaseDate: '2026-01-01',
    vatScheme: 'Margin',
    status: 'Available',
    ownershipType: 'Owned Stock',
    createdAt: 1,
    ...over,
});

const PORSCHE_A = vehicle({ id: 'p1', reg: 'AB12 CDE', make: 'Porsche', model: 'Boxster', color: 'Black', stockNumber: 'R101' });
const PORSCHE_B = vehicle({ id: 'p2', reg: 'CD34 EFG', make: 'Porsche', model: 'Cayenne', color: 'Black', stockNumber: 'R102', status: 'Deposit Paid' });
const PORSCHE_NO_COLOUR = vehicle({ id: 'p3', reg: 'EF56 GHI', make: 'Porsche', model: 'Macan', stockNumber: 'R103' });
const GOLF = vehicle({ id: 'g1', reg: 'GH78 JKL', make: 'Volkswagen', model: 'Golf', color: 'Silver', stockNumber: 'R104' });
const SOLD_PORSCHE = vehicle({ id: 's1', reg: 'JK90 MNO', make: 'Porsche', model: '911', color: 'Black', stockNumber: 'R099', status: 'Sold' });
const SOR = vehicle({ id: 'sor1', reg: 'LM11 PQR', make: 'BMW', model: '320d', ownershipType: 'Sale or Return' });

const ALL = [PORSCHE_A, PORSCHE_B, PORSCHE_NO_COLOUR, GOLF, SOLD_PORSCHE, SOR];
const STOCK = toStockList(ALL);

const result = (cars: PrepDictationResult['cars'], transcript = 'test'): PrepDictationResult => ({ transcript, cars });
const job = (text: string, urgent = false) => ({ text, urgent });

const todo = (over: Partial<ToDoItem> & { id: string; description: string }): ToDoItem => ({
    isComplete: false,
    priority: 'normal',
    type: 'prep',
    createdAt: 1,
    ...over,
});

describe('toStockList', () => {
    it('keeps unsold cars, including deposit-paid and sale-or-return, and never a sold car', () => {
        const ids = STOCK.map(c => c.id);
        expect(ids).toEqual(['p1', 'p2', 'p3', 'g1', 'sor1']);
        expect(ids).not.toContain('s1');
    });

    it('maps the fields Gemini needs, with an empty colour when none is recorded', () => {
        expect(STOCK.find(c => c.id === 'p1')).toEqual({ id: 'p1', reg: 'AB12 CDE', stockNumber: 'R101', make: 'Porsche', model: 'Boxster', colour: 'Black', year: 2018 });
        expect(STOCK.find(c => c.id === 'p3')!.colour).toBe('');
    });

    it('the prompt lists every in-stock car and no sold car', () => {
        const prompt = PREP_PROMPT(STOCK);
        for (const c of STOCK) expect(prompt).toContain(`"id":"${c.id}"`);
        expect(prompt).not.toContain('"id":"s1"');
        expect(prompt).toContain('(not recorded)');
    });
});

describe('resolvePrepCars', () => {
    it('one black Porsche → matched, no question', () => {
        const stock = toStockList([PORSCHE_A, GOLF]);
        const groups = resolvePrepCars(result([{ spokenAs: 'the black Porsche', candidateIds: ['p1'], jobs: [job('Valet')] }]), stock);
        expect(groups).toEqual([{ spokenAs: 'the black Porsche', jobs: [job('Valet')], status: 'matched', vehicleId: 'p1', candidateIds: ['p1'] }]);
    });

    it('two black Porsches → pick with both, no car chosen', () => {
        const groups = resolvePrepCars(result([{ spokenAs: 'the black Porsche', candidateIds: ['p1', 'p2'], jobs: [job('Valet')] }]), STOCK);
        expect(groups).toHaveLength(1);
        expect(groups[0].status).toBe('pick');
        expect(groups[0].candidateIds).toEqual(['p1', 'p2']);
        expect(groups[0].vehicleId).toBeUndefined();
    });

    it('a Porsche with no colour recorded stays a candidate for "black Porsche"', () => {
        const groups = resolvePrepCars(result([{ spokenAs: 'the black Porsche', candidateIds: ['p1', 'p2', 'p3'], jobs: [job('Valet')] }]), STOCK);
        expect(groups[0].status).toBe('pick');
        expect(groups[0].candidateIds).toContain('p3');
    });

    it('a sold car is never a candidate even if Gemini returns it', () => {
        const groups = resolvePrepCars(result([{ spokenAs: 'the black Porsche', candidateIds: ['s1', 'p1'], jobs: [job('Valet')] }]), STOCK);
        expect(groups[0]).toMatchObject({ status: 'matched', vehicleId: 'p1', candidateIds: ['p1'] });
    });

    it('drops unknown ids and dedupes repeated ones', () => {
        const groups = resolvePrepCars(result([
            { spokenAs: 'the Golf', candidateIds: ['made-up', 'g1', 'g1'], jobs: [job('MOT')] },
            { spokenAs: 'the Ferrari', candidateIds: ['nope'], jobs: [job('Polish')] },
        ]), STOCK);
        expect(groups[0]).toMatchObject({ status: 'matched', vehicleId: 'g1', candidateIds: ['g1'] });
        expect(groups[1]).toMatchObject({ status: 'unknown', candidateIds: [] });
        expect(groups[1].vehicleId).toBeUndefined();
    });

    it('merges two groups that land on the same car, without doubling a job', () => {
        const groups = resolvePrepCars(result([
            { spokenAs: 'the Golf', candidateIds: ['g1'], jobs: [job('MOT'), job('Wipers')] },
            { spokenAs: 'the Boxster', candidateIds: ['p1'], jobs: [job('Valet')] },
            { spokenAs: 'GH78 JKL', candidateIds: ['g1'], jobs: [job('mot', true), job('Service')] },
        ]), STOCK);
        expect(groups).toHaveLength(2);
        expect(groups[0]).toMatchObject({ spokenAs: 'the Golf', vehicleId: 'g1' });
        expect(groups[0].jobs).toEqual([job('MOT', true), job('Wipers'), job('Service')]);
        expect(groups[1].vehicleId).toBe('p1');
    });

    it('cleans job text and drops empty jobs and cars with no jobs', () => {
        const groups = resolvePrepCars(result([
            { spokenAs: 'the Golf', candidateIds: ['g1'], jobs: [job('  new   wiper blades '), job('   '), job('New wiper blades')] },
            { spokenAs: 'the Boxster', candidateIds: ['p1'], jobs: [] },
        ]), STOCK);
        expect(groups).toHaveLength(1);
        expect(groups[0].jobs).toEqual([job('New wiper blades')]);
    });

    it('nothing heard → no groups', () => {
        expect(resolvePrepCars(result([]), STOCK)).toEqual([]);
        expect(resolvePrepCars(normalisePrepResult({}), STOCK)).toEqual([]);
    });
});

describe('normalisePrepResult', () => {
    it('survives junk from the model', () => {
        expect(normalisePrepResult({ transcript: 5, cars: [null, { spokenAs: 'x', candidateIds: ['a', 3], jobs: [{ text: 'Valet', urgent: 'yes' }, null] }] }))
            .toEqual({ transcript: '', cars: [{ spokenAs: 'x', candidateIds: ['a'], jobs: [{ text: 'Valet', urgent: false }] }] });
    });
});

describe('mergeByCar', () => {
    it('merges cards for the same car and keeps extra fields; leaves cards with no car alone', () => {
        const merged = mergeByCar([
            { key: 'a', vehicleId: 'g1', jobs: [{ id: 1, text: 'MOT', urgent: false }] },
            { key: 'b', jobs: [{ id: 2, text: 'Valet', urgent: false }] },
            { key: 'c', vehicleId: 'g1', jobs: [{ id: 3, text: 'Service', urgent: false }] },
            { key: 'd', jobs: [{ id: 4, text: 'Tyre', urgent: false }] },
        ]);
        expect(merged.map(g => g.key)).toEqual(['a', 'b', 'd']);
        expect(merged[0].jobs.map(j => j.id)).toEqual([1, 3]);
    });
});

describe('toPrepToDos', () => {
    const existing = [
        todo({ id: 't1', description: 'Valet', vehicleId: 'p1', vehicleReg: 'AB12 CDE' }),
        todo({ id: 't2', description: 'New tyre', vehicleId: 'p1', isComplete: true, completionDate: '2026-10-01' }),
        todo({ id: 't3', description: 'MOT', vehicleId: 'p1', type: 'general' }),
    ];

    it('maps to the same shape as a prep to-do added by hand; urgent → high', () => {
        const todos = toPrepToDos([{ vehicleId: 'g1', jobs: [job('MOT', true), job('Wipers')] }], [], ALL);
        expect(todos).toEqual([
            { description: 'MOT', priority: 'high', isComplete: false, type: 'prep', vehicleId: 'g1', vehicleReg: 'GH78 JKL' },
            { description: 'Wipers', priority: 'normal', isComplete: false, type: 'prep', vehicleId: 'g1', vehicleReg: 'GH78 JKL' },
        ]);
    });

    it('skips a job already open as prep on that car (ignoring case and spaces), but not done or non-prep ones', () => {
        const todos = toPrepToDos([{ vehicleId: 'p1', jobs: [job(' VALET '), job('New tyre'), job('MOT'), job('Va let')] }], existing, ALL);
        expect(todos.map(t => t.description)).toEqual(['New tyre', 'MOT']);
    });

    it('the same job on another car is not a duplicate', () => {
        expect(isOpenPrepDuplicate('Valet', 'p1', existing)).toBe(true);
        expect(isOpenPrepDuplicate('Valet', 'g1', existing)).toBe(false);
        expect(toPrepToDos([{ vehicleId: 'g1', jobs: [job('Valet')] }], existing, ALL)).toHaveLength(1);
    });

    it('skips groups with no car, skipped groups, unticked or empty lines and cars not in the ledger', () => {
        const todos = toPrepToDos([
            { jobs: [job('Valet')] },
            { vehicleId: 'g1', skipped: true, jobs: [job('Valet')] },
            { vehicleId: 'g1', jobs: [{ ...job('Polish'), include: false }, job('  '), job('Wax')] },
            { vehicleId: 'gone', jobs: [job('Valet')] },
        ], [], ALL);
        expect(todos.map(t => t.description)).toEqual(['Wax']);
    });

    it('does not save the same job twice in one batch', () => {
        const todos = toPrepToDos([
            { vehicleId: 'g1', jobs: [job('Wax')] },
            { vehicleId: 'g1', jobs: [job('wax')] },
        ], [], ALL);
        expect(todos).toHaveLength(1);
    });
});

describe('searchStock', () => {
    it('finds by reg without spaces, by make and model, and by stock number', () => {
        expect(searchStock(STOCK, 'ab12cde').map(c => c.id)).toEqual(['p1']);
        expect(searchStock(STOCK, 'porsche mac').map(c => c.id)).toEqual(['p3']);
        expect(searchStock(STOCK, 'R104').map(c => c.id)).toEqual(['g1']);
        expect(searchStock(STOCK, '911')).toEqual([]);
    });
});

describe('encodeWav16kMono', () => {
    const buffer = (sampleRate: number, channels: Float32Array[]) => ({
        sampleRate,
        numberOfChannels: channels.length,
        length: channels[0].length,
        getChannelData: (c: number) => channels[c],
    });
    const ascii = (bytes: Uint8Array, at: number, n: number) => String.fromCharCode(...bytes.slice(at, at + n));

    it('writes a correct 16 kHz mono 16-bit PCM header', () => {
        const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2]);
        const bytes = encodeWav16kMono(buffer(16000, [samples]));
        const view = new DataView(bytes.buffer);
        expect(ascii(bytes, 0, 4)).toBe('RIFF');
        expect(view.getUint32(4, true)).toBe(36 + 12);
        expect(ascii(bytes, 8, 4)).toBe('WAVE');
        expect(ascii(bytes, 12, 4)).toBe('fmt ');
        expect(view.getUint32(16, true)).toBe(16);
        expect(view.getUint16(20, true)).toBe(1); // PCM
        expect(view.getUint16(22, true)).toBe(1); // mono
        expect(view.getUint32(24, true)).toBe(16000);
        expect(view.getUint32(28, true)).toBe(32000);
        expect(view.getUint16(32, true)).toBe(2);
        expect(view.getUint16(34, true)).toBe(16);
        expect(ascii(bytes, 36, 4)).toBe('data');
        expect(view.getUint32(40, true)).toBe(12);
        expect(bytes.length).toBe(44 + 12);
        expect([0, 1, 2, 3, 4, 5].map(i => view.getInt16(44 + i * 2, true))).toEqual([0, 16383, -16384, 32767, -32768, 32767]);
    });

    it('averages stereo to mono', () => {
        const bytes = encodeWav16kMono(buffer(16000, [new Float32Array([1, 0]), new Float32Array([0, 0])]));
        const view = new DataView(bytes.buffer);
        expect(view.getUint16(22, true)).toBe(1);
        expect(view.getInt16(44, true)).toBe(16383);
    });

    it('resamples 48 kHz down to 16 kHz', () => {
        const bytes = encodeWav16kMono(buffer(48000, [new Float32Array(48000)]));
        const view = new DataView(bytes.buffer);
        expect(view.getUint32(24, true)).toBe(16000);
        expect(view.getUint32(40, true)).toBe(16000 * 2);
    });
});
