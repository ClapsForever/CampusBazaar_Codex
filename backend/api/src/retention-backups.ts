import { lstatSync, readFileSync, readdirSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

function contained(root: string, target: string): boolean {
  const distance = relative(root, target);
  return distance !== '' && !isAbsolute(distance) && distance !== '..' && !distance.startsWith(`..${sep}`);
}

/** Only marked snapshot bundles in the explicitly configured directory are eligible. */
export function pruneManagedBackups(directory: string, config: { databasePath: string; uploadDir: string }, now: number) {
  const result = { deleted: 0, failures: 0 };
  const root = realpathSync(directory);
  const database = realpathSync(config.databasePath), uploads = realpathSync(config.uploadDir);
  if (root === uploads || root === database || contained(root, database) || contained(root, uploads) || contained(uploads, root)) {
    throw new Error('Backup retention directory overlaps live data');
  }
  for (const name of readdirSync(root)) {
    const bundle = resolve(root, name);
    try {
      if (!contained(root, bundle)) throw new Error('Unsafe backup path');
      const info = lstatSync(bundle);
      if (!info.isDirectory() || info.isSymbolicLink()) continue;
      const marker = join(bundle, 'manifest.json');
      let manifest: { format?: number; retention?: { kind?: string; expiresAt?: number; deleting?: boolean }; files?: { path: string }[] };
      try {
        const markerInfo = lstatSync(marker);
        if (!markerInfo.isFile() || markerInfo.isSymbolicLink()) throw new Error('Invalid backup marker');
        manifest = JSON.parse(readFileSync(marker, 'utf8'));
      } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
      if (manifest.format !== 1 || manifest.retention?.kind !== 'one-year-v1') continue;
      if (!Number.isSafeInteger(manifest.retention.expiresAt)) throw new Error('Invalid backup expiry');
      if (manifest.retention.expiresAt! > now) continue;
      if (!Array.isArray(manifest.files) || manifest.files.some(file => !/^data\/(campusbazaar\.sqlite|uploads\/img_[a-f0-9]{32}\.(jpg|png|webp))$/.test(file.path))) {
        throw new Error('Invalid managed backup inventory');
      }
      const expected = new Set(['manifest.json', ...manifest.files.map(file => file.path)]);
      const files: string[] = [], directories: string[] = [];
      function inspect(folder: string) {
        if (!contained(root, realpathSync(folder))) throw new Error('Backup escaped configured root');
        for (const child of readdirSync(folder)) {
          const file = join(folder, child), stat = lstatSync(file);
          if (stat.isSymbolicLink()) throw new Error('Backup contains a symbolic link');
          if (stat.isDirectory()) inspect(file);
          else if (stat.isFile() && expected.delete(relative(bundle, file).split(sep).join('/'))) files.push(file);
          else throw new Error('Unlisted backup content');
        }
        directories.push(folder);
      }
      inspect(bundle);
      if (expected.size && manifest.retention.deleting !== true) throw new Error('Incomplete backup inventory');
      manifest.retention.deleting = true;
      writeFileSync(marker, JSON.stringify(manifest) + '\n');
      // Delete verified files and then empty directories, never a computed recursive shell target.
      for (const file of files.filter(file => file !== marker)) unlinkSync(file);
      unlinkSync(marker);
      for (const folder of directories) rmdirSync(folder);
      result.deleted++;
    } catch { result.failures++; }
  }
  return result;
}
