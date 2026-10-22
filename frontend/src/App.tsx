import { useState } from 'react';
import { useAuth } from './auth';
import type { Action } from './types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pos from './pages/Pos';
import Products from './pages/Products';
import Purchases from './pages/Purchases';
import Parties from './pages/Parties';
import Expenses from './pages/Expenses';

type PageId = 'dashboard' | 'pos' | 'products' | 'purchases' | 'parties' | 'expenses';

const NAV: { id: PageId; label: string; needs?: Action }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'pos', label: 'POS Sale', needs: 'sell' },
  { id: 'products', label: 'Products & Stock' },
  { id: 'purchases', label: 'Purchases', needs: 'managePurchases' },
  { id: 'parties', label: 'Customers & Suppliers' },
  { id: 'expenses', label: 'Expenses', needs: 'manageExpenses' },
];

export default function App() {
  const { user, ready, logout, can } = useAuth();
  const [page, setPage] = useState<PageId>('dashboard');

  if (!ready) return <div className="splash">Loading…</div>;
  if (!user) return <Login />;

  const visible = NAV.filter((n) => !n.needs || can(n.needs));
  const current = visible.some((n) => n.id === page) ? page : 'dashboard';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">SA Telecom<span>POS + ERP</span></div>
        <nav>
          {visible.map((n) => (
            <button
              key={n.id}
              className={n.id === current ? 'nav active' : 'nav'}
              onClick={() => setPage(n.id)}
            >
              {n.label}
            </button>
          ))}
        </nav>
        <div className="me">
          <div>{user.name}</div>
          <small>{user.role}</small>
          <button className="ghost" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="content">
        {current === 'dashboard' && <Dashboard />}
        {current === 'pos' && <Pos />}
        {current === 'products' && <Products />}
        {current === 'purchases' && <Purchases />}
        {current === 'parties' && <Parties />}
        {current === 'expenses' && <Expenses />}
      </main>
    </div>
  );
}
