#!/usr/bin/env node
// Split Steve's "Bank Account" tab into its two real banks: Lloyds and Allica.
// The tab holds Lloyds lines (to 2026-03-31) and Allica lines (from 2026-04-02), plus old Lloyds
// lines that were imported before lines carried an accountId.
//
// Usage: node scripts/split-bank-accounts.mjs --out <dir> --company <id> [--apply]
//
// Default is a DRY RUN (reads only, via `firebase database:get`). With --apply it PATCHes:
//   financialAccounts/<Bank Account>/name -> 'Lloyds'
//   financialAccounts/<ALLICA>/name       -> 'Allica'
//   transactions/<id>/accountId           -> Allica, for every line classified Allica
//   transactions/<id>/accountId           -> Lloyds, for Lloyds lines that have no accountId
// No other field is written; nothing is deleted. It then re-reads every planned path.
// Safe to re-run: lines already on the right account drop out.
//
// Classification. Each line on "Bank Account" (or a Bank line with no accountId) collects votes:
//   batch   the uploadBatches record that created it (file name: Allica_Statement_* / Lloyds 8-digit)
//   method  the bank's transaction-type column (Lloyds codes FPI/DD/DEB...; Allica words)
//   desc    the description format (Lloyds '01SEP25' / 'CD 6739'; Allica 'To X, ref' / padded card line)
//   date    on or before 2026-03-31 = Lloyds; on or after 2026-04-02 = Allica (Allica opened 2 Apr)
//   cluster createdAt shared with other lines (one upload): the bank they agree on, if unanimous
// A line is classified only when it has at least 2 votes and they all agree. Anything else is
// listed as unsure and never moved.
//
// Writes:
//   <dir>/split-update.json  flat multi-path update relative to the DB root
//   <dir>/split-backup.json  full prior record of every touched account and transaction, keyed by path
//   <dir>/split-report.md    counts, date ranges, samples, and every unsure line with its votes

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT = 'motor-ledger-pro';
// Steve's ledger only. The run aborts unless these accounts exist with these names/types.
const STEVE_COMPANY = '-OXmKH0D2CB0JFIi3cEi';
const LLOYDS_ID = '-OZ5JTZlGywgTTXeM5TI'; // was "Bank Account"
const ALLICA_ID = '-Ovj-NJILvtS0cEZJscg'; // was "ALLICA"
const RENAMES = [
  { id: LLOYDS_ID, from: 'Bank Account', to: 'Lloyds' },
  { id: ALLICA_ID, from: 'ALLICA', to: 'Allica' },
];
const LAST_LLOYDS_ONLY_DAY = '2026-03-31';
const FIRST_ALLICA_DAY = '2026-04-02';

// Strict: only `--out <dir>`, `--company <id>` and `--apply`. Anything else (including the
// `--flag=value` form) exits with usage, so a mistyped flag can never widen an --apply run.
function parseArgs(argv) {
  const usage = () => {
    console.error('Usage: node scripts/split-bank-accounts.mjs --out <dir> --company <id> [--apply]');
    process.exit(1);
  };
  const opts = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--apply') opts.apply = true;
    else if (flag === '--out' || flag === '--company') {
      const v = argv[++i];
      if (!v) usage();
      opts[flag.slice(2)] = v;
    } else usage();
  }
  if (!opts.out || !opts.company) usage();
  if (opts.company !== STEVE_COMPANY) {
    console.error(`This tool is for Steve's ledger only (${STEVE_COMPANY}).`);
    process.exit(1);
  }
  return { out: resolve(opts.out), company: opts.company, apply: opts.apply };
}

const cliEnv = { ...process.env, MSYS_NO_PATHCONV: '1' };

// Read-only fetch via the Firebase CLI. Returns parsed JSON (null when the path is empty).
function dbGet(path) {
  const stdout = execSync(`firebase database:get "${path}" --project ${PROJECT}`, {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cliEnv,
  });
  const text = stdout.trim();
  return text ? JSON.parse(text) : null;
}

// PATCH (never set): only the keys in the file change.
function dbUpdate(file) {
  execSync(`firebase database:update / "${file}" --project ${PROJECT} --force`, {
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cliEnv,
  });
}

