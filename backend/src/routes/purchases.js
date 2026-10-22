import { Router } from 'express';
import { requirePerm } from '../lib/auth.js';
import { tx } from '../lib/db.js';
import { audit, dateClauses, httpError, invoiceNo, round2, toMoney, toPositiveInt, toNumber } from '../lib/http.js';
import { moveMoney } from '../lib/ledger.js';

export function purchasesRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { clauses, params } = dateClauses(req.query);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT p.*, s.name AS supplier_name FROM purchases p
      JOIN suppliers s ON s.id = p.supplier_id
      ${where} ORDER BY p.created_at DESC, p.id DESC LIMIT 500`).all(...params);
    res.json(rows.map((p) => ({
      id: p.id,
      invoiceNo: p.invoice_no,
      supplierName: p.supplier_name,
      total: p.total,
      paid: p.paid,
      due: p.due,
      createdAt: p.created_at,
    })));
  });

  router.get('/:id', (req, res) => {
    const p = db.prepare(`SELECT p.*, s.name AS supplier_name FROM purchases p
                          JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`).get(req.params.id);
    if (!p) throw httpError(404, 'Purchase not found');
    const items = db.prepare(`SELECT pi.*, pr.name AS product_name FROM purchase_items pi
                              JOIN products pr ON pr.id = pi.product_id WHERE pi.purchase_id = ? ORDER BY pi.id`)
      .all(p.id);
    res.json({
      id: p.id,
      invoiceNo: p.invoice_no,
      supplierId: p.supplier_id,
      supplierName: p.supplier_name,
      total: p.total,
      paid: p.paid,
      due: p.due,
      note: p.note,
      createdAt: p.created_at,
      items: items.map((i) => ({
        productId: i.product_id,
        productName: i.product_name,
        qty: i.qty,
        unitCost: i.unit_cost,
        lineTotal: i.line_total,
      })),
    });
  });

  /**
   * Records stock coming in. Serialized products create one stock unit per serial;
   * the unpaid part is added to the supplier's payable balance.
   */
  router.post('/', requirePerm('managePurchases'), (req, res) => {
    const body = req.body ?? {};
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(body.supplierId);
    if (!supplier) throw httpError(400, 'Supplier not found');
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) throw httpError(400, 'Add at least one item');

    const lines = items.map((it) => {
      const qty = toPositiveInt(it.qty, 'Quantity');
      const unitCost = toMoney(it.unitCost, 'Unit cost');
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(it.productId);
      if (!product) throw httpError(400, `Product ${it.productId} not found`);
      let serials = [];
      if (product.serialized === 1) {
        serials = Array.isArray(it.serials) ? it.serials.map((s) => String(s).trim()).filter(Boolean) : [];
        if (serials.length !== qty) throw httpError(400, `${product.name}: enter ${qty} serial number(s)`);
        if (new Set(serials).size !== serials.length) throw httpError(400, `${product.name}: duplicate serial`);
        for (const serial of serials) {
          if (db.prepare('SELECT 1 FROM stock_units WHERE serial = ?').get(serial)) {
            throw httpError(409, `Serial ${serial} already exists`);
          }
        }
      }
      return { product, qty, unitCost, serials, lineTotal: round2(qty * unitCost) };
    });

    const total = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
    const paid = toMoney(body.paid, 'Paid');
    if (paid > total) throw httpError(400, 'Paid amount cannot exceed the total');
    const due = round2(total - paid);
    const accountId = body.accountId ? Number(body.accountId) : null;
    if (paid > 0 && !accountId) throw httpError(400, 'Choose the account that paid the supplier');

    const purchaseId = tx(db, () => {
      const head = db.prepare(`INSERT INTO purchases (invoice_no, supplier_id, total, paid, due, note, created_by)
                               VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(invoiceNo('PUR'), supplier.id, total, paid, due, body.note ?? null, req.user.id);
      const id = Number(head.lastInsertRowid);

      for (const line of lines) {
        const item = db.prepare(`INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost, line_total)
                                 VALUES (?, ?, ?, ?, ?)`)
          .run(id, line.product.id, line.qty, line.unitCost, line.lineTotal);
        for (const serial of line.serials) {
          db.prepare('INSERT INTO stock_units (product_id, serial, purchase_item_id) VALUES (?, ?, ?)')
            .run(line.product.id, serial, Number(item.lastInsertRowid));
        }
        db.prepare('UPDATE products SET stock = stock + ?, buy_price = ? WHERE id = ?')
          .run(line.qty, line.unitCost, line.product.id);
      }

      if (paid > 0) {
        moveMoney(db, { accountId, direction: 'out', amount: paid, refType: 'purchase', refId: id, userId: req.user.id });
      }
      if (due > 0) {
        db.prepare('UPDATE suppliers SET balance = balance + ? WHERE id = ?').run(due, supplier.id);
      }
      return id;
    });

    audit(db, req.user, 'purchase_create', `purchase#${purchaseId}`, `total=${total}; due=${due}`);
    res.status(201).json({ id: purchaseId, total, paid, due });
  });

  return router;
}
