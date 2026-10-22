import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import { fmtDate } from '../labels';
import type { Account, TechLedgerRow, Technician } from '../types';

const KIND_BN = { opening: 'ওপেনিং বকেয়া', job: 'কাজ', payment: 'পরিশোধ', adjustment: 'সমন্বয়' };

export default function Technicians() {
  const { can } = useAuth();
  const [techs, setTechs] = useState<Technician[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Technician | null>(null);
  const [error, setError] = useState('');

  const reload = () => api<Technician[]>('GET', '/technicians').then(setTechs).catch((e: Error) => setError(e.message));
  useEffect(() => { reload(); }, []);

  const totalDue = techs.reduce((s, t) => s + t.balance, 0);

  return (
    <section>
      <div className="toolbar">
        <h2><i className="fa-solid fa-user-gear" /> কারিগর আউট-ওয়ার্ক</h2>
        {can('manageRepairs') && <button className="btn-accent" onClick={() => setShowNew(true)}><i className="fa-solid fa-plus" /> কারিগর যোগ</button>}
      </div>
      <div className="hero hero-purple compact">
        <div className="tiles">
          <div className="tile"><div className="tile-value">{techs.filter((t) => t.active).length}</div><div className="tile-label">সক্রিয় কারিগর</div></div>
          <div className="tile"><div className="tile-value">{techs.reduce((s, t) => s + t.openJobs, 0)}</div><div className="tile-label">চলমান কাজ</div></div>
          <div className="tile"><div className="tile-value">৳{money(totalDue)}</div><div className="tile-label">মোট বকেয়া মজুরি</div></div>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="card">
        <table>
          <thead><tr><th>নাম</th><th>মোবাইল</th><th>দক্ষতা</th><th className="num">চলমান</th><th className="num">বকেয়া</th><th /></tr></thead>
          <tbody>
            {techs.map((t) => (
              <tr key={t.id} className={t.active ? '' : 'inactive'}>
                <td>{t.name}{t.shopName && <small className="muted"> · {t.shopName}</small>}{!t.active && <span className="badge">Inactive</span>}</td>
                <td>{t.mobile ?? '—'}</td>
                <td>{t.specialties ?? '—'}</td>
                <td className="num">{t.openJobs}</td>
                <td className="num b">{money(t.balance)}</td>
                <td><button className="ghost" onClick={() => setSelected(t)}>খাতা / পরিশোধ</button></td>
              </tr>
            ))}
            {techs.length === 0 && <tr><td colSpan={6} className="muted">এখনো কোনো কারিগর নেই।</td></tr>}
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
    <Modal title="কারিগর যোগ করুন" onClose={onClose}>
      <form onSubmit={submit}>
        <label>নাম *<input required value={f.name} onChange={set('name')} /></label>
        <label>মোবাইল<input value={f.mobile} onChange={set('mobile')} /></label>
        <label>দোকান/ওয়ার্কশপ<input value={f.shopName} onChange={set('shopName')} /></label>
        <label>দক্ষতা<input value={f.specialties} onChange={set('specialties')} placeholder="Display, Board repair" /></label>
        <label>পূর্বের বকেয়া<input type="number" min="0" value={f.openingBalance} onChange={set('openingBalance')} /></label>
        {error && <div className="error">{error}</div>}
        <button className="primary">সেভ</button>
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
      setMessage({ ok: true, text: 'মজুরি পরিশোধ হয়েছে' });
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
    <Modal title={`${tech.name} — খাতা`} onClose={onClose} wide>
      <div className="detail-head">
        <div className="big-due">বকেয়া: ৳{money(balance)}</div>
        {can('manageRepairs') && <button className="ghost" onClick={toggleActive}>{tech.active ? 'Inactive করুন' : 'Active করুন'}</button>}
      </div>
      {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}
      {can('manageMoney') && balance > 0 && (
        <div className="sub-form">
          <div className="form-grid">
            <label>পরিমাণ<input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label>যে একাউন্ট থেকে
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} (৳{money(a.balance)})</option>)}
              </select>
            </label>
          </div>
          <button className="primary" onClick={pay}>মজুরি পরিশোধ</button>
        </div>
      )}
      <table>
        <thead><tr><th>তারিখ</th><th>ধরন</th><th>জব</th><th>নোট</th><th className="num">পরিমাণ</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDate(r.createdAt)}</td>
              <td>{KIND_BN[r.kind]}</td>
              <td>{r.jobNo ?? '—'}</td>
              <td>{r.note ?? ''}</td>
              <td className={r.amount < 0 ? 'num ok-text' : 'num warn'}>{r.amount < 0 ? '-' : '+'}{money(Math.abs(r.amount))}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="muted">কোনো লেনদেন নেই।</td></tr>}
        </tbody>
      </table>
    </Modal>
  );
}
