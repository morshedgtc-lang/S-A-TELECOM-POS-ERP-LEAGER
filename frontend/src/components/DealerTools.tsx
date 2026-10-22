import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import { t } from '../i18n';
import { fmtDate, todayKey } from '../labels';
import { isNative, shareText } from '../native';
import { getShop } from '../shop';
import type { Account, OpenBill, Party, Statement } from '../types';
import Modal from './Modal';

const KIND_LABEL: Record<Statement['lines'][number]['kind'], string> = {
  sale: 'বিক্রয়',
  repair: 'সার্ভিস',
  collection: 'পেমেন্ট জমা',
  return: 'রিটার্ন',
};

/** Bangladeshi mobile → WhatsApp number (8801XXXXXXXXX). */
export function whatsappNumber(mobile: string | null | undefined): string {
  const d = String(mobile ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('01')) return `88${d}`;
  if (d.length === 13 && d.startsWith('8801')) return d;
  return d;
}

/** Days-overdue chip: green under a week, amber under a month, red after that. */
export function AgeChip({ days }: { days: number }) {
  const cls = days >= 30 ? 'age red' : days >= 7 ? 'age amber' : 'age green';
  return <span className={cls}>{t('{n} দিন', { n: days })}</span>;
}

/** Opens WhatsApp with the due amount and the unpaid bills, in the current language. */
export async function sendReminder(customer: { id: number; name: string; mobile: string | null; balance: number }) {
  const [shop, bills] = await Promise.all([getShop(), api<OpenBill[]>('GET', `/customers/${customer.id}/open-bills`)]);
  const lines = bills.map((b) => `• ${b.ref} (${fmtDate(b.date, false)}) — ৳${money(b.remaining)}`);
  const text = [
    t('আসসালামু আলাইকুম {name},', { name: customer.name }),
    t('{shop} এ আপনার মোট বকেয়া: ৳{amount}', { shop: shop.shopName, amount: money(customer.balance) }),
    ...(lines.length ? ['', ...lines] : []),
    '',
    t('অনুগ্রহ করে সুবিধামতো সময়ে পরিশোধ করুন। ধন্যবাদ।'),
    shop.shopPhone ? `${shop.shopName} · ${shop.shopPhone}` : shop.shopName,
  ].join('\n');
  const number = whatsappNumber(customer.mobile);
  if (number) window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, '_blank');
  else if (isNative) await shareText(t('বকেয়া রিমাইন্ডার'), text);
  else await navigator.clipboard?.writeText(text).then(() => alert(t('মোবাইল নম্বর নেই — মেসেজ কপি করা হয়েছে')));
}

