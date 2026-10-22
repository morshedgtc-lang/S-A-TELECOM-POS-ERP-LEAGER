-- SA Telecom POS + ERP schema (SQLite). Idempotent: safe to run on every boot.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  mobile        TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'staff')),  -- owner = Super Admin
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

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Outside technicians (carigor) who take out-work jobs. balance = what the shop owes them.
CREATE TABLE IF NOT EXISTS technicians (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  mobile      TEXT,
  shop_name   TEXT,
  specialties TEXT,
  balance     REAL NOT NULL DEFAULT 0 CHECK (balance >= 0),
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS technician_ledger (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  technician_id INTEGER NOT NULL REFERENCES technicians(id),
  kind          TEXT NOT NULL CHECK (kind IN ('opening', 'job', 'payment', 'adjustment')),
  amount        REAL NOT NULL,                          -- signed: + adds to payable, - reduces it
  job_id        INTEGER,
  note          TEXT,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Repair job card. Advance is cash received at intake; revenue is recognised at delivery.
CREATE TABLE IF NOT EXISTS repair_jobs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  job_no          TEXT NOT NULL UNIQUE,
  customer_id     INTEGER NOT NULL REFERENCES customers(id),
  device          TEXT NOT NULL,
  imei            TEXT,
  problem         TEXT NOT NULL,
  accessories     TEXT,
  estimated_cost  REAL NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  advance         REAL NOT NULL DEFAULT 0 CHECK (advance >= 0),
  status          TEXT NOT NULL DEFAULT 'in_work'
                  CHECK (status IN ('in_work', 'out_work', 'success', 'failed', 'delivered')),
  outcome         TEXT CHECK (outcome IN ('success', 'failed')),
  technician_id   INTEGER REFERENCES technicians(id),
  technician_cost REAL NOT NULL DEFAULT 0 CHECK (technician_cost >= 0),
  technician_note TEXT,
  promised_at     TEXT,
  service_charge  REAL NOT NULL DEFAULT 0 CHECK (service_charge >= 0),
  parts_total     REAL NOT NULL DEFAULT 0 CHECK (parts_total >= 0),
  total           REAL NOT NULL DEFAULT 0 CHECK (total >= 0),
  delivery_paid   REAL NOT NULL DEFAULT 0 CHECK (delivery_paid >= 0),
  due             REAL NOT NULL DEFAULT 0 CHECK (due >= 0),
  refunded        REAL NOT NULL DEFAULT 0 CHECK (refunded >= 0),
  note            TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at    TEXT
);

CREATE TABLE IF NOT EXISTS repair_job_parts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     INTEGER NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL CHECK (qty > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  unit_cost  REAL NOT NULL CHECK (unit_cost >= 0),
  line_total REAL NOT NULL CHECK (line_total >= 0),
  restocked  INTEGER NOT NULL DEFAULT 0 CHECK (restocked IN (0, 1))
);

CREATE TABLE IF NOT EXISTS repair_job_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      INTEGER NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_returns (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  return_no  TEXT NOT NULL UNIQUE,
  sale_id    INTEGER NOT NULL REFERENCES sales(id),
  total      REAL NOT NULL CHECK (total >= 0),
  credited   REAL NOT NULL DEFAULT 0 CHECK (credited >= 0),   -- taken off customer due
  refunded   REAL NOT NULL DEFAULT 0 CHECK (refunded >= 0),   -- paid back from an account
  note       TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id    INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
  product_id   INTEGER NOT NULL REFERENCES products(id),
  qty          INTEGER NOT NULL CHECK (qty > 0),
  unit_price   REAL NOT NULL CHECK (unit_price >= 0),     -- after the sale's discount share
  unit_cost    REAL NOT NULL CHECK (unit_cost >= 0),
  line_total   REAL NOT NULL CHECK (line_total >= 0),
  serials      TEXT
);

CREATE INDEX IF NOT EXISTS idx_repair_jobs_status ON repair_jobs(status);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_imei ON repair_jobs(imei);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_customer ON repair_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_technician_ledger_tech ON technician_ledger(technician_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_item ON sale_return_items(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_units_product ON stock_units(product_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created ON purchases(created_at);
CREATE INDEX IF NOT EXISTS idx_payments_account ON payments(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
