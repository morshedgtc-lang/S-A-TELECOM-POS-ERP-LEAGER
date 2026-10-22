# SA Telecom POS + ERP — Entity Relationship Diagram

Source of truth: [backend/src/schema.sql](../backend/src/schema.sql). This file documents it.

```mermaid
erDiagram
    USERS ||--o{ SALES : "created_by"
    USERS ||--o{ PURCHASES : "created_by"
    USERS ||--o{ EXPENSES : "created_by"
    USERS ||--o{ PAYMENTS : "created_by"

    CUSTOMERS |o--o{ SALES : "customer_id (NULL = walk-in)"
    SUPPLIERS ||--o{ PURCHASES : "supplier_id"

    CATEGORIES |o--o{ CATEGORIES : "parent_id"
    CATEGORIES |o--o{ PRODUCTS : "category_id"
    BRANDS |o--o{ PRODUCTS : "brand_id"

    SALES ||--|{ SALE_ITEMS : "contains"
    PRODUCTS ||--o{ SALE_ITEMS : "sold as"
    PURCHASES ||--|{ PURCHASE_ITEMS : "contains"
    PRODUCTS ||--o{ PURCHASE_ITEMS : "bought as"

    PRODUCTS ||--o{ STOCK_UNITS : "serialized units"
    PURCHASE_ITEMS |o--o{ STOCK_UNITS : "received in"
    SALE_ITEMS |o--o{ STOCK_UNITS : "sold in"

    ACCOUNTS ||--o{ PAYMENTS : "cash movement"
    ACCOUNTS ||--o{ EXPENSES : "paid from"
    EXPENSES |o--o| PAYMENTS : "ref_type = expense"

    CUSTOMERS ||--o{ REPAIR_JOBS : "brings device"
    TECHNICIANS |o--o{ REPAIR_JOBS : "out-work"
    REPAIR_JOBS ||--o{ REPAIR_JOB_PARTS : "uses"
    PRODUCTS ||--o{ REPAIR_JOB_PARTS : "part"
    REPAIR_JOBS ||--o{ REPAIR_JOB_EVENTS : "status history"
    TECHNICIANS ||--o{ TECHNICIAN_LEDGER : "wage ledger"
    SALES ||--o{ SALE_RETURNS : "returned"
    SALE_RETURNS ||--|{ SALE_RETURN_ITEMS : "contains"
    SALE_ITEMS ||--o{ SALE_RETURN_ITEMS : "returned from"

    REPAIR_JOBS {
        INTEGER id PK
        TEXT job_no UK "J00001"
        INTEGER customer_id FK
        TEXT device
        TEXT imei
        TEXT problem
        TEXT accessories
        REAL estimated_cost
        REAL advance "cash taken at intake"
        TEXT status "in_work | out_work | success | failed | delivered"
        TEXT outcome "success | failed, set at delivery"
        INTEGER technician_id FK
        REAL technician_cost "booked to technician payable"
        TEXT promised_at
        REAL service_charge
        REAL parts_total
        REAL total
        REAL delivery_paid
        REAL due
        REAL refunded
        TEXT delivered_at
    }
    REPAIR_JOB_PARTS {
        INTEGER id PK
        INTEGER job_id FK
        INTEGER product_id FK
        INTEGER qty
        REAL unit_price
        REAL unit_cost
        REAL line_total
        INTEGER restocked "1 = returned to stock on failed delivery"
    }
    REPAIR_JOB_EVENTS {
        INTEGER id PK
        INTEGER job_id FK
        TEXT from_status
        TEXT to_status
        TEXT note
        TEXT created_by
    }
    TECHNICIANS {
        INTEGER id PK
        TEXT name
        TEXT mobile
        TEXT shop_name
        TEXT specialties
        REAL balance "payable, never below 0"
        INTEGER active
    }
    TECHNICIAN_LEDGER {
        INTEGER id PK
        INTEGER technician_id FK
        TEXT kind "opening | job | payment | adjustment"
        REAL amount "signed"
        INTEGER job_id
        TEXT note
    }
    SALE_RETURNS {
        INTEGER id PK
        TEXT return_no UK
        INTEGER sale_id FK
        REAL total
        REAL credited "taken off customer due"
        REAL refunded "paid from an account"
    }
    SALE_RETURN_ITEMS {
        INTEGER id PK
        INTEGER return_id FK
        INTEGER sale_item_id FK
        INTEGER product_id FK
        INTEGER qty
        REAL unit_price "after discount share"
        REAL unit_cost
        REAL line_total
        TEXT serials
    }
    SETTINGS {
        TEXT key PK "shopName, shopPhone, shopAddress, invoiceFooter, repairTerms, site (JSON website content)"
        TEXT value
    }

    USERS {
        TEXT id PK "login ID"
        TEXT name
        TEXT mobile
        TEXT password_hash "scrypt"
        TEXT role "owner (Super Admin) | admin | manager | staff"
        INTEGER active
        REAL basic_salary
        TEXT permissions "JSON map of action to bool"
        TEXT last_login_at
        TEXT created_at
    }
    CATEGORIES {
        INTEGER id PK
        TEXT name UK
        INTEGER parent_id FK
        TEXT emoji
    }
    BRANDS {
        INTEGER id PK
        TEXT name UK
    }
    PRODUCTS {
        INTEGER id PK
        TEXT name
        TEXT sku UK
        INTEGER category_id FK
        INTEGER brand_id FK
        REAL buy_price
        REAL sale_price
        INTEGER stock "never below 0"
        INTEGER low_stock_limit
        INTEGER serialized "1 = IMEI tracked"
        INTEGER active
        TEXT created_at
    }
    CUSTOMERS {
        INTEGER id PK
        TEXT name
        TEXT mobile
        TEXT address
        TEXT customer_type "retail | wholesaler"
        REAL balance "receivable"
        TEXT created_at
    }
    SUPPLIERS {
        INTEGER id PK
        TEXT name
        TEXT mobile
        TEXT address
        REAL balance "payable"
        TEXT created_at
    }
    ACCOUNTS {
        INTEGER id PK
        TEXT name UK
        TEXT account_type "cash | bank | mobile_wallet"
        REAL balance "never below 0"
        TEXT created_at
    }
    SALES {
        INTEGER id PK
        TEXT invoice_no UK
        INTEGER customer_id FK
        REAL subtotal
        REAL discount
        REAL total
        REAL paid
        REAL due
        TEXT note
        TEXT created_by FK
        TEXT created_at
    }
    SALE_ITEMS {
        INTEGER id PK
        INTEGER sale_id FK
        INTEGER product_id FK
        INTEGER qty
        REAL unit_price
        REAL unit_cost "snapshot for profit"
        REAL line_total
    }
    PURCHASES {
        INTEGER id PK
        TEXT invoice_no UK
        INTEGER supplier_id FK
        REAL total
        REAL paid
        REAL due
        TEXT note
        TEXT created_by FK
        TEXT created_at
    }
    PURCHASE_ITEMS {
        INTEGER id PK
        INTEGER purchase_id FK
        INTEGER product_id FK
        INTEGER qty
        REAL unit_cost
        REAL line_total
    }
    STOCK_UNITS {
        INTEGER id PK
        INTEGER product_id FK
        TEXT serial UK "IMEI / serial"
        TEXT status "in_stock | sold"
        INTEGER purchase_item_id FK
        INTEGER sale_item_id FK
    }
    PAYMENTS {
        INTEGER id PK
        INTEGER account_id FK
        TEXT direction "in | out"
        REAL amount
        TEXT ref_type "sale | purchase | expense | customer_collection | supplier_payment | account_opening"
        INTEGER ref_id "polymorphic, see ref_type"
        TEXT note
        TEXT created_by FK
        TEXT created_at
    }
    EXPENSES {
        INTEGER id PK
        TEXT category
        REAL amount
        INTEGER account_id FK
        TEXT note
        TEXT created_by FK
        TEXT created_at
    }
    AUDIT_LOGS {
        INTEGER id PK
        TEXT user_id
        TEXT user_name
        TEXT action
        TEXT target
        TEXT details
        TEXT created_at
    }
```

