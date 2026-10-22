import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import Scanner from '../components/Scanner';
import { printSaleInvoice } from '../print';
import { getShop } from '../shop';
import type { Account, Party, Product, SaleDetail } from '../types';
import { t } from '../i18n';

interface CartLine {
  product: Product;
  qty: number;
  unitPrice: number;
  serials: string[];
}

export default function Pos() {
  const { can } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const selectedCustomer = customers.find((c) => String(c.id) === customerId);
  const isDealer = selectedCustomer?.customerType === 'wholesaler';
  /** Dealers pay the dealer price when the product has one. */
  const priceFor = (p: Product) => (isDealer && p.dealerPrice != null ? p.dealerPrice : p.salePrice);
  const [newCustomer, setNewCustomer] = useState<{ name: string; mobile: string } | null>(null);
  const [discount, setDiscount] = useState('');
  const [paid, setPaid] = useState('');
  const [accountId, setAccountId] = useState('');
  const [autoPrint, setAutoPrint] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadProducts = () => api<Product[]>('GET', '/products').then(setProducts);
  useEffect(() => {
    loadProducts();
    api<Party[]>('GET', '/customers').then(setCustomers);
    api<Account[]>('GET', '/accounts').then((a) => { setAccounts(a); if (a[0]) setAccountId(String(a[0].id)); });
  }, []);

  // Switching between a dealer and a normal customer re-prices the cart.
  useEffect(() => {
    setCart((c) => c.map((l) => ({ ...l, unitPrice: priceFor(l.product) })));
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 24);
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)).slice(0, 24);
  }, [products, search]);

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const total = Math.max(0, subtotal - (Number(discount) || 0));
  const paidValue = paid === '' ? total : Number(paid) || 0;
  const due = Math.max(0, total - paidValue);
  const change = Math.max(0, paidValue - total);

  function addProduct(p: Product, serial?: string) {
    setMessage(null);
    if (p.serialized && !serial) {
      const s = window.prompt(t('{name} — IMEI / সিরিয়াল স্ক্যান করুন', { name: p.name }));
      if (!s?.trim()) return;
      return void lookupCode(s.trim());
    }
    setCart((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (serial) {
        if (prev.some((l) => l.serials.includes(serial))) {
          setMessage({ ok: false, text: t('এই IMEI কার্টে আছে') });
          return prev;
        }
        if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, qty: l.qty + 1, serials: [...l.serials, serial] } : l));
        return [...prev, { product: p, qty: 1, unitPrice: priceFor(p), serials: [serial] }];
      }
      const inCart = i >= 0 ? prev[i].qty : 0;
      if (inCart + 1 > p.stock) {
        setMessage({ ok: false, text: t('{name}: স্টকে মাত্র {n} টি', { name: p.name, n: p.stock }) });
        return prev;
      }
      if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { product: p, qty: 1, unitPrice: priceFor(p), serials: [] }];
    });
  }

  /** Any scanned code: product barcode (SKU) or the IMEI of an in-stock phone. */
  async function lookupCode(code: string) {
    try {
      const r = await api<{ product: Product; serial: string | null; unitStatus: string | null }>('GET', `/products/lookup/${encodeURIComponent(code)}`);
      if (r.serial && r.unitStatus !== 'in_stock') {
        setMessage({ ok: false, text: t('এই IMEI আগেই বিক্রি হয়েছে') });
        return false;
      }
      addProduct(r.product, r.serial ?? undefined);
      return true;
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Not found' });
      return false;
    }
  }

  /** Enter in the search box: exact SKU → add; otherwise try it as an IMEI scan. */
  async function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    const bySku = products.find((p) => p.sku && p.sku.toLowerCase() === q.toLowerCase());
    if (bySku) addProduct(bySku);
    else if (matches.length === 1) addProduct(matches[0]);
    else if (await lookupCode(q)) { /* added by barcode or IMEI */ }
    else return;
    setSearch('');
    searchRef.current?.focus();
  }

  function setLine(i: number, patch: Partial<CartLine>) {
    setCart(cart.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function checkout() {
    setMessage(null);
    setBusy(true);
    try {
      let custId = customerId ? Number(customerId) : null;
      if (newCustomer?.name.trim()) {
        const c = await api<{ id: number }>('POST', '/customers', { name: newCustomer.name.trim(), mobile: newCustomer.mobile.trim() || null });
        custId = c.id;
      }
      const body = {
        customerId: custId,
        discount: Number(discount) || 0,
        paid: Math.min(paidValue, total),
        accountId: Number(accountId) || null,
        items: cart.map((l) => ({ productId: l.product.id, qty: l.qty, unitPrice: l.unitPrice, serials: l.serials })),
      };
      let sale: SaleDetail;
      try {
        sale = await api<SaleDetail>('POST', '/sales', body);
      } catch (err) {
        // Over the dealer's credit limit: a manager or above may approve it.
        if (!(err instanceof Error && /Credit limit/.test(err.message) && can('manageParties')
          && window.confirm(`${err.message}\n\n${t('তবুও বাকিতে বিক্রি করবেন?')}`))) throw err;
        sale = await api<SaleDetail>('POST', '/sales', { ...body, allowOverLimit: true });
      }
      if (autoPrint) printSaleInvoice(sale, await getShop());
      setMessage({ ok: true, text: `✅ ${t('{inv} সেভ হয়েছে — মোট ৳{total}', { inv: sale.invoiceNo, total: money(sale.total) })}${sale.due ? `, ${t('বাকি')} ৳${money(sale.due)}` : ''}` });
      setCart([]);
      setPaid('');
      setDiscount('');
      setNewCustomer(null);
      setCustomerId('');
      loadProducts();
      if (custId) api<Party[]>('GET', '/customers').then(setCustomers);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Sale failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pos">
      <div className="pos-left">
        <form className="pos-search" onSubmit={onSearchSubmit}>
          <i className="fa-solid fa-barcode" />
          <input ref={searchRef} autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('পণ্যের নাম / SKU লিখুন বা IMEI স্ক্যান করে Enter চাপুন')} />
          <button type="button" className="scan-btn" onClick={() => setScanning(true)} aria-label={t('ক্যামেরা দিয়ে স্ক্যান')}>
            <i className="fa-solid fa-camera" />
          </button>
        </form>
        {scanning && <Scanner continuous title={t('স্ক্যান করে কার্টে যোগ')} onResult={(code) => { lookupCode(code); }} onClose={() => setScanning(false)} />}
        {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}
        <div className="product-grid">
          {matches.map((p) => {
            const out = !p.serialized && p.stock <= 0;
            return (
              <button key={p.id} className="product-tile" disabled={out || (p.serialized && p.stock <= 0)} onClick={() => addProduct(p)}>
                <div className="pt-name">{p.name}</div>
                <div className="pt-price">৳{money(p.salePrice)}</div>
                <div className={p.isLowStock ? 'pt-stock warn' : 'pt-stock'}>
                  {p.serialized ? <><i className="fa-solid fa-barcode" /> IMEI · </> : null}{t('স্টক')} {p.stock}
                </div>
              </button>
            );
          })}
          {matches.length === 0 && <div className="muted">{t('কোনো পণ্য পাওয়া যায়নি।')}</div>}
        </div>
      </div>

      <div className="pos-right card">
        <h3><i className="fa-solid fa-cart-shopping" /> {t('কার্ট (')}{cart.length})</h3>
        <div className="cart-lines">
          {cart.map((l, i) => (
            <div key={i} className="cart-line">
              <div className="cl-name">
                {l.product.name}
                {l.serials.length > 0 && <small className="muted">{l.serials.join(', ')}</small>}
              </div>
              <div className="cl-controls">
                {l.serials.length === 0 ? (
                  <input type="number" min="1" max={l.product.stock} value={l.qty} className="qty"
                    onChange={(e) => setLine(i, { qty: Math.max(1, Math.min(l.product.stock, Number(e.target.value) || 1)) })} />
                ) : <span className="qty-fixed">{l.qty}</span>}
                <span>×</span>
                {can('editPrice')
                  ? <input type="number" min="0" value={l.unitPrice} className="price" onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) || 0 })} />
                  : <span>{money(l.unitPrice)}</span>}
                <b className="cl-total">{money(l.qty * l.unitPrice)}</b>
                <button className="ghost" onClick={() => setCart(cart.filter((_, j) => j !== i))} aria-label="Remove"><i className="fa-solid fa-xmark" /></button>
              </div>
            </div>
          ))}
          {cart.length === 0 && <p className="muted">{t('পণ্যে ক্লিক করুন বা IMEI স্ক্যান করুন।')}</p>}
        </div>

        <div className="totals">
          <div><span>{t('সাবটোটাল')}</span><span>{money(subtotal)}</span></div>
          {can('giveDiscount') && (
            <div><span>{t('ডিসকাউন্ট')}</span><input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" /></div>
          )}
          <div className="grand"><span>{t('মোট')}</span><span>৳{money(total)}</span></div>
        </div>

        {newCustomer ? (
          <div className="form-grid">
            <label>{t('নতুন কাস্টমার')}<input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} placeholder={t('নাম')} /></label>
            <label>{t('মোবাইল')}<input value={newCustomer.mobile} onChange={(e) => setNewCustomer({ ...newCustomer, mobile: e.target.value })} /></label>
          </div>
        ) : (
          <label>{t('কাস্টমার')}
            <div className="inline" style={{ margin: 0 }}>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ flex: 1 }}>
                <option value="">{t('Walk-in (পুরো টাকা দিতে হবে)')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.mobile ? ` · ${c.mobile}` : ''}{c.customerType === 'wholesaler' ? ` [${t('ডিলার')}]` : ''}{c.balance > 0 ? ` (${t('বাকি')} ${money(c.balance)})` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="ghost" onClick={() => setNewCustomer({ name: '', mobile: '' })}><i className="fa-solid fa-user-plus" /></button>
            </div>
            {isDealer && (
              <small className="dealer-note">
                <i className="fa-solid fa-store" /> {t('ডিলার মূল্য প্রযোজ্য')}
                {(selectedCustomer?.creditLimit ?? 0) > 0 && <> · {t('লিমিট')} ৳{money(selectedCustomer?.creditLimit)} · {t('বাকি')} ৳{money(selectedCustomer?.balance)}</>}
              </small>
            )}
          </label>
        )}

        <div className="form-grid">
          <label>{t('পরিশোধ')}<input type="number" min="0" value={paid === '' ? String(total) : paid} onChange={(e) => setPaid(e.target.value)} /></label>
          <label>{t('একাউন্ট')}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <div className="pay-hints">
          {due > 0 && <span className="warn">{t('বাকি: ৳')}{money(due)}</span>}
          {change > 0 && <span className="ok-text">{t('ফেরত দিন: ৳')}{money(change)}</span>}
        </div>
        <label className="check"><input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} /> {t('বিক্রয়ের পর ইনভয়েস প্রিন্ট')}</label>
        <button className="primary btn-accent" disabled={cart.length === 0 || busy} onClick={checkout}>
          <i className="fa-solid fa-check" /> {t('বিক্রয় সম্পন্ন (৳')}{money(total)})
        </button>
      </div>
    </section>
  );
}
