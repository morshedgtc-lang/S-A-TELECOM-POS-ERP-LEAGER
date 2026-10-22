import { useEffect, useState } from 'react';
import { api, money } from '../api';
import { useAuth } from '../auth';
import type { Dashboard as DashboardData } from '../types';

export default function Dashboard() {
  const { can } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<DashboardData>('GET', '/dashboard').then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="muted">Loading dashboard…</div>;

  return (
    <section>
      <h2>Today</h2>
      <div className="grid">
        <Stat label="Sales" value={money(data.today.salesTotal)} sub={`${data.today.salesCount} invoice(s)`} />
        <Stat label="Sales due" value={money(data.today.salesDue)} />
        <Stat label="Expenses" value={money(data.today.expenses)} />
        {can('viewProfit') && data.today.grossProfit !== undefined && (
          <Stat label="Gross profit" value={money(data.today.grossProfit)} />
        )}
        <Stat label="Customer receivable" value={money(data.receivable)} />
        <Stat label="Supplier payable" value={money(data.payable)} />
      </div>

      <div className="two-col">
        <div className="card">
          <h3>Cash & accounts</h3>
          <table>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id}><td>{a.name}</td><td className="num">{money(a.balance)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Low stock</h3>
          {data.lowStock.length === 0 ? <p className="muted">Nothing below the alert limit.</p> : (
            <table>
              <tbody>
                {data.lowStock.map((p) => (
                  <tr key={p.id}><td>{p.name}</td><td className="num warn">{p.stock} / limit {p.lowStockLimit}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card stat">
      <div className="muted">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}
