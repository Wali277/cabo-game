/**
 * scripts/make-pwa-icons.mjs
 *
 * Generates the PWA / "Add to Home Screen" icons from cobo/public/favicon.svg:
 *   - cobo/public/apple-touch-icon.png  (180×180, iOS home screen)
 *   - cobo/public/icon-192.png          (192×192, web app manifest)
 *   - cobo/public/icon-512.png          (512×512, web app manifest / splash)
 *
 * The favicon mark is transparent; iOS fills transparent home-screen icons with
 * black, so we composite the glyph onto an opaque navy radial-gradient that
 * matches the in-app theme (#0d1638). Glyph is inset ~20% so it also reads well
 * as a maskable icon on Android. Run: `node scripts/make-pwa-icons.mjs`.
 *
 * Requires `sharp` (already a devDependency, see make-icon.mjs).
 */
import sharp from 'sharp';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'cobo', 'public');
const svg = readFileSync(path.join(PUBLIC, 'favicon.svg'));

const bgSvg = (size) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <defs>
         <radialGradient id="g" cx="34%" cy="26%" r="95%">
           <stop offset="0%" stop-color="#22336e"/>
           <stop offset="52%" stop-color="#0d1638"/>
           <stop offset="100%" stop-color="#070d24"/>
         </radialGradient>
       </defs>
       <rect width="${size}" height="${size}" fill="url(#g)"/>
     </svg>`,
  );

async function makeIcon(size, outName) {
  const glyphSize = Math.round(size * 0.6);
  const glyph = await sharp(svg)
    .resize(glyphSize, glyphSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp(bgSvg(size))
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toFile(path.join(PUBLIC, outName));
  console.log(`✓  ${outName} (${size}×${size})`);
}

await makeIcon(180, 'apple-touch-icon.png');
await makeIcon(192, 'icon-192.png');
await makeIcon(512, 'icon-512.png');
console.log('PWA icons written to cobo/public/');
