import { loadConfig } from './config.js';
import { openDatabase } from './db.js';
import { cleanupExpiredData } from './retention.js';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--apply' && arg !== '--dry-run') || (args.includes('--apply') && args.includes('--dry-run'))) {
  throw new Error('Use retention:cleanup -- --dry-run (default), or --apply');
}
const config = loadConfig(), db = openDatabase(config);
try { console.log(JSON.stringify(cleanupExpiredData(db, config, Date.now(), !args.includes('--apply')))); }
finally { db.close(); }
