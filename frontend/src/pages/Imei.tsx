import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { fmtDate, STATUS } from '../labels';
import type { ImeiResult } from '../types';
import { t } from '../i18n';
import Scanner from '../components/Scanner';

export default function Imei() {
  const [q, setQ] = useState('');
  const [data, setData] = useState<ImeiResult | null>(null);
  const [error, setError] = useState('');

  const [scanning, setScanning] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    await run(q);
  }

  async function run(value: string) {
    setError('');
    try {
      setData(await api<ImeiResult>('GET', `/lookup/imei?q=${encodeURIComponent(value.trim())}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
  }

  return (
    <section>
      <h2><i className="fa-solid fa-mobile-screen-button" /> {t('IMEI লুকআপ')}</h2>
      <form className="inline card" onSubmit={search}>
        <input autoFocus required minLength={3} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('IMEI / সিরিয়াল স্ক্যান বা টাইপ করুন')} inputMode="numeric" style={{ flex: 1 }} />
        <button type="button" className="ghost" onClick={() => setScanning(true)} aria-label={t('ক্যামেরা দিয়ে স্ক্যান')}><i className="fa-solid fa-camera" /></button>
        <button><i className="fa-solid fa-magnifying-glass" /> {t('খুঁজুন')}</button>
      </form>
      {scanning && <Scanner onResult={(code) => { setQ(code); run(code); }} onClose={() => setScanning(false)} />}
      {error && <div className="error">{error}</div>}
      {data && (
        <>
          <div className="card">
            <h3>{t('স্টক / বিক্রয় ইতিহাস')}</h3>
            <table>
              <thead><tr><th>IMEI</th><th>{t('পণ্য')}</th><th>{t('অবস্থা')}</th><th>{t('ক্রয়')}</th><th>{t('বিক্রয়')}</th></tr></thead>
              <tbody>
                {data.units.map((u) => (
                  <tr key={u.serial}>
                    <td className="b">{u.serial}</td>
                    <td>{u.productName}</td>
                    <td>{u.status === 'in_stock' ? <span className="badge ok">{t('স্টকে আছে')}</span> : <span className="badge danger">{t('বিক্রি হয়েছে')}</span>}</td>
                    <td>{u.purchaseNo ? <>{u.supplierName}<div className="muted">{u.purchaseNo} · {fmtDate(u.purchasedAt, false)}</div></> : '—'}</td>
                    <td>{u.status === 'sold' && u.saleNo ? <>{u.customerName ?? 'Walk-in'}<div className="muted">{u.saleNo} · {fmtDate(u.soldAt, false)}</div></> : '—'}</td>
                  </tr>
                ))}
                {data.units.length === 0 && <tr><td colSpan={5} className="muted">{t('স্টকে বা বিক্রয়ে পাওয়া যায়নি।')}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3>{t('সার্ভিস ইতিহাস')}</h3>
            <table>
              <thead><tr><th>{t('জব')}</th><th>{t('ডিভাইস')}</th><th>{t('কাস্টমার')}</th><th>{t('স্ট্যাটাস')}</th><th>{t('তারিখ')}</th></tr></thead>
              <tbody>
                {data.repairs.map((r) => (
                  <tr key={r.id}>
                    <td className="b">{r.jobNo}</td><td>{r.device}<div className="muted">{r.imei}</div></td>
                    <td>{r.customerName}<div className="muted">{r.customerMobile ?? ''}</div></td>
                    <td><span className="status-badge" style={{ background: STATUS[r.status].color }}>{STATUS[r.status].label}</span></td>
                    <td>{fmtDate(r.createdAt, false)}</td>
                  </tr>
                ))}
                {data.repairs.length === 0 && <tr><td colSpan={5} className="muted">{t('কোনো সার্ভিস রেকর্ড নেই।')}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
