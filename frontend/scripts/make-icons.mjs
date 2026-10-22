// Draws the app icon and splash screens for the Android and iOS projects (no image libraries needed).
// Run after `npx cap add android|ios`:  node scripts/make-icons.mjs
// It finds the PNGs Capacitor generated and redraws each one at the same size.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const ROSE_DARK = [136, 19, 55];
const ROSE_LIGHT = [244, 63, 94];
const GREEN = [34, 197, 94];
const CHROME = [22, 18, 26];
const WHITE = [255, 255, 255];

// ---------- PNG ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const pngSize = (file) => {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

// ---------- Shapes (signed distance, negative = inside) ----------
function roundRect(u, v, cx, cy, hw, hh, r) {
  const qx = Math.abs(u - cx) - (hw - r);
  const qy = Math.abs(v - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
const circle = (u, v, cx, cy, r) => Math.hypot(u - cx, v - cy) - r;
function segment(u, v, ax, ay, bx, by, r) {
  const px = u - ax, py = v - ay, dx = bx - ax, dy = by - ay;
  const h = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * h, py - dy * h) - r;
}
const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const over = (dst, src, a) => (a <= 0 ? dst : mix(dst, src, a));

/**
 * Colour of the icon at (u, v) in 0..1. `glyph` scales the phone + badge (1 = normal).
 * Returns [r, g, b, alpha 0..1].
 */
function iconColor(u, v, { mask = 'full', glyph = 1, background = true }) {
  let inside = 1;
  if (mask === 'rounded') inside = roundRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.2) <= 0 ? 1 : 0;
  if (mask === 'circle') inside = circle(u, v, 0.5, 0.5, 0.5) <= 0 ? 1 : 0;
  if (!inside) return [0, 0, 0, 0];

  let c = background ? mix(ROSE_DARK, ROSE_LIGHT, Math.min(1, Math.max(0, (u + v) / 2 * 1.1))) : [0, 0, 0];
  let alpha = background ? 1 : 0;
  const paint = (col, a = 1) => {
    if (a <= 0) return;
    c = alpha === 0 ? col : over(c, col, a);
    alpha = alpha + (1 - alpha) * a;
  };

  const x = 0.5 + (u - 0.5) / glyph;
  const y = 0.5 + (v - 0.5) / glyph;
  // Phone body
  const body = roundRect(x, y, 0.47, 0.49, 0.19, 0.32, 0.065);
  if (Math.abs(body) <= 0.024) paint(WHITE);
  if (roundRect(x, y, 0.47, 0.475, 0.145, 0.24, 0.03) <= 0) paint(WHITE, 0.16);
  if (roundRect(x, y, 0.47, 0.205, 0.04, 0.009, 0.009) <= 0) paint(WHITE);
  if (circle(x, y, 0.47, 0.765, 0.018) <= 0) paint(WHITE);
  // "Fixed" badge
  const badge = circle(x, y, 0.69, 0.7, 0.135);
  if (badge <= 0.022 && badge > 0) paint(WHITE);
  if (badge <= 0) paint(GREEN);
  if (segment(x, y, 0.625, 0.705, 0.672, 0.752, 0.022) <= 0 || segment(x, y, 0.672, 0.752, 0.755, 0.655, 0.022) <= 0) paint(WHITE);
  return [...c, alpha];
}

const SS = 4; // supersamples per axis
function renderIcon(size, opts) {
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = iconColor((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, opts);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * size + px) * 4;
      out[i + 3] = Math.round((a / (SS * SS)) * 255);
      if (a > 0) { out[i] = Math.round(r / a); out[i + 1] = Math.round(g / a); out[i + 2] = Math.round(b / a); }
    }
  }
  return out;
}

function renderSplash(w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = CHROME[0]; out[i * 4 + 1] = CHROME[1]; out[i * 4 + 2] = CHROME[2]; out[i * 4 + 3] = 255; }
  const s = Math.round(Math.min(w, h) * 0.26);
  const icon = renderIcon(s, { mask: 'rounded' });
  const ox = Math.round((w - s) / 2), oy = Math.round((h - s) / 2);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const si = (y * s + x) * 4, di = ((oy + y) * w + ox + x) * 4, a = icon[si + 3] / 255;
      for (let k = 0; k < 3; k++) out[di + k] = Math.round(out[di + k] * (1 - a) + icon[si + k] * a);
    }
  }
  return out;
}

// ---------- Write into the native projects ----------
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
let count = 0;
function write(file, w, h, rgba) {
  writeFileSync(file, encodePng(w, h, rgba));
  count++;
}

const androidRes = 'android/app/src/main/res';
if (existsSync(androidRes)) {
  for (const file of walk(androidRes).filter((f) => f.endsWith('.png'))) {
    const { w, h } = pngSize(file);
    if (file.endsWith('ic_launcher.png')) write(file, w, h, renderIcon(w, { mask: 'rounded' }));
    else if (file.endsWith('ic_launcher_round.png')) write(file, w, h, renderIcon(w, { mask: 'circle' }));
    else if (file.endsWith('ic_launcher_foreground.png')) write(file, w, h, renderIcon(w, { mask: 'full', glyph: 0.62 }));
    else if (file.endsWith('splash.png')) write(file, w, h, renderSplash(w, h));
  }
  writeFileSync(join(androidRes, 'values/ic_launcher_background.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#BE123C</color>\n</resources>\n');
}

const iosAssets = 'ios/App/App/Assets.xcassets';
if (existsSync(iosAssets)) {
  for (const file of walk(iosAssets).filter((f) => f.endsWith('.png'))) {
    const { w, h } = pngSize(file);
    if (file.includes('AppIcon')) write(file, w, h, renderIcon(w, { mask: 'full' })); // iOS rounds the corners itself
    else if (file.includes('Splash')) write(file, w, h, renderSplash(w, h));
  }
}

// Website / home-screen icons (iPhone wants an opaque square; it rounds the corners itself).
writeFileSync('public/app-icon.png', encodePng(512, 512, renderIcon(512, { mask: 'rounded' })));
writeFileSync('public/app-icon-192.png', encodePng(192, 192, renderIcon(192, { mask: 'rounded' })));
writeFileSync('public/apple-touch-icon.png', encodePng(180, 180, renderIcon(180, { mask: 'full' })));
console.log(`Wrote ${count} native images and the website icons in public/`);
