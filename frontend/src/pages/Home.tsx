import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import { pick, PrefToggles, t } from '../i18n';
import { fmtDate, STATUS } from '../labels';
import { navigate } from '../router';
import type { PublicSite, TrackResult } from '../types';

const ACCENTS = ['#e11d48', '#22c55e', '#8b5cf6', '#0ea5e9', '#f59e0b', '#ef4444'];

export default function Home() {
  const { user } = useAuth();
  const [data, setData] = useState<PublicSite | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<PublicSite>('GET', '/public/site').then((d) => {
      setData(d);
      document.title = d.shop.shopName;
    }).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="splash error">{error}</div>;
  if (!data) return <div className="splash"><i className="fa-solid fa-spinner fa-spin" /></div>;
  const { shop, site } = data;
  const wa = site.whatsapp.replace(/\D/g, '');

  return (
    <div className="site">
      <header className="site-nav">
        <a className="site-brand" href="/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <span className="brand-mark"><i className="fa-solid fa-mobile-screen-button" /></span>{shop.shopName}
        </a>
        <nav className="site-links">
          <a href="#services">{t('সার্ভিস')}</a>
          {site.showTracking && <a href="#track">{t('রিপেয়ার ট্র্যাক')}</a>}
          <a href="#contact">{t('যোগাযোগ')}</a>
        </nav>
        <PrefToggles />
        <button className="btn-rose" onClick={() => navigate(user ? '/app' : '/login')}>
          <i className="fa-solid fa-right-to-bracket" /> {user ? t('ড্যাশবোর্ড') : t('লগইন')}
        </button>
      </header>

      <section className="hero-banner" style={site.heroImage ? { backgroundImage: `url("${site.heroImage}")` } : undefined}>
        <div className="hero-inner">
          <span className="eyebrow"><i className="fa-solid fa-screwdriver-wrench" /> {t('সার্ভিস • স্পেয়ার পার্টস • এক্সেসরিজ')}</span>
          <h1>{pick(site.heroTitle)}</h1>
          <p>{pick(site.heroSubtitle)}</p>
          <div className="hero-cta">
            {shop.shopPhone && <a className="btn-rose" href={`tel:${shop.shopPhone}`}><i className="fa-solid fa-phone" /> {t('কল করুন')}</a>}
            {wa && <a className="btn-green" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"><i className="fa-brands fa-whatsapp" /> WhatsApp</a>}
            {site.showTracking && <a className="btn-ghost" href="#track"><i className="fa-solid fa-magnifying-glass" /> {t('রিপেয়ার ট্র্যাক করুন')}</a>}
          </div>
        </div>
      </section>

      {site.highlights.length > 0 && (
        <section className="highlights">
          {site.highlights.map((h, i) => (
            <div key={i} className="highlight" style={{ '--accent': ACCENTS[i % ACCENTS.length] } as CSSProperties}>
              <i className={`fa-solid ${h.icon}`} />
              <span>{pick(h.title)}</span>
            </div>
          ))}
        </section>
      )}

      <section id="services" className="site-section">
        <h2>{t('আমাদের সার্ভিস')}</h2>
        <div className="service-grid">
          {site.services.map((s, i) => (
            <article key={i} className="service-card" style={{ '--accent': ACCENTS[i % ACCENTS.length] } as CSSProperties}>
              <span className="service-icon"><i className={`fa-solid ${s.icon}`} /></span>
              <h3>{pick(s.title)}</h3>
              <p>{pick(s.desc)}</p>
            </article>
          ))}
        </div>
      </section>

      {site.showTracking && <TrackBox />}

      <section id="contact" className="site-section contact">
        <div className="about">
          <h2>{t('আমাদের সম্পর্কে')}</h2>
          <p>{pick(site.about)}</p>
        </div>
        <div className="contact-card">
          <h3>{t('যোগাযোগ')}</h3>
          {shop.shopAddress && <p><i className="fa-solid fa-location-dot" /> {shop.shopAddress}</p>}
          {shop.shopPhone && <p><i className="fa-solid fa-phone" /> <a href={`tel:${shop.shopPhone}`}>{shop.shopPhone}</a></p>}
          {wa && <p><i className="fa-brands fa-whatsapp" /> <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">+{wa}</a></p>}
          {site.email && <p><i className="fa-solid fa-envelope" /> <a href={`mailto:${site.email}`}>{site.email}</a></p>}
          <p><i className="fa-solid fa-clock" /> {pick(site.hours)}</p>
          <div className="contact-links">
            {site.mapUrl && <a className="btn-ghost dark" href={site.mapUrl} target="_blank" rel="noreferrer"><i className="fa-solid fa-map" /> {t('ম্যাপে দেখুন')}</a>}
            {site.facebook && <a className="btn-ghost dark" href={site.facebook} target="_blank" rel="noreferrer"><i className="fa-brands fa-facebook" /> Facebook</a>}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        © {new Date().getFullYear()} {shop.shopName} · {t('মোবাইল সার্ভিসিং, পার্টস ও এক্সেসরিজ')}
      </footer>
    </div>
  );
}

function TrackBox() {
  const [jobNo, setJobNo] = useState('');
  const [mobile, setMobile] = useState('');
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setBusy(true);
    try {
      const q = new URLSearchParams({ jobNo: jobNo.trim(), mobile: mobile.trim() });
      setResult(await api<TrackResult>('GET', `/public/track?${q}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not found');
    } finally {
      setBusy(false);
    }
  }

  const steps = ['in_work', 'out_work', 'success', 'delivered'] as const;
  const reached = new Set(result?.events.map((e) => e.status));

  return (
    <section id="track" className="site-section track">
      <h2>{t('আপনার রিপেয়ার ট্র্যাক করুন')}</h2>
      <p className="muted">{t('জব কার্ডের নম্বর ও আপনার মোবাইল নম্বর দিন।')}</p>
      <form className="track-form" onSubmit={submit}>
        <input required placeholder={t('জব নং (যেমন J00012)')} value={jobNo} onChange={(e) => setJobNo(e.target.value)} />
        <input required placeholder={t('মোবাইল নম্বর')} inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />
        <button className="btn-rose" disabled={busy}><i className="fa-solid fa-magnifying-glass" /> {t('খুঁজুন')}</button>
      </form>
      {error && <div className="error">{error}</div>}
      {result && (
        <div className="track-result">
          <div className="track-head">
            <div>
              <div className="track-job">{result.jobNo}</div>
              <div className="muted">{result.device} · {t('রিসিভ')} {fmtDate(result.createdAt, false)}</div>
            </div>
            <span className="status-badge big" style={{ background: STATUS[result.status].color }}>
              {t(STATUS[result.status].bn)}
            </span>
          </div>
          <ol className="stepper">
            {steps.map((s) => {
              const done = s === 'in_work' || reached.has(s) || (s === 'success' && reached.has('failed'));
              return (
                <li key={s} className={done ? 'done' : ''} style={{ '--accent': STATUS[s].color } as CSSProperties}>
                  <span className="step-dot"><i className={done ? 'fa-solid fa-check' : 'fa-regular fa-circle'} /></span>
                  {s === 'success' && reached.has('failed') ? t(STATUS.failed.bn) : t(STATUS[s].bn)}
                </li>
              );
            })}
          </ol>
          <div className="track-money">
            {result.promisedAt && result.status !== 'delivered' && <span>{t('ডেলিভারির তারিখ')}: <b>{fmtDate(result.promisedAt, false)}</b></span>}
            {result.total === null
              ? <span>{t('আনুমানিক খরচ')}: <b>৳{money(result.estimatedCost)}</b> · {t('অগ্রিম')}: <b>৳{money(result.advance)}</b></span>
              : <span>{t('মোট বিল')}: <b>৳{money(result.total)}</b>{result.due ? <> · {t('বাকি')}: <b>৳{money(result.due)}</b></> : null}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
