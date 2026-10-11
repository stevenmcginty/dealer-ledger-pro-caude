#!/usr/bin/env node
/**
 * Dry run of the nightly email prune (functions/src/salesAgent/emailPrune.ts)
 * against a JSON export of one ledger's conversations node. Reads only.
 *
 *   cd functions && npm run build
 *   MSYS_NO_PATHCONV=1 npx firebase database:get /companies/<id>/salesAgent/conversations -o <file>
 *   node scripts/email-prune-dry-run.mjs <file> [days]
 *
 * Uses the compiled planner from functions/lib, so it is the same logic the
 * scheduled function runs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const compiled = path.join(here, '..', 'functions', 'lib', 'salesAgent', 'emailPrune.js');
if (!fs.existsSync(compiled)) {
    console.error(`Missing ${compiled}. Run "npm run build" in functions/ first.`);
    process.exit(1);
}
const { planEmailPrune, lastActivityOf, EMAIL_PRUNE_DAYS } = require(compiled);

const file = process.argv[2];
const days = Number(process.argv[3]) || EMAIL_PRUNE_DAYS;
if (!file) {
    console.error('Usage: node scripts/email-prune-dry-run.mjs <conversations.json> [days]');
    process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
const conversations = Object.entries(raw).map(([id, conv]) => ({ ...(conv || {}), id }));
const now = Date.now();
const plan = planEmailPrune(conversations, now, days);

const bytes = value => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
const channelOf = (message, conv) => message?.channel || conv.channel;
const day = ms => new Date(ms).toISOString().slice(0, 10);

let emailRemoved = 0;
let whatsappKept = 0;
let freed = 0;

for (const conv of plan.deleteWhole) {
    const { id, ...stored } = conv;
    freed += bytes(stored);
    emailRemoved += Object.values(conv.messages || {}).filter(Boolean).length;
}
for (const { conversation, messageIds } of plan.trim) {
    emailRemoved += messageIds.length;
    for (const mid of messageIds) freed += bytes(conversation.messages?.[mid]);
    whatsappKept += Object.entries(conversation.messages || {})
        .filter(([mid, m]) => m && !messageIds.includes(mid) && channelOf(m, conversation) === 'whatsapp').length;
}

const byConvChannel = list => list.reduce((acc, c) => ({ ...acc, [c.channel || 'none']: (acc[c.channel || 'none'] || 0) + 1 }), {});

console.log(`File: ${file}`);
console.log(`Run at ${new Date(now).toISOString()}, window ${days} days, ${conversations.length} conversations, ${bytes(raw).toLocaleString()} bytes`);
console.log(`Conversations deleted whole: ${plan.deleteWhole.length} ${JSON.stringify(byConvChannel(plan.deleteWhole))}`);
console.log(`Conversations trimmed:       ${plan.trim.length} ${JSON.stringify(byConvChannel(plan.trim.map(t => t.conversation)))}`);
console.log(`Email messages removed:      ${emailRemoved}`);
console.log(`WhatsApp messages kept (in trimmed threads): ${whatsappKept}`);
console.log(`Bytes freed:                 ${freed.toLocaleString()}`);
for (const { conversation, messageIds } of plan.trim) {
    const all = Object.keys(conversation.messages || {}).length;
    console.log(`  trim ${conversation.id} (${conversation.channel || 'none'}): ${messageIds.length} of ${all} messages go`);
}
const dates = plan.deleteWhole.map(lastActivityOf).filter(Boolean).sort((a, b) => a - b);
if (dates.length) console.log(`Whole deletes last active ${day(dates[0])} .. ${day(dates[dates.length - 1])}`);
