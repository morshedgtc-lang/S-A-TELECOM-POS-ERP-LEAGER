import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDb } from '../src/lib/db.js';
import { bootstrap } from '../src/seed.js';
import { config } from '../src/config.js';

let server;
let base;
let token;
let accountId;

async function api(method, path, body, auth = token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

const balanceOf = async (id) => (await api('GET', '/accounts')).data.find((a) => a.id === id).balance;

before(async () => {
  const db = openDb(':memory:');
  bootstrap(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  token = (await api('POST', '/auth/login', { userId: config.bootstrapOwnerId, password: config.bootstrapOwnerPassword }, null)).data.token;
  accountId = (await api('POST', '/accounts', { name: 'Repair Till', accountType: 'cash', openingBalance: 1000 })).data.id;
});

after(() => server?.close());

test('repair job: intake with advance, out-work, parts, success delivery with due', async () => {
  const intake = await api('POST', '/repairs', {
    customer: { name: 'Karim', mobile: '01700000001' },
    device: 'Samsung A52', imei: '356789012345678', problem: 'Display broken',
    estimatedCost: 2500, advance: 500, accountId,
  });
  assert.equal(intake.status, 201, JSON.stringify(intake.data));
  const job = intake.data;
  assert.match(job.jobNo, /^J\d{5}$/);
  assert.equal(job.status, 'in_work');
  assert.equal(await balanceOf(accountId), 1500);

  // Same mobile re-uses the customer.
  const second = await api('POST', '/repairs', { customer: { name: 'Karim B', mobile: '01700000001' }, device: 'iPhone 11', problem: 'Battery' });
  assert.equal(second.data.customerId, job.customerId);

  const tech = await api('POST', '/technicians', { name: 'Rafiq', specialties: 'Display' });
  const out = await api('POST', `/repairs/${job.id}/status`, { status: 'out_work', technicianId: tech.data.id, technicianCost: 800, note: 'Change display' });
  assert.equal(out.data.status, 'out_work');
  let techs = (await api('GET', '/technicians')).data;
  assert.equal(techs.find((t) => t.id === tech.data.id).balance, 800);

  const product = await api('POST', '/products', { name: 'A52 Display', buyPrice: 1200, salePrice: 1800, stock: 2 });
  const withPart = await api('POST', `/repairs/${job.id}/parts`, { productId: product.data.id, qty: 1 });
  assert.equal(withPart.status, 201);
  assert.equal((await api('GET', `/products/${product.data.id}`)).data.stock, 1);

  const early = await api('POST', `/repairs/${job.id}/deliver`, { charge: 700, paid: 0 });
  assert.equal(early.status, 400, 'cannot deliver before success/failed');

  await api('POST', `/repairs/${job.id}/status`, { status: 'success', note: 'Fixed' });
  const delivered = await api('POST', `/repairs/${job.id}/deliver`, { charge: 700, paid: 1000, accountId });
  assert.equal(delivered.status, 200, JSON.stringify(delivered.data));
  // total = 700 + 1800 = 2500, advance 500 -> 2000 net, paid 1000 -> due 1000
  assert.equal(delivered.data.total, 2500);
  assert.equal(delivered.data.due, 1000);
  assert.equal(delivered.data.outcome, 'success');
  assert.equal(await balanceOf(accountId), 2500);
  const customer = (await api('GET', '/customers')).data.find((c) => c.id === job.customerId);
  assert.equal(customer.balance, 1000);

  const pay = await api('POST', `/technicians/${tech.data.id}/payments`, { amount: 800, accountId });
  assert.equal(pay.data.balance, 0);
  techs = (await api('GET', '/technicians')).data;
  assert.equal(techs.find((t) => t.id === tech.data.id).balance, 0);
});

test('failed repair: parts go back to stock and extra advance is refunded', async () => {
  const product = await api('POST', '/products', { name: 'Charging Port', buyPrice: 100, salePrice: 300, stock: 5 });
  const job = (await api('POST', '/repairs', {
    customer: { name: 'Salma' }, device: 'Redmi 9', problem: 'Not charging', estimatedCost: 600, advance: 400, accountId,
  })).data;
  await api('POST', `/repairs/${job.id}/parts`, { productId: product.data.id, qty: 1 });
  await api('POST', `/repairs/${job.id}/status`, { status: 'failed', note: 'Board damaged' });

  const before = await balanceOf(accountId);
  const delivered = await api('POST', `/repairs/${job.id}/deliver`, { charge: 100, restockParts: true, accountId });
  assert.equal(delivered.status, 200, JSON.stringify(delivered.data));
  assert.equal(delivered.data.total, 100);
  assert.equal(delivered.data.refunded, 300);
  assert.equal(await balanceOf(accountId), before - 300);
  assert.equal((await api('GET', `/products/${product.data.id}`)).data.stock, 5);
});

test('invalid status jumps are rejected and delivered jobs are locked', async () => {
  const job = (await api('POST', '/repairs', { customer: { name: 'Nadia' }, device: 'Nokia', problem: 'Speaker' })).data;
  const jump = await api('POST', `/repairs/${job.id}/status`, { status: 'delivered' });
  assert.equal(jump.status, 400);
  const outNoTech = await api('POST', `/repairs/${job.id}/status`, { status: 'out_work', note: 'x' });
  assert.equal(outNoTech.status, 400);

  await api('POST', `/repairs/${job.id}/status`, { status: 'success' });
  await api('POST', `/repairs/${job.id}/deliver`, { charge: 0 });
  const edit = await api('PATCH', `/repairs/${job.id}`, { problem: 'changed' });
  assert.equal(edit.status, 400);
});

test('sale return restocks a serial unit, credits due first, then refunds', async () => {
  const supplier = (await api('POST', '/suppliers', { name: 'Return Supplier' })).data;
  const phone = (await api('POST', '/products', { name: 'Phone R', buyPrice: 8000, salePrice: 10000, serialized: true })).data;
  await api('POST', '/purchases', { supplierId: supplier.id, paid: 0, items: [{ productId: phone.id, qty: 1, unitCost: 8000, serials: ['RET-IMEI-1'] }] });
  const customer = (await api('POST', '/customers', { name: 'Return Customer' })).data;

  // 10000 total, 1000 discount -> 9000; paid 7000 -> due 2000
  const sale = (await api('POST', '/sales', {
    customerId: customer.id, discount: 1000, paid: 7000, accountId,
    items: [{ productId: phone.id, qty: 1, serials: ['RET-IMEI-1'] }],
  })).data;
  const detail = (await api('GET', `/sales/${sale.id}`)).data;
  assert.deepEqual(detail.items[0].returnableSerials, ['RET-IMEI-1']);

  const before = await balanceOf(accountId);
  const ret = await api('POST', `/sales/${sale.id}/returns`, {
    accountId, items: [{ saleItemId: detail.items[0].id, serials: ['RET-IMEI-1'] }],
  });
  assert.equal(ret.status, 201, JSON.stringify(ret.data));
  assert.equal(ret.data.total, 9000);
  assert.equal(ret.data.credited, 2000);
  assert.equal(ret.data.refunded, 7000);
  assert.equal(await balanceOf(accountId), before - 7000);
  assert.equal((await api('GET', `/products/${phone.id}`)).data.stock, 1);

  const again = await api('POST', `/sales/${sale.id}/returns`, { accountId, items: [{ saleItemId: detail.items[0].id, serials: ['RET-IMEI-1'] }] });
  assert.equal(again.status, 400);

  const lookup = (await api('GET', '/lookup/imei?q=RET-IMEI')).data;
  assert.equal(lookup.units[0].status, 'in_stock');
});

test('report summary and dashboard include repairs; settings round-trip', async () => {
  const report = await api('GET', '/reports/summary');
  assert.equal(report.status, 200);
  assert.ok(report.data.repairs.delivered >= 2);
  assert.equal(typeof report.data.netProfit, 'number');
  assert.ok(Array.isArray(report.data.cashbook.accounts));

  const dash = (await api('GET', '/dashboard')).data;
  assert.ok('in_work' in dash.repairs.byStatus);

  const saved = await api('PATCH', '/settings', { shopName: 'SA Telecom Test', shopPhone: '01800000000' });
  assert.equal(saved.data.shopName, 'SA Telecom Test');
  assert.equal((await api('GET', '/settings')).data.shopPhone, '01800000000');
});
