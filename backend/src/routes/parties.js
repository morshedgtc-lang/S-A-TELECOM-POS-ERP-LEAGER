import { Router } from 'express';
import { requireOwner, requirePerm } from '../lib/auth.js';
import { audit, httpError, requireText, round2, toMoney } from '../lib/http.js';
import { tx } from '../lib/db.js';
import { moveMoney } from '../lib/ledger.js';
import { allocateDue } from '../lib/dues.js';

function dealerDiscount(v) {
  const n = toMoney(v, 'Dealer discount');
  if (n > 100) throw httpError(400, 'Dealer discount is a percentage (0–100)');
  return n;
}

/**
 * Customers (receivable) and suppliers (payable) share the same shape and endpoints.
 * Settling a balance writes an account movement, so the cash book and the party ledger stay in step.
 */
function partyRouter(db, { table, kind }) {
  const router = Router();
  const isCustomer = kind === 'customer';
  const settleRef = isCustomer ? 'customer_collection' : 'supplier_payment';
  const direction = isCustomer ? 'in' : 'out';

  const toParty = (r) => ({
    id: r.id,
    name: r.name,
    mobile: r.mobile,
    address: r.address,
    balance: r.balance,
    ...(isCustomer
      ? { customerType: r.customer_type, creditLimit: r.credit_limit ?? 0, dealerDiscount: r.dealer_discount ?? 0 }
      : {}),
  });

  router.get('/', (_req, res) => {
    res.json(db.prepare(`SELECT * FROM ${table} ORDER BY name`).all().map(toParty));
  });

  router.post('/', requirePerm('manageParties'), (req, res) => {
    const name = requireText(req.body?.name, 'Name');
    const type = isCustomer ? (req.body?.customerType === 'wholesaler' ? 'wholesaler' : 'retail') : null;
    const result = isCustomer
      ? db.prepare('INSERT INTO customers (name, mobile, address, customer_type, credit_limit, dealer_discount) VALUES (?, ?, ?, ?, ?, ?)')
        .run(name, req.body?.mobile ?? null, req.body?.address ?? null, type,
          toMoney(req.body?.creditLimit, 'Credit limit'), dealerDiscount(req.body?.dealerDiscount))
      : db.prepare('INSERT INTO suppliers (name, mobile, address) VALUES (?, ?, ?)')
        .run(name, req.body?.mobile ?? null, req.body?.address ?? null);
    audit(db, req.user, `${kind}_create`, name);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  router.patch('/:id', requirePerm('manageParties'), (req, res) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) throw httpError(404, `${kind} not found`);
    const b = req.body ?? {};
    db.prepare(`UPDATE ${table} SET name = ?, mobile = ?, address = ? WHERE id = ?`).run(
      b.name ? requireText(b.name, 'Name') : row.name,
      b.mobile === undefined ? row.mobile : b.mobile,
      b.address === undefined ? row.address : b.address,
      row.id,
    );
    if (isCustomer && b.customerType) {
      db.prepare('UPDATE customers SET customer_type = ? WHERE id = ?')
        .run(b.customerType === 'wholesaler' ? 'wholesaler' : 'retail', row.id);
    }
    if (isCustomer && (b.creditLimit !== undefined || b.dealerDiscount !== undefined)) {
      db.prepare('UPDATE customers SET credit_limit = ?, dealer_discount = ? WHERE id = ?').run(
        b.creditLimit === undefined ? row.credit_limit : toMoney(b.creditLimit, 'Credit limit'),
        b.dealerDiscount === undefined ? row.dealer_discount : dealerDiscount(b.dealerDiscount),
        row.id,
      );
    }
    audit(db, req.user, `${kind}_update`, row.name, `id=${row.id}`);
    res.json({ id: row.id });
  });

  /** Records a collection (customer pays due) or a payment (shop pays supplier). */
  router.post('/:id/settlements', requirePerm('manageMoney'), (req, res) => {
    // Customers may name the bills this payment is for; otherwise the oldest bills are settled first.
    const picks = isCustomer && Array.isArray(req.body?.allocations) ? req.body.allocations : [];
    const amount = picks.length
      ? round2(picks.reduce((s, p) => s + toMoney(p.amount, 'Bill amount'), 0))
      : toMoney(req.body?.amount, 'Amount');
    if (amount <= 0) throw httpError(400, 'Amount must be greater than zero');
    const accountId = Number(req.body?.accountId);
    const party = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!party) throw httpError(404, `${kind} not found`);
    if (amount > round2(party.balance)) {
      throw httpError(400, `Amount is more than the outstanding balance (${round2(party.balance)})`);
    }
    tx(db, () => {
      const paymentId = moveMoney(db, {
        accountId,
        direction,
        amount,
        refType: settleRef,
        refId: party.id,
        note: req.body?.note ?? '',
        userId: req.user.id,
      });
      db.prepare(`UPDATE ${table} SET balance = ? WHERE id = ?`).run(round2(party.balance - amount), party.id);
      if (isCustomer) allocateDue(db, { customerId: party.id, amount, sourceType: 'collection', sourceId: paymentId, picks });
    });
    audit(db, req.user, settleRef, party.name, `amount=${amount}`);
    res.status(201).json({ id: party.id, balance: round2(party.balance - amount) });
  });

  /** Permanent delete for a wrong entry: only with zero balance and no invoices or payments. */
  router.delete('/:id', requireOwner, (req, res) => {
    const party = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!party) throw httpError(404, `${kind} not found`);
    if (Math.abs(party.balance) > 0.004) {
      throw httpError(409, `${party.name} still has a balance of ${round2(party.balance)}; settle it before deleting`);
    }
    const refs = isCustomer
      ? [['sales', 'customer_id'], ['repair_jobs', 'customer_id'], ['due_allocations', 'customer_id']]
      : [['purchases', 'supplier_id']];
    const used = refs.reduce((n, [tbl, col]) => n + db.prepare(`SELECT COUNT(*) AS n FROM ${tbl} WHERE ${col} = ?`).get(party.id).n, 0)
      + db.prepare('SELECT COUNT(*) AS n FROM payments WHERE ref_type = ? AND ref_id = ?').get(settleRef, party.id).n;
    if (used > 0) throw httpError(409, `${party.name} has invoices or payments, so it cannot be deleted (the history must stay correct)`);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(party.id);
    audit(db, req.user, `${kind}_delete`, party.name, `id=${party.id}; mobile=${party.mobile ?? ''}`);
    res.json({ deleted: true });
  });

  return router;
}

export const customersRouter = (db) => partyRouter(db, { table: 'customers', kind: 'customer' });
export const suppliersRouter = (db) => partyRouter(db, { table: 'suppliers', kind: 'supplier' });
