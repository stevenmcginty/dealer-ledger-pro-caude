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
}

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
