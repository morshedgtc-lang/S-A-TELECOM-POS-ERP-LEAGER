import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import type { Account, Expense } from '../types';
import { t } from '../i18n';
import { useAuth } from '../auth';

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const isOwner = useAuth().user?.role === 'owner';

  /** Super Admin only: the money goes back to the account it was paid from. */
  async function removeExpense(x: Expense) {
    if (!window.confirm(t('"{name}" খরচটি মুছবেন? ৳{amount} আবার {account} একাউন্টে ফেরত যাবে।', { name: x.category, amount: money(x.amount), account: x.accountName }))) return;
    try {
      await api('DELETE', `/expenses/${x.id}`);
      setMessage({ kind: 'ok', text: t('খরচ মুছে টাকা ফেরত দেওয়া হয়েছে') });
      reload();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
    }
  }

  const reload = () => api<Expense[]>('GET', '/expenses').then(setExpenses).catch((e: Error) =>
    setMessage({ kind: 'error', text: e.message }));

  useEffect(() => {
    reload();
    api<Account[]>('GET', '/accounts').then((a) => {
      setAccounts(a);
      if (a[0]) setAccountId(String(a[0].id));
    });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    try {
      await api('POST', '/expenses', { category, amount: Number(amount), accountId: Number(accountId), note: note || null });
      setCategory('');
      setAmount('');
      setNote('');
      setMessage({ kind: 'ok', text: t('খরচ সেভ হয়েছে') });
      reload();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    }
  }

  return (
    <section>
      <h2><i className="fa-solid fa-wallet" /> {t('খরচ খাতা')}</h2>
      {message && <div className={message.kind === 'ok' ? 'ok' : 'error'}>{message.text}</div>}
      <div className="two-col">
        <div className="card">
          <table>
            <thead><tr><th>{t('তারিখ')}</th><th>{t('খাত')}</th><th>{t('একাউন্ট')}</th><th className="num">{t('পরিমাণ')}</th>{isOwner && <th />}</tr></thead>
            <tbody>
              {expenses.map((x) => (
                <tr key={x.id}>
                  <td>{x.createdAt.slice(0, 10)}</td><td>{x.category}{x.note && <small className="muted"> {x.note}</small>}</td>
                  <td>{x.accountName}</td><td className="num">{money(x.amount)}</td>
                  {isOwner && (
                    <td><button className="ghost danger" title={t('মুছুন')} onClick={() => removeExpense(x)}><i className="fa-solid fa-trash" /></button></td>
                  )}
                </tr>
              ))}
              {expenses.length === 0 && <tr><td colSpan={4} className="muted">{t('এখনো কোনো খরচ নেই।')}</td></tr>}
            </tbody>
          </table>
        </div>
        <form className="card" onSubmit={submit}>
          <h3>{t('নতুন খরচ')}</h3>
          <label>{t('খাত')}<input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t('দোকান ভাড়া, বিদ্যুৎ, যাতায়াত…')} /></label>
          <label>{t('পরিমাণ')}<input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>{t('যে একাউন্ট থেকে')}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label>{t('নোট')}<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="primary">{t('খরচ সেভ')}</button>
        </form>
      </div>
    </section>
  );
}
