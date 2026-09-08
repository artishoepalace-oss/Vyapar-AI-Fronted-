/* Validate delivered files, not obsolete standalone aliases. No dependencies. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bases = ['web', 'android-app/app/src/main/assets'];
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
for (const base of bases) {
  let references = 0;
  for (const file of walk(path.join(root, base))) {
    if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file]);
    if (!/\.(html|css)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const patterns = file.endsWith('.html')
      ? [/\b(?:src|href)=["']([^"']+)["']/g]
      : [/url\(\s*["']?([^"')\s]+)["']?\s*\)/g];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const ref = match[1];
        if (/^(?:[a-z]+:|\/\/|#|\$\{)/i.test(ref)) continue;
        const relative = ref.split(/[?#]/)[0];
        if (!relative) continue;
        const target = path.resolve(path.dirname(file), relative);
        if (!fs.existsSync(target)) throw new Error(`Missing reference in ${path.relative(root, file)}: ${ref}`);
        references++;
      }
    }
  }
  console.log(`${base}: JavaScript parses; ${references} local HTML/CSS references exist.`);
}
for (const name of ['styles/vyapar-core.css', 'styles/vyapar-ui.css', 'scripts/vyapar-app.js']) {
  const [a, b] = bases.map(base => fs.readFileSync(path.join(root, base, 'assets', name)));
  if (!a.equals(b)) throw new Error(`Web/Android mismatch: ${name}`);
}
console.log('Web and Android bundle bytes match.');
