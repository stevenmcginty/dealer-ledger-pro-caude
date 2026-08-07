/**
 * Turning a vehicle in the ledger into the handful of facts a website advert
 * is allowed to know.
 *
 * THIS FILE IS THE ALLOW-LIST. The bucket on the other end is publicly
 * readable, so what leaves here reaches customers. A field is not omitted by
 * accident — it is absent because nothing below reads it. Purchase price,
 * purchase date, the seller, an SOR owner, the stock number and every
 * financial record simply have no line here, and adding one means deciding
 * the whole world may read it.
 *
 * The vocabulary is the back office's, not the ledger's: its fuel list is five
 * fixed words, its engine box is in cc, its VAT box is a two-way switch. Where
 * a value cannot be translated honestly it is left out, and the box stays
 * blank for somebody to answer — never filled with a guess.
 */

import { WebsiteVehicleFields, WebsiteVehiclePayload } from './types';

interface LedgerVehicle {
    id: string;
    reg?: string;
    make?: string;
    model?: string;
    year?: number;
    mileage?: number;
    color?: string;
    vin?: string;
    fuelType?: string;
    engineSize?: string;
    motDueDate?: string;
    co2Emissions?: number;
    vatScheme?: string;
    advertisedPrice?: number;
    status?: string;
}

/** Registrations are the car's name at both ends. Matches cleanReg() in _lib.js. */
export const normaliseReg = (input?: string): string =>
    String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

/** Rules out obvious non-registrations only — the same loose test the sweep uses. */
export const isPlausibleReg = (reg: string): boolean =>
    reg.length >= 2 && reg.length <= 8 && /[0-9]/.test(reg) && /[A-Z]/.test(reg);

/**
 * Makes and models come back from the government services shouting. These are
 * the ones that should stay that way. Kept in step with titleCase() in
 * site/api/vehicle.js so a car looks the same whichever route filled it in.
 */
const KEEP = ('GTI GTD GTE GTS AMG CLA CLS GLA GLE EQA EQB EQC EQE EQS IS ES LS RX NX UX LC '
    + 'SE SEL LE XLE EX LT LX SRI SXI VTI VTEC TSI TDI TFSI FSI CDI HDI DCI CDTI CRDI TDCI '
    + 'HSE SRT TRD GLI XLS SEAT MINI BMW VW MG DS TT RS ST SS CC ZS ZR ZT XE XF XJ XK VXR '
    + 'SLK SLC CLK GLB GLC GLS RCZ IQ SQ5 SQ7 GLI').split(/\s+/);

const titleCase = (value?: string): string => {
    const s = String(value || '').trim();
    if (!s) return '';
    return s.split(/\s+/).map(word =>
        word.split('-').map(part => {
            const up = part.toUpperCase();
            if (!part) return part;
            if (/\d/.test(part)) return up;                          // A4, X5, 500, 3
            if (KEEP.indexOf(up) >= 0) return up;
            if (part.length <= 3 && !/[AEIOU]/.test(up)) return up;  // MG, SLK, BMW
            return up.charAt(0) + up.slice(1).toLowerCase();
        }).join('-')
    ).join(' ');
};

/** The fuel names the lookups use, into the five the advert form offers. */
const mapFuel = (value?: string): string => {
    const s = String(value || '').toUpperCase();
    if (!s) return '';
    if (s.indexOf('PLUG') >= 0) return 'Plug-in Hybrid';
    if (s.indexOf('HYBRID') >= 0) return 'Hybrid';
    if (s.indexOf('ELECTRIC') >= 0) {
        // "Electric Diesel" and "Electric Petrol" are hybrids by another name.
        if (s.indexOf('DIESEL') >= 0 || s.indexOf('PETROL') >= 0) return 'Hybrid';
        return 'Electric';
    }
    if (s.indexOf('DIESEL') >= 0) return 'Diesel';
    if (s.indexOf('PETROL') >= 0 || s.indexOf('GAS BI-FUEL') >= 0) return 'Petrol';
    return '';
};

