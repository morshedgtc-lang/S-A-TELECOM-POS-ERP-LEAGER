import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import {
  DEFAULT_LABEL_OPTIONS, LABEL_CSS, LABEL_SIZES, labelHtml, printLabels,
  type LabelItem, type LabelOptions, type LabelSize,
} from '../barcodeLabels';
import Scanner from '../components/Scanner';
import { t } from '../i18n';
import { isNative } from '../native';
import { getShop } from '../shop';
import type { Product } from '../types';

interface Lookup {
  code: string;
  product: Product;
  serial: string | null;
  unitStatus: 'in_stock' | 'sold' | null;
}

const OPTS_KEY = 'sa_pos_label_options';

function loadOptions(): LabelOptions {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTS_KEY) ?? '{}') as Partial<LabelOptions>;
    const merged = { ...DEFAULT_LABEL_OPTIONS, ...saved };
    return merged.size in LABEL_SIZES ? merged : DEFAULT_LABEL_OPTIONS;
  } catch {
    return DEFAULT_LABEL_OPTIONS;
  }
}

export default function Barcodes() {
  const [tab, setTab] = useState<'check' | 'labels'>('check');
  return (
    <section>
      <div className="toolbar">
        <h2><i className="fa-solid fa-barcode" /> {t('বারকোড ও লেবেল')}</h2>
        <div className="tabs">
          <button className={tab === 'check' ? 'nav active' : 'nav'} onClick={() => setTab('check')}>{t('দাম দেখুন')}</button>
          <button className={tab === 'labels' ? 'nav active' : 'nav'} onClick={() => setTab('labels')}>{t('লেবেল প্রিন্ট')}</button>
        </div>
      </div>
      {tab === 'check' ? <PriceCheck /> : <LabelMaker />}
    </section>
  );
}

