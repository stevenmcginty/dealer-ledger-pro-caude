import { isWithinDays } from './helpers';

// Auto-match for bank statement uploads: pairs money-out lines with unpaid Direct receipts.
// Pure (no Firebase) so it can be unit-tested. Rules:
//  - date within 21 days either side;
//  - penny-exact amount is enough on its own; within 5p only when the supplier names overlap;
//  - each receipt is used at most once per run;
//  - ranking: exact + supplier, then exact, then near + supplier; within a rank, closest date;
//  - if a line's two best receipts are equally good, it is ambiguous and is left unmatched.

export const AUTO_MATCH_WINDOW_DAYS = 21;
const NEAR_PENCE = 5;

const STOP_WORDS = new Set([
    'LTD', 'LIMITED', 'THE', 'GROUP', 'UK', 'GB', 'LONDON', 'PAYMENT', 'CARD',
    'COM', 'WWW', 'CO', 'PLC', 'SERVICES', 'STATION',
]);

const supplierWords = (text: string): string[] =>
    (text || '')
        .toUpperCase()
        .split(/[^A-Z]+/)
        .filter(w => w.length >= 3 && !STOP_WORDS.has(w));

// True if the receipt vendor and the bank line description share a supplier word,
// or one word (of at least 4 letters) sits inside the other (e.g. "GROUPTYRE" in "GROUPTYREWHOLESALE").
export const supplierOverlap = (vendor: string, description: string): boolean => {
    const a = supplierWords(vendor);
    const b = supplierWords(description);
    for (const x of a) {
        for (const y of b) {
            if (x === y) return true;
            const [short, long] = x.length <= y.length ? [x, y] : [y, x];
            if (short.length >= 4 && long.includes(short)) return true;
        }
    }
    return false;
};

export interface AutoMatchTx {
    date: string;
    description: string;
    amount: number;
    status: string;
}

export interface AutoMatchReceipt {
    id: string;
    vendor: string;
    amount: number;
    date: string;
    status: string;
    paymentType: string;
    reconciledByTxId?: string;
}

// A receipt a person may still pick by hand (Match / Advanced, Ask AI): not linked to a bank line
// yet, and either Unpaid, or Paid by Direct payment. Old statement uploads marked receipts Paid
// without storing the link, so "Paid" alone does not mean a bank line carries it. Automatic
// matching stays Unpaid-only: an old Paid receipt was already paid by some older line, so
// pairing it without a human could book the cost twice. Paid On Account receipts stay out.
export const isMatchableReceipt = (r: { status: string; paymentType: string; reconciledByTxId?: string }): boolean =>
    !r.reconciledByTxId && (r.status === 'Unpaid' || (r.status === 'Paid' && r.paymentType === 'Direct'));

const dayGap = (d1: string, d2: string): number =>
    Math.ceil(Math.abs(new Date(d2).getTime() - new Date(d1).getTime()) / (1000 * 60 * 60 * 24));

interface Candidate { txIndex: number; receiptId: string; rank: number; gap: number; }

// Returns tx index (into `txs`) -> receipt id for every line that should be auto-reconciled.
export const pickAutoMatches = (txs: AutoMatchTx[], receipts: AutoMatchReceipt[]): Map<number, string> => {
    const pool = receipts.filter(r => r.status === 'Unpaid' && r.paymentType === 'Direct');
    const candidates: Candidate[] = [];

    txs.forEach((tx, txIndex) => {
        if (tx.status !== 'Unreconciled' || !(tx.amount < 0)) return;
        for (const r of pool) {
            if (!isWithinDays(tx.date, r.date, AUTO_MATCH_WINDOW_DAYS)) continue;
            const diffPence = Math.round(Math.abs(Math.abs(tx.amount) - r.amount) * 100);
            if (diffPence > NEAR_PENCE) continue;
            const overlap = supplierOverlap(r.vendor, tx.description);
            let rank: number;
            if (diffPence === 0) rank = overlap ? 0 : 1;
            else if (overlap) rank = 2;
            else continue;
            candidates.push({ txIndex, receiptId: r.id, rank, gap: dayGap(tx.date, r.date) });
        }
    });

    // Best pairs first; ties broken by statement order so the result is deterministic.
    candidates.sort((x, y) => x.rank - y.rank || x.gap - y.gap || x.txIndex - y.txIndex);

    const matches = new Map<number, string>();
    const usedReceipts = new Set<string>();
    const ambiguousTxs = new Set<number>();

    for (const c of candidates) {
        if (matches.has(c.txIndex) || ambiguousTxs.has(c.txIndex) || usedReceipts.has(c.receiptId)) continue;
        const tie = candidates.some(o =>
            o !== c && o.txIndex === c.txIndex && !usedReceipts.has(o.receiptId) && o.rank === c.rank && o.gap === c.gap);
        if (tie) {
            ambiguousTxs.add(c.txIndex);
            continue;
        }
        matches.set(c.txIndex, c.receiptId);
        usedReceipts.add(c.receiptId);
    }
    return matches;
};

