import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { httpError } from './http.js';

/** Every permission the API checks. Owner always has all of them. */
export const ACTIONS = [
  'sell',
  'giveDiscount',
  'editPrice',
  'managePurchases',
  'manageProducts',
  'manageParties',
  'manageMoney',
  'manageExpenses',
  'manageStaff',
  'viewCost',
  'viewProfit',
  'viewAudit',
  'manageRepairs',
  'manageReturns',
  'viewReports',
  'manageSettings',
];

const ALL_TRUE = Object.fromEntries(ACTIONS.map((a) => [a, true]));
const ALL_FALSE = Object.fromEntries(ACTIONS.map((a) => [a, false]));

/** owner is shown as "Super Admin". A user can only create or change users ranked below them. */
export const ROLE_RANK = { owner: 4, admin: 3, manager: 2, staff: 1 };

export const ROLE_PERMISSIONS = {
  owner: ALL_TRUE,
  admin: ALL_TRUE,
  manager: {
    ...ALL_FALSE,
    sell: true,
    giveDiscount: true,
    editPrice: true,
    managePurchases: true,
    manageProducts: true,
    manageParties: true,
    manageMoney: true,
    manageExpenses: true,
    viewCost: true,
    viewProfit: true,
    viewAudit: true,
    manageRepairs: true,
    manageReturns: true,
    viewReports: true,
  },
  staff: { ...ALL_FALSE, sell: true, manageRepairs: true },
};

export function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Converts a users row into the public user object (no password hash). */
export function toUser(row) {
  const stored = JSON.parse(row.permissions || '{}');
  const permissions = row.role === 'owner' ? ALL_TRUE : { ...ROLE_PERMISSIONS[row.role], ...stored };
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    role: row.role,
    active: row.active === 1,
    basicSalary: row.basic_salary,
    permissions,
  };
}

export function hasPerm(user, action) {
  return user.role === 'owner' || Boolean(user.permissions[action]);
}

export function signToken(row) {
  return jwt.sign({ sub: row.id, role: row.role }, config.jwtSecret, { expiresIn: '12h' });
}

export function requireAuth(db) {
  return (req, _res, next) => {
    const match = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    if (!match) return next(httpError(401, 'Login required'));
    let payload;
    try {
      payload = jwt.verify(match[1], config.jwtSecret);
    } catch {
      return next(httpError(401, 'Session expired, please log in again'));
    }
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
    if (!row || row.active !== 1) return next(httpError(401, 'Account is not active'));
    req.user = toUser(row);
    next();
  };
}

export function requirePerm(action) {
  return (req, _res, next) => {
    if (hasPerm(req.user, action)) return next();
    next(httpError(403, `Permission denied: ${action}`));
  };
}
