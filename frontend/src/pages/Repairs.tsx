import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import Modal from '../components/Modal';
import Scanner from '../components/Scanner';
import { fmtDate, NEXT_STATUS, STATUS } from '../labels';
import { printJobCard } from '../print';
import { getShop } from '../shop';
import type { Account, Dashboard, Product, RepairDetail, RepairJob, RepairStatus, Technician } from '../types';
import { t } from '../i18n';

type Filter = 'open' | RepairStatus;
const FILTERS: Filter[] = ['open', 'in_work', 'out_work', 'success', 'failed', 'delivered'];

export default function Repairs() {
  const { can } = useAuth();
  const [filter, setFilter] = useState<Filter>('open');
  const [q, setQ] = useState('');
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [counts, setCounts] = useState<Dashboard['repairs'] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    const params = new URLSearchParams({ status: filter });
    if (q.trim()) params.set('q', q.trim());
    api<RepairJob[]>('GET', `/repairs?${params}`).then(setJobs).catch((e: Error) => setError(e.message));
    api<Dashboard>('GET', '/dashboard').then((d) => setCounts(d.repairs)).catch(() => undefined);
  }, [filter, q]);

  useEffect(() => {
    const timer = setTimeout(reload, 200);
    return () => clearTimeout(timer);
  }, [reload]);

  const countFor = (f: Filter) => {
    if (!counts) return null;
    if (f === 'open') return Object.values(counts.byStatus).reduce((s, b) => s + b.count, 0);
    if (f === 'delivered') return null;
    return counts.byStatus[f].count;
  };

  return (
    <section>
      <div className="toolbar">
        <h2><i className="fa-solid fa-screwdriver-wrench" /> {t('সার্ভিস ট্র্যাকার')}</h2>
        <div className="inline">
          <input placeholder={t('জব নং, মোবাইল, IMEI, ডিভাইস…')} value={q} onChange={(e) => setQ(e.target.value)} />
          {can('manageRepairs') && (
            <button className="btn-accent" onClick={() => setShowNew(true)}><i className="fa-solid fa-plus" /> {t('নতুন জব')}</button>
          )}
        </div>
      </div>

      <div className="status-tabs">
        {FILTERS.map((f) => {
          const n = countFor(f);
          const color = f === 'open' ? '#37474f' : STATUS[f].color;
          return (
            <button key={f} className={f === filter ? 'status-tab active' : 'status-tab'} style={{ '--c': color } as CSSProperties}
              onClick={() => setFilter(f)}>
              {f === 'open' ? t('চলমান সব') : STATUS[f].label}{n !== null && <span className="count">{n}</span>}
            </button>
          );
        })}
      </div>

      {counts && filter === 'open' && (
        <div className="hold-strip">
          <span><i className="fa-solid fa-coins" /> {t('হোল্ড (আনুমানিক):')} <b>৳{money(counts.holdTotal)}</b></span>
          <span><i className="fa-solid fa-hand-holding-dollar" /> {t('অগ্রিম জমা:')} <b>৳{money(counts.advanceHeld)}</b></span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="job-list">
        {jobs.map((j) => (
          <button key={j.id} className="job-row" style={{ borderLeftColor: STATUS[j.status].color }} onClick={() => setOpenId(j.id)}>
            <div className="job-main">
              <div className="job-top">
                <span className="job-no">{j.jobNo}</span>
                <StatusBadge status={j.status} outcome={j.outcome} />
              </div>
              <div className="job-device"><i className="fa-solid fa-mobile-screen" /> {j.device}{j.imei && <small className="muted"> · {j.imei}</small>}</div>
              <div className="muted">{j.problem}</div>
            </div>
            <div className="job-side">
              <div className="b">{j.customerName}</div>
              <div className="muted">{j.customerMobile ?? ''}</div>
              <div>{j.status === 'delivered' ? t('বিল ৳{amount}', { amount: money(j.total) }) : t('আনুমানিক ৳{amount}', { amount: money(j.estimatedCost) })}</div>
              <small className="muted">{fmtDate(j.createdAt)}</small>
            </div>
          </button>
        ))}
        {jobs.length === 0 && <div className="card muted">{t('কোনো জব নেই।')}</div>}
      </div>

      {showNew && <NewJob onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); reload(); setOpenId(id); }} />}
      {openId !== null && <JobDetail id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </section>
  );
}

