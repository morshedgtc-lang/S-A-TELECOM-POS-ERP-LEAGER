import { Router } from 'express';
import { ACTIONS, hashPassword, requirePerm, ROLE_PERMISSIONS, signToken, toUser, verifyPassword } from '../lib/auth.js';
import { audit, httpError, requireText, toMoney } from '../lib/http.js';

const ROLES = ['manager', 'staff'];

export function authRouter(db) {
  const router = Router();

  router.post('/login', (req, res) => {
    const userId = String(req.body?.userId ?? '').trim();
    const password = String(req.body?.password ?? '');
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!row || row.active !== 1 || !verifyPassword(password, row.password_hash)) {
      throw httpError(401, 'Invalid ID or password');
    }
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(row.id);
    res.json({ token: signToken(row), user: toUser(row) });
  });

  return router;
}

export function usersRouter(db) {
  const router = Router();

  router.get('/', requirePerm('manageStaff'), (_req, res) => {
    const rows = db.prepare('SELECT * FROM users ORDER BY role, id').all();
    res.json(rows.map((r) => ({ ...toUser(r), lastLoginAt: r.last_login_at, createdAt: r.created_at })));
  });

  router.post('/', requirePerm('manageStaff'), (req, res) => {
    const id = requireText(req.body?.id, 'User ID');
    const name = requireText(req.body?.name, 'Name');
    const password = requireText(req.body?.password, 'Password');
    const role = req.body?.role;
    if (!ROLES.includes(role)) throw httpError(400, 'Role must be manager or staff');
    if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters');
    if (db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)) throw httpError(409, 'User ID already exists');

    const basicSalary = toMoney(req.body?.basicSalary, 'Basic salary');
    db.prepare(`INSERT INTO users (id, name, mobile, password_hash, role, basic_salary, permissions)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name, req.body?.mobile ?? null, hashPassword(password), role, basicSalary,
        JSON.stringify(ROLE_PERMISSIONS[role]));
    audit(db, req.user, 'staff_create', id, `role=${role}`);
    res.status(201).json({ id });
  });

  router.patch('/:id', requirePerm('manageStaff'), (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!row) throw httpError(404, 'User not found');
    const isOwner = row.role === 'owner';
    if (isOwner && req.body?.active === false) throw httpError(400, 'Owner account cannot be deactivated');
    if (isOwner && req.body?.role && req.body.role !== 'owner') throw httpError(400, 'Owner role cannot be changed');
    if (!isOwner && req.body?.role && !ROLES.includes(req.body.role)) throw httpError(400, 'Invalid role');

    const role = isOwner ? 'owner' : (req.body?.role ?? row.role);
    const permissions = isOwner ? '{}' : JSON.stringify(sanitizePermissions(req.body?.permissions, row, role));
    const password = req.body?.password ? String(req.body.password) : null;
    if (password && password.length < 6) throw httpError(400, 'Password must be at least 6 characters');

    db.prepare(`UPDATE users SET name = ?, mobile = ?, role = ?, active = ?, basic_salary = ?,
                  permissions = ?, password_hash = ? WHERE id = ?`)
      .run(
        req.body?.name ? requireText(req.body.name, 'Name') : row.name,
        req.body?.mobile ?? row.mobile,
        role,
        req.body?.active === undefined ? row.active : (req.body.active ? 1 : 0),
        req.body?.basicSalary === undefined ? row.basic_salary : toMoney(req.body.basicSalary, 'Basic salary'),
        permissions,
        password ? hashPassword(password) : row.password_hash,
        row.id,
      );
    audit(db, req.user, 'staff_update', row.id, `role=${role}`);
    res.json({ id: row.id });
  });

  return router;
}

/** A role change resets to that role's defaults; otherwise only known permission keys are kept. */
function sanitizePermissions(input, row, role) {
  if (role !== row.role) return ROLE_PERMISSIONS[role];
  if (!input) return JSON.parse(row.permissions || '{}');
  const out = {};
  for (const action of ACTIONS) out[action] = Boolean(input[action]);
  return out;
}