// A node may be an object keyed by id, or an array with null holes.
function entriesOf(node) {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.map((v, i) => [String(i), v]).filter(([, v]) => v != null);
  return Object.entries(node).filter(([, v]) => v != null);
}

const day = (s) => String(s || '').slice(0, 10);
const gbp = (n) => `£${Number(n).toFixed(2)}`;

// --- Votes ---------------------------------------------------------------------------------

function batchVote(filename) {
  if (!filename) return null;
  if (/^Allica_Statement_/i.test(filename)) return 'Allica';
  if (/^\d{8}_\d+_\d+\.csv$/i.test(filename)) return 'Lloyds'; // Lloyds export: <account no>_<stamp>.csv
  return null;
}

const LLOYDS_METHODS = new Set(['FPI', 'FPO', 'DD', 'DEB', 'SO', 'PAY', 'BGC', 'DEP', 'CHG', 'TFR', 'CPT', 'BP', 'COR', 'CHQ']);
const ALLICA_METHODS = new Set([
  'payment in', 'payment out', 'card payment', 'direct debit', 'direct credit', 'chaps',
  'deposit to savings', 'withdrawal from savings', 'cashback reward',
]);
function methodVote(method) {
  const m = String(method || '').trim();
  if (!m) return null;
  if (LLOYDS_METHODS.has(m.toUpperCase()) && m === m.toUpperCase()) return 'Lloyds';
  if (ALLICA_METHODS.has(m.toLowerCase())) return 'Allica';
  return null;
}

const MONTHS = 'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC';
const LLOYDS_DESC = [new RegExp(`\\b\\d{2}(${MONTHS})\\d{2}\\b`), /\bCD \d{4}\b/];
// Allica: "To NAME, ref" / "From NAME, ref" / "To|From Savings Wallet", or a card line padded to
// 40 chars ending in a 2-letter country code ("MCDONALDS                ST ALBANS    GB").
const ALLICA_DESC = [/^(To|From) [^,]+, /, /^(To|From) Savings Wallet$/, /^.{25}.{13}[A-Z]{2}$/];
function descVote(description) {
  const d = String(description || '');
  const lloyds = LLOYDS_DESC.some((re) => re.test(d));
  const allica = ALLICA_DESC.some((re) => re.test(d));
  if (lloyds && !allica) return 'Lloyds';
  if (allica && !lloyds) return 'Allica';
  return null;
}

function dateVote(date) {
  const d = day(date);
  if (!d) return null;
  if (d <= LAST_LLOYDS_ONLY_DAY) return 'Lloyds';
  if (d >= FIRST_ALLICA_DAY) return 'Allica';
  return null;
}

// --- Plan ----------------------------------------------------------------------------------

