import { useEffect, useState } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import { STATUS } from '../labels';
import type { Dashboard as DashboardData } from '../types';
import { t } from '../i18n';

const ACCOUNT_ICON = { cash: 'fa-money-bill', bank: 'fa-building-columns', mobile_wallet: 'fa-mobile-screen' };

export default function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { can } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<DashboardData>('GET', '/dashboard').then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="muted">Loading dashboard…</div>;

  const totalCash = data.accounts.reduce((s, a) => s + a.balance, 0);
  const r = data.repairs;

  return (
    <section className="dash">
      <div className="hero hero-green">
        <div className="hero-title"><i className="fa-solid fa-money-bill-1" /> TOTAL CASH</div>
        <div className="hero-amount">৳ {money(totalCash)}</div>
        <div className="hero-rows">
          {data.accounts.map((a) => (
            <div key={a.id}>
              <span><i className={`fa-solid ${ACCOUNT_ICON[a.accountType]}`} /> {a.name}</span>
              <span>৳ {money(a.balance)}</span>
            </div>
          ))}
          <div>
            <span><i className="fa-solid fa-chart-line" /> Today (sales + service)</span>
            <span>{t('+৳')} {money(data.today.salesTotal + r.deliveredToday.total)}</span>
          </div>
        </div>
      </div>

      <div className="hero hero-violet">
        <div className="hero-title"><i className="fa-solid fa-circle-pause" /> HOLD AMOUNT (In Work + Out Work + Success + Unsuccess)</div>
        <div className="hero-amount">৳ {money(r.holdTotal)}</div>
        <div className="hero-rows">
          {(['in_work', 'out_work', 'success', 'failed'] as const).map((s) => (
            <div key={s}>
              <span><span className="dot" style={{ background: STATUS[s].color }} /> {STATUS[s].label}</span>
              <span>৳ {money(r.byStatus[s].estimated)}</span>
            </div>
          ))}
          <div><span><i className="fa-solid fa-hand-holding-dollar" /> {t('অগ্রিম জমা')}</span><span>৳ {money(r.advanceHeld)}</span></div>
        </div>
      </div>

      <div className="hero hero-blue">
        <div className="hero-title spread">
          <span><i className="fa-solid fa-list-check" /> SERVICE / SALE TRACK</span>
          <button className="link-btn" onClick={() => onNavigate('repairs')}>{t('বিস্তারিত')} <i className="fa-solid fa-arrow-right" /></button>
        </div>
        <div className="tiles">
          <Tile value={String(r.byStatus.in_work.count)} label="In Work" dot={STATUS.in_work.color} />
          <Tile value={String(r.byStatus.out_work.count)} label="Out Work" dot={STATUS.out_work.color} />
          <Tile value={String(r.byStatus.success.count + r.byStatus.failed.count)} label="Ready (Success/Unsuccess)" dot={STATUS.success.color} />
          <Tile value={String(r.deliveredToday.count)} label={t('আজ Delivered')} dot={STATUS.delivered.color} />
        </div>
      </div>

      <div className="hero hero-purple">
        <div className="hero-title spread">
          <span><i className="fa-solid fa-screwdriver-wrench" /> OUT-WORK</span>
          <button className="link-btn" onClick={() => onNavigate('technicians')}>{t('ম্যানেজ')} <i className="fa-solid fa-arrow-right" /></button>
        </div>
        <div className="tiles">
          <Tile value={String(r.technicians)} label={t('কারিগর')} />
          <Tile value={String(r.byStatus.out_work.count)} label={t('চলমান')} />
          <Tile value={`৳${money(r.technicianPayable)}`} label={t('বকেয়া')} />
        </div>
      </div>

      <div className="hero hero-teal">
        <div className="hero-title"><i className="fa-solid fa-cash-register" /> {t('আজকের বিক্রয়')}</div>
        <div className="tiles">
          <Tile value={String(data.today.salesCount)} label={t('ইনভয়েস')} />
          <Tile value={`৳${money(data.today.salesTotal)}`} label={t('বিক্রয়')} />
          <Tile value={`৳${money(data.today.salesDue)}`} label={t('বাকি')} />
          <Tile value={`৳${money(data.today.expenses)}`} label={t('খরচ')} />
          {can('viewProfit') && data.today.grossProfit !== undefined && (
            <Tile value={`৳${money(data.today.grossProfit)}`} label={t('আজকের নিট লাভ')} />
          )}
        </div>
      </div>

      <div className="two-col">
        <div className="card plain-card">
          <div>
            <div className="plain-title">{t('পার্টি খাতা')}</div>
            <div className="plain-amount">{t('পাবো ৳')} {money(data.receivable)}</div>
            <div className="muted">{t('দেবো (সাপ্লায়ার) ৳')} {money(data.payable)}</div>
          </div>
          <i className="fa-solid fa-scale-balanced plain-icon" />
        </div>
        <div className="card">
          <h3>{t('স্টক কম (')}{data.lowStock.length})</h3>
          {data.lowStock.length === 0 ? <p className="muted">{t('সব পণ্যের স্টক ঠিক আছে।')}</p> : (
            <table>
              <tbody>
                {data.lowStock.map((p) => (
                  <tr key={p.id}><td>{p.name}</td><td className="num warn">{p.stock} / {p.lowStockLimit}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

function Tile({ value, label, dot }: { value: string; label: string; dot?: string }) {
  return (
    <div className="tile">
      <div className="tile-value">{value}</div>
      <div className="tile-label">{dot && <span className="dot" style={{ background: dot }} />}{label}</div>
    </div>
  );
}
