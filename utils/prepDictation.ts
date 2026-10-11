/**
 * Prep dictation: Steve talks about the prep jobs while he walks round the
 * cars, Gemini turns the recording into a job list per car, and this file
 * decides which car each list belongs to.
 *
 * Rule from the Agent Inbox work: right car or no car. Gemini only proposes
 * candidate cars; code checks every id against the in-stock list and asks
 * Steve whenever more than one car fits. Nothing here guesses a car.
 *
 * Pure on purpose (no import.meta, no DOM): the unit tests and the Gemini
 * smoke script import it directly.
 */

import { Type } from '@google/genai';
import type { NewToDoItem, ToDoItem, Vehicle } from '../types';

/** One in-stock car as Gemini sees it. */
export interface PrepStockCar {
    id: string;
    reg: string;
    stockNumber: string;
    make: string;
    model: string;
    /** Empty when no colour is recorded on the car. */
    colour: string;
    year: number | null;
}

export interface PrepJob {
    text: string;
    urgent: boolean;
}

/** What Gemini returns for one car Steve talked about. */
export interface PrepDictationCar {
    spokenAs: string;
    candidateIds: string[];
    jobs: PrepJob[];
}

export interface PrepDictationResult {
    transcript: string;
    cars: PrepDictationCar[];
}

export type PrepCarStatus = 'matched' | 'pick' | 'unknown';

/** One car's job list after the ids have been checked against stock. */
export interface PrepCarGroup {
    spokenAs: string;
    jobs: PrepJob[];
    /** matched = exactly one car fits; pick = 2+ fit, Steve chooses; unknown = none fits. */
    status: PrepCarStatus;
    /** Set only when status is 'matched' (or once Steve has picked a car). */
    vehicleId?: string;
    candidateIds: string[];
}

type StockVehicle = Pick<Vehicle, 'id' | 'reg' | 'make' | 'model' | 'status'>
    & Partial<Pick<Vehicle, 'stockNumber' | 'color' | 'year'>>;

/**
 * Cars that are physically on the forecourt: everything not sold. Sale or
 * Return cars count — they are on the forecourt and get prepped too. The
 * Vehicle record has no other "not real stock" flag.
 */
export const toStockList = (vehicles: StockVehicle[]): PrepStockCar[] =>
    vehicles
        .filter(v => v && v.id && v.status !== 'Sold')
        .map(v => ({
            id: v.id,
            reg: String(v.reg || '').trim().toUpperCase(),
            stockNumber: String(v.stockNumber || '').trim(),
            make: String(v.make || '').trim(),
            model: String(v.model || '').trim(),
            colour: String(v.color || '').trim(),
            year: typeof v.year === 'number' && v.year > 0 ? v.year : null,
        }));

export const PREP_PROMPT = (stockList: PrepStockCar[]): string => {
    const lines = stockList.map(c => JSON.stringify({
        id: c.id,
        reg: c.reg,
        stockNo: c.stockNumber,
        make: c.make,
        model: c.model,
        colour: c.colour || '(not recorded)',
        year: c.year ?? '',
    }));
    return [
        'You are listening to a UK used-car dealer walking round his forecourt, saying which preparation jobs each car needs.',
        'Write in British English. Know the UK trade words: nearside = passenger side, offside = driver side, valet, MOT, service, cambelt, alloy refurb, smart repair, dent.',
        '',
        'Return:',
        '- transcript: what he said, word for word, in British English.',
        '- cars: one entry for each car he talks about, in the order he talks about them.',
        '',
        'For each car:',
        '- spokenAs: how he referred to the car, in a few words (for example "the black Porsche" or "AB12 CDE").',
        '- candidateIds: the id of EVERY car in the stock list below that fits what he said.',
        '  - If he says a registration (even part of one, or spelled with phonetic letters) or a stock number, give only that car.',
        '  - If he describes the car by make, model or colour, go through the stock list one car at a time and give every car that fits.',
        '  - Colour "(not recorded)" means nobody wrote the colour down. It never rules a car out: a car with colour "(not recorded)" fits any colour he says, as long as the make and model fit. Example: "the black Porsche" fits every black Porsche AND every Porsche with colour "(not recorded)".',
        '  - Use only ids from the stock list. Never invent an id. If no car fits, give an empty list.',
        '- jobs: one short job per line. Start each with a capital letter. Write MOT in capitals. Do not put the car name, reg or colour in the job text. Do not number them.',
        '  - urgent: true only if he says the job is urgent, or must be done first or today. Otherwise false.',
        '',
        'If he does not mention any jobs, return an empty cars list.',
        '',
        'Stock list (one car per line):',
        ...lines,
    ].join('\n');
};

