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

export type LeadPlatform = 'CarGurus' | 'Cazoo' | 'Website' | 'eBay' | 'AutoTrader' | 'Direct' | 'Other';
export type LeadKind = 'enquiry' | 'phone_lead' | 'missed_call' | 'reservation' | 'reservation_request' | 'ignore';

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
}

export interface RawEmail {
    from: string;
    subject: string;
    text: string;
    html?: string;
    messageId?: string;
    threadId?: string;
    /** The dealership's own address, so its own sent mail is never parsed as a lead. */
    selfEmail?: string;
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
];

/** Senders that never produce a lead, whatever the body says. */
const IGNORE_SENDERS = [
    /@jigsawfinance\./i,
    /@(?:www\.)?bca\.com$/i,
    /partsinmotion/i,
    /facebookmail\.com$/i,
    /dealerforecourt/i,
    /totalcarcheck/i,
    /^marketing(-info)?@/i,
    /^sales@cardealer5\.co\.uk$/i,
];

const IGNORE_SUBJECTS = [
    /^lead intelligence:/i,
    /^re:\s*lead intelligence:/i,
];

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

export const findReg = (...sources: Array<string | undefined>): string | undefined => {
    for (const source of sources) {
        const m = (source || '').toUpperCase().match(UK_REG_RE);
        if (m) return m[1].replace(/\s/g, '');
    }
    return undefined;
};

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

// --- Per-source parsers -----------------------------------------------------

/** "*Name:* paul summerfield" — CarGurus writes every field this way. */
const starField = (text: string, label: string): string => {
    const re = new RegExp(`\\*\\s*${label}\\s*:?\\s*\\*\\s*([^\\n]*)`, 'i');
    return clean(text.match(re)?.[1]);
};

const parseCarGurusLead = (raw: RawEmail): ParsedLead => {
    const text = raw.text || '';

    const name = tidyName(starField(text, 'Name'));
    const email = clean(starField(text, 'Email')).toLowerCase() || undefined;
    const phone = firstPhone(starField(text, 'Phone number'));
    const postcode = findPostcode(starField(text, 'Postcode')) || undefined;

    const comments = starField(text, 'Customer comments');
    const preference = comments.match(/I prefer to be contacted by:\s*(Email|Phone|Text|SMS)/i)?.[1];

    // Everything from "I prefer to be contacted by" onwards is CarGurus' own boilerplate,
    // repeated twice and followed by their deal-rating note.
    const message = clean(
        comments
            .split(/I prefer to be contacted by:/i)[0]
            .replace(/\(CarGurus deal rating[^)]*\)\s*$/i, '')
    );

    const vehicleLine = text.match(/\bVehicle:\s*(.+?)\s+Stock number:/i)?.[1];
    const headline = text.match(/###\s*You have a new customer lead for your\s*(.+?)\s*###/i)?.[1];

    const vehicle = {
        title: clean(vehicleLine || headline) || undefined,
        reg: findReg(text.match(/\bReg:\s*([A-Z0-9 ]{2,10})/i)?.[1]),
        stockId: text.match(/Stock number:\s*(\d+)/i)?.[1],
        price: parsePrice(text.match(/Listing price:\s*(£[\d,]+)/i)?.[1]),
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

    const reg = findReg(vehicleAndReg, subject);
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

    return withReply({
        source: 'Website',
        kind: 'enquiry',
        name,
        firstName: firstNameOf(name),
        email: email || undefined,
        phone,
        vehicle: {
            title: clean($('h2').first().text()) || undefined,
            price: parsePrice($('h3').first().text()),
            reg: findReg(raw.subject.match(/\(([A-Z0-9\s]{2,10})\)/i)?.[1], raw.subject),
            stockId: stockId && /^\d+$/.test(stockId) ? stockId : undefined,
            url,
        },
        message: clean(fields['message']?.text),
        preferredContact: gdpr.includes('email') ? 'email' : gdpr.includes('phone') ? 'phone' : undefined,
    });
};

const parseCarDealer5Reservation = (raw: RawEmail, paymentFailed: boolean): ParsedLead => {
    const body = `${raw.text || ''}\n${raw.html ? cheerio.load(raw.html).text() : ''}`;

    const name = tidyName(body.match(/(?:Customer|Name)\s*:?\s*(.+)/i)?.[1]);
    const email = bodyEmails(body, raw.selfEmail)[0];
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
            reg: findReg(raw.subject, body),
        },
        message: '',
        paymentFailed: paymentFailed || undefined,
    });

    // A failed payment is a note for Steve, never a message to the customer.
    if (paymentFailed) return { ...lead, contactable: false, replyTargets: [] };
    return lead;
};

/**
 * Somebody who just wrote an email. The subject is kept as a vehicle hint rather than a
 * title because "Peugeot rcz" is not a stock title — the router does the fuzzy match.
 */
const parseDirectEmail = (raw: RawEmail, source: LeadPlatform): ParsedLead => {
    const sender = parseFromHeader(raw.from);
    const text = raw.text || '';

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

// --- Entry point ------------------------------------------------------------

/**
 * Normalise one inbound email.
 *
 * Detection is by sender first and subject second, exactly as the formats doc describes,
 * because the subject lines collide: "Enquiry - ..." is used by both Cazoo and the
 * dealership's own website.
 */
export const parseLeadEmail = (raw: RawEmail): ParsedLead => {
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

    if (/cardealer5\.co\.uk$/i.test(from.split('@')[1] || '')) {
        if (/payment failed/i.test(subject)) return parseCarDealer5Reservation(raw, true);
        if (/reservation successful/i.test(subject)) return parseCarDealer5Reservation(raw, false);
        return parseCarDealer5Enquiry(raw);
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

/** What to say to the brain when the customer sent no words at all. */
export const messageOrDefault = (lead: ParsedLead, vehicleTitle?: string): string => {
    if (lead.message) return lead.message;
    return `Is the ${vehicleTitle || lead.vehicle?.title || 'car'} still available?`;
};
