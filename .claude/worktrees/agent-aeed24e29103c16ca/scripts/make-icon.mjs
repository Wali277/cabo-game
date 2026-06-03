/**
 * scripts/make-icon.mjs
 *
 * Converts cobo/public/favicon.svg → build/icon.png (512×512).
 * Called automatically by npm run electron:build before packaging.
 *
 * Requires `sharp` (added as a devDependency in the root package.json).
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.join(__dirname, '..');
const SVG_SRC = path.join(ROOT, 'cobo', 'public', 'favicon.svg');
const OUT_PNG = path.join(ROOT, 'build', 'icon.png');

if (!existsSync(path.join(ROOT, 'build'))) {
  mkdirSync(path.join(ROOT, 'build'), { recursive: true });
}

const svgBuffer = readFileSync(SVG_SRC);

await sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile(OUT_PNG);

console.log(`✓  build/icon.png written (512×512) from favicon.svg`);
