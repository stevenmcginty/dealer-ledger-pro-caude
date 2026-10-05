/**
 * Turning the inbox into leads.
 *
 * Every lead email is normalised into a ParsedLead before the router sees it, so the
 * router never has to know that CarGurus writes markdown asterisks, Cazoo writes a
 * flat text block, and the dealership's own website sends HTML only. The formats
 * sampled from radlettcars@gmail.com are documented in docs/sales-agent/EMAIL_FORMATS.md
 * and the sample bodies in leadParsers.test.ts came from that file.
 *
 * Two rules run through all of it:
 *
 * 1. We never follow a link to find out who to answer. The reply address is a personal
 *    sender address, an email written in the body, or a phone number written in the
 *    body — nothing else. A lead with none of those is Steve's to deal with, not the
 *    agent's, because the only remaining way to answer it is to click something.
 * 2. A platform's noreply address is never a reply address. Answering
 *    dealer-leads@messages.cargurus.com talks to a robot, and the customer waits.
 */

import * as cheerio from 'cheerio';

import { extractUkMobiles, toE164 } from '../types';
import type { LeadSource } from '../conversations';
import { stripQuotedReply } from './gmailParse';

export type LeadPlatform = 'CarGurus' | 'Cazoo' | 'Website' | 'eBay' | 'AutoTrader' | 'Direct' | 'Other';
export type LeadKind = 'enquiry' | 'phone_lead' | 'missed_call' | 'reservation' | 'reservation_request' | 'ignore' | 'bounce' | 'supplier';

export interface ReplyTarget {
    channel: 'email' | 'whatsapp' | 'sms';
    address: string;
}

export interface ParsedLead {
    source: LeadPlatform;
    kind: LeadKind;
    name?: string;
    firstName?: string;
    email?: string;
    phone?: string;
    postcode?: string;
    vehicle?: { title?: string; reg?: string; price?: number; stockId?: string; url?: string };
    /** What the customer actually said. Empty means "is it still available?". */
    message: string;
    enquiryType?: string;
    flags?: {
        testDrive?: boolean;
        wantsServiceHistory?: boolean;
        wantsMorePhotos?: boolean;
        wantsVideo?: boolean;
        partEx?: string;
    };
    preferredContact?: 'email' | 'phone' | 'whatsapp';
    /** Primary place to answer. Never a platform noreply. */
    replyTo: ReplyTarget;
    /** Every usable route, in preference order — email and WhatsApp when we have both. */
    replyTargets: ReplyTarget[];
    /** False when the only way to answer would be to follow a link. Router alerts Steve instead. */
    contactable: boolean;
    /** Why this was dropped, when kind === 'ignore'. */
    ignoreReason?: string;
    /** Cazoo sends the same lead two or three times within seconds; this is what tells them apart. */
    correlationId?: string;
    /** Missed-call length, where the platform reports one. */
    callDurationSeconds?: number;
    /** Car Dealer 5 "Payment Failed" — alert only, never a customer reply. */
    paymentFailed?: boolean;
    /** Free text for the router's fuzzy stock match when no reg or stock id was given. */
    vehicleHint?: string;
    /** Why the original email could not be delivered, when kind === 'bounce'. */
    bounceReason?: string;
}

export interface RawEmail {
    from: string;
    subject: string;
    text: string;
    html?: string;
    /** The To header. A website receipt is addressed to the customer with the
     *  dealership only on copy, so this can be the one place their email appears. */
    to?: string;
    messageId?: string;
    threadId?: string;
    /** The dealership's own address, so its own sent mail is never parsed as a lead. */
    selfEmail?: string;
    /** Gmail's X-Failed-Recipients header, when this is a bounce. */
    failedRecipient?: string;
    /** Auto-Submitted header (DSN / vacation / auto-reply). */
    autoSubmitted?: string;
}

