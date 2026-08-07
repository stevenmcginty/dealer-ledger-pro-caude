/**
 * Road tax, running costs and everything else a registration implies.
 *
 * The DVLA Vehicle Enquiry Service answers whether a car is taxed and when the
 * tax falls due. It never answers what the tax *costs* — there is no
 * government endpoint that does. The figure comes off the published VED
 * tables, and the rules changed materially in April 2025: the free band went,
 * electric cars started paying, and the expensive-car supplement began to
 * apply to EVs. A dealer buying stock needs the number before the car is on
 * the pitch, so it is worked out here from data already in the lookup.
 *
 * The same inputs also give fuel economy, annual running cost, the company car
 * benefit-in-kind band, and clean air zone compliance — all of it derived, no
 * extra API and no extra key.
 *
 * Everything returns a `basis` sentence that can be shown to a customer as
 * written, and anything resting on an assumption rather than a record is
 * flagged. A running cost with no workings behind it is worth less than none.
 *
 * RATES: 2026/27 tax year, in force 1 April 2026 to 31 March 2027.
 * Source: https://www.gov.uk/vehicle-tax-rate-tables
 * When the Budget moves them, add a new entry to VED_RATES keyed by tax year
 * and leave the old one in place — a car taxed last month should still be
 * explainable next year.
 */

export type VedRegime = 'pre-2001' | '2001-2017' | 'post-2017';

export interface VedResult {
    taxYear: string;
    regime?: VedRegime;
    /** Annual cost in pounds for the next 12 months, or null when unknowable. */
    annual: number | null;
    sixMonth: number | null;
    monthly: number | null;
    /** CO2 band letter — only meaningful in the 2001-2017 regime. */
    band?: string;
    /** The one-off showroom tax, for a nearly-new or pre-registered car. */
    firstYear?: number | null;
    standard?: number;
    supplement?: {
        applies: boolean;
        /** True when the supplement window is open but the list price is unknown. */
        possible: boolean;
        amount: number;
        threshold: number;
        endsOn: string;
        exemptAsEarlyElectric: boolean;
    };
    /** Plain English workings, safe to show a customer verbatim. */
    basis: string;
    /** True when a figure rests on an assumption rather than a record. */
    assumed: boolean;
    /** Fields that would have made the answer exact. */
    unknown: string[];
}

interface VedYear {
    from: string;
    to: string;
    firstYear: Array<{ upTo: number; rate: number }>;
    standard: number;
    supplement: number;
    supplementYears: number;
    supplementThreshold: number;
    supplementThresholdElectric: number;
    bands: Array<{ band: string; upTo: number; rate: number }>;
    preCo2: { smallUpToCc: number; small: number; large: number };
}

export const VED_RATES: Record<string, VedYear> = {
    '2026/27': {
        from: '2026-04-01',
        to: '2027-03-31',

        // Paid once, at registration, on the CO2 figure. Only relevant to a
        // nearly-new car, but it is what a customer finds if they look it up.
        firstYear: [
            { upTo: 0, rate: 10 },
            { upTo: 50, rate: 115 },
            { upTo: 75, rate: 135 },
            { upTo: 90, rate: 280 },
            { upTo: 100, rate: 365 },
            { upTo: 110, rate: 405 },
            { upTo: 130, rate: 455 },
            { upTo: 150, rate: 560 },
            { upTo: 170, rate: 1410 },
            { upTo: 190, rate: 2270 },
            { upTo: 225, rate: 3420 },
            { upTo: 255, rate: 4850 },
            { upTo: Infinity, rate: 5690 },
        ],

        // Every year after the first. One flat figure whatever the fuel — the
        // £10 alternative-fuel discount was withdrawn in April 2025.
        standard: 200,

        // Charged on top of the standard rate for five years, starting from
        // the second time the car is taxed.
        supplement: 440,
        supplementYears: 5,
        supplementThreshold: 40000,
        supplementThresholdElectric: 50000,

        // Band A stopped being free in April 2025: a 99g/km diesel that cost
        // nothing to tax for fifteen years now costs £20.
        bands: [
            { band: 'A', upTo: 100, rate: 20 },
            { band: 'B', upTo: 110, rate: 20 },
            { band: 'C', upTo: 120, rate: 35 },
            { band: 'D', upTo: 130, rate: 170 },
            { band: 'E', upTo: 140, rate: 200 },
            { band: 'F', upTo: 150, rate: 225 },
            { band: 'G', upTo: 165, rate: 275 },
            { band: 'H', upTo: 175, rate: 325 },
            { band: 'I', upTo: 185, rate: 360 },
            { band: 'J', upTo: 200, rate: 410 },
            { band: 'K', upTo: 225, rate: 445 },
            { band: 'L', upTo: 255, rate: 760 },
            { band: 'M', upTo: Infinity, rate: 790 },
        ],

        preCo2: { smallUpToCc: 1549, small: 230, large: 375 },
    },
};

