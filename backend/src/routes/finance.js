import { Router } from 'express';
import { hasPerm, requireOwner, requirePerm } from '../lib/auth.js';
import { tx } from '../lib/db.js';
import { audit, dateClauses, httpError, requireText, round2, toMoney } from '../lib/http.js';
import { moveMoney } from '../lib/ledger.js';
import { profitSummary } from './reports.js';

const ACCOUNT_TYPES = ['cash', 'bank', 'mobile_wallet'];

export function accountsRouter(db) {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(db.prepare('SELECT id, name, account_type AS accountType, balance FROM accounts ORDER BY id').all());
  });

  router.post('/', requirePerm('manageMoney'), (req, res) => {
    const name = requireText(req.body?.name, 'Account name');
    const accountType = req.body?.accountType;
    if (!ACCOUNT_TYPES.includes(accountType)) throw httpError(400, 'Account type must be cash, bank or mobile_wallet');
    const opening = toMoney(req.body?.openingBalance, 'Opening balance');
    const result = tx(db, () => {
      const r = db.prepare('INSERT INTO accounts (name, account_type, balance) VALUES (?, ?, ?)')
        .run(name, accountType, opening);
      if (opening > 0) {
        db.prepare(`INSERT INTO payments (account_id, direction, amount, ref_type, note, created_by)
                    VALUES (?, 'in', ?, 'account_opening', 'Opening balance', ?)`)
          .run(Number(r.lastInsertRowid), opening, req.user.id);
      }
      return r;
    });
    audit(db, req.user, 'account_create', name, `type=${accountType}`);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  return router;
}

export function expensesRouter(db) {
  const router = Router();

  router.get('/', requirePerm('manageExpenses'), (req, res) => {
    const { clauses, params } = dateClauses(req.query);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`
      SELECT e.*, a.name AS account_name, u.name AS created_by_name FROM expenses e
      JOIN accounts a ON a.id = e.account_id
      JOIN users u ON u.id = e.created_by
      ${where} ORDER BY e.created_at DESC, e.id DESC LIMIT 500`).all(...params);
    res.json(rows.map((e) => ({
      id: e.id,
      category: e.category,
      amount: e.amount,
      accountName: e.account_name,
      note: e.note,
      createdBy: e.created_by_name,
      createdAt: e.created_at,
    })));
  });

  router.post('/', requirePerm('manageExpenses'), (req, res) => {
    const category = requireText(req.body?.category, 'Category');
    const amount = toMoney(req.body?.amount, 'Amount');
    if (amount <= 0) throw httpError(400, 'Amount must be greater than zero');
    const accountId = Number(req.body?.accountId);
    const id = tx(db, () => {
      const r = db.prepare('INSERT INTO expenses (category, amount, account_id, note, created_by) VALUES (?, ?, ?, ?, ?)')
        .run(category, amount, accountId, req.body?.note ?? null, req.user.id);
      const expenseId = Number(r.lastInsertRowid);
      moveMoney(db, { accountId, direction: 'out', amount, refType: 'expense', refId: expenseId, userId: req.user.id });
      return expenseId;
    });
    audit(db, req.user, 'expense_create', category, `amount=${amount}`);
    res.status(201).json({ id });
  });

  /** Removes a wrong expense and puts the money back into its account (both movements stay in the cash book). */
  router.delete('/:id', requireOwner, (req, res) => {
    const e = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    if (!e) throw httpError(404, 'Expense not found');
    tx(db, () => {
      moveMoney(db, {
        accountId: e.account_id, direction: 'in', amount: e.amount, refType: 'expense_reversal', refId: e.id,
        note: `Deleted expense: ${e.category}`, userId: req.user.id,
      });
      db.prepare('DELETE FROM expenses WHERE id = ?').run(e.id);
    });
    audit(db, req.user, 'expense_delete', e.category, `id=${e.id}; amount=${e.amount}; created=${e.created_at}`);
    res.json({ deleted: true });
  });

  return router;
}

export function dashboardRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const today = `date('now', 'localtime')`;
    const sales = db.prepare(`SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(due), 0) AS due, COUNT(*) AS count
                              FROM sales WHERE date(created_at, 'localtime') = ${today}`).get();
    const expenses = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
                                 WHERE date(created_at, 'localtime') = ${today}`).get();
    const receivable = db.prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM customers').get();
    const payable = db.prepare('SELECT COALESCE(SUM(balance), 0) AS total FROM suppliers').get();
    const cash = db.prepare('SELECT id, name, account_type AS accountType, balance FROM accounts ORDER BY id').all();
    const lowStock = db.prepare(`SELECT id, name, stock, low_stock_limit AS lowStockLimit FROM products
                                 WHERE active = 1 AND stock <= low_stock_limit ORDER BY stock LIMIT 20`).all();

    const body = {
      today: { salesTotal: round2(sales.total), salesCount: sales.count, salesDue: round2(sales.due), expenses: round2(expenses.total) },
      receivable: round2(receivable.total),
      payable: round2(payable.total),
      accounts: cash,
      lowStock,
    };

    // Repair desk: open jobs by status (legacy "Hold amount" card) and technician payable.
    const byStatus = db.prepare(`SELECT status, COUNT(*) AS count, COALESCE(SUM(estimated_cost), 0) AS estimated,
                                   COALESCE(SUM(advance), 0) AS advance
                                 FROM repair_jobs WHERE status <> 'delivered' GROUP BY status`).all();
    const statusMap = Object.fromEntries(['in_work', 'out_work', 'success', 'failed'].map((s) => {
      const row = byStatus.find((r) => r.status === s);
      return [s, { count: row?.count ?? 0, estimated: round2(row?.estimated ?? 0), advance: round2(row?.advance ?? 0) }];
    }));
    const deliveredToday = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total FROM repair_jobs
                                       WHERE status = 'delivered' AND date(delivered_at, 'localtime') = ${today}`).get();
    const techs = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(balance), 0) AS payable FROM technicians WHERE active = 1').get();
    body.repairs = {
      byStatus: statusMap,
      holdTotal: round2(Object.values(statusMap).reduce((s, v) => s + v.estimated, 0)),
      advanceHeld: round2(Object.values(statusMap).reduce((s, v) => s + v.advance, 0)),
      deliveredToday: { count: deliveredToday.count, total: round2(deliveredToday.total) },
      technicians: techs.count,
      technicianPayable: round2(techs.payable),
    };

    if (hasPerm(req.user, 'viewProfit')) {
      const day = db.prepare(`SELECT ${today} AS d`).get().d;
      body.today.grossProfit = profitSummary(db, day, day).netProfit;
    }
    res.json(body);
  });

  return router;
}

export function auditRouter(db) {
  const router = Router();

  router.get('/', requirePerm('viewAudit'), (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    res.json(db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit).map((a) => ({
      id: a.id,
      userName: a.user_name,
      action: a.action,
      target: a.target,
      details: a.details,
      createdAt: a.created_at,
    })));
  });

  return router;
}