/** Scan or type any barcode / IMEI and see the price at a glance. */
function PriceCheck() {
  const { can } = useAuth();
  const [code, setCode] = useState('');
  const [hit, setHit] = useState<Lookup | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);

  async function look(value: string) {
    const v = value.trim();
    if (!v) return;
    setError('');
    setHit(null);
    try {
      setHit(await api<Lookup>('GET', `/products/lookup/${encodeURIComponent(v)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not found');
    }
    setCode('');
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    look(code);
  }

  const p = hit?.product;
  return (
    <div className="price-check">
      <form className="pos-search" onSubmit={submit}>
        <i className="fa-solid fa-barcode" />
        <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('বারকোড / IMEI স্ক্যান করুন বা লিখে Enter চাপুন')} />
        <button type="button" className="scan-btn" onClick={() => setScanning(true)} aria-label={t('ক্যামেরা দিয়ে স্ক্যান')}>
          <i className="fa-solid fa-camera" />
        </button>
      </form>
      {error && <div className="error">{error}</div>}
      {p && (
        <div className="price-card">
          <div className="pc-name">{p.name}</div>
          <div className="muted">{[p.categoryName, p.brandName, p.sku].filter(Boolean).join(' · ')}</div>
          <div className="pc-price">৳ {money(p.salePrice)}</div>
          <div className="pc-meta">
            {p.dealerPrice != null && <span><i className="fa-solid fa-store" /> {t('ডিলার মূল্য')}: <b>৳{money(p.dealerPrice)}</b></span>}
            {can('viewCost') && p.buyPrice !== undefined && <span>{t('ক্রয়মূল্য')}: <b>৳{money(p.buyPrice)}</b></span>}
            <span className={p.stock > p.lowStockLimit ? 'ok-text' : 'warn'}><i className="fa-solid fa-boxes-stacked" /> {t('স্টক')}: <b>{p.stock}</b></span>
          </div>
          {hit.serial && (
            <div className={hit.unitStatus === 'in_stock' ? 'ok' : 'error'}>
              IMEI {hit.serial} — {hit.unitStatus === 'in_stock' ? t('স্টকে আছে') : t('বিক্রি হয়েছে')}
            </div>
          )}
        </div>
      )}
      {!p && !error && <p className="muted center">{t('USB / ব্লুটুথ স্ক্যানার দিয়ে সরাসরি স্ক্যান করুন, অথবা ক্যামেরা বাটন চাপুন।')}</p>}
      {scanning && <Scanner onResult={look} onClose={() => setScanning(false)} />}
    </div>
  );
}

interface Pick {
  product: Product;
  copies: number;
  /** Serialized phones: print one label per in-stock IMEI instead of the product code. */
  byImei: boolean;
  serials: string[];
}

function LabelMaker() {
  const { can } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState('');
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [opts, setOpts] = useState<LabelOptions>(loadOptions);
  const [shopName, setShopName] = useState('SA Telecom');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);

  const loadProducts = () => api<Product[]>('GET', '/products').then(setProducts);
  useEffect(() => {
    loadProducts();
    getShop().then((s) => setShopName(s.shopName)).catch(() => undefined);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch { /* per-device only */ }
  }, [opts]);

  const shown = products.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())
    || (p.sku ?? '').toLowerCase().includes(q.trim().toLowerCase()));
  const missingCodes = products.filter((p) => !p.sku).length;

  async function toggle(p: Product, on: boolean) {
    const next = { ...picks };
    if (!on) delete next[p.id];
    else next[p.id] = { product: p, copies: p.serialized ? 1 : Math.max(1, p.stock), byImei: p.serialized, serials: [] };
    setPicks(next);
    if (on && p.serialized) {
      const serials = await api<string[]>('GET', `/products/${p.id}/units`).catch(() => [] as string[]);
      setPicks((cur) => (cur[p.id] ? { ...cur, [p.id]: { ...cur[p.id], serials } } : cur));
    }
  }

  async function addByScan(code: string) {
    try {
      const hit = await api<Lookup>('GET', `/products/lookup/${encodeURIComponent(code)}`);
      if (!picks[hit.product.id]) await toggle(hit.product, true);
      setMessage({ ok: true, text: `${hit.product.name} ✓` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Not found' });
    }
  }

  async function assignCodes() {
    setMessage(null);
    try {
      const r = await api<{ assigned: number }>('POST', '/products/barcodes/assign');
      setMessage({ ok: true, text: t('{n} টি পণ্যে নতুন বারকোড দেওয়া হয়েছে', { n: r.assigned }) });
      loadProducts();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Failed' });
    }
  }

  const items: LabelItem[] = useMemo(() => Object.values(picks).flatMap((pk) => {
    if (pk.byImei) return pk.serials.map((s) => ({ code: s, name: pk.product.name, price: pk.product.salePrice }));
    if (!pk.product.sku) return [];
    return Array.from({ length: pk.copies }, () => ({ code: pk.product.sku!, name: pk.product.name, price: pk.product.salePrice }));
  }), [picks]);
  const skipped = Object.values(picks).filter((pk) => !pk.byImei && !pk.product.sku).length;
  const size = LABEL_SIZES[opts.size];
  const preview = items[0] ?? { code: 'SA000001', name: t('নমুনা পণ্য'), price: 1250 };

  return (
    <div className="label-maker">
      <div className="card">
        <div className="toolbar">
          <h3>{t('পণ্য বাছাই')}</h3>
          <div className="inline">
            <input placeholder={t('নাম বা SKU দিয়ে খুঁজুন')} value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="ghost" onClick={() => setScanning(true)}><i className="fa-solid fa-camera" /> {t('স্ক্যান')}</button>
          </div>
        </div>
        {missingCodes > 0 && can('manageProducts') && (
          <div className="hint-bar">
            <span>{t('{n} টি পণ্যের বারকোড নেই', { n: missingCodes })}</span>
            <button className="btn-rose small" onClick={assignCodes}><i className="fa-solid fa-wand-magic-sparkles" /> {t('বারকোড তৈরি করুন')}</button>
          </div>
        )}
        {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}
        <div className="pick-list">
          {shown.map((p) => {
            const pk = picks[p.id];
            return (
              <div key={p.id} className={pk ? 'pick on' : 'pick'}>
                <label className="check">
                  <input type="checkbox" checked={!!pk} onChange={(e) => toggle(p, e.target.checked)} />
                  <span><b>{p.name}</b><small className="muted"> {p.sku ?? t('কোড নেই')} · ৳{money(p.salePrice)} · {t('স্টক')} {p.stock}</small></span>
                </label>
                {pk && (p.serialized ? (
                  <label className="check small-note">
                    <input type="checkbox" checked={pk.byImei} onChange={(e) => setPicks({ ...picks, [p.id]: { ...pk, byImei: e.target.checked } })} />
                    {t('প্রতি IMEI একটি ({n})', { n: pk.serials.length })}
                  </label>
                ) : null)}
                {pk && !pk.byImei && (
                  <input type="number" min={1} max={500} className="copies" value={pk.copies} aria-label={t('কপি')}
                    onChange={(e) => setPicks({ ...picks, [p.id]: { ...pk, copies: Math.max(1, Math.min(500, Number(e.target.value) || 1)) } })} />
                )}
              </div>
            );
          })}
          {shown.length === 0 && <p className="muted">{t('কোনো পণ্য পাওয়া যায়নি।')}</p>}
        </div>
      </div>

      <div className="card label-settings">
        <h3>{t('লেবেল ডিজাইন')}</h3>
        <label>{t('লেবেলের মাপ')}
          <select value={opts.size} onChange={(e) => setOpts({ ...opts, size: e.target.value as LabelSize })}>
            {Object.entries(LABEL_SIZES).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
          </select>
        </label>
        <div className="toggle-grid">
          <label className="check"><input type="checkbox" checked={opts.showShop} onChange={(e) => setOpts({ ...opts, showShop: e.target.checked })} /> {t('দোকানের নাম')}</label>
          <label className="check"><input type="checkbox" checked={opts.showName} onChange={(e) => setOpts({ ...opts, showName: e.target.checked })} /> {t('পণ্যের নাম')}</label>
          <label className="check"><input type="checkbox" checked={opts.showPrice} onChange={(e) => setOpts({ ...opts, showPrice: e.target.checked })} /> {t('দাম')}</label>
          <label className="check"><input type="checkbox" checked={opts.showCode} onChange={(e) => setOpts({ ...opts, showCode: e.target.checked })} /> {t('কোড লেখা')}</label>
        </div>
        <label>{t('বারকোডের উচ্চতা')}
          <input type="range" min={0.25} max={0.55} step={0.01} value={opts.barHeight} onChange={(e) => setOpts({ ...opts, barHeight: Number(e.target.value) })} />
        </label>

        <div className="label-preview-wrap">
          <style>{LABEL_CSS}</style>
          <div className="lbl preview" style={{ width: `${size.w}mm`, height: `${size.h}mm` }}
            dangerouslySetInnerHTML={{ __html: labelHtml(preview, opts, shopName) }} />
        </div>

        <div className="summary-line">{t('মোট {n} টি লেবেল', { n: items.length })}{skipped > 0 && <span className="warn"> · {t('{n} টি পণ্যের কোড নেই, বাদ যাবে', { n: skipped })}</span>}</div>
        {isNative
          ? <p className="muted">{t('লেবেল প্রিন্ট কম্পিউটার থেকে করুন (লেবেল প্রিন্টার সাধারণত কম্পিউটারে লাগানো থাকে)।')}</p>
          : <button className="primary btn-rose" disabled={items.length === 0} onClick={() => printLabels(items, opts, shopName)}>
              <i className="fa-solid fa-print" /> {t('লেবেল প্রিন্ট করুন')}
            </button>}
      </div>
      {scanning && <Scanner continuous onResult={addByScan} onClose={() => setScanning(false)} />}
    </div>
  );
}
