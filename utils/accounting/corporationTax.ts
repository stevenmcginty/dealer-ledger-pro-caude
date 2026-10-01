// UK corporation tax ESTIMATE for one accounting period, with every step shown.
//
// Rules (gov.uk/corporation-tax-rates, gov.uk/guidance/corporation-tax-marginal-relief):
//   - Small profits rate 19% on profits up to the lower limit (£50,000).
//   - Main rate 25% on profits above the upper limit (£250,000).
//   - In between: main rate less marginal relief = fraction x (upper limit - profits),
//     fraction 3/200 (FY2023 onward).
//   - Both limits are divided by (1 + number of associated companies) and reduced
//     pro rata for an accounting period shorter than 12 months.
//   - Financial years run 1 April to 31 March (FY2025 = 1 Apr 2025 - 31 Mar 2026).
//     A period that spans 1 April is split by days, and each part is taxed at its own
//     FY's rates with its share of the limits.
// Simplifications: augmented profits = taxable profits (no exempt distributions), and
// losses, add-backs, capital allowances and stock write-downs come in as adjustments.

import type { YearEndAdjustment, YearEndAdjustmentKind } from '../../types';
import { addDays, DateRange, daysInclusive, formatDayShort } from './yearEnd';

export interface CtRates {
    /** Financial year number: FY2025 starts 1 April 2025. */
    fy: number;
    smallProfitsRate: number;
    mainRate: number;
    lowerLimit: number;
    upperLimit: number;
    /** Marginal relief fraction. 0 = no marginal relief (one flat rate). */
    marginalReliefFraction: number;
}

/** Rates by financial year. Add a row when the Budget changes them. */
export const CT_RATES: CtRates[] = [
    { fy: 2022, smallProfitsRate: 0.19, mainRate: 0.19, lowerLimit: 0, upperLimit: 0, marginalReliefFraction: 0 },
    { fy: 2023, smallProfitsRate: 0.19, mainRate: 0.25, lowerLimit: 50000, upperLimit: 250000, marginalReliefFraction: 3 / 200 },
    { fy: 2024, smallProfitsRate: 0.19, mainRate: 0.25, lowerLimit: 50000, upperLimit: 250000, marginalReliefFraction: 3 / 200 },
    { fy: 2025, smallProfitsRate: 0.19, mainRate: 0.25, lowerLimit: 50000, upperLimit: 250000, marginalReliefFraction: 3 / 200 },
    { fy: 2026, smallProfitsRate: 0.19, mainRate: 0.25, lowerLimit: 50000, upperLimit: 250000, marginalReliefFraction: 3 / 200 },
];

/** Rates for a financial year. Years past the table reuse the latest row and are flagged as assumed. */
export function ratesForFinancialYear(fy: number): { rates: CtRates; assumed: boolean } {
    const exact = CT_RATES.find(r => r.fy === fy);
    if (exact) return { rates: exact, assumed: false };
    const sorted = [...CT_RATES].sort((a, b) => a.fy - b.fy);
    const fallback = fy > sorted[sorted.length - 1].fy ? sorted[sorted.length - 1] : sorted[0];
    return { rates: { ...fallback, fy }, assumed: true };
}

/** The financial year (1 April start) that a day falls in. */
export const financialYearOfDay = (day: string): number => {
    const y = +day.slice(0, 4);
    return day.slice(5) >= '04-01' ? y : y - 1;
};

export interface CtStep {
    label: string;
    amount: number;
    note?: string;
}

export interface CtFinancialYearPart {
    fy: number;
    start: string;
    end: string;
    days: number;
    profit: number;
    lowerLimit: number;
    upperLimit: number;
    rates: CtRates;
    ratesAssumed: boolean;
    band: 'small_profits' | 'marginal_relief' | 'main_rate' | 'flat';
    taxAtRate: number;
    marginalRelief: number;
    tax: number;
}

export interface CorporationTaxEstimate {
    period: DateRange;
    periodDays: number;
    associatedCompanies: number;
    accountingProfit: number;
    stockWriteDowns: number;
    addBacks: number;
    capitalAllowances: number;
    otherDeductions: number;
    /** Profit after the adjustments, before losses. Negative = a trading loss this year. */
    adjustedProfit: number;
    lossesBroughtForward: number;
    lossesUsed: number;
    /** Unused losses brought forward plus any loss made this period. */
    lossesCarriedForward: number;
    taxableProfit: number;
    parts: CtFinancialYearPart[];
    tax: number;
    effectiveRate: number;
    steps: CtStep[];
    warnings: string[];
}

