import { Router } from 'express';
import { hasPerm, requireOwner, requirePerm } from '../lib/auth.js';
import { audit, httpError, requireText, toMoney, toNumber } from '../lib/http.js';
import { tx } from '../lib/db.js';

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

  // Rename / delete for categories and brands. Deleting one leaves its products uncategorised (FK ON DELETE SET NULL).
  for (const [table, label] of [['categories', 'Category'], ['brands', 'Brand']]) {
    router.patch(`/${table}/:id`, requirePerm('manageProducts'), (req, res) => {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!row) throw httpError(404, `${label} not found`);
      const name = req.body?.name === undefined ? row.name : requireText(req.body.name, `${label} name`);
      if (db.prepare(`SELECT 1 FROM ${table} WHERE name = ? AND id <> ?`).get(name, row.id)) throw httpError(409, `${label} "${name}" already exists`);
      db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(name, row.id);
      if (table === 'categories' && req.body?.emoji !== undefined) {
        db.prepare('UPDATE categories SET emoji = ? WHERE id = ?').run(req.body.emoji || null, row.id);
      }
      audit(db, req.user, `${table === 'categories' ? 'category' : 'brand'}_update`, `${row.name} -> ${name}`);
      res.json({ id: row.id });
    });

    router.delete(`/${table}/:id`, requireOwner, (req, res) => {
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!row) throw httpError(404, `${label} not found`);
      const col = table === 'categories' ? 'category_id' : 'brand_id';
      const products = db.prepare(`SELECT COUNT(*) AS n FROM products WHERE ${col} = ?`).get(row.id).n;
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(row.id);
      audit(db, req.user, `${table === 'categories' ? 'category' : 'brand'}_delete`, row.name, `products_unlinked=${products}`);
      res.json({ deleted: true, productsUnlinked: products });
    });
  }

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
    // status: active (default), archived, or all
    const status = String(req.query.status ?? 'active');
    const rows = db.prepare(`${PRODUCT_SELECT}
      WHERE (? = 'all' OR p.active = ?)
        AND (? = '' OR p.name LIKE ? OR p.sku LIKE ?)
        AND (? IS NULL OR p.category_id = ?)
      ORDER BY p.name`)
      .all(status, status === 'archived' ? 0 : 1, q, `%${q}%`, `%${q}%`, categoryId, categoryId);
    const withCost = hasPerm(req.user, 'viewCost');
    res.json(rows.map((r) => toProduct(r, withCost)));
  });

  /**
   * Any scanned code: a product barcode (SKU, case-insensitive) or an IMEI/serial.
   * Used by the camera scanner, the price check and the POS search box.
   */
  router.get('/lookup/:code', (req, res) => {
    const code = String(req.params.code).trim();
    if (!code) throw httpError(400, 'Empty code');
    const withCost = hasPerm(req.user, 'viewCost');
    const bySku = db.prepare(`${PRODUCT_SELECT} WHERE p.active = 1 AND p.sku = ? COLLATE NOCASE`).get(code);
    if (bySku) return res.json({ code, product: toProduct(bySku, withCost), serial: null, unitStatus: null });
    const unit = db.prepare('SELECT product_id, serial, status FROM stock_units WHERE serial = ?').get(code);
    if (unit) {
      const row = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(unit.product_id);
      return res.json({ code, product: toProduct(row, withCost), serial: unit.serial, unitStatus: unit.status });
    }
    throw httpError(404, `No product or IMEI found for ${code}`);
  });

  /** Gives every active product without a SKU a unique barcode (SA000123). */
  router.post('/barcodes/assign', requirePerm('manageProducts'), (req, res) => {
    const rows = db.prepare("SELECT id FROM products WHERE active = 1 AND (sku IS NULL OR TRIM(sku) = '')").all();
    const taken = db.prepare('SELECT 1 FROM products WHERE sku = ? COLLATE NOCASE');
    const set = db.prepare('UPDATE products SET sku = ? WHERE id = ?');
    let assigned = 0;
    tx(db, () => {
      for (const r of rows) {
        let code = `SA${String(r.id).padStart(6, '0')}`;
        for (let n = 1; taken.get(code); n++) code = `SA${String(r.id).padStart(6, '0')}-${n}`;
        set.run(code, r.id);
        assigned++;
      }
    });
    if (assigned) audit(db, req.user, 'barcodes_assign', 'products', `count=${assigned}`);
    res.json({ assigned });
  });

  /** In-stock IMEIs of a serialized product, for IMEI labels. */
  router.get('/:id/units', (req, res) => {
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!product) throw httpError(404, 'Product not found');
    res.json(db.prepare("SELECT serial FROM stock_units WHERE product_id = ? AND status = 'in_stock' ORDER BY id").all(product.id).map((u) => u.serial));
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

  /** Permanent delete for a wrong entry. Products with any history must be archived instead. */
  router.delete('/:id', requireOwner, (req, res) => {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!row) throw httpError(404, 'Product not found');
    const used = ['sale_items', 'purchase_items', 'repair_job_parts', 'stock_units']
      .reduce((n, tbl) => n + db.prepare(`SELECT COUNT(*) AS n FROM ${tbl} WHERE product_id = ?`).get(row.id).n, 0);
    if (used > 0) {
      throw httpError(409, `"${row.name}" has sales, purchase or stock history, so it cannot be deleted. Archive it instead.`);
    }
    db.prepare('DELETE FROM products WHERE id = ?').run(row.id);
    audit(db, req.user, 'product_delete', row.name, `id=${row.id}; sku=${row.sku ?? ''}; stock=${row.stock}`);
    res.json({ deleted: true });
  });

  return router;
}
