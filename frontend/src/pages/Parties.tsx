import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import type { Account, Party } from '../types';
import { t } from '../i18n';

type Kind = 'customers' | 'suppliers';

export default function Parties() {
  const { can } = useAuth();
  const [kind, setKind] = useState<Kind>('customers');
  const [list, setList] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<Party | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [settleAmount, setSettleAmount] = useState('');
  const [settleAccount, setSettleAccount] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const reload = () => api<Party[]>('GET', `/${kind}`).then((rows) => { setList(rows); setSelected(null); });

  useEffect(() => {
    reload();
    api<Account[]>('GET', '/accounts').then((a) => {
      setAccounts(a);
      if (a[0]) setSettleAccount(String(a[0].id));
    });
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addParty(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api('POST', `/${kind}`, { name, mobile: mobile || null });
      setName('');
      setMobile('');
      reload();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    }
  }

  async function settle() {
    if (!selected) return;
    setMessage(null);
    try {
      const r = await api<{ balance: number }>('POST', `/${kind}/${selected.id}/settlements`, {
        amount: Number(settleAmount),
        accountId: Number(settleAccount),
      });
      setMessage({ kind: 'ok', text: t('সেভ হয়েছে। নতুন বাকি: ৳{amount}', { amount: money(r.balance) }) });
      setSettleAmount('');
      reload();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Settlement failed' });
    }
  }

  const isCustomer = kind === 'customers';

  return (
    <section>
      <div className="toolbar">
        <h2>{isCustomer ? t('কাস্টমার খাতা ও বাকি') : t('সাপ্লায়ার লেজার')}</h2>
        <div className="tabs">
          <button className={isCustomer ? 'nav active' : 'nav'} onClick={() => setKind('customers')}>{t('কাস্টমার')}</button>
          <button className={!isCustomer ? 'nav active' : 'nav'} onClick={() => setKind('suppliers')}>{t('সাপ্লায়ার')}</button>
        </div>
      </div>
      {message && <div className={message.kind === 'ok' ? 'ok' : 'error'}>{message.text}</div>}

      <div className="two-col">
        <div className="card">
          <table>
            <thead><tr><th>{t('নাম')}</th><th>{t('মোবাইল')}</th><th className="num">{t('বাকি')}</th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={selected?.id === p.id ? 'selected' : ''} onClick={() => setSelected(p)}>
                  <td>{p.name}</td><td>{p.mobile ?? '—'}</td><td className="num">{money(p.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {selected && can('manageMoney') && (
            <div className="settle">
              <h3>{isCustomer ? t('{name} থেকে বাকি আদায়', { name: selected.name }) : t('{name} কে পেমেন্ট', { name: selected.name })}</h3>
              <div className="row">
                <label>{t('পরিমাণ')}<input type="number" min="0" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} /></label>
                <label>{t('একাউন্ট')}
                  <select value={settleAccount} onChange={(e) => setSettleAccount(e.target.value)}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </div>
              <button className="primary" onClick={settle}>{isCustomer ? t('আদায় সেভ') : t('পেমেন্ট সেভ')}</button>
            </div>
          )}
        </div>

        {can('manageParties') && (
          <form className="card" onSubmit={addParty}>
            <h3>{isCustomer ? t('নতুন কাস্টমার') : t('নতুন সাপ্লায়ার')}</h3>
            <label>{t('নাম')}<input required value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>{t('মোবাইল')}<input value={mobile} onChange={(e) => setMobile(e.target.value)} /></label>
            <button className="primary">{t('সেভ')}</button>
          </form>
        )}
      </div>
    </section>
  );
}
