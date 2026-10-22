import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDb } from '../src/lib/db.js';
import { bootstrap } from '../src/seed.js';
import { config } from '../src/config.js';

let server;
let base;
let token;

async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

before(async () => {
  const db = openDb(':memory:');
  bootstrap(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: config.bootstrapOwnerId, password: config.bootstrapOwnerPassword }),
  });
  token = (await login.json()).token;
});

after(() => server?.close());

test('assign barcodes fills only missing SKUs and lookup finds them case-insensitively', async () => {
  const withSku = (await api('POST', '/products', { name: 'Cable C', sku: 'CAB-01', salePrice: 150, stock: 5 })).data;
  const noSku = (await api('POST', '/products', { name: 'Charger 20W', salePrice: 650, stock: 3 })).data;

  const r = await api('POST', '/products/barcodes/assign');
  assert.equal(r.status, 200);
  assert.equal(r.data.assigned, 1);
  assert.equal((await api('GET', `/products/${withSku.id}`)).data.sku, 'CAB-01');
  const code = (await api('GET', `/products/${noSku.id}`)).data.sku;
  assert.match(code, /^SA\d{6}$/);

  assert.equal((await api('POST', '/products/barcodes/assign')).data.assigned, 0, 'running again changes nothing');

  const found = await api('GET', '/products/lookup/cab-01');
  assert.equal(found.status, 200);
  assert.equal(found.data.product.id, withSku.id);
  assert.equal(found.data.serial, null);
  assert.equal((await api('GET', `/products/lookup/${code}`)).data.product.name, 'Charger 20W');
});

test('lookup resolves an IMEI and the units list shows in-stock serials', async () => {
  const supplier = (await api('POST', '/suppliers', { name: 'Phone House' })).data;
  const phone = (await api('POST', '/products', { name: 'Redmi 13', salePrice: 16000, serialized: true })).data;
  await api('POST', '/purchases', {
    supplierId: supplier.id, paid: 0,
    items: [{ productId: phone.id, qty: 2, unitCost: 14000, serials: ['861111111111111', '862222222222222'] }],
  });

  const hit = await api('GET', '/products/lookup/861111111111111');
  assert.equal(hit.data.product.id, phone.id);
  assert.equal(hit.data.serial, '861111111111111');
  assert.equal(hit.data.unitStatus, 'in_stock');

  const units = await api('GET', `/products/${phone.id}/units`);
  assert.deepEqual(units.data, ['861111111111111', '862222222222222']);

  assert.equal((await api('GET', '/products/lookup/NOPE-123')).status, 404);
});
