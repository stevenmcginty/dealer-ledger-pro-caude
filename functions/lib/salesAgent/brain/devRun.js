"use strict";
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
/**
 * Manual smoke test for the brain. Not deployed, not imported by index.ts.
 *
 *   cd functions && npm run build && node lib/salesAgent/brain/devRun.js
 *
 * Runs a scripted four-turn conversation against an in-memory stock list, so it
 * costs four Gemini calls and touches no Firebase. It exists to show what the
 * guards actually do to a real model response: watch the price answers on turns
 * three and four.
 *
 * Needs a Gemini key. It uses GEMINI_API_KEY from the environment, or failing
 * that reads GEMINI_API_KEY / VITE_GEMINI_API_KEY out of the project's .env
 * files. The key is never printed.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_1 = require("./index");
const search_1 = require("../stock/search");
const KEY_NAMES = ['GEMINI_API_KEY', 'VITE_GEMINI_API_KEY'];
const findApiKey = () => {
    for (const name of KEY_NAMES) {
        const fromEnv = process.env[name];
        if (fromEnv && fromEnv.trim())
            return fromEnv.trim();
    }
    const functionsDir = path.resolve(__dirname, '../../..');
    const repoRoot = path.resolve(functionsDir, '..');
    const candidates = [
        path.join(functionsDir, '.env'),
        path.join(functionsDir, '.env.local'),
        path.join(repoRoot, '.env.local'),
        path.join(repoRoot, '.env'),
    ];
    for (const file of candidates) {
        if (!fs.existsSync(file))
            continue;
        const contents = fs.readFileSync(file, 'utf8');
        for (const name of KEY_NAMES) {
            const match = contents.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'm'));
            if (match) {
                const value = match[1].trim().replace(/^["']|["']$/g, '');
                if (value)
                    return value;
            }
        }
    }
    return undefined;
};
const STOCK = [
    {
        id: '1862524',
        url: 'https://radlettcarsales.com/used/cars/ford-focus-st-1862524/',
        make: 'Ford',
        model: 'Focus',
        variant: '2.0T EcoBoost ST-3',
        title: 'Ford Focus 2.0T EcoBoost ST-3',
        price: 12995,
        monthlyFrom: 229,
        year: 2017,
        mileage: 48200,
        fuel: 'Petrol',
        transmission: 'Manual',
        bodyType: 'Hatchback',
        colour: 'Race Red',
        engineSize: '2.0L',
        owners: 2,
        serviceHistory: 'Full service history, 5 stamps, last serviced at 45,100 miles',
        motExpiry: '2027-03-14',
        reg: 'YE17ABC',
        description: 'Well looked after ST-3 with the full leather Recaro interior, cruise, heated seats and the winter pack. Two owners from new.',
        features: ['Heated Recaro seats', 'Sat nav', 'Cruise control', 'Winter pack', 'Bluetooth'],
        status: 'available',
        indexedAt: Date.now(),
    },
    {
        id: '1904881',
        url: 'https://radlettcarsales.com/used/cars/vw-golf-gti-1904881/',
        make: 'Volkswagen',
        model: 'Golf',
        variant: '2.0 TSI GTI Performance DSG',
        title: 'Volkswagen Golf 2.0 TSI GTI Performance DSG',
        price: 15750,
        monthlyFrom: 279,
        year: 2018,
        mileage: 39800,
        fuel: 'Petrol',
        transmission: 'Automatic',
        bodyType: 'Hatchback',
        colour: 'Tornado Red',
        engineSize: '2.0L',
        owners: 1,
        serviceHistory: 'Full VW main dealer history',
        motExpiry: '2027-06-02',
        reg: 'YD18DEF',
        description: 'One owner GTI Performance with the bigger brakes and the limited slip diff. Adaptive cruise, Discover Nav, front and rear sensors.',
        features: ['Adaptive cruise', 'Discover Navigation', 'Parking sensors', 'DCC adaptive chassis'],
        status: 'available',
        indexedAt: Date.now(),
    },
    {
        id: '1877301',
        url: 'https://radlettcarsales.com/used/cars/porsche-boxster-s-1877301/',
        make: 'Porsche',
        model: 'Boxster',
        variant: '3.4 S Tiptronic',
        title: 'Porsche Boxster 3.4 S Tiptronic',
        price: 10995,
        year: 2007,
        mileage: 62000,
        fuel: 'Petrol',
        transmission: 'Automatic',
        bodyType: 'Convertible',
        colour: 'Black',
        engineSize: '3.4L',
        owners: 3,
        serviceHistory: 'Full service history, 9 stamps, last serviced at 59,800 miles',
        motExpiry: '2027-01-20',
        reg: 'BC02YDG',
        description: 'Gen 2 Boxster S in black over black leather, heated seats, Bose, hard back seats and the sports exhaust. Three owners from new.',
        features: ['Heated seats', 'Bose sound', 'Sports exhaust', 'Wind deflector'],
        status: 'available',
        indexedAt: Date.now(),
    },
    {
        id: '1855120',
        url: 'https://radlettcarsales.com/used/cars/porsche-boxster-1855120/',
        make: 'Porsche',
        model: 'Boxster',
        variant: '2.7',
        title: 'Porsche Boxster 2.7',
        price: 5995,
        year: 2001,
        mileage: 96400,
        fuel: 'Petrol',
        transmission: 'Manual',
        bodyType: 'Convertible',
        colour: 'Arctic Silver',
        engineSize: '2.7L',
        owners: 5,
        serviceHistory: 'Service history to 2023, last serviced at 93,000 miles',
        motExpiry: '2026-11-09',
        reg: 'Y421HTM',
        description: 'Early 986 Boxster in Arctic Silver with the blue hood. Recent clutch and a fresh set of tyres all round.',
        features: ['Electric hood', 'Heated seats', 'Alloy wheels'],
        status: 'available',
        indexedAt: Date.now(),
    },
];
/**
 * In-memory stand-in for stock/search, with a line printed per lookup. It runs the
 * real matcher, so what you see here is what the deployed agent would see.
 */
