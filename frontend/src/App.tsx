import { useEffect, useState } from 'react';
import { api, money } from './api';
import { useAuth } from './auth';
import type { Account, Action } from './types';
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

type PageId =
  | 'dashboard' | 'repairs' | 'technicians' | 'pos' | 'sales' | 'purchases' | 'products' | 'imei'
  | 'parties' | 'expenses' | 'reports' | 'settings';

interface NavItem {
  id: PageId;
  label: string;
  icon: string;
  section: string;
  /** Shown when the user has any of these permissions. */
  needs?: Action[];
}

// Labels and sections follow the legacy app's sidebar.
const NAV: NavItem[] = [
  { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: 'fa-border-all', section: 'ওভারভিউ' },
  { id: 'repairs', label: 'সার্ভিস ট্র্যাকার', icon: 'fa-list-check', section: 'ওভারভিউ' },
  { id: 'technicians', label: 'কারিগর আউট-ওয়ার্ক', icon: 'fa-screwdriver-wrench', section: 'ওভারভিউ' },
  { id: 'pos', label: 'POS ক্যাশিয়ার', icon: 'fa-money-bill-wave', section: 'বিক্রি ও সেবা', needs: ['sell'] },
  { id: 'sales', label: 'বিক্রয় ইনভয়েস ও রিটার্ন', icon: 'fa-file-invoice', section: 'বিক্রি ও সেবা' },
  { id: 'purchases', label: 'নতুন ক্রয়', icon: 'fa-cart-shopping', section: 'ক্রয় ও স্টক-ইন', needs: ['managePurchases'] },
  { id: 'products', label: 'পণ্য তালিকা ও স্টক', icon: 'fa-boxes-stacked', section: 'পণ্য ব্যবস্থাপনা' },
  { id: 'imei', label: 'IMEI লুকআপ', icon: 'fa-mobile-screen-button', section: 'পণ্য ব্যবস্থাপনা' },
  { id: 'parties', label: 'কাস্টমার ও সাপ্লায়ার খাতা', icon: 'fa-users', section: 'পার্টি ও খাতা' },
  { id: 'expenses', label: 'খরচ খাতা', icon: 'fa-wallet', section: 'টাকা ও হিসাব', needs: ['manageExpenses'] },
  { id: 'reports', label: 'লাভ-ক্ষতি ও রিপোর্ট', icon: 'fa-chart-pie', section: 'টাকা ও হিসাব', needs: ['viewReports'] },
  { id: 'settings', label: 'শপ সেটিংস / স্টাফ', icon: 'fa-gear', section: 'ওনার ও প্রশাসন', needs: ['manageSettings', 'manageStaff'] },
];

const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', staff: 'Staff' };

export default function App() {
  const { user, ready, logout, can } = useAuth();
  const [page, setPage] = useState<PageId>('dashboard');
  const [cash, setCash] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<Account[]>('GET', '/accounts')
      .then((rows) => setCash(rows.reduce((s, a) => s + a.balance, 0)))
      .catch(() => setCash(null));
  }, [user, page]);

  if (!ready) return <div className="splash">Loading…</div>;
  if (!user) return <Login />;

  const visible = NAV.filter((n) => !n.needs || n.needs.some(can));
  const current = visible.find((n) => n.id === page) ?? visible[0];
  const sections = [...new Set(visible.map((n) => n.section))];

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn menu-toggle" aria-label="Menu" onClick={() => setMenuOpen(!menuOpen)}>
          <i className="fa-solid fa-bars" />
        </button>
        <i className="fa-solid fa-rotate-right brand-icon" />
        <div className="brand">
          SA Telecom POS v1.0
          <span>{current.label}</span>
        </div>
        <div className="top-pills">
          <span className="pill"><i className="fa-solid fa-wallet" /> ৳{money(cash)}</span>
          <span className="pill"><i className="fa-solid fa-circle-user" /> {ROLE_LABEL[user.role]}</span>
          <button className="pill pill-btn" onClick={logout} title="Log out">
            <i className="fa-solid fa-right-from-bracket" />
          </button>
        </div>
      </header>

      <div className="shell">
        <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
          {sections.map((section) => (
            <div key={section}>
              <div className="nav-section">{section}</div>
              {visible.filter((n) => n.section === section).map((n) => (
                <button
                  key={n.id}
                  className={n.id === current.id ? 'nav active' : 'nav'}
                  onClick={() => { setPage(n.id); setMenuOpen(false); }}
                >
                  <i className={`fa-solid ${n.icon}`} />
                  {n.label}
                </button>
              ))}
            </div>
          ))}
          <div className="me">{user.name} · {ROLE_LABEL[user.role]}</div>
        </aside>
        <main className="content">
          {current.id === 'dashboard' && <Dashboard onNavigate={(p) => setPage(p as PageId)} />}
          {current.id === 'repairs' && <Repairs />}
          {current.id === 'technicians' && <Technicians />}
          {current.id === 'pos' && <Pos />}
          {current.id === 'sales' && <Sales />}
          {current.id === 'products' && <Products />}
          {current.id === 'imei' && <Imei />}
          {current.id === 'purchases' && <Purchases />}
          {current.id === 'parties' && <Parties />}
          {current.id === 'expenses' && <Expenses />}
          {current.id === 'reports' && <Reports />}
          {current.id === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
}
