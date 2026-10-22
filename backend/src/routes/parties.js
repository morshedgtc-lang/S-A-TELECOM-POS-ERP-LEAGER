import { Router } from 'express';
import { requirePerm } from '../lib/auth.js';
import { audit, httpError, requireText, round2, toMoney } from '../lib/http.js';
import { tx } from '../lib/db.js';
import { moveMoney } from '../lib/ledger.js';

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
    ...(isCustomer ? { customerType: r.customer_type } : {}),
  });

  router.get('/', (_req, res) => {
    res.json(db.prepare(`SELECT * FROM ${table} ORDER BY name`).all().map(toParty));
  });

  router.post('/', requirePerm('manageParties'), (req, res) => {
    const name = requireText(req.body?.name, 'Name');
    const type = isCustomer ? (req.body?.customerType === 'wholesaler' ? 'wholesaler' : 'retail') : null;
    const result = isCustomer
      ? db.prepare('INSERT INTO customers (name, mobile, address, customer_type) VALUES (?, ?, ?, ?)')
        .run(name, req.body?.mobile ?? null, req.body?.address ?? null, type)
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
    audit(db, req.user, `${kind}_update`, row.name, `id=${row.id}`);
    res.json({ id: row.id });
  });

  /** Records a collection (customer pays due) or a payment (shop pays supplier). */
  router.post('/:id/settlements', requirePerm('manageMoney'), (req, res) => {
    const amount = toMoney(req.body?.amount, 'Amount');
    if (amount <= 0) throw httpError(400, 'Amount must be greater than zero');
    const accountId = Number(req.body?.accountId);
    const party = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!party) throw httpError(404, `${kind} not found`);
    if (amount > round2(party.balance)) {
      throw httpError(400, `Amount is more than the outstanding balance (${round2(party.balance)})`);
    }
    tx(db, () => {
      moveMoney(db, {
        accountId,
        direction,
        amount,
        refType: settleRef,
        refId: party.id,
        note: req.body?.note ?? '',
        userId: req.user.id,
      });
      db.prepare(`UPDATE ${table} SET balance = ? WHERE id = ?`).run(round2(party.balance - amount), party.id);
    });
    audit(db, req.user, settleRef, party.name, `amount=${amount}`);
    res.status(201).json({ id: party.id, balance: round2(party.balance - amount) });
  });

  return router;
}

export const customersRouter = (db) => partyRouter(db, { table: 'customers', kind: 'customer' });
export const suppliersRouter = (db) => partyRouter(db, { table: 'suppliers', kind: 'supplier' });
