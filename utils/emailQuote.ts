/**
 * Split a dumped email (or a WhatsApp that pasted one) into the new words
 * and the quoted history, so the inbox can hide the quote.
 */

export interface SplitEmail {
    body: string;
    quoted: string | null;
    /** Who the quote header names, if we can read it. */
    quotedFrom?: string;
}

const APPLE_ON_WROTE = /^(On \d{1,2} \w{3,9} \d{4}, at \d{1,2}:\d{2}(?::\d{2})?, .+ wrote:)\s*$/im;
const GMAIL_ON_WROTE = /^(On \w{3}, \d{1,2} \w{3,9} \d{4} at \d{1,2}:\d{2}.+wrote:)\s*$/im;
const GENERIC_ON_WROTE = /^(On .+ wrote:)\s*$/im;
const ORIGINAL_MESSAGE = /^(-{2,}\s*Original Message\s*-{2,})\s*$/im;
const OUTLOOK_FROM = /^(From:\s+.+\r?\n(?:Sent|Date):\s+)/im;

const looksQuotedLine = (line: string): boolean => {
    const t = line.trim();
    return t.startsWith('>') || t.startsWith('|');
};

const quotedFromOf = (header: string): string | undefined => {
    const angle = header.match(/([^,<\n]+?)\s*<[^>]+>/);
    if (angle) {
        const name = angle[1].replace(/^["'\s,]+|["'\s]+$/g, '').trim();
        if (name && !/^\d/.test(name) && !/\bat\b/i.test(name)) return name;
    }
    const fromLine = header.match(/^From:\s*(.+)$/im);
    if (fromLine) {
        const raw = fromLine[1].replace(/<[^>]+>/, '').replace(/^["']|["']$/g, '').trim();
        if (raw) return raw;
    }
    return undefined;
};

const splitAt = (text: string, index: number, header: string): SplitEmail => {
    const body = text.slice(0, index).replace(/\s+$/, '');
    const quoted = text.slice(index + header.length).replace(/^\s+/, '');
    return {
        body,
        quoted: quoted || null,
        quotedFrom: quotedFromOf(header.trim()),
    };
};

/**
 * Cut at the first quoted-history marker. Conservative: no marker means
 * the whole thing is the body, never hidden.
 */
export const splitQuotedEmail = (text: string): SplitEmail => {
    const raw = (text || '').replace(/\r\n/g, '\n');
    if (!raw.trim()) return { body: '', quoted: null };

    const markers = [APPLE_ON_WROTE, GMAIL_ON_WROTE, GENERIC_ON_WROTE, ORIGINAL_MESSAGE, OUTLOOK_FROM];
    let best: { index: number; header: string } | null = null;
    for (const re of markers) {
        re.lastIndex = 0;
        const match = re.exec(raw);
        if (!match || match.index === undefined) continue;
        if (!best || match.index < best.index) best = { index: match.index, header: match[1] || match[0] };
    }
    if (best) return splitAt(raw, best.index, best.header);

    const lines = raw.split('\n');
    let run = -1;
    for (let i = 0; i < lines.length; i += 1) {
        if (looksQuotedLine(lines[i])) {
            if (run < 0) run = i;
        } else if (lines[i].trim() === '' && run >= 0) {
            // blank inside a quote run still counts
        } else if (run >= 0) {
            // a non-quoted line after a short run is not a history block
            if (i - run < 3) run = -1;
            else break;
        }
    }
    if (run > 0 && lines.length - run >= 3) {
        return {
            body: lines.slice(0, run).join('\n').replace(/\s+$/, ''),
            quoted: lines.slice(run).join('\n').replace(/^>\s?/gm, '').replace(/^\s+/, '') || null,
        };
    }

    const ios = raw.match(/^(Sent from my iPhone)\s*\n+/i);
    if (ios) {
        const rest = raw.slice(ios[0].length).replace(/^\s+/, '');
        if (looksLikeEmailBody(rest)) {
            return { body: ios[1], quoted: rest, quotedFrom: quotedFromOf(rest) };
        }
    }

    return { body: raw, quoted: null };
};

const emailHits = (text: string): number => {
    const greeting = /^(hi|hello|dear)\s+\w+/im.test(text);
    const signoff = /^(regards|kind regards|thanks|thank you|cheers)\b/im.test(text);
    const link = /www\.|https?:\/\//i.test(text);
    const phone = /(\+44\s?\d{9,11}|0\d{3,4}\s?\d{3}\s?\d{3,4})/.test(text);
    const desk = /radlett car sales|sent from my /i.test(text);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length >= 3;
    return [greeting, signoff, link, phone, desk, paragraphs].filter(Boolean).length;
};

/** A pasted WhatsApp should only collapse when the quote is actually an email. */
export const looksLikeForwardedEmail = (quoted: string | null | undefined): boolean => {
    if (!quoted) return false;
    const text = quoted.trim();
    if (text.length < 80) return false;
    return emailHits(text) >= 2 || text.length > 240;
};

/**
 * A WhatsApp bubble that is itself an email (no "On … wrote" marker).
 * Short chat stays chat.
 */
export const looksLikeEmailBody = (text: string | null | undefined): boolean => {
    const raw = (text || '').trim();
    if (raw.length < 80) return false;
    if (raw.split('\n').filter(l => l.trim()).length < 5) return false;
    return emailHits(raw) >= 3;
};

export const isLongEmailBody = (body: string): boolean => {
    const text = (body || '').trim();
    if (!text) return false;
    const lines = text.split('\n').filter(l => l.trim()).length;
    return lines > 5 || text.length > 280;
};
