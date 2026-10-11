// Dev-only checks for the UI primitives, run against the gallery on a dev server.
//
//   npx vite --port 5181 --strictPort          (in another terminal)
//   node dev/check-primitives.mjs              checks; exits 1 on any failure
//   node dev/check-primitives.mjs --shots      also saves gallery shots to _redesign-notes/shots-D1/
//
// Base URL: GALLERY_URL env, default http://localhost:5181/ui-gallery.html
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.GALLERY_URL || 'http://localhost:5181/ui-gallery.html';
const SHOTS = process.argv.includes('--shots');
const SHOT_DIR = path.join(process.cwd(), '_redesign-notes', 'shots-D1');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failures = 0;
let navCount = 0;
const pass = msg => console.log(`PASS  ${msg}`);
const fail = (msg, detail) => { failures++; console.log(`FAIL  ${msg}`); if (detail) console.log(`      ${detail}`); };

const open = async (browser, { width = 390, height = 844, theme = 'dark', brand = 'green', reduce = false } = {}) => {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  if (reduce) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`${BASE}?theme=${theme}&brand=${brand}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForSelector('html[data-gallery-ready]', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  // Any reload after this point spoils the check that owns the page.
  page.on('framenavigated', f => { if (f === page.mainFrame()) navCount++; });
  return page;
};

/** Describes the focused element, and whether it sits inside the open dialog panel. */
const focusInfo = page => page.evaluate(() => {
  const a = document.activeElement;
  const panel = document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]');
  const name = a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}${a.getAttribute('aria-label') ? `[${a.getAttribute('aria-label')}]` : ''} "${(a.textContent || '').trim().slice(0, 24)}"` : 'null';
  return { inside: !!(panel && a && panel.contains(a)), name, hasPanel: !!panel };
});

const trapCheck = async (browser, opener, label) => {
  const page = await open(browser);
  await page.focus(opener);
  await page.keyboard.press('Enter');
  await page.waitForSelector('[aria-modal="true"]', { timeout: 5000 });
  await sleep(450);
  const start = await focusInfo(page);
  if (!start.inside) fail(`${label}: focus moves inside on open`, `focus on ${start.name}`);
  else pass(`${label}: focus moves inside on open (${start.name})`);

  const seen = new Set();
  let escaped = null;
  for (let i = 1; i <= 30; i++) {
    await page.keyboard.press('Tab');
    const f = await focusInfo(page);
    seen.add(f.name);
    if (!f.inside && !escaped) escaped = `Tab ${i}: focus on ${f.name}`;
  }
  // And back the other way, past the first control.
  for (let i = 1; i <= 10; i++) {
    await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
    const f = await focusInfo(page);
    if (!f.inside && !escaped) escaped = `Shift+Tab ${i}: focus on ${f.name}`;
  }
  if (escaped) fail(`${label}: Tab x30 + Shift+Tab x10 stays inside`, escaped);
  else pass(`${label}: Tab x30 + Shift+Tab x10 stays inside (${seen.size} distinct stops)`);

  await page.keyboard.press('Escape');
  await sleep(500);
  const after = await page.evaluate(sel => ({
    open: !!document.querySelector('[aria-modal="true"]'),
    onOpener: document.activeElement === document.querySelector(sel),
    active: document.activeElement ? document.activeElement.outerHTML.slice(0, 80) : 'null',
  }), opener);
  if (after.open) fail(`${label}: Esc closes`, 'dialog still in the DOM 500ms after Esc');
  else pass(`${label}: Esc closes`);
  if (!after.onOpener) fail(`${label}: focus returns to the opener`, `focus on ${after.active}`);
  else pass(`${label}: focus returns to the opener ${opener}`);
  await page.close();
};

/** Every animation (CSS animations and transitions) that ran or is running, with its total length. */
const collectAnimations = page => page.evaluate(() => document.getAnimations().map(a => {
  const t = a.effect.getComputedTiming();
  const target = a.effect.target;
  const who = target ? `${target.tagName.toLowerCase()}.${String(target.className && target.className.baseVal !== undefined ? target.className.baseVal : target.className).split(' ').slice(0, 3).join('.')}` : '?';
  return { name: a.animationName || a.transitionProperty || a.constructor.name, end: t.endTime, who };
}));

