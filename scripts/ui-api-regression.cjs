// Run the existing API integration suite and UI-specific contract checks without deleting test data.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const ts = require(process.env.ARK_TYPESCRIPT || 'typescript');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-ui-api-'));
fs.writeFileSync(path.join(output, 'package.json'), '{"type":"module"}');
for (const folder of ['src', 'test']) {
  fs.mkdirSync(path.join(output, folder));
  const sourceDir = path.resolve(__dirname, `../backend/api/${folder}`);
  for (const file of fs.readdirSync(sourceDir).filter(file => file.endsWith('.ts'))) {
    let source = fs.readFileSync(path.join(sourceDir, file), 'utf8');
    if (folder === 'test') {
      source = source.replace('rmSync(directory, { recursive: true, force: true });', "console.log('Test data retained:', directory);");
    }
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    fs.writeFileSync(path.join(output, folder, file.replace(/\.ts$/, '.js')), code);
  }
}
fs.copyFileSync(path.join(__dirname, 'ui-api-contract.mjs'), path.join(output, 'test/ui-api-contract.mjs'));
const result = spawnSync(process.execPath, ['--test', path.join(output, 'test/integration.test.js'),
  path.join(output, 'test/ui-api-contract.mjs')], { stdio: 'inherit' });
console.log('Compiled test files retained:', output);
process.exitCode = result.status ?? 1;
