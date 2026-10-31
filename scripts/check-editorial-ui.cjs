// Guard the UI-only migration against changes to original files and behaviour.
// This is a source contract check; it does not replace a device interaction test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = path.resolve(__dirname, '../entry/src/main/ets');
const editorial = path.join(base, 'ui/editorial');
const manifest = JSON.parse(fs.readFileSync(path.join(editorial, 'original-files.sha256.json'), 'utf8'));

function quotedEnd(source, start) {
  const quote = source[start];
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') { i++; continue; }
    if (source[i] === quote) return i;
  }
  throw new Error('Unterminated literal');
}
function groupEnd(source, start) {
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const stack = [pairs[source[start]]];
  for (let i = start + 1; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'" || c === '`') { i = quotedEnd(source, i); continue; }
    if (source.slice(i, i + 2) === '//') { i = source.indexOf('\n', i); if (i < 0) break; continue; }
    if (source.slice(i, i + 2) === '/*') { i = source.indexOf('*/', i + 2) + 1; continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (!stack.length) return i;
    }
  }
  throw new Error('Unbalanced source group at ' + start);
}
function withoutFontRegistration(source) {
  const prefix = 'this.getUIContext().getFont().registerFont(';
  const start = source.indexOf(prefix);
  if (start < 0) return source;
  const end = groupEnd(source, start + prefix.length - 1);
  return source.slice(0, start) + source.slice(end + 2);
}
function canonical(source) {
  return withoutFontRegistration(source)
    .replace(/'pages\/Index'/g, 'UI_INDEX_PAGE')
    .replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
}
function calls(source, pattern) {
  const results = [];
  for (const match of source.matchAll(pattern)) {
    const open = match.index + match[0].lastIndexOf('(');
    results.push(match[1] + ':' + canonical(source.slice(open + 1, groupEnd(source, open))));
  }
  return results.sort();
}
function methods(source) {
  const found = new Map();
  const pattern = /^  (?:(?:private|async) )*(\w+)\([^\n]*\)(?::[^\n{]+)?\s*\{/gm;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    const previousLine = source.slice(0, match.index).trimEnd().split('\n').at(-1);
    if (name === 'build' || previousLine.trim() === '@Builder') continue;
    const open = match.index + match[0].lastIndexOf('{');
    found.set(name, canonical(source.slice(open + 1, groupEnd(source, open))));
  }
  return found;
}

let checked = 0;
for (const [name, hash] of Object.entries(manifest)) {
  const original = fs.readFileSync(path.join(base, name));
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'), hash, 'Original file changed: ' + name);
  if (!/^(pages|views|components)\//.test(name)) continue;
  const old = original.toString();
  const current = fs.readFileSync(path.join(editorial, name), 'utf8');
  for (const [method, body] of methods(old)) {
    assert.equal(methods(current).get(method), body, name + ': method ' + method);
  }
  const contracts = [
    // Callbacks, lifecycle bindings, validation and control availability.
    /\.(on[A-Z]\w*|enabled|maxLength|type|select|value|enterKeyType|visibility)\s*\(/g,
    // Preserve rendered content and input bindings, including dynamic labels.
    /\b(Text|TextInput|TextArea|Button)\s*\(/g,
    // Preserve branch guards for ownership, transaction states and loading/errors.
    /\b(if)\s*\(/g
  ];
  for (const pattern of contracts) {
    assert.deepEqual(calls(current, pattern), calls(old, pattern), name + ': ' + pattern);
  }
  for (const match of current.matchAll(/from ['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    assert.ok(fs.existsSync(path.resolve(path.dirname(path.join(editorial, name)), match[1] + '.ets')),
      name + ': unresolved import ' + match[1]);
    if (/\/(viewmodel|service|model)\//.test(match[1])) {
      assert.ok(match[1].startsWith('../../../'), name + ': must reuse original business layer');
    }
  }
  checked++;
}
const routes = JSON.parse(fs.readFileSync(path.join(base, '../resources/base/profile/main_pages.json'), 'utf8')).src;
for (const page of ['Index', 'Main', 'LegalDocument']) {
  for (const prefix of ['pages/', 'ui/editorial/pages/']) assert.ok(routes.includes(prefix + page));
}
const home = fs.readFileSync(path.join(editorial, 'views/HomeView.ets'), 'utf8');
const feed = home.slice(home.indexOf('  productFeed()'), home.indexOf('  private filteredProducts'));
assert.equal((feed.match(/Divider\(/g) || []).length, 1, 'Home must have exactly one category/feed separator');
assert.ok(!feed.includes('border({'), 'Feed heading must not introduce another rule');
for (const page of ['Index', 'Main']) {
  assert.ok(fs.readFileSync(path.join(editorial, 'pages/' + page + '.ets'), 'utf8').includes("$rawfile('editorial/CampusEditorialSerif.otf')"));
}
assert.ok(fs.statSync(path.join(base, '../resources/rawfile/editorial/CampusEditorialSerif.otf')).size > 0);
console.log(`PASS: ${Object.keys(manifest).length} original files intact; ${checked} UI counterparts preserve methods, handlers, labels, input constraints and guards; routes and single separator verified.`);
