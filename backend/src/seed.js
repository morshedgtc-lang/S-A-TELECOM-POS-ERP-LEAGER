import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { hashPassword, ROLE_PERMISSIONS } from './lib/auth.js';
import { openDb } from './lib/db.js';

/** Creates the owner account and starter data on first boot. Safe to run repeatedly. */
export function bootstrap(db) {
  const owner = db.prepare("SELECT 1 FROM users WHERE role = 'owner'").get();
  if (!owner) {
    db.prepare(`INSERT INTO users (id, name, password_hash, role, permissions) VALUES (?, ?, ?, 'owner', ?)`)
      .run(config.bootstrapOwnerId, 'Owner', hashPassword(config.bootstrapOwnerPassword), JSON.stringify(ROLE_PERMISSIONS.owner));
  }
  if (!db.prepare('SELECT 1 FROM accounts').get()) {
    db.prepare("INSERT INTO accounts (name, account_type) VALUES ('Cash Drawer', 'cash'), ('Bank', 'bank'), ('Mobile Wallet', 'mobile_wallet')").run();
  }
  if (!db.prepare('SELECT 1 FROM categories').get()) {
    db.prepare("INSERT INTO categories (name, emoji) VALUES ('Mobile Phone', '📱'), ('Accessories', '🎧'), ('Service', '🛠️')").run();
  }
  if (!db.prepare('SELECT 1 FROM customers').get()) {
    db.prepare("INSERT INTO customers (name, customer_type) VALUES ('Walk-in Customer', 'retail')").run();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  bootstrap(openDb());
  console.log('Seed complete');
}
