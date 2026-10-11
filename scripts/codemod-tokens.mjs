#!/usr/bin/env node
// Codemod: hard-coded Tailwind colours (dark-only greys, brand-*, red/green/...,
// tiny arbitrary text sizes) -> the semantic tokens in tailwind.config.js.
//
//   node scripts/codemod-tokens.mjs           rewrite the in-scope files
//   node scripts/codemod-tokens.mjs --check   dry run: report changes + unmapped tokens
//   node scripts/codemod-tokens.mjs --list    dry run + list every change (file:line old -> new)
//   node scripts/codemod-tokens.mjs --pairs   dry run + count of each token mapping
//
// It walks the TypeScript AST, so it rewrites class tokens inside ANY string or
// template literal (className="", lookup maps, ternaries), and nothing else.
// A "class string" is one literal; template literals fall back to their static
// parts for context (e.g. `bg-brand-600 ${x ? 'text-white' : ''}`).
// Re-running it is safe: every output token is either a semantic token or a
// deliberate keep, so a second run changes nothing.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODE = process.argv.includes('--pairs') ? 'pairs' : process.argv.includes('--list') ? 'list' : process.argv.includes('--check') ? 'check' : 'write';

// ---------------------------------------------------------------- scope
const SCOPE_DIRS = ['components', 'pages', 'contexts', 'hooks', 'utils'];
const SCOPE_FILES = ['App.tsx'];
const EXCLUDE = [
  /^components\/ui\//, /^components\/nav\//, /^components\/auth\//, /^admin\//,
  /^LedgerCore\.tsx$/,
  /^components\/common\/(Modal|Select|CurrencyInput|UkDateInput|Spinner)\.tsx$/,
  /^components\/common\/Calendar[^/]*\.tsx$/,
  // Printables: their greys mean LIGHT paper.
  /^components\/sales\/PrintableView\.tsx$/, /^components\/income\/PrintableMiscInvoice\.tsx$/,
  /^components\/invoicing\/PrintableJobInvoice\.tsx$/, /^components\/internal-jobs\/PrintableJobSheet\.tsx$/,
  /^components\/pdi\/PrintablePdi\.tsx$/, /^components\/work-sheets\/PrintableWorkSheet\.tsx$/,
  /^components\/common\/SpecSheet\.tsx$/, /^utils\/pdf\.ts$/, /^components\/sales\/printablePdf\.ts$/,
  // Marketing pages stay dark by design.
  /^pages\/LandingPage\.tsx$/, /^pages\/DemoVideoPage\.tsx$/,
  // Already on tokens (theme work).
  /^components\/settings\/AppearancePage\.tsx$/, /^contexts\/ThemeContext\.tsx$/, /^utils\/themeMode\.ts$/,
];

// Lines never touched: class strings stored in the database (category colour dots).
const SKIP_LINES = [
  { file: 'contexts/DataContext.tsx', re: /color: 'bg-[a-z]+-\d+'/ },
];

// Tokens kept on purpose, per file.
const KEEP = [
  // Sticky notes: light pastel cards with dark text read in both themes.
  { file: /^components\/canvas\/Canvas(Card|ItemModal)\.tsx$/, re: /^(bg-(yellow|pink|sky|green)-(200|300)|text-(yellow|pink|sky|green)-900|placeholder-(yellow|pink|sky|green)-700\/80|border-(yellow|pink|sky|green)-300\/50|hover:ring-(yellow|pink|sky|green)-400|hover:bg-black\/10)$/ },
  // Pipeline stage colours are categories, not roles; solid 500 dots read in both themes.
  { file: /^pages\/PipelinePage\.tsx$/, re: /^(bg|border)-(blue|amber|orange|green)-500(\/50)?$/ },
];

