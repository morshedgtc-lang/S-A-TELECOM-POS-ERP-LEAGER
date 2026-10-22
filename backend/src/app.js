import express from 'express';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { requireAuth } from './lib/auth.js';
import { HttpError } from './lib/http.js';
import { authRouter, usersRouter } from './routes/auth.js';
import { catalogRouter, productsRouter } from './routes/catalog.js';
import { customersRouter, suppliersRouter } from './routes/parties.js';
import { salesRouter } from './routes/sales.js';
import { purchasesRouter } from './routes/purchases.js';
import { accountsRouter, auditRouter, dashboardRouter, expensesRouter } from './routes/finance.js';

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', config.corsOrigin);
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter(db));

  const api = express.Router();
  api.use(requireAuth(db));
  api.get('/me', (req, res) => res.json({ user: req.user }));
  api.use('/users', usersRouter(db));
  api.use('/catalog', catalogRouter(db));
  api.use('/products', productsRouter(db));
  api.use('/customers', customersRouter(db));
  api.use('/suppliers', suppliersRouter(db));
  api.use('/sales', salesRouter(db));
  api.use('/purchases', purchasesRouter(db));
  api.use('/accounts', accountsRouter(db));
  api.use('/expenses', expensesRouter(db));
  api.use('/dashboard', dashboardRouter(db));
  api.use('/audit', auditRouter(db));
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'frontend', 'dist');
  if (existsSync(join(webDir, 'index.html'))) {
    app.use(express.static(webDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(webDir, 'index.html')));
  }

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