/** The tax year in force on a given day. VED years run April to April. */
export const vedTaxYear = (when?: string | number | Date): string => {
    const d = when ? new Date(when) : new Date();
    const y = d.getUTCFullYear();
    const start = d.getUTCMonth() >= 3 ? y : y - 1; // month 3 = April
    const key = `${start}/${String(start + 1).slice(2)}`;
    return VED_RATES[key] ? key : Object.keys(VED_RATES).sort().pop()!;
};

export interface VehicleFacts {
    co2?: number | null;
    /** Anything the DVLA or DVSA says — normalised internally. */
    fuel?: string | null;
    /** yyyy-mm-dd or yyyy-mm. The one field nothing can be worked out without. */
    firstRegistered?: string | null;
    engineCapacity?: number | string | null;
    /** Price when new including options. Rarely known on a used car. */
    listPrice?: number | null;
    /** True if a diesel meets RDE2. Only affects the first-year rate. */
    rde2?: boolean;
    euroStatus?: string | null;
    mileage?: number | null;
    electricRangeMiles?: number | null;
    milesPerYear?: number | null;
    milesPerKwh?: number | null;
    /** Overrides "now" — used by the tests so results don't drift with the clock. */
    on?: string;
}

/**
 * The annual road tax figure, plus the workings.
 *
 * Three regimes, decided entirely by the date of first registration: engine
 * size before March 2001, CO2 letter bands to March 2017, and a flat standard
 * rate plus a price-based supplement after that.
 */