// Exact substring rewrites applied before the token pass (sites a rule cannot see).
const SPECIAL = [
  // Number plate: yellow plate + plate ink in both themes.
  { file: 'components/salesAgent/inbox/CarPicker.tsx', from: 'bg-yellow-300 px-1.5 py-px font-mono text-[11px] font-bold leading-tight tracking-wide text-gray-950', to: 'bg-plate-yellow px-1.5 py-px font-mono text-xs font-bold leading-tight tracking-wide text-plate-ink' },
  // Theme surface for the PDF export; html2canvas cannot parse var(), so resolve the token.
  { file: 'components/reporting/VatSummary.tsx', from: "backgroundColor: '#1f2937',", to: "backgroundColor: `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--c-surface').trim().split(/\\s+/).join(',')})`," },
  // Chat texture dots in ink, so they show on light and dark wallpapers.
  { file: 'components/salesAgent/AgentInboxPage.tsx', from: 'rgba(255,255,255,0.028)', to: 'rgb(var(--c-ink) / 0.028)' },
  // Tick only renders on the selected (accent) box; the parent's ternary hides that.
  { file: 'components/common/TransactionAllocatorModal.tsx', from: '<CheckCircleIcon className="w-4 h-4 text-white" />', to: '<CheckCircleIcon className="w-4 h-4 text-on-accent" />' },
  // WhatsApp draft bubble -> theme bubble colour.
  { file: 'components/salesAgent/DraftReviewCard.tsx', from: "'bg-[#202c33] border border-gray-700/60", to: "'bg-bubble-in border border-gray-700/60" },
  // WhatsApp phone mock-up: WhatsApp's dark hex palette -> theme tokens and bubbles.
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "rounded-2xl rounded-tl-sm bg-[#202c33] px-4 py-3 shadow", to: "rounded-2xl rounded-tl-sm bg-bubble-in px-4 py-3 shadow" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "relative overflow-hidden rounded-[2rem] bg-[#0b141a]", to: "relative overflow-hidden rounded-[2rem] bg-bg" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "relative z-10 flex items-center gap-3 bg-[#075e54] px-3 pb-3 pt-8", to: "relative z-10 flex items-center gap-3 bg-surface-2 px-3 pb-3 pt-8" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "<ChevronLeftIcon className=\"h-5 w-5 text-white/80 flex-shrink-0\" />", to: "<ChevronLeftIcon className=\"h-5 w-5 text-ink-2 flex-shrink-0\" />" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "<p className=\"truncate text-sm font-semibold text-white\">", to: "<p className=\"truncate text-sm font-semibold text-ink\">" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "<p className=\"text-[11px] text-white/70\">", to: "<p className=\"text-xs text-ink-3\">" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "<PhoneIcon className=\"h-5 w-5 text-white/80 flex-shrink-0\" />", to: "<PhoneIcon className=\"h-5 w-5 text-ink-2 flex-shrink-0\" />" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "rgba(255,255,255,0.03) 1px, transparent 1px), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.03) 1px", to: "rgb(var(--c-ink) / 0.03) 1px, transparent 1px), radial-gradient(circle at 75% 75%, rgb(var(--c-ink) / 0.03) 1px" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "max-w-[15rem] rounded-lg bg-[#182229] px-3 py-2", to: "max-w-[15rem] rounded-lg bg-surface px-3 py-2" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "'rounded-2xl rounded-tr-sm bg-[#005c4b] text-white'", to: "'rounded-2xl rounded-tr-sm bg-bubble-out text-ink'" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "'rounded-2xl rounded-tl-sm bg-[#202c33] text-gray-100'", to: "'rounded-2xl rounded-tl-sm bg-bubble-in text-ink'" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "<p className=\"mt-1 text-right text-[10px] text-white/50\">", to: "<p className=\"mt-1 text-right text-xs text-ink-3\">" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "flex items-center gap-2 bg-[#111b21] px-3 py-3", to: "flex items-center gap-2 bg-surface px-3 py-3" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "rounded-full bg-[#2a3942] px-4 py-2 text-sm text-white", to: "rounded-full bg-surface-2 px-4 py-2 text-sm text-ink" },
  { file: 'components/salesAgent/AgentSimulator.tsx', from: "rounded-full bg-[#00a884] text-white transition-opacity", to: "rounded-full bg-accent text-on-accent transition-opacity" },
];

// ---------------------------------------------------------------- palette
const NEUTRAL = new Set(['gray', 'slate', 'zinc', 'neutral', 'stone']);
const ROLE = { red: 'danger', rose: 'danger', green: 'success', emerald: 'success', amber: 'warning', yellow: 'warning', orange: 'warning', blue: 'info', sky: 'info', indigo: 'info' };
const DECOR = new Set(['purple', 'violet', 'fuchsia', 'pink', 'cyan', 'teal', 'lime']);
const COLORS = ['gray', 'slate', 'zinc', 'neutral', 'stone', 'white', 'black', 'brand', ...Object.keys(ROLE), ...DECOR];

const UTIL_RE = /^(bg|text|border(?:-[trblxyse])?|divide|ring-offset|ring|outline|from|via|to|shadow|placeholder|fill|stroke|accent|caret|decoration)-(.+)$/;
const COLOR_RE = new RegExp(`^(${COLORS.join('|')})(?:-(\\d{2,3}))?(?:/(\\d+|\\[[^\\]]+\\]))?$`);
const SIZE_MAP = { '9px': 'xs', '10px': 'xs', '10.5px': 'xs', '11px': 'xs', '12px': 'xs', '12.5px': 'sm', '13px': 'sm' };
// WhatsApp brand greens stay for WhatsApp marks/buttons.
const HEX_OK = /#(25d366|20ba5a|1ebe5b|20bd5a|128c4a|111b21)\]/i; // 111b21 = ink on a WhatsApp-green button

