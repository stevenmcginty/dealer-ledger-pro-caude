/**
 * Inbox context for the brain: what the sender and the desk have already said to
 * each other in Gmail, and how the owner writes.
 *
 * The conversation record only holds what the agent has seen since it started
 * watching this thread. A customer who reserved a car by email last week, on a
 * different thread, arrives looking like a stranger asking about a reserved car
 * (the DD07BOX incident, 27 Aug). So on every email turn the brain is also handed:
 *
 *   - the rest of the Gmail thread (messages the app never recorded);
 *   - the sender's recent correspondence with the inbox on other threads;
 *   - a handful of emails the owner wrote themselves, as style examples.
 *
 * Everything here is read-only, best-effort and bounded. A Gmail hiccup returns an
 * empty context; it never stops a reply going out.
 */

import type { gmail_v1 } from 'googleapis';

import { db, privatePath, readPrivate, readSettings } from '../conversations';
import { gmailClientFor } from '../gmailAuth';
import type { AgentMessage } from '../types';
import { stripQuotedReply } from './gmailParse';

export interface EmailContextItem {
    /** 'owner' when the inbox itself sent it, 'customer' otherwise. */
    from: 'owner' | 'customer';
    /** Epoch ms. */
    at: number;
    subject: string;
    text: string;
}

export interface EmailContext {
    /** Messages on this Gmail thread the conversation record does not have. */
    thread: EmailContextItem[];
    /** The sender's messages, and the desk's replies to them, on other threads. */
    earlier: EmailContextItem[];
    /** Recent emails the owner wrote themselves (not the agent). */
    ownerStyle: EmailContextItem[];
}

export const emptyEmailContext = (): EmailContext => ({ thread: [], earlier: [], ownerStyle: [] });

/** Caps: this all lands in the prompt on every email turn, so keep it modest. */
export const MAX_THREAD_ITEMS = 12;
export const MAX_EARLIER_ITEMS = 8;
export const MAX_STYLE_ITEMS = 4;
export const MAX_ITEM_CHARS = 900;
export const MAX_STYLE_CHARS = 1200;
const STYLE_CACHE_MS = 24 * 60 * 60 * 1000;

const header = (message: gmail_v1.Schema$Message, name: string): string =>
    ((message.payload?.headers || []).find(h => (h.name || '').toLowerCase() === name.toLowerCase())?.value || '').trim();

const decode = (data?: string | null): string => (data ? Buffer.from(data, 'base64url').toString('utf8') : '');

/** First text/plain body in the MIME tree; falls back to a de-tagged HTML body. */
const bodyOf = (payload?: gmail_v1.Schema$MessagePart): string => {
    let text = '';
    let html = '';
    const visit = (part: gmail_v1.Schema$MessagePart): void => {
        const mime = (part.mimeType || '').toLowerCase();
        if (mime === 'text/plain' && !text) text = decode(part.body?.data);
        else if (mime === 'text/html' && !html) html = decode(part.body?.data);
        (part.parts || []).forEach(visit);
    };
    if (payload) visit(payload);
    if (text) return text;
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
};

const addressOf = (fromHeader: string): string => {
    const angled = fromHeader.match(/<([^>]+)>/);
    return (angled ? angled[1] : fromHeader).trim().toLowerCase();
};

export const trimText = (text: string, max: number): string => {
    const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return clean.length > max ? `${clean.slice(0, max).trimEnd()} […]` : clean;
};

export const toContextItem = (message: gmail_v1.Schema$Message, selfEmail: string, max = MAX_ITEM_CHARS): EmailContextItem | null => {
    const text = trimText(stripQuotedReply(bodyOf(message.payload)), max);
    if (!text) return null;
    const from = addressOf(header(message, 'From')) === selfEmail ? 'owner' : 'customer';
    return { from, at: Number(message.internalDate) || 0, subject: header(message, 'Subject'), text };
};

const byDate = (a: EmailContextItem, b: EmailContextItem) => a.at - b.at;

const fetchFull = async (gmail: gmail_v1.Gmail, ids: string[]): Promise<gmail_v1.Schema$Message[]> => {
    const out: gmail_v1.Schema$Message[] = [];
    for (const id of ids) {
        try {
            const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
            out.push(res.data);
        } catch (error) {
            console.warn(`Gmail context: could not read message ${id}`, error);
        }
    }
    return out;
};

// --- The thread -------------------------------------------------------------

/** Every message on the thread the conversation record has not already got. */
export const threadContext = async (args: {
    gmail: gmail_v1.Gmail;
    selfEmail: string;
    threadId: string;
    history: AgentMessage[];
    inboundProviderId?: string;
}): Promise<EmailContextItem[]> => {
    const { gmail, selfEmail, threadId, history, inboundProviderId } = args;
    const known = new Set(history.map(m => m.providerId).filter(Boolean));
    if (inboundProviderId) known.add(inboundProviderId);

    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
    const items = (thread.data.messages || [])
        .filter(m => m.id && !known.has(m.id))
        .map(m => toContextItem(m, selfEmail))
        .filter((m): m is EmailContextItem => !!m)
        .sort(byDate);
    return items.slice(-MAX_THREAD_ITEMS);
};

