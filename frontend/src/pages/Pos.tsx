import { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import type { Account, Party, Product } from '../types';

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
  const [pickId, setPickId] = useState('');
  const [qty, setQty] = useState('1');
  const [serialText, setSerialText] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paid, setPaid] = useState('');
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api<Product[]>('GET', '/products').then(setProducts);
    api<Party[]>('GET', '/customers').then(setCustomers);
    api<Account[]>('GET', '/accounts').then((a) => {
      setAccounts(a);
      if (a[0]) setAccountId(String(a[0].id));
    });
  }, []);

  const picked = products.find((p) => String(p.id) === pickId);
  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.qty * l.unitPrice, 0), [cart]);
  const total = Math.max(0, subtotal - (Number(discount) || 0));
  const dueAmount = Math.max(0, total - (Number(paid) || 0));

  function addLine() {
    if (!picked) return;
    const n = Number(qty);
    const serials = picked.serialized ? serialText.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : [];
    if (!Number.isInteger(n) || n <= 0) return setMessage({ kind: 'error', text: 'Quantity must be a whole number' });
    if (picked.serialized && serials.length !== n) {
      return setMessage({ kind: 'error', text: `Enter ${n} IMEI / serial number(s)` });
    }
    if (!picked.serialized && picked.stock < n) {
      return setMessage({ kind: 'error', text: `Only ${picked.stock} in stock` });
    }
    setCart([...cart, { product: picked, qty: n, unitPrice: picked.salePrice, serials }]);
    setPickId('');
    setQty('1');
    setSerialText('');
    setMessage(null);
  }

  async function checkout() {
    setMessage(null);
    try {
      const sale = await api<{ invoiceNo: string; total: number; due: number }>('POST', '/sales', {
        customerId: customerId ? Number(customerId) : null,
        discount: Number(discount) || 0,
        paid: Number(paid) || 0,
        accountId: accountId ? Number(accountId) : null,
        items: cart.map((l) => ({
          productId: l.product.id,
          qty: l.qty,
          unitPrice: l.unitPrice,
          serials: l.serials,
        })),
      });
      setMessage({ kind: 'ok', text: `Saved ${sale.invoiceNo} — total ${money(sale.total)}, due ${money(sale.due)}` });
      setCart([]);
      setPaid('');
      setDiscount('0');
      api<Product[]>('GET', '/products').then(setProducts);
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Sale failed' });
    }
  }

  return (
    <section>
      <h2>POS Sale</h2>
      {message && <div className={message.kind === 'ok' ? 'ok' : 'error'}>{message.text}</div>}

      <div className="two-col">
        <div className="card">
          <h3>Add item</h3>
          <label>Product
            <select value={pickId} onChange={(e) => setPickId(e.target.value)}>
              <option value="">Select…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.serialized && p.stock <= 0}>
                  {p.name} — {money(p.salePrice)} ({p.serialized ? 'serial' : `stock ${p.stock}`})
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <label>Qty<input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
          </div>
          {picked?.serialized && (
            <label>IMEI / serial numbers
              <textarea rows={3} value={serialText} onChange={(e) => setSerialText(e.target.value)}
                placeholder="Scan or type, separated by commas or new lines" />
            </label>
          )}
          <button onClick={addLine} disabled={!picked}>Add to cart</button>
        </div>

        <div className="card">
          <h3>Cart</h3>
          <table>
            <tbody>
              {cart.map((l, i) => (
                <tr key={i}>
                  <td>{l.product.name}{l.serials.length > 0 && <small className="muted"> {l.serials.join(', ')}</small>}</td>
                  <td className="num">{l.qty} × {money(l.unitPrice)}</td>
                  <td className="num">{money(l.qty * l.unitPrice)}</td>
                  <td><button className="ghost" onClick={() => setCart(cart.filter((_, j) => j !== i))}>×</button></td>
                </tr>
              ))}
              {cart.length === 0 && <tr><td className="muted">Cart is empty.</td></tr>}
            </tbody>
          </table>

          <div className="totals">
            <div><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div>
              <span>Discount</span>
              {can('giveDiscount')
                ? <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                : <span>{money(Number(discount))}</span>}
            </div>
            <div className="grand"><span>Total</span><span>{money(total)}</span></div>
          </div>

          <label>Customer
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Walk-in (pay in full)</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="row">
            <label>Paid now<input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} /></label>
            <label>Received in
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          </div>
          <p className="muted">Due after payment: {money(dueAmount)}</p>
          <button className="primary" disabled={cart.length === 0} onClick={checkout}>Complete sale</button>
        </div>
      </div>
    </section>
  );
}
