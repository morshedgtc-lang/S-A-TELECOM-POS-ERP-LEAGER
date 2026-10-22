import { money } from './api';
import { t } from './i18n';
import { fmtDate, STATUS } from './labels';
import type { RepairDetail, SaleDetail, ShopSettings } from './types';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const BASE_CSS = `
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #000; width: 72mm; margin: 0 auto; }
  h1 { font-size: 17px; margin: 0; text-align: center; }
  .c { text-align: center; }
  .muted { color: #444; font-size: 11px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .r { text-align: right; }
  .b { font-weight: 700; }
  .big { font-size: 15px; font-weight: 800; }
  .sign { display: flex; justify-content: space-between; margin-top: 28px; font-size: 11px; }
  .sign span { border-top: 1px solid #000; padding-top: 2px; }
`;

function header(s: ShopSettings) {
  return `<h1>${esc(s.shopName)}</h1>
    ${s.shopAddress ? `<div class="c muted">${esc(s.shopAddress)}</div>` : ''}
    ${s.shopPhone ? `<div class="c muted">${t('মোবাইল')}: ${esc(s.shopPhone)}</div>` : ''}<hr>`;
}

function open(title: string, body: string) {
  const w = window.open('', '_blank', 'width=420,height=700');
  if (!w) {
    alert('Pop-up blocked. Allow pop-ups for this site to print.');
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
    <style>${BASE_CSS}</style></head><body>${body}
    <script>window.onload = () => setTimeout(() => window.print(), 250);<\/script></body></html>`);
  w.document.close();
}

const row = (label: string, value: string, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="r">${value}</td></tr>`;

export function printSaleInvoice(sale: SaleDetail, shop: ShopSettings) {
  const items = sale.items.map((i) => `
    <tr><td colspan="2" class="b">${esc(i.productName)}</td></tr>
    ${i.serials.length ? `<tr><td colspan="2" class="muted">IMEI: ${esc(i.serials.join(', '))}</td></tr>` : ''}
    ${row(`${i.qty} × ${money(i.unitPrice)}`, money(i.lineTotal))}`).join('');

  open(sale.invoiceNo, `${header(shop)}
    <div class="c b">${t('বিক্রয় ইনভয়েস')}</div>
    <table>${row(t('ইনভয়েস'), esc(sale.invoiceNo))}${row(t('তারিখ'), esc(fmtDate(sale.createdAt)))}
      ${row(t('কাস্টমার'), esc(sale.customerName))}${row(t('বিক্রেতা'), esc(sale.createdBy))}</table><hr>
    <table>${items}</table><hr>
    <table>
      ${row(t('সাবটোটাল'), money(sale.subtotal))}
      ${sale.discount ? row(t('ডিসকাউন্ট'), `-${money(sale.discount)}`) : ''}
      ${row(t('মোট'), `৳ ${money(sale.total)}`, 'big')}
      ${row(t('পরিশোধ'), money(sale.paid))}
      ${sale.due ? row(t('বাকি'), money(sale.due), 'b') : ''}
    </table><hr>
    <div class="c">${esc(shop.invoiceFooter)}</div>`);
}

export function printJobCard(job: RepairDetail, shop: ShopSettings) {
  const delivered = job.status === 'delivered';
  const parts = job.parts.filter((p) => !p.restocked);
  open(job.jobNo, `${header(shop)}
    <div class="c b">${t('সার্ভিস জব কার্ড')}</div>
    <div class="c big">${esc(job.jobNo)}</div>
    <table>
      ${row(t('তারিখ'), esc(fmtDate(job.createdAt)))}
      ${row(t('কাস্টমার'), esc(job.customerName))}
      ${job.customerMobile ? row(t('মোবাইল'), esc(job.customerMobile)) : ''}
    </table><hr>
    <table>
      ${row(t('ডিভাইস'), esc(job.device))}
      ${job.imei ? row('IMEI', esc(job.imei)) : ''}
      <tr><td colspan="2"><span class="b">${t('সমস্যা:')}</span> ${esc(job.problem)}</td></tr>
      ${job.accessories ? `<tr><td colspan="2"><span class="b">${t('সাথে দেওয়া:')}</span> ${esc(job.accessories)}</td></tr>` : ''}
      ${job.promisedAt ? row(t('ডেলিভারির তারিখ'), esc(fmtDate(job.promisedAt, false))) : ''}
      ${row(t('স্ট্যাটাস'), esc(STATUS[job.status].label))}
    </table><hr>
    <table>
      ${delivered ? '' : row(t('আনুমানিক খরচ'), money(job.estimatedCost))}
      ${parts.map((p) => row(`${esc(p.productName)} × ${p.qty}`, money(p.lineTotal))).join('')}
      ${delivered ? row(t('সার্ভিস চার্জ'), money(job.serviceCharge)) : ''}
      ${delivered ? row(t('মোট বিল'), `৳ ${money(job.total)}`, 'big') : ''}
      ${row(t('অগ্রিম'), money(job.advance))}
      ${delivered && job.deliveryPaid ? row(t('ডেলিভারিতে পরিশোধ'), money(job.deliveryPaid)) : ''}
      ${delivered && job.due ? row(t('বাকি'), money(job.due), 'b') : ''}
      ${delivered && job.refunded ? row(t('ফেরত'), money(job.refunded), 'b') : ''}
    </table><hr>
    ${shop.repairTerms ? `<div class="muted">${esc(shop.repairTerms)}</div><hr>` : ''}
    <div class="sign"><span>${t('কাস্টমার স্বাক্ষর')}</span><span>${t('দোকানের স্বাক্ষর')}</span></div>
    <div class="c muted" style="margin-top:8px">${esc(shop.invoiceFooter)}</div>`);
}
