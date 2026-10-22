import { useEffect, useState, type FormEvent } from 'react';
import { api, money } from './api';
import { useAuth } from './auth';
import Modal from './components/Modal';
import { PrefToggles, t } from './i18n';
import { getServer, isNative } from './native';
import { navigate, usePath } from './router';
import { ROLE_LABEL } from './labels';
import type { Account, Action, User } from './types';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pos from './pages/Pos';
import Products from './pages/Products';
import Purchases from './pages/Purchases';
import Parties from './pages/Parties';
import Expenses from './pages/Expenses';
import Repairs from './pages/Repairs';
import Technicians from './pages/Technicians';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import Imei from './pages/Imei';
import Settings from './pages/Settings';
import Website from './pages/Website';
import Dues from './pages/Dues';
import Download from './pages/Download';
import Barcodes from './pages/Barcodes';

type PageId =
  | 'dashboard' | 'repairs' | 'technicians' | 'pos' | 'sales' | 'purchases' | 'products' | 'barcodes' | 'imei'
  | 'parties' | 'dues' | 'expenses' | 'reports' | 'website' | 'settings';

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
  section: string;
  /** Shown when the user has any of these permissions. */
  needs?: Action[];
}

// Bangla labels are translation keys (see i18n.en.ts); t() is applied at render time.
const NAV: NavItem[] = [
  { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: 'fa-border-all', section: 'ওভারভিউ' },
  { id: 'repairs', label: 'সার্ভিস ট্র্যাকার', icon: 'fa-list-check', section: 'ওভারভিউ' },
  { id: 'technicians', label: 'কারিগর আউট-ওয়ার্ক', icon: 'fa-screwdriver-wrench', section: 'ওভারভিউ' },
  { id: 'pos', label: 'POS ক্যাশিয়ার', icon: 'fa-cash-register', section: 'বিক্রি ও সেবা', needs: ['sell'] },
  { id: 'sales', label: 'বিক্রয় ইনভয়েস ও রিটার্ন', icon: 'fa-file-invoice', section: 'বিক্রি ও সেবা' },
  { id: 'purchases', label: 'নতুন ক্রয়', icon: 'fa-cart-shopping', section: 'ক্রয় ও স্টক-ইন', needs: ['managePurchases'] },
  { id: 'products', label: 'পণ্য তালিকা ও স্টক', icon: 'fa-boxes-stacked', section: 'পণ্য ব্যবস্থাপনা' },
  { id: 'barcodes', label: 'বারকোড ও লেবেল', icon: 'fa-barcode', section: 'পণ্য ব্যবস্থাপনা' },
  { id: 'imei', label: 'IMEI লুকআপ', icon: 'fa-mobile-screen-button', section: 'পণ্য ব্যবস্থাপনা' },
  { id: 'parties', label: 'কাস্টমার ও সাপ্লায়ার খাতা', icon: 'fa-users', section: 'পার্টি ও খাতা' },
  { id: 'dues', label: 'বকেয়া আদায় তালিকা', icon: 'fa-hand-holding-dollar', section: 'পার্টি ও খাতা' },
  { id: 'expenses', label: 'খরচ খাতা', icon: 'fa-wallet', section: 'টাকা ও হিসাব', needs: ['manageExpenses'] },
  { id: 'reports', label: 'লাভ-ক্ষতি ও রিপোর্ট', icon: 'fa-chart-pie', section: 'টাকা ও হিসাব', needs: ['viewReports'] },
  { id: 'website', label: 'ওয়েবসাইট ও ব্যানার', icon: 'fa-globe', section: 'ওনার ও প্রশাসন', needs: ['manageSettings'] },
  { id: 'settings', label: 'শপ সেটিংস / স্টাফ', icon: 'fa-gear', section: 'ওনার ও প্রশাসন', needs: ['manageSettings', 'manageStaff'] },
];

/** Bottom tab bar on phones: the four most used pages plus "More" (opens the full menu). */
const TABS: { id: PageId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'হোম', icon: 'fa-house' },
  { id: 'repairs', label: 'সার্ভিস', icon: 'fa-screwdriver-wrench' },
  { id: 'pos', label: 'বিক্রি', icon: 'fa-cash-register' },
  { id: 'products', label: 'স্টক', icon: 'fa-boxes-stacked' },
];

export default function App() {
  const { user, ready } = useAuth();
  const path = usePath();

  const inApp = path === '/app' || path.startsWith('/app/');
  useEffect(() => {
    if (!ready) return;
    if (inApp && !user) navigate('/login', true);
    if (path === '/login' && user) navigate('/app', true);
    // The phone apps are for staff only: skip the public website.
    if (isNative && !inApp && path !== '/login') navigate(user ? '/app' : '/login', true);
  }, [ready, user, inApp, path]);

  if (path === '/login') return user ? null : <Login />;
  if (path === '/download' && !isNative) return <Download />;
  if (!inApp) return isNative ? null : <Home />;
  if (!ready || !user) return <div className="splash"><i className="fa-solid fa-spinner fa-spin" /></div>;
  return <Shell user={user} page={path.split('/')[2] ?? ''} />;
}

