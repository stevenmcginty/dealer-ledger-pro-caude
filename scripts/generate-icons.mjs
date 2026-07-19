// Build-time PWA icon generator. Composes an SVG per icon and rasterizes it
// with sharp into public/icons/. Run via `npm run icons`.
//
// Design: dark navy radial-gradient plate (#1e293b centre-top -> #0f172a edges)
// with a single heroicons-style glyph stroked in sky blue (#38bdf8). The glyph
// paths are copied verbatim from components/icons.tsx (viewBox 0 0 24 24,
// stroke-based, stroke-width 1.5). Rounded corners are applied ONLY to the two
// purpose:any app icons; every other icon is square-edged because Android/iOS
// launchers apply their own mask.

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Glyph `d` strings, copied verbatim from components/icons.tsx.
const GLYPHS = {
  car: [
    'M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125V14.25m-17.25 4.5v-1.875a3.375 3.375 0 013.375-3.375h9.75a3.375 3.375 0 013.375 3.375v1.875m-17.25 4.5h16.5M5.625 13.5h12.75',
  ],
  card: [
    'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 21.75z',
  ],
  document: [
    'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  ],
};

// One entry per output PNG.
const ICONS = [
  { file: 'icon-192.png', size: 192, glyph: 'car', rounded: true, scale: 0.62 },
  { file: 'icon-512.png', size: 512, glyph: 'car', rounded: true, scale: 0.62 },
  { file: 'maskable-192.png', size: 192, glyph: 'car', rounded: false, scale: 0.48 },
  { file: 'maskable-512.png', size: 512, glyph: 'car', rounded: false, scale: 0.48 },
  { file: 'apple-touch-icon.png', size: 180, glyph: 'car', rounded: false, scale: 0.62 },
  { file: 'shortcut-expense.png', size: 96, glyph: 'card', rounded: false, scale: 0.48 },
  { file: 'shortcut-car.png', size: 96, glyph: 'car', rounded: false, scale: 0.48 },
  { file: 'shortcut-invoice.png', size: 96, glyph: 'document', rounded: false, scale: 0.48 },
];

// Probe render used only to measure a glyph's visual bounds. The 24-unit box is
// padded so round stroke caps never clip against the canvas edge.
const PROBE = 512;
const PAD = 4;
const PROBE_VB = 24 + 2 * PAD;

// Optically centre a glyph: heroicons paths are not visually centred in their
// 24x24 viewBox (the car body + ground line sit in the lower half), so we
// rasterize the stroked path alone, scan the alpha channel for its visual
// bounding box, and return that box's centre in viewBox units.
async function measureGlyphCentre(glyph) {
  const paths = GLYPHS[glyph].map((d) => `<path d="${d}" />`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PROBE}" height="${PROBE}" viewBox="${-PAD} ${-PAD} ${PROBE_VB} ${PROBE_VB}">
  <g fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
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

function buildSvg({ size, glyph, rounded, scale }, centre) {
  const rx = rounded ? Math.round(size * 0.18) : 0;
  // Centre the glyph on the plate by its VISUAL midpoint and scale it to `scale`
  // of the icon: shift origin to centre, scale, then recentre the measured
  // glyph centre (not the 24-unit box centre).
  const k = (size * scale) / 24;
  const transform = `translate(${size / 2} ${size / 2}) scale(${k}) translate(${-centre.cx} ${-centre.cy})`;
  const paths = GLYPHS[glyph]
    .map((d) => `<path d="${d}" />`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="plate" cx="50%" cy="0%" r="100%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#0f172a" />
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#plate)" />
  <g transform="${transform}" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    ${paths}
  </g>
</svg>`;
}

async function main() {
  const outDir = path.join(process.cwd(), 'public', 'icons');
  fs.mkdirSync(outDir, { recursive: true });

  // Measure each distinct glyph's visual centre once.
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
