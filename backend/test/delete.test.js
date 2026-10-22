import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDb } from '../src/lib/db.js';
import { bootstrap } from '../src/seed.js';
import { config } from '../src/config.js';

let server;
let base;
let owner;
let admin;
let accountId;

async function api(method, path, body, token = owner) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
async function login(userId, password) {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, password }),
  });
  return (await res.json()).token;
}
const balance = async (id) => (await api('GET', '/accounts')).data.find((a) => a.id === id).balance;

before(async () => {
  const db = openDb(':memory:');
  bootstrap(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  owner = await login(config.bootstrapOwnerId, config.bootstrapOwnerPassword);
  await api('POST', '/users', { id: 'adm', name: 'Admin', password: 'admin123', role: 'admin' });
  admin = await login('adm', 'admin123');
  accountId = (await api('POST', '/accounts', { name: 'Del Till', accountType: 'cash', openingBalance: 2000 })).data.id;
});

after(() => server?.close());

test('only the Super Admin can delete', async () => {
  const p = (await api('POST', '/products', { name: 'Typo Cabel', salePrice: 100 })).data;
  assert.equal((await api('DELETE', `/products/${p.id}`, null, admin)).status, 403);
  assert.equal((await api('DELETE', `/products/${p.id}`)).status, 200);
  assert.equal((await api('GET', `/products/${p.id}`)).status, 404);
});

test('a product with history cannot be deleted but can be archived and restored', async () => {
  const p = (await api('POST', '/products', { name: 'Sold Item', salePrice: 50, stock: 3 })).data;
  await api('POST', '/sales', { paid: 50, accountId, items: [{ productId: p.id, qty: 1 }] });
  const del = await api('DELETE', `/products/${p.id}`);
  assert.equal(del.status, 409);
  assert.match(del.data.error, /Archive/);

  await api('PATCH', `/products/${p.id}`, { active: false });
  assert.ok(!(await api('GET', '/products')).data.some((x) => x.id === p.id));
  assert.ok((await api('GET', '/products?status=archived')).data.some((x) => x.id === p.id));
  await api('PATCH', `/products/${p.id}`, { active: true });
  assert.ok((await api('GET', '/products')).data.some((x) => x.id === p.id));
});

test('categories and brands can be renamed and deleted; products stay', async () => {
  const cat = (await api('POST', '/catalog/categories', { name: 'Chargr' })).data;
  const p = (await api('POST', '/products', { name: 'Fast Charger', categoryId: cat.id, salePrice: 500 })).data;
  assert.equal((await api('PATCH', `/catalog/categories/${cat.id}`, { name: 'Charger' })).status, 200);
  assert.equal((await api('PATCH', `/catalog/categories/${cat.id}`, { name: 'Accessories' })).status, 409, 'duplicate name');
  assert.equal((await api('GET', `/products/${p.id}`)).data.categoryName, 'Charger');

  const del = await api('DELETE', `/catalog/categories/${cat.id}`);
  assert.equal(del.data.productsUnlinked, 1);
  assert.equal((await api('GET', `/products/${p.id}`)).data.categoryId, null);
});

test('users: no self-delete, accounts with records must be blocked, clean accounts are deleted', async () => {
  assert.equal((await api('DELETE', `/users/${config.bootstrapOwnerId}`)).status, 400);
  assert.equal((await api('POST', '/users', { id: 'typo', name: 'Typo', password: 'typo1234', role: 'staff' })).status, 201);
  assert.equal((await api('DELETE', '/users/typo')).status, 200);

  await api('POST', '/products', { name: 'Admin product', salePrice: 10, stock: 1 }, admin);
  const prod = (await api('GET', '/products')).data.find((x) => x.name === 'Admin product');
  await api('POST', '/sales', { paid: 10, accountId, items: [{ productId: prod.id, qty: 1 }] }, admin);
  assert.equal((await api('DELETE', '/users/adm')).status, 409);
});

test('customers and suppliers: balance or history blocks delete', async () => {
  const c = (await api('POST', '/customers', { name: 'Duplicate Karim' })).data;
  assert.equal((await api('DELETE', `/customers/${c.id}`)).status, 200);

  const owing = (await api('POST', '/customers', { name: 'Owes Money' })).data;
  const prod = (await api('POST', '/products', { name: 'Glass', salePrice: 200, stock: 5 })).data;
  await api('POST', '/sales', { customerId: owing.id, paid: 0, items: [{ productId: prod.id, qty: 1 }] });
  assert.equal((await api('DELETE', `/customers/${owing.id}`)).status, 409);

  const s = (await api('POST', '/suppliers', { name: 'Wrong Supplier' })).data;
  assert.equal((await api('DELETE', `/suppliers/${s.id}`)).status, 200);
});

test('deleting an expense puts the money back', async () => {
  const before = await balance(accountId);
  const e = (await api('POST', '/expenses', { category: 'Mistake', amount: 300, accountId })).data;
  assert.equal(await balance(accountId), before - 300);
  assert.equal((await api('DELETE', `/expenses/${e.id}`, null, admin)).status, 403);
  assert.equal((await api('DELETE', `/expenses/${e.id}`)).status, 200);
  assert.equal(await balance(accountId), before);
  assert.ok(!(await api('GET', '/expenses')).data.some((x) => x.id === e.id));
});

test('cancelling a wrong repair job refunds advance, restocks parts and reverses the technician wage', async () => {
  const part = (await api('POST', '/products', { name: 'Speaker', salePrice: 300, buyPrice: 100, stock: 4 })).data;
  const tech = (await api('POST', '/technicians', { name: 'Cancel Tech' })).data;
  const job = (await api('POST', '/repairs', { customer: { name: 'Wrong Job' }, device: 'X', problem: 'Y', advance: 200, accountId })).data;
  await api('POST', `/repairs/${job.id}/parts`, { productId: part.id, qty: 1 });
  await api('POST', `/repairs/${job.id}/status`, { status: 'out_work', technicianId: tech.id, technicianCost: 150, note: 'fix' });
  const before = await balance(accountId);

  assert.equal((await api('DELETE', `/repairs/${job.id}`, {})).status, 400, 'needs a refund account');
  const del = await api('DELETE', `/repairs/${job.id}`, { accountId });
  assert.equal(del.status, 200, JSON.stringify(del.data));
  assert.equal(await balance(accountId), before - 200);
  assert.equal((await api('GET', `/products/${part.id}`)).data.stock, 4);
  assert.equal((await api('GET', '/technicians')).data.find((x) => x.id === tech.id).balance, 0);
  assert.equal((await api('GET', `/repairs/${job.id}`)).status, 404);
});
