"use strict";
/**
 * Scraper for the dealership's Car Dealer 5 (Symphony) website.
 *
 * Pure HTTP and parsing — no firebase, no database. `stock/index.ts` owns the
 * ledger matching and the writes, so everything here can be run against a saved
 * page of HTML or pointed at the live site from a plain node script.
 *
 * Selectors, read off radlettcarsales.com on 26 Aug 2026:
 *   list page     .list-box-wrapper                    one card per vehicle
 *                 a.imgspin[href]                      /cars/{make}/{model}/{variant}/{id}/
 *                 .view-car-details h3 > strong        make, e.g. "MASERATI"
 *                 .view-car-details h5                 "Coupe 4.2 Cambiocorsa (2007)"
 *                 .car-actual-price                    "£24,995" (a second one reads "RESERVED")
 *                 .keyfacts-ul li[title]               Miles / Fuel / Transmission / CC
 *                 .car-list-re-innerbox-1 / -2         finance table, "Monthly pmt"
 *                 img.stock-imgs[data-src]             listing photo
 *                 .pagination a[href]                  /page/used/cars/{offset}/0/0/0
 *   vehicle page  body[class]                          ON_FORECOURT | RESERVED | SOLD
 *                 body[data-vehicle-id]                site listing id
 *                 .carfacts-list-group li              <span>LABEL</span><h3>VALUE</h3>
 *                 .technical-data-summary-reveal       Body Type / Reg Date / MOT Exp Date
 *                 .disp_text                           dealer blurb
 *                 #CD5features .m104_standardline1Div  feature list
 *                 var carvrm = "LN22XAU"               registration — script tag only
 *
 * The site exposes no service-history field of its own; where the dealer has
 * mentioned it, it is in the blurb, so that is where it gets read from.
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
exports.scrapeStock = exports.parseVehiclePage = exports.parseListPage = exports.idFromVehicleUrl = exports.splitSubtitle = exports.titleCaseName = exports.USER_AGENT = void 0;
const cheerio = __importStar(require("cheerio"));
exports.USER_AGENT = 'DealerLedgerPro-StockIndex (+https://dealerledgerpro.web.app)';
const DEFAULT_REQUEST_GAP_MS = 300;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_MAX_VEHICLES = 250;
const MAX_LIST_PAGES = 30;
const DESCRIPTION_MAX_CHARS = 1500;
const MAX_FEATURES = 100;
/** Makes and trim badges that read wrong when capitalised as ordinary words. */
const KEEP_UPPERCASE = new Set(['BMW', 'MG', 'DS', 'VW', 'SEAT', 'AMG', 'GT', 'GTI', 'GTD', 'TT', 'RS', 'SUV', 'MPV']);
/** Used to split "Coupe 4.2 Cambiocorsa" into a body type and a trim. Longest first. */
const BODY_TYPES = [
    'Combi Van', 'Panel Van', 'Estate Car', 'Convertible', 'Cabriolet', 'Hatchback',
    'Roadster', 'Pickup', 'Saloon', 'Coupe', 'Estate', 'Saloon', 'MPV', 'SUV', 'Van', '4x4',
];
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
/** Digits-only parse. Returns undefined rather than NaN so the field can just be omitted. */
const toInt = (value) => {
    const digits = clean(value).replace(/[^\d]/g, '');
    if (!digits)
        return undefined;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) ? n : undefined;
};
/** "£24,995" -> 24995, "£834.40" -> 834.4, "POA" -> undefined. */
const toMoney = (value) => {
    const match = clean(value).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    if (!match)
        return undefined;
    const n = parseFloat(match[0]);
    return Number.isFinite(n) ? n : undefined;
};
/**
 * "4,244cc" and "4244CC" both become "4244cc". An EV reports 0cc, which is true
 * but reads like a fault, so it is dropped instead.
 */
