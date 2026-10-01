#!/usr/bin/env node
// Link old receipts to the reconciled bank lines that paid them (receipt.reconciledByTxId).
// Many receipts were marked Paid by the old statement-upload auto-match, which never stored
// the link, so the bank line shows no receipt thumbnail and the P&L counts the cost twice.
//
// Usage: node scripts/link-receipts.mjs --out <dir> [--company <id>] [--apply]
//        node scripts/link-receipts.mjs --out <dir> --company <id> --receipts <id,id,...> [--apply]
//
// --receipts (needs --company): plan ONLY those receipt ids. Each must be one-to-one (Tier A or
// Tier B rules, any status; On Account is never a candidate). For each, writes reconciledByTxId
// AND status 'Paid'. Ids that are not one-to-one are listed as refused and never written.
//
// Default is a DRY RUN (reads only, via `firebase database:get`). With --apply it PATCHes the
// Tier A links (receipts/<id>/reconciledByTxId only; no transaction is touched) and re-reads
// every planned path to confirm it. Safe to re-run: linked receipts and lines drop out.
//
// Rules
//   receipt: no reconciledByTxId, has receiptUrl, paymentType not 'On Account', amount > 0
//   line:    status Reconciled, amount < 0, category not Transfer, no receipt points at it
//   match:   |line amount| == receipt amount to the penny; line date from receipt date -5 to +35 days;
//            one-to-one (the receipt has one candidate line and that line has one candidate receipt)
//   Tier A (applied):  one-to-one, receipt Paid, and supplier words overlap or date gap <= 3 days
//   Tier B (report):   one-to-one but Unpaid, or no supplier overlap and gap > 3 days
//   Tier C (report):   ambiguous, or near misses within 5p
//
// Writes:
//   <dir>/link-update.json  flat multi-path update relative to the DB root (Tier A only)
//   <dir>/link-backup.json  full prior receipt record for every Tier A receipt, keyed by path
//   <dir>/link-report.md    counts per company per tier, plus one line per Tier B/C item

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROJECT = 'motor-ledger-pro';
const DAYS_BEFORE = 5;
const DAYS_AFTER = 35;
const CLOSE_DAYS = 3;
const NEAR_PENCE = 5;

// Strict: only `--out <dir>`, `--company <id>`, `--receipts <ids>` and `--apply`. Anything else
// (including the `--flag=value` form) exits with usage, so a mistyped flag can never widen an
// --apply run.
function parseArgs(argv) {
  const usage = () => {
    console.error(
      'Usage: node scripts/link-receipts.mjs --out <dir> [--company <id>] [--apply]\n' +
        '       node scripts/link-receipts.mjs --out <dir> --company <id> --receipts <id,id,...> [--apply]',
    );
    process.exit(1);
  };
  const opts = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--apply') opts.apply = true;
    else if (flag === '--out' || flag === '--company' || flag === '--receipts') {
      const v = argv[++i];
      if (!v) usage();
      opts[flag.slice(2)] = v;
    } else usage();
  }
  if (!opts.out) usage();
  let receiptIds;
  if (opts.receipts !== undefined) {
    if (!opts.company) usage();
    receiptIds = [...new Set(opts.receipts.split(',').map((x) => x.trim()).filter(Boolean))];
    if (receiptIds.length === 0) usage();
  }
  return { out: resolve(opts.out), company: opts.company, apply: opts.apply, receiptIds };
}

const cliEnv = { ...process.env, MSYS_NO_PATHCONV: '1' };

