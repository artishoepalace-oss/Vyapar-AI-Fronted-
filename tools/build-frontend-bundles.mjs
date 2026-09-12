import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(toolsDir, '..');
const sourceDir = path.join(projectDir, 'frontend-source', 'android');
const runtimeDirs = [
  path.join(projectDir, 'android-app', 'app', 'src', 'main', 'assets', 'assets'),
  path.join(projectDir, 'web', 'assets')
];
const checkOnly = process.argv.includes('--check');

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
  'performance-final-850.css',
  'visual-fixes-851.css',
  'telegram-shell-851.css',
  'inspected-glitchfix-855.css',
  'settings-overlap-858.css',
  'flat-black-ios-861.css',
  'dark-mode-pro-862.css',
  'ui-stability-862.css',
  'graphite-maroon-863.css',
  'premium-tier-864.css',
  'monochrome-black-865.css',
  'logo-fit-866.css',
  'auth-chat-867.css',
  'auth-layout-fix-867.css',
  'surface-cleanup-867.css',
  'popup-nav-clearance-867.css',
  'video-final-867.css',
  'surface-hierarchy-20102004.css',
  'motion-20102004.css',
  'workspace-v7.css',
  'alignment-updates.css'
];

const scripts = [
  'data-store.js',
  'file-io.js',
  'profit-history.js',
  'insights-workspace.js',
  'upload-workspace.js',
  'record-pages.js',
  'android-session-flow-647.js',
  'motion-20102004.js',
  'auth.js',
  'platform-android.js',
  'performance-android7-16.js',
  'business-tool-search.js',
  'invoice-pdf.js',
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
  'complete-ui-680.js',
  'inspected-glitchfix-855.js',
  'flat-black-ios-861.js',
  'ui-stability-862.js',
  'graphite-maroon-863.js',
  'premium-tier-864.js',
  'video-final-867.js',
  'workspace-startup.js',
  'github-updates.js'
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
  const contents = combine(subdirectory, filenames, sectionLabel);
  for (const runtimeDir of runtimeDirs) {
    const outputDirectory = path.join(runtimeDir, subdirectory);
    const outputPath = path.join(outputDirectory, outputName);
    if (checkOnly) {
      if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== contents) {
        throw new Error(`Stale bundle: ${path.relative(projectDir, outputPath)}. Run npm run build.`);
      }
    } else {
      fs.mkdirSync(outputDirectory, { recursive: true });
      fs.writeFileSync(outputPath, contents, 'utf8');
    }
    console.log(`${checkOnly ? 'Verified' : 'Built'} ${path.relative(projectDir, outputPath)}: ${filenames.length} sources`);
  }
}

writeBundle('styles', 'vyapar-core.css', coreStyles, 'STYLE SOURCE');
writeBundle('styles', 'vyapar-ui.css', uiStyles, 'STYLE SOURCE');
writeBundle('scripts', 'vyapar-app.js', scripts, 'SCRIPT SOURCE');

// PDF engine is shipped locally but loaded only when an invoice is exported.
for (const name of ['pdf-lib.min.js', 'pdf-lib-LICENSE.md']) {
  const source = fs.readFileSync(path.join(projectDir, 'frontend-source/vendor', name));
  for (const runtime of runtimeDirs) {
    const target = path.join(runtime, 'vendor', name);
    if (checkOnly) {
      if (!fs.existsSync(target) || !source.equals(fs.readFileSync(target))) throw new Error(`Stale PDF dependency: ${target}`);
    } else {
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, source);
    }
  }
}