// ---------------------------------------------------------------- token parsing
function parse(tok) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of tok) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ':' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  let base = parts.pop();
  const important = base.startsWith('!');
  if (important) base = base.slice(1);
  const t = { raw: tok, variants: parts, important, base, util: null, color: null, shade: null, op: null, opNum: null };
  const m = UTIL_RE.exec(base);
  if (m) {
    const c = COLOR_RE.exec(m[2]);
    if (c) {
      t.util = m[1]; t.color = c[1]; t.shade = c[2] ? Number(c[2]) : null; t.op = c[3] ?? null;
      if (t.op != null) t.opNum = t.op.startsWith('[') ? Number(t.op.slice(1, -1)) * 100 : Number(t.op);
    }
  }
  return t;
}
const vkey = (t) => t.variants.filter((v) => v !== 'dark').join(':');
const build = (t, base, variants = t.variants) => `${variants.length ? variants.join(':') + ':' : ''}${t.important ? '!' : ''}${base}`;
const opSuffix = (t) => (t.op != null ? `/${t.op}` : '');
const isSolid = (t) => t.shade != null && t.shade >= 400 && t.shade <= 700 && (t.opNum == null || t.opNum >= 50);
const isTint = (t) => t.shade != null && (t.shade >= 800 || t.shade <= 100 || (t.opNum != null && t.opNum < 50));

