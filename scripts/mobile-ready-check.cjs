const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const manifest = JSON.parse(read('manifest.json'));
if (manifest.isDesktopOnly !== false) {
  fail('manifest.json must set "isDesktopOnly": false for mobile support.');
}

const sourceFiles = fs.readdirSync(root).filter((file) => file.endsWith('.ts'));
const forbidden = [
  [/from ['"]electron['"]|require\(['"]electron['"]\)/, 'Electron import'],
  [/from ['"]fs['"]|require\(['"]fs['"]\)/, 'fs import'],
  [/from ['"]path['"]|require\(['"]path['"]\)/, 'path import'],
  [/\bprocess\./, 'process global'],
  [/\bwindow\.(setTimeout|requestAnimationFrame|matchMedia)/, 'window global; use activeWindow'],
  [/\bdocument\./, 'document global; scope through Obsidian elements where possible'],
  [/(?<!\.)\bsetTimeout\(/, 'global setTimeout; use activeWindow.setTimeout'],
  [/(?<!\.)\brequestAnimationFrame\(/, 'global requestAnimationFrame; use activeWindow.requestAnimationFrame'],
];

for (const file of sourceFiles) {
  const text = read(file);
  for (const [pattern, label] of forbidden) {
    if (pattern.test(text)) {
      fail(`${file}: mobile compatibility risk: ${label}`);
    }
  }
}

const css = read('styles.css');
const cssRequirements = [
  [/@media\s*\([^)]*max-width:\s*480px/, 'mobile/narrow viewport media query'],
  [/@media\s*\([^)]*prefers-reduced-motion:\s*reduce/, 'reduced-motion media query'],
  [/\.simple-progress-bar-track[\s\S]*clamp\(/, 'responsive note progress track width'],
  [/\.sp-bar-embedded-container[\s\S]*max-width:\s*100%/, 'embedded bars constrained to mobile pane width'],
];

for (const [pattern, label] of cssRequirements) {
  if (!pattern.test(css)) {
    fail(`styles.css missing ${label}.`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Mobile readiness static checks passed');
