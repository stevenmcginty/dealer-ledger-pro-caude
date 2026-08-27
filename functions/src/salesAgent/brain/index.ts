/**
 * The sales-agent brain: one Gemini call (plus a round per tool batch), then a
 * set of guards that the model cannot talk its way past.
 *
 * The division of labour, per docs/sales-agent/SPEC.md: Gemini writes words and
 * picks tools. Everything with consequences is decided here in code, from the
 * final state of ToolEffects. If the model says "I've booked you in" but never
 * called book_viewing, nothing is booked.
 *
 * Note on the response format: the Gemini API rejects responseSchema alongside
 * functionDeclarations ("Function calling with a response mime type:
 * 'application/json' is unsupported", HTTP 400), so the structured
 * {reply, summary, updates} object is asked for in the prompt and parsed
 * leniently here. That keeps the whole turn to a single API call in the common
 * case; if the model answers in prose instead, its prose becomes the reply and
 * the summary is derived in code.
 */
import { GoogleGenAI } from '@google/genai';
import type { Content, GenerateContentConfig, GenerateContentResponse, Part } from '@google/genai';
import type {
    AgentMessage,
    BrainResult,
    Channel,
    Conversation,
    ConversationStage,
    InboundMessage,
    SalesAgentSettings,
} from '../types';
import { buildContents, buildSystemPrompt } from './prompt';
import type { EmailContext } from '../channels/gmailContext';
import { liveStockApi, newToolEffects, runTool, toolDeclarations } from './tools';
import type { StockApi, ToolContext, ToolEffects } from './tools';

/** Name of the functions secret holding the Gemini key. index.ts declares it on the deployed function. */
export const GEMINI_SECRET_NAME = 'GEMINI_API_KEY';

export const BRAIN_MODEL = 'gemini-2.5-flash';

/** How many batches of tool calls we will service before forcing an answer. */
export const MAX_TOOL_ROUNDS = 4;

export const MAX_REPLY_SENTENCES = 3;
export const MAX_REPLY_CHARS = 400;

export const MAX_EMAIL_REPLY_SENTENCES = 8;
export const MAX_EMAIL_REPLY_CHARS = 1200;

export interface RunBrainInput {
    companyId: string;
    conversation: Conversation;
    history: AgentMessage[];
    inbound: InboundMessage;
    settings: SalesAgentSettings;
    /** What the Gmail inbox knows about this sender and how the owner writes. Email turns only. */
    emailContext?: EmailContext;
}

export interface BrainDeps {
    /** Stock lookups. Defaults to stock/search; devRun and tests pass an in-memory list. */
    stock?: StockApi;
    /** Defaults to process.env.GEMINI_API_KEY. */
    apiKey?: string;
    /** Fixes "today" in the prompt, for reproducible tests. */
    now?: Date;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/**
 * Em-dashes are the single loudest tell that a message was machine-written, and
 * SPEC bans them outright. A spaced en-dash is the same tic and goes too.
 */
export const softenDashes = (text: string): string =>
    text
        .replace(/\s*[—―]\s*/g, ', ')
        .replace(/\s+–\s+/g, ', ')
        .replace(/\s*,\s*,\s*/g, ', ')
        .replace(/\s*,\s*([.!?])/g, '$1')
        .replace(/,\s*$/, '');

const capBody = (
    text: string,
    maxSentences: number = MAX_REPLY_SENTENCES,
    maxChars: number = MAX_REPLY_CHARS
): string => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return '';

