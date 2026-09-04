// Build-time PWA icon generator. Composes an SVG per icon and rasterizes it
// with sharp into public/icons/. Run via `npm run icons`.
//
// Design: vivid cyan → sky → deep-blue plate with a custom FILLED saloon
// mark (window and wheel hubs punched so the gradient reads as glass/tyres).
// High contrast so it pops on both light and dark home screens. The old
// heroicons stroke-car on navy disappeared into a dark blob.
//
// Rounded corners ONLY on purpose:any app icons (favicon / install prompt).
// Maskable + apple-touch stay square — Android/iOS apply their own mask.
// Shortcut icons keep a filled white glyph on a saturated plate so they
// survive Android's ~28dp circle in the long-press menu.

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Custom filled marks, viewBox 0 0 24 24. Each path is evenodd: the first
// subpath is the body, later subpaths punch holes (window, stripe, fold).
// Car wheels are separate circles so they merge with the body instead of
// punching through it (evenodd holes were leaving two floating balls).
const GLYPHS = {
  car: {
    paths: [
      // Modern saloon: rounded nose, sloped glasshouse, short boot.
      // One continuous body — no square bumper slabs.
      `M3.2 14.5
       C2.45 14.5 2.2 14.05 2.2 13.45
       C2.2 12.55 2.7 11.85 3.7 11.5
       C5.1 11.0 6.15 10.7 6.85 9.55
       C7.4 8.6 7.85 7.15 8.55 6.55
       C9.2 6.0 10.05 5.75 11.0 5.75
       L14.55 5.75
       C15.6 5.75 16.45 6.1 16.95 6.8
       C17.55 7.6 17.9 8.85 18.4 9.75
       C18.85 10.6 19.4 11.05 20.2 11.35
       C21.25 11.75 21.85 12.35 21.85 13.25
       C21.85 14.05 21.45 14.5 20.75 14.5
       Z
       M10.85 6.95
       L14.7 6.95
       C15.15 6.95 15.5 7.2 15.7 7.6
       C16.0 8.2 16.25 9.05 16.55 9.7
       C16.7 10.05 16.45 10.35 16.1 10.35
       L8.85 10.35
       C8.5 10.35 8.3 10.0 8.45 9.7
       C8.8 8.9 9.15 7.9 9.5 7.45
       C9.8 7.1 10.3 6.95 10.85 6.95
       Z`,
    ],
    wheels: [
      { cx: 6.7, cy: 14.5, r: 2.18, hub: 0.7 },
      { cx: 17.35, cy: 14.5, r: 2.18, hub: 0.7 },
    ],
  },
  card: {
    paths: [
      `M3.5 6.25
       h17
       a2.25 2.25 0 0 1 2.25 2.25
       v8
       a2.25 2.25 0 0 1 -2.25 2.25
       h-17
       a2.25 2.25 0 0 1 -2.25 -2.25
       v-8
       a2.25 2.25 0 0 1 2.25 -2.25
       Z
       M2.25 9.15 h19.5 v2.35 H2.25 Z
       M4.4 13.85
       h3.6
       a0.6 0.6 0 0 1 0.6 0.6
       v0.7
       a0.6 0.6 0 0 1 -0.6 0.6
       h-3.6
       a0.6 0.6 0 0 1 -0.6 -0.6
       v-0.7
       a0.6 0.6 0 0 1 0.6 -0.6
       Z`,
    ],
  },
  document: {
    paths: [
      `M6.2 2.4
       h6.4
       L18.6 8.4
       V20.4
       C18.6 21.05 18.05 21.6 17.4 21.6
       H6.2
       C5.55 21.6 5 21.05 5 20.4
       V3.6
       C5 2.95 5.55 2.4 6.2 2.4
       Z
       M12.35 2.7
       V7.7
       C12.35 8.2 12.75 8.6 13.25 8.6
       H18.2
       Z`,
    ],
  },
};

const PALETTES = {
  app: {
    stops: [
      { offset: '0%', color: '#7dd3fc' },
      { offset: '42%', color: '#0ea5e9' },
      { offset: '100%', color: '#075985' },
    ],
  },
  expense: {
    stops: [
      { offset: '0%', color: '#6ee7b7' },
      { offset: '45%', color: '#10b981' },
      { offset: '100%', color: '#065f46' },
    ],
  },
  invoice: {
    stops: [
      { offset: '0%', color: '#a5b4fc' },
      { offset: '45%', color: '#6366f1' },
      { offset: '100%', color: '#312e81' },
    ],
  },
  whatsapp: {
    stops: [
      { offset: '0%', color: '#25d366' },
      { offset: '100%', color: '#128c7e' },
    ],
  },
};