export const vedFor = (facts: VehicleFacts): VedResult => {
    const yearKey = vedTaxYear(facts.on);
    const t = VED_RATES[yearKey];

    const fuel = normaliseFuel(facts.fuel);
    const first = toIso(facts.firstRegistered);
    const co2 = numOrNull(facts.co2);
    const cc = numOrNull(facts.engineCapacity);
    const electric = fuel === 'Electric';

    const base: VedResult = {
        taxYear: yearKey,
        annual: null,
        sixMonth: null,
        monthly: null,
        basis: '',
        assumed: false,
        unknown: [],
    };

    if (!first) {
        return {
            ...base,
            basis: 'The date it was first registered is not on the record, so the tax band cannot be worked out.',
            unknown: ['firstRegistered'],
        };
    }

    // --- Before 1 March 2001: engine size, nothing else ---
    if (first < '2001-03-01') {
        if (!cc) {
            return {
                ...base,
                regime: 'pre-2001',
                basis: 'Registered before March 2001, so the tax goes on engine size — and the engine size is not on the record.',
                unknown: ['engineCapacity'],
            };
        }
        const small = cc <= t.preCo2.smallUpToCc;
        const annual = small ? t.preCo2.small : t.preCo2.large;
        return {
            ...base,
            regime: 'pre-2001',
            annual,
            sixMonth: round2(annual * 0.55),
            monthly: round2((annual * 1.05) / 12),
            basis:
                `Registered ${pretty(first)}, so it is taxed on engine size: ${cc}cc is ` +
                `${small ? `not over ${t.preCo2.smallUpToCc}cc` : `over ${t.preCo2.smallUpToCc}cc`}, ` +
                `£${annual} a year (${yearKey} rates).`,
        };
    }

    // --- 1 March 2001 to 31 March 2017: the letter bands ---
    if (first < '2017-04-01') {
        if (co2 === null) {
            return {
                ...base,
                regime: '2001-2017',
                basis: 'Registered in the CO2 band years, but the DVLA holds no CO2 figure for it, so the band cannot be read off.',
                unknown: ['co2'],
            };
        }
        const row = t.bands.find(b => co2 <= b.upTo)!;
        const annual = row.rate;
        return {
            ...base,
            regime: '2001-2017',
            band: row.band,
            annual,
            sixMonth: round2(annual * 0.55),
            monthly: round2((annual * 1.05) / 12),
            basis:
                `${co2} g/km puts it in band ${row.band} — £${annual} a year on ${yearKey} rates.` +
                (row.band === 'A' && !electric ? ' Band A was free until April 2025; it is not any more.' : '') +
                (electric ? ' Electric cars in these years started paying in April 2025.' : ''),
        };
    }

    // --- 1 April 2017 onwards: flat rate, plus the supplement ---
    const standard = t.standard;
    const firstYearRow = co2 === null ? null : t.firstYear.find(b => co2 <= b.upTo)!;

    // The supplement runs for five years from the second time the car is
    // taxed, and the second payment falls due a year after registration.
    // Electric cars only came into it from April 2025.
    const windowFrom = addYears(first, 1);
    const windowTo = addYears(first, 1 + t.supplementYears);
    const today = (facts.on || new Date().toISOString()).slice(0, 10);
    const electricExempt = electric && first < '2025-04-01';
    const inWindow = today >= windowFrom && today < windowTo && !electricExempt;

    const threshold = electric ? t.supplementThresholdElectric : t.supplementThreshold;
    const listPrice = numOrNull(facts.listPrice);

    let supplement = 0;
    let assumed = false;
    const unknown: string[] = [];
    let note = '';

    if (inWindow) {
        if (listPrice === null) {
            // Cannot be invented. Naming the condition is what lets a buyer
            // check it themselves against the V5C.
            assumed = true;
            unknown.push('listPrice');
            note =
                ` If its list price when new was over £${threshold.toLocaleString('en-GB')}, ` +
                `add £${t.supplement} a year until ${pretty(windowTo)}.`;
        } else if (listPrice > threshold) {
            supplement = t.supplement;
            note =
                ` It listed at over £${threshold.toLocaleString('en-GB')} when new, so the ` +
                `£${t.supplement} expensive-car supplement applies until ${pretty(windowTo)}.`;
        } else {
            note = ` It listed under £${threshold.toLocaleString('en-GB')} when new, so no supplement.`;
        }
    }

    const annual = standard + supplement;

    return {
        ...base,
        regime: 'post-2017',
        annual,
        sixMonth: round2(annual * 0.55),
        monthly: round2((annual * 1.05) / 12),
        standard,
        firstYear: firstYearRow ? firstYearRow.rate : null,
        supplement: {
            applies: supplement > 0,
            possible: inWindow && listPrice === null,
            amount: t.supplement,
            threshold,
            endsOn: inWindow ? windowTo : '',
            exemptAsEarlyElectric: electricExempt,
        },
        assumed,
        unknown,
        basis:
            `Registered ${pretty(first)}, so it pays the flat standard rate of £${standard} a year ` +
            `(${yearKey}).${note}` +
            (electricExempt
                ? ' Electric and registered before April 2025, so the expensive-car supplement never applied to it.'
                : ''),
    };
};