// --- Address handling -------------------------------------------------------

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** "Paul Summerfield <paul@x.com>" -> { name, address } */
export const parseFromHeader = (from: string): { name: string; address: string } => {
    const raw = (from || '').trim();
    const angled = raw.match(/^(.*?)<([^>]+)>\s*$/);

    if (angled) {
        return {
            name: angled[1].trim().replace(/^["']|["']$/g, '').trim(),
            address: angled[2].trim().toLowerCase(),
        };
    }

    const bare = raw.match(EMAIL_RE);
    return { name: '', address: bare ? bare[0].toLowerCase() : '' };
};

/** Platform robots and mailer daemons. Answering any of these reaches nobody. */
export const isNoReplyAddress = (address: string): boolean => {
    const addr = (address || '').toLowerCase();
    if (!addr) return true;

    const local = addr.split('@')[0];
    const domain = addr.split('@')[1] || '';

    if (/(^|[._+-])(no-?reply|donotreply|do-not-reply|dealer-?leads|dealerleads|notification|notifications|mailer-daemon|bounce|postmaster|automated)/.test(local)) {
        return true;
    }

    return PLATFORM_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`));
};

const PLATFORM_DOMAINS = [
    'messages.cargurus.com',
    'cargurus.com',
    'info.cazoo.co.uk',
    'cazoo.co.uk',
    'partners.gumtree.com',
    'gumtree.com',
    'cardealer5.co.uk',
    // Car Dealer 5's lead forwarder (d1917-…@mg.cd5.uk) and its reply relay. It
    // sends every website lead, each for a different customer, so it is never
    // the customer and never a reply address.
    'mg.cd5.uk',
    'cd5.uk',
];

/** Senders that never produce a lead, whatever the body says. */
const IGNORE_SENDERS = [
    /@jigsawfinance\./i,
    /partsinmotion/i,
    /facebookmail\.com$/i,
    /dealerforecourt/i,
    /totalcarcheck/i,
    /^marketing(-info)?@/i,
    /^newsletter@/i,
    /^promo@/i,
    /^mailer@/i,
    /@(?:sendgrid|mailchimp|constantcontact|intercom|hubspot|mailgun)\./i,
    /^sales@cardealer5\.co\.uk$/i,
];

const IGNORE_SUBJECTS = [
    /^lead intelligence:/i,
    /^re:\s*lead intelligence:/i,
];

/**
 * BCA, the auction house. Its invoice copies come from an address that is not always
 * on bca.com, and the body names bcabuyersupport@bca.com, so they were taken for a
 * customer, given a Dave draft and left pinned to a Lexus from an older purchase —
 * on a Peugeot Steve had just bought (25 Sep).
 */
const BCA_SENDER_RE = /@(?:[\w-]+\.)*bca(?:-group)?\.(?:com|co\.uk)$/i;
const BCA_BODY_RE = /BCA Buy Online Invoice|Thank you for choosing to buy from BCA/i;

/**
 * A BCA mail about a car Steve bought: an invoice, or anything with a reg in the
 * title ("Fw: SV66 OAS - Collection"). The title is where the car is — the invoice
 * body never names it. Newsletters and saved-search alerts stay ignored.
 */
const parseBcaPurchase = (raw: RawEmail): ParsedLead | null => {
    const subject = clean(raw.subject);
    const reg = regFromField(subject);
    if (!reg && !/invoice|purchase|collection/i.test(subject)) return null;

    return {
        source: 'Other',
        kind: 'supplier',
        name: 'BCA',
        firstName: 'BCA',
        vehicle: reg ? { reg } : undefined,
        message: `[BCA: ${subject || 'email'}]`,
        replyTargets: [],
        replyTo: { channel: 'email', address: '' },
        contactable: false,
    };
};

// --- Small shared helpers ---------------------------------------------------

const clean = (s?: string): string => (s || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();

const firstNameOf = (name?: string): string | undefined => {
    const first = clean(name).split(/\s+/)[0];
    return first || undefined;
};

/** Title-cases the all-lowercase names the platforms hand over ("paul summerfield"). */
const tidyName = (name?: string): string | undefined => {
    const value = clean(name);
    if (!value) return undefined;
    if (value !== value.toLowerCase() && value !== value.toUpperCase()) return value;
    return value.replace(/\b[a-z]/g, c => c.toUpperCase());
};

const parsePrice = (raw?: string): number | undefined => {
    const m = (raw || '').match(/£\s*([\d,]+(?:\.\d{2})?)/);
    if (!m) return undefined;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
};

/** Current, prefix and suffix style UK plates. Deliberately narrow — a loose pattern
 *  matches half the words in an email body. */
const UK_REG_RE = /\b([A-Z]{2}[0-9]{2}\s?[A-Z]{3}|[A-Z][0-9]{1,3}\s?[A-Z]{3}|[A-Z]{3}\s?[0-9]{1,3}[A-Z])\b/;

/**
 * A plate written in free text. Only capitals count: upper-casing the body first
 * turned "V2 Pro" into V2PRO and "Z4 and" into Z4AND (5 Oct). Whether a plate is
 * one of ours is the stock matcher's call, not this one's.
 */
export const findReg = (...sources: Array<string | undefined>): string | undefined => {
    for (const source of sources) {
        const m = (source || '').match(UK_REG_RE);
        if (m) return m[1].replace(/\s/g, '');
    }
    return undefined;
};

/** A plate from a field a platform labels as one (CarGurus "Reg:", a Cazoo or BCA subject), in any case. */
const regFromField = (...sources: Array<string | undefined>): string | undefined =>
    findReg(...sources.map(source => (source || '').toUpperCase()));

const POSTCODE_RE = /\b([A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2})\b/i;

const findPostcode = (text: string): string | undefined => {
    const m = (text || '').toUpperCase().match(POSTCODE_RE);
    return m ? m[1] : undefined;
};

/** Emails written in the body, ignoring the platform's own and our own. */
const bodyEmails = (text: string, selfEmail?: string): string[] => {
    const found = (text || '').match(EMAIL_RE) || [];
    const self = (selfEmail || '').toLowerCase();

    return Array.from(new Set(found.map(e => e.toLowerCase())))
        .filter(e => e !== self && !isNoReplyAddress(e));
};

const firstPhone = (...sources: Array<string | undefined>): string | undefined => {
    for (const source of sources) {
        const found = extractUkMobiles(source || '');
        if (found.length) return found[0];
    }
    return undefined;
};

// --- Reply routing ----------------------------------------------------------

/**
 * Where a reply is allowed to go.
 *
 * Email first when we have a personal address, because the customer chose to write;
 * a mobile becomes a WhatsApp target, and SMS is only offered when nothing else exists
 * (it costs money and lands in the spam folder of a phone).
 */
const buildReplyTargets = (email: string | undefined, phone: string | undefined): ReplyTarget[] => {
    const targets: ReplyTarget[] = [];

    if (email && !isNoReplyAddress(email)) targets.push({ channel: 'email', address: email.toLowerCase() });
    if (phone) targets.push({ channel: 'whatsapp', address: toE164(phone) }, { channel: 'sms', address: toE164(phone) });

    return targets;
};

const withReply = (lead: Omit<ParsedLead, 'replyTo' | 'replyTargets' | 'contactable'>): ParsedLead => {
    const targets = buildReplyTargets(lead.email, lead.phone);

    return {
        ...lead,
        replyTargets: targets,
        replyTo: targets[0] || { channel: 'email', address: '' },
        contactable: targets.length > 0,
    };
};

const ignored = (source: LeadPlatform, reason: string): ParsedLead => ({
    source,
    kind: 'ignore',
    message: '',
    ignoreReason: reason,
    replyTargets: [],
    replyTo: { channel: 'email', address: '' },
    contactable: false,
});

// --- Spam heuristic ---------------------------------------------------------

const TRUSTED_LINK_DOMAINS = [
    ...PLATFORM_DOMAINS,
    'radlettcarsales.com',
    'motors.co.uk',
    'autotrader.co.uk',
    'ebay.co.uk',
];

const linkDomains = (text: string): string[] => {
    const urls = (text || '').match(/https?:\/\/[^\s<>"')]+/gi) || [];
    return urls.map(url => {
        try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
    }).filter(Boolean);
};

/**
 * The shape a phishing lead takes: a body that exists only to get a link clicked, with
 * no plain way to answer the "customer". A real enquiry either has no links at all or
 * arrives with an address and a number written out in full.
 */
export const looksLikeSpam = (text: string, html: string | undefined, selfEmail?: string): boolean => {
    const body = `${text || ''}\n${html || ''}`;

    const offPlatform = linkDomains(body).filter(
        host => !TRUSTED_LINK_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))
    );
    if (!offPlatform.length) return false;

    const hasPlainContact = bodyEmails(text || '', selfEmail).length > 0 || extractUkMobiles(text || '').length > 0;
    return !hasPlainContact;
};

/**
 * Direct mail to the sales inbox. Platform leads never reach this — they are
 * already about a car. A human writing "is it still available?" is in; an SEO
 * pitch or a mailing-list blast is not. Bare words like "car" or "dealership"
 * are not enough on their own, because marketing mail uses them too.
 */
const CAR_MAKES = [
    'ford', 'bmw', 'audi', 'vw', 'volkswagen', 'mercedes', 'merc', 'toyota', 'honda', 'nissan',
    'vauxhall', 'peugeot', 'renault', 'kia', 'hyundai', 'mazda', 'mini', 'fiat', 'seat', 'skoda',
    'volvo', 'jaguar', 'porsche', 'maserati', 'tesla', 'citroen', 'dacia', 'suzuki', 'lexus',
    'jeep', 'cupra', 'ferrari', 'bentley', 'subaru', 'land rover', 'range rover', 'alfa',
];

const CUSTOMER_ENQUIRY_RE = new RegExp(
    [
        '\\b(?:mot|mileage|ulez|test[- ]?drive|part[- ]?ex(?:change)?|\\bpx\\b)\\b',
        '\\b(?:viewing|warranty|service history)\\b',
        '\\b(?:still available|in stock|for sale|advertised|interested in)\\b',
        '\\b(?:opening hours?|what time (?:are you|do you)|are you open)\\b',
        `\\b(?:${CAR_MAKES.join('|')})\\b`,
    ].join('|'),
    'i'
);

const MARKETING_RE = new RegExp(
    [
        'unsubscribe',
        'view (?:this )?email in (?:your )?browser',
        'manage (?:your )?preferences',
        'this is an automated (?:message|email)',
        'you(?:\'ve| have) been selected',
        '\\b(?:seo|backlinks?|guest posts?)\\b',
        'rank(?:ing)? on google',
        'increase your (?:sales|leads|traffic|visibility)',
        'grow your (?:dealership|business|sales)',
        'dear (?:sir|partner|dealer|valued)',
        '\\b(?:bitcoin|cryptocurrency|viagra|cialis)\\b',
        'mailing list',
        'limited[- ]time offer',
        'click here to (?:claim|verify|confirm|unsubscribe)',
    ].join('|'),
    'i'
);

export const isSalesDeskRelevant = (subject: string, text: string): boolean => {
    if (findReg(subject, text)) return true;
    return CUSTOMER_ENQUIRY_RE.test(`${subject || ''}\n${text || ''}`);
};

export const isGenericMarketing = (subject: string, text: string, from?: string): boolean => {
    if (from && /^(newsletter|promo|marketing|mailer|noreply)@/i.test(from)) return true;
    return MARKETING_RE.test(`${subject || ''}\n${text || ''}`);
};

// --- Per-source parsers -----------------------------------------------------

/**
 * "*Name:* paul summerfield" — CarGurus writes every field this way in its text
 * part; the HTML-derived fallback (htmlToText) and newer mails carry the same
 * labels without the asterisks, so both forms are accepted.
 */
const starField = (text: string, label: string): string => {
    const starred = new RegExp(`\\*\\s*${label}\\s*:?\\s*\\*\\s*([^\\n]*)`, 'i');
    const plain = new RegExp(`(?:^|\\n)\\s*${label}\\s*:\\s*([^\\n]*)`, 'i');
    const sameLine = clean(text.match(starred)?.[1] ?? text.match(plain)?.[1]);
    return sameLine || fieldBlock(text, label).split('\n').map(clean).find(Boolean) || '';
};

/**
 * The HTML rendering of a CarGurus lead puts every label and its value in separate
 * table cells, so after htmlToText they sit on separate lines. This takes everything
 * after "*Label:*" up to the next label or section heading, which is also how the
 * multi-line chat transcript under "Customer comments" is captured whole.
 */
const fieldBlock = (text: string, label: string): string => {
    const re = new RegExp(
        `\\*?\\s*${label}\\s*:\\s*\\*?[ \\t]*\\n?([\\s\\S]*?)(?=\\n\\s*\\*[^*\\n]{1,40}:\\*|\\n\\s*\\*(?:Listing|Seller details|Contact information)\\*|\\n\\s*(?:Reg|Vehicle|Stock number|Listing price)\\s*:|\\n\\s*View on CarGurus|$)`,
        'i'
    );
    return (text.match(re)?.[1] || '').replace(/\r/g, '').trim();
};

/**
 * A readable text body out of an HTML-only email, keeping the line structure the
 * field parsers rely on and marking bold labels the way CarGurus' text part does.
 */
export const htmlToText = (html?: string): string => {
    if (!html) return '';
    const $ = cheerio.load(html);
    $('style, script, head').remove();
    $('b, strong').each((_, el) => { $(el).replaceWith(`*${$(el).text().trim()}*`); });
    $('br').replaceWith('\n');
    $('p, div, tr, li, h1, h2, h3, h4, h5, h6, table').each((_, el) => { $(el).append('\n'); });
    $('td, th').each((_, el) => { $(el).append(' '); });
    return $.root().text()
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

/** First email address in a body that is not ours and not a platform robot. */
const firstCustomerEmail = (text: string, selfEmail?: string): string | undefined => {
    const all = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || [];
    return all
        .map(e => e.toLowerCase())
        .find(e => e !== (selfEmail || '').toLowerCase() && !PLATFORM_DOMAINS.some(d => e.endsWith(`@${d}`) || e.endsWith(`.${d}`)));
};

/**
 * CarGurus' chat-bot leads arrive as "Comments: <summary> Transcript: (Consumer): …
 * (Agent): …". The customer's own words are the (Consumer) turns; the menu picks,
 * their name and their email are things the bot asked for, not what they want.
 * What is left, with the summary in front, is the enquiry.
 */
export const decipherCarGurusTranscript = (comments: string, name?: string, email?: string): string => {
    const m = comments.match(/^(?:Comments:\s*)?([\s\S]*?)\s*Transcript:\s*([\s\S]*)$/i);
    if (!m) return comments;
    const summary = clean(m[1]).replace(/\.$/, '');
    const turns = Array.from(m[2].matchAll(/\(Consumer\):\s*([\s\S]*?)(?=\s*\((?:Consumer|Agent)\):|$)/gi))
        .map(t => clean(t[1]).replace(/\(CarGurus deal rating[^)]*\)\s*$/i, '').trim());
    const noise = (turn: string): boolean =>
        !turn
        || /^[\d)\s.,]+$/.test(turn)
        || /^(vehicle details|check availability|test drive|something else|yes|no|email|phone|sms|text|email or sms)$/i.test(turn)
        || (!!name && turn.toLowerCase() === name.toLowerCase())
        || (!!email && turn.toLowerCase() === email.toLowerCase())
        || /^regarding this /i.test(turn);
    const said = turns.filter(t => !noise(t));
    const parts = [
        summary ? `${summary}.` : '',
        said.length ? `In their words: "${said.join(' ')}"` : '',
    ].filter(Boolean);
    return clean(parts.join(' ')) || comments;
};

const parseCarGurusLead = (raw: RawEmail): ParsedLead => {
    const text = raw.text || '';

    const name = tidyName(starField(text, 'Name'));
    const email = clean(starField(text, 'Email')).toLowerCase().match(/[\w.+-]+@[\w.-]+/)?.[0]
        || firstCustomerEmail(text, raw.selfEmail);
    const phone = firstPhone(starField(text, 'Phone number'), starField(text, 'Phone'));
    const postcode = findPostcode(starField(text, 'Postcode')) || undefined;

    const comments = clean(fieldBlock(text, 'Customer comments').replace(/\n+/g, ' ')) || starField(text, 'Comments');
    const preference = comments.match(/I prefer to be contacted by:\s*(Email|Phone|Text|SMS)/i)?.[1];

    // Everything from "I prefer to be contacted by" onwards is CarGurus' own boilerplate,
    // repeated twice and followed by their deal-rating note. Chat-bot leads carry a
    // transcript instead, boiled down to what the customer actually asked for.
    const message = decipherCarGurusTranscript(
        clean(
            comments
                .split(/I prefer to be contacted by:/i)[0]
                .replace(/\(CarGurus deal rating[^)]*\)\s*$/i, '')
        ),
        name,
        email
    );

    const vehicleLine = text.match(/\bVehicle:\s*(.+?)\s+Stock number:/i)?.[1] || starField(text, 'Vehicle');
    const headline = text.match(/###\s*You have a new customer lead for your\s*(.+?)\s*###/i)?.[1]
        || text.match(/You have a new customer lead for your\s*([^\n]+)/i)?.[1];

    const vehicle = {
        title: clean(vehicleLine || headline) || undefined,
        reg: regFromField(text.match(/\bReg:\s*([A-Z0-9 ]{2,10})/i)?.[1] || starField(text, 'Reg')),
        stockId: (text.match(/Stock number:\s*(\d+)/i)?.[1] || starField(text, 'Stock number')).match(/\d+/)?.[0],
        price: parsePrice(text.match(/Listing price:\s*(£[\d,]+)/i)?.[1] || starField(text, 'Listing price')),
    };

    return withReply({
        source: 'CarGurus',
        kind: 'enquiry',
        name,
        firstName: firstNameOf(name),
        email,
        phone,
        postcode,
        vehicle,
        message,
        preferredContact: preference
            ? (/email/i.test(preference) ? 'email' : 'phone')
            : undefined,
    });
};

const parseCarGurusPhoneLead = (raw: RawEmail): ParsedLead => {
    const text = raw.text || '';
    const phone = firstPhone(text.match(/^\s*Phone:\s*(.+)$/mi)?.[1], text);

    const duration = text.match(/Duration:\s*(?:(\d+)\s*minutes?)?[,\s]*(?:(\d+)\s*seconds?)?/i);
    const seconds = duration
        ? Number(duration[1] || 0) * 60 + Number(duration[2] || 0)
        : undefined;

    return withReply({
        source: 'CarGurus',
        kind: 'phone_lead',
        phone,
        message: '',
        callDurationSeconds: seconds,
        preferredContact: 'phone',
    });
};

/** Cazoo's canned "the buyer wants to know..." lines, kept in the message but flagged
 *  so the brain knows they were injected rather than typed. */
const cazooFlags = (lines: string[], enquiryType?: string): ParsedLead['flags'] => {
    const haystack = `${lines.join(' ')} ${enquiryType || ''}`;
    const flags: NonNullable<ParsedLead['flags']> = {};

    if (/test\s*drive/i.test(haystack)) flags.testDrive = true;
    if (/service\s*history/i.test(haystack)) flags.wantsServiceHistory = true;
    if (/photo/i.test(haystack)) flags.wantsMorePhotos = true;
    if (/video/i.test(haystack)) flags.wantsVideo = true;

    // Scan line by line, then sentence by sentence — the part-exchange question is one
    // sentence and dragging the tail of the previous one into it reads as nonsense.
    const partExRe = /\b(?:px|part[\s-]?ex(?:change)?)\b/i;
    for (const line of lines) {
        if (!partExRe.test(line)) continue;
        const sentence = line.split(/(?<=[.?!])\s+/).find(s => partExRe.test(s)) || line;
        flags.partEx = clean(sentence);
        break;
    }

    return Object.keys(flags).length ? flags : undefined;
};

/**
 * Cazoo's plaintext is a run of labelled blocks. Reading it line by line beats one big
 * regex: an empty "Customer message" is normal (a Test drive enquiry has no words) and
 * a span-matching regex silently swallows the next heading when the block is empty.
 */
const blockAfter = (text: string, heading: RegExp, stops: RegExp[]): string[] => {
    const lines = text.split('\n');
    const start = lines.findIndex(line => heading.test(line.trim()));
    if (start === -1) return [];

    const out: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (stops.some(stop => stop.test(line))) break;
        if (line) out.push(clean(line));
    }
    return out;
};

const CAZOO_HEADINGS = [
    /^Customer message$/i,
    /^Enquiry type$/i,
    /^Customer details$/i,
    /^View vehicle advert\b/i,
    /^CorrelationID:/i,
    /^Call\b.*\(\s*tel:/i,
    /^Email\b.*\(\s*\S+@/i,
];

const parseCazooEnquiry = (raw: RawEmail): ParsedLead => {
    const text = raw.text || '';
    const subject = raw.subject || '';

    // "Enquiry - Vauxhall Astra GTC BV17OSY - Sam"
    const subjectParts = subject.match(/^\s*Enquiry\s*-\s*(.+)\s*-\s*([^-]*)$/i);
    const vehicleAndReg = clean(subjectParts?.[1]);
    const subjectFirstName = clean(subjectParts?.[2]) || undefined;

    const reg = regFromField(vehicleAndReg, subject);
    const title = clean(reg ? vehicleAndReg.replace(new RegExp(reg, 'i'), '') : vehicleAndReg) || undefined;

    const enquiryType = blockAfter(text, /^Enquiry type$/i, CAZOO_HEADINGS)[0] || undefined;

    const messageLines = blockAfter(text, /^Customer message$/i, CAZOO_HEADINGS);
    let message = messageLines.join(' ');

    const name = tidyName(blockAfter(text, /^Customer details$/i, CAZOO_HEADINGS)[0]);

    const email = bodyEmails(text, raw.selfEmail)[0];
    // "( tel:07840143700 )" — and often "( tel: )" with nothing in it.
    const phone = firstPhone(text.match(/\(\s*tel:\s*([+0-9][0-9\s]*)\)/i)?.[1], text);

    const url = text.match(/View vehicle advert\s*\(\s*(https?:\/\/[^\s)]+)\s*\)/i)?.[1];
    const correlationId = clean(text.match(/CorrelationID:\s*(\S+)/i)?.[1]) || undefined;

    const flags = cazooFlags(messageLines, enquiryType);

    // A "Test drive" enquiry arrives with no words at all; saying nothing to the brain
    // would lose the one fact the email carried.
    if (!message && flags?.testDrive) message = `Wants a test drive of the ${title || 'car'}`;

    return withReply({
        source: 'Cazoo',
        kind: 'enquiry',
        name: name || (subjectFirstName ? tidyName(subjectFirstName) : undefined),
        firstName: firstNameOf(name) || subjectFirstName,
        email,
        phone,
        vehicle: {
            title,
            reg,
            url,
            price: parsePrice(text.match(/Listed at\s*(£[\d,]+)/i)?.[1]),
        },
        message,
        enquiryType,
        flags,
        correlationId,
    });
};

const parseGumtreeMissedCall = (raw: RawEmail): ParsedLead => {
    const text = raw.text || '';
    const phone = firstPhone(
        text.match(/reach the customer on\s*([+0-9][0-9\s]{6,})/i)?.[1],
        text.match(/Call back\s*([+0-9][0-9\s]{6,})/i)?.[1],
        text
    );

    return withReply({
        source: 'Cazoo',
        kind: 'missed_call',
        phone,
        message: '',
        preferredContact: 'phone',
    });
};

/** The dealership's own site sends HTML only; its plaintext part says "use an HTML viewer". */
const parseCarDealer5Enquiry = (raw: RawEmail): ParsedLead => {
    const $ = cheerio.load(raw.html || '');

    const link = $('a[href*="/cars/"]').first();
    const url = link.attr('href') || undefined;
    const stockId = url
        ? url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() || undefined
        : undefined;

    const fields: Record<string, { text: string; html: ReturnType<typeof $> }> = {};
    $('table.personal-info tr').each((_i, row) => {
        const cells = $(row).find('td, th');
        if (cells.length < 2) return;
        const label = clean($(cells[0]).text()).replace(/:$/, '').toLowerCase();
        if (label) fields[label] = { text: clean($(cells[1]).text()), html: $(cells[1]) };
    });

    const name = tidyName(fields['name']?.text);
    const email = (fields['email']?.html.find('a[href^="mailto:"]').attr('href') || '')
        .replace(/^mailto:/i, '').trim().toLowerCase() || bodyEmails(fields['email']?.text || '', raw.selfEmail)[0];
    const phone = firstPhone(
        (fields['phone']?.html.find('a[href^="tel:"]').attr('href') || '').replace(/^tel:/i, ''),
        fields['phone']?.text
    );

    const gdpr = (fields['gdpr contact']?.text || fields['contact']?.text || '').toLowerCase();

    const title = clean($('h2').first().text()) || undefined;
    const reg = regFromField(raw.subject.match(/\(([A-Z0-9\s]{2,10})\)/i)?.[1], raw.subject);

    // The form's purpose is in the subject ("Book A Test Drive - …", "Enquiry - …"),
    // and a test-drive form carries the slot they picked. Both are the enquiry, even
    // when the free-text Message box is empty — and it usually is.
    const purpose = /test\s*drive/i.test(raw.subject) ? 'test drive'
        : /reserve|reservation/i.test(raw.subject) ? 'reservation'
            : /finance/i.test(raw.subject) ? 'finance'
                : /part[\s-]*ex|valuation/i.test(raw.subject) ? 'part exchange'
                    : undefined;
    const date = clean(fields['preferred date']?.text || fields['date']?.text);
    const time = clean(fields['preferred time']?.text || fields['time']?.text);
    const slot = [date, time].filter(Boolean).join(' at ');
    const car = title ? `${title}${reg ? ` (${reg})` : ''}` : 'the car';
    const opener = purpose === 'test drive'
        ? `I'd like to book a test drive of the ${car}${slot ? `, preferably on ${slot}` : ''}.`
        : purpose === 'reservation' ? `I'd like to reserve the ${car}.`
            : purpose === 'finance' ? `I'd like to look at finance on the ${car}.`
                : purpose === 'part exchange' ? `I'd like a part-exchange valuation against the ${car}.`
                    : '';
    const freeText = clean(fields['message']?.text);
    const message = [opener, freeText].filter(Boolean).join(' ');

    return withReply({
        source: 'Website',
        kind: 'enquiry',
        name,
        firstName: firstNameOf(name),
        email: email || undefined,
        phone,
        vehicle: {
            title,
            price: parsePrice($('h3').first().text()),
            reg,
            stockId: stockId && /^\d+$/.test(stockId) ? stockId : undefined,
            url,
        },
        message,
        preferredContact: gdpr.includes('email') ? 'email' : gdpr.includes('phone') ? 'phone' : undefined,
    });
};

const parseCarDealer5Reservation = (raw: RawEmail, paymentFailed: boolean): ParsedLead => {
    const body = `${raw.text || ''}\n${raw.html ? cheerio.load(raw.html).text() : ''}`;

    // The receipt is written to the customer, not about them: the name is in the
    // greeting ("Hi Jamie Sanderson,") and their address is the To header, with the
    // dealership only on copy. Neither has a Customer: line to find (31 Aug).
    const name = tidyName(body.match(/(?:Customer|Name)\s*:?\s*(.+)/i)?.[1])
        || tidyName(body.match(/\bHi\s+([^,\n]{2,60}),/)?.[1]);
    const toAddress = parseFromHeader(raw.to || '').address;
    const email = bodyEmails(body, raw.selfEmail)[0]
        || (toAddress && toAddress !== (raw.selfEmail || '').toLowerCase() && !isNoReplyAddress(toAddress)
            ? toAddress
            : undefined);
    const phone = firstPhone(body);

    const lead = withReply({
        source: 'Website',
        kind: 'reservation',
        name,
        firstName: firstNameOf(name),
        email,
        phone,
        vehicle: {
            title: raw.html ? clean(cheerio.load(raw.html)('h2').first().text()) || undefined : undefined,
            reg: regFromField(raw.subject, body),
        },
        message: '',
        paymentFailed: paymentFailed || undefined,
    });

    // A failed payment is a note for Steve, never a message to the customer.
    if (paymentFailed) return { ...lead, contactable: false, replyTargets: [] };
    return lead;
};

/** Car Dealer 5's whole text part on an HTML-only mail. */
const HTML_VIEWER_STUB_RE = /^\s*(?:to view (?:this|the) message,?\s*)?please use an html (?:compatible )?(?:email )?viewer[.!]?\s*$/i;

/**
 * A customer filled in a form on the website: the HTML carries the customer
 * table, or the subject says what the form was for. Anything else from Car
 * Dealer 5 (the weekly report, newsletters) is not a lead.
 */
const isCarDealer5EnquiryForm = (raw: RawEmail): boolean =>
    cheerio.load(raw.html || '')('table.personal-info').length > 0
    || /\b(?:enquiry|test\s*drive|reserv\w*|finance|part[\s-]*ex\w*|valuation)\b/i.test(raw.subject || '');

/** "Label: value" on a line of its own. The first one wins. */
const lineField = (text: string, label: string): string =>
    clean(text.match(new RegExp(`^[ \\t]*${label}:[ \\t]*(.*)$`, 'mi'))?.[1]);

/** CarGurus' comment with its "I prefer to be contacted by" and deal-rating boilerplate taken off. */
const carGurusComment = (comment: string): string =>
    clean(comment.split(/I prefer to be contacted by:/i)[0].replace(/\((?:CarGurus|Deal rating)[^)]*\)\s*$/i, ''));

const preferenceOf = (comment: string): ParsedLead['preferredContact'] => {
    const said = comment.match(/I prefer to be contacted by:\s*(Email|Phone|Call|Text|SMS)/i)?.[1];
    if (!said) return undefined;
    return /email/i.test(said) ? 'email' : 'phone';
};

/**
 * "Cargurus Vehicle Enquiry" from noreply@cardealer5.co.uk: a CarGurus lead that
 * Car Dealer 5 re-sends as a labelled list in the HTML, behind a text part that
 * only says to use an HTML viewer. It used to come through with no car and no
 * customer address at all (5 Oct).
 */
const parseCarDealer5LeadSummary = (raw: RawEmail): ParsedLead => {
    const text = raw.text || '';
    const name = tidyName(lineField(text, 'Customer'));
    const comment = clean((text.split(/^[ \t]*Message:[ \t]*/mi)[1] || '').replace(/\n+/g, ' '));
    const price = Number(lineField(text, 'Price').replace(/[^\d.]/g, ''));

    return withReply({
        source: /cargurus/i.test(lineField(text, 'Source')) ? 'CarGurus' : 'Website',
        kind: 'enquiry',
        name,
        firstName: firstNameOf(name),
        email: bodyEmails(lineField(text, 'Email'), raw.selfEmail)[0],
        phone: firstPhone(lineField(text, 'Phone')),
        vehicle: {
            title: lineField(text, 'Vehicle') || undefined,
            reg: regFromField(lineField(text, 'Registration')),
            price: Number.isFinite(price) && price > 0 ? price : undefined,
        },
        message: carGurusComment(comment),
        preferredContact: preferenceOf(comment),
    });
};

/** The last all-digit segment of a radlettcarsales.com car link: the stock id. */
const stockIdFromUrl = (url: string): string | undefined => {
    const id = url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() || '';
    return /^\d+$/.test(id) ? id : undefined;
};

/**
 * Car Dealer 5's lead forwarder, d1917-radlettcarsales-com@mg.cd5.uk: every website
 * and CarGurus-via-website lead, one customer per mail, all from the same sender.
 * Read as that sender, 29 different customers became one conversation whose car
 * flipped with every new lead (5 Oct). The customer is the Customer / Email / Phone
 * in the body.
 *
 * The car wanted is the HTML's "Vehicle … Stock #" block, else the link, the
 * labelled fields or the subject. On a part-exchange form the labelled Make /
 * Model / Registration are the customer's OWN car: they go into the message and
 * flags.partEx, never into vehicle.
 */
const parseCd5Forward = (raw: RawEmail): ParsedLead => {
    const text = raw.text || '';
    if (!/^[ \t]*Customer:/mi.test(text) && !/\bLead #\d+/i.test(text)) return ignored('Other', 'cd5_not_a_lead');

    const html = htmlToText(raw.html);
    const field = (label: string): string => lineField(text, label);

    const enquiryType = field('Enquiry type') || undefined;
    const partEx = /part[\s-]*ex/i.test(enquiryType || '')
        || /^[ \t]*Part exchange requested:[ \t]*Yes/mi.test(text)
        || /^[ \t]*Interested in:[ \t]*Part[\s-]*Ex/mi.test(text);

    const block = html.match(/(?:^|\n)[ \t]*Vehicle[ \t]*\n[ \t]*(?:(\d{4})[ \t]+)?([A-Z0-9]{2,8})?[ \t]*\n[ \t]*([^\n]+?)[ \t]*\n[ \t]*Stock #[ \t]*(\d+)/);
    const subjectCar = clean(raw.subject.match(/^\s*New website enquiry\s*-\s*.+?\s*-\s*(.+)$/i)?.[1]) || undefined;
    // "Vehicle: Vauxhall, GTC, 1.4 i Turbo Limited Edition, BV17OSY, 2017, 53000, 4995"
    const detail = field('Vehicle').split(',').map(part => clean(part));

    let title: string | undefined;
    let reg: string | undefined;
    let stockId = block?.[4];
    if (partEx) {
        title = block?.[3] || field('Part exchange vehicle').replace(/\s*\(\d{4}\)\s*$/, '') || subjectCar;
        reg = block?.[2] ? regFromField(block[2]) : undefined;
        stockId = stockId || stockIdFromUrl(field('Part exchange vehicle URL'));
    } else {
        const makeModel = clean(`${field('Make')} ${field('Model')}`);
        title = block?.[3] || field('Title') || subjectCar || makeModel || (detail.length > 1 ? clean(`${detail[0]} ${detail[1]}`) : undefined);
        reg = regFromField(block?.[2])
            || regFromField(field('Registration'))
            || regFromField(field('Reg plate1'))
            || detail.map(part => regFromField(part)).find(Boolean);
        stockId = stockId || stockIdFromUrl(field('Vehicle url'));
    }

    // Their own car, in their words, for the brain and the desk. Never the car wanted.
    const ownCar = partEx
        ? clean([
            [field('Year'), field('Make'), field('Model')].filter(Boolean).join(' '),
            field('Registration') ? `(${field('Registration').toUpperCase()})` : '',
            field('Mileage') ? `, ${field('Mileage')}` : '',
            field('Desired value') ? `, hoping for £${field('Desired value').replace(/[^\d]/g, '')}` : '',
        ].join(' ').replace(/\s+,/g, ','))
        : '';

    const comment = clean(
        (text.match(/(?:^|\n)[ \t]*Message:[ \t]*([\s\S]*?)(?=\n[ \t]*\n|\n[ \t]*(?:Open lead|Reply email|Enquiry details)\b|$)/i)?.[1] || '')
            .replace(/\n+/g, ' ')
    );
    const said = carGurusComment(comment);
    const car = title ? `the ${title}` : 'the car';
    const date = field('Preferred date');
    const time = field('Preferred time');
    const slot = [date, time].filter(Boolean).join(' at ');
    const opener = partEx
        ? `I'd like a part-exchange valuation against ${car}.${ownCar ? ` My car: ${ownCar}.` : ''}`
        : /test\s*drive/i.test(`${enquiryType || ''} ${raw.subject}`)
            ? `I'd like to book a test drive of ${car}${slot ? `, preferably on ${slot}` : ''}.`
            : '';

    const name = tidyName(field('Customer'));
    const preferred = html.match(/Preferred contact:\s*(Email|Phone|Call|Text|SMS|WhatsApp)/i)?.[1];

    return withReply({
        source: /cargurus/i.test(enquiryType || '') ? 'CarGurus' : 'Website',
        kind: 'enquiry',
        name,
        firstName: firstNameOf(name),
        email: bodyEmails(field('Email'), raw.selfEmail)[0],
        phone: firstPhone(field('Phone')),
        vehicle: {
            title: title || undefined,
            reg: reg || undefined,
            stockId: stockId || undefined,
        },
        message: [opener, said].filter(Boolean).join(' '),
        enquiryType,
        ...(partEx ? { flags: { partEx: ownCar ? `Part-exchange: ${ownCar}` : 'Part-exchange' } } : {}),
        preferredContact: preferred ? (/email/i.test(preferred) ? 'email' : /whatsapp/i.test(preferred) ? 'whatsapp' : 'phone') : preferenceOf(comment),
    });
};

const BOUNCE_SUBJECT_RE =/delivery status notification|undeliverable|returned mail|mail delivery failed|failure notice|delivery failure|delivery has failed/i;
const BOUNCE_SENDER_RE = /^(mailer-daemon|postmaster|mail-daemon|noreply-dmarc)@/i;
const FAILED_RECIPIENT_RE = /(?:wasn't delivered to|was not delivered to|could(?: not|n't) be delivered to|failed recipient|final-recipient:\s*rfc822:?)\s*<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i;

const bounceReasonOf = (subject: string, text: string): string => {
    const hay = `${subject}\n${text}`;
    if (/could(?: not|n't) be found|address not found|user unknown|recipnotfound|mailbox unavailable|does not exist/i.test(hay)) {
        return 'address not found, or unable to receive mail';
    }
    if (/mailbox full|over quota|insufficient storage/i.test(hay)) return 'mailbox full';
    if (/\b(?:550|554|553)\b.*\b(?:spam|policy|blocked|rejected)\b/i.test(hay) || /rejected by the (?:server|recipient)/i.test(hay)) {
        return "rejected by the recipient's mail server";
    }
    return 'undeliverable';
};

/**
 * Gmail's Delivery Status Notification (Failure) — and the same shape from
 * Hotmail/Outlook. This is not a customer. Answering it talks to a mailer daemon
 * and, worse, Dave will draft a holding line to an address that already bounced.
 */
export const isDeliveryFailure = (raw: RawEmail): boolean => {
    const sender = parseFromHeader(raw.from).address;
    if (raw.failedRecipient) return true;
    if (BOUNCE_SENDER_RE.test(sender)) return true;
    if (BOUNCE_SUBJECT_RE.test(raw.subject || '')) return true;
    if (/^auto-(?:replied|generated)/i.test(raw.autoSubmitted || '') && /undeliverable|wasn't delivered|delivery failure/i.test(raw.text || '')) {
        return true;
    }
    return isNoReplyAddress(sender) && BOUNCE_SUBJECT_RE.test(raw.subject || '');
};

const parseDeliveryFailure = (raw: RawEmail): ParsedLead => {
    const text = raw.text || '';
    const self = (raw.selfEmail || '').toLowerCase();
    const fromHeader = parseFromHeader(raw.from).address;

    const candidates = [
        (raw.failedRecipient || '').toLowerCase(),
        (text.match(FAILED_RECIPIENT_RE)?.[1] || '').toLowerCase(),
        ...(bodyEmails(text, raw.selfEmail)),
    ].filter(e => e && e.includes('@') && e !== self && e !== fromHeader && !isNoReplyAddress(e));

    const email = candidates[0] || undefined;
    const reason = bounceReasonOf(raw.subject || '', text);
    const diagnostic = clean(text).slice(0, 500);

    return {
        source: 'Direct',
        kind: 'bounce',
        email,
        phone: firstPhone(text),
        message: diagnostic,
        bounceReason: reason,
        replyTargets: [],
        replyTo: { channel: 'email', address: email || '' },
        contactable: false,
    };
};

/**
 * Somebody who just wrote an email. The subject is kept as a vehicle hint rather than a
 * title because "Peugeot rcz" is not a stock title — the router does the fuzzy match.
 */
const parseDirectEmail = (raw: RawEmail, source: LeadPlatform): ParsedLead => {
    const sender = parseFromHeader(raw.from);
    // The Gmail adapter strips quotes off a text part, but an HTML-only reply is
    // flattened here, after that, so it arrives with the whole quoted thread on it.
    const text = stripQuotedReply(raw.text || '');

    const subject = clean(raw.subject).replace(/^(re|fw|fwd)\s*:\s*/i, '').trim();
    const email = isNoReplyAddress(sender.address) ? bodyEmails(text, raw.selfEmail)[0] : sender.address;
    const name = tidyName(sender.name) || (email ? tidyName(email.split('@')[0].replace(/[._]+/g, ' ')) : undefined);

    return withReply({
        source,
        kind: 'enquiry',
        name,
        firstName: firstNameOf(name),
        email,
        phone: firstPhone(text),
        postcode: findPostcode(text),
        vehicle: { reg: findReg(subject, text) },
        message: clean(text),
        vehicleHint: clean(`${subject} ${text}`).slice(0, 400),
    });
};

/**
 * The car off a BCA invoice PDF. The email names no car; the invoice's item line
 * does: "BW3S1J/U089BW BJ64 JBU PEUGEOT RCZ 1.6 TH R C13  AS SEEN BLACK".
 */
export const bcaInvoiceVehicle = (pdfText: string): { reg: string; title?: string } | undefined => {
    for (const line of (pdfText || '').split('\n')) {
        const m = line.toUpperCase().match(/\b([A-Z]{2}[0-9]{2}\s?[A-Z]{3})\s+([A-Z][A-Z-]+\b.*)$/);
        if (!m) continue;
        const words = m[2].split(/\s{2,}|\s+AS SEEN\b|\s+ODOMETER/)[0].trim();
        const title = words.replace(/^[A-Z-]+/, make => make.charAt(0) + make.slice(1).toLowerCase());
        return { reg: m[1].replace(/\s/g, ''), title: title || undefined };
    }
    return undefined;
};

// --- Entry point ------------------------------------------------------------

/**
 * Normalise one inbound email.
 *
 * Detection is by sender first and subject second, exactly as the formats doc describes,
 * because the subject lines collide: "Enquiry - ..." is used by both Cazoo and the
 * dealership's own website.
 */
export const parseLeadEmail = (input: RawEmail): ParsedLead => {
    // HTML-only mail (CarGurus' chat-bot leads, 27 Aug) has no text part; parsing
    // nothing would answer the platform's robot address instead of the customer.
    // Car Dealer 5's "please use an HTML compatible email viewer!" text part is the
    // same thing in disguise: everything is in the HTML.
    const raw: RawEmail = input.text?.trim() && !HTML_VIEWER_STUB_RE.test(input.text)
        ? input
        : { ...input, text: htmlToText(input.html) || input.text };
    const sender = parseFromHeader(raw.from);
    const from = sender.address;
    const subject = raw.subject || '';
    const text = raw.text || '';

    if (raw.selfEmail && from === raw.selfEmail.toLowerCase()) {
        return ignored('Other', 'own_outbound_mail');
    }
    if (IGNORE_SENDERS.some(re => re.test(from))) {
        return ignored('Other', `ignored_sender:${from}`);
    }
    if (IGNORE_SUBJECTS.some(re => re.test(subject))) {
        return ignored('Other', 'ignored_subject');
    }
    if (BCA_SENDER_RE.test(from) || BCA_BODY_RE.test(text)) {
        return parseBcaPurchase(raw) || ignored('Other', `ignored_sender:${from}`);
    }

    if (isDeliveryFailure(raw)) return parseDeliveryFailure(raw);

    if (/cargurus\.com$/i.test(from.split('@')[1] || '') || /cargurus/i.test(from)) {
        if (/phone lead/i.test(subject) || (/^\s*Phone:/mi.test(text) && /Duration:/i.test(text))) {
            return parseCarGurusPhoneLead(raw);
        }
        return parseCarGurusLead(raw);
    }

    if (/cazoo\.co\.uk$/i.test(from.split('@')[1] || '')) {
        return parseCazooEnquiry(raw);
    }

    if (/gumtree\.com$/i.test(from.split('@')[1] || '')) {
        return parseGumtreeMissedCall(raw);
    }

    if (/(^|\.)cd5\.uk$/i.test(from.split('@')[1] || '')) {
        return parseCd5Forward(raw);
    }

    if (/cardealer5\.co\.uk$/i.test(from.split('@')[1] || '')) {
        if (/payment failed/i.test(subject)) return parseCarDealer5Reservation(raw, true);
        if (/reservation successful/i.test(subject)) return parseCarDealer5Reservation(raw, false);
        if (/^\s*Lead ID:/mi.test(text) && /^\s*Customer:/mi.test(text)) return parseCarDealer5LeadSummary(raw);
        if (isCarDealer5EnquiryForm(raw)) return parseCarDealer5Enquiry(raw);
        // The weekly "Your 5-Time Last Week" report and every other mailing: its
        // first heading ("Last week at a glance") used to become the car (5 Oct).
        return ignored('Other', 'cardealer5_report');
    }

    // The "Reservation request from Cazoo" shape. It arrives from an ordinary-looking
    // personal address with a checkbox template and an off-platform link, names no
    // vehicle, and the sender name rarely matches the "Customer:" line. Steve confirmed
    // these are phishing, so they are dropped without a lead and without an alert.
    if (isCazooReservationPhish(subject, text)) {
        return ignored('Other', 'phishing:cazoo_reservation_request');
    }

    if (looksLikeSpam(text, raw.html, raw.selfEmail)) {
        return ignored('Other', 'spam:off_platform_link_no_contact');
    }

    const domain = from.split('@')[1] || '';
    if (/ebay\.co\.uk$/i.test(domain)) return parseDirectEmail(raw, 'eBay');
    if (/autotrader\.co\.uk$/i.test(domain)) return parseDirectEmail(raw, 'AutoTrader');

    if (!isSalesDeskRelevant(subject, text) && isGenericMarketing(subject, text, from)) {
        return ignored('Direct', 'spam:not_car_related');
    }

    return parseDirectEmail(raw, 'Direct');
};

const RESERVATION_CHECKBOXES = [
    /Book test drive\s*:/i,
    /Is still for sale\s*\?/i,
    /Reserve this vehicle\s*:/i,
    /Requested more photos\s*:/i,
    /Service history\s*:/i,
];

export const isCazooReservationPhish = (subject: string, text: string): boolean => {
    if (/reservation request from cazoo/i.test(subject || '')) return true;

    const hits = RESERVATION_CHECKBOXES.filter(re => re.test(text || '')).length;
    return hits >= 3 && /\bCustomer\s*:/i.test(text || '');
};

/** ParsedLead sources are platform names; the CRM has its own shorter list. */
export const crmLeadSource = (source: LeadPlatform): LeadSource => {
    switch (source) {
        case 'CarGurus': return 'CarGurus';
        case 'Cazoo': return 'Motors.co.uk';
        case 'Website': return 'Website';
        case 'eBay': return 'eBay';
        case 'AutoTrader': return 'AutoTrader';
        default: return 'Other';
    }
};

/**
 * What to say to the brain when the customer sent no words at all.
 *
 * A wordless enquiry stands in as the availability question every enquiry is. A
 * reservation must not: the customer did not ask anything, they paid, and showing
 * "Is the car still available?" over their name put words in Jamie Sanderson's
 * mouth and had Dave answering a question nobody asked (31 Aug).
 */
export const messageOrDefault = (lead: ParsedLead, vehicleTitle?: string): string => {
    if (lead.message) return lead.message;
    const car = vehicleTitle || lead.vehicle?.title || 'car';
    if (lead.kind === 'reservation') {
        const reg = lead.vehicle?.reg ? ` (${lead.vehicle.reg})` : '';
        return lead.paymentFailed
            ? `[Website receipt: tried to reserve the ${car}${reg} but the payment failed. No message from the customer.]`
            : `[Website receipt: reserved the ${car}${reg}. No message from the customer.]`;
    }
    return `Is the ${car} still available?`;
};
