import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { fmtDate, STATUS } from '../labels';
import type { ImeiResult } from '../types';

export default function Imei() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<ImeiResult | null>(null);
  const [error, setError] = useState('');

  async function search(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      setData(await api<ImeiResult>('GET', `/lookup/imei?q=${encodeURIComponent(q.trim())}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
  }

  return (
    <section>
      <h2><i className="fa-solid fa-mobile-screen-button" /> IMEI লুকআপ</h2>
      <form className="inline card" onSubmit={search}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="IMEI / সিরিয়াল স্ক্যান বা টাইপ করুন" inputMode="numeric" style={{ flex: 1 }} />
        <button><i className="fa-solid fa-magnifying-glass" /> খুঁজুন</button>
      </form>
      {error && <div className="error">{error}</div>}
      {data && (
        <>
          <div className="card">
            <h3>স্টক / বিক্রয় ইতিহাস</h3>
            <table>
              <thead><tr><th>IMEI</th><th>পণ্য</th><th>অবস্থা</th><th>ক্রয়</th><th>বিক্রয়</th></tr></thead>
              <tbody>
                {data.units.map((u) => (
                  <tr key={u.serial}>
                    <td className="b">{u.serial}</td>
                    <td>{u.productName}</td>
                    <td>{u.status === 'in_stock' ? <span className="badge ok">স্টকে আছে</span> : <span className="badge danger">বিক্রি হয়েছে</span>}</td>
                    <td>{u.purchaseNo ? <>{u.supplierName}<div className="muted">{u.purchaseNo} · {fmtDate(u.purchasedAt, false)}</div></> : '—'}</td>
                    <td>{u.status === 'sold' && u.saleNo ? <>{u.customerName ?? 'Walk-in'}<div className="muted">{u.saleNo} · {fmtDate(u.soldAt, false)}</div></> : '—'}</td>
                  </tr>
                ))}
                {data.units.length === 0 && <tr><td colSpan={5} className="muted">স্টকে বা বিক্রয়ে পাওয়া যায়নি।</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>সার্ভিস ইতিহাস</h3>
            <table>
              <thead><tr><th>জব</th><th>ডিভাইস</th><th>কাস্টমার</th><th>স্ট্যাটাস</th><th>তারিখ</th></tr></thead>
              <tbody>
                {data.repairs.map((r) => (
                  <tr key={r.id}>
                    <td className="b">{r.jobNo}</td><td>{r.device}<div className="muted">{r.imei}</div></td>
                    <td>{r.customerName}<div className="muted">{r.customerMobile ?? ''}</div></td>
                    <td><span className="status-badge" style={{ background: STATUS[r.status].color }}>{STATUS[r.status].label}</span></td>
                    <td>{fmtDate(r.createdAt, false)}</td>
                  </tr>
                ))}
                {data.repairs.length === 0 && <tr><td colSpan={5} className="muted">কোনো সার্ভিস রেকর্ড নেই।</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