`AUDIT_LOGS` has no foreign key on purpose: it keeps history even if a user is later removed.

`schema_migrations` records one-off migrations in `backend/src/migrations/` (for example `001_users_admin_role`, which rebuilt `users` to allow the admin role).

## Invariants the code keeps

| Rule | Where enforced |
|------|----------------|
| `products.stock` equals the count of `in_stock` units for serialized products | `routes/sales.js`, `routes/purchases.js` (inside one transaction) |
| A serial is globally unique and can be sold only once while in stock | `stock_units.serial UNIQUE`, checked in sale and purchase routes |
| Walk-in sales (no customer) must be paid in full | `routes/sales.js` |
| An account balance never goes negative | `lib/ledger.js` (`moveMoney`) |
| Every cash movement writes a `payments` row | `lib/ledger.js` |
| `customers.balance` / `suppliers.balance` change only with a sale, purchase, or settlement | `routes/sales.js`, `routes/purchases.js`, `routes/parties.js` |
| All multi-table writes run in one transaction | `lib/db.js` (`tx`) |
| Repair status moves follow in_work ⇄ out_work → success/failed → delivered; delivered jobs are locked | `routes/repairs.js` (`FLOW`) |
| Out-work books the technician wage; reassigning reverses the old booking first | `routes/repairs.js` (status route) |
| Repair advance is cash in at intake; at delivery the bill is settled against it (collect, due, or refund) | `routes/repairs.js` (deliver route) |
| A sale return can't exceed sold minus already returned; a serial can be returned once | `routes/sales.js` (`createReturn`) |
| Profit = sales (after discount) − returns + repairs (bill − parts cost − technician wage) − expenses | `routes/reports.js` (`profitSummary`) |

## Known gaps versus the legacy app

Not yet modelled: product variants and custom category fields, salary records, WhatsApp templates, money transfers between accounts, purchase returns, and Mix (split) payments. See [LEGACY_ANALYSIS.md](LEGACY_ANALYSIS.md).
