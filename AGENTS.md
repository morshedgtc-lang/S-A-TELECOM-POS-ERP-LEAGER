# AGENTS.md — guide for AI agents and contributors

This file is the working contract for any agent (Claude, Codex, Cursor, etc.) or developer changing this repository. `CLAUDE.md` imports this file.

## What this project is

SA Telecom POS + ERP: point of sale, stock (including IMEI / serial tracking), purchases, customers and suppliers ledgers, expenses, cash accounts, and dashboard for a phone and accessories shop.

- `legacy/SA_Telecom_POS_v1_1.html` — the original single-file browser app. **Reference only. Do not edit.**
- `backend/` — Node 24 API using built-in `node:sqlite` and Express 5.
- `frontend/` — React 18 + Vite + TypeScript single-page app.
- `docs/ERD.md` — database design. `docs/LEGACY_ANALYSIS.md` — what the legacy app does and what is still to port.

## Commands

```bash
# backend
cd backend
npm install
npm run dev        # API on http://localhost:4000 (creates data/sa_pos.db on first run)
npm test           # node:test integration suite — must stay green

# frontend
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to :4000
npm run build      # tsc + vite build — must stay green
```

Environment variables (see `backend/.env.example`): `PORT`, `DB_FILE`, `JWT_SECRET` (required in production), `CORS_ORIGIN`, `OWNER_ID`, `OWNER_PASSWORD` (first boot only).

## Architecture rules

1. **Business rules live in the backend.** The frontend may hide buttons, but every write route must check permission with `requirePerm` or `hasPerm`.
2. **Money and stock writes are transactional.** Use `tx(db, fn)` for any change touching more than one table. Route all cash movement through `moveMoney` in `lib/ledger.js` so the `payments` ledger stays complete.
3. **Never let stock or account balances go negative** from the API. Keep the `CHECK` constraints in `schema.sql` and the checks in the routes.
4. **Serialized products** (`serialized = 1`) change stock only through purchases (create units) and sales (mark units `sold`). Do not edit `products.stock` directly for them.
5. **Permission model:** roles rank owner (Super Admin) > admin > manager > staff (`ROLE_RANK`). Owner and admin have everything; only the owner can create or change owners and admins, and the last active owner cannot be removed. Manager and staff get defaults from `ROLE_PERMISSIONS` in `lib/auth.js`, overridable per user. New actions go into `ACTIONS` and into the defaults.
6. **Deleting:** only the owner (Super Admin) may delete, through `requireOwner`. Never hard-delete a record that other rows refer to (sales, payments, stock units…); return 409 and offer archive / deactivate instead. Deletes that touch money must reverse it through `moveMoney` and write an audit row.
7. **Passwords** are stored only as scrypt hashes (`hashPassword`). Never log, return, or store plain passwords.
8. **Errors:** throw `httpError(status, message)`. Messages are user-facing and may be shown in the UI.
9. **Audit:** every create or change writes an `audit(...)` row.
10. **Schema changes:** `schema.sql` is idempotent (`CREATE ... IF NOT EXISTS`). Until a migration tool exists, a breaking change needs a new file in `backend/src/migrations/` plus a note in the PR. Do not drop data silently.

## Frontend language and theme

- All UI text goes through `t()` from `src/i18n.tsx`. The Bangla text is the key; add the English to `src/i18n.en.ts` in the same change.
- Call `t()` at render time, never in a module-level constant (keep the raw Bangla there and wrap it where it is rendered).
- Colours come from the CSS variables in `styles.css` (`--rose`, `--green`, `--red`, …); both `data-theme="dark"` and light must stay readable.
- Paths: `/` public site, `/login`, `/app/<page>`. The server returns `index.html` for every non-API path.

## Mobile apps

- `frontend/android` and `frontend/ios` are Capacitor projects wrapping the same build. See `docs/MOBILE.md`.
- After frontend changes run `npm run app:sync` in `frontend/`. Never edit `android/app/src/main/assets/public` or `ios/App/App/public` (generated).
- Code that behaves differently in the apps checks `isNative` from `src/native.ts`; API calls go through `apiBase()` there.

## Code style

- Backend: ES modules, no build step, plain JavaScript. Route files export a factory: `xxxRouter(db)`.
- Frontend: TypeScript strict. Keep pages self-contained under `src/pages/`. Shared API helpers are in `src/api.ts`.
- Match the existing naming: `camelCase` in JSON and JS, `snake_case` in SQL.
- Keep comments short and only where the reason is not obvious.

## Testing expectations

- Any change to a route or rule needs a test in `backend/test/api.test.js` (or a new file in the same folder).
- Run `npm test` in `backend/` and `npm run build` in `frontend/` before reporting a task done. Report failures with the output; do not claim success without running them.

## Git

- `main` is the release branch. Work on a branch named `feat/<short-topic>` or `fix/<short-topic>`.
- Commit messages: imperative, present tense, under 72 characters for the subject.
- Do not commit `node_modules/`, `data/`, `dist/`, or `.env` files. `.gitignore` covers these.

## Do not

- Edit `legacy/` or copy its code wholesale. Port behaviour, not markup.
- Add a database server dependency without an ADR in `docs/`. SQLite is the current choice because it runs with zero setup.
- Hard-code the owner password or JWT secret anywhere except the environment.

## Open work

See the "Still to port" list in `docs/LEGACY_ANALYSIS.md`. Pick items there in order unless the user says otherwise.
