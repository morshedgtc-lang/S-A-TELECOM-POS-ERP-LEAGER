import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api';
import { PrefToggles, t } from '../i18n';
import { navigate } from '../router';
import type { PublicSite } from '../types';

interface AppInfo {
  android: { version: string; file: string; size: number; minAndroid: string; updated: string };
}

/** QR code drawn in the browser (dark modules on white, so phones scan it in any theme). */
function Qr({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(value, { width: 320, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#16121a', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [value]);
  return src ? <img className="qr" src={src} alt={label} width={220} height={220} /> : <div className="qr placeholder" />;
}

export default function Download() {
  const origin = window.location.origin;
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [shopName, setShopName] = useState('SA Telecom');

  useEffect(() => {
    fetch('/downloads/app.json').then((r) => r.json()).then(setInfo).catch(() => setInfo(null));
    api<PublicSite>('GET', '/public/site').then((d) => setShopName(d.shop.shopName)).catch(() => undefined);
  }, []);

  const apkUrl = `${origin}${info?.android.file ?? '/downloads/sa-telecom-pos.apk'}`;
  const iphoneUrl = `${origin}/app`;
  const sizeMb = info ? (info.android.size / 1024 / 1024).toFixed(1) : null;

  return (
    <div className="download-page">
      <header className="site-nav no-print">
        <a className="site-brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
          <span className="brand-mark"><i className="fa-solid fa-mobile-screen-button" /></span>{shopName}
        </a>
        <div style={{ marginLeft: 'auto' }}><PrefToggles /></div>
        <button className="btn-ghost" onClick={() => window.print()}><i className="fa-solid fa-print" /> <span className="hide-sm">{t('পোস্টার প্রিন্ট')}</span></button>
      </header>

      <main className="download-main">
        <div className="download-head">
          <span className="brand-mark big"><i className="fa-solid fa-mobile-screen-button" /></span>
          <h1>{shopName} POS</h1>
          <p>{t('মোবাইলে দোকান চালান — QR স্ক্যান করে অ্যাপ নিন')}</p>
        </div>

        <div className="download-grid">
          <section className="dl-card android">
            <div className="dl-title"><i className="fa-brands fa-android" /> Android</div>
            <Qr value={apkUrl} label="Android APK QR" />
            <a className="btn-green dl-btn no-print" href={apkUrl} download>
              <i className="fa-solid fa-download" /> {t('APK ডাউনলোড')}{sizeMb && <small> · {sizeMb} MB</small>}
            </a>
            {info && <div className="muted">{t('ভার্সন {v} · Android {min}+', { v: info.android.version, min: info.android.minAndroid })}</div>}
            <ol className="dl-steps">
              <li>{t('ক্যামেরা দিয়ে QR স্ক্যান করুন বা বাটনে চাপুন')}</li>
              <li>{t('ডাউনলোড হলে ফাইলটি খুলুন')}</li>
              <li>{t('"অজানা অ্যাপ ইনস্টল" অনুমতি দিন, তারপর Install')}</li>
              <li>{t('অ্যাপ খুলে ইউজার ID ও পাসওয়ার্ড দিয়ে লগইন করুন')}</li>
            </ol>
          </section>

          <section className="dl-card iphone">
            <div className="dl-title"><i className="fa-brands fa-apple" /> iPhone</div>
            <Qr value={iphoneUrl} label="iPhone QR" />
            <a className="btn-rose dl-btn no-print" href={iphoneUrl}>
              <i className="fa-solid fa-arrow-up-right-from-square" /> {t('iPhone এ খুলুন')}
            </a>
            <div className="muted">{t('Safari দিয়ে খুলুন')}</div>
            <ol className="dl-steps">
              <li>{t('ক্যামেরা দিয়ে QR স্ক্যান করুন — Safari তে খুলবে')}</li>
              <li>{t('নিচের Share বাটনে চাপুন')} <i className="fa-solid fa-arrow-up-from-bracket" /></li>
              <li>{t('"Add to Home Screen" বেছে নিন')}</li>
              <li>{t('হোম স্ক্রিনের SA Telecom আইকন থেকে খুলে লগইন করুন')}</li>
            </ol>
          </section>
        </div>

        <p className="dl-note muted">{t('স্টাফদের জন্য আলাদা ইউজার ID “শপ সেটিংস / স্টাফ” থেকে তৈরি করুন। ডাটা সার্ভারে থাকে, তাই ফোন বদলালেও কিছু হারাবে না।')}</p>
        <p className="dl-url muted">{origin}</p>
      </main>
    </div>
  );
}