/**
 * What it costs to run.
 *
 * Fuel economy is in neither government feed, but CO2 is, and CO2 is measured
 * *from* fuel burnt — the same number in different units. A litre of petrol
 * releases 2,392g of CO2 and a litre of diesel 2,640g, both fixed by
 * chemistry, so petrol mpg ≈ 6,757 / CO2 and diesel mpg ≈ 7,458 / CO2.
 *
 * That is the official combined figure the car was type-approved on: optimistic
 * on anything, wildly optimistic on a plug-in hybrid tested with a full
 * battery. Both facts come back rather than only the flattering one.
 *
 * Pump prices move weekly, so they are environment values with a sane default
 * and every figure repeats the price it assumed — a stale default is then
 * visible rather than silently wrong.
 */
export interface RunningCosts {
    fuel: string;
    milesPerYear: number;
    mpg?: number;
    milesPerKwh?: number;
    kwhPerYear?: number;
    annualFuelCost: number;
    pencePerMile: number;
    priceAssumed: string;
    /** True on a plug-in hybrid, where the official figure is unreachable in normal use. */
    optimistic: boolean;
    basis: string;
}

const CO2_PER_LITRE: Record<string, number> = { Petrol: 2392, Diesel: 2640 };
const LITRES_PER_GALLON = 4.54609;

const fuelPrices = () => ({
    petrol: Number(process.env.FUEL_PETROL_PENCE || 139.9),
    diesel: Number(process.env.FUEL_DIESEL_PENCE || 147.9),
    electric: Number(process.env.FUEL_ELECTRIC_PENCE_KWH || 7.5),
    milesPerYear: Number(process.env.FUEL_MILES_PER_YEAR || 10000),
});

export const runningCosts = (facts: VehicleFacts): RunningCosts | null => {
    const fuel = normaliseFuel(facts.fuel);
    const co2 = numOrNull(facts.co2);
    const p = fuelPrices();
    const miles = numOrNull(facts.milesPerYear) || p.milesPerYear;

    if (!fuel) return null;

    // Electric: no CO2 to work back from, so it goes on miles per kWh. Real
    // cars sit between 2.5 and 4.5; 3.5 is the honest middle, and it is stated.
    if (fuel === 'Electric') {
        const milesPerKwh = numOrNull(facts.milesPerKwh) || 3.5;
        const kwh = miles / milesPerKwh;
        const cost = Math.round((kwh * p.electric) / 100);
        return {
            fuel,
            milesPerYear: miles,
            milesPerKwh,
            kwhPerYear: Math.round(kwh),
            annualFuelCost: cost,
            pencePerMile: round2((cost * 100) / miles),
            priceAssumed: `${p.electric}p per kWh`,
            optimistic: false,
            basis:
                `About ${milesPerKwh} miles per kWh over ${miles.toLocaleString('en-GB')} miles a year ` +
                `at ${p.electric}p a kWh — roughly £${cost.toLocaleString('en-GB')} a year to charge at home. ` +
                'Public rapid charging costs three to six times that.',
        };
    }

    if (co2 === null || co2 <= 0) return null;

    // Hybrids burn petrol; plug-in hybrids burn petrol once the battery is
    // flat, which the type-approval test never gets to.
    const burns = fuel === 'Diesel' ? 'Diesel' : 'Petrol';
    const mpg = (CO2_PER_LITRE[burns] * LITRES_PER_GALLON) / (co2 * 1.609344);
    const gallons = miles / mpg;
    const pence = burns === 'Diesel' ? p.diesel : p.petrol;
    const cost = Math.round((gallons * LITRES_PER_GALLON * pence) / 100);
    const optimistic = fuel === 'Plug-in Hybrid';

    return {
        fuel,
        milesPerYear: miles,
        mpg: Math.round(mpg),
        annualFuelCost: cost,
        pencePerMile: round2((cost * 100) / miles),
        priceAssumed: `${pence}p a litre`,
        optimistic,
        basis:
            `${co2} g/km works back to about ${Math.round(mpg)} mpg. Over ` +
            `${miles.toLocaleString('en-GB')} miles a year at ${pence}p a litre that is roughly ` +
            `£${cost.toLocaleString('en-GB')} of ${burns.toLowerCase()}.` +
            (optimistic
                ? ' Plug-in hybrids are tested with a full battery, so the official figure is only reachable on short runs you plug in after.'
                : ''),
    };
};