export interface CorporationTaxInput {
    period: DateRange;
    /** Net profit from the P&L for the same period. */
    accountingProfit: number;
    /** Adjustments saved for this period (already filtered by periodKey). */
    adjustments?: Pick<YearEndAdjustment, 'kind' | 'amount'>[];
    associatedCompanies?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumKind = (adj: Pick<YearEndAdjustment, 'kind' | 'amount'>[], kind: YearEndAdjustmentKind) =>
    adj.filter(a => a.kind === kind).reduce((s, a) => s + Math.abs(Number(a.amount) || 0), 0);

const fractionText = (f: number) => (Math.abs(f - 3 / 200) < 1e-12 ? '3/200' : String(f));
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Is `period` exactly 12 months (e.g. 1 Apr 2025 – 31 Mar 2026)? */
function isFullYear(period: DateRange): boolean {
    const [y, m, d] = period.start.split('-').map(Number);
    const sameDayNextYear = new Date(Date.UTC(y + 1, m - 1, d));
    const expectedEnd = addDays(
        `${sameDayNextYear.getUTCFullYear()}-${String(sameDayNextYear.getUTCMonth() + 1).padStart(2, '0')}-${String(sameDayNextYear.getUTCDate()).padStart(2, '0')}`,
        -1,
    );
    return expectedEnd === period.end;
}

/** Tax on one FY part, given its profit and its share of the limits. */
function taxPart(profit: number, lower: number, upper: number, rates: CtRates) {
    if (profit <= 0) return { band: 'small_profits' as const, taxAtRate: 0, marginalRelief: 0, tax: 0 };
    if (rates.marginalReliefFraction === 0 || rates.smallProfitsRate === rates.mainRate) {
        const t = profit * rates.mainRate;
        return { band: 'flat' as const, taxAtRate: t, marginalRelief: 0, tax: t };
    }
    if (profit <= lower) {
        const t = profit * rates.smallProfitsRate;
        return { band: 'small_profits' as const, taxAtRate: t, marginalRelief: 0, tax: t };
    }
    const t = profit * rates.mainRate;
    if (profit >= upper) return { band: 'main_rate' as const, taxAtRate: t, marginalRelief: 0, tax: t };
    // Augmented profits = taxable profits here, so the N/A ratio is 1.
    const relief = rates.marginalReliefFraction * (upper - profit);
    return { band: 'marginal_relief' as const, taxAtRate: t, marginalRelief: relief, tax: t - relief };
}

export function estimateCorporationTax(input: CorporationTaxInput): CorporationTaxEstimate {
    const { period } = input;
    const adjustments = input.adjustments ?? [];
    const associated = Math.max(0, Math.floor(Number(input.associatedCompanies) || 0));
    const warnings: string[] = [];
    const steps: CtStep[] = [];

    const periodDays = daysInclusive(period.start, period.end);
    const fullYear = isFullYear(period);
    if (!fullYear && periodDays > 365) {
        warnings.push('A corporation tax period cannot be longer than 12 months. HMRC splits a longer period of account into two accounting periods; this estimate treats it as one.');
    }
    const periodFactor = fullYear ? 1 : Math.min(1, periodDays / 365);

    const accountingProfit = round2(input.accountingProfit);
    const stockWriteDowns = round2(sumKind(adjustments, 'stock_write_down'));
    const addBacks = round2(sumKind(adjustments, 'add_back'));
    const capitalAllowances = round2(sumKind(adjustments, 'capital_allowance'));
    const otherDeductions = round2(sumKind(adjustments, 'other_deduction'));
    const lossesBroughtForward = round2(sumKind(adjustments, 'loss_brought_forward'));

    steps.push({ label: 'Net profit per the P&L', amount: accountingProfit });
    if (stockWriteDowns) steps.push({ label: 'Less: stock write-downs', amount: -stockWriteDowns });
    if (addBacks) steps.push({ label: 'Add: disallowable costs (add-backs)', amount: addBacks });
    if (capitalAllowances) steps.push({ label: 'Less: capital allowances', amount: -capitalAllowances });
    if (otherDeductions) steps.push({ label: 'Less: other deductions', amount: -otherDeductions });

    const adjustedProfit = round2(accountingProfit - stockWriteDowns + addBacks - capitalAllowances - otherDeductions);
    steps.push({ label: 'Adjusted trading profit', amount: adjustedProfit });

    const lossesUsed = round2(Math.min(lossesBroughtForward, Math.max(0, adjustedProfit)));
    if (lossesBroughtForward) steps.push({ label: 'Less: losses brought forward used', amount: -lossesUsed, note: `${gbp(lossesBroughtForward)} available` });
    const taxableProfit = round2(Math.max(0, adjustedProfit - lossesUsed));
    const lossesCarriedForward = round2(lossesBroughtForward - lossesUsed + Math.max(0, -adjustedProfit));
    steps.push({ label: 'Taxable profit', amount: taxableProfit });

    // Split the period at each 1 April.
    const parts: CtFinancialYearPart[] = [];
    let cursor = period.start;
    while (cursor <= period.end) {
        const fy = financialYearOfDay(cursor);
        const fyEnd = `${fy + 1}-03-31`;
        const end = fyEnd < period.end ? fyEnd : period.end;
        const days = daysInclusive(cursor, end);
        const share = days / periodDays;
        const { rates, assumed } = ratesForFinancialYear(fy);
        if (assumed) warnings.push(`Rates for FY${fy} are not in the rate table yet, so the nearest known year's rates are used.`);
        const lower = (rates.lowerLimit * periodFactor * share) / (1 + associated);
        const upper = (rates.upperLimit * periodFactor * share) / (1 + associated);
        const profit = taxableProfit * share;
        const t = taxPart(profit, lower, upper, rates);
        parts.push({
            fy, start: cursor, end, days,
            profit: round2(profit),
            lowerLimit: round2(lower),
            upperLimit: round2(upper),
            rates, ratesAssumed: assumed,
            band: t.band,
            taxAtRate: round2(t.taxAtRate),
            marginalRelief: round2(t.marginalRelief),
            tax: round2(t.tax),
        });
        cursor = addDays(end, 1);
    }

    if (associated > 0) steps.push({ label: `Limits divided by ${1 + associated} (${associated} associated compan${associated === 1 ? 'y' : 'ies'})`, amount: 0 });
    if (periodFactor !== 1) steps.push({ label: `Limits reduced for a short period (${periodDays} of 365 days)`, amount: 0 });

    for (const p of parts) {
        const where = parts.length > 1 ? `FY${p.fy} (${formatDayShort(p.start)} – ${formatDayShort(p.end)}, ${p.days} days)` : `FY${p.fy}`;
        if (parts.length > 1) steps.push({ label: `${where}: share of taxable profit`, amount: p.profit });
        if (p.band === 'flat') {
            steps.push({ label: `${where}: ${p.profit ? gbp(p.profit) : '£0'} at ${p.rates.mainRate * 100}%`, amount: p.tax });
        } else if (p.band === 'small_profits') {
            steps.push({ label: `${where}: small profits rate ${p.rates.smallProfitsRate * 100}% (profit up to ${gbp(p.lowerLimit)})`, amount: p.tax });
        } else if (p.band === 'main_rate') {
            steps.push({ label: `${where}: main rate ${p.rates.mainRate * 100}% (profit over ${gbp(p.upperLimit)})`, amount: p.tax });
        } else {
            steps.push({ label: `${where}: main rate ${p.rates.mainRate * 100}% on ${gbp(p.profit)}`, amount: p.taxAtRate });
            steps.push({
                label: `${where}: less marginal relief`,
                amount: -p.marginalRelief,
                note: `${fractionText(p.rates.marginalReliefFraction)} × (${gbp(p.upperLimit)} − ${gbp(p.profit)})`,
            });
        }
    }

    const tax = round2(parts.reduce((s, p) => s + p.tax, 0));
    steps.push({ label: 'Estimated corporation tax', amount: tax });
    if (lossesCarriedForward) steps.push({ label: 'Losses carried forward', amount: lossesCarriedForward });

    return {
        period,
        periodDays,
        associatedCompanies: associated,
        accountingProfit,
        stockWriteDowns,
        addBacks,
        capitalAllowances,
        otherDeductions,
        adjustedProfit,
        lossesBroughtForward,
        lossesUsed,
        lossesCarriedForward,
        taxableProfit,
        parts,
        tax,
        effectiveRate: taxableProfit > 0 ? tax / taxableProfit : 0,
        steps,
        warnings,
    };
}
