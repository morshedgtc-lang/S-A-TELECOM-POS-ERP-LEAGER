import { Router } from 'express';
import { ACTIONS, hashPassword, requirePerm, ROLE_PERMISSIONS, ROLE_RANK, signToken, toUser, verifyPassword } from '../lib/auth.js';
import { audit, httpError, requireText, toMoney } from '../lib/http.js';


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
    assertCanAssign(req.user, role);
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
    const b = req.body ?? {};
    const self = row.id === req.user.id;
    if (self && (b.role !== undefined || b.active !== undefined || b.permissions !== undefined || b.password !== undefined)) {
      throw httpError(400, 'Use "change password" for your own account; others manage your role and access');
    }
    if (!self) assertCanManage(req.user, row);

    const role = b.role ?? row.role;
    if (role !== row.role) assertCanAssign(req.user, role);
    const active = b.active === undefined ? row.active : (b.active ? 1 : 0);
    if (row.role === 'owner' && (role !== 'owner' || active === 0)) {
      const others = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1 AND id <> ?").get(row.id).n;
      if (others === 0) throw httpError(400, 'At least one active Super Admin must remain');
    }
    const permissions = ['owner', 'admin'].includes(role) ? '{}' : JSON.stringify(sanitizePermissions(b.permissions, row, role));
    const password = b.password ? String(b.password) : null;
    if (password && password.length < 6) throw httpError(400, 'Password must be at least 6 characters');

    db.prepare(`UPDATE users SET name = ?, mobile = ?, role = ?, active = ?, basic_salary = ?,
                  permissions = ?, password_hash = ? WHERE id = ?`)
      .run(
        b.name ? requireText(b.name, 'Name') : row.name,
        b.mobile ?? row.mobile,
        role,
        active,
        b.basicSalary === undefined ? row.basic_salary : toMoney(b.basicSalary, 'Basic salary'),
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

/** Super Admin may assign any role; everyone else only roles ranked below their own. */
function assertCanAssign(actor, role) {
  if (!(role in ROLE_RANK)) throw httpError(400, 'Role must be owner, admin, manager or staff');
  if (actor.role !== 'owner' && ROLE_RANK[role] >= ROLE_RANK[actor.role]) {
    throw httpError(403, 'You can only create or assign roles below your own');
  }
}

function assertCanManage(actor, target) {
  if (actor.role !== 'owner' && ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) {
    throw httpError(403, 'You can only manage users below your own role');
  }
}

/** Any signed-in user changes their own password after confirming the current one. */
export function changeOwnPassword(db) {
  return (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(String(req.body?.currentPassword ?? ''), row.password_hash)) {
      throw httpError(400, 'Current password is wrong');
    }
    const next = String(req.body?.newPassword ?? '');
    if (next.length < 6) throw httpError(400, 'Password must be at least 6 characters');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), row.id);
    audit(db, req.user, 'password_change', row.id);
    res.json({ ok: true });
  };
}