/**
 * The advert's engine box is in cc. The ledger's is free text, so it holds
 * "1998" from a lookup or "2.0" from somebody typing. A figure under 100 can
 * only be litres; anything that is not a number at all is left out rather than
 * guessed at.
 */
const engineCc = (value?: string): number | undefined => {
    const raw = String(value || '').trim();
    if (!raw) return undefined;
    const match = /(\d+(?:\.\d+)?)/.exec(raw.replace(/,/g, ''));
    if (!match) return undefined;
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    const cc = n < 100 ? Math.round(n * 1000) : Math.round(n);
    return cc >= 50 && cc <= 12000 ? cc : undefined;
};

const isoDate = (value?: string): string => {
    const s = String(value || '');
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

const positive = (value?: number): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

/**
 * The advert's VAT box is a two-way switch: blank means the margin scheme, and
 * "yes" means the price is plus VAT. Only a commercial can be said to be plus
 * VAT without inventing something, so that is the only case that fills it.
 * A VAT-qualifying car is left for whoever writes the advert to answer, because
 * asserting the wrong VAT treatment on a public listing is a real mistake and
 * a blank box is not a claim.
 */
const vatLine = (scheme?: string): string => (scheme === 'Commercial' ? 'yes' : '');

/** Drops blanks — a missing answer travels as nothing at all, never as "". */
const clean = (fields: Record<string, unknown>): WebsiteVehicleFields => {
    const out: Record<string, unknown> = {};
    Object.keys(fields).forEach(key => {
        const v = fields[key];
        if (v === undefined || v === null || v === '') return;
        out[key] = v;
    });
    return out as WebsiteVehicleFields;
};

const LEDGER_STATES = ['Available', 'Deposit Paid', 'Sold'];

/**
 * One vehicle as the website will see it, or null if it has no registration
 * worth sending. Everything the advert needs and nothing the business keeps.
 */
export const buildVehiclePayload = (vehicle: LedgerVehicle): WebsiteVehiclePayload | null => {
    const reg = normaliseReg(vehicle.reg);
    if (!isPlausibleReg(reg)) return null;

    const status = LEDGER_STATES.indexOf(String(vehicle.status)) >= 0
        ? (vehicle.status as WebsiteVehiclePayload['status'])
        : 'Available';

    const year = positive(vehicle.year);

    return {
        reg,
        vehicleId: vehicle.id,
        status,
        fields: clean({
            make: titleCase(vehicle.make),
            model: titleCase(vehicle.model),
            // A typo'd year is worse than a blank one on a used-car advert.
            year: year && year >= 1900 && year <= new Date().getFullYear() + 1 ? year : undefined,
            mileage: positive(vehicle.mileage),
            colour: titleCase(vehicle.color),
            vin: String(vehicle.vin || '').trim().toUpperCase(),
            fuel: mapFuel(vehicle.fuelType),
            engine: engineCc(vehicle.engineSize),
            mot: isoDate(vehicle.motDueDate),
            co2: positive(vehicle.co2Emissions),
            vat: vatLine(vehicle.vatScheme),
            price: positive(vehicle.advertisedPrice),
        }),
    };
};

/**
 * The fields whose change is worth a push. A reconciliation that only stamps
 * dvlaLookedUpAt, or a note against the purchase, must not wake the website up.
 */
const WATCHED: Array<keyof LedgerVehicle> = [
    'reg', 'make', 'model', 'year', 'mileage', 'color', 'vin', 'fuelType',
    'engineSize', 'motDueDate', 'co2Emissions', 'vatScheme', 'advertisedPrice', 'status',
];

export const isWorthPushing = (before?: LedgerVehicle | null, after?: LedgerVehicle | null): boolean => {
    if (!after) return false;             // a deleted vehicle is handled by its own path
    if (!before) return true;             // brand new in stock
    return WATCHED.some(key => before[key] !== after[key]);
};