const ICONS = [
  { file: 'icon-192.png', size: 192, glyph: 'car', rounded: true, scale: 0.70, palette: 'app' },
  { file: 'icon-512.png', size: 512, glyph: 'car', rounded: true, scale: 0.70, palette: 'app' },
  { file: 'maskable-192.png', size: 192, glyph: 'car', rounded: false, scale: 0.50, palette: 'app' },
  { file: 'maskable-512.png', size: 512, glyph: 'car', rounded: false, scale: 0.50, palette: 'app' },
  { file: 'apple-touch-icon.png', size: 180, glyph: 'car', rounded: false, scale: 0.66, palette: 'app' },
  { file: 'favicon-32.png', size: 32, glyph: 'car', rounded: true, scale: 0.78, palette: 'app' },
  { file: 'shortcut-expense.png', size: 192, glyph: 'card', rounded: false, scale: 0.58, palette: 'expense' },
  { file: 'shortcut-car.png', size: 192, glyph: 'car', rounded: false, scale: 0.62, palette: 'app' },
  { file: 'shortcut-invoice.png', size: 192, glyph: 'document', rounded: false, scale: 0.58, palette: 'invoice' },
  { file: 'whatsapp-alert.png', size: 192, glyph: 'car', circle: true, scale: 0.62, palette: 'whatsapp' },
  { file: 'whatsapp-alert-512.png', size: 512, glyph: 'car', circle: true, scale: 0.62, palette: 'whatsapp' },
  { file: 'badge-96.png', size: 96, glyph: 'car', badgeOnly: true, scale: 1.08 },
];

const PROBE = 512;
const PAD = 4;
const PROBE_VB = 24 + 2 * PAD;

function glyphMarkup(glyph) {
  const spec = GLYPHS[glyph];
  const paths = spec.paths
    .map((d) => `<path fill-rule="evenodd" d="${d}" />`)
    .join('');
  const wheels = (spec.wheels || [])
    .map((w) => {
      const tyre = `M ${w.cx} ${w.cy - w.r} a ${w.r} ${w.r} 0 1 1 0 ${2 * w.r} a ${w.r} ${w.r} 0 1 1 0 ${-2 * w.r} Z`;
      const hub = w.hub
        ? `M ${w.cx} ${w.cy - w.hub} a ${w.hub} ${w.hub} 0 1 1 0 ${2 * w.hub} a ${w.hub} ${w.hub} 0 1 1 0 ${-2 * w.hub} Z`
        : '';
      return `<path fill-rule="evenodd" d="${tyre} ${hub}" />`;
    })
    .join('');
  return paths + wheels;
}

async function measureGlyphCentre(glyph) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PROBE}" height="${PROBE}" viewBox="${-PAD} ${-PAD} ${PROBE_VB} ${PROBE_VB}">
  <g fill="#000">${glyphMarkup(glyph)}</g>
</svg>`;

  const { data, info } = await sharp(Buffer.from(svg))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + (channels - 1)];
      if (alpha > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`glyph "${glyph}" rendered no pixels`);

  const unitPerPx = PROBE_VB / PROBE;
  const cx = -PAD + ((minX + maxX) / 2) * unitPerPx;
  const cy = -PAD + ((minY + maxY) / 2) * unitPerPx;
  return { cx, cy };
}

function buildSvg({ size, glyph, rounded, circle, badgeOnly, scale, palette }, centre) {
  if (badgeOnly) {
    const k = (size * scale) / 24;
    const transform = `translate(${size / 2} ${size / 2}) scale(${k}) translate(${-centre.cx} ${-centre.cy})`;
    const paths = glyphMarkup(glyph);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="${transform}" fill="#ffffff">
    ${paths}
  </g>
</svg>`;
  }

  const rx = circle ? Math.round(size / 2) : rounded ? Math.round(size * 0.22) : 0;
  const k = (size * scale) / 24;
  const transform = `translate(${size / 2} ${size / 2}) scale(${k}) translate(${-centre.cx} ${-centre.cy})`;
  const paths = glyphMarkup(glyph);

  const stops = PALETTES[palette].stops
    .map((s) => `<stop offset="${s.offset}" stop-color="${s.color}" />`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="plate" x1="12%" y1="0%" x2="88%" y2="100%">
      ${stops}
    </linearGradient>
    <radialGradient id="sheen" cx="30%" cy="16%" r="72%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.32"/>
      <stop offset="42%" stop-color="#ffffff" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#plate)" />
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#sheen)" />
  <g transform="${transform}" fill="#ffffff">
    ${paths}
  </g>
</svg>`;
}

async function main() {
  const outDir = path.join(process.cwd(), 'public', 'icons');
  fs.mkdirSync(outDir, { recursive: true });

  const centres = {};
  for (const glyph of Object.keys(GLYPHS)) {
    centres[glyph] = await measureGlyphCentre(glyph);
  }

  for (const icon of ICONS) {
    const svg = buildSvg(icon, centres[icon.glyph]);
    const outPath = path.join(outDir, icon.file);
    const info = await sharp(Buffer.from(svg)).png().toFile(outPath);
    console.log(`${icon.file}  ${info.width}x${info.height}`);
  }
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