export function StatementModal({ customerId, onClose }: { customerId: number; onClose: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayKey());
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    api<Statement>('GET', `/customers/${customerId}/statement?${q}`).then(setData).catch((e: Error) => setError(e.message));
  }, [customerId, from, to]);

  async function output() {
    if (!data) return;
    const shop = await getShop();
    const rows = data.lines.map((l) => [fmtDate(l.date, false), t(KIND_LABEL[l.kind]), l.ref, money(l.debit), money(l.credit), money(l.balance)]);
    if (isNative) {
      const text = [
        shop.shopName, `${t('স্টেটমেন্ট')}: ${data.customer.name}`, `${t('শুরুর বকেয়া')}: ৳${money(data.opening)}`, '',
        ...rows.map((r) => `${r[0]} ${r[1]} ${r[2]}  +${r[3]} -${r[4]} = ${r[5]}`),
        '', `${t('শেষ বকেয়া')}: ৳${money(data.closing)}`,
      ].join('\n');
      await shareText(t('স্টেটমেন্ট'), text);
      return;
    }
    const esc = (v: string) => v.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(data.customer.name)}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;margin:24px}h1{font-size:20px;margin:0}
      table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left}
      td.n,th.n{text-align:right}.b{font-weight:700}</style></head><body>
      <h1>${esc(shop.shopName)}</h1><div>${esc(shop.shopAddress)} ${esc(shop.shopPhone)}</div>
      <h2>${esc(t('স্টেটমেন্ট'))}: ${esc(data.customer.name)} ${esc(data.customer.mobile ?? '')}</h2>
      <div>${esc(data.from ?? '…')} → ${esc(data.to ?? '…')}</div>
      <table><thead><tr><th>${esc(t('তারিখ'))}</th><th>${esc(t('ধরন'))}</th><th>Ref</th><th class="n">${esc(t('বিল'))}</th><th class="n">${esc(t('জমা'))}</th><th class="n">${esc(t('বকেয়া'))}</th></tr></thead>
      <tbody><tr><td colspan="5" class="b">${esc(t('শুরুর বকেয়া'))}</td><td class="n b">${money(data.opening)}</td></tr>
      ${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td class="n">${r[3]}</td><td class="n">${r[4]}</td><td class="n">${r[5]}</td></tr>`).join('')}
      <tr><td colspan="5" class="b">${esc(t('শেষ বকেয়া'))}</td><td class="n b">${money(data.closing)}</td></tr></tbody></table>
      <script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
    w.document.close();
  }

  return (
    <Modal title={data ? `${t('স্টেটমেন্ট')} — ${data.customer.name}` : t('স্টেটমেন্ট')} onClose={onClose} wide>
      <div className="filters">
        <label>{t('থেকে')}<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>{t('পর্যন্ত')}<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="ghost" onClick={output} disabled={!data}>
          <i className={isNative ? 'fa-solid fa-share-nodes' : 'fa-solid fa-print'} /> {isNative ? t('শেয়ার') : t('প্রিন্ট')}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {data && (
        <>
          <div className="stat-strip">
            <div><span>{t('শুরুর বকেয়া')}</span><b>৳{money(data.opening)}</b></div>
            <div><span>{t('বিল')}</span><b>৳{money(data.totalDebit)}</b></div>
            <div><span>{t('জমা')}</span><b className="ok-text">৳{money(data.totalCredit)}</b></div>
            <div><span>{t('শেষ বকেয়া')}</span><b className={data.closing > 0 ? 'warn' : ''}>৳{money(data.closing)}</b></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{t('তারিখ')}</th><th>{t('ধরন')}</th><th>Ref</th><th className="num">{t('বিল')}</th><th className="num">{t('জমা')}</th><th className="num">{t('বকেয়া')}</th></tr></thead>
              <tbody>
                {data.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="nowrap">{fmtDate(l.date, false)}</td>
                    <td><span className={`kind kind-${l.kind}`}>{t(KIND_LABEL[l.kind])}</span></td>
                    <td>{l.ref}{l.note && <div className="muted">{l.note}</div>}</td>
                    <td className="num">{l.debit ? money(l.debit) : ''}</td>
                    <td className="num ok-text">{l.credit ? money(l.credit) : ''}</td>
                    <td className="num b">{money(l.balance)}</td>
                  </tr>
                ))}
                {data.lines.length === 0 && <tr><td colSpan={6} className="muted">{t('এই সময়ে কোনো লেনদেন নেই।')}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Take money from a customer: tick the bills it pays, or enter an amount for the oldest bills. */
export function CollectModal({ customer, onClose, onDone }: {
  customer: { id: number; name: string; balance: number };
  onClose: () => void;
  onDone: () => void;
}) {
  const [bills, setBills] = useState<OpenBill[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const key = (b: OpenBill) => `${b.docType}:${b.docId}`;

  useEffect(() => {
    api<OpenBill[]>('GET', `/customers/${customer.id}/open-bills`).then(setBills);
    api<Account[]>('GET', '/accounts').then((a) => { setAccounts(a); if (a[0]) setAccountId(String(a[0].id)); });
  }, [customer.id]);

  const pickedTotal = useMemo(() => Object.values(picked).reduce((s, v) => s + (Number(v) || 0), 0), [picked]);
  const usingPicks = Object.keys(picked).length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = usingPicks
        ? {
          accountId: Number(accountId),
          allocations: bills.filter((b) => picked[key(b)] !== undefined)
            .map((b) => ({ docType: b.docType, docId: b.docId, amount: Number(picked[key(b)]) || 0 })),
        }
        : { accountId: Number(accountId), amount: Number(amount) };
      await api('POST', `/customers/${customer.id}/settlements`, body);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`${t('বকেয়া আদায়')} — ${customer.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="big-due">{t('মোট বকেয়া')}: ৳{money(customer.balance)}</div>
        <p className="muted">{t('যে বিলগুলোর টাকা দিচ্ছে টিক দিন, অথবা নিচে পরিমাণ লিখুন — পুরোনো বিল আগে শোধ হবে।')}</p>
        <div className="bill-list">
          {bills.map((b) => {
            const on = picked[key(b)] !== undefined;
            return (
              <div key={key(b)} className={on ? 'bill on' : 'bill'}>
                <label className="check">
                  <input type="checkbox" checked={on} onChange={(e) => {
                    const next = { ...picked };
                    if (e.target.checked) next[key(b)] = String(b.remaining);
                    else delete next[key(b)];
                    setPicked(next);
                  }} />
                  <span><b>{b.ref}</b> <span className="muted">{b.docType === 'repair' ? t('সার্ভিস') : t('বিক্রয়')} · {fmtDate(b.date, false)}</span></span>
                </label>
                <AgeChip days={b.days} />
                {on
                  ? <input type="number" min="0" max={b.remaining} step="0.01" value={picked[key(b)]} className="bill-amt"
                      onChange={(e) => setPicked({ ...picked, [key(b)]: e.target.value })} />
                  : <span className="num b">৳{money(b.remaining)}</span>}
              </div>
            );
          })}
          {bills.length === 0 && <p className="muted">{t('কোনো বকেয়া বিল নেই।')}</p>}
        </div>
        {!usingPicks && (
          <label>{t('পরিমাণ (পুরোনো বিল আগে)')}<input type="number" min="0" max={customer.balance} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        )}
        <label>{t('টাকা জমা হবে')}
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary btn-rose" disabled={busy || (usingPicks ? pickedTotal <= 0 : !(Number(amount) > 0))}>
          {t('আদায় সেভ')} ৳{money(usingPicks ? pickedTotal : Number(amount) || 0)}
        </button>
      </form>
    </Modal>
  );
}

