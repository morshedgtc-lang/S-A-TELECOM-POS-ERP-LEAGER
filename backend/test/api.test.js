import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDb } from '../src/lib/db.js';
import { bootstrap } from '../src/seed.js';
import { config } from '../src/config.js';

let server;
let base;
let ownerToken;
let accountId;

async function api(method, path, { token = ownerToken, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

before(async () => {
  const db = openDb(':memory:');
  bootstrap(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;

  const login = await api('POST', '/auth/login', {
    token: null,
    body: { userId: config.bootstrapOwnerId, password: config.bootstrapOwnerPassword },
  });
  ownerToken = login.data.token;
  const till = await api('POST', '/accounts', {
    body: { name: 'Test Till', accountType: 'cash', openingBalance: 5000 },
  });
  accountId = till.data.id;
});

after(() => server?.close());

test('login rejects a wrong password', async () => {
  const res = await api('POST', '/auth/login', { token: null, body: { userId: 'owner', password: 'nope' } });
  assert.equal(res.status, 401);
});

test('protected routes require a token', async () => {
  const res = await api('GET', '/products', { token: null });
  assert.equal(res.status, 401);
});

test('serialized purchase, serialized sale and stock movement', async () => {
  const cat = (await api('GET', '/catalog/categories')).data.find((c) => c.name === 'Mobile Phone');
  const supplier = await api('POST', '/suppliers', { body: { name: 'Test Supplier' } });
  const product = await api('POST', '/products', {
    body: { name: 'Phone X', categoryId: cat.id, buyPrice: 100, salePrice: 150, serialized: true, lowStockLimit: 1 },
  });
  assert.equal(product.status, 201);
  const productId = product.data.id;

  const purchase = await api('POST', '/purchases', {
    body: {
      supplierId: supplier.data.id,
      paid: 100,
      accountId,
      items: [{ productId, qty: 2, unitCost: 100, serials: ['IMEI-1', 'IMEI-2'] }],
    },
  });
  assert.equal(purchase.status, 201);
  assert.equal(purchase.data.due, 100);

  const p = (await api('GET', `/products/${productId}`)).data;
  assert.equal(p.stock, 2);

  const duplicate = await api('POST', '/purchases', {
    body: { supplierId: supplier.data.id, paid: 0, items: [{ productId, qty: 1, unitCost: 100, serials: ['IMEI-1'] }] },
  });
  assert.equal(duplicate.status, 409);

  const sale = await api('POST', '/sales', {
    body: { customerId: 1, paid: 150, accountId, items: [{ productId, qty: 1, serials: ['IMEI-1'] }] },
  });
  assert.equal(sale.status, 201, JSON.stringify(sale.data));
  assert.equal(sale.data.total, 150);
  assert.equal(sale.data.due, 0);

  const soldAgain = await api('POST', '/sales', {
    body: { customerId: 1, paid: 150, accountId, items: [{ productId, qty: 1, serials: ['IMEI-1'] }] },
  });
  assert.equal(soldAgain.status, 400);
  assert.equal((await api('GET', `/products/${productId}`)).data.stock, 1);
});

test('walk-in sale must be paid in full and cannot exceed stock', async () => {
  const product = await api('POST', '/products', { body: { name: 'Cable', salePrice: 10, buyPrice: 4, stock: 3 } });
  const partial = await api('POST', '/sales', {
    body: { paid: 5, accountId, items: [{ productId: product.data.id, qty: 1 }] },
  });
  assert.equal(partial.status, 400);

  const tooMany = await api('POST', '/sales', {
    body: { paid: 40, accountId, items: [{ productId: product.data.id, qty: 4 }] },
  });
  assert.equal(tooMany.status, 400);
});

test('credit sale increases customer balance and collection reduces it', async () => {
  const customer = await api('POST', '/customers', { body: { name: 'Rahim' } });
  const product = await api('POST', '/products', { body: { name: 'Charger', salePrice: 100, buyPrice: 60, stock: 5 } });
  const sale = await api('POST', '/sales', {
    body: { customerId: customer.data.id, paid: 40, accountId, items: [{ productId: product.data.id, qty: 2 }] },
  });
  assert.equal(sale.data.due, 160);

  const list = (await api('GET', '/customers')).data.find((c) => c.id === customer.data.id);
  assert.equal(list.balance, 160);

  const collect = await api('POST', `/customers/${customer.data.id}/settlements`, {
    body: { amount: 60, accountId },
  });
  assert.equal(collect.data.balance, 100);
});

test('staff cannot give discount or see cost; owner can', async () => {
  const created = await api('POST', '/users', {
    body: { id: 'staff01', name: 'Staff One', password: 'staffpass', role: 'staff' },
  });
  assert.equal(created.status, 201);
  const staffLogin = await api('POST', '/auth/login', { token: null, body: { userId: 'staff01', password: 'staffpass' } });
  const staffToken = staffLogin.data.token;

  const product = await api('POST', '/products', { body: { name: 'Earbuds', salePrice: 50, buyPrice: 20, stock: 4 } });
  const discounted = await api('POST', '/sales', {
    token: staffToken,
    body: { paid: 45, accountId, discount: 5, items: [{ productId: product.data.id, qty: 1 }] },
  });
  assert.equal(discounted.status, 403);

  const staffView = (await api('GET', '/products', { token: staffToken })).data.find((p) => p.id === product.data.id);
  assert.equal(staffView.buyPrice, undefined);
  const ownerView = (await api('GET', '/products')).data.find((p) => p.id === product.data.id);
  assert.equal(ownerView.buyPrice, 20);
});

test('expense reduces the account and cannot overdraw it', async () => {
  const account = (await api('GET', '/accounts')).data.find((a) => a.id === accountId);
  const ok = await api('POST', '/expenses', { body: { category: 'Rent', amount: 10, accountId } });
  assert.equal(ok.status, 201);
  const updated = (await api('GET', '/accounts')).data.find((a) => a.id === accountId);
  assert.equal(updated.balance, account.balance - 10);

  const tooBig = await api('POST', '/expenses', { body: { category: 'Rent', amount: 1e9, accountId } });
  assert.equal(tooBig.status, 400);
});

test('dashboard summarises today and the audit trail records writes', async () => {
  const dash = await api('GET', '/dashboard');
  assert.equal(dash.status, 200);
  assert.ok(dash.data.today.salesCount >= 1);
  assert.ok(typeof dash.data.today.grossProfit === 'number');

  const audit = await api('GET', '/audit?limit=5');
  assert.equal(audit.status, 200);
  assert.ok(audit.data.length > 0);
});
