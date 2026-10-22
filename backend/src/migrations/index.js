/**
 * Versioned changes that schema.sql cannot express on an existing database
 * (SQLite cannot alter a CHECK constraint in place). Each runs once and is recorded.
 */
const MIGRATIONS = [
  {
    id: '001_users_admin_role',
    run(db) {
      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql ?? '';
      if (sql.includes("'admin'")) return;
      // Standard SQLite table rebuild: copy rows into a table with the new CHECK, then swap.
      db.exec(`
        PRAGMA foreign_keys = OFF;
        BEGIN;
        CREATE TABLE users_new (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          mobile        TEXT,
          password_hash TEXT NOT NULL,
          role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'staff')),
          active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          basic_salary  REAL NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
          permissions   TEXT NOT NULL DEFAULT '{}',
          last_login_at TEXT,
          created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO users_new SELECT id, name, mobile, password_hash, role, active, basic_salary, permissions, last_login_at, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
        COMMIT;
        PRAGMA foreign_keys = ON;
      `);
    },
  },
];

export function migrate(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))");
  for (const m of MIGRATIONS) {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(m.id)) continue;
    m.run(db);
    db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(m.id);
  }
}
