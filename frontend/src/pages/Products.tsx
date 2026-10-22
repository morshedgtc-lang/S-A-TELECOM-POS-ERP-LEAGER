import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import type { Brand, Category, Product } from '../types';

export default function Products() {
  const { can } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState('');
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
    const change = Number(window.prompt(`${p.name} — স্টক কত বাড়বে/কমবে? (যেমন 3 বা -2)`));
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
        <h2><i className="fa-solid fa-boxes-stacked" /> পণ্য তালিকা ও স্টক</h2>
        <input placeholder="নাম বা SKU দিয়ে খুঁজুন" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>নাম</th><th>ক্যাটাগরি</th><th className="num">বিক্রয়মূল্য</th>
              {can('viewCost') && <th className="num">ক্রয়মূল্য</th>}
              <th className="num">স্টক</th><th>ধরন</th>
              {can('manageProducts') && <th />}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}{p.isLowStock && <span className="badge warn">কম</span>}</td>
                <td>{p.categoryName ?? '—'}</td>
                <td className="num">{money(p.salePrice)}</td>
                {can('viewCost') && <td className="num">{money(p.buyPrice)}</td>}
                <td className="num">{p.stock}</td>
                <td>{p.serialized ? 'IMEI / সিরিয়াল' : 'পরিমাণ'}</td>
                {can('manageProducts') && (
                  <td>{!p.serialized && <button className="ghost" onClick={() => adjust(p)}>স্টক সমন্বয়</button>}</td>
                )}
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={7} className="muted">এখনো কোনো পণ্য নেই।</td></tr>}
          </tbody>
        </table>
      </div>

      {can('manageProducts') && (
        <div className="two-col">
          <ProductForm categories={categories} brands={brands} onSaved={reload} />
          <div className="card">
            <h3>ক্যাটাগরি / ব্র্যান্ড যোগ</h3>
            <QuickAdd label="ক্যাটাগরি" onAdd={(name) => api('POST', '/catalog/categories', { name }).then(() => api<Category[]>('GET', '/catalog/categories')).then(setCategories)} />
            <QuickAdd label="ব্র্যান্ড" onAdd={(name) => api('POST', '/catalog/brands', { name }).then(() => api<Brand[]>('GET', '/catalog/brands')).then(setBrands)} />
          </div>
        </div>
      )}
    </section>
  );
}

function ProductForm({ categories, brands, onSaved }: { categories: Category[]; brands: Brand[]; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', sku: '', categoryId: '', brandId: '', buyPrice: '', salePrice: '', stock: '0', lowStockLimit: '5', serialized: false,
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
        salePrice: form.salePrice || 0,
        stock: form.serialized ? 0 : Number(form.stock),
        lowStockLimit: form.lowStockLimit,
        serialized: form.serialized,
      });
      setForm({ ...form, name: '', sku: '', buyPrice: '', salePrice: '', stock: '0' });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>নতুন পণ্য</h3>
      <label>নাম<input required value={form.name} onChange={set('name')} /></label>
      <label>SKU / বারকোড (ঐচ্ছিক)<input value={form.sku} onChange={set('sku')} /></label>
      <label>ক্যাটাগরি
        <select value={form.categoryId} onChange={set('categoryId')}>
          <option value="">—</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>ব্র্যান্ড
        <select value={form.brandId} onChange={set('brandId')}>
          <option value="">—</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <div className="row">
        <label>ক্রয়মূল্য<input type="number" min="0" value={form.buyPrice} onChange={set('buyPrice')} /></label>
        <label>বিক্রয়মূল্য<input type="number" min="0" value={form.salePrice} onChange={set('salePrice')} /></label>
      </div>
      <div className="row">
        <label>শুরুর স্টক<input type="number" min="0" disabled={form.serialized} value={form.stock} onChange={set('stock')} /></label>
        <label>লো স্টক সীমা<input type="number" min="0" value={form.lowStockLimit} onChange={set('lowStockLimit')} /></label>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.serialized}
          onChange={(e) => setForm({ ...form, serialized: e.target.checked })} />
        প্রতিটি ইউনিট IMEI / সিরিয়াল দিয়ে ট্র্যাক করুন (মোবাইল ফোন)
      </label>
      {error && <div className="error">{error}</div>}
      <button className="primary">পণ্য সেভ</button>
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
      <input placeholder={`${label}র নাম`} value={name} onChange={(e) => setName(e.target.value)} required />
      <button>যোগ</button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
