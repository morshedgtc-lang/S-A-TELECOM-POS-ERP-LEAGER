import { Router } from 'express';
import { hasPerm, requirePerm } from '../lib/auth.js';
import { tx } from '../lib/db.js';
import { audit, dateClauses, httpError, invoiceNo, round2, toMoney, toPositiveInt } from '../lib/http.js';
import { moveMoney } from '../lib/ledger.js';

const SALE_LIST = `
  SELECT s.*, c.name AS customer_name, u.name AS created_by_name
  FROM sales s
  LEFT JOIN customers c ON c.id = s.customer_id
  JOIN users u ON u.id = s.created_by`;

function getSale(db, id, user) {
  const sale = db.prepare(`${SALE_LIST} WHERE s.id = ?`).get(id);
  if (!sale) return null;
  const items = db.prepare(`
    SELECT si.*, p.name AS product_name FROM sale_items si
    JOIN products p ON p.id = si.product_id WHERE si.sale_id = ? ORDER BY si.id`).all(id);
  return {
    id: sale.id,
    invoiceNo: sale.invoice_no,
    customerId: sale.customer_id,
    customerName: sale.customer_name ?? 'Walk-in',
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    paid: sale.paid,
    due: sale.due,
    note: sale.note,
    createdBy: sale.created_by_name,
    createdAt: sale.created_at,
    items: items.map((i) => ({
      productId: i.product_id,
      productName: i.product_name,
      qty: i.qty,
      unitPrice: i.unit_price,
      lineTotal: i.line_total,
      ...(hasPerm(user, 'viewCost') ? { unitCost: i.unit_cost } : {}),
    })),
  };
}

export function salesRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { clauses, params } = dateClauses(req.query);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`${SALE_LIST} ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT 500`).all(...params);
    res.json(rows.map((s) => ({
      id: s.id,
      invoiceNo: s.invoice_no,
      customerName: s.customer_name ?? 'Walk-in',
      total: s.total,
      paid: s.paid,
      due: s.due,
      createdBy: s.created_by_name,
      createdAt: s.created_at,
    })));
  });

  router.get('/:id', (req, res) => {
    const sale = getSale(db, req.params.id, req.user);
    if (!sale) throw httpError(404, 'Sale not found');
    res.json(sale);
  });

  /**
   * Creates a sale. Serialized products must name each unit's serial; others are counted from stock.
   * Any unpaid part becomes customer due, so walk-in (no customer) sales must be paid in full.
   */
  router.post('/', requirePerm('sell'), (req, res) => {
    const body = req.body ?? {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) throw httpError(400, 'Add at least one item');

    const discount = toMoney(body.discount, 'Discount');
    if (discount > 0 && !hasPerm(req.user, 'giveDiscount')) throw httpError(403, 'Permission denied: giveDiscount');
    const customerId = body.customerId ? Number(body.customerId) : null;
    if (customerId && !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) {
      throw httpError(400, 'Customer not found');
    }
    const paid = toMoney(body.paid, 'Paid');
    const accountId = body.accountId ? Number(body.accountId) : null;

    const lines = items.map((it) => {
      const qty = toPositiveInt(it.qty, 'Quantity');
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(it.productId);
      if (!product) throw httpError(400, `Product ${it.productId} not found`);
      const unitPrice = it.unitPrice === undefined ? product.sale_price : toMoney(it.unitPrice, 'Unit price');
      if (unitPrice !== product.sale_price && !hasPerm(req.user, 'editPrice')) {
        throw httpError(403, 'Permission denied: editPrice');
      }
      let serials = [];
      if (product.serialized === 1) {
        serials = Array.isArray(it.serials) ? it.serials.map((s) => String(s).trim()) : [];
        if (serials.length !== qty) throw httpError(400, `${product.name}: enter ${qty} serial number(s)`);
        if (new Set(serials).size !== serials.length) throw httpError(400, `${product.name}: duplicate serial in cart`);
        for (const serial of serials) {
          const unit = db.prepare('SELECT status FROM stock_units WHERE product_id = ? AND serial = ?')
            .get(product.id, serial);
          if (!unit || unit.status !== 'in_stock') throw httpError(400, `Serial ${serial} is not in stock`);
        }
      } else if (product.stock < qty) {
        throw httpError(400, `Insufficient stock for ${product.name} (available ${product.stock})`);
      }
      return { product, qty, unitPrice, serials, lineTotal: round2(qty * unitPrice) };
    });

    const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
    if (discount > subtotal) throw httpError(400, 'Discount cannot exceed subtotal');
    const total = round2(subtotal - discount);
    if (paid > total) throw httpError(400, 'Paid amount cannot exceed the total');
    const due = round2(total - paid);
    if (paid > 0 && !accountId) throw httpError(400, 'Choose the account that received the payment');
    if (due > 0 && !customerId) throw httpError(400, 'Walk-in sales must be paid in full');

    const saleId = tx(db, () => {
      const sale = db.prepare(`INSERT INTO sales (invoice_no, customer_id, subtotal, discount, total, paid, due, note, created_by)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(invoiceNo('SAL'), customerId, subtotal, discount, total, paid, due, body.note ?? null, req.user.id);
      const id = Number(sale.lastInsertRowid);

      for (const line of lines) {
        const item = db.prepare(`INSERT INTO sale_items (sale_id, product_id, qty, unit_price, unit_cost, line_total)
                                 VALUES (?, ?, ?, ?, ?, ?)`)
          .run(id, line.product.id, line.qty, line.unitPrice, line.product.buy_price, line.lineTotal);
        if (line.product.serialized === 1) {
          for (const serial of line.serials) {
            db.prepare("UPDATE stock_units SET status = 'sold', sale_item_id = ? WHERE serial = ?")
              .run(Number(item.lastInsertRowid), serial);
          }
        }
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(line.qty, line.product.id);
      }

      if (paid > 0) {
        moveMoney(db, { accountId, direction: 'in', amount: paid, refType: 'sale', refId: id, userId: req.user.id });
      }
      if (due > 0) {
        db.prepare('UPDATE customers SET balance = balance + ? WHERE id = ?').run(due, customerId);
      }
      return id;
    });

    audit(db, req.user, 'sale_create', `sale#${saleId}`, `total=${total}; due=${due}`);
    res.status(201).json(getSale(db, saleId, req.user));
  });

  return router;
}
