// Markdown is the source of truth; package the same text for offline ArkUI reading.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'entry/src/main/resources/rawfile/legal');
const version = '2026-10-18-draft-3';
const check = process.argv.includes('--check');
let stale = false;
for (const relative of ['entry/src/main/ets/common/LegalDocuments.ets', 'backend/api/src/registration.ts']) {
  const code = fs.readFileSync(path.join(root, relative), 'utf8');
  const versions = [...code.matchAll(/(?:LEGAL|AGREEMENT|PRIVACY)_VERSION\s*(?::\s*string)?\s*=\s*['"]([^'"]+)['"]/g)];
  if (versions.length === 0 || versions.some(match => match[1] !== version)) {
    throw new Error(`Legal version mismatch in ${relative}`);
  }
}
for (const name of ['user-agreement', 'privacy-policy', 'community-rules']) {
  const source = fs.readFileSync(path.join(root, `docs/legal/${name}.md`), 'utf8').replace(/\r\n/g, '\n');
  if (!source.includes(version)) throw new Error(`Missing legal version in ${name}`);
  const text = source.replace(/^#{1,6}\s+/gm, '').replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）').replace(/`/g, '').trim() + '\n';
  const file = path.join(target, `${name}.txt`);
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) {
      console.error(`Outdated app document: ${file}`); stale = true;
    }
  } else {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
  }
}
if (stale) process.exitCode = 1;
else console.log(check ? 'App legal documents match Markdown sources.' : 'App legal documents synchronized.');