const toEngineSize = (value) => {
    const cc = toInt(value);
    return cc ? `${cc}cc` : undefined;
};
/** "25-06-2026" -> "2026-06-25". Anything else is passed through untouched. */
const toIsoDate = (value) => {
    const text = clean(value);
    if (!text)
        return undefined;
    const uk = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (uk)
        return `${uk[3]}-${uk[2]}-${uk[1]}`;
    return text;
};
const titleCaseToken = (token) => {
    if (!token)
        return token;
    if (KEEP_UPPERCASE.has(token.toUpperCase()))
        return token.toUpperCase();
    // The site shouts everything, so a short all-caps model word is a badge rather
    // than a word: "XF", "SLK" and "GTC" stay put, "AUDI" and "FOCUS" don't.
    if (token.length <= 3 && /^[A-Z]+$/.test(token))
        return token;
    // "X4", "MX-5", "93.4kWh" are already written the way they should read.
    if (/\d/.test(token))
        return token;
    if (token.includes('-'))
        return token.split('-').map(titleCaseToken).join('-');
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
};
/** The site shouts its makes and models ("MERCEDES-BENZ"); the agent shouldn't. */
const titleCaseName = (value) => clean(value).split(' ').filter(Boolean).map(titleCaseToken).join(' ');
exports.titleCaseName = titleCaseName;
/**
 * "Estate Performance Plus 93.4kWh 4S (2022)" -> body "Estate", variant
 * "Performance Plus 93.4kWh 4S", year 2022.
 */