const stubStock = {
    async searchStock(_companyId, filters) {
        const hits = (0, search_1.rankStock)(STOCK, filters);
        const shown = hits.map((hit) => `${hit.title} [${hit.matchQuality}]`).join('; ') || 'nothing';
        console.log(`      [tool] search_stock ${JSON.stringify(filters)} -> ${shown}`);
        return hits;
    },
    async getStockItem(_companyId, id) {
        const hit = STOCK.find((item) => item.id === id) || null;
        console.log(`      [tool] get_stock_item ${id} -> ${hit ? hit.title : 'not found'}`);
        return hit;
    },
    async countStock() {
        console.log(`      [tool] count_stock -> ${STOCK.length}`);
        return STOCK.length;
    },
};
const SETTINGS = {
    enabled: true,
    dealershipName: 'Radlett Car Sales',
    location: 'Radlett, Hertfordshire',
    websiteUrl: 'https://radlettcarsales.com',
    stockListUrl: 'https://radlettcarsales.com/used/cars/radlett/',
    openingHours: 'Mon to Fri 9am to 6pm, Saturday 9am to 4pm, Sunday by appointment',
    address: 'Watling Street, Radlett, Hertfordshire, WD7 7HB',
    phone: '07710 525694',
    faqs: 'Warranty: 3 months minimum on every car, extendable to 12 or 24 months. ' +
        'Finance: we work with Jigsaw Finance and Close Brothers, decisions usually inside the hour. ' +
        'Test drives: you must bring your full UK driving licence, provisional is not enough, and be over 25 for the performance cars. ' +
        'Delivery: we deliver anywhere in the UK, free within 30 miles of Radlett. ' +
        'Part-exchange: always considered, bring the V5 and the service book.',
    ownerAlertNumber: '+447710525694',
    ownerName: 'Steve',
    agentName: 'Dave',
    teamNames: 'Steve and Chris',
    priceFlexMode: 'hint',
    negotiationMaxDiscount: 300,
    replyDelaySeconds: [5, 15],
    channels: { whatsapp: true, sms: true, email: true },
    preferWhatsAppReply: true,
    emailAddress: 'radlettcars@gmail.com',
    signature: 'Steve, Radlett Car Sales',
    updatedAt: Date.now(),
};
/**
 * Turns 1 to 4 are the price guard. Turns 5 and 6 are the vague-description rules:
 * "the boxster" has to come back as a question about which one, and "the black 2007
 * boxster" has to be answered outright, with three owners and without ever putting
 * Steve's name in front of a customer who has no idea who he is.
 */
