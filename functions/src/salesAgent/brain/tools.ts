/**
 * The tools the brain is allowed to call, and the code that runs them.
 *
 * Two rules shape this file:
 *  - Tool results are compact. Every field we hand back costs tokens on every
 *    later turn, so anything the customer would never be told (ledger ids,
 *    index timestamps, image urls) is stripped out. A search result is one line
 *    from describeStockItem rather than an object; the registration is in it
 *    deliberately, because it is printed on the advert and it is the quickest way
 *    to be sure both sides are talking about the same car.
 *  - Tools are the only way state changes. The model writes words; bookings,
 *    escalations, handoffs and price counts happen here, are recorded on
 *    ToolEffects, and are read back by ./index.ts. Nothing the model writes in
 *    prose is trusted to have changed anything.
 */
import { Type } from '@google/genai';
import type { FunctionDeclaration } from '@google/genai';
import { broadenQueryText, countStock, describeStockItem, getStockItem, searchStock } from '../stock/search';
import type { StockSearchResult } from '../stock/search';
import type { Contact, Conversation, SalesAgentSettings, StockItem } from '../types';

/** Filters accepted by search_stock, matching stock/search.ts. */
export interface StockSearchFilters {
    text?: string;
    make?: string;
    model?: string;
    maxPrice?: number;
    minYear?: number;
    fuel?: string;
    transmission?: string;
    bodyType?: string;
    limit?: number;
    /** Reserved and sold cars are hidden unless this is set. See stock/search.ts. */
    includeReserved?: boolean;
    /** Another dealer's cars. Set only by this file, never from a model tool call. */
    includeHidden?: boolean;
}

/**
 * The slice of stock/search the brain uses. Injectable so devRun (and any test)
 * can run the whole loop against an in-memory list without touching RTDB.
 */
export interface StockApi {
    searchStock(companyId: string, filters: StockSearchFilters): Promise<StockSearchResult[]>;
    getStockItem(companyId: string, id: string): Promise<StockItem | null>;
    /** Cars in the index, hidden ones included. 0 means the scrape has never run. */
    countStock(companyId: string): Promise<number>;
}

/** The real thing. Structurally checked against stock/search.ts at compile time. */
export const liveStockApi: StockApi = { searchStock, getStockItem, countStock };

/**
 * Everything a tool call changed. index.ts folds this into the BrainResult;
 * the model never sees it.
 */
export interface ToolEffects {
    escalate?: { reason: string; ownerMessage: string };
    askOwner?: { question: string; context?: string };
    handoff?: boolean;
    booking?: { name: string; phone: string; window: string; confirmedAt: number };
    priceRequests?: number;
    contact?: Contact;
    preferredTime?: string;
    vehicleInterest?: { stockId?: string; title?: string; ledgerVehicleId?: string };
    /** Listed price of every vehicle a tool returned this run, by stock id. Feeds the price guard. */
    seenPrices: Map<string, number>;
    /** Every monthly finance figure a tool returned this run. A monthly figure the
     *  agent did not get from a tool is invented, and the price guard rejects it. */
    seenMonthly: Set<number>;
    /** Business copy handed to the model this run. Scanned by the price guard, so a
     *  figure the dealership publishes itself (reservation fee, warranty prices) can
     *  be repeated without being mistaken for an invented one. */
    businessText: string;
    /** Names of the tools that ran, in order. Useful in logs and in devRun. */
    called: string[];
}

export const newToolEffects = (): ToolEffects => ({
    seenPrices: new Map(),
    seenMonthly: new Set(),
    businessText: '',
    called: [],
});

export interface ToolContext {
    companyId: string;
    conversation: Conversation;
    settings: SalesAgentSettings;
    stock: StockApi;
    effects: ToolEffects;
}

const MAX_SEARCH_RESULTS = 5;

const str = (value: unknown): string | undefined => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return undefined;
};

const num = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value.replace(/[£,\s]/g, ''));
        if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
};

const drop = <T extends object>(obj: T): T => {
    for (const key of Object.keys(obj) as (keyof T)[]) {
        if (obj[key] === undefined || obj[key] === null || obj[key] === '') delete obj[key];
    }
    return obj;
};