const splitSubtitle = (subtitle, bodyTypeHint) => {
    let rest = clean(subtitle);
    let year;
    const yearMatch = rest.match(/\((\d{4})\)\s*$/);
    if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
        rest = clean(rest.slice(0, yearMatch.index));
    }
    const candidates = bodyTypeHint ? [clean(bodyTypeHint), ...BODY_TYPES] : BODY_TYPES;
    let bodyType = bodyTypeHint ? clean(bodyTypeHint) || undefined : undefined;
    for (const candidate of candidates) {
        if (!candidate)
            continue;
        const lead = new RegExp(`^${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (!lead.test(rest))
            continue;
        bodyType = bodyType || candidate;
        rest = clean(rest.slice(candidate.length));
        break;
    }
    return { variant: rest, bodyType, year };
};
exports.splitSubtitle = splitSubtitle;
/** "/cars/maserati/coupe/4.2-cambiocorsa/1708024/" -> "1708024". */
const idFromVehicleUrl = (url) => url.match(/\/(\d+)\/?(?:[?#].*)?$/)?.[1];
exports.idFromVehicleUrl = idFromVehicleUrl;
const absolute = (href, base) => {
    try {
        return new URL(href, base).toString();
    }
    catch {
        return undefined;
    }
};
const errorMessage = (error) => error instanceof Error ? error.message : String(error);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
/** Cards plus pagination from one page of the stock list. */
const parseListPage = (html, pageUrl) => {
    const $ = cheerio.load(html);
    const cards = [];
    $('.list-box-wrapper').each((_, element) => {
        const $card = $(element);
        const href = $card.find('a.imgspin').first().attr('href') ||
            $card.find('.detail-car-btn a').first().attr('href') ||
            '';
        const url = href ? absolute(href, pageUrl) : undefined;
        const id = url ? (0, exports.idFromVehicleUrl)(url) : undefined;
        if (!url || !id)
            return;
        const $heading = $card.find('.view-car-details h3').first();
        const rawMake = clean($heading.find('strong').first().text());
        const rawHeading = clean($heading.text());
        const rawModel = rawHeading.toUpperCase().startsWith(rawMake.toUpperCase())
            ? clean(rawHeading.slice(rawMake.length))
            : rawHeading;
        const { variant, bodyType, year } = (0, exports.splitSubtitle)($card.find('.view-car-details h5').first().text());
        // Key facts carry their meaning in the title attribute, not their position.
        const facts = {};
        $card.find('.keyfacts-ul li').each((__, li) => {
            const key = clean($(li).attr('title')).toLowerCase();
            if (key)
                facts[key] = clean($(li).text());
        });
        // The finance table is a run of label/value pairs; "Monthly pmt" is the one worth keeping.
        let monthlyFrom;
        $card.find('.car-list-re-innerbox-1').each((__, label) => {
            if (!/monthly/i.test(clean($(label).text())))
                return;
            monthlyFrom = monthlyFrom ?? toMoney($(label).nextAll('.car-list-re-innerbox-2').first().text());
        });
        const $image = $card.find('img.stock-imgs').first();
        const imageUrl = clean($image.attr('data-src')) || clean($image.attr('src')) || undefined;
        const wrapperClasses = clean($card.attr('class')).toLowerCase();
        const badge = clean($card.find('.ribbon .inner-ribbon').first().text()).toLowerCase();
        const status = wrapperClasses.includes('sold') || badge.includes('sold') ? 'sold'
            : wrapperClasses.includes('reserved') || badge.includes('reserved') ? 'reserved'
                : 'available';
        const card = {
            id,
            url,
            make: (0, exports.titleCaseName)(rawMake),
            model: (0, exports.titleCaseName)(rawModel),
            variant,
            title: clean([(0, exports.titleCaseName)(rawMake), (0, exports.titleCaseName)(rawModel), variant].join(' ')),
            price: toMoney($card.find('.car-actual-price').first().text()) ?? 0,
            status,
        };
        if (monthlyFrom !== undefined)
            card.monthlyFrom = monthlyFrom;
        if (year !== undefined)
            card.year = year;
        if (bodyType)
            card.bodyType = bodyType;
        if (imageUrl)
            card.imageUrl = imageUrl;
        const mileage = toInt(facts['miles']);
        if (mileage !== undefined)
            card.mileage = mileage;
        if (facts['fuel'])
            card.fuel = facts['fuel'];
        if (facts['transmission'])
            card.transmission = facts['transmission'];
        const engineSize = toEngineSize(facts['cc']);
        if (engineSize)
            card.engineSize = engineSize;
        cards.push(card);
    });
    const pageUrls = [];
    $('.pagination a[href]').each((_, anchor) => {
        const href = clean($(anchor).attr('href'));
        if (!href || href === '#')
            return;
        const resolved = absolute(href, pageUrl);
        if (!resolved || !/\/page\/used\//.test(resolved))
            return;
        if (!pageUrls.includes(resolved))
            pageUrls.push(resolved);
    });
    return { cards, pageUrls };
};
exports.parseListPage = parseListPage;
/** Everything a vehicle's own page adds on top of its listing card. */
const parseVehiclePage = (html, pageUrl) => {
    const $ = cheerio.load(html);
    const result = {};
    const id = clean($('body').attr('data-vehicle-id')) || (0, exports.idFromVehicleUrl)(pageUrl);
    if (id)
        result.id = id;
    result.url = pageUrl;
    const bodyClasses = clean($('body').attr('class')).toUpperCase();
    if (bodyClasses.includes('SOLD'))
        result.status = 'sold';
    else if (bodyClasses.includes('RESERVED'))
        result.status = 'reserved';
    else if (bodyClasses.includes('ON_FORECOURT'))
        result.status = 'available';
    // The key-facts strip is repeated once per tab; they are identical, so take one.
    const facts = {};
    $('.carfacts-list-group').first().find('li').each((_, li) => {
        const key = clean($(li).find('span').first().text()).toUpperCase();
        if (key)
            facts[key] = clean($(li).find('h3').first().text());
    });
    // Body Type / Reg Date / MOT Exp Date live in the tech-spec summary tiles; the
    // fuller table below them (note the underscore in its class names) carries the
    // manufacturer figures. The tiles win where both name the same thing.
    const specs = {};
    $('.technical-data-summary-reveal').each((_, tile) => {
        const key = clean($(tile).find('.technical-data-label').first().text()).toUpperCase();
        if (key)
            specs[key] = clean($(tile).find('.technical-data-value').first().text());
    });
    $('.technical-data').each((_, row) => {
        const key = clean($(row).find('.technical-data_label').first().text()).toUpperCase();
        if (key && !specs[key])
            specs[key] = clean($(row).find('.technical-data_value').first().text());
    });
    const $heading = $('.desc_title h1').first();
    const rawMake = clean($heading.find('strong').first().text());
    const rawHeading = clean($heading.text());
    if (rawMake)
        result.make = (0, exports.titleCaseName)(rawMake);
    if (rawHeading) {
        const rawModel = rawHeading.toUpperCase().startsWith(rawMake.toUpperCase())
            ? clean(rawHeading.slice(rawMake.length))
            : rawHeading;
        if (rawModel)
            result.model = (0, exports.titleCaseName)(rawModel);
    }
    const bodyType = facts['CATEGORY'] || specs['BODY TYPE'];
    const { variant, bodyType: derivedBody, year } = (0, exports.splitSubtitle)($('.desc_title h2').first().text(), bodyType);
    if (variant)
        result.variant = variant;
    if (derivedBody)
        result.bodyType = derivedBody;
    if (result.make && result.model) {
        result.title = clean([result.make, result.model, result.variant || variant].join(' '));
    }
    const price = toMoney($('.show-price h2').first().text());
    if (price !== undefined)
        result.price = price;
    const monthlyFrom = toMoney($('.show-price .sub_price strong').first().text());
    if (monthlyFrom !== undefined)
        result.monthlyFrom = monthlyFrom;
    const resolvedYear = toInt(facts['YEAR']) ?? year ?? toInt(toIsoDate(specs['REG DATE'])?.slice(0, 4));
    if (resolvedYear !== undefined)
        result.year = resolvedYear;
    const mileage = toInt(facts['MILEAGE']);
    if (mileage !== undefined)
        result.mileage = mileage;
    if (facts['FUEL'])
        result.fuel = facts['FUEL'];
    if (facts['TRANSMISSION'])
        result.transmission = facts['TRANSMISSION'];
    if (facts['COLOUR'])
        result.colour = (0, exports.titleCaseName)(facts['COLOUR']);
    const engineSize = toEngineSize(facts['CC'] || specs['ENGINE CAPACITY']);
    if (engineSize)
        result.engineSize = engineSize;
    // The key-facts tile is labelled "FORMER KEEPERS" (plural); the singular is kept in
    // case the theme ever changes it back. The JSON-LD block carries the same figure.
    const owners = toInt(facts['FORMER KEEPERS'] ?? facts['FORMER KEEPER'])
        ?? toInt(html.match(/"numberOfPreviousOwners"\s*:\s*"?(\d+)/)?.[1]);
    if (owners !== undefined)
        result.owners = owners;
    const motExpiry = toIsoDate(specs['MOT EXP DATE']);
    if (motExpiry)
        result.motExpiry = motExpiry;
    // The registration is only ever printed into a script tag for the finance plugin.
    const reg = html.match(/var\s+carvrm\s*=\s*["']([A-Z0-9 ]{2,10})["']/i)?.[1];
    if (reg && clean(reg))
        result.reg = clean(reg).toUpperCase();
    const description = clean($('.disp_text').first().text());
    if (description)
        result.description = description.slice(0, DESCRIPTION_MAX_CHARS).trim();
    // No structured service-history field exists; the dealer writes it into the blurb.
    const serviceHistory = description.match(/\b(full(?:\s+\w+)?\s+service\s+history|part(?:ial)?\s+service\s+history|service\s+history)\b/i)?.[1];
    if (serviceHistory)
        result.serviceHistory = clean(serviceHistory);
    const features = [];
    $('#CD5features .m104_standardline1Div').each((_, node) => {
        const feature = clean($(node).text());
        if (feature && !features.includes(feature))
            features.push(feature);
    });
    if (features.length)
        result.features = features.slice(0, MAX_FEATURES);
    const imageUrl = clean($('meta[property="og:image"]').first().attr('content'));
    if (imageUrl)
        result.imageUrl = imageUrl;
    return result;
};
exports.parseVehiclePage = parseVehiclePage;
/** A listing card is only usable as a StockItem once it has the required fields. */
const toStockItem = (card, detail) => {
    const merged = { ...card, ...detail };
    // The card's photo is the one the dealer chose for the grid; og:image is a fallback.
    if (card.imageUrl)
        merged.imageUrl = card.imageUrl;
    // A vehicle page with no price block shouldn't wipe the price off the card.
    if (merged.price === undefined || merged.price === 0)
        merged.price = card.price ?? 0;
    if (!merged.id || !merged.url || !merged.make || !merged.model)
        return undefined;
    return {
        ...merged,
        id: merged.id,
        url: merged.url,
        make: merged.make,
        model: merged.model,
        variant: merged.variant || '',
        title: merged.title || clean([merged.make, merged.model, merged.variant].join(' ')),
        price: merged.price ?? 0,
        status: merged.status || 'available',
    };
};
/**
 * Fetch one page of HTML. Non-2xx is an error rather than an empty parse, so a
 * site-wide outage shows up in stockMeta.errors instead of looking like "no stock".
 */
const fetchHtml = async (url, timeoutMs, fetchImpl) => {
    const response = await fetchImpl(url, {
        headers: { 'User-Agent': exports.USER_AGENT, 'Accept': 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok)
        throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
};
/**
 * Walk the stock list, then every vehicle page, one request at a time with a gap
 * between them. Anything that fails is recorded and the walk carries on: a single
 * broken vehicle page must not cost the dealership its whole index.
 */
const scrapeStock = async (options) => {
    const { stockListUrl, deadline, maxVehicles = DEFAULT_MAX_VEHICLES, requestGapMs = DEFAULT_REQUEST_GAP_MS, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, fetchImpl = fetch, } = options;
    const errors = [];
    let pagesFetched = 0;
    let firstRequest = true;
    const outOfTime = () => deadline !== undefined && Date.now() >= deadline;
    const get = async (url) => {
        if (!firstRequest && requestGapMs > 0)
            await sleep(requestGapMs);
        firstRequest = false;
        pagesFetched++;
        return fetchHtml(url, requestTimeoutMs, fetchImpl);
    };
    const cards = new Map();
    const visited = new Set();
    const queue = [stockListUrl];
    while (queue.length && visited.size < MAX_LIST_PAGES) {
        const url = queue.shift();
        if (visited.has(url))
            continue;
        visited.add(url);
        if (outOfTime()) {
            errors.push('Ran out of time before every page of results was read');
            break;
        }
        try {
            const { cards: pageCards, pageUrls } = (0, exports.parseListPage)(await get(url), url);
            for (const card of pageCards)
                if (!cards.has(card.id))
                    cards.set(card.id, card);
            for (const next of pageUrls)
                if (!visited.has(next) && !queue.includes(next))
                    queue.push(next);
        }
        catch (error) {
            errors.push(`Stock list page failed (${url}): ${errorMessage(error)}`);
        }
    }
    const all = Array.from(cards.values());
    const wanted = all.slice(0, maxVehicles);
    if (all.length > wanted.length) {
        errors.push(`Listing had ${all.length} vehicles; only the first ${maxVehicles} were indexed`);
    }
    const items = [];
    let reportedTimeout = false;
    for (const card of wanted) {
        let detail = {};
        if (outOfTime()) {
            if (!reportedTimeout) {
                errors.push('Ran out of time; the remaining vehicles were indexed from the stock list only');
                reportedTimeout = true;
            }
            // Keep going with list-only data — a thin record beats a missing car.
            const listOnly = toStockItem(card, {});
            if (listOnly)
                items.push(listOnly);
            continue;
        }
        try {
            detail = (0, exports.parseVehiclePage)(await get(card.url), card.url);
        }
        catch (error) {
            errors.push(`Vehicle page failed (${card.url}): ${errorMessage(error)}`);
        }
        const item = toStockItem(card, detail);
        if (item)
            items.push(item);
        else
            errors.push(`Skipped a listing with no usable make/model: ${card.url}`);
    }
    return { items, errors, pagesFetched };
};
exports.scrapeStock = scrapeStock;
//# sourceMappingURL=scrape.js.map