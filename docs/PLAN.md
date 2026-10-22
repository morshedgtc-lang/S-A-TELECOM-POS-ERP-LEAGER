# SA Telecom — product plan

A shop system for a mobile phone repair and sales business: repairs, spare parts, accessories, new and used phones. One web app with a public website and an admin side.

## 1. Pages

| Area | Path | Who sees it | What it does |
|------|------|-------------|--------------|
| Home (public) | `/` | Everyone | Hero banner, services, highlights, about, contact, map and WhatsApp links, online repair tracking |
| Login | `/login` | Everyone | Sign in with user ID and password |
| Admin app | `/app/...` | Signed-in users | Sidebar + business dashboard and all modules below |

## 2. Admin modules (sidebar)

| Section | Module | Main features |
|---------|--------|---------------|
| Overview | Dashboard | Total cash by account, hold amount by repair status, service track, out-work, today's sales and profit, low stock |
| | Service tracker | Job cards (J00001…), advance, status flow In Work → Out Work → Success/Unsuccess → Delivered, parts used, delivery bill, history, print |
| | Technician out-work | Outside technicians (carigor), wage booking per job, wage ledger and payments |
| Sales & service | POS cashier | IMEI scan, product tiles, discount, partial payment / due, change, invoice print |
| | Invoices & returns | Search, reprint, returns with restock and refund |
| Purchasing | New purchase | Stock in from suppliers, IMEI units, supplier due |
| Products | Products & stock | Categories (Mobile Phone, Spare Parts, Accessories, Service), brands, prices, low-stock alert |
| | IMEI lookup | Where a phone came from, who bought it, repair history |
| Parties & ledgers | Customers & suppliers | Balances, dealer settings (credit limit, discount), statement, WhatsApp reminder, collect against bills, pay supplier |
| | Dues collection | Everyone who owes, days overdue, over-limit flag, collect, statement, reminder |
| Money & accounts | Expenses | Expense book by category |
| | Profit & reports | Profit & loss, cash book by account and type |
| Owner & admin | Website & banner | Edit the public home page (Bangla + English), upload the banner |
| | Shop settings / staff | Shop details for prints, staff accounts and roles |

## 3. Roles

| Role | Shown as | Can create | Default access |
|------|----------|-----------|----------------|
| `owner` | Super Admin | Any role | Everything |
| `admin` | Admin | Manager, Staff | Everything, but cannot manage Super Admins or other Admins |
| `manager` | Manager | — | Sales, repairs, purchases, products, parties, money, reports |
| `staff` | Staff | — | POS sales and repair desk |

Per-user permissions can be changed for Manager and Staff. The last active Super Admin cannot be removed. Everyone can change their own password from the user menu.

## 4. Look and language

- Rose + dark theme by default, with a light "buff" theme; light green for good / money in, red for danger / due.
- Multi-colour dashboard and website cards.
- English / বাংলা switch on every page (public site, login, admin). Website content is entered in both languages.
- Currency BDT (৳), two decimals.

## 5. Delivery steps

1. ✅ Core POS, stock, IMEI, purchases, parties, expenses, accounts
2. ✅ Repairs, technicians, returns, reports, printing
3. ✅ Public website, login page, Super Admin / Admin roles, theme, English / Bangla
4. Next: split (mix) payment, product variants, staff salary, WhatsApp messages, barcode labels, legacy data import — see `LEGACY_ANALYSIS.md`