/** What goes in a search result list: enough to talk about, nothing more. */
const listView = (item: StockItem) =>
    drop({
        id: item.id,
        reg: item.reg,
        title: item.title,
        price: item.price,
        year: item.year,
        mileage: item.mileage,
        fuel: item.fuel,
        transmission: item.transmission,
        bodyType: item.bodyType,
        colour: item.colour,
        status: item.status,
    });

/** What goes in a single-vehicle lookup: the facts a customer actually asks for. */
const detailView = (item: StockItem) =>
    drop({
        ...listView(item),
        variant: item.variant,
        engineSize: item.engineSize,
        owners: item.owners,
        serviceHistory: item.serviceHistory,
        motExpiry: item.motExpiry,
        motStatus: item.motStatus,
        taxStatus: item.taxStatus,
        taxDueDate: item.taxDueDate,
        annualRoadTax: item.annualRoadTax,
        estimatedMpg: item.estimatedMpg,
        ulezCompliant: item.ulezCompliant,
        monthlyFrom: item.monthlyFrom,
        features: (item.features || []).slice(0, 30),
        description: (item.description || '').slice(0, 1500),
        url: item.url,
    });

/**
 * What a search hit looks like to the model: one readable line plus how sure the
 * matcher is, and the facts customers ask for the moment they have found
 * their car. Everything else waits for get_stock_item.
 */
const resultView = (item: StockSearchResult) =>
    drop({
        id: item.id,
        reg: item.reg,
        title: item.title,
        price: item.price,
        year: item.year,
        mileage: item.mileage,
        fuel: item.fuel,
        transmission: item.transmission,
        colour: item.colour,
        summary: describeStockItem(item),
        matchQuality: item.matchQuality,
        status: item.status === 'available' ? undefined : item.status,
        owners: item.owners,
        serviceHistory: item.serviceHistory,
        motExpiry: item.motExpiry,
        ulezCompliant: item.ulezCompliant,
        url: item.url,
    });

/**
 * Two available cars to offer beside one that has gone. Widening in three steps,
 * stopping as soon as it has two: the same description without the year and the
 * colour, then anything by the same make, then anything within a quarter of the
 * price either way.
 */
const findAlternatives = async (
    ctx: ToolContext,
    filters: StockSearchFilters,
    exclude: StockSearchResult[],
): Promise<StockSearchResult[]> => {
    const seen = new Set(exclude.map((item) => item.id));
    const out: StockSearchResult[] = [];

    const take = (items: StockSearchResult[]): void => {
        for (const item of items) {
            if (out.length >= 2) return;
            if (seen.has(item.id) || item.status !== 'available') continue;
            seen.add(item.id);
            out.push(item);
        }
    };

    const broader = broadenQueryText(filters.text);
    if (broader) take(await ctx.stock.searchStock(ctx.companyId, { text: broader, limit: 5 }));

    const make = filters.make || exclude[0]?.make;
    if (out.length < 2 && make) take(await ctx.stock.searchStock(ctx.companyId, { make, limit: 5 }));

    const price = exclude[0]?.price;
    if (out.length < 2 && typeof price === 'number' && price > 0) {
        const near = await ctx.stock.searchStock(ctx.companyId, { maxPrice: Math.round(price * 1.25), limit: MAX_SEARCH_RESULTS });
        take(near.filter((item) => (item.price ?? 0) >= price * 0.75));
    }

    return out;
};

/** Records every figure a stock tool handed the model, so the price guard can tell
 *  a quoted fact from an invented one. */
const rememberPrices = (ctx: ToolContext, items: StockItem[]): void => {
    for (const item of items) {
        if (typeof item.price === 'number' && item.price > 0) ctx.effects.seenPrices.set(item.id, item.price);
        if (typeof item.monthlyFrom === 'number' && item.monthlyFrom > 0) ctx.effects.seenMonthly.add(item.monthlyFrom);
    }
};

