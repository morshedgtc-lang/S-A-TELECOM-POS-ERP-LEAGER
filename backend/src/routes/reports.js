import { Router } from 'express';
import { requirePerm } from '../lib/auth.js';
import { audit, httpError, round2 } from '../lib/http.js';

/** Profit figures for a date range. Shared by the report page and the dashboard. */
export function profitSummary(db, from, to) {
  const range = (col) => `date(${col}, 'localtime') BETWEEN date(?) AND date(?)`;
  const p = [from, to];

  const sales = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total, COALESCE(SUM(discount), 0) AS discount,
                              COALESCE(SUM(due), 0) AS due FROM sales WHERE ${range('created_at')}`).get(...p);
  const saleItems = db.prepare(`SELECT COALESCE(SUM(si.line_total), 0) AS revenue, COALESCE(SUM(si.unit_cost * si.qty), 0) AS cost
                                FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${range('s.created_at')}`).get(...p);
  const returns = db.prepare(`SELECT COUNT(DISTINCT r.id) AS count, COALESCE(SUM(ri.line_total), 0) AS total,
                                COALESCE(SUM(ri.unit_cost * ri.qty), 0) AS cost
                              FROM sale_return_items ri JOIN sale_returns r ON r.id = ri.return_id WHERE ${range('r.created_at')}`).get(...p);
  const repairs = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(technician_cost), 0) AS techCost
                              FROM repair_jobs WHERE status = 'delivered' AND ${range('delivered_at')}`).get(...p);
  const repairParts = db.prepare(`SELECT COALESCE(SUM(rp.unit_cost * rp.qty), 0) AS cost FROM repair_job_parts rp
                                  JOIN repair_jobs j ON j.id = rp.job_id
                                  WHERE j.status = 'delivered' AND rp.restocked = 0 AND ${range('j.delivered_at')}`).get(...p);
  const expenses = db.prepare(`SELECT category, COALESCE(SUM(amount), 0) AS total FROM expenses
                               WHERE ${range('created_at')} GROUP BY category ORDER BY total DESC`).all(...p);

  const salesProfit = round2(saleItems.revenue - sales.discount - saleItems.cost);
  const returnsProfit = round2(returns.total - returns.cost);
  const repairProfit = round2(repairs.revenue - repairParts.cost - repairs.techCost);
  const expenseTotal = round2(expenses.reduce((s, e) => s + e.total, 0));

  return {
    from,
    to,
    sales: { count: sales.count, total: round2(sales.total), discount: round2(sales.discount), due: round2(sales.due), cost: round2(saleItems.cost), profit: salesProfit },
    returns: { count: returns.count, total: round2(returns.total), profitLost: returnsProfit },
    repairs: { delivered: repairs.count, revenue: round2(repairs.revenue), partsCost: round2(repairParts.cost), technicianCost: round2(repairs.techCost), profit: repairProfit },
    expenses: { total: expenseTotal, byCategory: expenses.map((e) => ({ category: e.category, total: round2(e.total) })) },
    netProfit: round2(salesProfit - returnsProfit + repairProfit - expenseTotal),
  };
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function reportsRouter(db) {
  const router = Router();

  router.get('/summary', requirePerm('viewReports'), (req, res) => {
    const from = String(req.query.from || today());
    const to = String(req.query.to || from);
    const summary = profitSummary(db, from, to);

    const cash = db.prepare(`
      SELECT a.id, a.name, a.balance,
        COALESCE(SUM(CASE WHEN p.direction = 'in' THEN p.amount END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN p.direction = 'out' THEN p.amount END), 0) AS cash_out
      FROM accounts a
      LEFT JOIN payments p ON p.account_id = a.id AND date(p.created_at, 'localtime') BETWEEN date(?) AND date(?)
      GROUP BY a.id ORDER BY a.id`).all(from, to);
    const byType = db.prepare(`SELECT ref_type, direction, COALESCE(SUM(amount), 0) AS total FROM payments
                               WHERE date(created_at, 'localtime') BETWEEN date(?) AND date(?)
                               GROUP BY ref_type, direction ORDER BY ref_type`).all(from, to);

    res.json({
      ...summary,
      cashbook: {
        accounts: cash.map((a) => ({ id: a.id, name: a.name, cashIn: round2(a.cash_in), cashOut: round2(a.cash_out), balance: round2(a.balance) })),
        byType: byType.map((t) => ({ refType: t.ref_type, direction: t.direction, total: round2(t.total) })),
      },
    });
  });

  return router;
}

/** Finds a serial / IMEI anywhere: stock units (purchase + sale history) and repair jobs. */
export function lookupRouter(db) {
  const router = Router();

  router.get('/imei', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 3) throw httpError(400, 'Type at least 3 characters');
    const units = db.prepare(`
      SELECT u.serial, u.status, p.name AS product_name, pu.invoice_no AS purchase_no, pu.created_at AS purchased_at,
             sup.name AS supplier_name, s.invoice_no AS sale_no, s.id AS sale_id, s.created_at AS sold_at, c.name AS customer_name
      FROM stock_units u
      JOIN products p ON p.id = u.product_id
      LEFT JOIN purchase_items pi ON pi.id = u.purchase_item_id
      LEFT JOIN purchases pu ON pu.id = pi.purchase_id
      LEFT JOIN suppliers sup ON sup.id = pu.supplier_id
      LEFT JOIN sale_items si ON si.id = u.sale_item_id
      LEFT JOIN sales s ON s.id = si.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE u.serial LIKE ? ORDER BY u.id DESC LIMIT 50`).all(`%${q}%`);
    const jobs = db.prepare(`
      SELECT j.id, j.job_no, j.device, j.imei, j.status, j.created_at, c.name AS customer_name, c.mobile AS customer_mobile
      FROM repair_jobs j JOIN customers c ON c.id = j.customer_id
      WHERE j.imei LIKE ? ORDER BY j.id DESC LIMIT 50`).all(`%${q}%`);
    res.json({
      units: units.map((u) => ({
        serial: u.serial,
        status: u.status,
        productName: u.product_name,
        purchaseNo: u.purchase_no,
        purchasedAt: u.purchased_at,
        supplierName: u.supplier_name,
        saleId: u.sale_id,
        saleNo: u.sale_no,
        soldAt: u.sold_at,
        customerName: u.customer_name,
      })),
      repairs: jobs.map((j) => ({
        id: j.id, jobNo: j.job_no, device: j.device, imei: j.imei, status: j.status,
        customerName: j.customer_name, customerMobile: j.customer_mobile, createdAt: j.created_at,
      })),
    });
  });

  return router;
}

const SETTING_KEYS = ['shopName', 'shopPhone', 'shopAddress', 'invoiceFooter', 'repairTerms'];

export function settingsRouter(db) {
  const router = Router();

  const read = () => {
    const out = { shopName: 'SA Telecom', shopPhone: '', shopAddress: '', invoiceFooter: 'ধন্যবাদ, আবার আসবেন!', repairTerms: '' };
    for (const row of db.prepare('SELECT key, value FROM settings').all()) {
      if (SETTING_KEYS.includes(row.key)) out[row.key] = row.value;
    }
    return out;
  };

  router.get('/', (_req, res) => res.json(read()));

  router.patch('/', requirePerm('manageSettings'), (req, res) => {
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    for (const key of SETTING_KEYS) {
      if (req.body?.[key] !== undefined) upsert.run(key, String(req.body[key]).slice(0, 500));
    }
    audit(db, req.user, 'settings_update', 'shop');
    res.json(read());
  });

  return router;
}
