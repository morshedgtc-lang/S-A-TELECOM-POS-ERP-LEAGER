# Legacy analysis: `legacy/SA_Telecom_POS_v1_1.html`

## What it is

A single 830 KB HTML file. Vanilla JavaScript and inline CSS, Bengali UI, Font Awesome icons, and one CDN script (`qrcodejs`). It runs entirely in the browser.

## Features found

| Area | Pages / features |
|------|------------------|
| Overview | Dashboard, service tracker, technician (carigor) out-work |
| Sales & service | POS cashier with Mix payment, invoice list, service management |
| Purchasing | New purchase, purchase history |
| Products | Products & stock, categories with custom fields, variants, brands, returns, IMEI lookup |
| Parties | Customers and due ledger, supplier ledger, wholesalers, supplier sales report |
| Money | Cash drawer and accounts, expenses, daily cash book, daily summary, profit & loss reports, performance |
| Admin | Staff and salary, shop settings and backup, audit log, WhatsApp templates |

The sidebar defines 28 pages (`ALL_PAGES`) and 16 permission actions (`ALL_ACTIONS`).

## Data model (as implemented)

All data lives in `localStorage` under `pos_*` keys (for example `pos_products`, `pos_sales_records`, `pos_customers`, `pos_users`, `pos_audit_log`). Backup and restore is a JSON file download and upload of those keys.

A `DataService` object with `API_CONFIG.mode = 'local' | 'api'` exists, but its endpoints (`/customers`, `/products`, `/sales`, …) are not wired to any real server.

## Business rules worth keeping

- Roles: `owner` (all access), `manager` (most actions, no staff or settings), `staff` (sell only by default).
- Per-user permissions: price edit, discount with a percentage cap (`maxDiscountPercent`, defaults 20 for manager and 5 for staff), sell below cost, delete sale, see profit, see buy price, money transfer, returns, expenses, salary, backup, CSV export.
- Serialized stock (IMEI) with duplicate detection across stock, purchase, and sale records.
- Sale can be Cash, Due, or Mix (split across accounts). Due goes to the customer balance.
- Wholesalers are a customer type with their own balance.
- Negative sale is blocked unless `allowNegativeSale` is set.

## Risks found

1. **Plain-text passwords.** Staff passwords are saved as typed in the `pos_users` array (`saveStaffUser`). Anyone who can open the browser profile can read them.
2. **Client-only login.** Access checks happen in the browser. There is no server-side enforcement.
3. **Single-browser data.** Data is per browser and per origin. Two devices never share it, and clearing site data erases the shop.
4. **Large single file.** About 830 KB of mixed markup, CSS, and JS makes safe change difficult.

## What the rewrite does about it

| Legacy issue | New build |
|--------------|-----------|
| Plain-text passwords | scrypt password hashes, token-based sessions (JWT, 12 h) |
| Client-only permissions | every write route checks a permission on the server |
| Browser-only data | SQLite database on the server, with transactions |
| Monolith | separate `backend/` API and `frontend/` SPA |
| Money balances drift | balances change only inside transactions, with a `payments` ledger |

## Still to port (priority order)

1. Returns and stock reversal
2. Service tickets and technician work (carigor)
3. Product variants and category custom fields
4. Reports: profit & loss, daily cash book, supplier sales, customer due
5. Staff salary and attendance
6. Printing (thermal and A4 invoices, QR labels)
7. Bengali localisation of the new UI
8. CSV export and backup

Business data should be migrated from the legacy `pos_*` JSON backup with a one-time import script. That script is not written yet.
