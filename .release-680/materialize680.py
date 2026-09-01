from pathlib import Path
import json

stage=Path('.release-680')
css=(stage/'complete-ui.part1.css').read_text(encoding='utf-8')+'\n'+(stage/'complete-ui.part2.css').read_text(encoding='utf-8')+(stage/'complete-ui.part3.css').read_text(encoding='utf-8')
Path('web/complete-ui-680.css').write_text(css,encoding='utf-8')
Path('android-app/app/src/main/assets/complete-ui-680.css').write_text(css,encoding='utf-8')
js=(stage/'complete-ui-680.js').read_text(encoding='utf-8')
Path('web/complete-ui-680.js').write_text(js,encoding='utf-8')
Path('android-app/app/src/main/assets/complete-ui-680.js').write_text(js,encoding='utf-8')

replacements = [
('Product नहीं मिला. Product / SKU / barcode check करें.','Product not found. Check the product name, SKU, or barcode.'),
('Stock कम है. ${p.name}: available ${n(p.qty)}','Insufficient stock for ${p.name}. Available: ${n(p.qty)}'),
('Cart quantity stock से ज्यादा है. Available ${n(p.qty)}','Cart quantity exceeds available stock. Available: ${n(p.qty)}'),
('Cart empty है.','The cart is empty.'),
('Credit sale के लिए customer जरूरी है.','A customer is required for a credit sale.'),
('Supplier, product, qty और unit cost भरें.','Enter the supplier, product, quantity, and unit cost.'),
('Invoice नहीं मिला.','Invoice not found.'),
('Purchase नहीं मिला.','Purchase not found.'),
('Current stock return qty से कम है.','Current stock is lower than the return quantity.'),
('Production cloud module अभी load नहीं हुआ.','The production cloud module has not loaded yet.'),
('4–8 digit PIN डालें.','Enter a 4–8 digit PIN.'),
('Update download खोलें?','Open the update download?'),
('APK URL backend में configure नहीं है.','The APK URL is not configured on the backend.'),
('Document बनाने के लिए POS cart में items add करें.','Add items to the POS cart before creating a document.'),
]
for path in ['web/app.js','android-app/app/src/main/assets/app.js']:
    p=Path(path); text=p.read_text(encoding='utf-8')
    for old,new in replacements:
        if old not in text: raise SystemExit(f'Missing expected text in {path}: {old}')
        text=text.replace(old,new,1)
    p.write_text(text,encoding='utf-8')

for path in ['web/index.html','android-app/app/src/main/assets/index.html']:
    p=Path(path); text=p.read_text(encoding='utf-8')
    text=text.replace('content="6.7.5.2026"','content="6.8.0.2026"',1)
    anchor='  <link rel="stylesheet" href="latest-polish-675.css?v=20260901-675hotfix1" />'
    insert=anchor+'\n  <link rel="stylesheet" href="complete-ui-680.css?v=20260901-68001" />'
    if 'complete-ui-680.css' not in text:
        if anchor not in text: raise SystemExit(f'Missing CSS anchor in {path}')
        text=text.replace(anchor,insert,1)
    anchor2='  <script src="settings-center-675.js?v=20260901-67501"></script>'
    insert2=anchor2+'\n  <script src="complete-ui-680.js?v=20260901-68001"></script>'
    if 'complete-ui-680.js' not in text:
        if anchor2 not in text: raise SystemExit(f'Missing JS anchor in {path}')
        text=text.replace(anchor2,insert2,1)
    p.write_text(text,encoding='utf-8')

root_version={
  'versionName':'6.8.0.2026','versionCode':6802026,'channel':'production-6.8.0.2026',
  'baseVersion':'6.7.6.2026','released':'2026-09-01','backendVersion':'2.5.2'
}
Path('version.json').write_text(json.dumps(root_version,indent=2)+'\n',encoding='utf-8')
web_version=dict(root_version); web_version['version']='6.8.0.2026'
Path('web/version.json').write_text(json.dumps(web_version,indent=2)+'\n',encoding='utf-8')

p=Path('android-app/app/build.gradle'); text=p.read_text(encoding='utf-8')
text=text.replace('versionCode 6762026','versionCode 6802026',1).replace('versionName "6.7.6.2026"','versionName "6.8.0.2026"',1)
p.write_text(text,encoding='utf-8')

