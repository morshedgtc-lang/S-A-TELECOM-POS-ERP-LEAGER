import { Router } from 'express';
import { hasPerm, requirePerm } from '../lib/auth.js';
import { audit, httpError, requireText, toMoney, toNumber } from '../lib/http.js';

export function catalogRouter(db) {
  const router = Router();

  router.get('/categories', (_req, res) => {
    res.json(db.prepare('SELECT id, name, parent_id AS parentId, emoji FROM categories ORDER BY name').all());
  });

  router.post('/categories', requirePerm('manageProducts'), (req, res) => {
    const name = requireText(req.body?.name, 'Category name');
    const parentId = req.body?.parentId ? toNumber(req.body.parentId, 'Parent category') : null;
    const result = db.prepare('INSERT INTO categories (name, parent_id, emoji) VALUES (?, ?, ?)')
      .run(name, parentId, req.body?.emoji ?? null);
    audit(db, req.user, 'category_create', name);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  router.get('/brands', (_req, res) => {
    res.json(db.prepare('SELECT id, name FROM brands ORDER BY name').all());
  });

  router.post('/brands', requirePerm('manageProducts'), (req, res) => {
    const name = requireText(req.body?.name, 'Brand name');
    const result = db.prepare('INSERT INTO brands (name) VALUES (?)').run(name);
    audit(db, req.user, 'brand_create', name);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  return router;
}

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name, b.name AS brand_name
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id`;

/** Public product shape. Buy price is only included for users allowed to see cost. */
function toProduct(row, withCost) {
  const product = {
    id: row.id,
    name: row.name,
    sku: row.sku,
    categoryId: row.category_id,
    categoryName: row.category_name,
    brandId: row.brand_id,
    brandName: row.brand_name,
    salePrice: row.sale_price,
    dealerPrice: row.dealer_price ?? null,
    stock: row.stock,
    lowStockLimit: row.low_stock_limit,
    serialized: row.serialized === 1,
    active: row.active === 1,
    isLowStock: row.stock <= row.low_stock_limit,
  };
  if (withCost) product.buyPrice = row.buy_price;
  return product;
}

export function productsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const q = String(req.query.q ?? '').trim();
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
    const rows = db.prepare(`${PRODUCT_SELECT}
      WHERE p.active = 1
        AND (? = '' OR p.name LIKE ? OR p.sku LIKE ?)
        AND (? IS NULL OR p.category_id = ?)
      ORDER BY p.name`)
      .all(q, `%${q}%`, `%${q}%`, categoryId, categoryId);
    const withCost = hasPerm(req.user, 'viewCost');
    res.json(rows.map((r) => toProduct(r, withCost)));
  });

  /** Barcode/IMEI scan at the till: finds the in-stock unit and its product. */
  router.get('/serial/:serial', (req, res) => {
    const unit = db.prepare("SELECT product_id, status FROM stock_units WHERE serial = ?").get(String(req.params.serial).trim());
    if (!unit) throw httpError(404, 'This IMEI / serial is not in the system');
    if (unit.status !== 'in_stock') throw httpError(400, 'This IMEI / serial is already sold');
    const row = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(unit.product_id);
    res.json({ serial: String(req.params.serial).trim(), product: toProduct(row, hasPerm(req.user, 'viewCost')) });
  });

  router.get('/:id', (req, res) => {
    const row = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(req.params.id);
    if (!row) throw httpError(404, 'Product not found');
    res.json(toProduct(row, hasPerm(req.user, 'viewCost')));
  });

  router.post('/', requirePerm('manageProducts'), (req, res) => {
    const body = req.body ?? {};
    const name = requireText(body.name, 'Product name');
    const serialized = Boolean(body.serialized);
    const openingStock = body.stock === undefined ? 0 : toNumber(body.stock, 'Opening stock');
    if (serialized && openingStock !== 0) {
      throw httpError(400, 'Serialized products receive stock through purchases, not opening stock');
    }
    if (!Number.isInteger(openingStock) || openingStock < 0) throw httpError(400, 'Opening stock must be a whole number');
    const sku = body.sku ? String(body.sku).trim() : null;
    if (sku && db.prepare('SELECT 1 FROM products WHERE sku = ?').get(sku)) throw httpError(409, 'SKU already exists');

    const result = db.prepare(`INSERT INTO products
        (name, sku, category_id, brand_id, buy_price, sale_price, stock, low_stock_limit, serialized)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        name,
        sku,
        body.categoryId ?? null,
        body.brandId ?? null,
        toMoney(body.buyPrice, 'Buy price'),
        toMoney(body.salePrice, 'Sale price'),
        openingStock,
        toMoney(body.lowStockLimit, 'Low stock limit', 5),
        serialized ? 1 : 0,
      );
    if (body.dealerPrice !== undefined && body.dealerPrice !== null && body.dealerPrice !== '') {
      db.prepare('UPDATE products SET dealer_price = ? WHERE id = ?').run(toMoney(body.dealerPrice, 'Dealer price'), result.lastInsertRowid);
    }
    audit(db, req.user, 'product_create', name, `id=${result.lastInsertRowid}`);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  router.patch('/:id', requirePerm('manageProducts'), (req, res) => {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!row) throw httpError(404, 'Product not found');
    const body = req.body ?? {};
    const priceChanged = body.salePrice !== undefined && toMoney(body.salePrice, 'Sale price') !== row.sale_price;
    if (priceChanged && !hasPerm(req.user, 'editPrice')) throw httpError(403, 'Permission denied: editPrice');

    db.prepare(`UPDATE products SET name = ?, sku = ?, category_id = ?, brand_id = ?, buy_price = ?,
                  sale_price = ?, low_stock_limit = ?, active = ? WHERE id = ?`)
      .run(
        body.name ? requireText(body.name, 'Product name') : row.name,
        body.sku === undefined ? row.sku : (body.sku || null),
        body.categoryId === undefined ? row.category_id : body.categoryId,
        body.brandId === undefined ? row.brand_id : body.brandId,
        body.buyPrice === undefined ? row.buy_price : toMoney(body.buyPrice, 'Buy price'),
        body.salePrice === undefined ? row.sale_price : toMoney(body.salePrice, 'Sale price'),
        body.lowStockLimit === undefined ? row.low_stock_limit : toMoney(body.lowStockLimit, 'Low stock limit'),
        body.active === undefined ? row.active : (body.active ? 1 : 0),
        row.id,
      );
    if (body.dealerPrice !== undefined) {
      db.prepare('UPDATE products SET dealer_price = ? WHERE id = ?')
        .run(body.dealerPrice === null || body.dealerPrice === '' ? null : toMoney(body.dealerPrice, 'Dealer price'), row.id);
    }
    audit(db, req.user, 'product_update', row.name, `id=${row.id}`);
    res.json({ id: row.id });
  });

  /** Manual stock correction for non-serialized products (damage, count correction). */
  router.post('/:id/adjust', requirePerm('manageProducts'), (req, res) => {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!row) throw httpError(404, 'Product not found');
    if (row.serialized === 1) throw httpError(400, 'Serialized products are adjusted by unit, not by quantity');
    const change = toNumber(req.body?.change, 'Change');
    if (!Number.isInteger(change) || change === 0) throw httpError(400, 'Change must be a non-zero whole number');
    if (row.stock + change < 0) throw httpError(400, 'Stock cannot go below zero');
    const reason = requireText(req.body?.reason, 'Reason');
    db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(change, row.id);
    audit(db, req.user, 'stock_adjust', row.name, `change=${change}; reason=${reason}`);
    res.json({ id: row.id, stock: row.stock + change });
  });

  return router;
}
