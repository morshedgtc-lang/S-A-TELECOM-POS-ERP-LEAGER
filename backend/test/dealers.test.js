import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDb } from '../src/lib/db.js';
import { bootstrap } from '../src/seed.js';
import { config } from '../src/config.js';

let server;
let base;
let owner;
let staff;
let accountId;
let dealer;
let part;

async function api(method, path, body, token = owner) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
const login = async (id, pw) => (await api('POST', '/auth/login', { userId: id, password: pw }, null)).data.token;

before(async () => {
  const db = openDb(':memory:');
  bootstrap(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  owner = await login(config.bootstrapOwnerId, config.bootstrapOwnerPassword);
  await api('POST', '/users', { id: 'till', name: 'Till', password: 'till1234', role: 'staff' });
  staff = await login('till', 'till1234');
  accountId = (await api('POST', '/accounts', { name: 'Dealer Till', accountType: 'cash', openingBalance: 1000 })).data.id;
  dealer = (await api('POST', '/customers', {
    name: 'Rahim Telecom', mobile: '01811111111', customerType: 'wholesaler', creditLimit: 3000, dealerDiscount: 10,
  })).data;
  part = (await api('POST', '/products', { name: 'Battery X', buyPrice: 300, salePrice: 600, dealerPrice: 450, stock: 10 })).data;
});

after(() => server?.close());

test('dealer settings and dealer price are stored', async () => {
  const c = (await api('GET', '/customers')).data.find((x) => x.id === dealer.id);
  assert.equal(c.customerType, 'wholesaler');
  assert.equal(c.creditLimit, 3000);
  assert.equal(c.dealerDiscount, 10);
  assert.equal((await api('GET', `/products/${part.id}`)).data.dealerPrice, 450);
  assert.equal((await api('POST', '/customers', { name: 'Bad', dealerDiscount: 150 })).status, 400);
});

test('staff sell to a dealer at the dealer price, not at a random price', async () => {
  const ok = await api('POST', '/sales', {
    customerId: dealer.id, paid: 0, items: [{ productId: part.id, qty: 4 }],
  }, staff);
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.total, 1800); // 4 x 450
  assert.equal(ok.data.due, 1800);

  const odd = await api('POST', '/sales', {
    customerId: dealer.id, paid: 0, items: [{ productId: part.id, qty: 1, unitPrice: 400 }],
  }, staff);
  assert.equal(odd.status, 403);
});

test('credit limit blocks new due; a manager-level user can override', async () => {
  const job = (await api('POST', '/repairs', { customerId: dealer.id, device: 'Oppo A5', problem: 'Display' })).data;
  await api('POST', `/repairs/${job.id}/status`, { status: 'success' });

  const blocked = await api('POST', `/repairs/${job.id}/deliver`, { charge: 1500, paid: 0 });
  assert.equal(blocked.status, 400);
  assert.match(blocked.data.error, /Credit limit/);

  const staffOverride = await api('POST', '/sales', {
    customerId: dealer.id, paid: 0, allowOverLimit: true, items: [{ productId: part.id, qty: 4 }],
  }, staff);
  assert.equal(staffOverride.status, 400, 'staff cannot override the limit');

  const allowed = await api('POST', `/repairs/${job.id}/deliver`, { charge: 1500, paid: 0, allowOverLimit: true });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.data));
  assert.equal(allowed.data.due, 1500);
});

test('dues list shows balance, open bills, age and over-limit flag', async () => {
  const row = (await api('GET', '/customers/dues')).data.find((d) => d.id === dealer.id);
  assert.equal(row.balance, 3300);
  assert.equal(row.openBills, 2);
  assert.equal(row.overLimit, true);
  assert.equal(typeof row.oldestDays, 'number');
});

test('collection against a chosen job, then oldest-first for the rest', async () => {
  const bills = (await api('GET', `/customers/${dealer.id}/open-bills`)).data;
  const repair = bills.find((b) => b.docType === 'repair');
  const sale = bills.find((b) => b.docType === 'sale');

  const tooMuch = await api('POST', `/customers/${dealer.id}/settlements`, {
    accountId, allocations: [{ docType: 'repair', docId: repair.docId, amount: 9999 }],
  });
  assert.equal(tooMuch.status, 400);

  const picked = await api('POST', `/customers/${dealer.id}/settlements`, {
    accountId, allocations: [{ docType: 'repair', docId: repair.docId, amount: 1500 }],
  });
  assert.equal(picked.status, 201, JSON.stringify(picked.data));
  assert.equal(picked.data.balance, 1800);

  let open = (await api('GET', `/customers/${dealer.id}/open-bills`)).data;
  assert.deepEqual(open.map((b) => b.docType), ['sale'], 'the repair job is now fully paid');

  await api('POST', `/customers/${dealer.id}/settlements`, { accountId, amount: 800 });
  open = (await api('GET', `/customers/${dealer.id}/open-bills`)).data;
  assert.equal(open[0].docId, sale.docId);
  assert.equal(open[0].remaining, 1000);
});

test('a return credit settles its own invoice first', async () => {
  const saleId = (await api('GET', `/customers/${dealer.id}/open-bills`)).data[0].docId;
  const sale = (await api('GET', `/sales/${saleId}`)).data;
  const ret = await api('POST', `/sales/${saleId}/returns`, { accountId, items: [{ saleItemId: sale.items[0].id, qty: 1 }] });
  assert.equal(ret.status, 201, JSON.stringify(ret.data));
  assert.equal(ret.data.credited, 450);
  const open = (await api('GET', `/customers/${dealer.id}/open-bills`)).data;
  assert.equal(open[0].remaining, 550);
});

test('statement closing balance equals the customer due', async () => {
  const st = (await api('GET', `/customers/${dealer.id}/statement`)).data;
  const c = (await api('GET', '/customers')).data.find((x) => x.id === dealer.id);
  assert.equal(st.closing, c.balance);
  assert.equal(st.closing, 550);
  assert.deepEqual(st.lines.map((l) => l.kind).sort(), ['collection', 'collection', 'repair', 'return', 'sale'].sort());

  const future = (await api('GET', `/customers/${dealer.id}/statement?from=2999-01-01`)).data;
  assert.equal(future.opening, 550);
  assert.equal(future.lines.length, 0);
});

test('upgrade links earlier collections to bills oldest-first', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sa-pos-backfill-'));
  const file = join(dir, 'shop.db');
  let db = openDb(file);
  bootstrap(db);
  db.exec(`
    INSERT INTO customers (id, name, balance) VALUES (50, 'Old Dealer', 300);
    INSERT INTO sales (id, invoice_no, customer_id, subtotal, total, paid, due, created_by, created_at)
      VALUES (900, 'OLD-1', 50, 500, 500, 0, 500, 'owner', '2026-01-01 10:00:00'),
             (901, 'OLD-2', 50, 400, 400, 0, 400, 'owner', '2026-02-01 10:00:00');
    INSERT INTO payments (account_id, direction, amount, ref_type, ref_id, created_by) VALUES (1, 'in', 600, 'customer_collection', 50, 'owner');
    DELETE FROM schema_migrations WHERE id = '002_dealer_fields_and_allocations';`);
  db.close();

  db = openDb(file); // re-runs migration 002 on the "old" data
  const rows = db.prepare('SELECT doc_id, amount FROM due_allocations WHERE customer_id = 50 ORDER BY doc_id').all();
  assert.deepEqual(rows.map((r) => [r.doc_id, r.amount]), [[900, 500], [901, 100]]);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
