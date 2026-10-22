import { Router } from 'express';
import { hasPerm, requirePerm } from '../lib/auth.js';
import { tx } from '../lib/db.js';
import { audit, httpError, invoiceNo, requireText, round2, toMoney, toPositiveInt } from '../lib/http.js';
import { moveMoney } from '../lib/ledger.js';
import { assertCreditLimit } from '../lib/dues.js';

/** Allowed status moves, same rules as the legacy service tracker. Delivery goes through /deliver. */
const FLOW = {
  in_work: ['out_work', 'success', 'failed'],
  out_work: ['in_work', 'success', 'failed'],
  success: [],
  failed: [],
  delivered: [],
};
export const REPAIR_STATUSES = Object.keys(FLOW);

const JOB_SELECT = `
  SELECT j.*, c.name AS customer_name, c.mobile AS customer_mobile, c.customer_type, c.dealer_discount,
         t.name AS technician_name
  FROM repair_jobs j
  JOIN customers c ON c.id = j.customer_id
  LEFT JOIN technicians t ON t.id = j.technician_id`;

function toJob(r) {
  return {
    id: r.id,
    jobNo: r.job_no,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerMobile: r.customer_mobile,
    customerType: r.customer_type,
    dealerDiscount: r.dealer_discount ?? 0,
    device: r.device,
    imei: r.imei,
    problem: r.problem,
    accessories: r.accessories,
    estimatedCost: r.estimated_cost,
    advance: r.advance,
    status: r.status,
    outcome: r.outcome,
    technicianId: r.technician_id,
    technicianName: r.technician_name,
    technicianCost: r.technician_cost,
    technicianNote: r.technician_note,
    promisedAt: r.promised_at,
    serviceCharge: r.service_charge,
    partsTotal: r.parts_total,
    total: r.total,
    deliveryPaid: r.delivery_paid,
    due: r.due,
    refunded: r.refunded,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deliveredAt: r.delivered_at,
  };
}

function getJob(db, id, user) {
  const row = db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(id);
  if (!row) return null;
  const withCost = hasPerm(user, 'viewCost');
  const parts = db.prepare(`SELECT rp.*, p.name AS product_name FROM repair_job_parts rp
                            JOIN products p ON p.id = rp.product_id WHERE rp.job_id = ? ORDER BY rp.id`).all(id);
  const events = db.prepare(`SELECT e.*, u.name AS user_name FROM repair_job_events e
                             LEFT JOIN users u ON u.id = e.created_by WHERE e.job_id = ? ORDER BY e.id`).all(id);
  const job = toJob(row);
  if (!withCost) delete job.technicianCost;
  return {
    ...job,
    parts: parts.map((p) => ({
      id: p.id,
      productId: p.product_id,
      productName: p.product_name,
      qty: p.qty,
      unitPrice: p.unit_price,
      lineTotal: p.line_total,
      restocked: p.restocked === 1,
      ...(withCost ? { unitCost: p.unit_cost } : {}),
    })),
    events: events.map((e) => ({
      fromStatus: e.from_status,
      toStatus: e.to_status,
      note: e.note,
      userName: e.user_name,
      createdAt: e.created_at,
    })),
  };
}

function logEvent(db, jobId, from, to, note, userId) {
  db.prepare('INSERT INTO repair_job_events (job_id, from_status, to_status, note, created_by) VALUES (?, ?, ?, ?, ?)')
    .run(jobId, from, to, note || null, userId);
}

/** Uses an existing customer by id, or finds one by mobile, or creates one. Call inside a transaction. */
function resolveCustomer(db, body) {
  if (body.customerId) {
    const c = db.prepare('SELECT id FROM customers WHERE id = ?').get(Number(body.customerId) || 0);
    if (!c) throw httpError(400, 'Customer not found');
    return c.id;
  }
  const name = requireText(body.customer?.name, 'Customer name');
  const mobile = String(body.customer?.mobile ?? '').trim() || null;
  if (mobile) {
    const existing = db.prepare('SELECT id FROM customers WHERE mobile = ?').get(mobile);
    if (existing) return existing.id;
  }
  return Number(db.prepare('INSERT INTO customers (name, mobile) VALUES (?, ?)').run(name, mobile).lastInsertRowid);
}

