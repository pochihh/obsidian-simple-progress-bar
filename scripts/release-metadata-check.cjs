const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const manifest = readJson('manifest.json');
const packageJson = readJson('package.json');
const versions = readJson('versions.json');

const requiredManifestFields = [
  'id',
  'name',
  'version',
  'minAppVersion',
  'description',
  'author',
  'authorUrl',
  'isDesktopOnly',
];

for (const field of requiredManifestFields) {
  if (manifest[field] === undefined || manifest[field] === '') {
    fail(`manifest.json missing required release metadata field: ${field}`);
  }
}

if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  fail(`manifest.json version must be semver x.y.z, got: ${manifest.version}`);
}

if (packageJson.version !== manifest.version) {
  fail(`package.json version (${packageJson.version}) must match manifest.json version (${manifest.version})`);
}

if (versions[manifest.version] !== manifest.minAppVersion) {
  fail(`versions.json must map ${manifest.version} to ${manifest.minAppVersion}`);
}

if (manifest.isDesktopOnly !== false) {
  fail('manifest.json must set isDesktopOnly to false for mobile release support');
}

if (packageJson.scripts?.version && !fs.existsSync(path.join(root, 'version-bump.mjs'))) {
  fail('package.json version script references version-bump.mjs, but version-bump.mjs is missing');
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`Release metadata checks passed for ${manifest.id} ${manifest.version}`);