function plan(companyId) {
  const accounts = Object.fromEntries(entriesOf(dbGet(`/companies/${companyId}/financialAccounts`)));
  for (const { id, from, to } of RENAMES) {
    const a = accounts[id];
    if (!a || a.type !== 'Bank' || (a.name !== from && a.name !== to)) {
      throw new Error(`Account ${id} is not the expected Bank "${from}" (found ${JSON.stringify(a || null)}). Aborting.`);
    }
  }
  const batches = entriesOf(dbGet(`/companies/${companyId}/uploadBatches`)).map(([id, b]) => ({ id, ...b }));
  const txs = entriesOf(dbGet(`/companies/${companyId}/transactions`))
    .filter(([, t]) => typeof t === 'object')
    .map(([id, t]) => ({ id, ...t }));

  const batchOf = new Map();
  for (const b of batches) for (const id of b.transactionIds || []) batchOf.set(id, b);

  // In scope: lines on the old "Bank Account" or on Allica already, and Bank lines with no accountId.
  const scope = txs.filter(
    (t) => t.accountId === LLOYDS_ID || t.accountId === ALLICA_ID || (!t.accountId && t.type === 'Bank'),
  );

  // Direct votes first, then the createdAt cluster vote from the direct votes of its lines.
  for (const t of scope) {
    const b = batchOf.get(t.id);
    t.votes = {
      batch: batchVote(b && b.filename),
      method: methodVote(t.method),
      desc: descVote(t.description),
      date: dateVote(t.date),
    };
    t.batchFile = b ? b.filename : null;
  }
  const clusterBanks = new Map(); // createdAt -> Set of banks voted directly (batch/method/desc)
  for (const t of scope) {
    if (t.createdAt == null) continue;
    const set = clusterBanks.get(t.createdAt) || clusterBanks.set(t.createdAt, new Set()).get(t.createdAt);
    for (const k of ['batch', 'method', 'desc']) if (t.votes[k]) set.add(t.votes[k]);
  }
  for (const t of scope) {
    const set = t.createdAt != null ? clusterBanks.get(t.createdAt) : null;
    t.votes.cluster = set && set.size === 1 ? [...set][0] : null;
    if (set && set.size > 1) t.clusterMixed = true;
  }

  const lloyds = [];
  const allica = [];
  const unsure = [];
  for (const t of scope) {
    const vals = Object.values(t.votes).filter(Boolean);
    const banks = new Set(vals);
    if (vals.length >= 2 && banks.size === 1 && !t.clusterMixed) {
      ([...banks][0] === 'Allica' ? allica : lloyds).push(t);
    } else {
      t.why =
        banks.size > 1 ? 'signals disagree' : t.clusterMixed ? 'its upload cluster is mixed' : `only ${vals.length} signal`;
      unsure.push(t);
    }
  }
  const byDate = (a, b) => (day(a.date) < day(b.date) ? -1 : day(a.date) > day(b.date) ? 1 : 0);
  lloyds.sort(byDate);
  allica.sort(byDate);
  unsure.sort(byDate);
  return { accounts, scope, lloyds, allica, unsure, batches };
}

const voteText = (v) =>
  Object.entries(v)
    .map(([k, x]) => `${k}=${x || '-'}`)
    .join(' ');
const txLine = (t) =>
  `${t.id} · ${day(t.date)} · ${gbp(t.amount)} · "${String(t.description || '').trim()}" · acc ${t.accountId || 'none'}`;