function Shell({ user, page }: { user: User; page: string }) {
  const { logout, can } = useAuth();
  const [cash, setCash] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  const visible = NAV.filter((n) => !n.needs || n.needs.some(can));
  const current = visible.find((n) => n.id === page) ?? visible[0];
  const sections = [...new Set(visible.map((n) => n.section))];
  const go = (id: PageId) => { navigate(id === 'dashboard' ? '/app' : `/app/${id}`); setMenuOpen(false); };

  useEffect(() => {
    api<Account[]>('GET', '/accounts')
      .then((rows) => setCash(rows.reduce((s, a) => s + a.balance, 0)))
      .catch(() => setCash(null));
  }, [page]);

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn menu-toggle" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>
          <i className="fa-solid fa-bars" />
        </button>
        <button className="brand" onClick={() => go('dashboard')}>
          <span className="brand-mark"><i className="fa-solid fa-mobile-screen-button" /></span>
          <span>SA Telecom<small>{t(current.label)}</small></span>
        </button>
        <div className="top-pills">
          <span className="pill cash-pill"><i className="fa-solid fa-wallet" /> ৳{money(cash)}</span>
          <PrefToggles compact />
          <div className="user-menu">
            <button className="pill pill-btn" onClick={() => setUserMenu(!userMenu)}>
              <i className="fa-solid fa-circle-user" /> <span className="hide-sm">{user.name}</span>
              <span className={`role-chip role-${user.role}`}>{t(ROLE_LABEL[user.role])}</span>
            </button>
            {userMenu && (
              <div className="dropdown" onMouseLeave={() => setUserMenu(false)}>
                <button onClick={() => { window.open(isNative ? `${getServer()}/` : '/', '_blank'); setUserMenu(false); }}><i className="fa-solid fa-globe" /> {t('ওয়েবসাইট দেখুন')}</button>
                <button onClick={() => { setPwOpen(true); setUserMenu(false); }}><i className="fa-solid fa-key" /> {t('পাসওয়ার্ড পরিবর্তন')}</button>
                <button onClick={() => { logout(); navigate('/login'); }}><i className="fa-solid fa-right-from-bracket" /> {t('লগআউট')}</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="shell">
        <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
          {sections.map((section) => (
            <div key={section}>
              <div className="nav-section">{t(section)}</div>
              {visible.filter((n) => n.section === section).map((n) => (
                <button key={n.id} className={n.id === current.id ? 'nav active' : 'nav'} onClick={() => go(n.id)}>
                  <i className={`fa-solid ${n.icon}`} />
                  {t(n.label)}
                </button>
              ))}
            </div>
          ))}
          <div className="me">{user.name} · {t(ROLE_LABEL[user.role])}</div>
        </aside>
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
        <main className="content">
          {current.id === 'dashboard' && <Dashboard onNavigate={(p) => go(p as PageId)} />}
          {current.id === 'repairs' && <Repairs />}
          {current.id === 'technicians' && <Technicians />}
          {current.id === 'pos' && <Pos />}
          {current.id === 'sales' && <Sales />}
          {current.id === 'products' && <Products />}
          {current.id === 'barcodes' && <Barcodes />}
          {current.id === 'imei' && <Imei />}
          {current.id === 'purchases' && <Purchases />}
          {current.id === 'parties' && <Parties />}
          {current.id === 'dues' && <Dues />}
          {current.id === 'expenses' && <Expenses />}
          {current.id === 'reports' && <Reports />}
          {current.id === 'website' && <Website />}
          {current.id === 'settings' && <Settings />}
        </main>
      </div>
      <nav className="tabbar" aria-label="Quick menu">
        {TABS.filter((tab) => visible.some((n) => n.id === tab.id)).map((tab) => (
          <button key={tab.id} className={tab.id === current.id ? 'on' : ''} onClick={() => go(tab.id)}>
            <i className={`fa-solid ${tab.icon}`} /><span>{t(tab.label)}</span>
          </button>
        ))}
        <button className={menuOpen ? 'on' : ''} onClick={() => setMenuOpen(!menuOpen)}>
          <i className="fa-solid fa-grip" /><span>{t('আরও')}</span>
        </button>
      </nav>
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </div>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('POST', '/me/password', { currentPassword: current, newPassword: next });
      setMessage({ ok: true, text: t('পাসওয়ার্ড পরিবর্তন হয়েছে') });
      setCurrent('');
      setNext('');
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Failed' });
    }
  }

  return (
    <Modal title={t('পাসওয়ার্ড পরিবর্তন')} onClose={onClose}>
      <form onSubmit={submit}>
        <label>{t('বর্তমান পাসওয়ার্ড')}<input type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></label>
        <label>{t('নতুন পাসওয়ার্ড')}<input type="password" required minLength={6} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
        {message && <div className={message.ok ? 'ok' : 'error'}>{message.text}</div>}
        <button className="primary">{t('সেভ')}</button>
      </form>
    </Modal>
  );
}
