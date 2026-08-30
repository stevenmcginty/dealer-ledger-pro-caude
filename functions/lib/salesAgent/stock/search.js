"use strict";
/**
 * Stock lookup for the agent's `search_stock` and `get_stock_item` tools.
 *
 * Reads the daily index written by `stock/index.ts`. Deliberately dumb: no
 * embeddings and no external calls, because this runs inside a conversation turn
 * and a customer is waiting on the reply. What it does have is a normaliser, so
 * the way people actually describe a car — "the black 2007 boxster", "13 plate
 * mini", "the 07 plate porsche", "a5 cab" — lands on the right advert. Customers
 * almost never quote a registration, so a vague description has to work.
 *
 * The normaliser pulls the strong signals out of the free text (year, plate code,
 * colour, fuel, gearbox, body, make/model nicknames) and treats them as filters or
 * heavy bonuses; whatever is left is scored as loose tokens the way it always was.
 * Every result carries a `matchQuality` so the brain can tell "this is definitely
 * the car they mean" from "this is the nearest thing we have".
 *
 * Reserved and sold cars are hidden by default. The agent is told to say a car is
 * reserved and offer alternatives, so brain/tools.ts asks for them explicitly on a
 * second pass when the first one comes back empty.
 *
 * A car carrying a `hiddenReason` is a different matter: it belongs to another
 * dealer on the shared website who has not agreed to this agent selling it (or it
 * belongs to nobody and this company said not to). Those never come back to a
 * customer-facing answer. `includeHidden` exists only so brain/tools.ts can tell
 * "we have not got that car" apart from "that car is not ours to talk about" and
 * hand the thread to a human; its details are never shown to the model.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.describeStockItem = exports.getStockItem = exports.countStock = exports.searchStock = exports.matchEnquiryStockForCompany = exports.matchEnquiryStock = exports.carWordsOnly = exports.readStock = exports.rankStock = exports.broadenQueryText = exports.normaliseQueryText = void 0;
const admin = __importStar(require("firebase-admin"));
const db = () => admin.database();
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;
/**
 * Words too common in car chat to tell two adverts apart. The second half is the
 * conversational filler that arrives when the model passes the customer's whole
 * sentence through as `text` instead of just the car; without it "I've noticed
 * you've still got..." scores every advert with a chatty description.
 */
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'of', 'for', 'with', 'in', 'on', 'at', 'to',
    'is', 'it', 'this', 'that', 'any', 'got', 'have', 'has', 'do', 'you',
    'car', 'cars', 'vehicle', 'vehicles', 'looking', 'interested', 'about',
    've', 'll', 're', 'ive', 'im', 'my', 'me', 'we', 'us', 'our', 'your', 'their',
    'what', 'whats', 'which', 'how', 'when', 'where', 'many', 'much', 'was', 'were',
    'are', 'not', 'just', 'like', 'want', 'know', 'see', 'tell', 'let', 'still',
    'available', 'stock', 'please', 'thanks', 'thank', 'hi', 'hello', 'noticed',
    'owner', 'owners', 'plate', 'plates', 'reg', 'registration',
]);
/** How much a hit in each field is worth. Make and model are the strongest signal. */
const FIELD_WEIGHTS = [
    { field: 'reg', weight: 8 },
    { field: 'make', weight: 6 },
    { field: 'model', weight: 6 },
    { field: 'variant', weight: 3 },
    { field: 'title', weight: 3 },
    { field: 'colour', weight: 2 },
    { field: 'bodyType', weight: 2 },
    { field: 'fuel', weight: 1 },
    { field: 'transmission', weight: 1 },
    { field: 'description', weight: 1 },
];
/** Naming the right model, or the right year, has to beat any amount of word overlap. */
const ALIAS_BONUS = 20;
const TOKEN_IDENTITY_BONUS = 12;
const YEAR_EXACT_BONUS = 15;
const YEAR_NEAR_BONUS = 5;
const COLOUR_BONUS = 10;
const FACET_BONUS = 4;
const QUALITY_RANK = { exact: 0, close: 1, weak: 2 };
/** Colour words a customer uses, and every spelling they can appear as on an advert. */
const COLOUR_WORDS = {
    black: ['black'],
    white: ['white'],
    silver: ['silver'],
    grey: ['grey', 'gray'],
    gray: ['grey', 'gray'],
    blue: ['blue'],
    red: ['red'],
    green: ['green'],
    yellow: ['yellow'],
    orange: ['orange'],
    brown: ['brown'],
    beige: ['beige'],
    gold: ['gold'],
    bronze: ['bronze'],
    purple: ['purple'],
};
const FACETS = [
    { words: ['diesel'], field: 'fuel', accepts: ['diesel'] },
    { words: ['petrol'], field: 'fuel', accepts: ['petrol'] },
    { words: ['hybrid'], field: 'fuel', accepts: ['hybrid'] },
    { words: ['electric', 'ev'], field: 'fuel', accepts: ['electric'] },
    { words: ['automatic', 'auto'], field: 'transmission', accepts: ['auto'] },
    { words: ['manual'], field: 'transmission', accepts: ['manual'] },
    { words: ['convertible', 'cabriolet', 'cabrio', 'cab', 'roadster', 'soft top'], field: 'bodyType', accepts: ['convertible', 'cabriolet', 'roadster'] },
    { words: ['estate'], field: 'bodyType', accepts: ['estate'] },
    { words: ['coupe'], field: 'bodyType', accepts: ['coupe'] },
    { words: ['saloon'], field: 'bodyType', accepts: ['saloon', 'sedan'] },
    { words: ['hatchback', 'hatch'], field: 'bodyType', accepts: ['hatch'] },
    { words: ['suv', '4x4'], field: 'bodyType', accepts: ['suv', '4x4', 'crossover'] },
];
/**
 * What people call cars. Longest phrase wins, so "range rover" is not read as a
 * Rover and "mini cooper" is not read as a small something.
 */