export const PREP_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        transcript: { type: Type.STRING },
        cars: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    spokenAs: { type: Type.STRING },
                    candidateIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    jobs: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                text: { type: Type.STRING },
                                urgent: { type: Type.BOOLEAN },
                            },
                            required: ['text', 'urgent'],
                            propertyOrdering: ['text', 'urgent'],
                        },
                    },
                },
                required: ['spokenAs', 'candidateIds', 'jobs'],
                propertyOrdering: ['spokenAs', 'candidateIds', 'jobs'],
            },
        },
    },
    required: ['transcript', 'cars'],
    propertyOrdering: ['transcript', 'cars'],
};

/** Coerce whatever came back from Gemini into a well-formed result. */
export const normalisePrepResult = (raw: unknown): PrepDictationResult => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const cars = Array.isArray(r.cars) ? r.cars : [];
    return {
        transcript: typeof r.transcript === 'string' ? r.transcript.trim() : '',
        cars: cars
            .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
            .map(c => ({
                spokenAs: typeof c.spokenAs === 'string' ? c.spokenAs.trim() : '',
                candidateIds: Array.isArray(c.candidateIds)
                    ? c.candidateIds.filter((id): id is string => typeof id === 'string')
                    : [],
                jobs: Array.isArray(c.jobs)
                    ? c.jobs
                        .filter((j): j is Record<string, unknown> => !!j && typeof j === 'object')
                        .map(j => ({ text: typeof j.text === 'string' ? j.text : '', urgent: j.urgent === true }))
                    : [],
            })),
    };
};

/** Case- and space-insensitive key for comparing job text. */
export const jobKey = (text: string): string => String(text || '').replace(/\s+/g, '').toLowerCase();

const cleanJobText = (text: string): string => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
};

/**
 * Merge groups that belong to the same car (same vehicleId) into the first of
 * them. Jobs already on that car (same text, ignoring case and spaces) are not
 * added twice; urgent wins if either copy is urgent. Groups with no car are
 * left alone. Extra fields on the groups and jobs are kept.
 */
export const mergeByCar = <J extends PrepJob, G extends { vehicleId?: string; jobs: J[] }>(groups: G[]): G[] => {
    const out: G[] = [];
    const byCar = new Map<string, G>();
    for (const g of groups) {
        if (!g.vehicleId) {
            out.push(g);
            continue;
        }
        const first = byCar.get(g.vehicleId);
        if (!first) {
            const copy = { ...g, jobs: [...g.jobs] };
            byCar.set(g.vehicleId, copy);
            out.push(copy);
            continue;
        }
        for (const job of g.jobs) {
            const at = first.jobs.findIndex(j => jobKey(j.text) === jobKey(job.text));
            if (at === -1) first.jobs.push(job);
            else if (job.urgent && !first.jobs[at].urgent) first.jobs[at] = { ...first.jobs[at], urgent: true };
        }
    }
    return out;
};

/**
 * Check Gemini's candidate ids against the stock list and decide, per car,
 * whether the car is known (one fit), needs Steve to pick (2+ fits) or is
 * unknown (no fit). Ids that are not in-stock cars are dropped. Cars with no
 * jobs are dropped. Groups that land on the same car are merged.
 */
export const resolvePrepCars = (result: PrepDictationResult, stockList: PrepStockCar[]): PrepCarGroup[] => {
    const inStock = new Set(stockList.map(c => c.id));
    const groups: PrepCarGroup[] = [];
    for (const car of normalisePrepResult(result).cars) {
        const seenJobs = new Set<string>();
        const jobs: PrepJob[] = [];
        for (const j of car.jobs) {
            const text = cleanJobText(j.text);
            const key = jobKey(text);
            if (!key || seenJobs.has(key)) continue;
            seenJobs.add(key);
            jobs.push({ text, urgent: j.urgent });
        }
        if (jobs.length === 0) continue;

        const candidateIds = [...new Set(car.candidateIds.filter(id => inStock.has(id)))];
        const status: PrepCarStatus = candidateIds.length === 1 ? 'matched' : candidateIds.length > 1 ? 'pick' : 'unknown';
        groups.push({
            spokenAs: car.spokenAs,
            jobs,
            status,
            ...(status === 'matched' ? { vehicleId: candidateIds[0] } : {}),
            candidateIds,
        });
    }
    return mergeByCar(groups);
};

/** A group as the check screen hands it over: a car (or none), and the jobs Steve left ticked. */
export interface PrepSaveGroup {
    vehicleId?: string;
    skipped?: boolean;
    jobs: (PrepJob & { include?: boolean })[];
}