const SCRIPT = [
    'Hi, is the Focus ST still available?',
    'How many owners has it had?',
    "What's your best price on it?",
    "Come on, what's the lowest you'd go?",
    'how many owners has the boxster had',
    "I've noticed you've still got the black 2007 boxster available. Can you tell me how many owners it's had",
];
const main = async () => {
    const apiKey = findApiKey();
    if (!apiKey) {
        console.error(`No Gemini key found. Set ${KEY_NAMES[0]} or put it in functions/.env.`);
        process.exitCode = 1;
        return;
    }
    const now = Date.now();
    let conversation = {
        id: 'dev-conv',
        shortId: 12,
        companyId: 'dev-company',
        channel: 'whatsapp',
        address: '+447700900123',
        originChannel: 'whatsapp',
        contact: { firstName: 'Dan', phone: '+447700900123' },
        mode: 'agent',
        stage: 'vehicle',
        escalated: false,
        priceRequests: 0,
        lastInboundAt: now,
        lastCustomerMessageAt: now,
        createdAt: now,
        updatedAt: now,
        unread: 1,
    };
    const history = [];
    for (let turn = 0; turn < SCRIPT.length; turn++) {
        const text = SCRIPT[turn];
        const inbound = {
            companyId: conversation.companyId,
            channel: 'whatsapp',
            address: conversation.address,
            text,
            providerId: `dev-${turn}`,
            receivedAt: Date.now(),
        };
        console.log(`\n--- turn ${turn + 1} -------------------------------------------`);
        console.log(`  customer: ${text}`);
        const result = await (0, index_1.runBrain)({ companyId: conversation.companyId, conversation, history, inbound, settings: SETTINGS }, { stock: stubStock, apiKey });
        console.log(`  agent:    ${result.reply || '(said nothing)'}`);
        console.log(`  result:   ${JSON.stringify({ stage: result.stage, updates: result.updates, escalate: result.escalate, askOwner: result.askOwner, handoff: result.handoff, usage: result.usage }, null, 2).replace(/\n/g, '\n            ')}`);
        history.push({ id: `in-${turn}`, direction: 'in', channel: 'whatsapp', text, from: 'customer', createdAt: Date.now() });
        if (result.reply) {
            history.push({ id: `out-${turn}`, direction: 'out', channel: 'whatsapp', text: result.reply, from: 'agent', createdAt: Date.now() });
        }
        // Stand in for what the router does with the result between turns.
        conversation = {
            ...conversation,
            ...result.updates,
            stage: result.stage,
            escalated: conversation.escalated || !!result.escalate,
            mode: result.handoff ? 'human' : conversation.mode,
            pendingQuestion: result.askOwner
                ? { id: `q-${turn}`, question: result.askOwner.question, askedAt: Date.now(), context: result.askOwner.context }
                : conversation.pendingQuestion,
            updatedAt: Date.now(),
        };
    }
    console.log('\n--- final conversation state -------------------------------');
    console.log(JSON.stringify({ stage: conversation.stage, mode: conversation.mode, priceRequests: conversation.priceRequests, vehicleInterest: conversation.vehicleInterest, summary: conversation.summary, pendingQuestion: conversation.pendingQuestion }, null, 2));
};
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
//# sourceMappingURL=devRun.js.map