"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.normaliseFuel = exports.deriveVehicleData = exports.plateFor = exports.ageAndUse = exports.zones = exports.companyCarTax = exports.bikPercent = exports.BIK_YEAR = exports.annualCost = exports.runningCosts = exports.vedFor = exports.vedTaxYear = exports.VED_RATES = void 0;
exports.VED_RATES = {
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
const vedTaxYear = (when) => {
    const d = when ? new Date(when) : new Date();
    const y = d.getUTCFullYear();
    const start = d.getUTCMonth() >= 3 ? y : y - 1; // month 3 = April
    const key = `${start}/${String(start + 1).slice(2)}`;
    return exports.VED_RATES[key] ? key : Object.keys(exports.VED_RATES).sort().pop();
};
exports.vedTaxYear = vedTaxYear;
/**
 * The annual road tax figure, plus the workings.
 *
 * Three regimes, decided entirely by the date of first registration: engine
 * size before March 2001, CO2 letter bands to March 2017, and a flat standard
 * rate plus a price-based supplement after that.
 */
const vedFor = (facts) => {
    const yearKey = (0, exports.vedTaxYear)(facts.on);
    const t = exports.VED_RATES[yearKey];
    const fuel = (0, exports.normaliseFuel)(facts.fuel);
    const first = toIso(facts.firstRegistered);
    const co2 = numOrNull(facts.co2);
    const cc = numOrNull(facts.engineCapacity);
    const electric = fuel === 'Electric';
    const base = {
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
            basis: `Registered ${pretty(first)}, so it is taxed on engine size: ${cc}cc is ` +
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
        const row = t.bands.find(b => co2 <= b.upTo);
        const annual = row.rate;
        return {
            ...base,
            regime: '2001-2017',
            band: row.band,
            annual,
            sixMonth: round2(annual * 0.55),
            monthly: round2((annual * 1.05) / 12),
            basis: `${co2} g/km puts it in band ${row.band} — £${annual} a year on ${yearKey} rates.` +
                (row.band === 'A' && !electric ? ' Band A was free until April 2025; it is not any more.' : '') +
                (electric ? ' Electric cars in these years started paying in April 2025.' : ''),
        };
    }
    // --- 1 April 2017 onwards: flat rate, plus the supplement ---
    const standard = t.standard;
    const firstYearRow = co2 === null ? null : t.firstYear.find(b => co2 <= b.upTo);
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
    const unknown = [];
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
        }
        else if (listPrice > threshold) {
            supplement = t.supplement;
            note =
                ` It listed at over £${threshold.toLocaleString('en-GB')} when new, so the ` +
                    `£${t.supplement} expensive-car supplement applies until ${pretty(windowTo)}.`;
        }
        else {
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
        basis: `Registered ${pretty(first)}, so it pays the flat standard rate of £${standard} a year ` +
            `(${yearKey}).${note}` +
            (electricExempt
                ? ' Electric and registered before April 2025, so the expensive-car supplement never applied to it.'
                : ''),
    };
};
exports.vedFor = vedFor;
const CO2_PER_LITRE = { Petrol: 2392, Diesel: 2640 };
const LITRES_PER_GALLON = 4.54609;
const fuelPrices = () => ({
    petrol: Number(process.env.FUEL_PETROL_PENCE || 139.9),
    diesel: Number(process.env.FUEL_DIESEL_PENCE || 147.9),
    electric: Number(process.env.FUEL_ELECTRIC_PENCE_KWH || 7.5),
    milesPerYear: Number(process.env.FUEL_MILES_PER_YEAR || 10000),
});
const runningCosts = (facts) => {
    const fuel = (0, exports.normaliseFuel)(facts.fuel);
    const co2 = numOrNull(facts.co2);
    const p = fuelPrices();
    const miles = numOrNull(facts.milesPerYear) || p.milesPerYear;
    if (!fuel)
        return null;
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
            basis: `About ${milesPerKwh} miles per kWh over ${miles.toLocaleString('en-GB')} miles a year ` +
                `at ${p.electric}p a kWh — roughly £${cost.toLocaleString('en-GB')} a year to charge at home. ` +
                'Public rapid charging costs three to six times that.',
        };
    }
    if (co2 === null || co2 <= 0)
        return null;
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
        basis: `${co2} g/km works back to about ${Math.round(mpg)} mpg. Over ` +
            `${miles.toLocaleString('en-GB')} miles a year at ${pence}p a litre that is roughly ` +
            `£${cost.toLocaleString('en-GB')} of ${burns.toLowerCase()}.` +
            (optimistic
                ? ' Plug-in hybrids are tested with a full battery, so the official figure is only reachable on short runs you plug in after.'
                : ''),
    };
};
exports.runningCosts = runningCosts;
/**
 * Tax plus fuel — the number a buyer is actually comparing between two cars.
 * Servicing and insurance are deliberately out: neither can be derived, and a
 * guess sitting next to real figures poisons the real ones.
 */