export interface AnnualCost {
    tax: number;
    fuel: number;
    total: number;
    milesPerYear: number;
    basis: string;
}

/**
 * Tax plus fuel — the number a buyer is actually comparing between two cars.
 * Servicing and insurance are deliberately out: neither can be derived, and a
 * guess sitting next to real figures poisons the real ones.
 */
export const annualCost = (ved: VedResult, costs: RunningCosts | null): AnnualCost | null => {
    if (ved.annual === null || !costs) return null;
    const total = ved.annual + costs.annualFuelCost;
    return {
        tax: ved.annual,
        fuel: costs.annualFuelCost,
        total,
        milesPerYear: costs.milesPerYear,
        basis:
            `£${ved.annual} road tax plus about £${costs.annualFuelCost.toLocaleString('en-GB')} of fuel ` +
            `over ${costs.milesPerYear.toLocaleString('en-GB')} miles — around ` +
            `£${total.toLocaleString('en-GB')} a year before servicing and insurance.`,
    };
};

/**
 * Company car tax.
 *
 * A large slice of retail stock goes onto a business. The taxable benefit is
 * list price × appropriate percentage, and the driver pays their own income tax
 * rate on that — both 20% and 40% are worked out because both get quoted.
 *
 * Appropriate percentages for 2026/27.
 */
export const BIK_YEAR = '2026/27';

export interface CompanyCarTax {
    taxYear: string;
    percent: number;
    listPrice?: number;
    taxableBenefit?: number;
    monthlyAt20?: number;
    monthlyAt40?: number;
    unknown?: string[];
    basis: string;
}

export const bikPercent = (
    co2: number | null | undefined,
    fuel?: string | null,
    electricRangeMiles?: number | null,
    rde2?: boolean
): number | null => {
    if (co2 === null || co2 === undefined) return null;
    if (co2 === 0) return 4; // fully electric

    let pct: number;
    if (co2 <= 50) {
        const range = Number(electricRangeMiles) || 0;
        if (!range) return null; // the band turns on electric range
        pct = range >= 130 ? 5 : range >= 70 ? 8 : range >= 40 ? 12 : range >= 30 ? 14 : 17;
    } else if (co2 <= 54) {
        pct = 17;
    } else {
        // 55 g/km is 18%, then a point for every 5 g/km, capped at 37%.
        pct = 18 + Math.floor((co2 - 55) / 5);
    }

    // A diesel that does not meet RDE2 carries four points, still capped.
    if (normaliseFuel(fuel) === 'Diesel' && rde2 !== true) pct += 4;
    return Math.min(pct, 37);
};

export const companyCarTax = (facts: VehicleFacts): CompanyCarTax | null => {
    const co2 =
        numOrNull(facts.co2) === null && normaliseFuel(facts.fuel) === 'Electric' ? 0 : numOrNull(facts.co2);
    const pct = bikPercent(co2, facts.fuel, facts.electricRangeMiles, facts.rde2);
    if (pct === null) return null;

    const listPrice = numOrNull(facts.listPrice);
    const out: CompanyCarTax = {
        taxYear: BIK_YEAR,
        percent: pct,
        basis: `${co2 === 0 ? 'Zero emissions' : `${co2} g/km`} is a ${pct}% benefit-in-kind band for ${BIK_YEAR}.`,
    };

    if (listPrice === null) {
        out.unknown = ['listPrice'];
        out.basis += ' The monthly cost needs the list price when new, which is not on the record.';
        return out;
    }

    const benefit = Math.round((listPrice * pct) / 100);
    out.listPrice = listPrice;
    out.taxableBenefit = benefit;
    out.monthlyAt20 = round2((benefit * 0.2) / 12);
    out.monthlyAt40 = round2((benefit * 0.4) / 12);
    out.basis +=
        ` On a £${listPrice.toLocaleString('en-GB')} list price that is £${benefit.toLocaleString('en-GB')} ` +
        `of taxable benefit — about £${out.monthlyAt20} a month at basic rate, £${out.monthlyAt40} at higher rate.`;
    return out;
};

