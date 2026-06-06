const { buildSync } = require('esbuild');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outdir = path.join(root, '.test-dist');
fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

const entryPoints = fs.readdirSync(path.join(root, 'tests'))
  .filter((file) => file.endsWith('.test.ts'))
  .map((file) => path.join(root, 'tests', file));

buildSync({
  entryPoints,
  outdir,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  sourcemap: 'inline',
  logLevel: 'silent'
});

const testFiles = fs.readdirSync(outdir)
  .filter((file) => file.endsWith('.js'))
  .map((file) => path.join(outdir, file));

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit'
});

process.exit(result.status ?? 1);
