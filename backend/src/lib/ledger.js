import { httpError, round2 } from './http.js';

/**
 * Moves money in or out of an account and writes the matching payments row.
 * Must be called inside a transaction.
 */
export function moveMoney(db, { accountId, direction, amount, refType, refId = null, note = '', userId }) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) throw httpError(400, 'Account not found');
  const value = round2(amount);
  if (direction === 'out' && account.balance < value) {
    throw httpError(400, `Insufficient balance in ${account.name}`);
  }
  const delta = direction === 'in' ? value : -value;
  db.prepare('UPDATE accounts SET balance = ? WHERE id = ?').run(round2(account.balance + delta), accountId);
  db.prepare(`INSERT INTO payments (account_id, direction, amount, ref_type, ref_id, note, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(accountId, direction, value, refType, refId, note, userId);
}
