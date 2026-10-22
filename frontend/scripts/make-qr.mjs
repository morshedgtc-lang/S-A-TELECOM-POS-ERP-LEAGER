// Printable QR codes for the shop's live address.
// Usage: node scripts/make-qr.mjs https://your-shop.up.railway.app [outDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^https:\/\//.test(base)) {
  console.error('Give the live https address, e.g. node scripts/make-qr.mjs https://your-shop.up.railway.app');
  process.exit(1);
}
const outDir = process.argv[3] ?? '../releases';
mkdirSync(outDir, { recursive: true });

const targets = {
  'qr-download-page.png': `${base}/download`, // one code for any phone
  'qr-android-apk.png': `${base}/downloads/sa-telecom-pos.apk`,
  'qr-iphone-app.png': `${base}/app`,
};

for (const [file, url] of Object.entries(targets)) {
  await QRCode.toFile(join(outDir, file), url, {
    width: 1024,
    margin: 3,
    errorCorrectionLevel: 'H',
    color: { dark: '#16121a', light: '#ffffff' },
  });
  console.log(`${file} -> ${url}`);
}
