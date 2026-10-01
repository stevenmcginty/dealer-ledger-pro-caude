import { FinancialAccount, StatementTransaction } from '../types';

// Which of the business's own accounts a statement line belongs to, and which lines look like
// money moved between two of them. Pure (no Firebase) so it can be unit-tested.

export type AccountRef = Pick<FinancialAccount, 'id' | 'type'>;
type AccountLine = Pick<StatementTransaction, 'accountId' | 'type'>;

/**
 * The account a line belongs to. Lines imported before lines carried an accountId fall back to
 * the OLDEST account of the same type (push ids sort by creation time), so with two bank
 * accounts they show under one tab, not both.
 */
export const accountIdOfTx = (tx: AccountLine, accounts: AccountRef[]): string | undefined => {
    if (tx.accountId) return tx.accountId;
    let oldest: string | undefined;
    for (const a of accounts) if (a.type === tx.type && (oldest === undefined || a.id < oldest)) oldest = a.id;
    return oldest;
};

/**
 * Accounts shown as Expenses tabs: open ones, plus closed ones when asked (and the active tab, so
 * hiding closed accounts never strands the page on a vanished tab). Lines of closed accounts still
 * count in every report; only the tabs and the upload menu hide them.
 */
export const accountsForTabs = <A extends Pick<FinancialAccount, 'id' | 'closed'>>(accounts: A[], showClosed: boolean, activeId?: string): A[] =>
    accounts.filter(a => !a.closed || showClosed || a.id === activeId);

/** Accounts a statement can be uploaded to: open ones only. */
export const accountsForUpload = <A extends Pick<FinancialAccount, 'closed'>>(accounts: A[]): A[] =>
    accounts.filter(a => !a.closed);

/** Upload dedupe: is an existing line on the account a statement is being uploaded to? */
export const isOnAccountForDedupe = (tx: AccountLine, account: AccountRef): boolean =>
    // Legacy lines with no accountId are checked against every account of their type (safer:
    // a duplicate import is worse than one skipped line).
    tx.accountId === account.id || (!tx.accountId && tx.type === account.type);

export const TRANSFER_MAX_DAYS = 3;

export type TransferLine = Pick<StatementTransaction, 'id' | 'date' | 'amount' | 'accountId' | 'type' | 'status' | 'category' | 'reconciliationType'>;

// 'YYYY-MM-DD...' -> whole days since epoch (UTC), or null.
const dayNum = (s: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
};

const isTransferBooked = (t: TransferLine) => t.reconciliationType === 'transfer' || t.category === 'Transfer';

/**
 * Pairs a money-out line on one bank account with a money-in line on ANOTHER bank account of the
 * business: same amount to the penny, dates at most TRANSFER_MAX_DAYS apart. A line can pair only
 * while it is unreconciled or booked as a transfer. Pairs must be one-to-one: a line with two
 * possible partners (or whose partner has two) is left out. Returns both directions:
 * txId -> { partner, partnerAccountId }.
 */
export const findTransferPartners = <T extends TransferLine>(
    transactions: T[],
    accounts: AccountRef[],
    maxDays = TRANSFER_MAX_DAYS,
): Map<string, { partner: T; partnerAccountId: string }> => {
    const bankIds = new Set(accounts.filter(a => a.type === 'Bank').map(a => a.id));
    type Line = { tx: T; acc: string; day: number; pence: number };
    const lines: Line[] = [];
    for (const tx of transactions) {
        if (tx.status !== 'Unreconciled' && !isTransferBooked(tx)) continue;
        const acc = accountIdOfTx(tx, accounts);
        const day = dayNum(tx.date);
        if (!acc || !bankIds.has(acc) || day === null || !tx.amount) continue;
        lines.push({ tx, acc, day, pence: Math.round(tx.amount * 100) });
    }
    const outs = lines.filter(l => l.pence < 0);
    const ins = lines.filter(l => l.pence > 0);

    const candidates = new Map<string, Line[]>();
    const add = (from: Line, to: Line) => {
        const list = candidates.get(from.tx.id);
        if (list) list.push(to); else candidates.set(from.tx.id, [to]);
    };
    for (const o of outs) {
        for (const i of ins) {
            if (i.acc === o.acc || i.pence !== -o.pence || Math.abs(i.day - o.day) > maxDays) continue;
            // Both sides already booked as transfers: nothing left to suggest.
            if (isTransferBooked(o.tx) && isTransferBooked(i.tx)) continue;
            add(o, i);
            add(i, o);
        }
    }

    const result = new Map<string, { partner: T; partnerAccountId: string }>();
    for (const o of outs) {
        const mine = candidates.get(o.tx.id);
        if (!mine || mine.length !== 1) continue;
        const i = mine[0];
        if (candidates.get(i.tx.id)!.length !== 1) continue;
        result.set(o.tx.id, { partner: i.tx, partnerAccountId: i.acc });
        result.set(i.tx.id, { partner: o.tx, partnerAccountId: o.acc });
    }
    return result;
};

export type AutoSuggestion<M> =
    | { type: 'match'; data: M }
    | { type: 'transfer'; accountName: string }
    | { type: 'category'; category: string };

/**
 * The reconciler's automatic suggestion for a line, in priority order: a real data match
 * (invoice, vehicle, receipt) always wins; then a transfer partner on another own bank; then a
 * category learned from history; then a keyword category. Enter books whatever this returns.
 */
export const rankAutoSuggestion = <M>(input: {
    match?: M | null;
    transferAccountName?: string | null;
    historyCategory?: string | null;
    keywordCategory?: string | null;
}): AutoSuggestion<M> | null => {
    if (input.match) return { type: 'match', data: input.match };
    if (input.transferAccountName) return { type: 'transfer', accountName: input.transferAccountName };
    if (input.historyCategory) return { type: 'category', category: input.historyCategory };
    if (input.keywordCategory) return { type: 'category', category: input.keywordCategory };
    return null;
};
