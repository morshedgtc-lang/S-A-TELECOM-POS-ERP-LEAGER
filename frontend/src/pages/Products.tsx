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
    const change = Number(window.prompt(`Stock change for ${p.name} (e.g. 3 or -2)`));
    if (!Number.isInteger(change) || change === 0) return;
    const reason = window.prompt('Reason (required)') ?? '';
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
        <h2>Products & Stock</h2>
        <input placeholder="Search name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Category</th><th className="num">Sale</th>
              {can('viewCost') && <th className="num">Buy</th>}
              <th className="num">Stock</th><th>Type</th>
              {can('manageProducts') && <th />}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}{p.isLowStock && <span className="badge warn">low</span>}</td>
                <td>{p.categoryName ?? '—'}</td>
                <td className="num">{money(p.salePrice)}</td>
                {can('viewCost') && <td className="num">{money(p.buyPrice)}</td>}
                <td className="num">{p.stock}</td>
                <td>{p.serialized ? 'IMEI / serial' : 'Quantity'}</td>
                {can('manageProducts') && (
                  <td>{!p.serialized && <button className="ghost" onClick={() => adjust(p)}>Adjust</button>}</td>
                )}
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={7} className="muted">No products yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {can('manageProducts') && (
        <div className="two-col">
          <ProductForm categories={categories} brands={brands} onSaved={reload} />
          <div className="card">
            <h3>Quick add category / brand</h3>
            <QuickAdd label="Category" onAdd={(name) => api('POST', '/catalog/categories', { name }).then(() => api<Category[]>('GET', '/catalog/categories')).then(setCategories)} />
            <QuickAdd label="Brand" onAdd={(name) => api('POST', '/catalog/brands', { name }).then(() => api<Brand[]>('GET', '/catalog/brands')).then(setBrands)} />
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
      <h3>New product</h3>
      <label>Name<input required value={form.name} onChange={set('name')} /></label>
      <label>SKU (optional)<input value={form.sku} onChange={set('sku')} /></label>
      <label>Category
        <select value={form.categoryId} onChange={set('categoryId')}>
          <option value="">—</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Brand
        <select value={form.brandId} onChange={set('brandId')}>
          <option value="">—</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <div className="row">
        <label>Buy price<input type="number" min="0" value={form.buyPrice} onChange={set('buyPrice')} /></label>
        <label>Sale price<input type="number" min="0" value={form.salePrice} onChange={set('salePrice')} /></label>
      </div>
      <div className="row">
        <label>Opening stock<input type="number" min="0" disabled={form.serialized} value={form.stock} onChange={set('stock')} /></label>
        <label>Low stock limit<input type="number" min="0" value={form.lowStockLimit} onChange={set('lowStockLimit')} /></label>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.serialized}
          onChange={(e) => setForm({ ...form, serialized: e.target.checked })} />
        Track each unit by IMEI / serial
      </label>
      {error && <div className="error">{error}</div>}
      <button className="primary">Save product</button>
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
      <input placeholder={`${label} name`} value={name} onChange={(e) => setName(e.target.value)} required />
      <button>Add {label.toLowerCase()}</button>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
