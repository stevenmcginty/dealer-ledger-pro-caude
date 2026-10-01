#!/usr/bin/env node
// DRY RUN: find RTDB records that carry a stray-brace field name (e.g. `linkedVehicleId}`)
// and write a clean-up plan. This script only READS from Firebase (firebase database:get).
//
// Usage: node scripts/fix-brace-keys.mjs --out <dir>
//
// Writes:
//   <dir>/brace-fix-update.json  flat multi-path update relative to the DB root
//                                (for the Firebase CLI multi-path update, applied by hand)
//   <dir>/brace-fix-backup.json  full current value of every affected record, keyed by path
//   <dir>/brace-fix-report.md    counts per company x node, plus every conflict

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT = 'motor-ledger-pro';

// node under each company -> the correct field name (the stray key is this plus `}`)
const TARGETS = {
  transactions: 'linkedVehicleId',
  vehicles: 'purchaseTransactionId',
  receipts: 'reconciledByTxId',
  miscInvoices: 'linkedTransactionId',
};

function parseArgs(argv) {
  const i = argv.indexOf('--out');
  if (i === -1 || !argv[i + 1]) {
    console.error('Usage: node scripts/fix-brace-keys.mjs --out <dir>');
    process.exit(1);
  }
  return { out: resolve(argv[i + 1]) };
}

// Read-only fetch via the Firebase CLI. Returns parsed JSON (null when the path is empty).
function dbGet(path, { shallow = false } = {}) {
  const cmd = `firebase database:get "${path}"${shallow ? ' --shallow' : ''} --project ${PROJECT}`;
  const stdout = execSync(cmd, {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  });
  const text = stdout.trim();
  return text ? JSON.parse(text) : null;
}

// A node may be an object keyed by id, or an array with null holes.
function entriesOf(node) {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) {
    return node.map((v, i) => [String(i), v]).filter(([, v]) => v != null);
  }
  return Object.entries(node).filter(([, v]) => v != null);
}

const fmt = (v) => JSON.stringify(v);

function main() {
  const { out } = parseArgs(process.argv.slice(2));

  const update = {};
  const backup = {};
  const conflicts = [];
  const unexpected = []; // other `}`-ending keys found; reported, never planned
  const counts = {}; // company -> node -> { moved, dropped, conflict }

  const companies = Object.keys(dbGet('/companies', { shallow: true }) || {}).sort();

  for (const companyId of companies) {
    counts[companyId] = {};
    for (const [node, field] of Object.entries(TARGETS)) {
      const c = (counts[companyId][node] = { moved: 0, dropped: 0, conflict: 0 });
      const braceKey = `${field}}`;
      const data = dbGet(`/companies/${companyId}/${node}`);

      for (const [id, rec] of entriesOf(data)) {
        if (typeof rec !== 'object') continue;
        const base = `companies/${companyId}/${node}/${id}`;

        for (const k of Object.keys(rec)) {
          if (k.endsWith('}') && k !== braceKey) unexpected.push({ path: `${base}/${k}`, value: rec[k] });
        }
        if (!Object.prototype.hasOwnProperty.call(rec, braceKey)) continue;

        const strayVal = rec[braceKey];
        const hasField = Object.prototype.hasOwnProperty.call(rec, field);
        backup[base] = rec;

        if (!hasField) {
          update[`${base}/${field}`] = strayVal;
          update[`${base}/${braceKey}`] = null;
          c.moved++;
        } else if (rec[field] === strayVal) {
          update[`${base}/${braceKey}`] = null;
          c.dropped++;
        } else {
          conflicts.push({ path: base, field, current: rec[field], stray: strayVal });
          c.conflict++;
        }
      }
    }
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'brace-fix-update.json'), JSON.stringify(update, null, 2) + '\n');
  writeFileSync(join(out, 'brace-fix-backup.json'), JSON.stringify(backup, null, 2) + '\n');

  const totals = { moved: 0, dropped: 0, conflict: 0 };
  const lines = [
    '# Stray-brace key clean-up plan (DRY RUN)',
    '',
    `Project: ${PROJECT}. Generated ${new Date().toISOString()}. Nothing was written to Firebase.`,
    '',
    '- moved = `K}` copied to `K`, then `K}` removed',
    '- dropped-duplicate = `K` already equals `K}`; only `K}` removed',
    '- conflict = `K` differs from `K}`; nothing planned',
    '',
    '| company | node | moved | dropped-duplicate | conflict |',
    '|---|---|---:|---:|---:|',
  ];
  for (const companyId of companies) {
    for (const node of Object.keys(TARGETS)) {
      const c = counts[companyId][node];
      totals.moved += c.moved;
      totals.dropped += c.dropped;
      totals.conflict += c.conflict;
      if (c.moved + c.dropped + c.conflict === 0) continue;
      lines.push(`| ${companyId} | ${node} | ${c.moved} | ${c.dropped} | ${c.conflict} |`);
    }
  }
  lines.push(`| **total** | | ${totals.moved} | ${totals.dropped} | ${totals.conflict} |`, '');
  lines.push(`Companies scanned: ${companies.length} (${companies.join(', ')}). Rows with all zeros omitted.`, '');

  lines.push('## Conflicts', '');
  if (conflicts.length === 0) lines.push('None.');
  for (const x of conflicts) {
    lines.push(`- \`${x.path}\`: \`${x.field}\` = ${fmt(x.current)}, \`${x.field}}\` = ${fmt(x.stray)}`);
  }
  lines.push('');

  lines.push('## Other keys ending in `}` (not planned)', '');
  if (unexpected.length === 0) lines.push('None.');
  for (const x of unexpected) lines.push(`- \`${x.path}\` = ${fmt(x.value)}`);
  lines.push('');

  writeFileSync(join(out, 'brace-fix-report.md'), lines.join('\n'));

  console.log(
    `DRY RUN: ${companies.length} companies scanned; ${Object.keys(backup).length} records with brace keys; ` +
      `moved ${totals.moved}, dropped-duplicate ${totals.dropped}, conflict ${totals.conflict}, ` +
      `other brace keys ${unexpected.length}; ${Object.keys(update).length} update paths -> ${out}`,
  );
}

main();
