import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { provisionAccounts } from './accounts.js';
import { openDatabase } from './db.js';

const args = process.argv.slice(2);
const reset = args[0] === '--reset';
const filename = reset ? args[1] : args[0];
if (!filename || args.length !== (reset ? 2 : 1)) {
  throw new Error('Usage: npm run accounts:import -- [--reset] /absolute/path/to/accounts.json');
}
// This local administrator tool needs database paths, not API/service secrets.
// It never starts the HTTP server or performs upload-file cleanup.
const input: unknown = JSON.parse(readFileSync(resolve(filename), 'utf8'));
const db = openDatabase({
  databasePath: resolve(process.env.DATABASE_PATH ?? './.local-data/campusbazaar.sqlite'),
  uploadDir: resolve(process.env.UPLOAD_DIR ?? './.local-data/uploads')
});
try {
  const accounts = await provisionAccounts(db, process.env.AGENT_SCHOOL_ID?.trim() || 'school_demo', input, reset ? 'reset' : 'create');
  console.log(JSON.stringify({ operation: reset ? 'password-reset' : 'account-import', accounts }));
} finally {
  db.close();
}
