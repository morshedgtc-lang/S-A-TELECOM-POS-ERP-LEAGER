import { useEffect, useState } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import { AgeChip, CollectModal, sendReminder, StatementModal } from '../components/DealerTools';
import { t } from '../i18n';
import type { DueRow } from '../types';

export default function Dues() {
  const { can } = useAuth();
  const [rows, setRows] = useState<DueRow[]>([]);
  const [dealersOnly, setDealersOnly] = useState(false);
  const [q, setQ] = useState('');
  const [statementId, setStatementId] = useState<number | null>(null);
  const [collecting, setCollecting] = useState<DueRow | null>(null);
  const [error, setError] = useState('');

  const reload = () => api<DueRow[]>('GET', '/customers/dues').then(setRows).catch((e: Error) => setError(e.message));
  useEffect(() => { reload(); }, []);

  const shown = rows.filter((r) => (!dealersOnly || r.customerType === 'wholesaler')
    && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()) || (r.mobile ?? '').includes(q.trim())));
  const total = rows.reduce((s, r) => s + r.balance, 0);
  const dealerTotal = rows.filter((r) => r.customerType === 'wholesaler').reduce((s, r) => s + r.balance, 0);

  return (
    <section>
      <div className="toolbar">
        <h2><i className="fa-solid fa-hand-holding-dollar" /> {t('বকেয়া আদায় তালিকা')}</h2>
        <div className="inline">
          <input placeholder={t('নাম বা মোবাইল')} value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="check"><input type="checkbox" checked={dealersOnly} onChange={(e) => setDealersOnly(e.target.checked)} /> {t('শুধু ডিলার')}</label>
        </div>
      </div>

      <div className="hero hero-purple compact">
        <div className="tiles">
          <div className="tile"><div className="tile-value">৳{money(total)}</div><div className="tile-label">{t('মোট পাওনা')}</div></div>
          <div className="tile"><div className="tile-value">৳{money(dealerTotal)}</div><div className="tile-label">{t('ডিলারদের কাছে')}</div></div>
          <div className="tile"><div className="tile-value">{rows.filter((r) => r.overLimit).length}</div><div className="tile-label">{t('লিমিট পার')}</div></div>
          <div className="tile"><div className="tile-value">{rows.filter((r) => r.oldestDays >= 30).length}</div><div className="tile-label">{t('৩০+ দিন বাকি')}</div></div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      <div className="due-list">
        {shown.map((r) => (
          <div key={r.id} className={r.overLimit ? 'due-card over' : 'due-card'}>
            <div className="due-main">
              <div className="due-name">
                {r.name}
                {r.customerType === 'wholesaler' && <span className="badge dealer">{t('ডিলার')}</span>}
                {r.overLimit && <span className="badge danger">{t('লিমিট পার')}</span>}
              </div>
              <div className="muted">{r.mobile ?? '—'} · {t('{n} টি বিল', { n: r.openBills })} · <AgeChip days={r.oldestDays} /></div>
              {r.creditLimit > 0 && (
                <div className="limit-bar" title={`${money(r.balance)} / ${money(r.creditLimit)}`}>
                  <span style={{ width: `${Math.min(100, (r.balance / r.creditLimit) * 100)}%` }} />
                </div>
              )}
            </div>
            <div className="due-side">
              <div className="due-amount">৳{money(r.balance)}</div>
              <div className="due-actions">
                <button className="ghost" onClick={() => setStatementId(r.id)} title={t('স্টেটমেন্ট')}><i className="fa-solid fa-file-lines" /></button>
                <button className="ghost wa" onClick={() => sendReminder(r).catch((e: Error) => setError(e.message))} title={t('WhatsApp রিমাইন্ডার')}>
                  <i className="fa-brands fa-whatsapp" />
                </button>
                {can('manageMoney') && <button className="btn-rose small" onClick={() => setCollecting(r)}>{t('আদায়')}</button>}
              </div>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="card muted">{t('কারও কাছে বকেয়া নেই।')}</div>}
      </div>

      {statementId !== null && <StatementModal customerId={statementId} onClose={() => setStatementId(null)} />}
      {collecting && (
        <CollectModal customer={collecting} onClose={() => setCollecting(null)} onDone={() => { setCollecting(null); reload(); }} />
      )}
    </section>
  );
}
