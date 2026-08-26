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

import * as cheerio from 'cheerio';

import { StockItem } from '../types';

/** What a scrape can know. The ledger supplies the rest of a StockItem. */
export type ScrapedStockItem = Omit<StockItem, 'ledgerVehicleId' | 'indexedAt'>;

export interface ScrapeOptions {
    /** Listing page to start from, e.g. https://radlettcarsales.com/used/cars/radlett/ */
    stockListUrl: string;
    /** Stop starting new requests once this epoch-ms deadline passes. */
    deadline?: number;
    /** Safety net against a runaway listing; the overflow is reported, not dropped silently. */
    maxVehicles?: number;
    /** Politeness gap between requests. */
    requestGapMs?: number;
    requestTimeoutMs?: number;
    /** Swappable for tests. */
    fetchImpl?: typeof fetch;
}

export interface ScrapeResult {
    items: ScrapedStockItem[];
    /** Non-fatal problems: a vehicle page that failed, a page of results that 404'd. */
    errors: string[];
    /** How many HTML documents were fetched, listing pages included. */
    pagesFetched: number;
}

export const USER_AGENT = 'DealerLedgerPro-StockIndex (+https://dealerledgerpro.web.app)';

const DEFAULT_REQUEST_GAP_MS = 300;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
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

const clean = (value: string | undefined | null): string =>
    String(value ?? '').replace(/\s+/g, ' ').trim();

/** Digits-only parse. Returns undefined rather than NaN so the field can just be omitted. */
const toInt = (value: string | undefined): number | undefined => {
    const digits = clean(value).replace(/[^\d]/g, '');
    if (!digits) return undefined;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) ? n : undefined;
};

/** "£24,995" -> 24995, "£834.40" -> 834.4, "POA" -> undefined. */
const toMoney = (value: string | undefined): number | undefined => {
    const match = clean(value).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    if (!match) return undefined;
    const n = parseFloat(match[0]);
    return Number.isFinite(n) ? n : undefined;
};

/**
 * "4,244cc" and "4244CC" both become "4244cc". An EV reports 0cc, which is true
 * but reads like a fault, so it is dropped instead.
 */
const toEngineSize = (value: string | undefined): string | undefined => {
    const cc = toInt(value);
    return cc ? `${cc}cc` : undefined;
};

/** "25-06-2026" -> "2026-06-25". Anything else is passed through untouched. */
const toIsoDate = (value: string | undefined): string | undefined => {
    const text = clean(value);
    if (!text) return undefined;
    const uk = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (uk) return `${uk[3]}-${uk[2]}-${uk[1]}`;
    return text;
};

const titleCaseToken = (token: string): string => {
    if (!token) return token;
    if (KEEP_UPPERCASE.has(token.toUpperCase())) return token.toUpperCase();
    // The site shouts everything, so a short all-caps model word is a badge rather
    // than a word: "XF", "SLK" and "GTC" stay put, "AUDI" and "FOCUS" don't.
    if (token.length <= 3 && /^[A-Z]+$/.test(token)) return token;
    // "X4", "MX-5", "93.4kWh" are already written the way they should read.
    if (/\d/.test(token)) return token;
    if (token.includes('-')) return token.split('-').map(titleCaseToken).join('-');
    return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
};

/** The site shouts its makes and models ("MERCEDES-BENZ"); the agent shouldn't. */
export const titleCaseName = (value: string): string =>
    clean(value).split(' ').filter(Boolean).map(titleCaseToken).join(' ');

/**
 * "Estate Performance Plus 93.4kWh 4S (2022)" -> body "Estate", variant
 * "Performance Plus 93.4kWh 4S", year 2022.
 */
