// Full-app redesign check (spec 5.3). Usage: node scripts/redesign-check.mjs <port>
// Runs against a running dev server with the demo user (?mode=screenshot). For every view:
//   - console errors (the known relative ./sw.js MIME error on deep links is ignored)
//   - no sideways scroll at 320x640
//   - touch targets at 390 (emulated touch phone): visible controls >= 44x44 (fail), < 48 (warning)
//   - screenshots at 390x844 and 1280x800, dark + light (green brand), plus blue dark at 390,
//     saved to _redesign-notes/shots-final/<view>-<w>-<theme>.png
// Prints a pass/fail table; per-element detail goes to _redesign-notes/shots-final/details.txt.
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const port = process.argv.find(a => /^\d+$/.test(a)) || '5193';
const base = `http://localhost:${port}`;
const outDir = path.join(process.cwd(), '_redesign-notes', 'shots-final');
fs.mkdirSync(outDir, { recursive: true });

const VIEWS = [
  'dashboard', 'stock', 'stock/1', 'garage', 'workPrep', 'pdi', 'sales', 'pipeline', 'leadDetail',
  'agentInbox', 'expenses', 'expenses?tab=bank', 'income', 'vat', 'ledger', 'workSheets',
  'internalJobs', 'accountant', 'filingCabinet', 'canvas', 'settings',
];
const urlFor = v => {
  const [p, qs] = v.split('?');
  return `${base}/app/${p}?mode=screenshot${qs ? '&' + qs : ''}`;
};
const slug = v => v.replace('?tab=', '-').replace('/', '-');
const IGNORE = /sw\.js|unsupported MIME type \('text\/html'\)/;
const TARGETS = 'nav a, nav button, button, [role=switch], [role=tab], a[href]';
const wait = ms => new Promise(r => setTimeout(r, ms));

// One browser per worker, one page at a time: a background tab in headless Chrome is
// 'hidden' and never runs requestAnimationFrame, which freezes rAF-driven entrances.
const launch = () => puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

