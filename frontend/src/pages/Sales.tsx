import { useEffect, useState } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import { fmtDate, todayKey } from '../labels';
import { printSaleInvoice } from '../print';
import { getShop } from '../shop';
import type { Account, SaleDetail, SaleSummary } from '../types';

interface ReturnRow {
  id: number;
  returnNo: string;
  invoiceNo: string;
  customerName: string;
  total: number;
  credited: number;
  refunded: number;
  createdAt: string;
}

export default function Sales() {
  const [tab, setTab] = useState<'invoices' | 'returns'>('invoices');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayKey());
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const reload = () => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    api<SaleSummary[]>('GET', `/sales?${p}`).then(setSales).catch((e: Error) => setError(e.message));
    api<ReturnRow[]>('GET', `/sales/returns?${p}`).then(setReturns).catch(() => undefined);
  };

  useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [q, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = sales.reduce((s, x) => s + x.total, 0);
  const due = sales.reduce((s, x) => s + x.due, 0);

  return (
    <section>
      <div className="toolbar">
        <h2><i className="fa-solid fa-file-invoice" /> বিক্রয় ইনভয়েস ও রিটার্ন</h2>
        <div className="tabs">
          <button className={tab === 'invoices' ? 'nav active' : 'nav'} onClick={() => setTab('invoices')}>ইনভয়েস</button>
          <button className={tab === 'returns' ? 'nav active' : 'nav'} onClick={() => setTab('returns')}>রিটার্ন</button>
        </div>
      </div>
      <div className="filters">
        <input placeholder="ইনভয়েস নং / কাস্টমার / মোবাইল" value={q} onChange={(e) => setQ(e.target.value)} />
        <label>থেকে<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>পর্যন্ত<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {error && <div className="error">{error}</div>}

      {tab === 'invoices' ? (
        <div className="card">
          <div className="summary-line">মোট {sales.length} টি · বিক্রয় ৳{money(total)} · বাকি ৳{money(due)}</div>
          <table>
            <thead><tr><th>ইনভয়েস</th><th>তারিখ</th><th>কাস্টমার</th><th className="num">মোট</th><th className="num">বাকি</th><th /></tr></thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>{s.invoiceNo}</td>
                  <td>{fmtDate(s.createdAt)}</td>
                  <td>{s.customerName}</td>
                  <td className="num">{money(s.total)}</td>
                  <td className={s.due > 0 ? 'num warn' : 'num'}>{money(s.due)}</td>
                  <td><button className="ghost" onClick={() => setOpenId(s.id)}>দেখুন</button></td>
                </tr>
              ))}
              {sales.length === 0 && <tr><td colSpan={6} className="muted">কোনো ইনভয়েস নেই।</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead><tr><th>রিটার্ন</th><th>ইনভয়েস</th><th>তারিখ</th><th>কাস্টমার</th><th className="num">মোট</th><th className="num">বাকি থেকে কাটা</th><th className="num">ফেরত</th></tr></thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.id}>
                  <td>{r.returnNo}</td><td>{r.invoiceNo}</td><td>{fmtDate(r.createdAt)}</td><td>{r.customerName}</td>
                  <td className="num">{money(r.total)}</td><td className="num">{money(r.credited)}</td><td className="num">{money(r.refunded)}</td>
                </tr>
              ))}
              {returns.length === 0 && <tr><td colSpan={7} className="muted">কোনো রিটার্ন নেই।</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {openId !== null && <SaleView id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </section>
  );
}