function main() {
  const { out, company, apply } = parseArgs(process.argv.slice(2));
  const p = plan(company);
  const base = `companies/${company}`;

  const update = {};
  const backup = {};
  for (const { id, to } of RENAMES) {
    if (p.accounts[id].name === to) continue;
    backup[`${base}/financialAccounts/${id}`] = p.accounts[id];
    update[`${base}/financialAccounts/${id}/name`] = to;
  }
  const moves = [];
  for (const t of p.allica) if (t.accountId !== ALLICA_ID) moves.push([t, ALLICA_ID]);
  for (const t of p.lloyds) if (!t.accountId) moves.push([t, LLOYDS_ID]);
  // A Lloyds-classified line already sitting on Allica is not moved back: report it instead.
  const lloydsOnAllica = p.lloyds.filter((t) => t.accountId === ALLICA_ID);
  for (const [t, to] of moves) {
    const { id, votes, batchFile, why, clusterMixed, ...record } = t;
    backup[`${base}/transactions/${id}`] = record;
    update[`${base}/transactions/${id}/accountId`] = to;
  }

  mkdirSync(out, { recursive: true });
  const updateFile = join(out, 'split-update.json');
  writeFileSync(updateFile, JSON.stringify(update, null, 2) + '\n');
  writeFileSync(join(out, 'split-backup.json'), JSON.stringify(backup, null, 2) + '\n');

  let applied = null;
  if (apply && Object.keys(update).length > 0) {
    dbUpdate(updateFile);
    const bad = [];
    const freshAcc = dbGet(`/${base}/financialAccounts`) || {};
    const freshTx = dbGet(`/${base}/transactions`) || {};
    for (const [path, want] of Object.entries(update)) {
      const parts = path.split('/'); // companies/<c>/<node>/<id>/<field>
      const node = parts[2] === 'financialAccounts' ? freshAcc : freshTx;
      const got = (node[parts[3]] || {})[parts[4]];
      if (got !== want) bad.push(`${path} = ${JSON.stringify(got)} (wanted ${JSON.stringify(want)})`);
    }
    applied = { paths: Object.keys(update).length, bad };
  }

  const range = (list) => (list.length ? `${day(list[0].date)} to ${day(list[list.length - 1].date)}` : '-');
  const sample = (list) => {
    const pick = list.length <= 6 ? list : [...list.slice(0, 3), ...list.slice(-3)];
    return pick.map((t) => `- ${txLine(t)}`);
  };
  const countBy = (list, f) =>
    Object.entries(list.reduce((m, t) => ((m[f(t)] = (m[f(t)] || 0) + 1), m), {}))
      .map(([k, n]) => `${k}: ${n}`)
      .join(', ');

  const lines = [
    `# Split "Bank Account" into Lloyds and Allica (${apply ? 'APPLIED' : 'DRY RUN'})`,
    '',
    `Project: ${PROJECT}. Company ${company}. Generated ${new Date().toISOString()}. ` +
      (apply ? 'The planned paths were written.' : 'Nothing was written to Firebase.'),
    '',
    `In scope: ${p.scope.length} lines (on "Bank Account", on Allica, or Bank with no accountId).`,
    '',
    '| bank | lines | date range | already on it | to move | by accountId now |',
    '|---|---:|---|---:|---:|---|',
    `| Lloyds | ${p.lloyds.length} | ${range(p.lloyds)} | ${p.lloyds.filter((t) => t.accountId === LLOYDS_ID).length} | ${p.lloyds.filter((t) => !t.accountId).length} | ${countBy(p.lloyds, (t) => t.accountId || 'none')} |`,
    `| Allica | ${p.allica.length} | ${range(p.allica)} | ${p.allica.filter((t) => t.accountId === ALLICA_ID).length} | ${p.allica.filter((t) => t.accountId !== ALLICA_ID).length} | ${countBy(p.allica, (t) => t.accountId || 'none')} |`,
    `| unsure | ${p.unsure.length} | ${range(p.unsure)} | - | 0 | ${countBy(p.unsure, (t) => t.accountId || 'none') || '-'} |`,
    '',
    `Account renames: ${RENAMES.map((r) => `${r.id} "${p.accounts[r.id].name}" -> "${r.to}"`).join('; ')}.`,
    `Update paths: ${Object.keys(update).length} (${Object.keys(update).filter((k) => k.endsWith('/name')).length} names, ${moves.length} accountIds).`,
    '',
    '## Evidence per bank (vote counts)',
    '',
  ];
  for (const [name, list] of [['Lloyds', p.lloyds], ['Allica', p.allica]]) {
    lines.push(`- ${name}: batch ${list.filter((t) => t.votes.batch).length}, method ${list.filter((t) => t.votes.method).length}, ` +
      `desc ${list.filter((t) => t.votes.desc).length}, date ${list.filter((t) => t.votes.date).length}, cluster ${list.filter((t) => t.votes.cluster).length}; ` +
      `files: ${countBy(list, (t) => t.batchFile || '(no batch record)')}`);
  }
  lines.push('');
  if (applied) {
    lines.push(`Applied ${applied.paths} paths; re-read mismatches: ${applied.bad.length}.`, '');
    for (const b of applied.bad) lines.push(`- MISMATCH ${b}`);
    if (applied.bad.length) lines.push('');
  }
  if (lloydsOnAllica.length) {
    lines.push('## Lloyds-looking lines already on Allica (not moved)', '', ...lloydsOnAllica.map((t) => `- ${txLine(t)}`), '');
  }
  lines.push('## Lloyds: first and last 3', '', ...sample(p.lloyds), '');
  lines.push('## Allica: first and last 3', '', ...sample(p.allica), '');
  lines.push('## Unsure (never moved)', '');
  lines.push(p.unsure.length ? p.unsure.map((t) => `- ${txLine(t)} — ${t.why}: ${voteText(t.votes)}`).join('\n') : 'None.', '');
  writeFileSync(join(out, 'split-report.md'), lines.join('\n'));

  console.log(`Lloyds ${p.lloyds.length} (${range(p.lloyds)}), Allica ${p.allica.length} (${range(p.allica)}), unsure ${p.unsure.length}`);
  if (applied) console.log(`APPLIED ${applied.paths} paths; mismatches ${applied.bad.length}`);
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${Object.keys(update).length} paths -> ${out}`);
  if (applied && applied.bad.length) process.exit(2);
}

main();