// Receipt saved after its bank line was already reconciled by hand: the receipt may be linked
// to that line, but only one-to-one (same rules as scripts/link-receipts.mjs). Rules: receipt
// amount > 0; money-out line, status Reconciled, not a Transfer, not a car purchase
// (linkedVehicleId), penny-exact amount, line date from 5 days before to 35 days after the
// receipt date, no receipt linked to it yet. Exactly one such line, AND no other unlinked
// receipt (not On Account) with the same amount fits that line's window: the line may already
// have its real receipt, or the new one is a duplicate. Else null.
export const LINK_DAYS_BEFORE = 5;
export const LINK_DAYS_AFTER = 35;

export interface LinkableTx extends AutoMatchTx {
    id: string;
    category?: string;
    linkedVehicleId?: string;
}

export interface LinkableReceipt {
    id: string;
    amount: number;
    date: string;
    paymentType?: string;
    reconciledByTxId?: string;
}

const dayNumber = (s: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
};

const fitsWindow = (lineDay: number, receiptDay: number): boolean =>
    lineDay >= receiptDay - LINK_DAYS_BEFORE && lineDay <= receiptDay + LINK_DAYS_AFTER;

export const findReconciledLineForReceipt = <T extends LinkableTx>(
    receipt: { id: string; amount: number; date: string },
    txs: T[],
    receipts: LinkableReceipt[],
): T | null => {
    const amount = Number(receipt.amount);
    const receiptDay = dayNumber(receipt.date);
    if (!(amount > 0) || receiptDay == null) return null; // credit notes never auto-link
    const receiptPence = Math.round(amount * 100);
    const others = receipts.filter(r => r.id !== receipt.id);
    const linked = new Set(others.filter(r => r.reconciledByTxId).map(r => r.reconciledByTxId));
    const hits = txs.filter(tx => {
        if (tx.status !== 'Reconciled' || !(tx.amount < 0) || tx.category === 'Transfer' || tx.linkedVehicleId || linked.has(tx.id)) return false;
        if (Math.round(Math.abs(tx.amount) * 100) !== receiptPence) return false;
        const d = dayNumber(tx.date);
        return d != null && fitsWindow(d, receiptDay);
    });
    if (hits.length !== 1) return null;
    const lineDay = dayNumber(hits[0].date)!;
    const rival = others.some(r => {
        if (r.reconciledByTxId || r.paymentType === 'On Account') return false;
        if (Math.round(Number(r.amount) * 100) !== receiptPence) return false;
        const d = dayNumber(r.date);
        return d != null && fitsWindow(lineDay, d);
    });
    return rival ? null : hits[0];
};

// VAT rate to store with a VAT amount copied from receipts: 0 when there is no VAT, 20 when the
// VAT is exactly gross/6 (to the penny). Anything else returns undefined: keep the line's rate.
export const vatRateForVat = (gross: number, vat: number): 0 | 20 | undefined => {
    const vatPence = Math.round(Math.abs(Number(vat) || 0) * 100);
    if (vatPence === 0) return 0;
    return Math.round((Math.abs(Number(gross) || 0) * 100) / 6) === vatPence ? 20 : undefined;
};
