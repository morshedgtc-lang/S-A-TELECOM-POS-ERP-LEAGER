import { useEffect, useState } from 'react';
import { api, money } from '../api';
import { REF_TYPE_BN, todayKey } from '../labels';
import type { ReportSummary } from '../types';

function shift(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PRESETS = [
  { label: 'আজ', from: () => todayKey(), to: () => todayKey() },
  { label: 'গতকাল', from: () => shift(-1), to: () => shift(-1) },
  { label: '৭ দিন', from: () => shift(-6), to: () => todayKey() },
  { label: 'এই মাস', from: () => `${todayKey().slice(0, 8)}01`, to: () => todayKey() },
];

export default function Reports() {
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [data, setData] = useState<ReportSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api<ReportSummary>('GET', `/reports/summary?from=${from}&to=${to}`).then(setData).catch((e: Error) => setError(e.message));
  }, [from, to]);

  return (
    <section>
      <div className="toolbar">
        <h2><i className="fa-solid fa-chart-pie" /> লাভ-ক্ষতি ও ক্যাশবুক</h2>
        <button className="ghost" onClick={() => window.print()}><i className="fa-solid fa-print" /> প্রিন্ট</button>
      </div>
      <div className="filters">
        {PRESETS.map((p) => (
          <button key={p.label} className="chip" onClick={() => { setFrom(p.from()); setTo(p.to()); }}>{p.label}</button>
        ))}
        <label>থেকে<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>পর্যন্ত<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {error && <div className="error">{error}</div>}
      {data && (
        <>
          <div className={data.netProfit >= 0 ? 'hero hero-green' : 'hero hero-red'}>
            <div className="hero-title"><i className="fa-solid fa-scale-balanced" /> নিট লাভ / ক্ষতি</div>
            <div className="hero-amount">৳ {money(data.netProfit)}</div>
            <div className="hero-rows">
              <div><span>বিক্রয় থেকে লাভ</span><span>৳ {money(data.sales.profit)}</span></div>
              <div><span>সার্ভিস থেকে লাভ</span><span>৳ {money(data.repairs.profit)}</span></div>
              <div><span>রিটার্নে লাভ কমেছে</span><span>-৳ {money(data.returns.profitLost)}</span></div>
              <div><span>খরচ</span><span>-৳ {money(data.expenses.total)}</span></div>
            </div>
          </div>

          <div className="two-col">
            <div className="card">
              <h3>বিক্রয়</h3>
              <table><tbody>
                <tr><td>ইনভয়েস</td><td className="num">{data.sales.count}</td></tr>
                <tr><td>মোট বিক্রয়</td><td className="num">{money(data.sales.total)}</td></tr>
                <tr><td>ডিসকাউন্ট</td><td className="num">{money(data.sales.discount)}</td></tr>
                <tr><td>ক্রয়মূল্য</td><td className="num">{money(data.sales.cost)}</td></tr>
                <tr><td>বাকিতে বিক্রয়</td><td className="num">{money(data.sales.due)}</td></tr>
                <tr><td>রিটার্ন ({data.returns.count})</td><td className="num">{money(data.returns.total)}</td></tr>
              </tbody></table>
            </div>
            <div className="card">
              <h3>সার্ভিস</h3>
              <table><tbody>
                <tr><td>ডেলিভারি</td><td className="num">{data.repairs.delivered}</td></tr>
                <tr><td>সার্ভিস আয়</td><td className="num">{money(data.repairs.revenue)}</td></tr>
                <tr><td>পার্টস খরচ</td><td className="num">{money(data.repairs.partsCost)}</td></tr>
                <tr><td>কারিগর মজুরি</td><td className="num">{money(data.repairs.technicianCost)}</td></tr>
              </tbody></table>
            </div>
            <div className="card">
              <h3>খরচ (খাত অনুযায়ী)</h3>
              <table><tbody>
                {data.expenses.byCategory.map((e) => <tr key={e.category}><td>{e.category}</td><td className="num">{money(e.total)}</td></tr>)}
                {data.expenses.byCategory.length === 0 && <tr><td className="muted">কোনো খরচ নেই।</td></tr>}
              </tbody></table>
            </div>
            <div className="card">
              <h3>ক্যাশবুক</h3>
              <table>
                <thead><tr><th>একাউন্ট</th><th className="num">জমা</th><th className="num">খরচ</th><th className="num">বর্তমান</th></tr></thead>
                <tbody>
                  {data.cashbook.accounts.map((a) => (
                    <tr key={a.id}><td>{a.name}</td><td className="num ok-text">{money(a.cashIn)}</td><td className="num warn">{money(a.cashOut)}</td><td className="num b">{money(a.balance)}</td></tr>
                  ))}
                </tbody>
              </table>
              <table>
                <tbody>
                  {data.cashbook.byType.map((t) => (
                    <tr key={`${t.refType}-${t.direction}`}>
                      <td>{REF_TYPE_BN[t.refType] ?? t.refType}</td>
                      <td className={t.direction === 'in' ? 'num ok-text' : 'num warn'}>{t.direction === 'in' ? '+' : '-'}{money(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
