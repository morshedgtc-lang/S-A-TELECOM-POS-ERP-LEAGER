import { useEffect, useState } from 'react';
import { api, money } from '../api';
import type { Account, Party, Product, PurchaseSummary } from '../types';

interface PurchaseLine {
  product: Product;
  qty: number;
  unitCost: number;
  serials: string[];
}

export default function Purchases() {
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<PurchaseSummary[]>([]);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [paid, setPaid] = useState('');
  const [pickId, setPickId] = useState('');
  const [qty, setQty] = useState('1');
  const [cost, setCost] = useState('');
  const [serialText, setSerialText] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const loadHistory = () => api<PurchaseSummary[]>('GET', '/purchases').then(setHistory);

  useEffect(() => {
    api<Party[]>('GET', '/suppliers').then(setSuppliers);
    api<Product[]>('GET', '/products').then(setProducts);
    api<Account[]>('GET', '/accounts').then((a) => {
      setAccounts(a);
      if (a[0]) setAccountId(String(a[0].id));
    });
    loadHistory();
  }, []);

  const picked = products.find((p) => String(p.id) === pickId);
  const total = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  function addLine() {
    if (!picked) return;
    const n = Number(qty);
    const unitCost = Number(cost);
    const serials = picked.serialized ? serialText.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) : [];
    if (!Number.isInteger(n) || n <= 0) return setMessage({ kind: 'error', text: 'Quantity must be a whole number' });
    if (!Number.isFinite(unitCost) || unitCost < 0) return setMessage({ kind: 'error', text: 'Enter the unit cost' });
    if (picked.serialized && serials.length !== n) {
      return setMessage({ kind: 'error', text: `Enter ${n} IMEI / serial number(s)` });
    }
    setLines([...lines, { product: picked, qty: n, unitCost, serials }]);
    setPickId('');
    setQty('1');
    setCost('');
    setSerialText('');
    setMessage(null);
  }

  async function save() {
    setMessage(null);
    try {
      const p = await api<{ invoiceNo?: string; id: number; due: number }>('POST', '/purchases', {
        supplierId: Number(supplierId),
        paid: Number(paid) || 0,
        accountId: accountId ? Number(accountId) : null,
        items: lines.map((l) => ({ productId: l.product.id, qty: l.qty, unitCost: l.unitCost, serials: l.serials })),
      });
      setMessage({ kind: 'ok', text: `Purchase #${p.id} saved — due to supplier ${money(p.due)}` });
      setLines([]);
      setPaid('');
      loadHistory();
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Purchase failed' });
    }
  }

  return (
    <section>
      <h2>Purchases (stock in)</h2>
      {message && <div className={message.kind === 'ok' ? 'ok' : 'error'}>{message.text}</div>}

      <div className="two-col">
        <div className="card">
          <h3>New purchase</h3>
          <label>Supplier
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Product
            <select value={pickId} onChange={(e) => setPickId(e.target.value)}>
              <option value="">Select…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.serialized ? ' (serial)' : ''}</option>)}
            </select>
          </label>
          <div className="row">
            <label>Qty<input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
            <label>Unit cost<input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
          </div>
          {picked?.serialized && (
            <label>IMEI / serial numbers
              <textarea rows={3} value={serialText} onChange={(e) => setSerialText(e.target.value)} />
            </label>
          )}
          <button onClick={addLine} disabled={!picked}>Add line</button>

          <table>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.product.name}</td>
                  <td className="num">{l.qty} × {money(l.unitCost)}</td>
                  <td className="num">{money(l.qty * l.unitCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            <div className="grand"><span>Total</span><span>{money(total)}</span></div>
          </div>
          <div className="row">
            <label>Paid now<input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} /></label>
            <label>Paid from
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          </div>
          <button className="primary" disabled={!supplierId || lines.length === 0} onClick={save}>Save purchase</button>
        </div>

        <div className="card">
          <h3>Recent purchases</h3>
          <table>
            <thead><tr><th>Invoice</th><th>Supplier</th><th className="num">Total</th><th className="num">Due</th></tr></thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id}>
                  <td>{p.invoiceNo}</td><td>{p.supplierName}</td>
                  <td className="num">{money(p.total)}</td><td className="num">{money(p.due)}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={4} className="muted">No purchases yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
