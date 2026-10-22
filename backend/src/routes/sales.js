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
    items: items.map((i) => {
      const units = db.prepare('SELECT serial, status FROM stock_units WHERE sale_item_id = ? ORDER BY id').all(i.id);
      const returned = db.prepare('SELECT COALESCE(SUM(qty), 0) AS q FROM sale_return_items WHERE sale_item_id = ?').get(i.id).q;
      return {
        id: i.id,
        productId: i.product_id,
        productName: i.product_name,
        qty: i.qty,
        returnedQty: returned,
        unitPrice: i.unit_price,
        lineTotal: i.line_total,
        serials: units.map((u) => u.serial),
        returnableSerials: units.filter((u) => u.status === 'sold').map((u) => u.serial),
        ...(hasPerm(user, 'viewCost') ? { unitCost: i.unit_cost } : {}),
      };
    }),
    returns: db.prepare('SELECT id, return_no AS returnNo, total, credited, refunded, created_at AS createdAt FROM sale_returns WHERE sale_id = ? ORDER BY id')
      .all(id),
  };
}

/**
 * Takes items back from a sale. The refund value uses the price after the sale's discount share.
 * It first reduces the customer's due; anything left is paid back from the chosen account.
 */
function createReturn(db, saleId, body, user) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale) throw httpError(404, 'Sale not found');
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) throw httpError(400, 'Choose at least one item to return');
  const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 1;

  const lines = items.map((it) => {
    const item = db.prepare('SELECT si.*, p.name, p.serialized FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.id = ? AND si.sale_id = ?')
      .get(Number(it.saleItemId) || 0, sale.id);
    if (!item) throw httpError(400, 'Item is not on this invoice');
    const already = db.prepare('SELECT COALESCE(SUM(qty), 0) AS q FROM sale_return_items WHERE sale_item_id = ?').get(item.id).q;
    let serials = [];
    let qty;
    if (item.serialized === 1) {
      serials = Array.isArray(it.serials) ? it.serials.map((s) => String(s).trim()).filter(Boolean) : [];
      if (serials.length === 0) throw httpError(400, `${item.name}: choose the serial(s) being returned`);
      for (const serial of serials) {
        const unit = db.prepare("SELECT 1 FROM stock_units WHERE serial = ? AND sale_item_id = ? AND status = 'sold'").get(serial, item.id);
        if (!unit) throw httpError(400, `Serial ${serial} was not sold on this invoice or is already returned`);
      }
      qty = serials.length;
    } else {
      qty = toPositiveInt(it.qty, 'Return quantity');
    }
    if (qty > item.qty - already) throw httpError(400, `${item.name}: only ${item.qty - already} can be returned`);
    const unitPrice = round2(item.unit_price * ratio);
    return { item, qty, serials, unitPrice, lineTotal: round2(unitPrice * qty) };
  });

  const total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const customer = sale.customer_id ? db.prepare('SELECT * FROM customers WHERE id = ?').get(sale.customer_id) : null;
  const credited = customer ? round2(Math.min(Math.max(customer.balance, 0), total)) : 0;
  const refunded = round2(total - credited);
  const accountId = body.accountId ? Number(body.accountId) : null;
  if (refunded > 0 && !accountId) throw httpError(400, 'Choose the account to refund from');

  return tx(db, () => {
    const r = db.prepare('INSERT INTO sale_returns (return_no, sale_id, total, credited, refunded, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(invoiceNo('RET'), sale.id, total, credited, refunded, body.note ?? null, user.id);
    const returnId = Number(r.lastInsertRowid);
    for (const l of lines) {
      db.prepare(`INSERT INTO sale_return_items (return_id, sale_item_id, product_id, qty, unit_price, unit_cost, line_total, serials)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(returnId, l.item.id, l.item.product_id, l.qty, l.unitPrice, l.item.unit_cost, l.lineTotal, l.serials.join(',') || null);
      for (const serial of l.serials) {
        db.prepare("UPDATE stock_units SET status = 'in_stock' WHERE serial = ?").run(serial);
      }
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(l.qty, l.item.product_id);
    }
    if (credited > 0) db.prepare('UPDATE customers SET balance = ? WHERE id = ?').run(round2(customer.balance - credited), customer.id);
    if (refunded > 0) {
      moveMoney(db, { accountId, direction: 'out', amount: refunded, refType: 'sale_return', refId: returnId, userId: user.id });
    }
    return { id: returnId, total, credited, refunded };
  });
}

export function salesRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const { clauses, params } = dateClauses(req.query, 's.created_at');
    const q = String(req.query.q ?? '').trim();
    if (q) {
      clauses.push('(s.invoice_no LIKE ? OR c.name LIKE ? OR c.mobile LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
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

  router.get('/returns', (req, res) => {
    const { clauses, params } = dateClauses(req.query, 'r.created_at');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT r.*, s.invoice_no, c.name AS customer_name, u.name AS created_by_name FROM sale_returns r
      JOIN sales s ON s.id = r.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      JOIN users u ON u.id = r.created_by
      ${where} ORDER BY r.id DESC LIMIT 300`).all(...params);
    res.json(rows.map((r) => ({
      id: r.id,
      returnNo: r.return_no,
      saleId: r.sale_id,
      invoiceNo: r.invoice_no,
      customerName: r.customer_name ?? 'Walk-in',
      total: r.total,
      credited: r.credited,
      refunded: r.refunded,
      createdBy: r.created_by_name,
      createdAt: r.created_at,
    })));
  });

  router.get('/:id', (req, res) => {
    const sale = getSale(db, req.params.id, req.user);
    if (!sale) throw httpError(404, 'Sale not found');
    res.json(sale);
  });

  router.post('/:id/returns', requirePerm('manageReturns'), (req, res) => {
    const result = createReturn(db, req.params.id, req.body ?? {}, req.user);
    audit(db, req.user, 'sale_return', `sale#${req.params.id}`, `total=${result.total}; refunded=${result.refunded}`);
    res.status(201).json(result);
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
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(Number(it.productId) || 0);
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
