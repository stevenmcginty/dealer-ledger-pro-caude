// WCAG 2.1 contrast check for every token pair the Forecourt Ledger system uses.
// Port of the design package script (_redesign-notes/contrast.mjs) to the app's styles.css:
// reads the light (:root) and dark (:root[data-theme="dark"]) token blocks and the 6 brand
// palettes (.theme-<name>), then checks each pair in both themes against every brand.
// Usage: node scripts/check-contrast.mjs styles.css     exit 1 if any pair fails.
import fs from 'node:fs';

const file = process.argv[2] || 'styles.css';
const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selectorRe) {
  const m = css.match(selectorRe);
  if (!m) throw new Error('block not found: ' + selectorRe);
  const decl = {};
  for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decl[d[1]] = d[2].trim();
  return decl;
}
const light = block(/@layer base\s*\{\s*:root\s*\{([^}]*)\}/);
const darkAttr = block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
const dark = { ...light, ...darkAttr };
const BRANDS = ['blue', 'green', 'red', 'purple', 'pink', 'yellow'];
const brands = {};
brands.blue = block(/:root,\s*\.theme-blue\s*\{([^}]*)\}/);
for (const b of BRANDS.slice(1)) brands[b] = block(new RegExp('\\.theme-' + b + '\\s*\\{([^}]*)\\}'));

let problems = 0;
// every colour token in the dark block must also exist in the light block
const orphan = Object.keys(darkAttr).filter(k => !(k in light));
if (orphan.length) { console.error('Defined only in dark:', orphan); problems++; }

// Tokens are "R G B" triplets, or var(--color-brand-N) pointing at one.
function resolve(name, map, depth = 0) {
  const v = map[name];
  if (v == null || depth > 6) return null;
  let m;
  if ((m = v.match(/^(\d+)\s+(\d+)\s+(\d+)$/))) return [m[1], m[2], m[3]].map(Number);
  if ((m = v.match(/^var\((--[\w-]+)\)$/))) return resolve(m[1], map, depth + 1);
  return null;
}
const lum = ([r, g, b]) => [r, g, b].map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const T = 4.5, U = 3;
const pairs = [
  ['ink', 'bg', T], ['ink', 'surface', T], ['ink', 'surface-2', T], ['ink', 'surface-3', T],
  ['ink-2', 'bg', T], ['ink-2', 'surface', T], ['ink-2', 'surface-2', T],
  ['ink-3', 'bg', T], ['ink-3', 'surface', T], ['ink-3', 'surface-2', T], ['ink-3', 'surface-3', T],
  ['surface', 'ink', T],
  ['accent-text', 'surface', T], ['accent-text', 'bg', T], ['accent-text', 'surface-2', T],
  ['on-accent', 'accent', T], ['on-accent', 'accent-hover', T], ['on-accent', 'accent-press', T],
  ['accent-soft-ink', 'accent-soft', T], ['ink', 'accent-soft', T], ['ink-3', 'accent-soft', T],
  ['ink', 'bubble-out', T], ['ink', 'bubble-in', T], ['ink-3', 'bubble-in', T],
  ['success', 'surface', T], ['success-ink', 'success-soft', T],
  ['warning', 'surface', T], ['warning-ink', 'warning-soft', T],
  ['danger', 'surface', T], ['danger', 'bg', T], ['danger-ink', 'danger-soft', T],
  ['on-danger', 'danger', T], ['on-danger', 'danger-hover', T],
  ['on-whatsapp', 'whatsapp', T], ['on-whatsapp', 'whatsapp-hover', T], ['on-whatsapp', 'whatsapp-press', T],
  ['info', 'surface', T], ['info-ink', 'info-soft', T],
  ['plate-ink', 'plate-yellow', T], ['plate-ink', 'plate-white', T],
  ['line-strong', 'surface', U], ['line-strong', 'bg', U], ['line-strong', 'surface-2', U],
  ['focus', 'surface', U], ['focus', 'bg', U], ['focus', 'surface-2', U],
  ['accent', 'surface', U], ['accent', 'bg', U],
  ['ink-2', 'surface-3', U], ['danger', 'surface-2', U],
];
const brandDependent = n => /accent|focus|bubble-out/.test(n);
const kindLabel = t => (t === T ? 'text 4.5' : 'UI 3.0');

let pass = 0, fail = 0;
for (const [f, b, min] of pairs) {
  const fg = '--c-' + f, bg = '--c-' + b;
  const res = {};
  for (const [mode, base] of [['light', light], ['dark', dark]]) {
    const usesBrand = brandDependent(f) || brandDependent(b);
    let worst = Infinity, worstBrand = 'blue';
    for (const name of usesBrand ? BRANDS : ['blue']) {
      const map = { ...brands[name], ...base };
      const a = resolve(fg, map), c = resolve(bg, map);
      if (!a || !c) { console.error(`cannot resolve ${fg} / ${bg} (${mode}, ${name})`); problems++; continue; }
      const r = ratio(a, c);
      if (r < worst) { worst = r; worstBrand = name; }
    }
    res[mode] = { r: worst, b: worstBrand, ok: worst >= min };
    res[mode].ok ? pass++ : fail++;
  }
  const ok = res.light.ok && res.dark.ok;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${fg.padEnd(19)} on ${bg.padEnd(16)} ${kindLabel(min)}  light ${res.light.r.toFixed(2)} (${res.light.b})  dark ${res.dark.r.toFixed(2)} (${res.dark.b})`);
}
console.log(`\n${pass} checks passed, ${fail} failed (${pairs.length} pairs x 2 themes; accent pairs = worst of ${BRANDS.length} brands)`);
if (fail || problems) process.exitCode = 1;
