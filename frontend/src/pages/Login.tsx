import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { PrefToggles, t } from '../i18n';
import { navigate } from '../router';
import type { PublicSite } from '../types';

export default function Login() {
  const { login } = useAuth();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [shopName, setShopName] = useState('SA Telecom');

  useEffect(() => {
    api<PublicSite>('GET', '/public/site').then((d) => setShopName(d.shop.shopName)).catch(() => undefined);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(userId.trim(), password);
      navigate('/app', true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <button className="back-link" onClick={() => navigate('/')}><i className="fa-solid fa-arrow-left" /> {t('হোম পেজ')}</button>
        <div>
          <span className="brand-mark big"><i className="fa-solid fa-mobile-screen-button" /></span>
          <h1>{shopName}</h1>
          <p>{t('সার্ভিস, স্পেয়ার পার্টস, এক্সেসরিজ বিক্রি ও হিসাব — এক জায়গায়।')}</p>
          <ul className="login-points">
            <li><i className="fa-solid fa-screwdriver-wrench" /> {t('সার্ভিস ট্র্যাকার ও জব কার্ড')}</li>
            <li><i className="fa-solid fa-barcode" /> {t('IMEI স্ক্যান করে বিক্রয়')}</li>
            <li><i className="fa-solid fa-chart-line" /> {t('লাভ-ক্ষতি ও ক্যাশবুক')}</li>
          </ul>
        </div>
      </div>
      <div className="login-side">
        <div className="login-tools"><PrefToggles /></div>
        <form className="login-card" onSubmit={submit}>
          <h2>{t('লগইন করুন')}</h2>
          <p className="muted">{t('আপনার ইউজার ID ও পাসওয়ার্ড দিন')}</p>
          <label>{t('ইউজার ID')}
            <input value={userId} onChange={(e) => setUserId(e.target.value)} autoComplete="username" required autoFocus />
          </label>
          <label>{t('পাসওয়ার্ড')}
            <div className="pw-field">
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" required />
              <button type="button" className="ghost" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                <i className={show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'} />
              </button>
            </div>
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary btn-rose" disabled={busy}>{busy ? t('লগইন হচ্ছে…') : t('লগইন')}</button>
        </form>
      </div>
    </div>
  );
}
