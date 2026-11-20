// SVG favicon'dan PWA PNG ikonlarını üretir: node scripts/build-icons.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/favicon.svg'), 'utf8');

// Maskable varyant: tam kanvas dolgu + motiv ortada güvenli alanda
const maskableSvg = svg.replace(
  '<rect width="512" height="512" rx="112" fill="#0b1220"/>',
  '<rect width="512" height="512" fill="#0b1220"/>',
);
writeFileSync(join(root, 'public/favicon-maskable.svg'), maskableSvg);

const jobs = [
  { in: svg, out: 'icon-192.png', size: 192 },
  { in: svg, out: 'icon-512.png', size: 512 },
  { in: maskableSvg, out: 'icon-maskable-192.png', size: 192 },
  { in: maskableSvg, out: 'icon-maskable-512.png', size: 512 },
];

for (const job of jobs) {
  await sharp(Buffer.from(job.in))
    .resize(job.size, job.size)
    .png({ compressionLevel: 9 })
    .toFile(join(root, 'public', job.out));
  console.log('üretildi:', job.out);
}