const reducedMotionCheck = async browser => {
  const page = await open(browser, { reduce: true });
  const all = [];
  const grab = async when => { for (const a of await collectAnimations(page)) all.push({ ...a, when }); };

  await page.click('#open-sheet');
  await sleep(30); await grab('sheet opening');
  await sleep(250); await grab('sheet open');
  await page.keyboard.press('Escape');
  await sleep(30); await grab('sheet closing');
  await sleep(400);

  await page.click('#open-dialog');
  await sleep(30); await grab('dialog opening');
  await page.keyboard.press('Escape');
  await sleep(30); await grab('dialog closing');
  await sleep(400);

  // A toast, a switch and a tab change: transitions everywhere else.
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Show toast').click());
  await sleep(30); await grab('toast in');
  await page.click('[role="switch"]');
  await page.click('[role="tab"]:nth-child(3)');
  await sleep(10); await grab('switch + tab');

  const long = all.filter(a => !(a.end <= 160));
  const max = all.reduce((m, a) => Math.max(m, a.end), 0);
  if (all.length === 0) fail('reduced motion: animations observed', 'document.getAnimations() was empty at every sample');
  else if (long.length) fail(`reduced motion: every animation ≤ 160ms (${long.length} of ${all.length} longer)`, long.slice(0, 6).map(a => `${a.when}: ${a.name} on ${a.who} = ${a.end}ms`).join(' | '));
  else pass(`reduced motion: all ${all.length} sampled animations ≤ 160ms (longest ${max}ms: ${[...new Set(all.filter(a => a.end === max).map(a => a.name))].join(', ')})`);
  await page.close();
};

const targetCheck = async browser => {
  const page = await open(browser, { width: 390 });
  const res = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, [role="switch"], [role="tab"]')];
    const bad = [];
    let checked = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 && r.height === 0) continue; // not rendered (closed disclosure, desktop-only table)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      checked++;
      const min = el.getAttribute('data-size') === 'sm' ? 44 : 48;
      if (r.width < min - 0.5 || r.height < min - 0.5) {
        bad.push(`${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)} (min ${min})`);
      }
    }
    return { checked, bad, overflow: document.documentElement.scrollWidth - window.innerWidth };
  });
  if (res.bad.length) fail(`390px: touch targets (${res.bad.length} of ${res.checked} too small)`, res.bad.join('\n      '));
  else pass(`390px: all ${res.checked} visible buttons, switches and tabs ≥ 48x48 (small buttons ≥ 44x44)`);
  if (res.overflow > 0) fail('390px: no horizontal page scroll', `scrollWidth exceeds the viewport by ${res.overflow}px`);
  else pass('390px: no horizontal page scroll');
  await page.close();
};

const shots = async browser => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  for (const width of [390, 1280]) {
    for (const theme of ['dark', 'light']) {
      for (const brand of ['green', 'blue']) {
        // One page per combination, so a dev-server reload only costs that shot.
        await run(`shots ${width} ${theme} ${brand}`, async () => {
          const page = await open(browser, { width, height: width === 390 ? 844 : 800, theme, brand });
          await sleep(300);
          const name = `gallery-${width}-${theme}-${brand}.png`;
          await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true });
          // Sheet open, so the overlay can be seen too.
          await page.click('#open-sheet');
          await sleep(500);
          const sheetName = `sheet-${width}-${theme}-${brand}.png`;
          await page.screenshot({ path: path.join(SHOT_DIR, sheetName) });
          await page.close();
          console.log(`SHOT  ${name}, ${sheetName}`);
        });
      }
    }
  }
};

// Other work in the same tree makes the dev server reload open pages now and
// then. A check spoiled by a reload is run again from scratch; its results are
// only printed once it finishes without one.
const reloaded = e => /Execution context was destroyed|Cannot find context|navigation|Target closed|Session closed|detached/i.test(String(e && e.message));
async function run(label, fn) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const out = [];
    const before = failures;
    const navBefore = navCount;
    const realLog = console.log;
    console.log = (...a) => out.push(a.join(' '));
    let error = null;
    try { await fn(); } catch (e) { error = e; }
    console.log = realLog;
    const spoiled = navCount !== navBefore || (error && reloaded(error));
    if (!spoiled) {
      out.forEach(l => console.log(l));
      if (error) throw error;
      return;
    }
    failures = before;
    if (attempt === 6) throw new Error(`${label}: the page kept reloading; no clean run in 6 tries`);
    console.log(`RETRY ${label}: page reloaded by the dev server mid-check (attempt ${attempt})`);
  }
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  await run('Sheet trap', () => trapCheck(browser, '#open-sheet', 'Sheet'));
  await run('Dialog trap', () => trapCheck(browser, '#open-dialog', 'Dialog'));
  await run('reduced motion', () => reducedMotionCheck(browser));
  await run('touch targets', () => targetCheck(browser));
  if (SHOTS) await shots(browser);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
