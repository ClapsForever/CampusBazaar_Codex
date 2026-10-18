import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), at = args.indexOf('--output');
if (at < 0 || !args[at + 1]) throw new Error('Use --output NEW_DIRECTORY');
const output = resolve(args[at + 1]);
if (existsSync(output)) throw new Error('Destination already exists; nothing will be overwritten');
if (!existsSync(dirname(output))) throw new Error('Output parent must already exist');
const files = [];
function collect(relativeName) {
  const file = join(repo, relativeName), info = lstatSync(file);
  if (info.isSymbolicLink()) throw new Error('Source bundle cannot include symbolic links');
  if (info.isDirectory()) {
    for (const name of readdirSync(file).sort()) {
      if (['node_modules', 'dist', 'build', '.local-data', 'results'].includes(name) ||
        (name.startsWith('.env') && name !== '.env.example') || /\.(pem|key|p12|pfx)$/i.test(name)) continue;
      collect(`${relativeName}/${name}`);
    }
  } else if (info.isFile()) files.push(relativeName);
}
for (const service of ['api', 'agent']) {
  for (const name of ['src', 'test', 'tests', 'evals', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts', 'README.md', '.env.example']) {
    const nameInRepo = `backend/${service}/${name}`;
    if (existsSync(join(repo, nameInRepo))) collect(nameInRepo);
  }
}
// Explicit deployment-file allowlist; generated configuration and migration data are never collected.
for (const name of ['README.md', 'init-env.mjs', 'backup.sh', 'campusbazaar-api.service', 'campusbazaar-agent.service', 'campusbazaar.nginx.conf']) collect(`deploy/ubuntu/${name}`);
for (const name of ['README.md', 'data-bundle.mjs', 'prepare-config.mjs', 'prepare-release.mjs', 'smoke.mjs', 'migration.test.mjs']) collect(`deploy/aliyun/${name}`);
collect('docs/registration.md');
collect('docs/legal');
mkdirSync(output, { mode: 0o700 });
const staging = join(output, 'source');
mkdirSync(staging, { mode: 0o700 });
for (const name of files) {
  const target = join(staging, name);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  // Windows source checkouts must not put CRLF shell scripts on the Linux host.
  const data = readFileSync(join(repo, name));
  const normalize = ['.md', '.mjs', '.cjs', '.ts', '.sh', '.service', '.conf', '.json', '.example'].includes(extname(name));
  writeFileSync(target, normalize ? data.toString('utf8').replace(/\r\n/g, '\n') : data, { mode: 0o600, flag: 'wx' });
}
const listing = join(output, 'source-files.txt'), archive = join(output, 'campusbazaar-source.tar.gz');
writeFileSync(listing, files.join('\n') + '\n', { flag: 'wx', mode: 0o600 });
const result = spawnSync('tar', ['-czf', archive, '-C', staging, '-T', listing], { encoding: 'utf8' });
if (result.status !== 0) throw new Error('tar packaging failed; incomplete output retained for diagnosis');
const sha256 = createHash('sha256').update(readFileSync(archive)).digest('hex');
const metadata = { format: 1, createdAt: new Date().toISOString(), files: files.length, archive: 'campusbazaar-source.tar.gz', sha256,
  minimumNode: '24.21.0', apiSchema: 4, legalVersion: '2026-10-18-draft-2', captcha: 'deferred', dataIncluded: false, secretsIncluded: false };
writeFileSync(join(output, 'release.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ directory: output, ...metadata }));
