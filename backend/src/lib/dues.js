import { hasPerm } from './auth.js';
import { httpError, round2, toMoney } from './http.js';

/**
 * Customer dues are tracked per bill: a sale or a delivered repair job with `due > 0`.
 * Collections and return credits are allocated to bills in `due_allocations`; a bill's
 * remaining due is its `due` minus what has been allocated to it.
 */
const OPEN_BILLS = `
  SELECT doc_type, doc_id, ref, doc_date, due, allocated FROM (
    SELECT 'sale' AS doc_type, s.id AS doc_id, s.invoice_no AS ref, s.created_at AS doc_date, s.due AS due,
      (SELECT COALESCE(SUM(a.amount), 0) FROM due_allocations a WHERE a.doc_type = 'sale' AND a.doc_id = s.id) AS allocated
    FROM sales s WHERE s.customer_id = ? AND s.due > 0
    UNION ALL
    SELECT 'repair', j.id, j.job_no, j.delivered_at, j.due,
      (SELECT COALESCE(SUM(a.amount), 0) FROM due_allocations a WHERE a.doc_type = 'repair' AND a.doc_id = j.id)
    FROM repair_jobs j WHERE j.customer_id = ? AND j.status = 'delivered' AND j.due > 0
  ) ORDER BY doc_date, doc_type, doc_id`;

export function daysSince(sqlDate) {
  if (!sqlDate) return 0;
  const t = Date.parse(`${String(sqlDate).replace(' ', 'T')}Z`);
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** Unpaid bills of a customer, oldest first. */
export function openBills(db, customerId) {
  return db.prepare(OPEN_BILLS).all(customerId, customerId)
    .map((d) => ({
      docType: d.doc_type,
      docId: d.doc_id,
      ref: d.ref,
      date: d.doc_date,
      due: d.due,
      remaining: round2(d.due - d.allocated),
      days: daysSince(d.doc_date),
    }))
    .filter((d) => d.remaining > 0.004);
}

/**
 * Records which bills an amount settles. `picks` ([{docType, docId, amount?}]) are applied first,
 * then `prefer` (one bill), then the oldest bills. Anything left is simply unallocated.
 * Must be called inside a transaction.
 */
export function allocateDue(db, { customerId, amount, sourceType, sourceId = null, picks = [], prefer = null }) {
  const bills = openBills(db, customerId);
  const insert = db.prepare(`INSERT INTO due_allocations (customer_id, doc_type, doc_id, amount, source_type, source_id)
                             VALUES (?, ?, ?, ?, ?, ?)`);
  let left = round2(amount);
  const take = (bill, wanted) => {
    const amt = round2(Math.min(wanted, bill.remaining, left));
    if (amt <= 0) return;
    insert.run(customerId, bill.docType, bill.docId, amt, sourceType, sourceId);
    bill.remaining = round2(bill.remaining - amt);
    left = round2(left - amt);
  };
  const find = (docType, docId) => bills.find((b) => b.docType === docType && b.docId === Number(docId));

  for (const p of picks) {
    const bill = find(p.docType, p.docId);
    if (!bill) throw httpError(400, 'A selected bill is already paid or belongs to another customer');
    const wanted = p.amount === undefined ? bill.remaining : toMoney(p.amount, 'Bill amount');
    if (wanted > bill.remaining + 0.004) throw httpError(400, `${bill.ref}: only ${bill.remaining} is still due`);
    take(bill, wanted);
  }
  if (prefer) {
    const bill = find(prefer.docType, prefer.docId);
    if (bill) take(bill, left);
  }
  for (const bill of bills) {
    if (left <= 0) break;
    take(bill, left);
  }
  return round2(amount - left);
}

/**
 * Blocks new due beyond the customer's credit limit (0 = no limit). Users with manageParties
 * may pass `override` after the warning, so the shop can still serve a trusted dealer.
 */
export function assertCreditLimit(db, customerId, addDue, user, override = false) {
  if (!customerId || addDue <= 0) return;
  const c = db.prepare('SELECT name, balance, credit_limit FROM customers WHERE id = ?').get(customerId);
  if (!c || !(c.credit_limit > 0)) return;
  const after = round2(c.balance + addDue);
  if (after <= c.credit_limit) return;
  if (override && hasPerm(user, 'manageParties')) return;
  throw httpError(400, `Credit limit exceeded for ${c.name}: limit ${c.credit_limit}, due would become ${after}`);
}