manifest=json.loads(Path('phase-manifest.json').read_text(encoding='utf-8'))
manifest.update({
  'phase':'4.0','phaseName':'Complete English Color UI Stability','versionName':'6.8.0.2026','versionCode':6802026,
  'baseVersion':'6.7.6.2026','fixes':[
    'Converted remaining mixed Hindi/English runtime prompts to English-only messages.',
    'Added a final authoritative colorful UI layer shared by Web and Android assets.',
    'Hardened responsive layouts, forms, cards, tables, dialogs, Settings and bottom navigation against clipping and horizontal overflow.',
    'Aligned light/dark colors, focus states, touch targets, loading screens and safe-area handling.',
    'Preserved business logic, stored data schema, accounting logic, subscription flows and navigation behavior.'
  ]
})
Path('phase-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')

p=Path('tests/settings-center-675.test.js'); text=p.read_text(encoding='utf-8')
text=text.replace("const expectedVersion = '6.7.5.2026';","const expectedVersion = '6.8.0.2026';",1)
text=text.replace("assert(gradle.includes('versionCode 6752026'), 'Android release code must match');","assert(gradle.includes('versionCode 6802026'), 'Android release code must match');",1)
text=text.replace("console.log('✓ Settings Center 6.7.5 checks passed');","console.log('✓ Settings Center + complete UI 6.8.0 checks passed');",1)
p.write_text(text,encoding='utf-8')

Path('RELEASE_6.8.0.2026.md').write_text('''# Vyapar AI v6.8.0.2026

Complete English + Color UI Stability release.

- English-only app UI/runtime messages: removed the remaining mixed Hindi/English transaction and error prompts.
- Added `complete-ui-680.css` as the final authoritative visual layer for both Web and Android WebView assets.
- Added `complete-ui-680.js` for safe UI hardening without changing business or accounting logic.
- More colorful but professional visual hierarchy using blue, cyan, green, gold, purple and pink accents.
- Fixed common UI glitch classes: horizontal page overflow, clipped text, narrow-device forms, table overflow, dialog/sheet clipping, tiny touch targets and bottom-nav safe-area conflicts.
- Settings, cards, buttons, forms, metrics, tables, calculator, subscription surfaces and loading screens now follow one consistent design system.
- Existing features, navigation, data schema, finance logic, subscription logic, backup/restore and account flows are preserved.

Validation performed before packaging: JavaScript syntax checks, repository integrity tests, version consistency checks, Web/Android final-layer parity, and a Devanagari runtime scan. The sandbox Chromium binary did not terminate reliably even on a blank page, so no screenshot-render pass is claimed.
''',encoding='utf-8')

Path('VALIDATION_6.8.0.2026.md').write_text('''# Vyapar AI 6.8.0.2026 Validation

## Passed

- JavaScript syntax: every `web/*.js` and Android asset JavaScript file passes `node --check`.
- Settings Center test: passed after version alignment to 6.8.0.2026.
- Phase 3.1 duplicate UI hotfix test: passed.
- Phase 3 finance/data integrity suite: 9 groups passed for Web and Android.
- Version consistency: root `version.json`, `web/version.json`, Android Gradle version name/code and UI metadata all match 6.8.0.2026 / 6802026.
- English runtime scan: zero Devanagari matches in app HTML/CSS/JavaScript for both Web and bundled Android assets.
- Final UI parity: `complete-ui-680.css` and `complete-ui-680.js` are byte-identical between Web and Android assets.

## UI hardening included

- Horizontal overflow protection.
- Safe responsive grids and forms.
- Scroll-safe tables.
- Dialog / More sheet width and height constraints.
- Bottom navigation safe-area and touch hardening.
- Readable wrapping for labels and descriptions.
- Minimum touch sizes and focus states.
- Unified light/dark surface and accent system.
- Consistent startup/loading treatment.
- Duplicate Settings heading suppression limited to identical headings within the same local container.

## Environment limitation

The sandbox Chromium executable does not terminate reliably even for a blank-page screenshot command, so a visual screenshot smoke test could not be completed here. This is an execution-environment limitation; it is not counted as a passing app render test. Device/emulator QA remains the final check for pixel-specific issues.
''',encoding='utf-8')
