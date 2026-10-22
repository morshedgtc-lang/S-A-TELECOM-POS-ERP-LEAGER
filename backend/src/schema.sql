-- SA Telecom POS + ERP schema (SQLite). Idempotent: safe to run on every boot.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  mobile        TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'staff')),
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  basic_salary  REAL NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  permissions   TEXT NOT NULL DEFAULT '{}',          -- JSON map: action -> boolean
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  emoji     TEXT
);

CREATE TABLE IF NOT EXISTS brands (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  mobile        TEXT,
  address       TEXT,
  customer_type TEXT NOT NULL DEFAULT 'retail' CHECK (customer_type IN ('retail', 'wholesaler')),
  balance       REAL NOT NULL DEFAULT 0,               -- receivable (customer owes shop)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  mobile     TEXT,
  address    TEXT,
  balance    REAL NOT NULL DEFAULT 0,                  -- payable (shop owes supplier)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL UNIQUE,
  account_type TEXT NOT NULL CHECK (account_type IN ('cash', 'bank', 'mobile_wallet')),
  balance      REAL NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  sku             TEXT UNIQUE,
  category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  brand_id        INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  buy_price       REAL NOT NULL DEFAULT 0 CHECK (buy_price >= 0),
  sale_price      REAL NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  stock           INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  low_stock_limit INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_limit >= 0),
  serialized      INTEGER NOT NULL DEFAULT 0 CHECK (serialized IN (0, 1)),  -- IMEI / serial tracked
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no  TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  total       REAL NOT NULL CHECK (total >= 0),
  paid        REAL NOT NULL DEFAULT 0 CHECK (paid >= 0),
  due         REAL NOT NULL DEFAULT 0 CHECK (due >= 0),
  note        TEXT,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  qty         INTEGER NOT NULL CHECK (qty > 0),
  unit_cost   REAL NOT NULL CHECK (unit_cost >= 0),
  line_total  REAL NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS sales (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no  TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),         -- NULL = walk-in (must pay in full)
  subtotal    REAL NOT NULL CHECK (subtotal >= 0),
  discount    REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total       REAL NOT NULL CHECK (total >= 0),
  paid        REAL NOT NULL DEFAULT 0 CHECK (paid >= 0),
  due         REAL NOT NULL DEFAULT 0 CHECK (due >= 0),
  note        TEXT,
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id    INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL CHECK (qty > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  unit_cost  REAL NOT NULL CHECK (unit_cost >= 0),      -- snapshot of buy price at sale time
  line_total REAL NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS stock_units (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  serial           TEXT NOT NULL UNIQUE,                 -- IMEI / serial, globally unique
  status           TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'sold')),
  purchase_item_id INTEGER REFERENCES purchase_items(id),
  sale_item_id     INTEGER REFERENCES sale_items(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  direction  TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount     REAL NOT NULL CHECK (amount > 0),
  ref_type   TEXT NOT NULL,                              -- sale | purchase | expense | customer_collection | supplier_payment | account_opening
  ref_id     INTEGER,                                    -- polymorphic reference by ref_type
  note       TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT NOT NULL,
  amount     REAL NOT NULL CHECK (amount > 0),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  note       TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  user_name  TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_units_product ON stock_units(product_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_account ON payments(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
