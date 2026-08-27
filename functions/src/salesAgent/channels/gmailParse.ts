/**
 * Pure email-body helpers shared by the Gmail channel and the inbox-context reader.
 * Kept free of imports so neither side drags the other (and the router) in.
 */

/**
 * Where the customer stopped writing and their mail client started quoting.
 *
 * Getting this wrong feeds the brain the whole previous conversation on every reply,
 * which reads as the customer repeating themselves. Erring towards cutting slightly too
 * much is safer than cutting too little.
 */
const QUOTE_MARKERS: RegExp[] = [
    /^\s*On .{4,120}\bwrote:\s*$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}/im,
    /^\s*_{10,}\s*$/m,
    /^\s*From:\s.+\r?\n\s*(?:Sent|Date):\s/im,
    /^\s*Sent from my \w+/im,
    /^\s*Get Outlook for \w+/im,
    /^\s*Sent from Outlook\b/im,
];

export const stripQuotedReply = (body: string): string => {
    let text = (body || '').replace(/\r\n/g, '\n');

    let cut = text.length;
    for (const marker of QUOTE_MARKERS) {
        const found = text.match(marker);
        if (found?.index !== undefined && found.index < cut) cut = found.index;
    }
    text = text.slice(0, cut);

    const lines = text.split('\n');
    while (lines.length && (!lines[lines.length - 1].trim() || lines[lines.length - 1].startsWith('>'))) {
        lines.pop();
    }

    // A "-- " line is the RFC signature delimiter; everything after it is a sig block.
    const sig = lines.findIndex(line => /^--\s?$/.test(line));
    const kept = sig === -1 ? lines : lines.slice(0, sig);

    return kept.join('\n').trim();
};
