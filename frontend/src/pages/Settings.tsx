import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import { fmtDate, ROLE_LABEL, ROLE_RANK } from '../labels';
import { t } from '../i18n';
import { refreshShop } from '../shop';
import type { ShopSettings, StaffUser } from '../types';


export default function Settings() {
  const { can } = useAuth();
  return (
    <section>
      <h2><i className="fa-solid fa-gear" /> {t('শপ সেটিংস ও স্টাফ')}</h2>
      <div className="two-col">
        {can('manageSettings') && <ShopForm />}
        {can('manageStaff') && <Staff />}
      </div>
    </section>
  );
}

function ShopForm() {
  const [f, setF] = useState<ShopSettings | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { api<ShopSettings>('GET', '/settings').then(setF); }, []);
  if (!f) return <div className="card muted">{t('লোড হচ্ছে…')}</div>;
  const set = (k: keyof ShopSettings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const saved = await api<ShopSettings>('PATCH', '/settings', f);
      refreshShop(saved);
      setMessage({ ok: true, text: t('সংরক্ষিত হয়েছে') });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>{t('দোকানের তথ্য (প্রিন্টে দেখাবে)')}</h3>
      <label>{t('দোকানের নাম')}<input value={f.shopName} onChange={set('shopName')} /></label>
      <label>{t('মোবাইল')}<input value={f.shopPhone} onChange={set('shopPhone')} /></label>
      <label>{t('ঠিকানা')}<input value={f.shopAddress} onChange={set('shopAddress')} /></label>
      <label>{t('ইনভয়েস ফুটার')}<input value={f.invoiceFooter} onChange={set('invoiceFooter')} /></label>
      <label>{t('সার্ভিস শর্তাবলী (জব কার্ডে)')}
        <textarea rows={3} value={f.repairTerms} onChange={set('repairTerms')} placeholder={t('৩০ দিনের মধ্যে ডিভাইস না নিলে দোকান দায়ী নয়…')} />
      </label>
      {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}
      <button className="primary">{t('সেভ')}</button>
    </form>
  );
}

function Staff() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [f, setF] = useState({ id: '', name: '', mobile: '', password: '', role: 'staff', basicSalary: '' });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = () => api<StaffUser[]>('GET', '/users').then(setUsers);
  useEffect(() => { load(); }, []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function create(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api('POST', '/users', { ...f, basicSalary: Number(f.basicSalary) || 0 });
      setF({ id: '', name: '', mobile: '', password: '', role: 'staff', basicSalary: '' });
      setMessage({ ok: true, text: t('স্টাফ তৈরি হয়েছে') });
      load();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' });
    }
  }

  async function toggle(u: StaffUser) {
    try {
      await api('PATCH', `/users/${encodeURIComponent(u.id)}`, { active: !u.active });
      load();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' });
    }
  }

  async function resetPassword(u: StaffUser) {
    const password = window.prompt(t('{name} এর নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)', { name: u.name }));
    if (!password) return;
    try {
      await api('PATCH', `/users/${encodeURIComponent(u.id)}`, { password });
      setMessage({ ok: true, text: t('পাসওয়ার্ড পরিবর্তন হয়েছে') });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' });
    }
  }

  return (
    <div className="card">
      <h3>{t('স্টাফ')}</h3>
      {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}
      <table>
        <thead><tr><th>ID</th><th>{t('নাম')}</th><th>{t('রোল')}</th><th className="num">{t('বেতন')}</th><th>{t('শেষ লগইন')}</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'inactive'}>
              <td>{u.id}</td><td>{u.name}</td><td><span className={`role-chip role-${u.role}`}>{t(ROLE_LABEL[u.role])}</span></td><td className="num">{money(u.basicSalary)}</td>
              <td>{fmtDate(u.lastLoginAt)}</td>
              <td className="nowrap">
                {u.id !== me?.id && (me?.role === 'owner' || ROLE_RANK[u.role] < ROLE_RANK[me?.role ?? 'staff']) && (
                  <button className="ghost" onClick={() => resetPassword(u)} title="Password"><i className="fa-solid fa-key" /></button>
                )}
                {u.id !== me?.id && (me?.role === 'owner' || ROLE_RANK[u.role] < ROLE_RANK[me?.role ?? 'staff']) && <button className="ghost" onClick={() => toggle(u)}>{u.active ? t('ব্লক') : t('চালু')}</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={create}>
        <h4>{t('নতুন স্টাফ')}</h4>
        <div className="form-grid">
          <label>{t('লগইন ID')}<input required value={f.id} onChange={set('id')} /></label>
          <label>{t('নাম')}<input required value={f.name} onChange={set('name')} /></label>
          <label>{t('মোবাইল')}<input value={f.mobile} onChange={set('mobile')} /></label>
          <label>{t('পাসওয়ার্ড')}<input required type="password" minLength={6} value={f.password} onChange={set('password')} autoComplete="new-password" /></label>
          <label>{t('রোল')}
            <select value={f.role} onChange={set('role')}>
              {(['staff', 'manager', 'admin', 'owner'] as const)
                .filter((r) => me?.role === 'owner' || (me && ROLE_RANK[r] < ROLE_RANK[me.role]))
                .map((r) => <option key={r} value={r}>{t(ROLE_LABEL[r])}</option>)}
            </select>
          </label>
          <label>{t('মাসিক বেতন')}<input type="number" min="0" value={f.basicSalary} onChange={set('basicSalary')} /></label>
        </div>
        <button className="primary">{t('স্টাফ তৈরি')}</button>
      </form>
    </div>
  );
}
