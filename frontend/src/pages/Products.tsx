import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import type { Brand, Category, Product } from '../types';
import { t } from '../i18n';
import Modal from '../components/Modal';
import Scanner from '../components/Scanner';

type View = 'active' | 'archived';

export default function Products() {
  const { can, user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<View>('active');
  const [editing, setEditing] = useState<Product | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = () => {
    api<Product[]>('GET', `/products?status=${view}&q=${encodeURIComponent(search)}`)
      .then(setProducts)
      .catch((e: Error) => setMessage({ ok: false, text: e.message }));
  };
  const loadCatalog = () => {
    api<Category[]>('GET', '/catalog/categories').then(setCategories);
    api<Brand[]>('GET', '/catalog/brands').then(setBrands);
  };

  useEffect(loadCatalog, []);
  useEffect(reload, [search, view]); // eslint-disable-line react-hooks/exhaustive-deps

  async function adjust(p: Product) {
    const change = Number(window.prompt(t('{name} — স্টক কত বাড়বে/কমবে? (যেমন 3 বা -2)', { name: p.name })));
    if (!Number.isInteger(change) || change === 0) return;
    const reason = window.prompt(t('কারণ লিখুন')) ?? '';
    try {
      await api('POST', `/products/${p.id}/adjust`, { change, reason });
      reload();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Adjustment failed' });
    }
  }

  async function setActive(p: Product, active: boolean) {
    try {
      await api('PATCH', `/products/${p.id}`, { active });
      setMessage({ ok: true, text: active ? t('{name} আবার চালু হয়েছে', { name: p.name }) : t('{name} আর্কাইভ করা হয়েছে', { name: p.name }) });
      reload();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Failed' });
    }
  }

  /** Super Admin only. Products with history cannot be deleted; offer to archive instead. */
  async function remove(p: Product) {
    if (!window.confirm(t('"{name}" স্থায়ীভাবে মুছে ফেলবেন? এটি ফেরত আনা যাবে না।', { name: p.name }))) return;
    try {
      await api('DELETE', `/products/${p.id}`);
      setMessage({ ok: true, text: t('{name} মুছে ফেলা হয়েছে', { name: p.name }) });
      reload();
    } catch (e) {
      const text = e instanceof Error ? e.message : 'Delete failed';
      if (p.active && /Archive/.test(text) && window.confirm(`${text}\n\n${t('এখন আর্কাইভ (লুকিয়ে রাখা) করবেন?')}`)) {
        await setActive(p, false);
      } else {
        setMessage({ ok: false, text });
      }
    }
  }

  return (
    <section>
      <div className="toolbar">
        <h2><i className="fa-solid fa-boxes-stacked" /> {t('পণ্য তালিকা ও স্টক')}</h2>
        <div className="inline" style={{ margin: 0 }}>
          <div className="tabs">
            <button className={view === 'active' ? 'nav active' : 'nav'} onClick={() => setView('active')}>{t('চালু পণ্য')}</button>
            <button className={view === 'archived' ? 'nav active' : 'nav'} onClick={() => setView('archived')}><i className="fa-solid fa-box-archive" /> {t('আর্কাইভ')}</button>
          </div>
          <input placeholder={t('নাম বা SKU দিয়ে খুঁজুন')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="ghost" onClick={() => setScanning(true)} aria-label={t('ক্যামেরা দিয়ে স্ক্যান')}><i className="fa-solid fa-camera" /></button>
        </div>
        {scanning && <Scanner onResult={setSearch} onClose={() => setScanning(false)} />}
      </div>
      {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('নাম')}</th><th>{t('ক্যাটাগরি')}</th><th className="num">{t('বিক্রয়মূল্য')}</th><th className="num">{t('ডিলার মূল্য')}</th>
              {can('viewCost') && <th className="num">{t('ক্রয়মূল্য')}</th>}
              <th className="num">{t('স্টক')}</th><th>{t('ধরন')}</th>
              {(can('manageProducts') || isOwner) && <th />}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'inactive'}>
                <td>{p.name}{p.isLowStock && p.active && <span className="badge warn">{t('কম')}</span>}<div className="muted small-note">{p.sku ?? ''}</div></td>
                <td>{p.categoryName ?? '—'}</td>
                <td className="num">{money(p.salePrice)}</td>
                <td className="num muted">{p.dealerPrice != null ? money(p.dealerPrice) : '—'}</td>
                {can('viewCost') && <td className="num">{money(p.buyPrice)}</td>}
                <td className="num">{p.stock}</td>
                <td>{p.serialized ? t('IMEI / সিরিয়াল') : t('পরিমাণ')}</td>
                {(can('manageProducts') || isOwner) && (
                  <td className="row-actions">
                    {can('manageProducts') && p.active && (
                      <button className="ghost" title={t('এডিট')} onClick={() => setEditing(p)}><i className="fa-solid fa-pen" /></button>
                    )}
                    {can('manageProducts') && p.active && !p.serialized && (
                      <button className="ghost" title={t('স্টক সমন্বয়')} onClick={() => adjust(p)}><i className="fa-solid fa-plus-minus" /></button>
                    )}
                    {can('manageProducts') && (
                      <button className="ghost" title={p.active ? t('আর্কাইভ') : t('আবার চালু')} onClick={() => setActive(p, !p.active)}>
                        <i className={p.active ? 'fa-solid fa-box-archive' : 'fa-solid fa-rotate-left'} />
                      </button>
                    )}
                    {isOwner && (
                      <button className="ghost danger" title={t('মুছুন')} onClick={() => remove(p)}><i className="fa-solid fa-trash" /></button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={8} className="muted">{view === 'archived' ? t('আর্কাইভে কোনো পণ্য নেই।') : t('এখনো কোনো পণ্য নেই।')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {can('manageProducts') && view === 'active' && (
        <div className="two-col">
          <ProductForm categories={categories} brands={brands} onSaved={reload} />
          <CatalogManager categories={categories} brands={brands} isOwner={isOwner}
            onChanged={() => { loadCatalog(); reload(); }} />
        </div>
      )}

      {editing && (
        <Modal title={t('পণ্য এডিট')} onClose={() => setEditing(null)}>
          <ProductForm categories={categories} brands={brands} initial={editing}
            onSaved={() => { setEditing(null); reload(); setMessage({ ok: true, text: t('সংরক্ষিত হয়েছে') }); }} />
        </Modal>
      )}
    </section>
  );
}

/** New product, or edit an existing one (stock and IMEI tracking are changed elsewhere). */
function ProductForm({ categories, brands, onSaved, initial }: {
  categories: Category[];
  brands: Brand[];
  onSaved: () => void;
  initial?: Product;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    sku: initial?.sku ?? '',
    categoryId: initial?.categoryId ? String(initial.categoryId) : '',
    brandId: initial?.brandId ? String(initial.brandId) : '',
    buyPrice: initial?.buyPrice !== undefined ? String(initial.buyPrice) : '',
    salePrice: initial ? String(initial.salePrice) : '',
    dealerPrice: initial?.dealerPrice != null ? String(initial.dealerPrice) : '',
    stock: '0',
    lowStockLimit: initial ? String(initial.lowStockLimit) : '5',
    serialized: initial?.serialized ?? false,
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const common = {
      name: form.name,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      brandId: form.brandId ? Number(form.brandId) : null,
      salePrice: form.salePrice || 0,
      dealerPrice: form.dealerPrice === '' ? null : form.dealerPrice,
      lowStockLimit: form.lowStockLimit,
    };
    try {
      if (initial) {
        await api('PATCH', `/products/${initial.id}`, {
          ...common,
          sku: form.sku.trim() || null,
          ...(initial.buyPrice !== undefined ? { buyPrice: form.buyPrice || 0 } : {}),
        });
      } else {
        await api('POST', '/products', {
          ...common,
          sku: form.sku || undefined,
          buyPrice: form.buyPrice || 0,
          stock: form.serialized ? 0 : Number(form.stock),
          serialized: form.serialized,
        });
        setForm({ ...form, name: '', sku: '', buyPrice: '', salePrice: '', dealerPrice: '', stock: '0' });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <form className={initial ? '' : 'card'} onSubmit={submit}>
      {!initial && <h3>{t('নতুন পণ্য')}</h3>}
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
        {(!initial || initial.buyPrice !== undefined) && (
          <label>{t('ক্রয়মূল্য')}<input type="number" min="0" value={form.buyPrice} onChange={set('buyPrice')} /></label>
        )}
        <label>{t('বিক্রয়মূল্য')}<input type="number" min="0" value={form.salePrice} onChange={set('salePrice')} /></label>
        <label>{t('ডিলার মূল্য (ঐচ্ছিক)')}<input type="number" min="0" value={form.dealerPrice} onChange={set('dealerPrice')} /></label>
      </div>
      <div className="row">
        {!initial && (
          <label>{t('শুরুর স্টক')}<input type="number" min="0" disabled={form.serialized} value={form.stock} onChange={set('stock')} /></label>
        )}
        <label>{t('লো স্টক সীমা')}<input type="number" min="0" value={form.lowStockLimit} onChange={set('lowStockLimit')} /></label>
      </div>
      {!initial && (
        <label className="check">
          <input type="checkbox" checked={form.serialized} onChange={(e) => setForm({ ...form, serialized: e.target.checked })} />
          {t('প্রতিটি ইউনিট IMEI / সিরিয়াল দিয়ে ট্র্যাক করুন (মোবাইল ফোন)')}
        </label>
      )}
      {error && <div className="error">{error}</div>}
      <button className="primary">{initial ? t('সেভ') : t('পণ্য সেভ')}</button>
    </form>
  );
}

/** Add, rename and (Super Admin) delete categories and brands. */
function CatalogManager({ categories, brands, isOwner, onChanged }: {
  categories: Category[];
  brands: Brand[];
  isOwner: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState('');

  const act = (fn: () => Promise<unknown>) => {
    setError('');
    fn().then(onChanged).catch((e: Error) => setError(e.message));
  };

  const list = (kind: 'categories' | 'brands', items: { id: number; name: string }[], label: string) => (
    <div className="catalog-block">
      <QuickAdd label={label} onAdd={(name) => api('POST', `/catalog/${kind}`, { name }).then(onChanged)} />
      <ul className="chip-list">
        {items.map((it) => (
          <li key={it.id}>
            <span>{it.name}</span>
            <button className="ghost" title={t('নাম বদলান')} onClick={() => {
              const name = window.prompt(t('নতুন নাম'), it.name)?.trim();
              if (name && name !== it.name) act(() => api('PATCH', `/catalog/${kind}/${it.id}`, { name }));
            }}><i className="fa-solid fa-pen" /></button>
            {isOwner && (
              <button className="ghost danger" title={t('মুছুন')} onClick={() => {
                if (window.confirm(t('"{name}" মুছবেন? এই নামের পণ্যগুলো থাকবে, শুধু নামটি খালি হবে।', { name: it.name }))) {
                  act(() => api('DELETE', `/catalog/${kind}/${it.id}`));
                }
              }}><i className="fa-solid fa-trash" /></button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="card">
      <h3>{t('ক্যাটাগরি ও ব্র্যান্ড')}</h3>
      {error && <div className="error">{error}</div>}
      <h4>{t('ক্যাটাগরি')}</h4>
      {list('categories', categories, t('ক্যাটাগরি'))}
      <h4>{t('ব্র্যান্ড')}</h4>
      {list('brands', brands, t('ব্র্যান্ড'))}
    </div>
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
