import JsBarcode from 'jsbarcode';
import { money } from './api';
import { t } from './i18n';

/** Label stock: thermal rolls print one label per page; A4 sheets print a grid. */
export const LABEL_SIZES = {
  'thermal-38x25': { label: 'থার্মাল 38 × 25 mm', w: 38, h: 25, sheet: null },
  'thermal-50x30': { label: 'থার্মাল 50 × 30 mm', w: 50, h: 30, sheet: null },
  'thermal-58x40': { label: 'থার্মাল 58 × 40 mm', w: 58, h: 40, sheet: null },
  'a4-3x8': { label: 'A4 শিট 3 × 8 (24টি)', w: 63.5, h: 33.9, sheet: { cols: 3, rows: 8 } },
  'a4-4x10': { label: 'A4 শিট 4 × 10 (40টি)', w: 48.5, h: 25.4, sheet: { cols: 4, rows: 10 } },
} as const;

export type LabelSize = keyof typeof LABEL_SIZES;

export interface LabelOptions {
  size: LabelSize;
  showShop: boolean;
  showName: boolean;
  showPrice: boolean;
  showCode: boolean;
  /** Barcode bar height as a share of the label height (0.25–0.55). */
  barHeight: number;
}

export const DEFAULT_LABEL_OPTIONS: LabelOptions = {
  size: 'thermal-38x25',
  showShop: true,
  showName: true,
  showPrice: true,
  showCode: true,
  barHeight: 0.38,
};

export interface LabelItem {
  code: string;
  name: string;
  price: number | null;
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Code 128 barcode as an SVG string. Returns null for codes Code 128 cannot hold (e.g. Bangla letters). */
export function barcodeSvg(code: string, heightPx: number, showCode: boolean): string | null {
  if (!code || /[^\x20-\x7E]/.test(code)) return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, code, {
      format: 'CODE128',
      height: heightPx,
      width: 2,
      margin: 0,
      displayValue: showCode,
      fontSize: 14,
      textMargin: 1,
      font: 'Arial',
    });
  } catch {
    return null;
  }
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.width = '100%';
  svg.style.height = '100%';
  return svg.outerHTML;
}

/** One label's inner HTML; the same markup is used for the on-screen preview and for printing. */
export function labelHtml(item: LabelItem, opts: LabelOptions, shopName: string): string {
  const size = LABEL_SIZES[opts.size];
  const svg = barcodeSvg(item.code, Math.round(size.h * opts.barHeight * 4), opts.showCode);
  return `
    ${opts.showShop ? `<div class="l-shop">${esc(shopName)}</div>` : ''}
    ${opts.showName ? `<div class="l-name">${esc(item.name)}</div>` : ''}
    <div class="l-bar" style="height:${(size.h * opts.barHeight).toFixed(1)}mm">${svg ?? `<span class="l-bad">${esc(t('কোডটি বারকোডে লেখা যায় না'))}</span>`}</div>
    ${opts.showPrice && item.price != null ? `<div class="l-price">৳ ${money(item.price)}</div>` : ''}`;
}

export const LABEL_CSS = `
  .lbl { box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 0.4mm; padding: 1.2mm 1.5mm; text-align: center; color: #000; background: #fff;
    font-family: 'Hind Siliguri', 'Nirmala UI', Arial, sans-serif; }
  .lbl .l-shop { font-size: 6.5pt; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; line-height: 1; }
  .lbl .l-name { font-size: 7.5pt; font-weight: 600; line-height: 1.1; max-height: 2.2em; overflow: hidden; width: 100%; }
  .lbl .l-bar { width: 100%; display: flex; align-items: center; justify-content: center; }
  .lbl .l-price { font-size: 11pt; font-weight: 800; line-height: 1; }
  .lbl .l-bad { font-size: 7pt; color: #b91c1c; }
`;

/** Opens a print window with every label (web only; the phone apps cannot print). */
export function printLabels(items: LabelItem[], opts: LabelOptions, shopName: string) {
  const size = LABEL_SIZES[opts.size];
  const cells = items.map((it) => `<div class="lbl" style="width:${size.w}mm;height:${size.h}mm">${labelHtml(it, opts, shopName)}</div>`);
  const body = size.sheet
    ? (() => {
      const per = size.sheet.cols * size.sheet.rows;
      const pages: string[] = [];
      for (let i = 0; i < cells.length; i += per) {
        pages.push(`<section class="sheet" style="grid-template-columns:repeat(${size.sheet.cols},${size.w}mm);grid-auto-rows:${size.h}mm">${cells.slice(i, i + per).join('')}</section>`);
      }
      return pages.join('');
    })()
    : cells.map((c) => `<section class="roll">${c}</section>`).join('');
  const page = size.sheet
    ? '@page { size: A4; margin: 10mm 8mm; } .sheet { display: grid; gap: 0 2.5mm; justify-content: center; page-break-after: always; }'
    : `@page { size: ${size.w}mm ${size.h}mm; margin: 0; } .roll { page-break-after: always; }`;

  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) {
    alert(t('পপ-আপ বন্ধ আছে — প্রিন্ট করতে পপ-আপ অনুমতি দিন'));
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t('বারকোড লেবেল'))}</title>
    <style>* { margin: 0; padding: 0; } body { background: #fff; } ${page} ${LABEL_CSS}</style></head>
    <body>${body}<script>window.onload = () => setTimeout(() => window.print(), 300);<\/script></body></html>`);
  w.document.close();
}
