"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.gatherEmailContext = exports.ownerStyleContext = exports.earlierContext = exports.threadContext = exports.toContextItem = exports.trimText = exports.MAX_STYLE_CHARS = exports.MAX_ITEM_CHARS = exports.MAX_STYLE_ITEMS = exports.MAX_EARLIER_ITEMS = exports.MAX_THREAD_ITEMS = exports.emptyEmailContext = void 0;
const conversations_1 = require("../conversations");
const gmailAuth_1 = require("../gmailAuth");
const gmailParse_1 = require("./gmailParse");
const emptyEmailContext = () => ({ thread: [], earlier: [], ownerStyle: [] });
exports.emptyEmailContext = emptyEmailContext;
/** Caps: this all lands in the prompt on every email turn, so keep it modest. */
exports.MAX_THREAD_ITEMS = 12;
exports.MAX_EARLIER_ITEMS = 8;
exports.MAX_STYLE_ITEMS = 4;
exports.MAX_ITEM_CHARS = 900;
exports.MAX_STYLE_CHARS = 1200;
const STYLE_CACHE_MS = 24 * 60 * 60 * 1000;
const header = (message, name) => ((message.payload?.headers || []).find(h => (h.name || '').toLowerCase() === name.toLowerCase())?.value || '').trim();
const decode = (data) => (data ? Buffer.from(data, 'base64url').toString('utf8') : '');
/** First text/plain body in the MIME tree; falls back to a de-tagged HTML body. */
const bodyOf = (payload) => {
    let text = '';
    let html = '';
    const visit = (part) => {
        const mime = (part.mimeType || '').toLowerCase();
        if (mime === 'text/plain' && !text)
            text = decode(part.body?.data);
        else if (mime === 'text/html' && !html)
            html = decode(part.body?.data);
        (part.parts || []).forEach(visit);
    };
    if (payload)
        visit(payload);
    if (text)
        return text;
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
const addressOf = (fromHeader) => {
    const angled = fromHeader.match(/<([^>]+)>/);
    return (angled ? angled[1] : fromHeader).trim().toLowerCase();
};
const trimText = (text, max) => {
    const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return clean.length > max ? `${clean.slice(0, max).trimEnd()} […]` : clean;
};
exports.trimText = trimText;
const toContextItem = (message, selfEmail, max = exports.MAX_ITEM_CHARS) => {
    const text = (0, exports.trimText)((0, gmailParse_1.stripQuotedReply)(bodyOf(message.payload)), max);
    if (!text)
        return null;
    const from = addressOf(header(message, 'From')) === selfEmail ? 'owner' : 'customer';
    return { from, at: Number(message.internalDate) || 0, subject: header(message, 'Subject'), text };
};
exports.toContextItem = toContextItem;
const byDate = (a, b) => a.at - b.at;
const fetchFull = async (gmail, ids) => {
    const out = [];
    for (const id of ids) {
        try {
            const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
            out.push(res.data);
        }
        catch (error) {
            console.warn(`Gmail context: could not read message ${id}`, error);
        }
    }
    return out;
};
// --- The thread -------------------------------------------------------------
/** Every message on the thread the conversation record has not already got. */
const threadContext = async (args) => {
    const { gmail, selfEmail, threadId, history, inboundProviderId } = args;
    const known = new Set(history.map(m => m.providerId).filter(Boolean));
    if (inboundProviderId)
        known.add(inboundProviderId);
    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
    const items = (thread.data.messages || [])
        .filter(m => m.id && !known.has(m.id))
        .map(m => (0, exports.toContextItem)(m, selfEmail))
        .filter((m) => !!m)
        .sort(byDate);
    return items.slice(-exports.MAX_THREAD_ITEMS);
};
exports.threadContext = threadContext;
// --- Earlier correspondence -------------------------------------------------
/** What this sender and the desk have said to each other on other threads. */
const earlierContext = async (args) => {
    const { gmail, selfEmail, address, excludeThreadId } = args;
    const email = address.trim().toLowerCase();
    if (!email.includes('@') || email === selfEmail)
        return [];
    const listed = await gmail.users.messages.list({
        userId: 'me',
        q: `(from:${email} OR to:${email}) newer_than:180d`,
        maxResults: exports.MAX_EARLIER_ITEMS * 2,
    });
    const ids = (listed.data.messages || [])
        .filter(m => m.id && m.threadId !== excludeThreadId)
        .map(m => m.id)
        .slice(0, exports.MAX_EARLIER_ITEMS);
    if (!ids.length)
        return [];
    const full = await fetchFull(gmail, ids);
    return full
        .map(m => (0, exports.toContextItem)(m, selfEmail))
        .filter((m) => !!m)
        .sort(byDate)
        .slice(-exports.MAX_EARLIER_ITEMS);
};
exports.earlierContext = earlierContext;
/**
 * Recent emails the owner typed themselves, so the brain can see how the desk
 * actually writes. Anything the agent sent carries the "<agent> replied" label and
 * is excluded; automated notifications from the inbox would not be in SENT anyway.
 * Cached for a day per company.
 */
const ownerStyleContext = async (args) => {
    const { gmail, companyId, selfEmail, agentName } = args;
    const cacheRef = (0, conversations_1.db)().ref((0, conversations_1.privatePath)(companyId, 'gmail/styleSamples'));
    const cached = (await cacheRef.once('value')).val();
    if (cached?.items?.length && Date.now() - (cached.fetchedAt || 0) < STYLE_CACHE_MS)
        return cached.items;
    const label = `${agentName} replied`;
    const listed = await gmail.users.messages.list({
        userId: 'me',
        q: `in:sent -label:"${label}" newer_than:120d`,
        maxResults: exports.MAX_STYLE_ITEMS * 3,
    });
    const ids = (listed.data.messages || []).map(m => m.id).filter((id) => !!id);
    const full = await fetchFull(gmail, ids);
    const items = full
        .map(m => (0, exports.toContextItem)(m, selfEmail, exports.MAX_STYLE_CHARS))
        .filter((m) => !!m && m.from === 'owner' && m.text.length >= 80)
        .sort((a, b) => b.at - a.at)
        .slice(0, exports.MAX_STYLE_ITEMS);
    if (items.length)
        await cacheRef.set({ fetchedAt: Date.now(), items });
    return items;
};
exports.ownerStyleContext = ownerStyleContext;
// --- All together -----------------------------------------------------------
/**
 * Gather everything the inbox knows that the brain should. Each part fails on its
 * own; a missing Gmail connection returns an empty context.
 */
const gatherEmailContext = async (args) => {
    const { companyId, address, threadId, history, inboundProviderId } = args;
    const ctx = (0, exports.emptyEmailContext)();
    let gmail;
    let selfEmail;
    let agentName;
    try {
        const [priv, settings] = await Promise.all([(0, conversations_1.readPrivate)(companyId), (0, conversations_1.readSettings)(companyId)]);
        if (!priv.gmail?.refreshToken)
            return ctx;
        selfEmail = (priv.gmail.email || settings.emailAddress || '').toLowerCase();
        agentName = settings.agentName || 'Dave';
        gmail = await (0, gmailAuth_1.gmailClientFor)(companyId);
    }
    catch (error) {
        console.warn('Gmail context: no client', error);
        return ctx;
    }
    const settle = async (label, work) => {
        try {
            return await work;
        }
        catch (error) {
            console.warn(`Gmail context: ${label} failed`, error);
            return [];
        }
    };
    const [thread, earlier, ownerStyle] = await Promise.all([
        threadId
            ? settle('thread', (0, exports.threadContext)({ gmail, selfEmail, threadId, history, inboundProviderId }))
            : Promise.resolve([]),
        settle('earlier', (0, exports.earlierContext)({ gmail, selfEmail, address, excludeThreadId: threadId })),
        settle('style', (0, exports.ownerStyleContext)({ gmail, companyId, selfEmail, agentName })),
    ]);
    return { thread, earlier, ownerStyle };
};
exports.gatherEmailContext = gatherEmailContext;
//# sourceMappingURL=gmailContext.js.map