// Demo data uses the blue brand; swap it for another by renaming theme-blue wherever
// LedgerCore stamps it (<html> and the shell wrapper).
const open = async (browser, view, width, height, theme, brand) => {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', async m => {
    if (m.type() !== 'error' || IGNORE.test(m.text())) return;
    // Spell out Error objects instead of "JSHandle@object".
    const parts = await Promise.all(m.args().map(a => a.evaluate(v => v instanceof Error ? v.message : (typeof v === 'object' ? JSON.stringify(v) : String(v))).catch(() => '?')));
    errors.push((parts.join(' ') || m.text()).slice(0, 200));
  });
  page.on('pageerror', e => { if (!IGNORE.test(String(e))) errors.push('pageerror: ' + String(e.message || e).slice(0, 200)); });
  // Phone widths emulate a touch phone, so (pointer: coarse) styles apply as on a real phone.
  const phone = width < 600;
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  await page.evaluateOnNewDocument((t, b) => {
    try { localStorage.setItem('dlp.themeMode', t); localStorage.removeItem('dlp.nav.collapsed'); } catch {}
    if (b === 'blue') return;
    const swap = el => { if (el.classList?.contains('theme-blue')) { el.classList.remove('theme-blue'); el.classList.add('theme-' + b); } };
    new MutationObserver(ms => { for (const m of ms) {
      if (m.type === 'attributes') swap(m.target);
      else for (const n of m.addedNodes) { if (n.nodeType === 1) { swap(n); n.querySelectorAll?.('.theme-blue').forEach(swap); } }
    } }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }, theme, brand);
  // The inbox keeps a Firebase long-poll open, so never wait for a fully idle network.
  await page.goto(urlFor(view), { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(e => errors.push('goto: ' + e.message));
  await page.waitForSelector('nav[aria-label="Main"]', { timeout: 60000 }).catch(() => errors.push('no main nav'));
  await page.waitForNetworkIdle({ idleTime: 500, concurrency: 2, timeout: 8000 }).catch(() => {});
  await wait(700);
  return { page, errors };
};

const results = [];
const detail = [];
const runView = async (browser, view) => {
  const r = { view, errors: new Set(), overflow: null, small: 0, warn: 0, shots: 0 };
  // 320 reflow
  {
    const { page, errors } = await open(browser, view, 320, 640, 'dark', 'green');
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    r.overflow = m.sw <= m.iw ? null : `${m.sw}>${m.iw}`;
    if (r.overflow) {
      const wide = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)}`));
      detail.push(`[${view}] 320 overflow ${r.overflow}: ${wide.join(' | ')}`);
    }
    errors.forEach(e => r.errors.add(e));
    await page.close();
  }
  for (const [w, h, theme, brand] of [[390, 844, 'dark', 'green'], [390, 844, 'light', 'green'], [1280, 800, 'dark', 'green'], [1280, 800, 'light', 'green'], [390, 844, 'dark', 'blue']]) {
    const { page, errors } = await open(browser, view, w, h, theme, brand);
    if (w === 390 && theme === 'dark' && brand === 'green') {
      const els = await page.$$eval(TARGETS, els => els.map(el => {
        const b = el.getBoundingClientRect();
        const vis = b.width > 0 && b.height > 0 && b.right > 0 && b.left < window.innerWidth
          && (el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true)
          && !el.closest('[aria-hidden="true"], [inert]');
        const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return { vis, w: Math.round(b.width), h: Math.round(b.height), tag: el.tagName.toLowerCase(), label, cls: String(el.className).slice(0, 90) };
      }).filter(x => x.vis));
      for (const e of els) {
        if (e.w < 44 || e.h < 44) { r.small++; detail.push(`[${view}] FAIL ${e.w}x${e.h} <${e.tag}> "${e.label}" .${e.cls}`); }
        else if (e.w < 48 || e.h < 48) { r.warn++; detail.push(`[${view}] warn ${e.w}x${e.h} <${e.tag}> "${e.label}" .${e.cls}`); }
      }
    }
    const name = `${slug(view)}-${w}-${theme}${brand === 'blue' ? '-blue' : ''}.png`;
    await page.screenshot({ path: path.join(outDir, name) });
    r.shots++;
    errors.forEach(e => r.errors.add(e));
    await page.close();
  }
  for (const e of r.errors) detail.push(`[${view}] console: ${e}`);
  results.push(r);
};

// Warm the dev server (first load optimises deps), then three views at a time.
{ const b = await launch(); await (await open(b, 'dashboard', 390, 844, 'dark', 'blue')).page.close(); await b.close(); }
const queue = [...VIEWS];
await Promise.all([0, 1, 2].map(async () => {
  const browser = await launch();
  while (queue.length) await runView(browser, queue.shift());
  await browser.close();
}));

results.sort((a, b) => VIEWS.indexOf(a.view) - VIEWS.indexOf(b.view));
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('view', 20)}${pad('console', 9)}${pad('320 fit', 11)}${pad('<44', 6)}${pad('<48 warn', 10)}${pad('shots', 7)}result`);
let failed = 0;
for (const r of results) {
  const ok = r.errors.size === 0 && !r.overflow && r.small === 0;
  if (!ok) failed++;
  console.log(`${pad(r.view, 20)}${pad(r.errors.size, 9)}${pad(r.overflow || 'ok', 11)}${pad(r.small, 6)}${pad(r.warn, 10)}${pad(r.shots, 7)}${ok ? 'PASS' : 'FAIL'}`);
}
const distinct = new Map();
for (const r of results) for (const e of r.errors) distinct.set(e, (distinct.get(e) || 0) + 1);
if (distinct.size) console.log('\nConsole errors (number of views):');
for (const [e, n] of distinct) console.log(`  ${n}x ${e}`);
fs.writeFileSync(path.join(outDir, 'details.txt'), detail.join('\n') + '\n');
console.log(`\n${results.length - failed}/${results.length} views pass. Detail: ${path.relative(process.cwd(), path.join(outDir, 'details.txt'))}`);
process.exit(failed ? 1 : 0);
