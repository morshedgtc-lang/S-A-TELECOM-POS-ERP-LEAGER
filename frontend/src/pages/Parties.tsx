import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import { CollectModal, DealerSettingsModal, sendReminder, StatementModal } from '../components/DealerTools';
import type { Account, Party } from '../types';
import { t } from '../i18n';

type Kind = 'customers' | 'suppliers';

export default function Parties() {
  const { can } = useAuth();
  const [kind, setKind] = useState<Kind>('customers');
  const [list, setList] = useState<Party[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<Party | null>(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ name: '', mobile: '', type: 'retail', creditLimit: '', dealerDiscount: '' });
  const [settleAmount, setSettleAmount] = useState('');
  const [settleAccount, setSettleAccount] = useState('');
  const [modal, setModal] = useState<'statement' | 'collect' | 'settings' | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const reload = () => api<Party[]>('GET', `/${kind}`).then((rows) => {
    setList(rows);
    setSelected((s) => (s ? rows.find((r) => r.id === s.id) ?? null : null));
  });

  useEffect(() => {
    setSelected(null);
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
      await api('POST', `/${kind}`, isCustomer
        ? { name: form.name, mobile: form.mobile || null, customerType: form.type, creditLimit: Number(form.creditLimit) || 0, dealerDiscount: Number(form.dealerDiscount) || 0 }
        : { name: form.name, mobile: form.mobile || null });
      setForm({ name: '', mobile: '', type: 'retail', creditLimit: '', dealerDiscount: '' });
      reload();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Save failed' });
    }
  }

  /** Supplier payment (customers use the bill-by-bill collect window). */
  async function paySupplier() {
    if (!selected) return;
    setMessage(null);
    try {
      const r = await api<{ balance: number }>('POST', `/suppliers/${selected.id}/settlements`, {
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
  const shown = list.filter((p) => !filter.trim()
    || p.name.toLowerCase().includes(filter.trim().toLowerCase()) || (p.mobile ?? '').includes(filter.trim()));
  const overLimit = (p: Party) => (p.creditLimit ?? 0) > 0 && p.balance > (p.creditLimit ?? 0);

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
          <input className="list-filter" placeholder={t('নাম বা মোবাইল')} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <table>
            <thead>
              <tr><th>{t('নাম')}</th><th>{t('মোবাইল')}</th>{isCustomer && <th className="num">{t('লিমিট')}</th>}<th className="num">{t('বাকি')}</th></tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className={selected?.id === p.id ? 'selected clickable' : 'clickable'} onClick={() => setSelected(p)}>
                  <td>{p.name}{p.customerType === 'wholesaler' && <span className="badge dealer">{t('ডিলার')}</span>}</td>
                  <td>{p.mobile ?? '—'}</td>
                  {isCustomer && <td className="num muted">{p.creditLimit ? money(p.creditLimit) : '—'}</td>}
                  <td className={overLimit(p) ? 'num b danger-text' : 'num'}>{money(p.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {selected && isCustomer && (
            <div className="settle">
              <h3>{selected.name}{selected.customerType === 'wholesaler' && <span className="badge dealer">{t('ডিলার')}</span>}</h3>
              <div className="muted">
                {t('বাকি')}: <b>৳{money(selected.balance)}</b>
                {(selected.creditLimit ?? 0) > 0 && <> · {t('লিমিট')}: ৳{money(selected.creditLimit)}</>}
                {(selected.dealerDiscount ?? 0) > 0 && <> · {t('সার্ভিস ছাড়')}: {selected.dealerDiscount}%</>}
              </div>
              <div className="action-bar">
                <button className="ghost" onClick={() => setModal('statement')}><i className="fa-solid fa-file-lines" /> {t('স্টেটমেন্ট')}</button>
                {selected.balance > 0 && (
                  <button className="ghost wa" onClick={() => sendReminder(selected).catch((e: Error) => setMessage({ kind: 'error', text: e.message }))}>
                    <i className="fa-brands fa-whatsapp" /> {t('রিমাইন্ডার')}
                  </button>
                )}
                {can('manageMoney') && selected.balance > 0 && (
                  <button className="btn-rose small" onClick={() => setModal('collect')}><i className="fa-solid fa-hand-holding-dollar" /> {t('আদায়')}</button>
                )}
                {can('manageParties') && (
                  <button className="ghost" onClick={() => setModal('settings')}><i className="fa-solid fa-sliders" /> {t('ডিলার সেটিংস')}</button>
                )}
              </div>
            </div>
          )}

          {selected && !isCustomer && can('manageMoney') && (
            <div className="settle">
              <h3>{t('{name} কে পেমেন্ট', { name: selected.name })}</h3>
              <div className="row">
                <label>{t('পরিমাণ')}<input type="number" min="0" value={settleAmount} onChange={(e) => setSettleAmount(e.target.value)} /></label>
                <label>{t('একাউন্ট')}
                  <select value={settleAccount} onChange={(e) => setSettleAccount(e.target.value)}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </div>
              <button className="primary" onClick={paySupplier}>{t('পেমেন্ট সেভ')}</button>
            </div>
          )}
        </div>

        {can('manageParties') && (
          <form className="card" onSubmit={addParty}>
            <h3>{isCustomer ? t('নতুন কাস্টমার') : t('নতুন সাপ্লায়ার')}</h3>
            <label>{t('নাম')}<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>{t('মোবাইল')}<input value={form.mobile} inputMode="tel" onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></label>
            {isCustomer && (
              <>
                <label>{t('ধরন')}
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="retail">{t('সাধারণ কাস্টমার')}</option>
                    <option value="wholesaler">{t('ডিলার / দোকান / কারিগর')}</option>
                  </select>
                </label>
                {form.type === 'wholesaler' && (
                  <div className="row">
                    <label>{t('ক্রেডিট লিমিট')}<input type="number" min="0" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} /></label>
                    <label>{t('সার্ভিস ছাড় %')}<input type="number" min="0" max="100" value={form.dealerDiscount} onChange={(e) => setForm({ ...form, dealerDiscount: e.target.value })} /></label>
                  </div>
                )}
              </>
            )}
            <button className="primary">{t('সেভ')}</button>
          </form>
        )}
      </div>

      {selected && modal === 'statement' && <StatementModal customerId={selected.id} onClose={() => setModal(null)} />}
      {selected && modal === 'collect' && (
        <CollectModal customer={selected} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />
      )}
      {selected && modal === 'settings' && (
        <DealerSettingsModal party={selected} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
    </section>
  );
}
