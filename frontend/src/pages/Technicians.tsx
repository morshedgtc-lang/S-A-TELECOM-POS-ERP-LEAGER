import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import { fmtDate } from '../labels';
import type { Account, TechLedgerRow, Technician } from '../types';
import { t } from '../i18n';

const KIND_BN = { opening: 'ওপেনিং বকেয়া', job: 'কাজ', payment: 'পরিশোধ', adjustment: 'সমন্বয়' };

export default function Technicians() {
  const { can } = useAuth();
  const [techs, setTechs] = useState<Technician[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Technician | null>(null);
  const [error, setError] = useState('');

  const reload = () => api<Technician[]>('GET', '/technicians').then(setTechs).catch((e: Error) => setError(e.message));
  useEffect(() => { reload(); }, []);

  const totalDue = techs.reduce((s, tech) => s + tech.balance, 0);

  return (
    <section>
      <div className="toolbar">
        <h2><i className="fa-solid fa-user-gear" /> {t('কারিগর আউট-ওয়ার্ক')}</h2>
        {can('manageRepairs') && <button className="btn-accent" onClick={() => setShowNew(true)}><i className="fa-solid fa-plus" /> {t('কারিগর যোগ')}</button>}
      </div>
      <div className="hero hero-purple compact">
        <div className="tiles">
          <div className="tile"><div className="tile-value">{techs.filter((tech) => tech.active).length}</div><div className="tile-label">{t('সক্রিয় কারিগর')}</div></div>
          <div className="tile"><div className="tile-value">{techs.reduce((s, tech) => s + tech.openJobs, 0)}</div><div className="tile-label">{t('চলমান কাজ')}</div></div>
          <div className="tile"><div className="tile-value">৳{money(totalDue)}</div><div className="tile-label">{t('মোট বকেয়া মজুরি')}</div></div>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>{t('নাম')}</th><th>{t('মোবাইল')}</th><th>{t('দক্ষতা')}</th><th className="num">{t('চলমান')}</th><th className="num">{t('বকেয়া')}</th><th /></tr></thead>
          <tbody>
            {techs.map((tech) => (
              <tr key={tech.id} className={tech.active ? '' : 'inactive'}>
                <td>{tech.name}{tech.shopName && <small className="muted"> · {tech.shopName}</small>}{!tech.active && <span className="badge">Inactive</span>}</td>
                <td>{tech.mobile ?? '—'}</td>
                <td>{tech.specialties ?? '—'}</td>
                <td className="num">{tech.openJobs}</td>
                <td className="num b">{money(tech.balance)}</td>
                <td><button className="ghost" onClick={() => setSelected(tech)}>{t('খাতা / পরিশোধ')}</button></td>
              </tr>
            ))}
            {techs.length === 0 && <tr><td colSpan={6} className="muted">{t('এখনো কোনো কারিগর নেই।')}</td></tr>}
          </tbody>
        </table>
      </div>
      {showNew && <NewTechnician onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); reload(); }} />}
      {selected && <TechnicianLedger tech={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    </section>
  );
}

function NewTechnician({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', mobile: '', shopName: '', specialties: '', openingBalance: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('POST', '/technicians', { ...f, openingBalance: Number(f.openingBalance) || 0 });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <Modal title={t('কারিগর যোগ করুন')} onClose={onClose}>
      <form onSubmit={submit}>
        <label>{t('নাম *')}<input required value={f.name} onChange={set('name')} /></label>
        <label>{t('মোবাইল')}<input value={f.mobile} onChange={set('mobile')} /></label>
        <label>{t('দোকান/ওয়ার্কশপ')}<input value={f.shopName} onChange={set('shopName')} /></label>
        <label>{t('দক্ষতা')}<input value={f.specialties} onChange={set('specialties')} placeholder="Display, Board repair" /></label>
        <label>{t('পূর্বের বকেয়া')}<input type="number" min="0" value={f.openingBalance} onChange={set('openingBalance')} /></label>
        {error && <div className="error">{error}</div>}
        <button className="primary">{t('সেভ')}</button>
      </form>
    </Modal>
  );
}

function TechnicianLedger({ tech, onClose, onChanged }: { tech: Technician; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const [rows, setRows] = useState<TechLedgerRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balance, setBalance] = useState(tech.balance);
  const [amount, setAmount] = useState(String(tech.balance || ''));
  const [accountId, setAccountId] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<TechLedgerRow[]>('GET', `/technicians/${tech.id}/ledger`).then(setRows);
  useEffect(() => {
    load();
    api<Account[]>('GET', '/accounts').then((a) => { setAccounts(a); if (a[0]) setAccountId(String(a[0].id)); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay() {
    setMessage(null);
    try {
      const r = await api<{ balance: number }>('POST', `/technicians/${tech.id}/payments`, { amount: Number(amount), accountId: Number(accountId) });
      setBalance(r.balance);
      setAmount(String(r.balance || ''));
      setMessage({ ok: true, text: t('মজুরি পরিশোধ হয়েছে') });
      load();
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Failed' });
    }
  }

  async function toggleActive() {
    await api('PATCH', `/technicians/${tech.id}`, { active: !tech.active });
    onChanged();
    onClose();
  }

  return (
    <Modal title={t('{name} — খাতা', { name: tech.name })} onClose={onClose} wide>
      <div className="detail-head">
        <div className="big-due">{t('বকেয়া: ৳')}{money(balance)}</div>
        {can('manageRepairs') && <button className="ghost" onClick={toggleActive}>{tech.active ? t('Inactive করুন') : t('Active করুন')}</button>}
      </div>
      {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}
      {can('manageMoney') && balance > 0 && (
        <div className="sub-form">
          <div className="form-grid">
            <label>{t('পরিমাণ')}<input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label>{t('যে একাউন্ট থেকে')}
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} {t('(৳')}{money(a.balance)})</option>)}
              </select>
            </label>
          </div>
          <button className="primary" onClick={pay}>{t('মজুরি পরিশোধ')}</button>
        </div>
      )}
      <table>
        <thead><tr><th>{t('তারিখ')}</th><th>{t('ধরন')}</th><th>{t('জব')}</th><th>{t('নোট')}</th><th className="num">{t('পরিমাণ')}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDate(r.createdAt)}</td>
              <td>{t(KIND_BN[r.kind])}</td>
              <td>{r.jobNo ?? '—'}</td>
              <td>{r.note ?? ''}</td>
              <td className={r.amount < 0 ? 'num ok-text' : 'num warn'}>{r.amount < 0 ? '-' : '+'}{money(Math.abs(r.amount))}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="muted">{t('কোনো লেনদেন নেই।')}</td></tr>}
        </tbody>
      </table>
    </Modal>
  );
}