// --- Earlier correspondence -------------------------------------------------

/** What this sender and the desk have said to each other on other threads. */
export const earlierContext = async (args: {
    gmail: gmail_v1.Gmail;
    selfEmail: string;
    address: string;
    excludeThreadId?: string;
}): Promise<EmailContextItem[]> => {
    const { gmail, selfEmail, address, excludeThreadId } = args;
    const email = address.trim().toLowerCase();
    if (!email.includes('@') || email === selfEmail) return [];

    const listed = await gmail.users.messages.list({
        userId: 'me',
        q: `(from:${email} OR to:${email}) newer_than:180d`,
        maxResults: MAX_EARLIER_ITEMS * 2,
    });
    const ids = (listed.data.messages || [])
        .filter(m => m.id && m.threadId !== excludeThreadId)
        .map(m => m.id as string)
        .slice(0, MAX_EARLIER_ITEMS);
    if (!ids.length) return [];

    const full = await fetchFull(gmail, ids);
    return full
        .map(m => toContextItem(m, selfEmail))
        .filter((m): m is EmailContextItem => !!m)
        .sort(byDate)
        .slice(-MAX_EARLIER_ITEMS);
};

// --- Owner style samples ----------------------------------------------------

interface StyleCache { fetchedAt: number; items: EmailContextItem[] }

/**
 * Recent emails the owner typed themselves, so the brain can see how the desk
 * actually writes. Anything the agent sent carries the "<agent> replied" label and
 * is excluded; automated notifications from the inbox would not be in SENT anyway.
 * Cached for a day per company.
 */
export const ownerStyleContext = async (args: {
    gmail: gmail_v1.Gmail;
    companyId: string;
    selfEmail: string;
    agentName: string;
}): Promise<EmailContextItem[]> => {
    const { gmail, companyId, selfEmail, agentName } = args;
    const cacheRef = db().ref(privatePath(companyId, 'gmail/styleSamples'));
    const cached = (await cacheRef.once('value')).val() as StyleCache | null;
    if (cached?.items?.length && Date.now() - (cached.fetchedAt || 0) < STYLE_CACHE_MS) return cached.items;

    const label = `${agentName} replied`;
    const listed = await gmail.users.messages.list({
        userId: 'me',
        q: `in:sent -label:"${label}" newer_than:120d`,
        maxResults: MAX_STYLE_ITEMS * 3,
    });
    const ids = (listed.data.messages || []).map(m => m.id).filter((id): id is string => !!id);
    const full = await fetchFull(gmail, ids);

    const items = full
        .map(m => toContextItem(m, selfEmail, MAX_STYLE_CHARS))
        .filter((m): m is EmailContextItem => !!m && m.from === 'owner' && m.text.length >= 80)
        .sort((a, b) => b.at - a.at)
        .slice(0, MAX_STYLE_ITEMS);

    if (items.length) await cacheRef.set({ fetchedAt: Date.now(), items } as StyleCache);
    return items;
};

// --- All together -----------------------------------------------------------

/**
 * Gather everything the inbox knows that the brain should. Each part fails on its
 * own; a missing Gmail connection returns an empty context.
 */
export const gatherEmailContext = async (args: {
    companyId: string;
    address: string;
    threadId?: string;
    history: AgentMessage[];
    inboundProviderId?: string;
}): Promise<EmailContext> => {
    const { companyId, address, threadId, history, inboundProviderId } = args;
    const ctx = emptyEmailContext();

    let gmail: gmail_v1.Gmail;
    let selfEmail: string;
    let agentName: string;
    try {
        const [priv, settings] = await Promise.all([readPrivate(companyId), readSettings(companyId)]);
        if (!priv.gmail?.refreshToken) return ctx;
        selfEmail = (priv.gmail.email || settings.emailAddress || '').toLowerCase();
        agentName = settings.agentName || 'Dave';
        gmail = await gmailClientFor(companyId);
    } catch (error) {
        console.warn('Gmail context: no client', error);
        return ctx;
    }

    const settle = async <T>(label: string, work: Promise<T[]>): Promise<T[]> => {
        try {
            return await work;
        } catch (error) {
            console.warn(`Gmail context: ${label} failed`, error);
            return [];
        }
    };

    const [thread, earlier, ownerStyle] = await Promise.all([
        threadId
            ? settle('thread', threadContext({ gmail, selfEmail, threadId, history, inboundProviderId }))
            : Promise.resolve([]),
        settle('earlier', earlierContext({ gmail, selfEmail, address, excludeThreadId: threadId })),
        settle('style', ownerStyleContext({ gmail, companyId, selfEmail, agentName })),
    ]);

    return { thread, earlier, ownerStyle };
};
