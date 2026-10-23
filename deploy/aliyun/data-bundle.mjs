import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

function filesIn(directory, prefix = '') {
  const files = [];
  for (const name of readdirSync(directory).sort()) {
    const file = join(directory, name), info = lstatSync(file);
    const key = prefix ? `${prefix}/${name}` : name;
    if (info.isSymbolicLink()) throw new Error('Symbolic links are not accepted in migration data');
    if (info.isDirectory()) files.push(...filesIn(file, key));
    else if (info.isFile()) files.push(key);
    else throw new Error('Only regular files are accepted in migration data');
  }
  return files;
}

function newDirectory(destination, sources = []) {
  const parent = realpathSync(dirname(resolve(destination)));
  const target = join(parent, basename(resolve(destination)));
  if (existsSync(target)) throw new Error('Destination already exists; nothing will be overwritten');
  for (const source of sources) {
    const distance = relative(realpathSync(source), target);
    if (distance === '' || (!distance.startsWith(`..${sep}`) && distance !== '..' && !isAbsolute(distance))) {
      throw new Error('Destination must be outside the source directory');
    }
  }
  mkdirSync(target, { mode: 0o700 });
  return target;
}

function digest(file) {
  const hash = createHash('sha256'), fd = openSync(file, 'r'), buffer = Buffer.alloc(1024 * 1024);
  try {
    let count;
    while ((count = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, count));
    return hash.digest('hex');
  } finally { closeSync(fd); }
}

function databaseSummary(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('SQLite integrity check failed');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite foreign key check failed');
    const schema = Number(db.prepare('PRAGMA user_version').get().user_version);
    if (schema < 1 || schema > 6) throw new Error('Unsupported database schema; review the target API first');
    const counts = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      counts[name] = Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n);
    }
    const images = Object.hasOwn(counts, 'product_images') ?
      db.prepare('SELECT id,extension FROM product_images ORDER BY id').all().map(row => {
        if (!/^img_[a-f0-9]{32}$/.test(row.id) || !['jpg', 'png', 'webp'].includes(row.extension)) throw new Error('Unrecognized stored image filename');
        return `${row.id}.${row.extension}`;
      }) : [];
    return { schema, counts, images };
  } finally { db.close(); }
}

/** Freeze API writes externally first, including any other process using this DB/uploads. */
export async function snapshotData({ database, uploads, output, apiStopped = false }) {
  if (!apiStopped) throw new Error('Stop API writes first and pass --confirm-api-stopped');
  if (!lstatSync(database).isFile() || lstatSync(database).isSymbolicLink()) throw new Error('Database must be a regular file');
  if (!lstatSync(uploads).isDirectory() || lstatSync(uploads).isSymbolicLink()) throw new Error('Uploads must be a regular directory');
  const names = filesIn(uploads);
  const directory = newDirectory(output, [uploads, dirname(resolve(database))]);
  mkdirSync(join(directory, 'data'), { mode: 0o700 });
  mkdirSync(join(directory, 'data/uploads'), { mode: 0o700 });
  const db = new DatabaseSync(database, { readOnly: true });
  try { await backup(db, join(directory, 'data/campusbazaar.sqlite')); }
  finally { db.close(); }
  // Backup includes committed WAL pages; make the exported DB self-contained.
  // Only the new snapshot changes journal mode, never the source database.
  const snapshot = new DatabaseSync(join(directory, 'data/campusbazaar.sqlite'));
  try { snapshot.exec('PRAGMA journal_mode=DELETE'); } finally { snapshot.close(); }
  for (const name of names) {
    const target = join(directory, 'data/uploads', name);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    copyFileSync(join(uploads, name), target);
  }
  const summary = databaseSummary(join(directory, 'data/campusbazaar.sqlite'));
  for (const name of summary.images) if (!names.includes(name)) throw new Error('A database image is missing from uploads; incomplete bundle retained for diagnosis');
  const files = filesIn(join(directory, 'data')).map(name => ({
    path: `data/${name}`, bytes: lstatSync(join(directory, 'data', name)).size, sha256: digest(join(directory, 'data', name))
  }));
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ format: 1, createdAt: new Date().toISOString(),
    schema: summary.schema, counts: summary.counts, files }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  verifyData(directory);
  return { directory, schema: summary.schema, counts: summary.counts, files: files.length };
}

export function verifyData(directory) {
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error('Bundle must be a regular directory');
  const actual = filesIn(directory);
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Invalid migration manifest');
  const expected = new Set(['manifest.json']);
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || !/^data\/(campusbazaar\.sqlite|uploads\/.+)$/.test(entry.path) ||
      entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.' || part === '..') ||
      expected.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Unsafe or duplicate manifest path');
    expected.add(entry.path);
    if (!actual.includes(entry.path)) throw new Error('A migration file is missing');
    const file = join(directory, entry.path);
    if (lstatSync(file).size !== entry.bytes || digest(file) !== entry.sha256) throw new Error('Migration checksum mismatch');
  }
  if (actual.length !== expected.size || actual.some(name => !expected.has(name))) throw new Error('Unlisted files in migration bundle');
  const summary = databaseSummary(join(directory, 'data/campusbazaar.sqlite'));
  if (summary.schema !== manifest.schema || JSON.stringify(summary.counts) !== JSON.stringify(manifest.counts)) throw new Error('Database inventory mismatch');
  for (const name of summary.images) if (!expected.has(`data/uploads/${name}`)) throw new Error('A database image is missing');
  return { schema: summary.schema, counts: summary.counts, files: manifest.files.length };
}

export function restoreData({ bundle, destination }) {
  const summary = verifyData(bundle);
  const directory = newDirectory(destination, [bundle]);
  for (const name of filesIn(join(bundle, 'data'))) {
    const target = join(directory, name);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    copyFileSync(join(bundle, 'data', name), target);
  }
  mkdirSync(join(directory, 'uploads'), { recursive: true, mode: 0o700 });
  return { directory, ...summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const [action, ...args] = process.argv.slice(2), options = {};
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--confirm-api-stopped') options.apiStopped = true;
      else if (['--database', '--uploads', '--output', '--bundle', '--destination'].includes(args[index]) && args[index + 1]) {
        options[args[index].slice(2)] = args[++index];
      } else throw new Error('Unknown or incomplete argument');
    }
    let result;
    if (action === 'snapshot' && options.database && options.uploads && options.output) result = await snapshotData(options);
    else if (action === 'verify' && options.bundle) result = verifyData(options.bundle);
    else if (action === 'restore' && options.bundle && options.destination) result = restoreData(options);
    else throw new Error('Use snapshot --database FILE --uploads DIR --output NEW_DIR --confirm-api-stopped; verify --bundle DIR; restore --bundle DIR --destination NEW_DIR');
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