export const splitSubtitle = (
    subtitle: string,
    bodyTypeHint?: string
): { variant: string; bodyType?: string; year?: number } => {
    let rest = clean(subtitle);

    let year: number | undefined;
    const yearMatch = rest.match(/\((\d{4})\)\s*$/);
    if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
        rest = clean(rest.slice(0, yearMatch.index));
    }

    const candidates = bodyTypeHint ? [clean(bodyTypeHint), ...BODY_TYPES] : BODY_TYPES;
    let bodyType = bodyTypeHint ? clean(bodyTypeHint) || undefined : undefined;

    for (const candidate of candidates) {
        if (!candidate) continue;
        const lead = new RegExp(`^${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (!lead.test(rest)) continue;
        bodyType = bodyType || candidate;
        rest = clean(rest.slice(candidate.length));
        break;
    }

    return { variant: rest, bodyType, year };
};

/** "/cars/maserati/coupe/4.2-cambiocorsa/1708024/" -> "1708024". */
export const idFromVehicleUrl = (url: string): string | undefined =>
    url.match(/\/(\d+)\/?(?:[?#].*)?$/)?.[1];

const absolute = (href: string, base: string): string | undefined => {
    try {
        return new URL(href, base).toString();
    } catch {
        return undefined;
    }
};

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** One card off a listing page. Enough to describe a car if its own page can't be read. */
export interface ListingCard extends Partial<ScrapedStockItem> {
    id: string;
    url: string;
}

export interface ParsedListPage {
    cards: ListingCard[];
    /** Absolute URLs of the other pages of results this page links to. */
    pageUrls: string[];
}

/** Cards plus pagination from one page of the stock list. */
export const parseListPage = (html: string, pageUrl: string): ParsedListPage => {
    const $ = cheerio.load(html);
    const cards: ListingCard[] = [];

    $('.list-box-wrapper').each((_, element) => {
        const $card = $(element);

        const href =
            $card.find('a.imgspin').first().attr('href') ||
            $card.find('.detail-car-btn a').first().attr('href') ||
            '';
        const url = href ? absolute(href, pageUrl) : undefined;
        const id = url ? idFromVehicleUrl(url) : undefined;
        if (!url || !id) return;

        const $heading = $card.find('.view-car-details h3').first();
        const rawMake = clean($heading.find('strong').first().text());
        const rawHeading = clean($heading.text());
        const rawModel = rawHeading.toUpperCase().startsWith(rawMake.toUpperCase())
            ? clean(rawHeading.slice(rawMake.length))
            : rawHeading;

        const { variant, bodyType, year } = splitSubtitle($card.find('.view-car-details h5').first().text());

        // Key facts carry their meaning in the title attribute, not their position.
        const facts: Record<string, string> = {};
        $card.find('.keyfacts-ul li').each((__, li) => {
            const key = clean($(li).attr('title')).toLowerCase();
            if (key) facts[key] = clean($(li).text());
        });

        // The finance table is a run of label/value pairs; "Monthly pmt" is the one worth keeping.
        let monthlyFrom: number | undefined;
        $card.find('.car-list-re-innerbox-1').each((__, label) => {
            if (!/monthly/i.test(clean($(label).text()))) return;
            monthlyFrom = monthlyFrom ?? toMoney($(label).nextAll('.car-list-re-innerbox-2').first().text());
        });

        const $image = $card.find('img.stock-imgs').first();
        const imageUrl = clean($image.attr('data-src')) || clean($image.attr('src')) || undefined;

        const wrapperClasses = clean($card.attr('class')).toLowerCase();
        const badge = clean($card.find('.ribbon .inner-ribbon').first().text()).toLowerCase();
        const status: StockItem['status'] =
            wrapperClasses.includes('sold') || badge.includes('sold') ? 'sold'
                : wrapperClasses.includes('reserved') || badge.includes('reserved') ? 'reserved'
                    : 'available';

        const card: ListingCard = {
            id,
            url,
            make: titleCaseName(rawMake),
            model: titleCaseName(rawModel),
            variant,
            title: clean([titleCaseName(rawMake), titleCaseName(rawModel), variant].join(' ')),
            price: toMoney($card.find('.car-actual-price').first().text()) ?? 0,
            status,
        };

        if (monthlyFrom !== undefined) card.monthlyFrom = monthlyFrom;
        if (year !== undefined) card.year = year;
        if (bodyType) card.bodyType = bodyType;
        if (imageUrl) card.imageUrl = imageUrl;

        const mileage = toInt(facts['miles']);
        if (mileage !== undefined) card.mileage = mileage;
        if (facts['fuel']) card.fuel = facts['fuel'];
        if (facts['transmission']) card.transmission = facts['transmission'];
        const engineSize = toEngineSize(facts['cc']);
        if (engineSize) card.engineSize = engineSize;

        cards.push(card);
    });

    const pageUrls: string[] = [];
    $('.pagination a[href]').each((_, anchor) => {
        const href = clean($(anchor).attr('href'));
        if (!href || href === '#') return;
        const resolved = absolute(href, pageUrl);
        if (!resolved || !/\/page\/used\//.test(resolved)) return;
        if (!pageUrls.includes(resolved)) pageUrls.push(resolved);
    });

    return { cards, pageUrls };
};

/** Everything a vehicle's own page adds on top of its listing card. */
export const parseVehiclePage = (html: string, pageUrl: string): Partial<ScrapedStockItem> => {
    const $ = cheerio.load(html);
    const result: Partial<ScrapedStockItem> = {};

    const id = clean($('body').attr('data-vehicle-id')) || idFromVehicleUrl(pageUrl);
    if (id) result.id = id;
    result.url = pageUrl;

    const bodyClasses = clean($('body').attr('class')).toUpperCase();
    if (bodyClasses.includes('SOLD')) result.status = 'sold';
    else if (bodyClasses.includes('RESERVED')) result.status = 'reserved';
    else if (bodyClasses.includes('ON_FORECOURT')) result.status = 'available';

    // The key-facts strip is repeated once per tab; they are identical, so take one.
    const facts: Record<string, string> = {};
    $('.carfacts-list-group').first().find('li').each((_, li) => {
        const key = clean($(li).find('span').first().text()).toUpperCase();
        if (key) facts[key] = clean($(li).find('h3').first().text());
    });

    // Body Type / Reg Date / MOT Exp Date live in the tech-spec summary tiles; the
    // fuller table below them (note the underscore in its class names) carries the
    // manufacturer figures. The tiles win where both name the same thing.
    const specs: Record<string, string> = {};
    $('.technical-data-summary-reveal').each((_, tile) => {
        const key = clean($(tile).find('.technical-data-label').first().text()).toUpperCase();
        if (key) specs[key] = clean($(tile).find('.technical-data-value').first().text());
    });
    $('.technical-data').each((_, row) => {
        const key = clean($(row).find('.technical-data_label').first().text()).toUpperCase();
        if (key && !specs[key]) specs[key] = clean($(row).find('.technical-data_value').first().text());
    });

    const $heading = $('.desc_title h1').first();
    const rawMake = clean($heading.find('strong').first().text());
    const rawHeading = clean($heading.text());
    if (rawMake) result.make = titleCaseName(rawMake);
    if (rawHeading) {
        const rawModel = rawHeading.toUpperCase().startsWith(rawMake.toUpperCase())
            ? clean(rawHeading.slice(rawMake.length))
            : rawHeading;
        if (rawModel) result.model = titleCaseName(rawModel);
    }

    const bodyType = facts['CATEGORY'] || specs['BODY TYPE'];
    const { variant, bodyType: derivedBody, year } = splitSubtitle(
        $('.desc_title h2').first().text(),
        bodyType
    );
    if (variant) result.variant = variant;
    if (derivedBody) result.bodyType = derivedBody;

    if (result.make && result.model) {
        result.title = clean([result.make, result.model, result.variant || variant].join(' '));
    }

    const price = toMoney($('.show-price h2').first().text());
    if (price !== undefined) result.price = price;

    const monthlyFrom = toMoney($('.show-price .sub_price strong').first().text());
    if (monthlyFrom !== undefined) result.monthlyFrom = monthlyFrom;

    const resolvedYear = toInt(facts['YEAR']) ?? year ?? toInt(toIsoDate(specs['REG DATE'])?.slice(0, 4));
    if (resolvedYear !== undefined) result.year = resolvedYear;

    const mileage = toInt(facts['MILEAGE']);
    if (mileage !== undefined) result.mileage = mileage;

    if (facts['FUEL']) result.fuel = facts['FUEL'];
    if (facts['TRANSMISSION']) result.transmission = facts['TRANSMISSION'];
    if (facts['COLOUR']) result.colour = titleCaseName(facts['COLOUR']);
    const engineSize = toEngineSize(facts['CC'] || specs['ENGINE CAPACITY']);
    if (engineSize) result.engineSize = engineSize;

    // The key-facts tile is labelled "FORMER KEEPERS" (plural); the singular is kept in
    // case the theme ever changes it back. The JSON-LD block carries the same figure.
    const owners = toInt(facts['FORMER KEEPERS'] ?? facts['FORMER KEEPER'])
        ?? toInt(html.match(/"numberOfPreviousOwners"\s*:\s*"?(\d+)/)?.[1]);
    if (owners !== undefined) result.owners = owners;

    const motExpiry = toIsoDate(specs['MOT EXP DATE']);
    if (motExpiry) result.motExpiry = motExpiry;

    // The registration is only ever printed into a script tag for the finance plugin.
    const reg = html.match(/var\s+carvrm\s*=\s*["']([A-Z0-9 ]{2,10})["']/i)?.[1];
    if (reg && clean(reg)) result.reg = clean(reg).toUpperCase();

    const description = clean($('.disp_text').first().text());
    if (description) result.description = description.slice(0, DESCRIPTION_MAX_CHARS).trim();

    // No structured service-history field exists; the dealer writes it into the blurb.
    const serviceHistory = description.match(/\b(full(?:\s+\w+)?\s+service\s+history|part(?:ial)?\s+service\s+history|service\s+history)\b/i)?.[1];
    if (serviceHistory) result.serviceHistory = clean(serviceHistory);

    const features: string[] = [];
    $('#CD5features .m104_standardline1Div').each((_, node) => {
        const feature = clean($(node).text());
        if (feature && !features.includes(feature)) features.push(feature);
    });
    if (features.length) result.features = features.slice(0, MAX_FEATURES);

    const imageUrl = clean($('meta[property="og:image"]').first().attr('content'));
    if (imageUrl) result.imageUrl = imageUrl;

    return result;
};

/** A listing card is only usable as a StockItem once it has the required fields. */
const toStockItem = (card: ListingCard, detail: Partial<ScrapedStockItem>): ScrapedStockItem | undefined => {
    const merged: Partial<ScrapedStockItem> = { ...card, ...detail };

    // The card's photo is the one the dealer chose for the grid; og:image is a fallback.
    if (card.imageUrl) merged.imageUrl = card.imageUrl;
    // A vehicle page with no price block shouldn't wipe the price off the card.
    if (merged.price === undefined || merged.price === 0) merged.price = card.price ?? 0;

    if (!merged.id || !merged.url || !merged.make || !merged.model) return undefined;

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
const fetchHtml = async (
    url: string,
    timeoutMs: number,
    fetchImpl: typeof fetch
): Promise<string> => {
    const response = await fetchImpl(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
};

/**
 * Walk the stock list, then every vehicle page, one request at a time with a gap
 * between them. Anything that fails is recorded and the walk carries on: a single
 * broken vehicle page must not cost the dealership its whole index.
 */
export const scrapeStock = async (options: ScrapeOptions): Promise<ScrapeResult> => {
    const {
        stockListUrl,
        deadline,
        maxVehicles = DEFAULT_MAX_VEHICLES,
        requestGapMs = DEFAULT_REQUEST_GAP_MS,
        requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
        fetchImpl = fetch,
    } = options;

    const errors: string[] = [];
    let pagesFetched = 0;
    let firstRequest = true;

    const outOfTime = (): boolean => deadline !== undefined && Date.now() >= deadline;

    const get = async (url: string): Promise<string> => {
        if (!firstRequest && requestGapMs > 0) await sleep(requestGapMs);
        firstRequest = false;
        pagesFetched++;
        return fetchHtml(url, requestTimeoutMs, fetchImpl);
    };

    const cards = new Map<string, ListingCard>();
    const visited = new Set<string>();
    const queue = [stockListUrl];

    while (queue.length && visited.size < MAX_LIST_PAGES) {
        const url = queue.shift()!;
        if (visited.has(url)) continue;
        visited.add(url);

        if (outOfTime()) {
            errors.push('Ran out of time before every page of results was read');
            break;
        }

        try {
            const { cards: pageCards, pageUrls } = parseListPage(await get(url), url);
            for (const card of pageCards) if (!cards.has(card.id)) cards.set(card.id, card);
            for (const next of pageUrls) if (!visited.has(next) && !queue.includes(next)) queue.push(next);
        } catch (error) {
            errors.push(`Stock list page failed (${url}): ${errorMessage(error)}`);
        }
    }

    const all = Array.from(cards.values());
    const wanted = all.slice(0, maxVehicles);
    if (all.length > wanted.length) {
        errors.push(`Listing had ${all.length} vehicles; only the first ${maxVehicles} were indexed`);
    }

    const items: ScrapedStockItem[] = [];
    let reportedTimeout = false;

    for (const card of wanted) {
        let detail: Partial<ScrapedStockItem> = {};

        if (outOfTime()) {
            if (!reportedTimeout) {
                errors.push('Ran out of time; the remaining vehicles were indexed from the stock list only');
                reportedTimeout = true;
            }
            // Keep going with list-only data — a thin record beats a missing car.
            const listOnly = toStockItem(card, {});
            if (listOnly) items.push(listOnly);
            continue;
        }

        try {
            detail = parseVehiclePage(await get(card.url), card.url);
        } catch (error) {
            errors.push(`Vehicle page failed (${card.url}): ${errorMessage(error)}`);
        }

        const item = toStockItem(card, detail);
        if (item) items.push(item);
        else errors.push(`Skipped a listing with no usable make/model: ${card.url}`);
    }

    return { items, errors, pagesFetched };
};