export const toolDeclarations: FunctionDeclaration[] = [
    {
        name: 'search_stock',
        description:
            'Search the dealership stock database (Motor Ledger Pro plus radlettcarsales.com). Call this every time a customer mentions a car, however vaguely, and before you say anything at all about what is or is not available. Put their own words in `text`: it understands years, plate codes ("13 plate", "07 plate"), colours, body styles and nicknames ("boxter", "rangie", "merc"). Returns up to 5 vehicles, surest first, each with a matchQuality of exact, close or weak. Reserved and sold cars come back automatically if nothing available matches.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                text: { type: Type.STRING, description: 'Free text as the customer described the car, e.g. "the black 2007 boxster" or "red convertible".' },
                make: { type: Type.STRING, description: 'Manufacturer, e.g. "Ford".' },
                model: { type: Type.STRING, description: 'Model, e.g. "Focus".' },
                maxPrice: { type: Type.NUMBER, description: 'Highest price in GBP the customer will go to.' },
                minYear: { type: Type.INTEGER, description: 'Earliest model year acceptable.' },
                fuel: { type: Type.STRING, description: 'Petrol, Diesel, Hybrid or Electric.' },
                transmission: { type: Type.STRING, description: 'Manual or Automatic.' },
                bodyType: { type: Type.STRING, description: 'Hatchback, Saloon, Estate, SUV, Convertible, Coupe.' },
                limit: { type: Type.INTEGER, description: 'How many to return, 1 to 5. Defaults to 5.' },
            },
        },
    },
    {
        name: 'get_stock_item',
        description:
            'Full detail on one vehicle by its stock id: mileage, owners, service history, MOT, tax, ULEZ, mpg, spec and the advert blurb. This is the combined Motor Ledger Pro + website record. Use it the moment a customer asks anything specific about a car, before you say you need to check with anyone.',
        parameters: {
            type: Type.OBJECT,
            properties: { id: { type: Type.STRING, description: 'The stock id from a search_stock result.' } },
            required: ['id'],
        },
    },
    {
        name: 'get_business_info',
        description:
            'Opening hours, address, phone number, website and the dealership FAQs (warranty, finance partners, test-drive licence rule, delivery, part-exchange policy). Call this before answering any question about the business itself.',
        parameters: { type: Type.OBJECT, properties: {} },
    },
    {
        name: 'book_viewing',
        description:
            'Log a viewing or test drive. Only call this AFTER the owner has confirmed the slot through ask_owner. If he has not, this will refuse and ask him for you.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                fullName: { type: Type.STRING, description: "The customer's full name." },
                phone: { type: Type.STRING, description: 'A mobile number for them.' },
                window: { type: Type.STRING, description: 'The agreed slot in the customer\'s own words, e.g. "Saturday morning" or "Thursday about 4pm".' },
            },
            required: ['fullName', 'phone', 'window'],
        },
    },
    {
        name: 'escalate_to_owner',
        description:
            'Ping the owner for information while you carry on talking to the customer. This is the one for price: a request for a figure, or a second push on price.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                reason: { type: Type.STRING, description: 'Short reason, e.g. "customer asked for a best price".' },
                message_for_owner: { type: Type.STRING, description: 'What the owner needs to see, including the vehicle and what the customer said.' },
            },
            required: ['reason', 'message_for_owner'],
        },
    },
    {
        name: 'ask_owner',
        description:
            'Ask the sales desk a question internally and wait for the answer before replying properly. The customer must never hear a colleague\'s name. Use this ONLY for confirmed viewing slots, part-exchange valuations (after you have the customer\'s registration AND approximate mileage), damage or write-off history, a specific offer, or a fact that search_stock, get_stock_item and get_business_info did not cover. Never use this as a first step for spec, MOT, ULEZ, tax, service history or whether a car is in stock — look those up. Never call this for part-exchange until you have both the reg and mileage.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                question: { type: Type.STRING, description: 'The question, phrased for the owner, short enough to read on a phone.' },
                context: { type: Type.STRING, description: 'Optional: the vehicle, part-ex reg and mileage, and anything else he needs to answer it.' },
            },
            required: ['question'],
        },
    },
    {
        name: 'request_handoff',
        description:
            'Hand the conversation to the owner and stop replying. For complaints, legal matters, finance decisions, existing customers with a problem, or when the customer asks for a person.',
        parameters: {
            type: Type.OBJECT,
            properties: { reason: { type: Type.STRING, description: 'Why this needs a human.' } },
            required: ['reason'],
        },
    },
    {
        name: 'note_price_push',
        description: 'Record that the customer has pushed on price. Call this every time they do, before you answer them.',
        parameters: { type: Type.OBJECT, properties: {} },
    },
];

export const toolNames: string[] = toolDeclarations.map((d) => d.name || '');