export function StatusBadge({ status, outcome }: { status: RepairStatus; outcome?: 'success' | 'failed' | null }) {
  const s = STATUS[status];
  return (
    <span className="status-badge" style={{ background: s.color }}>
      {s.label}{status === 'delivered' && outcome === 'failed' ? ' (Unsuccess)' : ''}
    </span>
  );
}

function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => { api<Account[]>('GET', '/accounts').then(setAccounts).catch(() => undefined); }, []);
  return accounts;
}

function NewJob({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const accounts = useAccounts();
  const [f, setF] = useState({
    name: '', mobile: '', device: '', imei: '', problem: '', accessories: '', estimatedCost: '', advance: '', accountId: '', promisedAt: '', note: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanImei, setScanImei] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const accountId = f.accountId || String(accounts[0]?.id ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const job = await api<RepairDetail>('POST', '/repairs', {
        customer: { name: f.name, mobile: f.mobile },
        device: f.device,
        imei: f.imei,
        problem: f.problem,
        accessories: f.accessories || null,
        estimatedCost: Number(f.estimatedCost) || 0,
        advance: Number(f.advance) || 0,
        accountId: Number(accountId) || null,
        promisedAt: f.promisedAt || null,
        note: f.note || null,
      });
      printJobCard(job, await getShop());
      onCreated(job.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={t('নতুন সার্ভিস জব')} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label>{t('কাস্টমারের নাম *')}<input required value={f.name} onChange={set('name')} /></label>
          <label>{t('মোবাইল')}<input value={f.mobile} onChange={set('mobile')} inputMode="tel" placeholder="01XXXXXXXXX" /></label>
          <label>{t('ডিভাইস (ব্র্যান্ড/মডেল) *')}<input required value={f.device} onChange={set('device')} placeholder="Samsung A52" /></label>
          <label>IMEI
            <div className="pw-field">
              <input value={f.imei} onChange={set('imei')} inputMode="numeric" />
              <button type="button" className="ghost" onClick={() => setScanImei(true)} aria-label={t('ক্যামেরা দিয়ে স্ক্যান')}><i className="fa-solid fa-camera" /></button>
            </div>
          </label>
          <label className="span-2">{t('সমস্যা *')}<textarea required rows={2} value={f.problem} onChange={set('problem')} placeholder={t('Display ভাঙা, চার্জ হয় না…')} /></label>
          <label className="span-2">{t('সাথে যা রাখা হলো')}<input value={f.accessories} onChange={set('accessories')} placeholder={t('ব্যাক কভার, সিম, মেমোরি…')} /></label>
          <label>{t('আনুমানিক খরচ')}<input type="number" min="0" value={f.estimatedCost} onChange={set('estimatedCost')} /></label>
          <label>{t('ডেলিভারির তারিখ')}<input type="date" value={f.promisedAt} onChange={set('promisedAt')} /></label>
          <label>{t('অগ্রিম')}<input type="number" min="0" value={f.advance} onChange={set('advance')} /></label>
          <label>{t('অগ্রিম জমা হবে')}
            <select value={accountId} onChange={set('accountId')}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="span-2">{t('নোট')}<input value={f.note} onChange={set('note')} /></label>
        </div>
        <p className="muted">{t('একই মোবাইল নম্বরের কাস্টমার থাকলে সেটিই ব্যবহার হবে। সেভ করলে জব কার্ড প্রিন্ট হবে।')}</p>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? t('সেভ হচ্ছে…') : t('জব সেভ ও প্রিন্ট')}</button>
      </form>
      {scanImei && <Scanner title="IMEI" onResult={(code) => setF((cur) => ({ ...cur, imei: code }))} onClose={() => setScanImei(false)} />}
    </Modal>
  );
}

function JobDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { can } = useAuth();
  const accounts = useAccounts();
  const [job, setJob] = useState<RepairDetail | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'none' | 'out_work' | 'deliver' | 'cancel'>('none');
  const isOwner = useAuth().user?.role === 'owner';

  /** Super Admin: cancel a wrong job (advance refunded, parts back to stock, technician wage reversed). */
  async function cancelJob(jobId: number, accountId: number | null) {
    setError('');
    try {
      await api('DELETE', `/repairs/${jobId}`, { accountId });
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    }
  }

  const load = useCallback(() => {
    api<RepairDetail>('GET', `/repairs/${id}`).then(setJob).catch((e: Error) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function run<T>(fn: () => Promise<T>) {
    setError('');
    try {
      const updated = await fn();
      if (updated && typeof updated === 'object' && 'jobNo' in (updated as object)) setJob(updated as unknown as RepairDetail);
      else load();
      setMode('none');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  if (!job) {
    return <Modal title={t('জব')} onClose={onClose}>{error ? <div className="error">{error}</div> : <p className="muted">{t('লোড হচ্ছে…')}</p>}</Modal>;
  }

  const open = job.status !== 'delivered';
  const editable = open && can('manageRepairs');
  const partsTotal = job.parts.filter((p) => !p.restocked).reduce((s, p) => s + p.lineTotal, 0);

  return (
    <Modal title={`${job.jobNo} · ${job.device}`} onClose={onClose} wide>
      <div className="detail-head">
        <StatusBadge status={job.status} outcome={job.outcome} />
        <div className="inline" style={{ margin: 0 }}>
          <button className="ghost" onClick={async () => printJobCard(job, await getShop())}><i className="fa-solid fa-print" /> {t('জব কার্ড প্রিন্ট')}</button>
          {isOwner && job.status !== 'delivered' && (
            <button className="ghost danger" onClick={() => setMode('cancel')}><i className="fa-solid fa-ban" /> {t('জব বাতিল')}</button>
          )}
        </div>
      </div>

      <div className="info-grid">
        <Info label={t('কাস্টমার')} value={`${job.customerName}${job.customerMobile ? ` · ${job.customerMobile}` : ''}`} />
        <Info label="IMEI" value={job.imei ?? '—'} />
        <Info label={t('সমস্যা')} value={job.problem} />
        <Info label={t('সাথে রাখা')} value={job.accessories ?? '—'} />
        <Info label={t('আনুমানিক খরচ')} value={`৳${money(job.estimatedCost)}`} />
        <Info label={t('অগ্রিম')} value={`৳${money(job.advance)}`} />
        <Info label={t('ডেলিভারির তারিখ')} value={fmtDate(job.promisedAt, false)} />
        <Info label={t('রিসিভ')} value={fmtDate(job.createdAt)} />
        {job.technicianName && (
          <Info label={t('কারিগর')} value={`${job.technicianName}${job.technicianCost !== undefined ? ` · ${t('মজুরি')} ৳${money(job.technicianCost)}` : ''}`} />
        )}
        {job.technicianNote && <Info label={t('কারিগরের কাজ')} value={job.technicianNote} />}
        {!open && (
          <>
            <Info label={t('মোট বিল')} value={`৳${money(job.total)} (${t('চার্জ')} ${money(job.serviceCharge)} + ${t('পার্টস')} ${money(job.partsTotal)})`} />
            <Info label={t('ডেলিভারিতে পরিশোধ')} value={`৳${money(job.deliveryPaid)}`} />
            {job.due > 0 && <Info label={t('বাকি')} value={`৳${money(job.due)}`} />}
            {job.refunded > 0 && <Info label={t('ফেরত')} value={`৳${money(job.refunded)}`} />}
          </>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {editable && (
        <div className="action-bar">
          {NEXT_STATUS[job.status].map((s) => (
            s === 'out_work'
              ? <button key={s} style={{ background: STATUS[s].color, borderColor: STATUS[s].color }} onClick={() => setMode('out_work')}>
                  <i className="fa-solid fa-truck-fast" /> {t('কারিগরের কাছে পাঠান')}
                </button>
              : <button key={s} style={{ background: STATUS[s].color, borderColor: STATUS[s].color }}
                  onClick={() => run(() => api('POST', `/repairs/${job.id}/status`, { status: s }))}>
                  {STATUS[s].label} — {t(STATUS[s].bn)}
                </button>
          ))}
          {job.status === 'out_work' && (
            <button className="ghost" onClick={() => setMode('out_work')}>{t('কারিগর/মজুরি বদলান')}</button>
          )}
          {(job.status === 'success' || job.status === 'failed') && (
            <button style={{ background: STATUS.delivered.color, borderColor: STATUS.delivered.color }} onClick={() => setMode('deliver')}>
              <i className="fa-solid fa-hand-holding" /> {t('ডেলিভারি দিন')}
            </button>
          )}
        </div>
      )}

      {mode === 'out_work' && <OutWorkForm job={job} onSubmit={(body) => run(() => api('POST', `/repairs/${job.id}/status`, body))} />}
      {mode === 'cancel' && <CancelJobForm job={job} accounts={accounts} onSubmit={(acc) => cancelJob(job.id, acc)} />}
      {mode === 'deliver' && (
        <DeliverForm job={job} partsTotal={partsTotal} accounts={accounts}
          onSubmit={(body) => run(async () => {
            try {
              return await api('POST', `/repairs/${job.id}/deliver`, body);
            } catch (err) {
              // Over the dealer's credit limit: a manager or above may approve it.
              if (!(err instanceof Error && /Credit limit/.test(err.message) && can('manageParties')
                && window.confirm(`${err.message}\n\n${t('তবুও বাকিতে ডেলিভারি দেবেন?')}`))) throw err;
              return api('POST', `/repairs/${job.id}/deliver`, { ...body, allowOverLimit: true });
            }
          })} />
      )}

      <h4>{t('পার্টস')}</h4>
      <table>
        <tbody>
          {job.parts.map((p) => (
            <tr key={p.id}>
              <td>{p.productName}{p.restocked && <span className="badge">{t('স্টকে ফেরত')}</span>}</td>
              <td className="num">{p.qty} × {money(p.unitPrice)}</td>
              <td className="num">{money(p.lineTotal)}</td>
              <td>{editable && (
                <button className="ghost" title="Remove" onClick={() => run(() => api('POST', `/repairs/${job.id}/parts/${p.id}/remove`))}>
                  <i className="fa-solid fa-trash" />
                </button>
              )}</td>
            </tr>
          ))}
          {job.parts.length === 0 && <tr><td className="muted">{t('কোনো পার্টস ব্যবহার হয়নি।')}</td></tr>}
        </tbody>
      </table>
      {editable && <AddPart onAdd={(productId, qty) => run(() => api('POST', `/repairs/${job.id}/parts`, { productId, qty }))} />}

      <h4>{t('ইতিহাস')}</h4>
      <ul className="timeline">
        {job.events.map((e, i) => (
          <li key={i}>
            <span className="dot" style={{ background: STATUS[e.toStatus as RepairStatus]?.color ?? '#999' }} />
            <b>{STATUS[e.toStatus as RepairStatus]?.label ?? e.toStatus}</b>
            {e.note && <> — {e.note}</>}
            <small className="muted"> · {e.userName ?? ''} · {fmtDate(e.createdAt)}</small>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function CancelJobForm({ job, accounts, onSubmit }: { job: RepairDetail; accounts: Account[]; onSubmit: (accountId: number | null) => void }) {
  const [accountId, setAccountId] = useState('');
  const account = accountId || String(accounts[0]?.id ?? '');
  return (
    <div className="sub-form danger-zone">
      <h4>{t('জব বাতিল (ভুল এন্ট্রি)')}</h4>
      <p className="muted">{t('জবটি মুছে যাবে। পার্টস স্টকে ফিরবে এবং কারিগরের মজুরি বাদ যাবে।')}</p>
      {job.advance > 0 && (
        <label>{t('অগ্রিম ৳{amount} যে একাউন্ট থেকে ফেরত দেবেন', { amount: money(job.advance) })}
          <select value={account} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}
      <button className="primary btn-danger" onClick={() => {
        if (window.confirm(t('{job} স্থায়ীভাবে বাতিল করবেন?', { job: job.jobNo }))) onSubmit(job.advance > 0 ? Number(account) : null);
      }}>{t('জব বাতিল করুন')}</button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info"><span>{label}</span><b>{value}</b></div>;
}

function OutWorkForm({ job, onSubmit }: { job: RepairDetail; onSubmit: (body: object) => void }) {
  const [techs, setTechs] = useState<Technician[]>([]);
  const [techId, setTechId] = useState(job.technicianId ? String(job.technicianId) : '');
  const [cost, setCost] = useState(job.technicianCost ? String(job.technicianCost) : '');
  const [note, setNote] = useState(job.technicianNote ?? job.problem);
  useEffect(() => { api<Technician[]>('GET', '/technicians').then((tech) => setTechs(tech.filter((x) => x.active))); }, []);

  return (
    <div className="sub-form">
      <h4>{t('কারিগরের কাছে পাঠান (Out Work)')}</h4>
      {techs.length === 0 && <p className="muted">{t('আগে “কারিগর” পেজ থেকে কারিগর যোগ করুন।')}</p>}
      <div className="form-grid">
        <label>{t('কারিগর *')}
          <select value={techId} onChange={(e) => setTechId(e.target.value)}>
            <option value="">{t('নির্বাচন করুন…')}</option>
            {techs.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}{tech.specialties ? ` (${tech.specialties})` : ''}</option>)}
          </select>
        </label>
        <label>{t('মজুরি')}<input type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
        <label className="span-2">{t('কী কাজ করতে হবে *')}<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <button className="primary" onClick={() => onSubmit({ status: 'out_work', technicianId: Number(techId), technicianCost: Number(cost) || 0, note })}>
        {t('পাঠান')}
      </button>
    </div>
  );
}

function DeliverForm({ job, partsTotal, accounts, onSubmit }: {
  job: RepairDetail;
  partsTotal: number;
  accounts: Account[];
  onSubmit: (body: object) => void;
}) {
  const failed = job.status === 'failed';
  const [restock, setRestock] = useState(failed);
  // Dealers get their agreed discount on the service charge (the user can still change it).
  const dealerPct = job.customerType === 'wholesaler' ? job.dealerDiscount : 0;
  const baseCharge = Math.max(0, job.estimatedCost - partsTotal);
  const [charge, setCharge] = useState(String(failed ? 0 : Math.round(baseCharge * (1 - dealerPct / 100))));
  const [accountId, setAccountId] = useState('');
  const parts = restock ? 0 : partsTotal;
  const total = (Number(charge) || 0) + parts;
  const net = total - job.advance;
  const [paid, setPaid] = useState('');
  const paidValue = paid === '' ? Math.max(0, net) : Number(paid) || 0;
  const account = accountId || String(accounts[0]?.id ?? '');

  return (
    <div className="sub-form">
      <h4>{t('ডেলিভারি ও বিল')} {failed && <span className="badge danger">Unsuccess</span>}</h4>
      {dealerPct > 0 && !failed && (
        <p className="dealer-note"><i className="fa-solid fa-store" /> {t('ডিলার ছাড় {pct}% ধরা হয়েছে (মূল চার্জ ৳{base})', { pct: dealerPct, base: money(baseCharge) })}</p>
      )}
      <div className="form-grid">
        <label>{t('সার্ভিস চার্জ')}<input type="number" min="0" value={charge} onChange={(e) => setCharge(e.target.value)} /></label>
        {net >= 0
          ? <label>{t('এখন পরিশোধ')}<input type="number" min="0" value={paid === '' ? String(Math.max(0, net)) : paid} onChange={(e) => setPaid(e.target.value)} /></label>
          : <div className="info"><span>{t('অগ্রিম ফেরত দিতে হবে')}</span><b>৳{money(-net)}</b></div>}
        <label>{net >= 0 ? t('টাকা জমা হবে') : t('ফেরত দেওয়া হবে')}
          <select value={account} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {failed && job.parts.length > 0 && (
          <label className="check"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> {t('পার্টস স্টকে ফেরত দিন')}</label>
        )}
      </div>
      <div className="totals">
        <div><span>{t('পার্টস')}</span><span>{money(parts)}</span></div>
        <div><span>{t('অগ্রিম')}</span><span>-{money(job.advance)}</span></div>
        <div className="grand"><span>{t('মোট বিল')}</span><span>৳{money(total)}</span></div>
        {net >= 0 && <div><span>{t('বাকি থাকবে')}</span><span>{money(Math.max(0, net - paidValue))}</span></div>}
      </div>
      <button className="primary" onClick={() => onSubmit({
        charge: Number(charge) || 0,
        paid: net >= 0 ? paidValue : 0,
        accountId: Number(account) || null,
        restockParts: restock,
      })}>{t('ডেলিভারি সম্পন্ন')}</button>
    </div>
  );
}

function AddPart({ onAdd }: { onAdd: (productId: number, qty: number) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [pid, setPid] = useState('');
  const [qty, setQty] = useState('1');
  useEffect(() => { api<Product[]>('GET', '/products').then((p) => setProducts(p.filter((x) => !x.serialized && x.stock > 0))); }, []);
  return (
    <div className="inline">
      <select value={pid} onChange={(e) => setPid(e.target.value)}>
        <option value="">{t('পার্টস যোগ করুন…')}</option>
        {products.map((p) => <option key={p.id} value={p.id}>{p.name} {t('— ৳')}{money(p.salePrice)} {t('(স্টক')} {p.stock})</option>)}
      </select>
      <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 70 }} />
      <button disabled={!pid} onClick={() => { onAdd(Number(pid), Number(qty) || 1); setPid(''); setQty('1'); }}>{t('যোগ')}</button>
    </div>
  );
}
