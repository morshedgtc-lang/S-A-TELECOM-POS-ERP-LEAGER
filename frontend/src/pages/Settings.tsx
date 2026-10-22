import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import { fmtDate } from '../labels';
import { refreshShop } from '../shop';
import type { ShopSettings, StaffUser } from '../types';

const ROLE_BN = { owner: 'মালিক', manager: 'ম্যানেজার', staff: 'স্টাফ' };

export default function Settings() {
  const { can } = useAuth();
  return (
    <section>
      <h2><i className="fa-solid fa-gear" /> শপ সেটিংস ও স্টাফ</h2>
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
  if (!f) return <div className="card muted">লোড হচ্ছে…</div>;
  const set = (k: keyof ShopSettings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const saved = await api<ShopSettings>('PATCH', '/settings', f);
      refreshShop(saved);
      setMessage({ ok: true, text: 'সংরক্ষিত হয়েছে' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Save failed' });
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>দোকানের তথ্য (প্রিন্টে দেখাবে)</h3>
      <label>দোকানের নাম<input value={f.shopName} onChange={set('shopName')} /></label>
      <label>মোবাইল<input value={f.shopPhone} onChange={set('shopPhone')} /></label>
      <label>ঠিকানা<input value={f.shopAddress} onChange={set('shopAddress')} /></label>
      <label>ইনভয়েস ফুটার<input value={f.invoiceFooter} onChange={set('invoiceFooter')} /></label>
      <label>সার্ভিস শর্তাবলী (জব কার্ডে)
        <textarea rows={3} value={f.repairTerms} onChange={set('repairTerms')} placeholder="৩০ দিনের মধ্যে ডিভাইস না নিলে দোকান দায়ী নয়…" />
      </label>
      {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}
      <button className="primary">সেভ</button>
    </form>
  );
}

function Staff() {
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
      setMessage({ ok: true, text: 'স্টাফ তৈরি হয়েছে' });
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
    const password = window.prompt(`${u.name} এর নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)`);
    if (!password) return;
    try {
      await api('PATCH', `/users/${encodeURIComponent(u.id)}`, { password });
      setMessage({ ok: true, text: 'পাসওয়ার্ড পরিবর্তন হয়েছে' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' });
    }
  }

  return (
    <div className="card">
      <h3>স্টাফ</h3>
      {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}
      <table>
        <thead><tr><th>ID</th><th>নাম</th><th>রোল</th><th className="num">বেতন</th><th>শেষ লগইন</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={u.active ? '' : 'inactive'}>
              <td>{u.id}</td><td>{u.name}</td><td>{ROLE_BN[u.role]}</td><td className="num">{money(u.basicSalary)}</td>
              <td>{fmtDate(u.lastLoginAt)}</td>
              <td className="nowrap">
                <button className="ghost" onClick={() => resetPassword(u)} title="Password"><i className="fa-solid fa-key" /></button>
                {u.role !== 'owner' && <button className="ghost" onClick={() => toggle(u)}>{u.active ? 'ব্লক' : 'চালু'}</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={create}>
        <h4>নতুন স্টাফ</h4>
        <div className="form-grid">
          <label>লগইন ID<input required value={f.id} onChange={set('id')} /></label>
          <label>নাম<input required value={f.name} onChange={set('name')} /></label>
          <label>মোবাইল<input value={f.mobile} onChange={set('mobile')} /></label>
          <label>পাসওয়ার্ড<input required type="password" minLength={6} value={f.password} onChange={set('password')} autoComplete="new-password" /></label>
          <label>রোল
            <select value={f.role} onChange={set('role')}>
              <option value="staff">স্টাফ (বিক্রয় + সার্ভিস)</option>
              <option value="manager">ম্যানেজার</option>
            </select>
          </label>
          <label>মাসিক বেতন<input type="number" min="0" value={f.basicSalary} onChange={set('basicSalary')} /></label>
        </div>
        <button className="primary">স্টাফ তৈরি</button>
      </form>
    </div>
  );
}