/**
 * Where it can and cannot drive.
 *
 * The euro status on the DVLA record settles the ULEZ outright. Where the
 * record is silent, the dates the standards came in settle it — Euro 4 petrol
 * from January 2006, Euro 6 diesel from September 2015, the same line the
 * London checker draws — and the answer says which of the two it used, because
 * one is a fact and the other is a safe assumption.
 *
 * Clean air zones outside London and the Scottish low emission zones run the
 * same Euro test for cars, so one answer covers all three. The London
 * congestion charge no longer has a cleaner-vehicle discount, so every car pays
 * it; saying so is more use than saying nothing.
 */
export interface ZoneVerdict {
    compliant: boolean;
    assumed: boolean;
    basis: string;
}

export interface Zones {
    ulez: ZoneVerdict | null;
    caz: ZoneVerdict | null;
    scottishLez: ZoneVerdict | null;
    congestionCharge: { exempt: boolean; basis: string };
}

export const zones = (facts: VehicleFacts): Zones => {
    const fuel = normaliseFuel(facts.fuel);
    const first = toIso(facts.firstRegistered);
    const euro = String(facts.euroStatus || '').toUpperCase().replace(/[^0-9]/g, '');

    let ulez: ZoneVerdict | null = null;

    if (fuel === 'Electric') {
        ulez = { compliant: true, assumed: false, basis: 'Electric — nothing to pay in the ULEZ.' };
    } else if (euro && fuel) {
        const need = fuel === 'Diesel' ? 6 : 4;
        const ok = Number(euro) >= need;
        ulez = {
            compliant: ok,
            assumed: false,
            basis: `The DVLA records it as Euro ${euro}; a ${fuel.toLowerCase()} needs Euro ${need}.`,
        };
    } else if (fuel && first) {
        const line = fuel === 'Diesel' ? '2015-09-01' : '2006-01-01';
        const ok = first >= line;
        ulez = {
            compliant: ok,
            assumed: true,
            basis: `First registered ${pretty(first)} — ${
                fuel === 'Diesel'
                    ? 'diesels from September 2015 are Euro 6'
                    : 'petrols from January 2006 are Euro 4'
            }.`,
        };
    }

    return {
        ulez,
        caz: ulez && {
            compliant: ulez.compliant,
            assumed: ulez.assumed,
            basis: ulez.compliant
                ? 'Clean air zones outside London use the same Euro standard, so it is clear there too.'
                : 'Clean air zones outside London use the same Euro standard, so it would be charged there as well.',
        },
        scottishLez: ulez && {
            compliant: ulez.compliant,
            assumed: ulez.assumed,
            basis: ulez.compliant
                ? 'Meets the Scottish low emission zone standard as well.'
                : 'Would be turned away from the Scottish low emission zones.',
        },
        congestionCharge: {
            exempt: false,
            basis: 'The London congestion charge is payable on every car — the cleaner vehicle discount has ended.',
        },
    };
};

/**
 * Age, plate and how hard it has been used.
 *
 * "One owner, 31,000 miles, well under average for its age" is the line that
 * sells a car, and every part of it is already in the lookup. The UK average is
 * about 7,400 miles a year.
 */
const UK_AVERAGE_MILES_YEAR = 7400;

export interface AgeAndUse {
    firstRegistered: string;
    ageYears: number;
    ageText: string;
    /** The age identifier on the plate — buyers shop by it. */
    plate: string;
    firstMotDue?: string;
    firstMotNote?: string;
    milesPerYear?: number;
    versusAverage?: 'below' | 'typical' | 'above';
    versusAverageBasis?: string;
}

