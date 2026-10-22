import { Router } from 'express';
import { httpError, round2 } from '../lib/http.js';
import { openBills } from '../lib/dues.js';

/**
 * Receivables views for dealers (other repair shops and technicians who bring work)
 * and any customer who owes money. Mounted at /api/customers before the generic party routes.
 */
export function dealersRouter(db) {
  const router = Router();

  /** Everyone who owes money, biggest first, with how old the oldest unpaid bill is. */
  router.get('/dues', (_req, res) => {
    const rows = db.prepare('SELECT * FROM customers WHERE balance > 0.004 ORDER BY balance DESC').all();
    res.json(rows.map((c) => {
      const bills = openBills(db, c.id);
      return {
        id: c.id,
        name: c.name,
        mobile: c.mobile,
        customerType: c.customer_type,
        balance: round2(c.balance),
        creditLimit: c.credit_limit,
        overLimit: c.credit_limit > 0 && c.balance > c.credit_limit,
        openBills: bills.length,
        oldestDays: bills.reduce((m, b) => Math.max(m, b.days), 0),
      };
    }));
  });

  router.get('/:id/open-bills', (req, res) => {
    const c = db.prepare('SELECT id FROM customers WHERE id = ?').get(req.params.id);
    if (!c) throw httpError(404, 'Customer not found');
    res.json(openBills(db, c.id));
  });

  /**
   * Statement with a running balance. Bills add their total; payments at the counter, later
   * collections and return credits subtract. The closing balance equals the customer's due.
   */
  router.get('/:id/statement', (req, res) => {
    const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!c) throw httpError(404, 'Customer not found');

    const entries = [
      ...db.prepare('SELECT id, invoice_no, created_at, total, paid FROM sales WHERE customer_id = ?').all(c.id)
        .map((s) => ({ date: s.created_at, kind: 'sale', ref: s.invoice_no, docId: s.id, debit: s.total, credit: s.paid })),
      ...db.prepare(`SELECT id, job_no, device, delivered_at, total, advance, delivery_paid, refunded FROM repair_jobs
                     WHERE customer_id = ? AND status = 'delivered'`).all(c.id)
        .map((j) => ({
          date: j.delivered_at, kind: 'repair', ref: j.job_no, docId: j.id, note: j.device,
          debit: j.total, credit: round2(j.advance + j.delivery_paid - j.refunded),
        })),
      ...db.prepare(`SELECT p.id, p.amount, p.created_at, p.note, a.name AS account FROM payments p
                     JOIN accounts a ON a.id = p.account_id WHERE p.ref_type = 'customer_collection' AND p.ref_id = ?`).all(c.id)
        .map((p) => ({ date: p.created_at, kind: 'collection', ref: `PAY-${p.id}`, note: p.note || p.account, debit: 0, credit: p.amount })),
      ...db.prepare(`SELECT r.id, r.return_no, r.credited, r.created_at, s.invoice_no FROM sale_returns r
                     JOIN sales s ON s.id = r.sale_id WHERE s.customer_id = ? AND r.credited > 0`).all(c.id)
        .map((r) => ({ date: r.created_at, kind: 'return', ref: r.return_no, note: r.invoice_no, debit: 0, credit: r.credited })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const day = (d) => String(d).slice(0, 10);
    let opening = 0;
    let running = 0;
    const lines = [];
    for (const e of entries) {
      running = round2(running + e.debit - e.credit);
      if (from && day(e.date) < from) { opening = running; continue; }
      if (to && day(e.date) > to) continue;
      lines.push({ ...e, balance: running });
    }
    const closing = lines.length ? lines[lines.length - 1].balance : opening;

    res.json({
      customer: { id: c.id, name: c.name, mobile: c.mobile, customerType: c.customer_type, creditLimit: c.credit_limit, balance: round2(c.balance) },
      from,
      to,
      opening: round2(opening),
      closing: round2(closing),
      totalDebit: round2(lines.reduce((s, l) => s + l.debit, 0)),
      totalCredit: round2(lines.reduce((s, l) => s + l.credit, 0)),
      lines,
      openBills: openBills(db, c.id),
    });
  });

  return router;
}
