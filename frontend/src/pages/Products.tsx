import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import type { Brand, Category, Product } from '../types';
import { t } from '../i18n';
import Scanner from '../components/Scanner';

export default function Products() {
  const { can } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const reload = () => {
    api<Product[]>('GET', `/products?q=${encodeURIComponent(search)}`).then(setProducts).catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    api<Category[]>('GET', '/catalog/categories').then(setCategories);
    api<Brand[]>('GET', '/catalog/brands').then(setBrands);
  }, []);

  useEffect(reload, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  async function adjust(p: Product) {
    const change = Number(window.prompt(t('{name} — স্টক কত বাড়বে/কমবে? (যেমন 3 বা -2)', { name: p.name })));
    if (!Number.isInteger(change) || change === 0) return;
    const reason = window.prompt('কারণ লিখুন') ?? '';
    try {
      await api('POST', `/products/${p.id}/adjust`, { change, reason });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Adjustment failed');
    }
  }

  return (
    <section>
      <div className="toolbar">
        <h2><i className="fa-solid fa-boxes-stacked" /> {t('পণ্য তালিকা ও স্টক')}</h2>
        <div className="inline" style={{ margin: 0 }}>
          <input placeholder={t('নাম বা SKU দিয়ে খুঁজুন')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="ghost" onClick={() => setScanning(true)} aria-label={t('ক্যামেরা দিয়ে স্ক্যান')}><i className="fa-solid fa-camera" /></button>
        </div>
        {scanning && <Scanner onResult={setSearch} onClose={() => setScanning(false)} />}
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>{t('নাম')}</th><th>{t('ক্যাটাগরি')}</th><th className="num">{t('বিক্রয়মূল্য')}</th><th className="num">{t('ডিলার মূল্য')}</th>
              {can('viewCost') && <th className="num">{t('ক্রয়মূল্য')}</th>}
              <th className="num">{t('স্টক')}</th><th>{t('ধরন')}</th>
              {can('manageProducts') && <th />}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}{p.isLowStock && <span className="badge warn">{t('কম')}</span>}</td>
                <td>{p.categoryName ?? '—'}</td>
                <td className="num">{money(p.salePrice)}</td>
                <td className="num muted">{p.dealerPrice != null ? money(p.dealerPrice) : '—'}</td>
                {can('viewCost') && <td className="num">{money(p.buyPrice)}</td>}
                <td className="num">{p.stock}</td>
                <td>{p.serialized ? t('IMEI / সিরিয়াল') : t('পরিমাণ')}</td>
                {can('manageProducts') && (
                  <td>{!p.serialized && <button className="ghost" onClick={() => adjust(p)}>{t('স্টক সমন্বয়')}</button>}</td>
                )}
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={8} className="muted">{t('এখনো কোনো পণ্য নেই।')}</td></tr>}
          </tbody>
        </table>
      </div>

      {can('manageProducts') && (
        <div className="two-col">
          <ProductForm categories={categories} brands={brands} onSaved={reload} />
          <div className="card">
            <h3>{t('ক্যাটাগরি / ব্র্যান্ড যোগ')}</h3>
            <QuickAdd label={t('ক্যাটাগরি')} onAdd={(name) => api('POST', '/catalog/categories', { name }).then(() => api<Category[]>('GET', '/catalog/categories')).then(setCategories)} />
            <QuickAdd label={t('ব্র্যান্ড')} onAdd={(name) => api('POST', '/catalog/brands', { name }).then(() => api<Brand[]>('GET', '/catalog/brands')).then(setBrands)} />
          </div>
        </div>
      )}
    </section>
  );
}

function ProductForm({ categories, brands, onSaved }: { categories: Category[]; brands: Brand[]; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', sku: '', categoryId: '', brandId: '', buyPrice: '', salePrice: '', dealerPrice: '', stock: '0', lowStockLimit: '5', serialized: false,
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('POST', '/products', {
        name: form.name,
        sku: form.sku || undefined,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        brandId: form.brandId ? Number(form.brandId) : null,
        buyPrice: form.buyPrice || 0,
        dealerPrice: form.dealerPrice === '' ? null : form.dealerPrice,
        salePrice: form.salePrice || 0,
        stock: form.serialized ? 0 : Number(form.stock),
        lowStockLimit: form.lowStockLimit,
        serialized: form.serialized,
      });
      setForm({ ...form, name: '', sku: '', buyPrice: '', salePrice: '', dealerPrice: '', stock: '0' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>{t('নতুন পণ্য')}</h3>
      <label>{t('নাম')}<input required value={form.name} onChange={set('name')} /></label>
      <label>{t('SKU / বারকোড (ঐচ্ছিক)')}<input value={form.sku} onChange={set('sku')} /></label>
      <label>{t('ক্যাটাগরি')}
        <select value={form.categoryId} onChange={set('categoryId')}>
          <option value="">—</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>{t('ব্র্যান্ড')}
        <select value={form.brandId} onChange={set('brandId')}>
          <option value="">—</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <div className="row">
        <label>{t('ক্রয়মূল্য')}<input type="number" min="0" value={form.buyPrice} onChange={set('buyPrice')} /></label>
        <label>{t('বিক্রয়মূল্য')}<input type="number" min="0" value={form.salePrice} onChange={set('salePrice')} /></label>
        <label>{t('ডিলার মূল্য (ঐচ্ছিক)')}<input type="number" min="0" value={form.dealerPrice} onChange={set('dealerPrice')} /></label>
      </div>
      <div className="row">
        <label>{t('শুরুর স্টক')}<input type="number" min="0" disabled={form.serialized} value={form.stock} onChange={set('stock')} /></label>
        <label>{t('লো স্টক সীমা')}<input type="number" min="0" value={form.lowStockLimit} onChange={set('lowStockLimit')} /></label>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.serialized}
          onChange={(e) => setForm({ ...form, serialized: e.target.checked })} />
        প্রতিটি ইউনিট IMEI / সিরিয়াল দিয়ে ট্র্যাক করুন (মোবাইল ফোন)
      </label>
      {error && <div className="error">{error}</div>}
      <button className="primary">{t('পণ্য সেভ')}</button>
    </form>
  );
}

function QuickAdd({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  return (
    <form className="inline" onSubmit={(e) => {
      e.preventDefault();
      setError('');
      onAdd(name.trim())
        .then(() => setName(''))
        .catch((err: Error) => setError(err.message));
    }}>
      <input placeholder={t('{label}র নাম', { label })} value={name} onChange={(e) => setName(e.target.value)} required />
      <button>{t('যোগ')}</button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
