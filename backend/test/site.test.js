import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/app.js';
import { openDb } from '../src/lib/db.js';
import { bootstrap } from '../src/seed.js';
import { config } from '../src/config.js';

let server;
let base;
let owner;

async function api(method, path, body, token = owner) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}
const login = async (userId, password) => (await api('POST', '/auth/login', { userId, password }, null)).data.token;

before(async () => {
  const db = openDb(':memory:');
  bootstrap(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  owner = await login(config.bootstrapOwnerId, config.bootstrapOwnerPassword);
});

after(() => server?.close());

test('public site works without login and reflects admin edits', async () => {
  const pub = await api('GET', '/public/site', null, null);
  assert.equal(pub.status, 200);
  assert.ok(pub.data.site.services.length > 0);
  assert.ok(pub.data.site.heroTitle.bn);

  const saved = await api('PUT', '/settings/site', {
    heroTitle: { en: 'Best repair in town', bn: 'শহরের সেরা সার্ভিস' },
    whatsapp: '+880 1700-000000',
    services: [{ icon: 'fa-mobile-screen', title: { en: 'Screen', bn: 'স্ক্রিন' }, desc: { en: 'x', bn: 'y' } }],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.whatsapp, '+8801700000000');

  const after = (await api('GET', '/public/site', null, null)).data.site;
  assert.equal(after.heroTitle.en, 'Best repair in town');
  assert.equal(after.services.length, 1);
});

test('site editor rejects unsafe links and needs manageSettings', async () => {
  const bad = await api('PUT', '/settings/site', { heroImage: 'javascript:alert(1)' });
  assert.equal(bad.status, 400);
  const badMap = await api('PUT', '/settings/site', { mapUrl: 'http://insecure.example' });
  assert.equal(badMap.status, 400);

  await api('POST', '/users', { id: 'clerk', name: 'Clerk', password: 'clerk123', role: 'staff' });
  const staff = await login('clerk', 'clerk123');
  const denied = await api('PUT', '/settings/site', { heroTitle: { en: 'x', bn: 'y' } }, staff);
  assert.equal(denied.status, 403);
});

test('repair tracking needs the matching mobile number', async () => {
  const job = (await api('POST', '/repairs', {
    customer: { name: 'Track Me', mobile: '01711223344' }, device: 'Vivo Y20', problem: 'Mic',
  })).data;

  const wrong = await api('GET', `/public/track?jobNo=${job.jobNo}&mobile=01799999999`, null, null);
  assert.equal(wrong.status, 404);

  const ok = await api('GET', `/public/track?jobNo=${job.jobNo.toLowerCase()}&mobile=%2B8801711223344`, null, null);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.status, 'in_work');
  assert.equal(ok.data.device, 'Vivo Y20');
  assert.equal(ok.data.total, null, 'bill is hidden until delivery');
});

test('role ranks: super admin creates admin, admin cannot create admin or touch super admin', async () => {
  const created = await api('POST', '/users', { id: 'admin1', name: 'Admin One', password: 'admin123', role: 'admin' });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const admin = await login('admin1', 'admin123');

  const me = (await api('GET', '/me', null, admin)).data.user;
  assert.equal(me.role, 'admin');
  assert.equal(me.permissions.manageSettings, true);

  assert.equal((await api('POST', '/users', { id: 'admin2', name: 'A2', password: 'admin123', role: 'admin' }, admin)).status, 403);
  assert.equal((await api('POST', '/users', { id: 'mgr1', name: 'M1', password: 'mgr1234', role: 'manager' }, admin)).status, 201);
  assert.equal((await api('PATCH', `/users/${config.bootstrapOwnerId}`, { active: false }, admin)).status, 403);
  assert.equal((await api('PATCH', '/users/mgr1', { role: 'admin' }, admin)).status, 403);
});

test('the last active super admin cannot be removed; anyone can change own password', async () => {
  const self = await api('PATCH', `/users/${config.bootstrapOwnerId}`, { active: false });
  assert.equal(self.status, 400);

  await api('POST', '/users', { id: 'boss2', name: 'Boss 2', password: 'boss1234', role: 'owner' });
  const demote = await api('PATCH', `/users/boss2`, { role: 'admin' });
  assert.equal(demote.status, 200);

  const staff = await login('clerk', 'clerk123');
  const wrong = await api('POST', '/me/password', { currentPassword: 'nope', newPassword: 'newpass1' }, staff);
  assert.equal(wrong.status, 400);
  const ok = await api('POST', '/me/password', { currentPassword: 'clerk123', newPassword: 'newpass1' }, staff);
  assert.equal(ok.status, 200);
  assert.ok(await login('clerk', 'newpass1'));
});

test('migration adds the admin role to an old database without losing users', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sa-pos-mig-'));
  const file = join(dir, 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, mobile TEXT, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)), basic_salary REAL NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
    permissions TEXT NOT NULL DEFAULT '{}', last_login_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO users (id, name, password_hash, role) VALUES ('legacy-owner', 'Old Owner', 'x', 'owner');`);
  old.close();

  const db = openDb(file);
  assert.equal(db.prepare("SELECT name FROM users WHERE id = 'legacy-owner'").get().name, 'Old Owner');
  db.prepare("INSERT INTO users (id, name, password_hash, role) VALUES ('new-admin', 'A', 'x', 'admin')").run();
  assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE id = '001_users_admin_role'").get());
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
