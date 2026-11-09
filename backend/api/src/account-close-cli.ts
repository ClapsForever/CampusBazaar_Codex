import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeAccount } from './account-closure.js';

const args = process.argv.slice(2);
const [filename, flag, id] = args;
if (!filename || (args.length !== 1 && (args.length !== 3 || flag !== '--apply' || !id))) {
  throw new Error('Usage: npm run accounts:close -- /path/to/email.json [--apply USER_ID]');
}
const databasePath = process.env.DATABASE_PATH?.trim();
if (!databasePath || !statSync(resolve(databasePath)).isFile()) throw new Error('DATABASE_PATH must name the existing business database');
const email: unknown = JSON.parse(readFileSync(resolve(filename), 'utf8'));
const db = new DatabaseSync(resolve(databasePath));
try {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON');
  if (db.prepare('PRAGMA user_version').get()?.user_version !== 7) throw new Error('Account closure requires schema v7');
  const report = closeAccount(db, email, id);
  if (!report.dryRun) db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  console.log(JSON.stringify(report));
} finally {
  db.close();
}