const ALIASES = [
    { phrase: 'range rover', make: 'land rover', model: 'range rover' },
    { phrase: 'land rover', make: 'land rover' },
    { phrase: 'mini cooper', make: 'mini', model: 'cooper' },
    { phrase: 'golf gti', make: 'volkswagen', model: 'golf', variant: 'gti' },
    { phrase: 'focus st', make: 'ford', model: 'focus', variant: 'st' },
    { phrase: 'astra gtc', make: 'vauxhall', model: 'astra', variant: 'gtc' },
    { phrase: 'a5 cab', make: 'audi', model: 'a5', bodyWord: 'cabriolet' },
    { phrase: 'volkswagen', make: 'volkswagen' },
    { phrase: 'boxster', make: 'porsche', model: 'boxster' },
    { phrase: 'boxter', make: 'porsche', model: 'boxster' },
    { phrase: 'boxer', make: 'porsche', model: 'boxster' },
    { phrase: 'rangie', make: 'land rover', model: 'range rover' },
    { phrase: 'landie', make: 'land rover' },
    { phrase: 'beemer', make: 'bmw' },
    { phrase: 'merc', make: 'mercedes' },
    { phrase: 'mx 5', make: 'mazda', model: 'mx' },
    { phrase: 'mx5', make: 'mazda', model: 'mx' },
    { phrase: 'rcz', make: 'peugeot', model: 'rcz' },
    { phrase: 'bmw', make: 'bmw' },
    { phrase: 'jag', make: 'jaguar' },
    { phrase: 'vw', make: 'volkswagen' },
    { phrase: 'z4', make: 'bmw', model: 'z4' },
].sort((a, b) => b.phrase.length - a.phrase.length);
const lower = (value) => String(value ?? '').toLowerCase();
/** Lower case, alphanumerics only, single-spaced and padded, so " phrase " can be looked for. */
const padded = (value) => ` ${String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const hasWord = (haystack, word) => haystack.includes(` ${word} `);
const removeWord = (haystack, word) => {
    let out = haystack;
    while (out.includes(` ${word} `))
        out = out.replace(` ${word} `, ' ');
    return out;
};
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Word-boundary test against an already lower-cased haystack. */
const wordIn = (haystack, word) => new RegExp(`(^|[^a-z0-9])${escape(word)}([^a-z0-9]|$)`).test(haystack);
/** A UK plate code as a model year: 13 -> 2013, 63 -> 2013, 07 -> 2007, 57 -> 2007. */
const plateCodeToYear = (code) => {
    if (code >= 1 && code <= 49)
        return 2000 + code;
    if (code >= 51 && code <= 99)
        return 2000 + code - 50;
    return undefined;
};
const EMPTY_QUERY = { years: [], colours: [], facets: [], aliases: [], tokens: [] };
/**
 * Pulls the strong signals out of what the customer wrote. Order matters: years
 * and plate codes come out before the nicknames so "the 07 plate porsche" does not
 * leave a stray "07", and nicknames come out before the colours so "a5 cab" is
 * read as an Audi and not as a stray "cab".
 */
const normaliseQueryText = (text) => {
    let raw = padded(text || '');
    if (raw.trim() === '')
        return EMPTY_QUERY;
    const years = [];
    const colours = [];
    const facets = [];
    const aliases = [];
    // "2007", "1998". Also catches the year in "2013 reg".
    raw = raw.replace(/ ((?:19|20)\d{2}) /g, (_match, digits) => {
        years.push(Number(digits));
        return ' ';
    });
    // "13 plate", "13-plate" (the dash is already a space), "63 reg", "a 13 plate".
    raw = raw.replace(/ (\d{2}) (?:plate|reg|registration) /g, (match, digits) => {
        const year = plateCodeToYear(Number(digits));
        if (year === undefined)
            return match;
        years.push(year);
        return ' ';
    });
    for (const alias of ALIASES) {
        if (!raw.includes(` ${alias.phrase} `))
            continue;
        aliases.push(alias);
        raw = removeWord(raw, alias.phrase);
        if (alias.bodyWord) {
            const facet = FACETS.find(f => f.words.includes(alias.bodyWord));
            if (facet && !facets.includes(facet))
                facets.push(facet);
        }
    }
    for (const [word, spellings] of Object.entries(COLOUR_WORDS)) {
        if (!hasWord(raw, word))
            continue;
        raw = removeWord(raw, word);
        for (const spelling of spellings)
            if (!colours.includes(spelling))
                colours.push(spelling);
    }
    for (const facet of FACETS) {
        const said = facet.words.find(word => hasWord(raw, word));
        if (!said)
            continue;
        raw = removeWord(raw, said);
        if (!facets.includes(facet))
            facets.push(facet);
    }
    const tokens = raw
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => token.length > 1 && !STOP_WORDS.has(token));
    return { years, colours, facets, aliases, tokens };
};
exports.normaliseQueryText = normaliseQueryText;
/**
 * The same description with the year and the colour taken out, for the "we have
 * not got that one, but..." follow-up search. Returns '' when nothing identifying
 * is left, which the caller should read as "there is nothing to widen to".
 */
const broadenQueryText = (text) => {
    const q = (0, exports.normaliseQueryText)(text);
    const parts = [];
    for (const alias of q.aliases)
        parts.push(alias.phrase);
    for (const facet of q.facets)
        parts.push(facet.words[0]);
    parts.push(...q.tokens);
    return parts.join(' ').trim();
};
exports.broadenQueryText = broadenQueryText;
const aliasHits = (item, alias) => {
    const make = lower(item.make);
    const model = lower(item.model);
    const title = lower(item.title);
    const variant = `${lower(item.variant)} ${title}`;
    if (alias.make && !(make.includes(alias.make) || title.includes(alias.make)))
        return false;
    if (alias.model && !(model.includes(alias.model) || title.includes(alias.model)))
        return false;
    if (alias.variant && !wordIn(variant, alias.variant))
        return false;
    return !!(alias.make || alias.model || alias.variant);
};
/** Letters and digits only, so "370z" lands on a model the site prints as "370 Z". */
const squash = (value) => lower(value).replace(/[^a-z0-9]/g, '');
/**
 * A loose token that lands on what the car actually is, rather than on its blurb.
 *
 * Make and model are matched as whole words and never on two letters: "all" sits
 * inside "Vauxhall", "can" inside "Taycan" and "be" inside half the plates on the
 * forecourt, which made "would it be possible to view the MX5" a close match on
 * an Astra (Steve, 30 Aug). Model codes with a digit ("370z") still match loosely,
 * and the two-letter names people really use ("z4", "vw") are aliases.
 */
const identityToken = (item, token) => token.length >= 3 && (wordIn(lower(item.make), token) ||
    wordIn(lower(item.model), token) ||
    wordIn(lower(item.variant), token) ||
    lower(item.reg).replace(/\s+/g, '').includes(token) ||
    (token.length >= 3 && /\d/.test(token) && /[a-z]/.test(token) && (squash(item.model).includes(token) || squash(item.title).includes(token))));
const identityOf = (item, q) => q.aliases.some(alias => aliasHits(item, alias)) || q.tokens.some(token => identityToken(item, token));
const colourHits = (item, q) => q.colours.some(spelling => lower(item.colour).includes(spelling));
const facetHits = (item, facet) => {
    const value = lower(item[facet.field]);
    return !!value && facet.accepts.some(accepted => value.includes(accepted));
};
/**
 * Colour and body/fuel/gearbox are filters, not hints: a customer asking for a red
 * convertible is not helped by a black hatchback, and brain/tools.ts is told to
 * widen the search itself when this comes back empty. An advert that does not
 * state the field at all is never excluded on it.
 */
const passesTextFilters = (item, q) => {
    if (q.colours.length && lower(item.colour) && !colourHits(item, q))
        return false;
    for (const facet of q.facets) {
        if (lower(item[facet.field]) && !facetHits(item, facet))
            return false;
    }
    return true;
};
const matches = (value, wanted) => {
    if (!wanted)
        return true;
    return String(value || '').toLowerCase().includes(wanted.toLowerCase().trim());
};
/** Score one advert against the customer's words, ignoring the year. 0 means nothing matched. */
const scoreItem = (item, q) => {
    let total = 0;
    for (const alias of q.aliases)
        if (aliasHits(item, alias))
            total += ALIAS_BONUS;
    for (const token of q.tokens) {
        if (identityToken(item, token))
            total += TOKEN_IDENTITY_BONUS;
        for (const { field, weight } of FIELD_WEIGHTS) {
            const haystack = lower(item[field]);
            if (haystack && haystack.includes(token))
                total += weight;
        }
        for (const feature of item.features || []) {
            if (feature.toLowerCase().includes(token))
                total += 1;
        }
    }
    if (q.colours.length && colourHits(item, q))
        total += COLOUR_BONUS;
    for (const facet of q.facets)
        if (facetHits(item, facet))
            total += FACET_BONUS;
    return total;
};
/**
 * The matcher itself, over a list already in memory. Exported so it can be tested
 * and driven from devRun without Firebase; `searchStock` is this plus a read.
 */
const rankStock = (items, query) => {
    const q = (0, exports.normaliseQueryText)(query.text);
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    // Colours, years and facets are filters; only these two put points on the board.
    const needsScore = q.tokens.length > 0 || q.aliases.length > 0;
    const scored = items
        .filter(item => {
        if (!item)
            return false;
        if (!query.includeHidden && item.hiddenReason)
            return false;
        if (!query.includeReserved && item.status !== 'available')
            return false;
        if (!matches(item.make, query.make))
            return false;
        if (!matches(item.model, query.model))
            return false;
        if (!matches(item.fuel, query.fuel))
            return false;
        if (!matches(item.transmission, query.transmission))
            return false;
        if (!matches(item.bodyType, query.bodyType))
            return false;
        if (query.maxPrice !== undefined && (item.price ?? 0) > query.maxPrice)
            return false;
        if (query.minYear !== undefined && (item.year ?? 0) < query.minYear)
            return false;
        return passesTextFilters(item, q);
    })
        .map(item => ({ item, base: scoreItem(item, q), identity: identityOf(item, q) }))
        .filter(entry => !needsScore || entry.base > 0);
    // The year they gave is a filter, tried exactly first and then a year either
    // side, because people misremember a plate year by one far more often than
    // they invent a car. An advert with no year on it is never excluded on year.
    const year = q.years[0];
    let inYear = scored;
    if (year !== undefined) {
        const tolerance = scored.some(entry => entry.item.year === year) ? 0 : 1;
        inYear = scored.filter(entry => entry.item.year === undefined || Math.abs(entry.item.year - year) <= tolerance);
    }
    const ranked = inYear.map(entry => {
        let total = entry.base;
        let quality = entry.identity ? 'close' : 'weak';
        if (year !== undefined && entry.item.year !== undefined) {
            if (entry.item.year === year) {
                total += YEAR_EXACT_BONUS;
                if (entry.identity)
                    quality = 'exact';
            }
            else if (Math.abs(entry.item.year - year) <= 1) {
                total += YEAR_NEAR_BONUS;
            }
        }
        return { item: entry.item, total, quality };
    });
    // A guess sitting underneath a real match only invites the model to offer it as
    // though it were one, so it is dropped rather than ranked last.
    const strong = ranked.filter(entry => entry.quality !== 'weak');
    const kept = strong.length ? strong : ranked;
    return kept
        .sort((a, b) => QUALITY_RANK[a.quality] - QUALITY_RANK[b.quality] ||
        b.total - a.total ||
        (a.item.price ?? 0) - (b.item.price ?? 0))
        .slice(0, limit)
        .map(entry => ({ ...entry.item, matchQuality: entry.quality, matchScore: entry.total }));
};
exports.rankStock = rankStock;
const readStock = async (companyId) => {
    const snap = await db().ref(`companies/${companyId}/salesAgent/stock`).once('value');
    const raw = snap.val();
    if (!raw)
        return [];
    return Object.values(raw).filter(item => !!item);
};
exports.readStock = readStock;
/**
 * Just the words in a message that name a car: nicknames, makes, models, variants,
 * plates, years and colours. Everything else is dropped.
 *
 * A whole email used to go through the matcher, and every filler word scored a
 * point on any advert whose blurb happened to use it. A sold MX-5 with a chatty
 * description then outranked the one for sale, and "would it be possible to view
 * the MX5 today" came back as "we do not know" (Tobias, 30 Aug).
 */
const carWordsOnly = (items, text) => {
    const q = (0, exports.normaliseQueryText)(text);
    const parts = [];
    for (const alias of q.aliases)
        parts.push(alias.phrase);
    for (const year of q.years)
        parts.push(String(year));
    for (const colour of q.colours)
        parts.push(colour);
    for (const facet of q.facets)
        parts.push(facet.words[0]);
    for (const token of q.tokens) {
        if (items.some(item => identityToken(item, token)))
            parts.push(token);
    }
    return parts.join(' ').trim();
};
exports.carWordsOnly = carWordsOnly;
const matchEnquiryStock = (items, hint) => {
    if (hint.stockId) {
        const exact = items.find(item => item.id === hint.stockId);
        if (exact)
            return exact;
    }
    if (hint.reg) {
        const reg = hint.reg.replace(/\s/g, '').toUpperCase();
        if (reg) {
            const exact = items.find(item => (item.reg || '').replace(/\s/g, '').toUpperCase() === reg);
            if (exact)
                return exact;
        }
    }
    const text = (0, exports.carWordsOnly)(items, hint.title || hint.text);
    if (!text)
        return null;
    const hits = (0, exports.rankStock)(items, { text, includeReserved: true, includeHidden: true, limit: 5 })
        .filter(hit => hit.matchQuality !== 'weak');
    if (!hits.length)
        return null;
    // A car that has gone only keeps the thread when the description clearly picks
    // it out — when it beats every car still for sale outright. A customer who
    // names the sold Taycan is asking about the sold Taycan. A customer who writes
    // "have you still got the Porsche" is not, and used to be pinned to it anyway,
    // which put the thread on the wrong dealer's ledger and had the agent quoting
    // a car that went months ago (Steve, 28 Aug).
    const live = hits.filter(hit => hit.status === 'available');
    const considered = live.length && live[0].matchScore >= hits[0].matchScore ? live : hits;
    const owners = new Set(considered.map(hit => hit.ownerCompanyId).filter(Boolean));
    if (owners.size > 1)
        return null;
    return considered[0];
};
exports.matchEnquiryStock = matchEnquiryStock;
const matchEnquiryStockForCompany = async (companyId, hint) => (0, exports.matchEnquiryStock)(await (0, exports.readStock)(companyId), hint);
exports.matchEnquiryStockForCompany = matchEnquiryStockForCompany;
/**
 * Best matches for what the customer asked about, surest first.
 * Returns [] rather than throwing when nothing is indexed yet.
 */
const searchStock = async (companyId, query) => (0, exports.rankStock)(await (0, exports.readStock)(companyId), query);
exports.searchStock = searchStock;
/**
 * How many cars are in the index at all, hidden ones included. 0 means the daily
 * scrape has never run or has been wiped, which is a very different thing from
 * "we have not got that car" and has to be said differently to the customer.
 */
const countStock = async (companyId) => {
    const snap = await db().ref(`companies/${companyId}/salesAgent/stock`).once('value');
    return snap.numChildren();
};
exports.countStock = countStock;
/**
 * One advert by its site listing id. Null when it isn't in the current index — and
 * equally null when it is another dealer's car, so the agent cannot reach one by
 * quoting an id it saw somewhere else.
 */
const getStockItem = async (companyId, id) => {
    if (!id)
        return null;
    const snap = await db().ref(`companies/${companyId}/salesAgent/stock/${id}`).once('value');
    const item = snap.val() || null;
    return item && !item.hiddenReason ? item : null;
};
exports.getStockItem = getStockItem;
/**
 * One line describing a car, the way you would say it out loud:
 * "2007 Porsche Boxster 3.4 S Tiptronic, Black, 62,000 miles, £10,995 (reg BC02YDG)".
 * This is what the brain gets instead of a field-by-field object, so it has to
 * carry everything the agent might repeat back and nothing it must not.
 */
const describeStockItem = (item) => {
    const head = [item.year, item.make, item.model, item.variant]
        .map(part => String(part ?? '').trim())
        .filter(Boolean)
        .join(' ') || String(item.title || '').trim();
    const bits = [head];
    if (item.colour)
        bits.push(item.colour);
    if (typeof item.mileage === 'number' && item.mileage > 0)
        bits.push(`${item.mileage.toLocaleString('en-GB')} miles`);
    if (typeof item.price === 'number' && item.price > 0)
        bits.push(`£${item.price.toLocaleString('en-GB')}`);
    let line = bits.join(', ');
    if (item.reg)
        line += ` (reg ${item.reg})`;
    if (typeof item.owners === 'number')
        line += `, ${item.owners} previous owner${item.owners === 1 ? '' : 's'}`;
    if (item.motExpiry)
        line += `, MOT ${item.motExpiry}`;
    if (item.ulezCompliant === true)
        line += ', ULEZ compliant';
    if (item.ulezCompliant === false)
        line += ', not ULEZ compliant';
    if (item.status && item.status !== 'available')
        line += `, currently ${item.status}`;
    return line;
};
exports.describeStockItem = describeStockItem;
//# sourceMappingURL=search.js.map