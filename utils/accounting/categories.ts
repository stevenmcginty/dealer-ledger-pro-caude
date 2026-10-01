// Every rule that decides whether a bank line or receipt belongs in the Profit & Loss
// lives here, so the P&L, the "Expenses & VAT" list and any future report agree.
//
// Names are matched case-insensitively and trimmed, because the owner types categories
// freely ('SOR', 'sor', 'Sor'; 'Refund', 'refund'). The lists hold the names seen in the
// code (services/dataService.ts seed list and reconcile writers, StatementReconciler,
// IncomeAllocatorModal) and in the live ledger (e.g. 'Tax', 'BBL', 'Credit Card').

/** Groups of money that is real but not income or an expense of the trade. */
export type NotInPnlGroup =
    | 'transfer'
    | 'sale_money'
    | 'stock_purchase'
    | 'sor_payout'
    | 'credit_card_payment'
    | 'vat_hmrc'
    | 'corporation_tax'
    | 'hmrc_tax'
    | 'drawings'
    | 'director_loan'
    | 'loan'
    | 'dividend';

export const NOT_IN_PNL_LABELS: Record<NotInPnlGroup, string> = {
    transfer: 'Transfers between own accounts',
    sale_money: 'Sale money (counted from the sales invoices)',
    stock_purchase: 'Vehicle purchases (stock)',
    sor_payout: 'Sale or return payouts',
    credit_card_payment: 'Credit card payments',
    vat_hmrc: 'VAT paid to / refunded by HMRC',
    corporation_tax: 'Corporation tax',
    hmrc_tax: 'HMRC tax payments (VAT / corporation tax)',
    drawings: 'Drawings / personal',
    director_loan: "Director's loan",
    loan: 'Loans',
    dividend: 'Dividends',
};

/** Exact names (already normalised) for each group. */
const EXACT: Record<NotInPnlGroup, string[]> = {
    transfer: ['transfer', 'transfers', 'internal transfer', 'own account transfer'],
    sale_money: [
        'vehicle sale', 'car sale', 'sales deposit', 'sales income', 'job invoice payment',
        'miscellaneous income', 'deposit', 'deposits', 'vehicle deposit', 'car deposit',
    ],
    stock_purchase: ['vehicle purchase', 'car purchase', 'vehicle purchases', 'car purchases', 'stock purchase'],
    sor_payout: ['sor payout', 'sor payouts'],
    credit_card_payment: ['credit card payment', 'credit card payments', 'credit card', 'credit card repayment'],
    vat_hmrc: ['vat', 'vat payment', 'vat refund', 'vat return', 'vat paid', 'hmrc vat', 'vat repayment'],
    corporation_tax: ['corporation tax', 'ct', 'corp tax', 'corporation tax payment'],
    hmrc_tax: ['tax', 'hmrc', 'taxes'],
    drawings: ['drawings', 'personal', 'personal expense', 'personal expenses', 'director drawings', 'directors drawings'],
    director_loan: ['director loan', 'directors loan', "director's loan", "directors' loan", 'dla', 'director loan account'],
    loan: ['loan', 'loans', 'loan repayment', 'loan received', 'bbl', 'bounce back loan', 'cbils'],
    dividend: ['dividend', 'dividends'],
};

/** Looser patterns for names the owner may invent. Checked after the exact names. */
const PATTERNS: [NotInPnlGroup, RegExp][] = [
    ['director_loan', /\bdirector'?s?'? ?loan\b/],
    ['corporation_tax', /\bcorporation tax\b/],
    ['vat_hmrc', /\bvat (payment|refund|return|repayment|paid|to hmrc)\b|\bhmrc vat\b/],
    ['dividend', /\bdividends?\b/],
    ['drawings', /\bdrawings?\b/],
    ['loan', /\bloans?\b/],
    ['transfer', /\btransfers?\b/],
    ['credit_card_payment', /\bcredit card (payment|repayment)s?\b/],
];

/** Lower-case, trimmed, single-spaced. '' for a missing name. */
export const normaliseCategory = (name: string | null | undefined): string =>
    (name ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

export type CategoryDirection = 'in' | 'out';

export type CategoryClassification =
    | { inPnl: true }
    | { inPnl: false; group: NotInPnlGroup; label: string };

const excluded = (group: NotInPnlGroup): CategoryClassification => ({ inPnl: false, group, label: NOT_IN_PNL_LABELS[group] });

/**
 * Decide whether a category belongs in the P&L.
 * `direction` matters only for bare 'SOR': money out is a payout to the car's owner,
 * money in is the sale money for an SOR car (already in revenue from the invoice).
 */
export function classifyCategory(category: string | null | undefined, direction: CategoryDirection = 'out'): CategoryClassification {
    const name = normaliseCategory(category);
    if (!name) return { inPnl: true };

    if (name === 'sor' || name === 'sale or return') {
        return excluded(direction === 'in' ? 'sale_money' : 'sor_payout');
    }
    for (const group of Object.keys(EXACT) as NotInPnlGroup[]) {
        if (EXACT[group].includes(name)) return excluded(group);
    }
    for (const [group, re] of PATTERNS) {
        if (re.test(name)) return excluded(group);
    }
    return { inPnl: true };
}

/** A bank/card line: transfers flagged by the reconciler are excluded whatever their category. */
export function classifyTransaction(tx: { category?: string; amount: number; reconciliationType?: 'transfer' | null }): CategoryClassification {
    if (tx.reconciliationType === 'transfer') return excluded('transfer');
    return classifyCategory(tx.category, tx.amount > 0 ? 'in' : 'out');
}

/** A receipt is always money out (a cost). */
export function classifyReceipt(receipt: { category?: string }): CategoryClassification {
    return classifyCategory(receipt.category, 'out');
}

/** Display name for a category in totals: trimmed, 'Uncategorised' when blank. Case is kept from the first sighting. */
export const displayCategory = (name: string | null | undefined): string => {
    const trimmed = (name ?? '').toString().trim().replace(/\s+/g, ' ');
    return trimmed || 'Uncategorised';
};