type ToolResult = Record<string, unknown>;

const handlers: Record<string, (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>> = {
    async search_stock(args, ctx) {
        const limit = Math.min(Math.max(num(args.limit) || MAX_SEARCH_RESULTS, 1), MAX_SEARCH_RESULTS);
        const filters: StockSearchFilters = drop({
            text: str(args.text),
            make: str(args.make),
            model: str(args.model),
            maxPrice: num(args.maxPrice),
            minYear: num(args.minYear),
            fuel: str(args.fuel),
            transmission: str(args.transmission),
            bodyType: str(args.bodyType),
            limit,
        });

        const available = await ctx.stock.searchStock(ctx.companyId, filters);
        if (available.length) {
            rememberPrices(ctx, available);
            return drop({
                count: available.length,
                indexEmpty: false,
                results: available.map(resultView),
                note: available.length > 1
                    ? 'Ask which one, briefly describing the differences (year/colour/price).'
                    : undefined,
            });
        }

        // Nothing available. Before saying so, work out which kind of nothing it is.
        // Rule 8: a car they clearly meant that happens to be reserved or sold is
        // still their car, and gets said out loud with two alternatives beside it.
        const withSold = await ctx.stock.searchStock(ctx.companyId, { ...filters, includeReserved: true });
        const taken = withSold.filter((item) => item.matchQuality !== 'weak');
        if (taken.length) {
            rememberPrices(ctx, taken);
            const alternatives = await findAlternatives(ctx, filters, taken);
            rememberPrices(ctx, alternatives);
            return drop({
                count: taken.length,
                indexEmpty: false,
                results: taken.map(resultView),
                alternatives: alternatives.length
                    ? alternatives.map((item) => ({ id: item.id, summary: describeStockItem(item) }))
                    : undefined,
                note: "Tell the customer it's reserved/sold, apologise briefly, then offer up to two similar available cars (same make/model first, else same body/price band) from a broader search.",
            });
        }

        // The shared website again: the car may well be there, but it is another
        // dealer's and we have no permission to sell it. Its details never reach the
        // model, only the fact that this thread has to go to a person.
        const hidden = await ctx.stock.searchStock(ctx.companyId, { ...filters, includeReserved: true, includeHidden: true });
        if (hidden.some((item) => item.hiddenReason && item.matchQuality !== 'weak')) {
            // Deterministic: don't rely on the model remembering to hand off.
            ctx.effects.handoff = true;
            ctx.effects.escalate = ctx.effects.escalate || {
                reason: 'car not managed by agent',
                ownerMessage: `Customer is asking about a car the agent doesn't handle (another account's or unmatched): "${(filters.text || '').slice(0, 160)}". Please reply yourself.`,
            };
            return {
                count: 0,
                notHandled: true,
                note: 'This car is on the website but is not handled by the agent. Do NOT reply about it. Call request_handoff with reason "car not managed by agent: <what the customer asked about, in their words>" and return an empty reply.',
            };
        }

        // Nothing indexed at all is a broken scrape, not an empty forecourt, and the
        // customer must never be told a car is gone on the strength of it.
        const indexed = await ctx.stock.countStock(ctx.companyId);
        if (!indexed) {
            return {
                count: 0,
                indexEmpty: true,
                results: [],
                note: 'The stock data is not available right now. Do not tell the customer anything about what is or is not in stock. Say you will check on that and come straight back to them, and call ask_owner.',
            };
        }

        return {
            count: 0,
            indexEmpty: false,
            results: [],
            note: 'Nothing matches. Do not invent a car. Search again with fewer words, dropping the year and the colour, and offer the closest one or two we do have. Only use ask_owner if that finds nothing either.',
        };
    },

    async get_stock_item(args, ctx) {
        const id = str(args.id);
        if (!id) return { error: 'id is required, take it from a search_stock result' };
        const item = await ctx.stock.getStockItem(ctx.companyId, id);
        if (!item) return { error: `No vehicle with stock id ${id}. Search again rather than answering from memory.` };
        rememberPrices(ctx, [item]);
        ctx.effects.vehicleInterest = { stockId: item.id, title: item.title, ledgerVehicleId: item.ledgerVehicleId };
        return { vehicle: detailView(item) };
    },

    async get_business_info(_args, ctx) {
        const s = ctx.settings;
        const info = drop({
            openingHours: s.openingHours,
            address: s.address,
            phone: s.phone,
            website: s.websiteUrl,
            faqs: s.faqs,
        });
        // The dealership's own copy is a primary source: a reservation fee or a
        // warranty price written in the FAQs is a fact the agent may repeat, so the
        // price guard is shown the text rather than blocking the figure as invented.
        ctx.effects.businessText += ' ' + Object.values(info).filter((v) => typeof v === 'string').join(' ');
        return info;
    },

    async book_viewing(args, ctx) {
        const name = str(args.fullName);
        const phone = str(args.phone);
        const window = str(args.window);
        if (!name || !phone || !window) {
            return { ok: false, error: 'Need all three: fullName, phone and window. Ask the customer for whichever is missing.' };
        }

        const [firstName, ...rest] = name.split(/\s+/);
        ctx.effects.contact = drop({ firstName, lastName: rest.join(' ') || undefined, phone });
        ctx.effects.preferredTime = window;

        // Hard rule: the agent does not own the diary, so it cannot confirm a slot.
        // Rather than just refusing (which risks the model shrugging and inventing a
        // confirmation anyway) we raise the question with the owner on its behalf.
        if (!ctx.conversation.ownerAnswer) {
            const vehicle = ctx.effects.vehicleInterest?.title || ctx.conversation.vehicleInterest?.title || 'the vehicle';
            ctx.effects.askOwner = {
                question: `${name} wants to view the ${vehicle} ${window}. Does that work?`,
                context: `Phone ${phone}.`,
            };
            return {
                ok: false,
                confirmed: false,
                error: 'Not booked. You cannot confirm a slot yourself. The diary question has gone to the sales desk. Tell the customer you are checking the diary and will come back to them shortly. Do not name a colleague. Do not say booked or confirmed.',
            };
        }

        ctx.effects.booking = { name, phone, window, confirmedAt: Date.now() };
        return {
            ok: true,
            confirmed: true,
            booking: { name, phone, window },
            note: 'Logged and the owner has been told. Confirm it to the customer in one sentence.',
        };
    },

    async escalate_to_owner(args, ctx) {
        const reason = str(args.reason) || 'unspecified';
        const ownerMessage = str(args.message_for_owner) || reason;
        ctx.effects.escalate = { reason, ownerMessage };
        return { ok: true, note: 'The sales desk has been pinged. Tell the customer you will come back to them shortly. Do not name a colleague. Keep talking to them in the meantime.' };
    },

    async ask_owner(args, ctx) {
        const question = str(args.question);
        if (!question) return { ok: false, error: 'question is required' };
        ctx.effects.askOwner = drop({ question, context: str(args.context) });
        return {
            ok: true,
            note: 'Sent to the sales desk. Now write the customer a short holding line in this same turn, never an empty reply: say you will find that out and come straight back to them. Never name a colleague — they do not know who that is. Do not answer the question yourself and do not guess.',
        };
    },

    async request_handoff(args, ctx) {
        const reason = str(args.reason) || 'customer needs a human';
        ctx.effects.handoff = true;
        // The owner still has to be told, and handoff on its own is silent.
        ctx.effects.escalate = ctx.effects.escalate || { reason, ownerMessage: `Handing over: ${reason}` };
        return { ok: true, note: 'A colleague on the sales desk is taking this over. Say someone from the team will pick it up, then stop. Do not name them.' };
    },

    async note_price_push(_args, ctx) {
        const next = (ctx.effects.priceRequests ?? ctx.conversation.priceRequests ?? 0) + 1;
        ctx.effects.priceRequests = next;
        return { ok: true, priceRequests: next };
    },
};

/**
 * Runs one tool call. Never throws: a thrown tool is fed back to the model as an
 * error result so it can recover in the same turn rather than killing the reply.
 */
export const runTool = async (name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
    const handler = handlers[name];
    ctx.effects.called.push(name);
    if (!handler) return { error: `No tool called ${name}. Available: ${toolNames.join(', ')}.` };
    try {
        return await handler(args || {}, ctx);
    } catch (err) {
        return { error: `${name} failed: ${err instanceof Error ? err.message : String(err)}. Do not tell the customer a fact you could not look up.` };
    }
};
