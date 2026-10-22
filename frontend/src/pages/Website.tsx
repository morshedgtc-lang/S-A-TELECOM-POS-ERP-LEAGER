import { useEffect, useState } from 'react';
import { api } from '../api';
import { t } from '../i18n';
import type { Bi, SiteContent } from '../types';

const ICONS = [
  'fa-mobile-screen', 'fa-battery-three-quarters', 'fa-microchip', 'fa-code', 'fa-gears', 'fa-headphones',
  'fa-plug', 'fa-camera', 'fa-volume-high', 'fa-sim-card', 'fa-shield-halved', 'fa-bolt', 'fa-certificate',
  'fa-truck-fast', 'fa-store', 'fa-star', 'fa-screwdriver-wrench', 'fa-magnifying-glass-location', 'fa-wifi', 'fa-laptop',
];

/** Shrinks an uploaded banner to at most 1600px wide JPEG so it stays well under the 2 MB limit. */
function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('Could not read this image'));
    img.src = URL.createObjectURL(file);
  });
}

export default function Website() {
  const [site, setSite] = useState<SiteContent | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api<SiteContent>('GET', '/settings/site').then(setSite); }, []);
  if (!site) return <div className="muted">{t('লোড হচ্ছে…')}</div>;

  const patch = (p: Partial<SiteContent>) => setSite({ ...site, ...p });

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      setSite(await api<SiteContent>('PUT', '/settings/site', site));
      setMessage({ ok: true, text: t('ওয়েবসাইট আপডেট হয়েছে') });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setBusy(false);
    }
  }

  async function onBanner(file: File | undefined) {
    if (!file) return;
    try {
      patch({ heroImage: await resizeImage(file) });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Image failed' });
    }
  }

  return (
    <section>
      <div className="toolbar">
        <h2><i className="fa-solid fa-globe" /> {t('ওয়েবসাইট ও ব্যানার')}</h2>
        <div className="inline">
          <a className="btn-ghost dark" href="/" target="_blank" rel="noreferrer"><i className="fa-solid fa-up-right-from-square" /> {t('ওয়েবসাইট দেখুন')}</a>
          <button className="btn-rose" disabled={busy} onClick={save}><i className="fa-solid fa-floppy-disk" /> {t('সেভ')}</button>
        </div>
      </div>
      {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}

      <div className="two-col">
        <div className="card">
          <h3>{t('হিরো ব্যানার')}</h3>
          <div className="banner-preview" style={site.heroImage ? { backgroundImage: `url("${site.heroImage}")` } : undefined}>
            {!site.heroImage && <span className="muted">{t('কোনো ছবি নেই — রঙিন ব্যাকগ্রাউন্ড দেখাবে')}</span>}
          </div>
          <div className="inline">
            <label className="btn-ghost dark file-btn">
              <i className="fa-solid fa-image" /> {t('ছবি আপলোড')}
              <input type="file" accept="image/*" onChange={(e) => onBanner(e.target.files?.[0])} hidden />
            </label>
            {site.heroImage && <button className="ghost" onClick={() => patch({ heroImage: '' })}><i className="fa-solid fa-trash" /> {t('ছবি সরান')}</button>}
          </div>
          <BiField label={t('শিরোনাম')} value={site.heroTitle} onChange={(v) => patch({ heroTitle: v })} />
          <BiField label={t('সাব-টাইটেল')} value={site.heroSubtitle} onChange={(v) => patch({ heroSubtitle: v })} area />
        </div>

        <div className="card">
          <h3>{t('যোগাযোগ ও তথ্য')}</h3>
          <p className="muted">{t('দোকানের নাম, মোবাইল ও ঠিকানা "শপ সেটিংস" পেজ থেকে আসে।')}</p>
          <label>WhatsApp<input value={site.whatsapp} onChange={(e) => patch({ whatsapp: e.target.value })} placeholder="+8801XXXXXXXXX" /></label>
          <label>{t('ইমেইল')}<input type="email" value={site.email} onChange={(e) => patch({ email: e.target.value })} /></label>
          <BiField label={t('খোলার সময়')} value={site.hours} onChange={(v) => patch({ hours: v })} />
          <label>{t('গুগল ম্যাপ লিংক (https)')}<input value={site.mapUrl} onChange={(e) => patch({ mapUrl: e.target.value })} placeholder="https://maps.google.com/…" /></label>
          <label>{t('ফেসবুক পেজ (https)')}<input value={site.facebook} onChange={(e) => patch({ facebook: e.target.value })} placeholder="https://facebook.com/…" /></label>
          <label className="check"><input type="checkbox" checked={site.showTracking} onChange={(e) => patch({ showTracking: e.target.checked })} /> {t('হোম পেজে রিপেয়ার ট্র্যাকিং দেখান')}</label>
          <BiField label={t('আমাদের সম্পর্কে')} value={site.about} onChange={(v) => patch({ about: v })} area />
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <h3>{t('সার্ভিস কার্ড')}</h3>
          <button className="ghost" disabled={site.services.length >= 12}
            onClick={() => patch({ services: [...site.services, { icon: 'fa-screwdriver-wrench', title: { en: '', bn: '' }, desc: { en: '', bn: '' } }] })}>
            <i className="fa-solid fa-plus" /> {t('যোগ করুন')}
          </button>
        </div>
        <div className="editor-grid">
          {site.services.map((s, i) => (
            <div key={i} className="editor-item">
              <div className="inline">
                <IconPick value={s.icon} onChange={(icon) => patch({ services: site.services.map((x, j) => (j === i ? { ...x, icon } : x)) })} />
                <button className="ghost" onClick={() => patch({ services: site.services.filter((_, j) => j !== i) })}><i className="fa-solid fa-trash" /></button>
              </div>
              <BiField label={t('নাম')} value={s.title} onChange={(title) => patch({ services: site.services.map((x, j) => (j === i ? { ...x, title } : x)) })} />
              <BiField label={t('বিবরণ')} value={s.desc} onChange={(desc) => patch({ services: site.services.map((x, j) => (j === i ? { ...x, desc } : x)) })} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <h3>{t('হাইলাইট')}</h3>
          <button className="ghost" disabled={site.highlights.length >= 6}
            onClick={() => patch({ highlights: [...site.highlights, { icon: 'fa-star', title: { en: '', bn: '' } }] })}>
            <i className="fa-solid fa-plus" /> {t('যোগ করুন')}
          </button>
        </div>
        <div className="editor-grid">
          {site.highlights.map((h, i) => (
            <div key={i} className="editor-item">
              <div className="inline">
                <IconPick value={h.icon} onChange={(icon) => patch({ highlights: site.highlights.map((x, j) => (j === i ? { ...x, icon } : x)) })} />
                <button className="ghost" onClick={() => patch({ highlights: site.highlights.filter((_, j) => j !== i) })}><i className="fa-solid fa-trash" /></button>
              </div>
              <BiField label={t('লেখা')} value={h.title} onChange={(title) => patch({ highlights: site.highlights.map((x, j) => (j === i ? { ...x, title } : x)) })} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BiField({ label, value, onChange, area = false }: { label: string; value: Bi; onChange: (v: Bi) => void; area?: boolean }) {
  const Input = area ? 'textarea' : 'input';
  return (
    <div className="bi-field">
      <span className="bi-label">{label}</span>
      <div className="bi-row">
        <label><small>বাংলা</small><Input rows={area ? 3 : undefined} value={value.bn} onChange={(e) => onChange({ ...value, bn: e.target.value })} /></label>
        <label><small>English</small><Input rows={area ? 3 : undefined} value={value.en} onChange={(e) => onChange({ ...value, en: e.target.value })} /></label>
      </div>
    </div>
  );
}

function IconPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="icon-pick">
      <span className="service-icon small"><i className={`fa-solid ${value}`} /></span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Icon">
        {ICONS.map((ic) => <option key={ic} value={ic}>{ic.replace('fa-', '')}</option>)}
      </select>
    </div>
  );
}
