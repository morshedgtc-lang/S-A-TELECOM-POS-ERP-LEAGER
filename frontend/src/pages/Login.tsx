import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(userId, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>SA TELECOM</h1>
        <p className="muted">POS • সার্ভিস + বিক্রয় • ERP</p>
        <label>ইউজার ID
          <input value={userId} onChange={(e) => setUserId(e.target.value)} autoComplete="username" required />
        </label>
        <label>পাসওয়ার্ড
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password" required />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? 'লগইন হচ্ছে…' : 'লগইন'}</button>
      </form>
    </div>
  );
}
