import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolsDir, '..');
const sourceDir = path.join(projectDir, 'frontend-source', 'android');
const runtimeDir = path.join(projectDir, 'android-app', 'app', 'src', 'main', 'assets', 'assets');

const coreStyles = [
  'app.css',
  'platform-android.css',
  'security-ui-643.css',
  'menu-popover-644.css',
  'plan-badge-menu-645.css',
  'android-session-flow-647.css',
  'android-ui-fixes-651.css',
  'shop-rewards.css',
  'android-ui-fixes-657.css',
  'audit-fixes-658.css',
  'sales-theme-660.css',
  'audit-stage2-6601.css'
];

const uiStyles = [
  'production-ui-670p1.css',
  'workflow-ui-670p2.css',
  'commercial-ui-6702026.css',
  'native-shell-hotfix-6712026.css',
  'performance-android7-16.css',
  'ui-hotfix-671.css',
  'settings-center-675.css',
  'latest-polish-675.css',
  'complete-ui-680.css',
  'professional-ui-682.css',
  'legal-scoped.css',
  'performance-final-850.css'
];

const scripts = [
  'android-session-flow-647.js',
  'auth.js',
  'platform-android.js',
  'performance-android7-16.js',
  'app.js',
  'security-ui-643.js',
  'plan-badge-menu-645.js',
  'shop-rewards.js',
  'audit-fixes-658.js',
  'sales-theme-660.js',
  'audit-stage2-6601.js',
  'production-ui-670p1.js',
  'workflow-ui-670p2.js',
  'commercial-ui-6702026.js',
  'native-shell-hotfix-6712026.js',
  'ui-hotfix-671.js',
  'settings-center-675.js',
  'complete-ui-680.js'
];

function readSource(subdirectory, filename) {
  const sourcePath = path.join(sourceDir, subdirectory, filename);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing Android bundle source: ${sourcePath}`);
  }
  return fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
}

function combine(subdirectory, filenames, sectionLabel) {
  return `${filenames.map((filename) => {
    const marker = `/* ===== ${sectionLabel}: ${filename} ===== */`;
    return `${marker}\n\n${readSource(subdirectory, filename)}`;
  }).join('\n\n')}\n`;
}

function writeBundle(subdirectory, outputName, filenames, sectionLabel) {
  const outputDirectory = path.join(runtimeDir, subdirectory);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const contents = combine(subdirectory, filenames, sectionLabel);
  const outputPath = path.join(outputDirectory, outputName);
  fs.writeFileSync(outputPath, contents, 'utf8');
  console.log(`${path.relative(projectDir, outputPath)}: ${filenames.length} ordered sources, ${Buffer.byteLength(contents)} bytes`);
}

writeBundle('styles', 'vyapar-core.css', coreStyles, 'STYLE SOURCE');
writeBundle('styles', 'vyapar-ui.css', uiStyles, 'STYLE SOURCE');
writeBundle('scripts', 'vyapar-app.js', scripts, 'SCRIPT SOURCE');