function SaleView({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [returning, setReturning] = useState(false);
  const load = () => api<SaleDetail>('GET', `/sales/${id}`).then(setSale);
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sale) return <Modal title="ইনভয়েস" onClose={onClose}><p className="muted">লোড হচ্ছে…</p></Modal>;
  const canReturn = can('manageReturns') && sale.items.some((i) => i.qty - i.returnedQty > 0);

  return (
    <Modal title={sale.invoiceNo} onClose={onClose} wide>
      <div className="detail-head">
        <div>{sale.customerName} · {fmtDate(sale.createdAt)} · {sale.createdBy}</div>
        <div className="inline">
          <button className="ghost" onClick={async () => printSaleInvoice(sale, await getShop())}><i className="fa-solid fa-print" /> প্রিন্ট</button>
          {canReturn && !returning && <button className="ghost" onClick={() => setReturning(true)}><i className="fa-solid fa-rotate-left" /> রিটার্ন</button>}
        </div>
      </div>
      <table>
        <thead><tr><th>পণ্য</th><th className="num">পরিমাণ</th><th className="num">দর</th><th className="num">মোট</th></tr></thead>
        <tbody>
          {sale.items.map((i) => (
            <tr key={i.id}>
              <td>{i.productName}{i.serials.length > 0 && <div className="muted">IMEI: {i.serials.join(', ')}</div>}
                {i.returnedQty > 0 && <span className="badge">ফেরত {i.returnedQty}</span>}</td>
              <td className="num">{i.qty}</td><td className="num">{money(i.unitPrice)}</td><td className="num">{money(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="totals">
        <div><span>সাবটোটাল</span><span>{money(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div><span>ডিসকাউন্ট</span><span>-{money(sale.discount)}</span></div>}
        <div className="grand"><span>মোট</span><span>৳{money(sale.total)}</span></div>
        <div><span>পরিশোধ</span><span>{money(sale.paid)}</span></div>
        {sale.due > 0 && <div><span>বাকি</span><span>{money(sale.due)}</span></div>}
      </div>
      {sale.returns.length > 0 && (
        <p className="muted">রিটার্ন: {sale.returns.map((r) => `${r.returnNo} (৳${money(r.total)})`).join(', ')}</p>
      )}
      {returning && <ReturnForm sale={sale} onDone={() => { setReturning(false); load(); onChanged(); }} />}
    </Modal>
  );
}

function ReturnForm({ sale, onDone }: { sale: SaleDetail; onDone: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [qty, setQty] = useState<Record<number, string>>({});
  const [serials, setSerials] = useState<Record<number, string[]>>({});
  const [error, setError] = useState('');
  useEffect(() => { api<Account[]>('GET', '/accounts').then((a) => { setAccounts(a); if (a[0]) setAccountId(String(a[0].id)); }); }, []);

  const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1;
  const lines = sale.items.map((i) => {
    const n = i.serials.length > 0 ? (serials[i.id]?.length ?? 0) : Number(qty[i.id] || 0);
    return { item: i, n, value: n * i.unitPrice * ratio };
  }).filter((l) => l.n > 0);
  const value = lines.reduce((s, l) => s + l.value, 0);

  async function submit() {
    setError('');
    try {
      await api('POST', `/sales/${sale.id}/returns`, {
        accountId: Number(accountId) || null,
        items: lines.map((l) => (l.item.serials.length > 0
          ? { saleItemId: l.item.id, serials: serials[l.item.id] }
          : { saleItemId: l.item.id, qty: l.n })),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Return failed');
    }
  }

  return (
    <div className="sub-form">
      <h4>রিটার্ন নিন</h4>
      {sale.items.map((i) => {
        const left = i.qty - i.returnedQty;
        if (left <= 0) return null;
        return (
          <div key={i.id} className="return-line">
            <b>{i.productName}</b>
            {i.serials.length > 0 ? (
              <div className="inline">
                {i.returnableSerials.map((s) => (
                  <label key={s} className="check">
                    <input type="checkbox" checked={serials[i.id]?.includes(s) ?? false}
                      onChange={(e) => setSerials({ ...serials, [i.id]: e.target.checked ? [...(serials[i.id] ?? []), s] : (serials[i.id] ?? []).filter((x) => x !== s) })} />
                    {s}
                  </label>
                ))}
              </div>
            ) : (
              <label className="inline-label">পরিমাণ (সর্বোচ্চ {left})
                <input type="number" min="0" max={left} value={qty[i.id] ?? ''} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />
              </label>
            )}
          </div>
        );
      })}
      <label>রিফান্ড একাউন্ট
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <p className="muted">ফেরতের মূল্য: ৳{money(value)} (ডিসকাউন্ট অনুপাতে)। কাস্টমারের বাকি থাকলে আগে সেখান থেকে কাটা হবে।</p>
      {error && <div className="error">{error}</div>}
      <button className="primary" disabled={lines.length === 0} onClick={submit}>রিটার্ন সম্পন্ন</button>
    </div>
  );
}
