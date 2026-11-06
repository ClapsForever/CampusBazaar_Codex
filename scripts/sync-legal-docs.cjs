// Use the same Markdown for offline ArkUI reading and the public agreement page.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'entry/src/main/resources/rawfile/legal');
const version = '2026-11-06';
const check = process.argv.includes('--check');
let stale = false;
function sync(file, content) {
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
      console.error(`Outdated legal document: ${file}`);
      stale = true;
    }
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }
}

function renderLegalPage(source, name) {
  let section = 0;
  return source.trim().split('\n').filter(line => line.trim() !== '').map(line => {
    const html = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
    if (html.startsWith('# ')) return `    <h2 id="privacyName">${html.slice(2)}</h2>`;
    if (html.startsWith('## ') || (name === 'privacy-policy' && /^\d+\. /.test(html))) {
      return `    <h5 id="section-${++section}">${html.replace(/^## /, '')}</h5>`;
    }
    if (/^(版本|更新日期|生效日期|适用产品)：/.test(html)) {
      return `    <p class="agreement-meta"><span class="font-secondary">${html}</span></p>`;
    }
    if (/^https:\/\/[^\s]+$/.test(html)) return `    <p><a href="${html}">${html}</a></p>`;
    return `    <p>${html}</p>`;
  }).join('\n');
}

for (const relative of ['entry/src/main/ets/common/LegalDocuments.ets', 'backend/api/src/registration.ts']) {
  const code = fs.readFileSync(path.join(root, relative), 'utf8');
  const versions = [...code.matchAll(/(?:LEGAL|AGREEMENT|PRIVACY)_VERSION\s*(?::\s*string)?\s*=\s*['"]([^'"]+)['"]/g)];
  if (versions.length === 0 || versions.some(match => match[1] !== version)) {
    throw new Error(`Legal version mismatch in ${relative}`);
  }
}
const webDir = path.join(root, 'docs/legal/web');
const web = fs.readFileSync(path.join(webDir, 'user-agreement.html'), 'utf8').replace(/\r\n/g, '\n');
const begin = '    <!-- BEGIN USER AGREEMENT -->\n';
const end = '    <!-- END USER AGREEMENT -->';
const start = web.indexOf(begin);
const stop = web.indexOf(end);
if (start === -1 || stop < start + begin.length) throw new Error('Missing legal section in HTML');
for (const name of ['user-agreement', 'privacy-policy', 'community-rules']) {
  const source = fs.readFileSync(path.join(root, `docs/legal/${name}.md`), 'utf8').replace(/\r\n/g, '\n');
  if (!source.includes(version)) throw new Error(`Missing legal version in ${name}`);
  const text = source.replace(/^#{1,6}\s+/gm, '').replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）').replace(/`/g, '').trim() + '\n';
  sync(path.join(target, `${name}.txt`), text);
  if (name !== 'community-rules') {
    let page = web.slice(0, start + begin.length) + renderLegalPage(source, name) + '\n' + web.slice(stop);
    if (name === 'privacy-policy') {
      page = page.replace('<title>同窗集用户协议</title>', '<title>同窗集隐私政策</title>')
        .replace(/<meta name="description" content="[^"]*" \/>/, '<meta name="description" content="同窗集隐私政策与个人信息权益申请方式。" />');
    }
    sync(path.join(webDir, `${name}.html`), page);
  }
}
if (stale) process.exitCode = 1;
else console.log(check ? 'App and web legal documents match Markdown sources.' : 'App and web legal documents synchronized.');
