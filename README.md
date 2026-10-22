# SA Telecom POS + ERP

Point of sale, stock with IMEI tracking, purchases, customer and supplier ledgers, expenses, cash accounts, and dashboard for a phone and accessories shop.

Rewritten from the single-file browser app in [legacy/](legacy/SA_Telecom_POS_v1_1.html) into a client-server system.

## Layout

```
backend/    Node 24 API (Express 5, node:sqlite, JWT)
frontend/   React 18 + Vite + TypeScript
docs/       ERD and legacy analysis
legacy/     original single-file app (reference only)
AGENTS.md   contributor and agent guide (read this first)
CLAUDE.md   imports AGENTS.md
```

## Quick start

Requirements: Node.js 22.13 or newer (tested on 24). No database server is needed.

```bash
cd backend
npm install
npm run dev
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Sign in with `owner` and the password from `OWNER_PASSWORD` (default `change-me-now` — **change it before any real use**). Set `OWNER_PASSWORD` in `backend/.env` or the environment before the first start, because the owner is created on first boot.

## Tests

```bash
cd backend && npm test
cd frontend && npm run build
```

## Production notes

- Set `NODE_ENV=production` and a strong `JWT_SECRET`. The server refuses to start otherwise.
- Serve the frontend build (`frontend/dist`) behind the same origin as the API, or set `CORS_ORIGIN`.
- Back up `backend/data/sa_pos.db` (plus its `-wal` and `-shm` files) regularly.

## Status

| Module | Backend | Frontend |
|--------|---------|----------|
| Login, roles, permissions | yes | yes |
| Dashboard (cash, hold amount, service track, out-work) | yes | yes |
| Repair job cards (service tracker), parts, delivery billing | yes | yes |
| Technicians (carigor) out-work, wage ledger and payments | yes | yes |
| POS till with IMEI scan, quick customer add, invoice print | yes | yes |
| Sale invoices, reprint, returns with refund | yes | yes |
| Products, categories, brands, stock adjust | yes | yes |
| IMEI / serial stock and IMEI lookup | yes | yes |
| Purchases | yes | yes |
| Customers & suppliers, settlements | yes | yes |
| Expenses | yes | yes |
| Profit & loss and daily cash book | yes | yes |
| Shop settings and staff | yes | yes |
| Accounts | create + list | balances on dashboard |
| Audit log | API only | not yet |
| Mix payment, variants, salary, WhatsApp, labels | not yet | not yet |

The porting order is in [docs/LEGACY_ANALYSIS.md](docs/LEGACY_ANALYSIS.md).