export const ageAndUse = (facts: VehicleFacts): AgeAndUse | null => {
    const first = toIso(facts.firstRegistered);
    if (!first) return null;

    const now = facts.on ? Date.parse(facts.on) : Date.now();
    const age = Math.max(0, (now - Date.parse(`${first}T12:00:00Z`)) / 31557600000);

    const out: AgeAndUse = {
        firstRegistered: first,
        ageYears: round2(age),
        ageText: ageText(age),
        plate: plateFor(first),
    };

    // A car under three years old has never needed an MOT. Saying when the
    // first one falls due beats an empty MOT row.
    if (age < 3) {
        out.firstMotDue = addYears(first, 3);
        out.firstMotNote = `Too new for an MOT — the first one falls due ${pretty(out.firstMotDue)}.`;
    }

    const mileage = numOrNull(facts.mileage);
    if (mileage && age > 0.5) {
        const perYear = Math.round(mileage / age);
        const ratio = perYear / UK_AVERAGE_MILES_YEAR;
        out.milesPerYear = perYear;
        out.versusAverage = ratio < 0.75 ? 'below' : ratio > 1.25 ? 'above' : 'typical';
        out.versusAverageBasis =
            `${mileage.toLocaleString('en-GB')} miles in ${out.ageText} is about ` +
            `${perYear.toLocaleString('en-GB')} a year, ` +
            (out.versusAverage === 'below'
                ? 'well under the UK average of 7,400.'
                : out.versusAverage === 'above'
                ? 'above the UK average of 7,400.'
                : 'about the UK average of 7,400.');
    }

    return out;
};

/**
 * The plate a car wears is the age identifier. March registrations take the
 * year; September ones take the year plus fifty. Cars on the older lettered
 * systems get an empty string rather than a wrong number.
 */
export const plateFor = (iso: string): string => {
    if (!/^\d{4}-\d{2}/.test(iso || '')) return '';
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    if (y < 2001 || (y === 2001 && m < 9)) return '';
    if (m >= 3 && m <= 8) return String(y).slice(2);
    const base = m >= 9 ? y : y - 1;
    return String((base % 100) + 50);
};

const ageText = (years: number): string => {
    if (years < 1) {
        const months = Math.max(1, Math.round(years * 12));
        return `${months} month${months === 1 ? '' : 's'}`;
    }
    const whole = Math.floor(years);
    return `${whole} year${whole === 1 ? '' : 's'}`;
};

/** Everything above, from whatever the two government services returned. */
export interface DerivedVehicleData {
    ved: VedResult;
    running: RunningCosts | null;
    annual: AnnualCost | null;
    companyCar: CompanyCarTax | null;
    zones: Zones;
    age: AgeAndUse | null;
}

export const deriveVehicleData = (facts: VehicleFacts): DerivedVehicleData => {
    const ved = vedFor(facts);
    const running = runningCosts(facts);
    return {
        ved,
        running,
        annual: annualCost(ved, running),
        companyCar: companyCarTax(facts),
        zones: zones(facts),
        age: ageAndUse(facts),
    };
};

/* ------------------------------------------------------------------------- */

/** The fuel names both services use, into the five that matter here. */
export const normaliseFuel = (v?: string | null): string => {
    const s = String(v || '').toUpperCase();
    if (!s) return '';
    if (s.includes('PLUG')) return 'Plug-in Hybrid';
    if (s.includes('HYBRID')) return 'Hybrid';
    if (s.includes('ELECTRIC')) {
        // "Electric Diesel" and "Electric Petrol" are hybrids by another name.
        if (s.includes('DIESEL') || s.includes('PETROL')) return 'Hybrid';
        return 'Electric';
    }
    if (s.includes('DIESEL')) return 'Diesel';
    if (s.includes('PETROL') || s.includes('GAS BI-FUEL')) return 'Petrol';
    return '';
};

/** "2015-03" off the DVLA, "2015-03-28" off the DVSA — both end up a date. */
const toIso = (v?: string | null): string => {
    const s = String(v || '').trim();
    if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

const addYears = (iso: string, n: number): string => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() + n);
    return d.toISOString().slice(0, 10);
};

const pretty = (iso: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso || '')) return '';
    return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    });
};

const numOrNull = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