const annualCost = (ved, costs) => {
    if (ved.annual === null || !costs)
        return null;
    const total = ved.annual + costs.annualFuelCost;
    return {
        tax: ved.annual,
        fuel: costs.annualFuelCost,
        total,
        milesPerYear: costs.milesPerYear,
        basis: `£${ved.annual} road tax plus about £${costs.annualFuelCost.toLocaleString('en-GB')} of fuel ` +
            `over ${costs.milesPerYear.toLocaleString('en-GB')} miles — around ` +
            `£${total.toLocaleString('en-GB')} a year before servicing and insurance.`,
    };
};
exports.annualCost = annualCost;
/**
 * Company car tax.
 *
 * A large slice of retail stock goes onto a business. The taxable benefit is
 * list price × appropriate percentage, and the driver pays their own income tax
 * rate on that — both 20% and 40% are worked out because both get quoted.
 *
 * Appropriate percentages for 2026/27.
 */
exports.BIK_YEAR = '2026/27';
const bikPercent = (co2, fuel, electricRangeMiles, rde2) => {
    if (co2 === null || co2 === undefined)
        return null;
    if (co2 === 0)
        return 4; // fully electric
    let pct;
    if (co2 <= 50) {
        const range = Number(electricRangeMiles) || 0;
        if (!range)
            return null; // the band turns on electric range
        pct = range >= 130 ? 5 : range >= 70 ? 8 : range >= 40 ? 12 : range >= 30 ? 14 : 17;
    }
    else if (co2 <= 54) {
        pct = 17;
    }
    else {
        // 55 g/km is 18%, then a point for every 5 g/km, capped at 37%.
        pct = 18 + Math.floor((co2 - 55) / 5);
    }
    // A diesel that does not meet RDE2 carries four points, still capped.
    if ((0, exports.normaliseFuel)(fuel) === 'Diesel' && rde2 !== true)
        pct += 4;
    return Math.min(pct, 37);
};
exports.bikPercent = bikPercent;
const companyCarTax = (facts) => {
    const co2 = numOrNull(facts.co2) === null && (0, exports.normaliseFuel)(facts.fuel) === 'Electric' ? 0 : numOrNull(facts.co2);
    const pct = (0, exports.bikPercent)(co2, facts.fuel, facts.electricRangeMiles, facts.rde2);
    if (pct === null)
        return null;
    const listPrice = numOrNull(facts.listPrice);
    const out = {
        taxYear: exports.BIK_YEAR,
        percent: pct,
        basis: `${co2 === 0 ? 'Zero emissions' : `${co2} g/km`} is a ${pct}% benefit-in-kind band for ${exports.BIK_YEAR}.`,
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
exports.companyCarTax = companyCarTax;
const zones = (facts) => {
    const fuel = (0, exports.normaliseFuel)(facts.fuel);
    const first = toIso(facts.firstRegistered);
    const euro = String(facts.euroStatus || '').toUpperCase().replace(/[^0-9]/g, '');
    let ulez = null;
    if (fuel === 'Electric') {
        ulez = { compliant: true, assumed: false, basis: 'Electric — nothing to pay in the ULEZ.' };
    }
    else if (euro && fuel) {
        const need = fuel === 'Diesel' ? 6 : 4;
        const ok = Number(euro) >= need;
        ulez = {
            compliant: ok,
            assumed: false,
            basis: `The DVLA records it as Euro ${euro}; a ${fuel.toLowerCase()} needs Euro ${need}.`,
        };
    }
    else if (fuel && first) {
        const line = fuel === 'Diesel' ? '2015-09-01' : '2006-01-01';
        const ok = first >= line;
        ulez = {
            compliant: ok,
            assumed: true,
            basis: `First registered ${pretty(first)} — ${fuel === 'Diesel'
                ? 'diesels from September 2015 are Euro 6'
                : 'petrols from January 2006 are Euro 4'}.`,
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
exports.zones = zones;
/**
 * Age, plate and how hard it has been used.
 *
 * "One owner, 31,000 miles, well under average for its age" is the line that
 * sells a car, and every part of it is already in the lookup. The UK average is
 * about 7,400 miles a year.
 */
const UK_AVERAGE_MILES_YEAR = 7400;
const ageAndUse = (facts) => {
    const first = toIso(facts.firstRegistered);
    if (!first)
        return null;
    const now = facts.on ? Date.parse(facts.on) : Date.now();
    const age = Math.max(0, (now - Date.parse(`${first}T12:00:00Z`)) / 31557600000);
    const out = {
        firstRegistered: first,
        ageYears: round2(age),
        ageText: ageText(age),
        plate: (0, exports.plateFor)(first),
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
exports.ageAndUse = ageAndUse;
/**
 * The plate a car wears is the age identifier. March registrations take the
 * year; September ones take the year plus fifty. Cars on the older lettered
 * systems get an empty string rather than a wrong number.
 */
const plateFor = (iso) => {
    if (!/^\d{4}-\d{2}/.test(iso || ''))
        return '';
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    if (y < 2001 || (y === 2001 && m < 9))
        return '';
    if (m >= 3 && m <= 8)
        return String(y).slice(2);
    const base = m >= 9 ? y : y - 1;
    return String((base % 100) + 50);
};
exports.plateFor = plateFor;
const ageText = (years) => {
    if (years < 1) {
        const months = Math.max(1, Math.round(years * 12));
        return `${months} month${months === 1 ? '' : 's'}`;
    }
    const whole = Math.floor(years);
    return `${whole} year${whole === 1 ? '' : 's'}`;
};
const deriveVehicleData = (facts) => {
    const ved = (0, exports.vedFor)(facts);
    const running = (0, exports.runningCosts)(facts);
    return {
        ved,
        running,
        annual: (0, exports.annualCost)(ved, running),
        companyCar: (0, exports.companyCarTax)(facts),
        zones: (0, exports.zones)(facts),
        age: (0, exports.ageAndUse)(facts),
    };
};
exports.deriveVehicleData = deriveVehicleData;
/* ------------------------------------------------------------------------- */
/** The fuel names both services use, into the five that matter here. */
const normaliseFuel = (v) => {
    const s = String(v || '').toUpperCase();
    if (!s)
        return '';
    if (s.includes('PLUG'))
        return 'Plug-in Hybrid';
    if (s.includes('HYBRID'))
        return 'Hybrid';
    if (s.includes('ELECTRIC')) {
        // "Electric Diesel" and "Electric Petrol" are hybrids by another name.
        if (s.includes('DIESEL') || s.includes('PETROL'))
            return 'Hybrid';
        return 'Electric';
    }
    if (s.includes('DIESEL'))
        return 'Diesel';
    if (s.includes('PETROL') || s.includes('GAS BI-FUEL'))
        return 'Petrol';
    return '';
};
exports.normaliseFuel = normaliseFuel;
/** "2015-03" off the DVLA, "2015-03-28" off the DVSA — both end up a date. */
const toIso = (v) => {
    const s = String(v || '').trim();
    if (/^\d{4}-\d{2}$/.test(s))
        return `${s}-01`;
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};
const addYears = (iso, n) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() + n);
    return d.toISOString().slice(0, 10);
};
const pretty = (iso) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(iso || ''))
        return '';
    return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    });
};
const numOrNull = (v) => {
    if (v === null || v === undefined || v === '')
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};
const round2 = (n) => Math.round(n * 100) / 100;
//# sourceMappingURL=ved.js.map