function loadOpenJob(db, id) {
  const job = db.prepare('SELECT * FROM repair_jobs WHERE id = ?').get(id);
  if (!job) throw httpError(404, 'Repair job not found');
  if (job.status === 'delivered') throw httpError(400, 'This job is already delivered');
  return job;
}

export function repairsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const clauses = [];
    const params = [];
    if (req.query.status) {
      if (req.query.status === 'open') clauses.push("j.status <> 'delivered'");
      else {
        clauses.push('j.status = ?');
        params.push(String(req.query.status));
      }
    }
    const q = String(req.query.q ?? '').trim();
    if (q) {
      clauses.push('(j.job_no LIKE ? OR j.device LIKE ? OR j.imei LIKE ? OR c.name LIKE ? OR c.mobile LIKE ?)');
      params.push(...Array(5).fill(`%${q}%`));
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = db.prepare(`${JOB_SELECT} ${where} ORDER BY j.id DESC LIMIT 300`).all(...params);
    const withCost = hasPerm(req.user, 'viewCost');
    res.json(rows.map((r) => {
      const job = toJob(r);
      if (!withCost) delete job.technicianCost;
      return job;
    }));
  });

  router.get('/:id', (req, res) => {
    const job = getJob(db, req.params.id, req.user);
    if (!job) throw httpError(404, 'Repair job not found');
    res.json(job);
  });

  /** Job card intake. An advance goes straight into the chosen account. */
  router.post('/', requirePerm('manageRepairs'), (req, res) => {
    const b = req.body ?? {};
    const device = requireText(b.device, 'Device');
    const problem = requireText(b.problem, 'Problem');
    const estimatedCost = toMoney(b.estimatedCost, 'Estimated cost');
    const advance = toMoney(b.advance, 'Advance');
    const accountId = b.accountId ? Number(b.accountId) : null;
    if (advance > 0 && !accountId) throw httpError(400, 'Choose the account that received the advance');

    const id = tx(db, () => {
      const customerId = resolveCustomer(db, b);
      const r = db.prepare(`INSERT INTO repair_jobs
          (job_no, customer_id, device, imei, problem, accessories, estimated_cost, advance, promised_at, note, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(invoiceNo('TMP'), customerId, device, String(b.imei ?? '').trim() || null, problem,
          b.accessories ?? null, estimatedCost, advance, b.promisedAt || null, b.note ?? null, req.user.id);
      const jobId = Number(r.lastInsertRowid);
      db.prepare('UPDATE repair_jobs SET job_no = ? WHERE id = ?').run(`J${String(jobId).padStart(5, '0')}`, jobId);
      if (advance > 0) {
        moveMoney(db, { accountId, direction: 'in', amount: advance, refType: 'repair_advance', refId: jobId, userId: req.user.id });
      }
      logEvent(db, jobId, null, 'in_work', 'Device received', req.user.id);
      return jobId;
    });
    audit(db, req.user, 'repair_create', `job#${id}`, `device=${device}; advance=${advance}`);
    res.status(201).json(getJob(db, id, req.user));
  });

  router.patch('/:id', requirePerm('manageRepairs'), (req, res) => {
    const job = loadOpenJob(db, req.params.id);
    const b = req.body ?? {};
    db.prepare(`UPDATE repair_jobs SET device = ?, imei = ?, problem = ?, accessories = ?, estimated_cost = ?,
                  promised_at = ?, note = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(
        b.device === undefined ? job.device : requireText(b.device, 'Device'),
        b.imei === undefined ? job.imei : (String(b.imei).trim() || null),
        b.problem === undefined ? job.problem : requireText(b.problem, 'Problem'),
        b.accessories === undefined ? job.accessories : b.accessories,
        b.estimatedCost === undefined ? job.estimated_cost : toMoney(b.estimatedCost, 'Estimated cost'),
        b.promisedAt === undefined ? job.promised_at : (b.promisedAt || null),
        b.note === undefined ? job.note : b.note,
        job.id,
      );
    audit(db, req.user, 'repair_update', job.job_no);
    res.json(getJob(db, job.id, req.user));
  });

  /**
   * Status change. Moving to out_work books the technician's wage to their payable balance;
   * reassigning reverses the previous booking first.
   */
  router.post('/:id/status', requirePerm('manageRepairs'), (req, res) => {
    const job = loadOpenJob(db, req.params.id);
    const to = String(req.body?.status ?? '');
    if (!FLOW[job.status].includes(to) && !(to === 'out_work' && job.status === 'out_work')) {
      throw httpError(400, `Cannot move a job from ${job.status} to ${to || '(none)'}`);
    }
    const note = String(req.body?.note ?? '').trim();

    tx(db, () => {
      if (to === 'out_work') {
        const tech = db.prepare('SELECT * FROM technicians WHERE id = ? AND active = 1').get(Number(req.body?.technicianId) || 0);
        if (!tech) throw httpError(400, 'Choose an active technician');
        const cost = toMoney(req.body?.technicianCost, 'Technician cost');
        if (!note) throw httpError(400, 'Write what the technician should fix');

        if (job.technician_id && job.technician_cost > 0) {
          const old = db.prepare('SELECT * FROM technicians WHERE id = ?').get(job.technician_id);
          const reversal = Math.min(old.balance, job.technician_cost);
          if (reversal > 0) {
            db.prepare('UPDATE technicians SET balance = ? WHERE id = ?').run(round2(old.balance - reversal), old.id);
            db.prepare(`INSERT INTO technician_ledger (technician_id, kind, amount, job_id, note, created_by)
                        VALUES (?, 'adjustment', ?, ?, ?, ?)`).run(old.id, -reversal, job.id, `Reassigned ${job.job_no}`, req.user.id);
          }
        }
        if (cost > 0) {
          const current = db.prepare('SELECT balance FROM technicians WHERE id = ?').get(tech.id);
          db.prepare('UPDATE technicians SET balance = ? WHERE id = ?').run(round2(current.balance + cost), tech.id);
          db.prepare(`INSERT INTO technician_ledger (technician_id, kind, amount, job_id, note, created_by)
                      VALUES (?, 'job', ?, ?, ?, ?)`).run(tech.id, cost, job.id, `Job ${job.job_no}`, req.user.id);
        }
        db.prepare('UPDATE repair_jobs SET technician_id = ?, technician_cost = ?, technician_note = ? WHERE id = ?')
          .run(tech.id, cost, note, job.id);
      }
      db.prepare("UPDATE repair_jobs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(to, job.id);
      logEvent(db, job.id, job.status, to, note, req.user.id);
    });
    audit(db, req.user, 'repair_status', job.job_no, `${job.status} -> ${to}`);
    res.json(getJob(db, job.id, req.user));
  });

  /** Uses a spare part from stock on this job (quantity-tracked products only). */
  router.post('/:id/parts', requirePerm('manageRepairs'), (req, res) => {
    const job = loadOpenJob(db, req.params.id);
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(Number(req.body?.productId) || 0);
    if (!product) throw httpError(400, 'Product not found');
    if (product.serialized === 1) throw httpError(400, 'IMEI-tracked products cannot be used as repair parts');
    const qty = toPositiveInt(req.body?.qty ?? 1, 'Quantity');
    if (product.stock < qty) throw httpError(400, `Insufficient stock for ${product.name} (available ${product.stock})`);
    const unitPrice = req.body?.unitPrice === undefined ? product.sale_price : toMoney(req.body.unitPrice, 'Unit price');
    if (unitPrice !== product.sale_price && !hasPerm(req.user, 'editPrice')) throw httpError(403, 'Permission denied: editPrice');

    tx(db, () => {
      db.prepare(`INSERT INTO repair_job_parts (job_id, product_id, qty, unit_price, unit_cost, line_total)
                  VALUES (?, ?, ?, ?, ?, ?)`).run(job.id, product.id, qty, unitPrice, product.buy_price, round2(qty * unitPrice));
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, product.id);
      db.prepare("UPDATE repair_jobs SET updated_at = datetime('now') WHERE id = ?").run(job.id);
    });
    audit(db, req.user, 'repair_part_add', job.job_no, `${product.name} x${qty}`);
    res.status(201).json(getJob(db, job.id, req.user));
  });

  router.post('/:id/parts/:partId/remove', requirePerm('manageRepairs'), (req, res) => {
    const job = loadOpenJob(db, req.params.id);
    const part = db.prepare('SELECT * FROM repair_job_parts WHERE id = ? AND job_id = ?').get(req.params.partId, job.id);
    if (!part) throw httpError(404, 'Part not found on this job');
    tx(db, () => {
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(part.qty, part.product_id);
      db.prepare('DELETE FROM repair_job_parts WHERE id = ?').run(part.id);
    });
    audit(db, req.user, 'repair_part_remove', job.job_no, `part=${part.id}`);
    res.json(getJob(db, job.id, req.user));
  });

  /**
   * Hands the device back. Bill = service charge + parts (failed jobs may put parts back in stock).
   * The advance is set against the bill; any shortfall is collected now or becomes customer due,
   * and any excess advance is refunded from the chosen account.
   */
  router.post('/:id/deliver', requirePerm('manageRepairs'), (req, res) => {
    const job = loadOpenJob(db, req.params.id);
    if (!['success', 'failed'].includes(job.status)) {
      throw httpError(400, 'Mark the job Success or Failed before delivery');
    }
    const b = req.body ?? {};
    const charge = toMoney(b.charge, 'Service charge');
    const accountId = b.accountId ? Number(b.accountId) : null;
    const restock = job.status === 'failed' && Boolean(b.restockParts);

    const result = tx(db, () => {
      const parts = db.prepare('SELECT * FROM repair_job_parts WHERE job_id = ?').all(job.id);
      if (restock) {
        for (const p of parts) {
          db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(p.qty, p.product_id);
        }
        db.prepare('UPDATE repair_job_parts SET restocked = 1 WHERE job_id = ?').run(job.id);
      }
      const partsTotal = restock ? 0 : round2(parts.reduce((s, p) => s + p.line_total, 0));
      const total = round2(charge + partsTotal);
      const net = round2(total - job.advance);
      let paid = 0;
      let due = 0;
      let refunded = 0;

      if (net >= 0) {
        paid = toMoney(b.paid, 'Paid');
        if (paid > net) throw httpError(400, `Payment is more than the balance due (${net})`);
        if (paid > 0 && !accountId) throw httpError(400, 'Choose the account that received the payment');
        due = round2(net - paid);
        assertCreditLimit(db, job.customer_id, due, req.user, Boolean(b.allowOverLimit));
        if (paid > 0) {
          moveMoney(db, { accountId, direction: 'in', amount: paid, refType: 'repair_payment', refId: job.id, userId: req.user.id });
        }
        if (due > 0) {
          db.prepare('UPDATE customers SET balance = balance + ? WHERE id = ?').run(due, job.customer_id);
        }
      } else {
        refunded = -net;
        if (!accountId) throw httpError(400, 'Choose the account to refund the extra advance from');
        moveMoney(db, { accountId, direction: 'out', amount: refunded, refType: 'repair_refund', refId: job.id, userId: req.user.id });
      }

      db.prepare(`UPDATE repair_jobs SET status = 'delivered', outcome = ?, service_charge = ?, parts_total = ?, total = ?,
                    delivery_paid = ?, due = ?, refunded = ?, delivered_at = datetime('now'), updated_at = datetime('now')
                  WHERE id = ?`)
        .run(job.status, charge, partsTotal, total, paid, due, refunded, job.id);
      logEvent(db, job.id, job.status, 'delivered', b.note ?? null, req.user.id);
      return { total, paid, due, refunded };
    });
    audit(db, req.user, 'repair_deliver', job.job_no, `total=${result.total}; due=${result.due}; refunded=${result.refunded}`);
    res.json(getJob(db, job.id, req.user));
  });

  return router;
}

export function techniciansRouter(db) {
  const router = Router();

  const toTech = (r) => ({
    id: r.id,
    name: r.name,
    mobile: r.mobile,
    shopName: r.shop_name,
    specialties: r.specialties,
    balance: r.balance,
    active: r.active === 1,
    openJobs: r.open_jobs ?? 0,
  });

  router.get('/', (_req, res) => {
    const rows = db.prepare(`
      SELECT t.*, (SELECT COUNT(*) FROM repair_jobs j WHERE j.technician_id = t.id AND j.status = 'out_work') AS open_jobs
      FROM technicians t ORDER BY t.active DESC, t.name`).all();
    res.json(rows.map(toTech));
  });

  router.post('/', requirePerm('manageRepairs'), (req, res) => {
    const name = requireText(req.body?.name, 'Name');
    const opening = toMoney(req.body?.openingBalance, 'Opening balance');
    const id = tx(db, () => {
      const r = db.prepare('INSERT INTO technicians (name, mobile, shop_name, specialties, balance) VALUES (?, ?, ?, ?, ?)')
        .run(name, req.body?.mobile ?? null, req.body?.shopName ?? null, req.body?.specialties ?? null, opening);
      const techId = Number(r.lastInsertRowid);
      if (opening > 0) {
        db.prepare(`INSERT INTO technician_ledger (technician_id, kind, amount, note, created_by)
                    VALUES (?, 'opening', ?, 'Opening due', ?)`).run(techId, opening, req.user.id);
      }
      return techId;
    });
    audit(db, req.user, 'technician_create', name);
    res.status(201).json({ id });
  });

  router.patch('/:id', requirePerm('manageRepairs'), (req, res) => {
    const t = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id);
    if (!t) throw httpError(404, 'Technician not found');
    const b = req.body ?? {};
    db.prepare('UPDATE technicians SET name = ?, mobile = ?, shop_name = ?, specialties = ?, active = ? WHERE id = ?').run(
      b.name ? requireText(b.name, 'Name') : t.name,
      b.mobile === undefined ? t.mobile : b.mobile,
      b.shopName === undefined ? t.shop_name : b.shopName,
      b.specialties === undefined ? t.specialties : b.specialties,
      b.active === undefined ? t.active : (b.active ? 1 : 0),
      t.id,
    );
    audit(db, req.user, 'technician_update', t.name);
    res.json({ id: t.id });
  });

  router.get('/:id/ledger', (req, res) => {
    const t = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id);
    if (!t) throw httpError(404, 'Technician not found');
    const rows = db.prepare(`SELECT l.*, j.job_no FROM technician_ledger l
                             LEFT JOIN repair_jobs j ON j.id = l.job_id
                             WHERE l.technician_id = ? ORDER BY l.id DESC LIMIT 300`).all(t.id);
    res.json(rows.map((l) => ({
      id: l.id, kind: l.kind, amount: l.amount, jobNo: l.job_no, note: l.note, createdAt: l.created_at,
    })));
  });

  /** Pays a technician's wage from an account. */
  router.post('/:id/payments', requirePerm('manageMoney'), (req, res) => {
    const t = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id);
    if (!t) throw httpError(404, 'Technician not found');
    const amount = toMoney(req.body?.amount, 'Amount');
    if (amount <= 0) throw httpError(400, 'Amount must be greater than zero');
    if (amount > t.balance) throw httpError(400, `Amount is more than what is owed (${t.balance})`);
    tx(db, () => {
      moveMoney(db, {
        accountId: Number(req.body?.accountId),
        direction: 'out',
        amount,
        refType: 'technician_payment',
        refId: t.id,
        note: req.body?.note ?? '',
        userId: req.user.id,
      });
      db.prepare('UPDATE technicians SET balance = ? WHERE id = ?').run(round2(t.balance - amount), t.id);
      db.prepare(`INSERT INTO technician_ledger (technician_id, kind, amount, note, created_by)
                  VALUES (?, 'payment', ?, ?, ?)`).run(t.id, -amount, req.body?.note || 'Wage paid', req.user.id);
    });
    audit(db, req.user, 'technician_payment', t.name, `amount=${amount}`);
    res.status(201).json({ id: t.id, balance: round2(t.balance - amount) });
  });

  return router;
}