// Read-only fetch via the Firebase CLI. Returns parsed JSON (null when the path is empty).
function dbGet(path, { shallow = false } = {}) {
  const cmd = `firebase database:get "${path}"${shallow ? ' --shallow' : ''} --project ${PROJECT}`;
  const stdout = execSync(cmd, {
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
  if (Array.isArray(node)) {
    return node.map((v, i) => [String(i), v]).filter(([, v]) => v != null);
  }
  return Object.entries(node).filter(([, v]) => v != null);
}

// Same supplier test as utils/statementAutoMatch.ts (supplierOverlap).
const STOP_WORDS = new Set([
  'LTD', 'LIMITED', 'THE', 'GROUP', 'UK', 'GB', 'LONDON', 'PAYMENT', 'CARD',
  'COM', 'WWW', 'CO', 'PLC', 'SERVICES', 'STATION',
]);
const supplierWords = (text) =>
  String(text || '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
function supplierOverlap(vendor, description) {
  const a = supplierWords(vendor);
  const b = supplierWords(description);
  for (const x of a) {
    for (const y of b) {
      if (x === y) return true;
      const [short, long] = x.length <= y.length ? [x, y] : [y, x];
      if (short.length >= 4 && long.includes(short)) return true;
    }
  }
  return false;
}

// 'YYYY-MM-DD...' -> whole days since epoch (UTC), or null.
function dayNum(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

const pence = (n) => Math.round(Math.abs(Number(n)) * 100);
const gbp = (n) => `£${Number(n).toFixed(2)}`;
const day = (s) => String(s || '').slice(0, 10);

function planCompany(companyId) {
  const receipts = entriesOf(dbGet(`/companies/${companyId}/receipts`))
    .filter(([, r]) => typeof r === 'object')
    .map(([id, r]) => ({ id, ...r }));
  const txs = entriesOf(dbGet(`/companies/${companyId}/transactions`))
    .filter(([, t]) => typeof t === 'object')
    .map(([id, t]) => ({ id, ...t }));

  const linkedBefore = receipts.filter((r) => r.reconciledByTxId).length;
  const linkedTxIds = new Set(receipts.map((r) => r.reconciledByTxId).filter(Boolean));

  const candReceipts = receipts.filter(
    (r) =>
      !r.reconciledByTxId &&
      r.receiptUrl &&
      r.paymentType !== 'On Account' &&
      Number(r.amount) > 0,
  );
  const candTxs = txs.filter(
    (t) =>
      t.status === 'Reconciled' &&
      Number(t.amount) < 0 &&
      t.category !== 'Transfer' &&
      !linkedTxIds.has(t.id),
  );

  // Edges: exact (penny) and near (1-5p), both inside the date window.
  const exact = new Map(); // receiptId -> [{tx, gap}]
  const near = new Map();
  const exactByTx = new Map(); // txId -> [receiptId]
  for (const r of candReceipts) {
    const rd = dayNum(r.date);
    if (rd == null) continue;
    const rp = pence(r.amount);
    for (const t of candTxs) {
      const td = dayNum(t.date);
      if (td == null || td < rd - DAYS_BEFORE || td > rd + DAYS_AFTER) continue;
      const diff = Math.abs(pence(t.amount) - rp);
      if (diff > NEAR_PENCE) continue;
      const edge = { tx: t, gap: Math.abs(td - rd), diff };
      if (diff === 0) {
        (exact.get(r.id) || exact.set(r.id, []).get(r.id)).push(edge);
        (exactByTx.get(t.id) || exactByTx.set(t.id, []).get(t.id)).push(r.id);
      } else {
        (near.get(r.id) || near.set(r.id, []).get(r.id)).push(edge);
      }
    }
  }

  const tierA = [];
  const tierB = [];
  const tierC = [];
  let noMatch = 0;
  for (const r of candReceipts) {
    const edges = exact.get(r.id) || [];
    if (edges.length === 1 && exactByTx.get(edges[0].tx.id).length === 1) {
      const { tx, gap } = edges[0];
      const overlap = supplierOverlap(r.vendor, tx.description);
      const item = { r, edges, overlap, gap };
      if (r.status === 'Paid' && (overlap || gap <= CLOSE_DAYS)) tierA.push(item);
      else {
        item.why = r.status !== 'Paid' ? `receipt ${r.status || 'no status'}` : `no supplier match, ${gap} days apart`;
        tierB.push(item);
      }
    } else if (edges.length > 0) {
      const shared = edges.some((e) => exactByTx.get(e.tx.id).length > 1);
      tierC.push({ r, edges, why: edges.length > 1 ? `${edges.length} possible lines` : shared ? 'line fits other receipts too' : 'ambiguous' });
    } else if (near.has(r.id)) {
      tierC.push({ r, edges: near.get(r.id), why: 'near miss (within 5p)' });
    } else {
      noMatch++;
    }
  }

  return { companyId, receipts, linkedBefore, candidates: candReceipts.length, tierA, tierB, tierC, noMatch, exact };
}

const edgeText = (e) =>
  `${e.tx.id} ${day(e.tx.date)} ${gbp(e.tx.amount)} "${String(e.tx.description || '').trim()}" [${e.tx.category || '-'}]` +
  (e.diff ? ` (${e.diff}p off)` : '');
const itemLine = (companyId, x) =>
  `- ${companyId} · receipt \`${x.r.id}\` · ${String(x.r.vendor || '').trim() || '?'} · ${day(x.r.date)} · ${gbp(x.r.amount)} · ${x.r.status || '-'} — ${x.why}\n` +
  x.edges.map((e) => `    - ${edgeText(e)}`).join('\n');

// --receipts mode: why a requested id cannot be written.
function refusalReason(p, id) {
  const r = p.receipts.find((x) => x.id === id);
  if (!r) return 'receipt not found';
  if (r.reconciledByTxId) return `already linked to ${r.reconciledByTxId}`;
  if (r.paymentType === 'On Account') return 'On Account receipt';
  if (!r.receiptUrl) return 'no receipt file';
  if (!(Number(r.amount) > 0)) return 'amount is not above 0';
  const c = p.tierC.find((x) => x.r.id === id);
  if (c) return c.why;
  if (!p.exact.has(id)) return 'no reconciled bank line with the exact amount in the window';
  return 'not one-to-one';
}

function main() {
  const { out, company, apply, receiptIds } = parseArgs(process.argv.slice(2));
  const companies = company ? [company] : Object.keys(dbGet('/companies', { shallow: true }) || {}).sort();

  const update = {};
  const backup = {};
  const plans = companies.map(planCompany);
  const refused = [];
  // Planned items per company: Tier A by default. With --receipts, only the requested ids that are
  // one-to-one (Tier A or B); those are also marked Paid. The backup keeps the full prior record.
  for (const p of plans) {
    if (receiptIds) {
      const oneToOne = new Map([...p.tierA, ...p.tierB].map((x) => [x.r.id, x]));
      p.selected = [];
      for (const id of receiptIds) {
        const x = oneToOne.get(id);
        if (x) p.selected.push(x);
        else refused.push({ companyId: p.companyId, id, why: refusalReason(p, id) });
      }
    } else {
      p.selected = p.tierA;
    }
    for (const { r, edges } of p.selected) {
      const base = `companies/${p.companyId}/receipts/${r.id}`;
      const { id, ...record } = r;
      backup[base] = record;
      update[`${base}/reconciledByTxId`] = edges[0].tx.id;
      if (receiptIds) update[`${base}/status`] = 'Paid';
    }
  }

  mkdirSync(out, { recursive: true });
  const updateFile = join(out, 'link-update.json');
  writeFileSync(updateFile, JSON.stringify(update, null, 2) + '\n');
  writeFileSync(join(out, 'link-backup.json'), JSON.stringify(backup, null, 2) + '\n');

  // Apply Tier A, then re-read every planned path.
  let applied = null;
  if (apply && Object.keys(update).length > 0) {
    dbUpdate(updateFile);
    const bad = [];
    for (const p of plans) {
      const fresh = dbGet(`/companies/${p.companyId}/receipts`) || {};
      for (const { r, edges } of p.selected) {
        const now = fresh[r.id] || {};
        const okLink = now.reconciledByTxId === edges[0].tx.id;
        const okStatus = !receiptIds || now.status === 'Paid';
        if (!okLink || !okStatus) {
          const got = { reconciledByTxId: now.reconciledByTxId, status: now.status };
          bad.push(`companies/${p.companyId}/receipts/${r.id} = ${JSON.stringify(got)}`);
        }
      }
      p.linkedAfter = Object.values(fresh).filter((x) => x && x.reconciledByTxId).length;
    }
    applied = { paths: Object.keys(update).length, bad };
  }

  const lines = [
    `# Receipt -> bank line links (${apply ? (receiptIds ? 'APPLIED selected receipts' : 'APPLIED Tier A') : 'DRY RUN'})`,
    '',
    `Project: ${PROJECT}. Generated ${new Date().toISOString()}. ` +
      (!apply
        ? 'Nothing was written to Firebase.'
        : receiptIds
          ? 'Selected receipts were written (reconciledByTxId + status Paid).'
          : 'Tier A links were written (receipts/<id>/reconciledByTxId only).'),
    '',
    `Window: line date from receipt date -${DAYS_BEFORE} to +${DAYS_AFTER} days; exact amount; one-to-one. ` +
      `Tier A = Paid and (supplier overlap or <= ${CLOSE_DAYS} days).`,
    '',
    '| company | receipts | linked before | candidates | Tier A | Tier B | Tier C | no match |' + (applied ? ' linked after |' : ''),
    '|---|---:|---:|---:|---:|---:|---:|---:|' + (applied ? '---:|' : ''),
  ];
  for (const p of plans) {
    lines.push(
      `| ${p.companyId} | ${p.receipts.length} | ${p.linkedBefore} | ${p.candidates} | ${p.tierA.length} | ${p.tierB.length} | ${p.tierC.length} | ${p.noMatch} |` +
        (applied ? ` ${p.linkedAfter} |` : ''),
    );
  }
  lines.push('');
  if (applied) {
    lines.push(`Applied ${applied.paths} paths; re-read mismatches: ${applied.bad.length}.`, '');
    for (const b of applied.bad) lines.push(`- MISMATCH ${b}`);
    if (applied.bad.length) lines.push('');
  }
  if (receiptIds) {
    lines.push(`## Selected receipts (${receiptIds.length} requested)`, '', '### Planned (reconciledByTxId + status Paid)', '');
    const sel = plans.flatMap((p) =>
      p.selected.map((x) => itemLine(p.companyId, { ...x, why: x.overlap ? 'supplier match' : `${x.gap} days apart` })),
    );
    lines.push(sel.length ? sel.join('\n') : 'None.', '', '### Refused (not one-to-one; never written)', '');
    lines.push(refused.length ? refused.map((x) => `- ${x.companyId} · receipt \`${x.id}\` — ${x.why}`).join('\n') : 'None.', '');
  }
  lines.push('## Tier B (one-to-one, not applied)', '');
  const tierB = plans.flatMap((p) => p.tierB.map((x) => itemLine(p.companyId, x)));
  lines.push(tierB.length ? tierB.join('\n') : 'None.', '');
  lines.push('## Tier C (ambiguous or near miss, not applied)', '');
  const tierC = plans.flatMap((p) => p.tierC.map((x) => itemLine(p.companyId, x)));
  lines.push(tierC.length ? tierC.join('\n') : 'None.', '');
  lines.push(receiptIds ? '## Tier A (for reference only)' : '## Tier A (planned links)', '');
  for (const p of plans) {
    for (const x of p.tierA) {
      lines.push(itemLine(p.companyId, { ...x, why: x.overlap ? 'supplier match' : `${x.gap} days apart` }));
    }
  }
  lines.push('');
  writeFileSync(join(out, 'link-report.md'), lines.join('\n'));

  for (const p of plans) {
    console.log(
      `${p.companyId}: receipts ${p.receipts.length}, linked ${p.linkedBefore}` +
        (applied ? ` -> ${p.linkedAfter}` : '') +
        `; A ${p.tierA.length}, B ${p.tierB.length}, C ${p.tierC.length}, no match ${p.noMatch}`,
    );
  }
  if (receiptIds) {
    const n = plans.reduce((sum, p) => sum + p.selected.length, 0);
    console.log(`Selected: ${n} planned, ${refused.length} refused of ${receiptIds.length} requested`);
    for (const x of refused) console.log(`  refused ${x.id}: ${x.why}`);
  }
  if (applied) console.log(`APPLIED ${applied.paths} paths; mismatches ${applied.bad.length}`);
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${Object.keys(update).length} ${receiptIds ? 'selected' : 'Tier A'} paths -> ${out}`);
  if (applied && applied.bad.length) process.exit(2);
}

main();