/** Customer type, credit limit and repair discount for a dealer. */
export function DealerSettingsModal({ party, onClose, onSaved }: { party: Party; onClose: () => void; onSaved: () => void }) {
  const { can } = useAuth();
  const [type, setType] = useState(party.customerType ?? 'retail');
  const [limit, setLimit] = useState(String(party.creditLimit ?? 0));
  const [discount, setDiscount] = useState(String(party.dealerDiscount ?? 0));
  const [error, setError] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api('PATCH', `/customers/${party.id}`, { customerType: type, creditLimit: Number(limit) || 0, dealerDiscount: Number(discount) || 0 });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <Modal title={`${t('ডিলার সেটিংস')} — ${party.name}`} onClose={onClose}>
      <form onSubmit={save}>
        <label>{t('ধরন')}
          <select value={type} onChange={(e) => setType(e.target.value as 'retail' | 'wholesaler')}>
            <option value="retail">{t('সাধারণ কাস্টমার')}</option>
            <option value="wholesaler">{t('ডিলার / দোকান / কারিগর')}</option>
          </select>
        </label>
        <label>{t('ক্রেডিট লিমিট (০ = সীমা নেই)')}<input type="number" min="0" value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
        <label>{t('সার্ভিস চার্জে ডিলার ছাড় %')}<input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
        <p className="muted">{t('ডিলারকে বিক্রয়ে পণ্যের "ডিলার মূল্য" স্বয়ংক্রিয়ভাবে বসবে।')}</p>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={!can('manageParties')}>{t('সেভ')}</button>
      </form>
    </Modal>
  );
}