    const sentences = clean.match(/[^.!?]*[.!?]+["')\]]*\s*|[^.!?]+$/g) || [clean];
    let out = '';
    let used = 0;
    for (const sentence of sentences) {
        if (used >= maxSentences) break;
        const candidate = out + sentence;
        if (candidate.trim().length > maxChars) break;
        out = candidate;
        used++;
    }
    out = out.trim();
    if (out) return out;

    // One sentence longer than the entire budget. Cut at the last word boundary.
    const hard = clean.slice(0, maxChars);
    const lastSpace = hard.lastIndexOf(' ');
    const trimmed = (lastSpace > maxChars / 2 ? hard.slice(0, lastSpace) : hard).replace(/[\s,;:]+$/, '');
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const capEmailBody = (
    text: string,
    maxSentences: number = MAX_EMAIL_REPLY_SENTENCES,
    maxChars: number = MAX_EMAIL_REPLY_CHARS
): string => {
    const rawParagraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (!rawParagraphs.length) return capBody(text, maxSentences, maxChars);

    const outParagraphs: string[] = [];
    let usedSentences = 0;
    let currentTotalLength = 0;

    for (const para of rawParagraphs) {
        if (usedSentences >= maxSentences || currentTotalLength >= maxChars) break;

        const cleanPara = para.replace(/\s+/g, ' ').trim();
        const sentences = cleanPara.match(/[^.!?]*[.!?]+["')\]]*\s*|[^.!?]+$/g) || [cleanPara];

        let paraOut = '';
        for (const sentence of sentences) {
            if (usedSentences >= maxSentences) break;
            if (currentTotalLength + paraOut.length + sentence.length > maxChars) break;
            paraOut += sentence;
            usedSentences++;
        }
        paraOut = paraOut.trim();
        if (paraOut) {
            outParagraphs.push(paraOut);
            currentTotalLength += paraOut.length + 2;
        }
    }

    return outParagraphs.length ? outParagraphs.join('\n\n') : capBody(text, maxSentences, maxChars);
};

const GREETING_LINE = /^(hi|hey|hello|dear|good morning|good afternoon|good evening)\b[^\n]{0,60}$/i;
const SIGNOFF_LINE = /^(regards|kind regards|best regards|many thanks|thanks|thank you|best|best wishes|cheers|yours)\b/i;

/**
 * Cap on what goes out:
 * On messaging (WhatsApp/SMS), three sentences, 400 characters, trimmed at a sentence boundary.
 * On email, allow up to 8 sentences, 1200 characters across natural paragraphs, lifting out
 * the greeting line and sign-off block first so the body can thoroughly answer multi-question enquiries.
 */
export const capReply = (text: string, channel: Channel = 'whatsapp'): string => {
    const raw = text.replace(/\r\n/g, '\n').trim();
    if (!raw) return '';
    if (channel !== 'email') return capBody(raw, MAX_REPLY_SENTENCES, MAX_REPLY_CHARS);

    const lines = raw.split('\n');
    let greeting = '';
    if (lines.length > 1 && GREETING_LINE.test(lines[0].trim())) greeting = (lines.shift() || '').trim();

    let signoff = '';
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (SIGNOFF_LINE.test(line) && (line.endsWith(',') || line.length <= 30)) {
            signoff = lines.slice(i).join('\n').trim();
            lines.length = i;
            break;
        }
    }

    const remaining = lines.join('\n').trim();
    const body = capEmailBody(remaining, MAX_EMAIL_REPLY_SENTENCES, MAX_EMAIL_REPLY_CHARS);
    return [greeting, body, signoff].filter(Boolean).join('\n\n');
};

const safeHintReply = (_settings: SalesAgentSettings): string =>
    "We price competitively, but there's usually a bit of movement, a few hundred pounds. Let me come back to you with a figure shortly.";

/**
 * Which listed price a figure in the reply should be measured against. The
 * vehicle they are actually interested in if we looked it up this turn,
 * otherwise the dearest thing we showed them, because that is the reading that
 * catches the most under-quotes.
 */
const listedPriceFor = (effects: ToolEffects, conversation: Conversation): number | undefined => {
    const focus = effects.vehicleInterest?.stockId || conversation.vehicleInterest?.stockId;
    if (focus && effects.seenPrices.has(focus)) return effects.seenPrices.get(focus);
    const prices = Array.from(effects.seenPrices.values());
    return prices.length ? Math.max(...prices) : undefined;
};

/** "£199 a month" is a finance quote, not a discount, and is judged separately. */
const MONTHLY_SUFFIX = /^\s*(?:a|per|each)\s+month|^\s*(?:pm|pcm|p\/m|pm\b)|^\s*\/\s*month|^\s*a\s+month/i;

/** Every figure a tool handed the model this turn. Anything else is invented. */
export interface QuotedFigures {
    /** One-off amounts: listed prices, and any fee or price in the business copy. */
    plain: number[];
    /** Monthly finance figures. */
    monthly: number[];
}

/**
 * Pulls the figures out of tool-returned text, splitting them the same way the
 * guard reads the reply, so "£150 a month" in the FAQs vouches for a monthly
 * claim and "£99 to reserve" vouches for a one-off one, never the other way round.
 */
export const scanFigures = (text: string): QuotedFigures => {
    const plain: number[] = [];
    const monthly: number[] = [];
    const pounds = /£\s?(\d[\d,]*(?:\.\d{1,2})?)/g;
    let match: RegExpExecArray | null;
    while ((match = pounds.exec(text)) !== null) {
        const value = Number(match[1].replace(/,/g, ''));
        if (!Number.isFinite(value)) continue;
        const end = match.index + match[0].length;
        (MONTHLY_SUFFIX.test(text.slice(end, end + 20)) ? monthly : plain).push(value);
    }
    return { plain, monthly };
};

/**
 * The first figure in the reply we cannot vouch for, and why.
 *
 * A figure is safe only if it is one a tool actually returned, or a non-monthly
 * figure at or above the listed price (quoting the price upward is never a leak).
 * Everything else is either a discount we did not authorise or a number the model
 * made up, and both are treated the same way.
 */
export const unvouchedFigure = (
    reply: string,
    args: { listedPrice?: number; quoted: QuotedFigures },
): { value: number; why: string } | undefined => {
    const plain = new Set(args.quoted.plain);
    const monthly = new Set(args.quoted.monthly);
    const pounds = /£\s?(\d[\d,]*(?:\.\d{1,2})?)/g;
    let match: RegExpExecArray | null;

    while ((match = pounds.exec(reply)) !== null) {
        const value = Number(match[1].replace(/,/g, ''));
        if (!Number.isFinite(value)) continue;
        const end = match.index + match[0].length;

        if (MONTHLY_SUFFIX.test(reply.slice(end, end + 20))) {
            if (monthly.has(value)) continue;
            return { value, why: 'a monthly finance figure that no tool returned' };
        }
        if (plain.has(value)) continue;
        if (args.listedPrice === undefined) {
            return { value, why: 'a price with no stock lookup behind it this turn' };
        }
        if (value < args.listedPrice) {
            return { value, why: `below the listed £${args.listedPrice}` };
        }
    }
    return undefined;
};

/**
 * In hint mode, the only figures allowed out are the ones a tool put in front of
 * the model this turn. A discount below the listed price, a monthly payment it
 * invented, or any price at all when it never looked one up: the reply is
 * replaced wholesale and Steve is told what nearly went out, because a leaked
 * number cannot be taken back.
 */
export const applyPriceGuard = (args: {
    reply: string;
    settings: SalesAgentSettings;
    /** The price to measure against; undefined when no stock tool returned one this turn. */
    listedPrice?: number;
    quoted: QuotedFigures;
    inboundText: string;
}): { reply: string; escalate?: { reason: string; ownerMessage: string } } => {
    const { reply, settings, listedPrice, quoted, inboundText } = args;
    if (settings.priceFlexMode !== 'hint' || !reply) return { reply };

    const bad = unvouchedFigure(reply, { listedPrice, quoted });
    if (!bad) return { reply };

    return {
        reply: safeHintReply(settings),
        escalate: {
            reason: `price guard: the agent produced £${bad.value}, ${bad.why}`,
            ownerMessage: `The agent nearly quoted £${bad.value}, ${bad.why}. Blocked and replaced. Customer said: "${(inboundText || '').replace(/\s+/g, ' ').slice(0, 200)}"`,
        },
    };
};

const inferStage = (
    known: Pick<Conversation, 'vehicleInterest' | 'partExOrFinance' | 'preferredTime' | 'booking'>,
    current: ConversationStage,
): ConversationStage => {
    if (current === 'closed') return 'closed';
    if (known.booking) return 'booked';
    if (known.preferredTime) return 'details';
    if (known.partExOrFinance) return 'timing';
    if (known.vehicleInterest && (known.vehicleInterest.stockId || known.vehicleInterest.title)) return 'deal';
    return 'vehicle';
};

// ---------------------------------------------------------------------------
// Model output
// ---------------------------------------------------------------------------

interface ModelOutput {
    reply?: unknown;
    summary?: unknown;
    updates?: unknown;
}

const parseModelOutput = (raw: string): ModelOutput => {
    const text = raw.trim();
    if (!text) return {};
    const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try {
            const parsed: unknown = JSON.parse(unfenced.slice(start, end + 1));
            if (parsed && typeof parsed === 'object') return parsed as ModelOutput;
        } catch {
            // Not JSON after all. Fall through and use the prose.
        }
    }
    return { reply: unfenced };
};

const asString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

interface SanitisedUpdates {
    vehicleInterest?: { stockId?: string; title?: string };
    partExOrFinance?: string;
    preferredTime?: string;
    contact?: { firstName?: string; lastName?: string; phone?: string; email?: string };
}

/** The model is not trusted to stay inside the allowed keys, so only these are read. */
const sanitiseUpdates = (value: unknown): SanitisedUpdates => {
    if (!value || typeof value !== 'object') return {};
    const raw = value as Record<string, unknown>;
    const out: SanitisedUpdates = {};

    if (raw.vehicleInterest && typeof raw.vehicleInterest === 'object') {
        const v = raw.vehicleInterest as Record<string, unknown>;
        const stockId = asString(v.stockId);
        const title = asString(v.title);
        if (stockId || title) out.vehicleInterest = { ...(stockId ? { stockId } : {}), ...(title ? { title } : {}) };
    }
    const partEx = asString(raw.partExOrFinance);
    if (partEx) out.partExOrFinance = partEx;
    const preferredTime = asString(raw.preferredTime);
    if (preferredTime) out.preferredTime = preferredTime;

    if (raw.contact && typeof raw.contact === 'object') {
        const c = raw.contact as Record<string, unknown>;
        const contact: SanitisedUpdates['contact'] = {};
        const firstName = asString(c.firstName);
        const lastName = asString(c.lastName);
        const phone = asString(c.phone);
        const email = asString(c.email);
        if (firstName) contact.firstName = firstName;
        if (lastName) contact.lastName = lastName;
        if (phone) contact.phone = phone;
        if (email) contact.email = email;
        if (Object.keys(contact).length) out.contact = contact;
    }
    return out;
};

/** Used only when the model failed to return a summary. Cheap, no extra call. */
const deriveSummary = (conversation: Conversation, inbound: InboundMessage): string => {
    const bits: string[] = [];
    const name = [conversation.contact?.firstName, conversation.contact?.lastName].filter(Boolean).join(' ');
    bits.push(`${name || 'Customer'} enquired on ${conversation.originChannel}.`);
    if (conversation.vehicleInterest?.title) bits.push(`Interested in the ${conversation.vehicleInterest.title}.`);
    if (conversation.partExOrFinance) bits.push(`Part-ex or finance: ${conversation.partExOrFinance}.`);
    if (conversation.preferredTime) bits.push(`Suggested ${conversation.preferredTime} for a viewing.`);
    if (conversation.booking) bits.push(`Viewing logged for ${conversation.booking.window}.`);
    const last = (inbound.text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (last) bits.push(`Last message: "${last}".`);
    return bits.join(' ');
};

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

/**
 * Runs one turn of the conversation and returns what the router should do.
 * Throws only if the model call itself fails; the router owns error alerts.
 */
export const runBrain = async (input: RunBrainInput, deps: BrainDeps = {}): Promise<BrainResult> => {
    const { companyId, conversation, history, inbound, settings, emailContext } = input;

    // The bot is silent the moment it stops owning the conversation. No API call,
    // no tokens, no chance of the model talking over Steve.
    if (conversation.mode !== 'agent') {
        return { reply: '', stage: conversation.stage, updates: {} };
    }

    const apiKey = deps.apiKey || process.env[GEMINI_SECRET_NAME];
    if (!apiKey) throw new Error(`${GEMINI_SECRET_NAME} is not set; the sales agent cannot run`);

    const ai = new GoogleGenAI({ apiKey });
    const effects = newToolEffects();
    const ctx: ToolContext = {
        companyId,
        conversation,
        settings,
        stock: deps.stock || liveStockApi,
        effects,
    };

    const contents: Content[] = buildContents({ conversation, history, inbound, settings, emailContext });
    const config: GenerateContentConfig = {
        systemInstruction: buildSystemPrompt({ conversation, settings, now: deps.now, emailContext }),
        temperature: 0.6,
        maxOutputTokens: 1200,
        tools: [{ functionDeclarations: toolDeclarations }],
    };
    const configWithoutTools: GenerateContentConfig = { ...config };
    delete configWithoutTools.tools;

    const usage = { inputTokens: 0, outputTokens: 0, model: BRAIN_MODEL };
    const account = (response: GenerateContentResponse): void => {
        const meta = response.usageMetadata;
        usage.inputTokens += meta?.promptTokenCount || 0;
        usage.outputTokens += (meta?.candidatesTokenCount || 0) + (meta?.thoughtsTokenCount || 0);
    };

    // Gemini returns 503 UNAVAILABLE / 429 under load a few times a day. One such
    // blip must not cost a customer their reply, so the call is retried with a
    // short back-off before the router is told the turn failed.
    const generate = async (request: { model: string; contents: Content[]; config: GenerateContentConfig }) => {
        const delays = [1500, 4000, 8000];
        for (let attempt = 0; ; attempt++) {
            try {
                return await ai.models.generateContent(request);
            } catch (error: any) {
                const status = Number(error?.status || error?.code || error?.error?.code);
                const text = String(error?.message || '');
                const transient = [429, 500, 502, 503, 504].includes(status) || /UNAVAILABLE|overloaded|RESOURCE_EXHAUSTED/i.test(text);
                if (!transient || attempt >= delays.length) throw error;
                console.warn(`Brain: Gemini ${status || 'error'} on attempt ${attempt + 1}, retrying in ${delays[attempt]}ms`);
                await new Promise(resolve => setTimeout(resolve, delays[attempt]));
            }
        }
    };

    let response = await generate({ model: BRAIN_MODEL, contents, config });
    account(response);

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const calls = response.functionCalls;
        if (!calls || calls.length === 0) break;

        contents.push({ role: 'model', parts: response.candidates?.[0]?.content?.parts || [] });

        const parts: Part[] = [];
        for (const call of calls) {
            const result = await runTool(call.name || '', call.args || {}, ctx);
            parts.push({ functionResponse: { id: call.id, name: call.name, response: result } });
        }
        contents.push({ role: 'user', parts });

        // On the last permitted round the tools are taken away, so the model has to
        // answer with what it has rather than looping until it runs out of budget.
        const lastRound = round === MAX_TOOL_ROUNDS - 1;
        response = await generate({
            model: BRAIN_MODEL,
            contents,
            config: lastRound ? configWithoutTools : config,
        });
        account(response);
    }

    const parsed = parseModelOutput(response.text || '');
    if (!asString(parsed.reply)) {
        console.warn('Brain: model returned no reply text', JSON.stringify({
            rawHead: (response.text || '').slice(0, 400),
            candidates: response.candidates?.length,
            finishReason: response.candidates?.[0]?.finishReason,
            effects: { escalate: effects.escalate, askOwner: effects.askOwner, handoff: effects.handoff },
        }));
    }
    const modelUpdates = sanitiseUpdates(parsed.updates);

    let reply = softenDashes(asString(parsed.reply) || '');
    let escalate = effects.escalate;

    const businessFigures = scanFigures(effects.businessText);
    const guarded = applyPriceGuard({
        reply,
        settings,
        listedPrice: listedPriceFor(effects, conversation),
        quoted: {
            plain: [...effects.seenPrices.values(), ...businessFigures.plain],
            monthly: [...effects.seenMonthly, ...businessFigures.monthly],
        },
        inboundText: inbound.text || '',
    });
    reply = capReply(guarded.reply, conversation.channel);
    if (guarded.escalate) escalate = guarded.escalate;

    const updates: BrainResult['updates'] = {};

    const vehicleInterest = modelUpdates.vehicleInterest || effects.vehicleInterest;
    if (vehicleInterest && JSON.stringify(vehicleInterest) !== JSON.stringify(conversation.vehicleInterest || null)) {
        updates.vehicleInterest = vehicleInterest;
    }
    if (modelUpdates.partExOrFinance && modelUpdates.partExOrFinance !== conversation.partExOrFinance) {
        updates.partExOrFinance = modelUpdates.partExOrFinance;
    }
    const preferredTime = effects.preferredTime || modelUpdates.preferredTime;
    if (preferredTime && preferredTime !== conversation.preferredTime) updates.preferredTime = preferredTime;

    if (effects.booking) updates.booking = effects.booking;
    if (effects.priceRequests !== undefined && effects.priceRequests !== conversation.priceRequests) {
        updates.priceRequests = effects.priceRequests;
    }

    const contact = { ...(conversation.contact || {}), ...(modelUpdates.contact || {}), ...(effects.contact || {}) };
    if (JSON.stringify(contact) !== JSON.stringify(conversation.contact || {})) updates.contact = contact;

    updates.summary = (asString(parsed.summary) || deriveSummary(conversation, inbound)).slice(0, 700);

    const stage = inferStage(
        {
            vehicleInterest: updates.vehicleInterest || conversation.vehicleInterest,
            partExOrFinance: updates.partExOrFinance || conversation.partExOrFinance,
            preferredTime: updates.preferredTime || conversation.preferredTime,
            booking: updates.booking || conversation.booking,
        },
        conversation.stage,
    );

    const result: BrainResult = { reply, stage, updates, usage };
    if (escalate) result.escalate = escalate;
    if (effects.askOwner) result.askOwner = effects.askOwner;
    if (effects.handoff) result.handoff = true;
    return result;
};

export { toolDeclarations } from './tools';
export type { StockApi } from './tools';
export { buildSystemPrompt } from './prompt';
