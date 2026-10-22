import { config } from './config.js';
import { createApp } from './app.js';
import { openDb } from './lib/db.js';
import { bootstrap } from './seed.js';

const db = openDb();
bootstrap(db);

createApp(db).listen(config.port, () => {
  console.log(`SA POS API listening on http://localhost:${config.port}`);
});