// What a bg-ish token means for the text drawn on it.
function bgKind(t) {
  if (t.util !== 'bg' && t.util !== 'from') {
    if (t.util == null && /^(bg|from)-\[#/.test(t.base)) return 'hex';
    if (t.util == null) {
      const m = /^bg-(accent|danger|scrim|success|warning|info)(-soft)?(?:\/|$)/.exec(t.base);
      if (m && m[1] === 'scrim' && /\/(\d|\[)/.test(t.base) && !/\/([5-9]\d|100)$/.test(t.base)) return 'neutral';
      if (m) return m[2] ? `soft:${m[1]}` : m[1] === 'success' ? 'solid:success' : m[1] === 'accent' || m[1] === 'danger' || m[1] === 'scrim' ? m[1] : `solid:${m[1]}`;
      if (/^bg-accent-soft/.test(t.base)) return 'soft:accent';
      if (/^bg-plate-yellow/.test(t.base)) return 'plate';
    }
    return null;
  }
  if (t.color == null) return null;
  if (t.color === 'black') return t.op == null ? 'dark' : t.opNum >= 50 ? 'scrim' : 'neutral';
  if (t.color === 'white') return t.op != null && t.opNum < 50 ? 'neutral' : 'light';
  if (NEUTRAL.has(t.color)) return t.shade <= 200 ? 'inverse' : 'neutral';
  if (t.color === 'brand') return isSolid(t) ? 'accent' : 'soft:accent';
  if (ROLE[t.color]) {
    if (isSolid(t)) return ROLE[t.color] === 'danger' ? 'danger' : `solid:${ROLE[t.color]}`;
    return `soft:${ROLE[t.color]}`;
  }
  if (DECOR.has(t.color)) return isSolid(t) ? 'decor-solid' : 'neutral';
  return null;
}

// ---------------------------------------------------------------- context
class Ctx {
  constructor(tokens, parent = null, tag = null) {
    this.tokens = tokens.map(parse);
    this.parent = parent;
    this.tag = tag;
  }
  kindsAt(key) {
    const out = [];
    for (const t of this.tokens) if ((t.util === 'bg' || t.util === 'from' || t.util == null) && vkey(t) === key) { const k = bgKind(t); if (k) out.push(k); }
    return out;
  }
  // The background a text token sits on: same variant first, then base, then parent.
  bgFor(key) {
    for (const c of [this, this.parent].filter(Boolean)) {
      const own = c.kindsAt(key);
      if (own.length) return pick(own);
    }
    for (const c of [this, this.parent].filter(Boolean)) {
      const base = c.kindsAt('');
      if (base.length) return pick(base);
    }
    // Conditional backgrounds in a template's nested strings, then the nearest
    // JSX ancestor that paints a background.
    // (Only for a template's own static text: a nested string's siblings are other
    // branches of a condition, so they are just flagged for review.)
    const ks = kindsOf(this.nested ?? [], key);
    if (ks.length) return unify(ks);
    if (kindsOf(this.parent?.nested ?? [], key).some((k) => k !== 'neutral' && k !== 'inverse')) REVIEW.push('sibling');
    for (const a of this.ancestors ?? this.parent?.ancestors ?? []) {
      const ks = kindsOf(a, key);
      if (ks.length) return unify(ks);
    }
    return null;
  }
  hasText() {
    return [this, this.parent].filter(Boolean).some((c) => c.tokens.some((t) => (t.util === 'text' && t.color) || /^text-(ink|on-|white|black)/.test(t.base)));
  }
  baseFamily(color) {
    return this.tokens.some((t) => t.util === 'bg' && vkey(t) === '' && t.color && (t.color === color || ROLE[t.color] === ROLE[color]) && isSolid(t));
  }
  allTokens() {
    return [this, this.parent].filter(Boolean).flatMap((c) => [...c.tokens.map((t) => t.raw), ...(c.nested ?? [])]);
  }
  has(re) { return [this, this.parent].filter(Boolean).some((c) => c.tokens.some((t) => re.test(t.raw))); }
}
function kindsOf(rawTokens, key) {
  return rawTokens.map(parse).filter((t) => vkey(t) === key || vkey(t) === '').map(bgKind).filter(Boolean);
}
// Several possible backgrounds: fine if they all want the same text colour.
function unify(kinds) {
  const outcomes = new Set(kinds.map((k) => onBg(k, ['hex', 'decor-solid', 'scrim', 'dark', 'light'].includes(k) ? 'keep' : 'ink')));
  return outcomes.size === 1 ? pick(kinds) : 'ambiguous';
}
function pick(kinds) {
  const order = ['hex', 'plate', 'accent', 'danger', 'solid:success', 'solid:warning', 'solid:info', 'decor-solid', 'scrim', 'dark', 'light', 'inverse'];
  for (const k of order) if (kinds.includes(k)) return k;
  return kinds.find((k) => k.startsWith('soft:')) ?? kinds[0];
}

// ---------------------------------------------------------------- mapping
const KEEP_TOKEN = Symbol('keep');
const REVIEW = []; // tokens mapped on a guess (conditional background); reported for a human look

function onBg(kind, fallback) {
  switch (kind) {
    case 'accent': case 'solid:success': return 'text-on-accent';
    case 'danger': return 'text-on-danger';
    case 'solid:warning': case 'soft:warning': return 'text-warning-ink';
    case 'solid:info': case 'soft:info': return 'text-info-ink';
    case 'soft:danger': return 'text-danger-ink';
    case 'soft:success': return 'text-success-ink';
    case 'soft:accent': return 'text-accent-soft-ink';
    case 'plate': return 'text-plate-ink';
    default: return fallback;
  }
}

function mapToken(t, ctx) {
  const base = t.base;
  // WhatsApp green text is too light on a light surface: darker WhatsApp green in light mode.
  if (/^text-\[#25d366\]$/i.test(base) && !t.variants.includes('dark')) {
    const darkTok = build(t, base, ['dark', ...t.variants]);
    if (ctx.allTokens().includes(darkTok)) return KEEP_TOKEN;
    return `${build(t, 'text-[#128c4a]')} ${darkTok}`;
  }
  // Arbitrary font sizes.
  const sz = /^text-\[([\d.]+px)\]$/.exec(base);
  if (sz) return SIZE_MAP[sz[1]] ? build(t, `text-${SIZE_MAP[sz[1]]}`) : KEEP_TOKEN;

  // Focus variant: focus:ring-* -> focus-visible:ring-*.
  const isRingUtil = /^ring(-offset)?(-|$)/.test(base);
  let variants = t.variants;
  if (isRingUtil && variants.includes('focus')) variants = variants.map((v) => (v === 'focus' ? 'focus-visible' : v));
  const focusy = variants.some((v) => /^focus/.test(v));

  if (!t.color) {
    if (variants !== t.variants) {
      // Width/offset/inset rings and already-semantic ring colours.
      const b = /^ring-(?!offset|opacity|transparent|current|inherit|0$|inset$|\d|$)/.test(base) && !/^ring-(focus|line|accent|danger|success|warning|info|surface|ink)/.test(base) ? 'ring-focus' : base;
      return build(t, b, variants);
    }
    return null; // not a colour token
  }
  if (variants.includes('dark')) return KEEP_TOKEN;

  const { util, color, shade } = t;
  const key = vkey(t);
  const op = opSuffix(t);
  if (util === 'shadow') return KEEP_TOKEN; // shadow tints work in both themes

  // ---------- focus ring colours
  if ((util === 'ring') && focusy) return build(t, 'ring-focus', variants);
  if (util === 'ring-offset') return build(t, 'ring-offset-surface', variants);

  // ---------- placeholder
  if (util === 'placeholder' || (util === 'text' && t.variants.includes('placeholder'))) {
    if (NEUTRAL.has(color) || color === 'white') return build(t, 'text-ink-3', [...t.variants.filter((v) => v !== 'placeholder'), 'placeholder']);
    return null;
  }

  // ---------- neutrals
  if (NEUTRAL.has(color) || color === 'white' || color === 'black') {
    const isHover = t.variants.some((v) => /hover|focus|active|even|odd/.test(v));
    if (util === 'bg' || util === 'from' || util === 'via' || util === 'to') {
      const p = util;
      if (color === 'black') return t.op != null ? build(t, t.opNum >= 50 ? `${p}-scrim` : `${p}-scrim${op}`) : KEEP_TOKEN;
      if (color === 'white') {
        if (t.op == null) return KEEP_TOKEN; // switch knobs, iframes: white in both themes
        if (['accent', 'danger', 'solid:success', 'scrim', 'decor-solid', 'hex'].includes(ctx.bgFor(''))) return KEEP_TOKEN;
        return build(t, `${p}-ink${op}`);
      }
      if (shade <= 200) return build(t, `${p}-ink${op}`); // light chip on dark = inverted surface
      if (isHover) {
        if (shade >= 700) return build(t, `${p}-surface-2${op}`);
        // hover:bg-gray-500 over a gray-600 base would vanish into surface-3.
        if (shade <= 500 && ctx.tokens.some((x) => x.util === 'bg' && vkey(x) === '' && x.color && NEUTRAL.has(x.color) && x.shade === 600)) return build(t, `${p}-line${op}`);
        return build(t, `${p}-surface-3${op}`);
      }
      if (shade === 400) return build(t, `${p}-ink-3${op}`);
      if (shade === 500) return build(t, ctx.hasText() ? `${p}-surface-3${op}` : `${p}-ink-3${op}`);
      if (shade >= 950) return build(t, `${p}-bg${op}`);
      if (shade >= 800) return build(t, `${p}-surface${op}`);
      if (shade === 700) return build(t, `${p}-surface-2${op}`);
      return build(t, `${p}-surface-3${op}`);
    }
    if (util === 'text') {
      const light = color === 'white' || shade <= 200;
      const dark = color === 'black' || shade >= 700;
      if (light || dark) {
        const k = ctx.bgFor(key);
        if (k === 'ambiguous') { REVIEW.push(t.raw); return light ? build(t, `text-ink${op}`) : null; }
        if (['hex', 'decor-solid', 'scrim', 'dark'].includes(k)) return light ? KEEP_TOKEN : null;
        if (k === 'light') return dark ? KEEP_TOKEN : null;
        if (k === 'inverse') return dark ? build(t, `text-surface${op}`) : build(t, `text-ink${op}`);
        const on = onBg(k, null);
        if (on) return build(t, on + op);
        return light ? build(t, `text-ink${op}`) : null;
      }
      if (shade === 300) return build(t, `text-ink-2${op}`);
      return build(t, `text-ink-3${op}`);
    }
    if (util.startsWith('border') || util === 'divide' || util === 'outline') {
      if (color === 'white' || color === 'black') return build(t, `${util}-line`);
      return build(t, `${util}-${shade >= 700 || shade <= 300 ? 'line' : 'line-strong'}${op}`);
    }
    if (util === 'ring') {
      if (color === 'white') return t.op == null ? build(t, 'ring-surface') : build(t, 'ring-line');
      if (color === 'black') return build(t, 'ring-line');
      if (shade >= 950) return build(t, `ring-bg${op}`);
      if (shade === 900) return build(t, `ring-surface${op}`);
      return build(t, `ring-${shade >= 700 ? 'line' : 'line-strong'}${op}`);
    }
    return null;
  }

  // ---------- brand
  if (color === 'brand') {
    if (util === 'bg') {
      if (t.variants.includes('active')) return build(t, 'bg-accent-press');
      if (t.variants.some((v) => /hover/.test(v)) && !t.variants.includes('group-hover')) {
        if (!isSolid(t)) return build(t, 'bg-accent-soft');
        if (ctx.baseFamily('brand')) return build(t, 'bg-accent-hover');
        // A solid hover fill under ink text with no hover text colour would be unreadable.
        const hoverText = ctx.tokens.some((x) => x.util === 'text' && x.color && vkey(x) === vkey(t));
        return build(t, hoverText ? 'bg-accent' : 'bg-accent-soft');
      }
      if (t.variants.includes('selection')) return build(t, 'bg-accent');
      if (isSolid(t)) return build(t, `bg-accent${t.opNum != null && t.opNum < 100 ? op : ''}`);
      return build(t, 'bg-accent-soft');
    }
    if (util === 'from' || util === 'via' || util === 'to') {
      if (!isSolid(t) || shade >= 800) return build(t, `${util}-accent-soft`);
      return build(t, `${util}-${shade >= 700 ? 'accent-hover' : 'accent'}`);
    }
    if (util === 'text') {
      const k = ctx.bgFor(key);
      if (k === 'accent') return build(t, `text-on-accent${op}`);
      if (k === 'soft:accent' || shade <= 200) return build(t, `text-accent-soft-ink${op}`);
      return build(t, `text-accent-text${op}`);
    }
    if (util.startsWith('border') || util === 'divide' || util === 'outline') return focusy ? build(t, `${util}-focus`) : build(t, `${util}-accent${op}`);
    if (util === 'ring') return build(t, `ring-focus${op}`);
    return null;
  }

  // ---------- semantic roles
  if (ROLE[color]) {
    const role = ROLE[color];
    if (util === 'bg' || util === 'from' || util === 'via' || util === 'to') {
      const p = util;
      if (p !== 'bg') return build(t, `${p}-${role}-soft`);
      const hover = t.variants.some((v) => /hover|focus|active/.test(v));
      const hoverOfSolid = hover && t.op == null && ctx.baseFamily(color);
      if (!isSolid(t) && !hoverOfSolid) return build(t, `bg-${role}-soft`);
      const text = ctx.hasText();
      if (role === 'danger') return build(t, hover && ctx.baseFamily(color) ? 'bg-danger-hover' : 'bg-danger');
      if (role === 'success') {
        if (!text) return build(t, 'bg-success');
        return build(t, hover && ctx.baseFamily(color) ? 'bg-accent-hover' : 'bg-accent');
      }
      // warning / info: solid badges become soft chips; dots keep the strong colour.
      if (!text) return build(t, `bg-${role}`);
      return build(t, hover && ctx.baseFamily(color) ? `bg-${role}/20` : `bg-${role}-soft`);
    }
    if (util === 'text') {
      const k = ctx.bgFor(key);
      if (k === `soft:${role}` || k === `solid:${role}` || (role === 'danger' && k === 'danger')) {
        if (role === 'danger' && k === 'danger') return build(t, `text-on-danger${op}`);
        if (role === 'success' && k === 'solid:success') return build(t, `text-on-accent${op}`);
        return build(t, `text-${role}-ink${op}`);
      }
      if (shade <= 100) return build(t, `text-${role}-ink${op}`);
      return build(t, `text-${role}${op}`);
    }
    if (util.startsWith('border') || util === 'divide' || util === 'outline') return build(t, `${util}-${role}${op}`);
    if (util === 'ring') return build(t, `ring-${role}${op}`);
    return null;
  }

  // ---------- decorative hues: add a light value, keep the original under dark:
  if (DECOR.has(color)) {
    const darkTok = build(t, base, ['dark', ...t.variants]);
    if (ctx.tokens.some((x) => x.variants[0] === 'dark' && x.util === util && x.color === color && vkey(x) === key)) return KEEP_TOKEN;
    if (util === 'text' || util === 'placeholder') {
      if (shade > 400) return KEEP_TOKEN;
      return `${build(t, `${util}-${color}-700`)} ${darkTok}`;
    }
    if (util === 'bg' || util === 'from' || util === 'via' || util === 'to') {
      if (isSolid(t) || (shade >= 200 && shade <= 300)) return KEEP_TOKEN;
      return `${build(t, `${util}-${color}-100`)} ${darkTok}`;
    }
    if (util.startsWith('border') || util === 'divide' || util === 'ring') {
      if (t.op == null && shade <= 600) return KEEP_TOKEN;
      return `${build(t, `${util}-${color}-300`)} ${darkTok}`;
    }
    return KEEP_TOKEN;
  }
  return null;
}

// Whole-piece fix-ups after the token pass: de-duplication + focus outline rule.
// `parts` alternates tokens and whitespace (String.split(/(\s+)/)); edited in place.
const RING_WIDTH = /(^|:)focus(-visible)?:ring(-[1248])?$/;
function finishPiece(parts, orig, ctx) {
  const drop = (i) => {
    parts[i] = '';
    // Remove one neighbouring separator so no double space is left behind.
    if (i > 0 && /^\s+$/.test(parts[i - 1]) && !parts[i - 1].includes('\n')) parts[i - 1] = '';
    else if (i + 1 < parts.length && /^\s+$/.test(parts[i + 1]) && !parts[i + 1].includes('\n')) parts[i + 1] = '';
  };
  // Only tokens this run produced may be dropped as duplicates; untouched text
  // (including repeated words in non-class strings) is never changed.
  const changed = parts.map((p, i) => p !== orig[i]);
  const seen = new Set(parts.filter((p, i) => p && !changed[i] && !/^\s+$/.test(p)));
  for (let i = 0; i < parts.length; i++) {
    if (!changed[i] || !parts[i] || /^\s+$/.test(parts[i])) continue;
    const kept = parts[i].split(' ').filter((w) => w && !seen.has(w));
    kept.forEach((w) => seen.add(w));
    if (!kept.length) drop(i);
    else parts[i] = kept.join(' ');
  }
  const i = parts.indexOf('focus:outline-none');
  if (i >= 0) {
    const all = [...parts, ...ctx.allTokens()];
    const hasRing = all.some((w) => RING_WIDTH.test(w));
    const hasBorder = all.some((w) => /(^|:)focus:border-(focus|accent|danger|brand|\[)/.test(w));
    if (!hasRing && !hasBorder) {
      if (['input', 'select', 'textarea'].includes(ctx.tag)) parts[i] = 'focus:outline-none focus:border-focus';
      else if (ctx.tag) drop(i);
    }
  }
}

// ---------------------------------------------------------------- AST walk
function jsxTag(node) {
  let n = node.parent;
  while (n) {
    if (ts.isJsxAttribute(n)) {
      if (n.name.getText() !== 'className') return null;
      const el = n.parent?.parent;
      return el && (ts.isJsxOpeningElement(el) || ts.isJsxSelfClosingElement(el)) ? el.tagName.getText() : null;
    }
    if (ts.isFunctionLike(n) || ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n) || ts.isCallExpression(n) || ts.isBlock(n)) return null;
    n = n.parent;
  }
  return null;
}

// Class tokens of each enclosing JSX element, nearest first (for text on a parent's fill).
function literalTokens(node) {
  const out = [];
  const grab = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(...n.text.split(/\s+/).filter(Boolean));
    else if (ts.isTemplateExpression(n)) {
      out.push(...n.head.text.split(/\s+/).filter(Boolean));
      n.templateSpans.forEach((sp) => out.push(...sp.literal.text.split(/\s+/).filter(Boolean)));
    }
    ts.forEachChild(n, grab);
  };
  grab(node);
  return out;
}
function classAttr(opening) {
  const attr = opening.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === 'className');
  return attr?.initializer ? literalTokens(attr.initializer) : [];
}
function jsxAncestorClasses(node) {
  let n = node.parent;
  while (n && !ts.isJsxAttribute(n)) n = n.parent;
  if (!n) return [];
  let el = n.parent?.parent; // JsxOpeningElement | JsxSelfClosingElement
  el = ts.isJsxOpeningElement(el) ? el.parent : el;
  const out = [];
  for (let p = el?.parent; p; p = p.parent) {
    if (ts.isJsxElement(p)) {
      const toks = classAttr(p.openingElement);
      if (toks.length) out.push(toks);
      // A component may paint its own background: look no further.
      if (/^[A-Z]/.test(p.openingElement.tagName.getText())) break;
    }
  }
  return out;
}

function nearestTemplate(node) {
  let n = node.parent;
  while (n) {
    if (ts.isTemplateExpression(n)) return n;
    if (ts.isFunctionLike(n) || ts.isBlock(n)) return null;
    n = n.parent;
  }
  return null;
}

const TOKEN_SPLIT = /(\s+)/;

function processFile(rel, src, report) {
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const lines = src.split('\n');
  const skipLine = (pos) => SKIP_LINES.some((s) => s.file === rel && s.re.test(lines[lineOf(pos) - 1]));
  const keepTok = (tok) => KEEP.some((k) => k.file.test(rel) && k.re.test(tok));
  const edits = [];
  const templateCtx = new Map();

  // A literal "piece": [start,end) of raw text inside the delimiters.
  const pieces = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [[node.getStart(sf) + 1, node.getEnd() - 1]];
    if (ts.isTemplateExpression(node)) {
      const out = [[node.head.getStart(sf) + 1, node.head.getEnd() - 2]];
      for (const sp of node.templateSpans) {
        const lit = sp.literal;
        out.push([lit.getStart(sf) + 1, lit.getEnd() - (ts.isTemplateTail(lit) ? 1 : 2)]);
      }
      return out;
    }
    return null;
  };
  const ctxFor = (node) => {
    if (templateCtx.has(node)) return templateCtx.get(node);
    const ps = pieces(node);
    const text = ps.map(([a, b]) => src.slice(a, b)).join(' ');
    const tpl = ts.isTemplateExpression(node) ? null : nearestTemplate(node);
    const ctx = new Ctx(text.split(/\s+/).filter(Boolean), tpl ? ctxFor(tpl) : null, jsxTag(node));
    if (ts.isTemplateExpression(node)) {
      ctx.nested = [];
      const grab = (n) => { if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ctx.nested.push(...n.text.split(/\s+/).filter(Boolean)); ts.forEachChild(n, grab); };
      node.templateSpans.forEach((sp) => grab(sp.expression));
    }
    if (!tpl) ctx.ancestors = jsxAncestorClasses(node);
    templateCtx.set(node, ctx);
    return ctx;
  };

  const visit = (node) => {
    const ps = pieces(node);
    if (ps && !ts.isImportDeclaration(node.parent) && !(node.parent && ts.isExternalModuleReference(node.parent))) {
      const ctx = ctxFor(node);
      const all = [];
      for (const [a, b] of ps) {
        const raw = src.slice(a, b);
        if (skipLine(a)) { all.push(null); continue; }
        const parts = raw.split(TOKEN_SPLIT);
        const mapped = parts.map((p) => {
          if (!p || /^\s+$/.test(p) || keepTok(p)) return p;
          const t = parse(p);
          REVIEW.length = 0;
          const r = mapToken(t, ctx);
          if (REVIEW.length) report.review.push(`${rel}:${lineOf(a)} ${p}`);
          if (r === KEEP_TOKEN || r == null) {
            const hex = /^(bg|text|border(-[trblxy])?|ring|from|via|to)-\[#/.test(t.base) && !HEX_OK.test(t.base);
            const legacy = (t.color && t.util && !(t.variants.includes('dark'))) || /^text-\[[\d.]+px\]$/.test(t.base) || hex;
            if (r == null && legacy) report.unmapped.push(`${rel}:${lineOf(a)} ${p}`);
            return p;
          }
          report.pairs.set(`${p} -> ${r}`, (report.pairs.get(`${p} -> ${r}`) ?? 0) + 1);
          return r;
        });
        all.push({ a, b, raw, parts: mapped });
      }
      // Finish each piece (dedupe + focus rule) and record edits.
      for (const piece of all) {
        if (!piece) continue;
        finishPiece(piece.parts, piece.raw.split(TOKEN_SPLIT), ctx);
        const out = piece.parts.join('');
        if (out !== piece.raw) edits.push({ a: piece.a, b: piece.b, raw: piece.raw, out, line: lineOf(piece.a) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  edits.sort((x, y) => y.a - x.a);
  let res = src;
  for (const e of edits) res = res.slice(0, e.a) + e.out + res.slice(e.b);
  return { res, edits };
}

// ---------------------------------------------------------------- main
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|)$/.test(e.name) && /\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = [...SCOPE_DIRS.flatMap((d) => walk(path.join(ROOT, d), [])), ...SCOPE_FILES.map((f) => path.join(ROOT, f))]
  .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
  .filter((f) => !EXCLUDE.some((re) => re.test(f)));

const report = { unmapped: [], pairs: new Map(), review: [] };
let changedFiles = 0, changedPieces = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  let src = fs.readFileSync(abs, 'utf8');
  for (const s of SPECIAL) {
    if (s.file !== rel) continue;
    if (!src.includes(s.from) && !src.includes(s.to)) report.unmapped.push(`${rel} SPECIAL not found: ${s.from}`);
    src = src.split(s.from).join(s.to);
  }
  const orig = fs.readFileSync(abs, 'utf8');
  const { res, edits } = processFile(rel, src, report);
  if (res !== orig) {
    changedFiles++;
    changedPieces += edits.length;
    if (MODE === 'list') for (const e of edits.reverse()) console.log(`${rel}:${e.line}\n  - ${e.raw.trim()}\n  + ${e.out.trim()}`);
    if (MODE === 'write') fs.writeFileSync(abs, res);
  }
}
console.log(`${MODE === 'write' ? 'rewrote' : 'would rewrite'} ${changedPieces} strings in ${changedFiles} of ${files.length} in-scope files`);
if (MODE === 'pairs') for (const [k, v] of [...report.pairs].sort()) console.log(`${String(v).padStart(4)}  ${k}`);
for (const u of report.unmapped) console.log(`UNMAPPED ${u}`);
for (const r of report.review) console.log(`REVIEW ${r}`);
console.log(`${report.unmapped.length} unmapped tokens`);
process.exitCode = report.unmapped.length ? 1 : 0;
