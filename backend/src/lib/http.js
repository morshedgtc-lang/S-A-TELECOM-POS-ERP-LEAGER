import { randomBytes } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const httpError = (status, message) => new HttpError(status, message);

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function toNumber(value, field) {
  const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(n)) throw httpError(400, `${field} must be a number`);
  return n;
}

export function toPositiveInt(value, field) {
  const n = toNumber(value, field);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${field} must be a positive whole number`);
  return n;
}

export function toMoney(value, field, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = toNumber(value, field);
  if (n < 0) throw httpError(400, `${field} cannot be negative`);
  return round2(n);
}

export function requireText(value, field) {
  const s = String(value ?? '').trim();
  if (!s) throw httpError(400, `${field} is required`);
  return s;
}

export function invoiceNo(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
}

/** Builds SQL date-range clauses (inclusive, on the local date part) for a query string. */
export function dateClauses(query, column = 'created_at') {
  const clauses = [];
  const params = [];
  if (query.from) {
    clauses.push(`date(${column}) >= date(?)`);
    params.push(String(query.from));
  }
  if (query.to) {
    clauses.push(`date(${column}) <= date(?)`);
    params.push(String(query.to));
  }
  return { clauses, params };
}

export function audit(db, user, action, target, details = '') {
  db.prepare('INSERT INTO audit_logs (user_id, user_name, action, target, details) VALUES (?, ?, ?, ?, ?)')
    .run(user.id, user.name, action, String(target), String(details));
}