type OpenTodo = Pick<ToDoItem, 'type' | 'vehicleId' | 'description' | 'isComplete'> & Partial<Pick<ToDoItem, 'completionDate'>>;

const isOpenPrep = (t: OpenTodo, vehicleId: string): boolean =>
    t.type === 'prep' && t.vehicleId === vehicleId && !t.isComplete && !t.completionDate;

/** True if the job is already an open prep to-do on that car. */
export const isOpenPrepDuplicate = (text: string, vehicleId: string, existingTodos: OpenTodo[]): boolean => {
    const key = jobKey(text);
    return !!key && existingTodos.some(t => isOpenPrep(t, vehicleId) && jobKey(t.description) === key);
};

/**
 * The prep to-dos to save. Shaped exactly like a prep to-do added by hand in
 * the To-Do editor. Skips: groups with no car or skipped, unticked or empty
 * lines, cars not in the ledger, and jobs already open on that car.
 */
export const toPrepToDos = (
    groups: PrepSaveGroup[],
    existingTodos: OpenTodo[],
    vehicles: Pick<Vehicle, 'id' | 'reg'>[],
): NewToDoItem[] => {
    const out: NewToDoItem[] = [];
    const added = new Set<string>();
    for (const g of groups) {
        if (g.skipped || !g.vehicleId) continue;
        const vehicle = vehicles.find(v => v.id === g.vehicleId);
        if (!vehicle) continue;
        for (const job of g.jobs) {
            if (job.include === false) continue;
            const description = cleanJobText(job.text);
            const key = jobKey(description);
            if (!key) continue;
            if (added.has(`${vehicle.id}|${key}`)) continue;
            if (isOpenPrepDuplicate(description, vehicle.id, existingTodos)) continue;
            added.add(`${vehicle.id}|${key}`);
            out.push({
                description,
                priority: job.urgent ? 'high' : 'normal',
                isComplete: false,
                type: 'prep',
                vehicleId: vehicle.id,
                vehicleReg: vehicle.reg,
            });
        }
    }
    return out;
};

/** Search in-stock cars by reg (spaces ignored), stock number, make or model. */
export const searchStock = (stockList: PrepStockCar[], query: string, limit = 8): PrepStockCar[] => {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return stockList.slice(0, limit);
    const regQuery = words.join('');
    return stockList
        .filter(c => {
            const reg = c.reg.replace(/\s+/g, '').toLowerCase();
            if (regQuery.length >= 2 && reg.includes(regQuery)) return true;
            const hay = `${c.make} ${c.model} ${c.colour} ${c.stockNumber} ${reg}`.toLowerCase();
            return words.every(w => hay.includes(w));
        })
        .slice(0, limit);
};

/** The fields of an AudioBuffer the WAV encoder needs. */
export interface AudioBufferLike {
    sampleRate: number;
    numberOfChannels: number;
    length: number;
    getChannelData(channel: number): Float32Array;
}

export const WAV_SAMPLE_RATE = 16000;

/**
 * 16 kHz, mono, 16-bit PCM WAV bytes. Channels are averaged to mono. If the
 * buffer is not already 16 kHz it is resampled here by linear interpolation
 * (the recorder normally hands over a 16 kHz buffer from OfflineAudioContext,
 * which filters better; this is the fallback).
 */
export const encodeWav16kMono = (buffer: AudioBufferLike): Uint8Array => {
    const channels = Math.max(1, buffer.numberOfChannels);
    const srcLength = buffer.length;
    const mono = new Float32Array(srcLength);
    for (let c = 0; c < channels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < srcLength; i++) mono[i] += (data[i] || 0) / channels;
    }

    let samples = mono;
    if (buffer.sampleRate !== WAV_SAMPLE_RATE && srcLength > 0) {
        const ratio = buffer.sampleRate / WAV_SAMPLE_RATE;
        const outLength = Math.max(1, Math.round(srcLength / ratio));
        samples = new Float32Array(outLength);
        for (let i = 0; i < outLength; i++) {
            const pos = i * ratio;
            const i0 = Math.min(srcLength - 1, Math.floor(pos));
            const i1 = Math.min(srcLength - 1, i0 + 1);
            const frac = pos - i0;
            samples[i] = mono[i0] + (mono[i1] - mono[i0]) * frac;
        }
    }

    const dataLength = samples.length * 2;
    const bytes = new Uint8Array(44 + dataLength);
    const view = new DataView(bytes.buffer);
    const writeAscii = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, WAV_SAMPLE_RATE, true);
    view.setUint32(28, WAV_SAMPLE_RATE * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeAscii(36, 'data');
    view.setUint32(40, dataLength, true);
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return bytes;
};
