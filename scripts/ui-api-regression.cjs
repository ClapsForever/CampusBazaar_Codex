// Run the existing API integration suite and UI-specific contract checks without deleting test data.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const ts = require(process.env.ARK_TYPESCRIPT || require.resolve('typescript', { paths: [path.join(__dirname, '../backend/api')] }));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-ui-api-'));
fs.writeFileSync(path.join(output, 'package.json'), '{"type":"module"}');
for (const folder of ['src', 'test']) {
  const sourceDir = path.resolve(__dirname, `../backend/api/${folder}`);
  function compileDirectory(sourcePath, targetPath) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
      if (entry.isDirectory()) compileDirectory(path.join(sourcePath, entry.name), path.join(targetPath, entry.name));
      else if (entry.name.endsWith('.ts')) {
        const source = fs.readFileSync(path.join(sourcePath, entry.name), 'utf8');
        const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
        fs.writeFileSync(path.join(targetPath, entry.name.replace(/\.ts$/, '.js')), code);
      }
    }
  }
  compileDirectory(sourceDir, path.join(output, folder));
}
// Resolve the API's locked dependencies from the isolated compiled test tree.
fs.symlinkSync(path.resolve(__dirname, '../backend/api/node_modules'), path.join(output, 'node_modules'), 'junction');
fs.copyFileSync(path.join(__dirname, 'ui-api-contract.mjs'), path.join(output, 'test/ui-api-contract.mjs'));
const tests = fs.readdirSync(path.join(output, 'test'))
  .filter(file => file.endsWith('.test.js') || file === 'ui-api-contract.mjs')
  .map(file => path.join(output, 'test', file));
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
console.log('Compiled test files retained:', output);
process.exitCode = result.status ?? 1;
