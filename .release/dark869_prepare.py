#!/usr/bin/env python3
from pathlib import Path
import json, re, shutil, sys

ROOT = Path.cwd()
VERSION = '8.6.9.2026'
CODE = 8692026

def clean_css(text: str) -> str:
    text = text.replace(':not(.theme-light)', '')
    def process(seg: str) -> str:
        out=[]; i=0; n=len(seg)
        while i<n:
            j=seg.find('{', i)
            if j<0:
                out.append(seg[i:]); break
            header=seg[i:j]
            depth=1; k=j+1; quote=None; esc=False
            while k<n and depth:
                ch=seg[k]
                if quote:
                    if esc: esc=False
                    elif ch=='\\': esc=True
                    elif ch==quote: quote=None
                else:
                    if ch in "'\"": quote=ch
                    elif ch=='{': depth+=1
                    elif ch=='}': depth-=1
                k+=1
            if depth:
                out.append(seg[i:]); break
            body=seg[j+1:k-1]
            if 'theme-light' in header:
                out.append(re.match(r'\s*', header).group(0))
            else:
                if header.lstrip().startswith('@'):
                    body=process(body)
                out.append(header+'{'+body+'}')
            i=k
        return ''.join(out)
    return process(text)

def clean_css_trees():
    for base in [ROOT/'frontend-source/android', ROOT/'web', ROOT/'android-app/app/src/main/assets']:
        if not base.exists(): continue
        for p in base.rglob('*.css'):
            txt=p.read_text(encoding='utf-8', errors='ignore')
            if 'theme-light' in txt or ':not(.theme-light)' in txt:
                p.write_text(clean_css(txt), encoding='utf-8')

def update_versions():
    p=ROOT/'version.json'; d=json.loads(p.read_text(encoding='utf-8'))
    d.update(versionName=VERSION, versionCode=CODE, channel=f'production-{VERSION}', released='2026-09-08')
    p.write_text(json.dumps(d, indent=2)+'\n', encoding='utf-8')
    p=ROOT/'web/version.json'; d=json.loads(p.read_text(encoding='utf-8'))
    d.update(versionName=VERSION, versionCode=CODE, channel=f'production-{VERSION}', released='2026-09-08', version=VERSION)
    p.write_text(json.dumps(d, indent=2)+'\n', encoding='utf-8')
    p=ROOT/'android-app/app/build.gradle'; s=p.read_text(encoding='utf-8')
    s=re.sub(r'versionCode\s+\d+', f'versionCode {CODE}', s)
    s=re.sub(r'versionName\s+["\'][^"\']+["\']', f'versionName "{VERSION}"', s)
    p.write_text(s, encoding='utf-8')

def remove_light_only_files():
    for rel in [
        'android-app/app/src/main/res/drawable-v26/ic_launcher_round.xml',
        'android-app/app/src/main/res/drawable/ic_launcher_round.xml',
        'android-app/app/src/main/res/drawable/ic_launcher_mark_864.xml',
        'android-app/app/src/main/res/drawable/ic_launcher_foreground_safe.xml',
        'frontend-source/android/styles/premium-light-864.css',
        'frontend-source/android/styles/profile-light-863.css',
    ]:
        p=ROOT/rel
        if p.exists(): p.unlink()

def sync_sources():
    special_web={
        'web/app.js','web/assets/scripts/app.js','web/assets/scripts/complete-ui-680.js','web/complete-ui-680.js','web/settings-center-675.js',
        'web/professional-ui-682.css','web/shop-rewards-web-653.css','web/web-fixes-653.css','web/web-more-sheet-fix.css','web/web-photo-fixes-655.css','web/web-polish-650.css','web/website-646.css',
        'web/assets/styles/dark-mode-pro-862.css','web/assets/styles/shop-rewards-web-653.css','web/assets/styles/web-fixes-653.css','web/assets/styles/web-more-sheet-fix.css','web/assets/styles/web-photo-fixes-655.css','web/assets/styles/web-polish-650.css','web/assets/styles/website-646.css',
    }
    for kind in ['styles','scripts']:
        srcdir=ROOT/'frontend-source/android'/kind
        for src in srcdir.glob('*'):
            if not src.is_file(): continue
            name=src.name
            for dest in [ROOT/'frontend-source/android/legacy-root-mirrors'/kind/name, ROOT/'android-app/app/src/main/assets'/name]:
                if dest.exists(): shutil.copy2(src,dest)
            for dest in [ROOT/'web'/name, ROOT/'web/assets'/kind/name]:
                if dest.exists() and str(dest.relative_to(ROOT)) not in special_web:
                    shutil.copy2(src,dest)

def update_tests():
    p=ROOT/'tests/professional-ui-682.test.js'
    if p.exists():
        s=p.read_text(encoding='utf-8')
        s=s.replace('vyapar-ui.css?v=20260906-flatblack861','vyapar-ui.css?v=20260907-dark869')
        s=re.sub(r"^assert\(finalCss\.includes\('html\.vy861-flat-black\.theme-light'\).*\n",'',s,flags=re.M)
        s=s.replace('8.6.1 flat-black presentation','8.6.9 dark-only presentation')
        p.write_text(s,encoding='utf-8')
    p=ROOT/'tests/settings-center-675.test.js'
    if p.exists():
        s=p.read_text(encoding='utf-8')
        s=s.replace("const expectedVersion = '8.6.1.2026';", f"const expectedVersion = '{VERSION}';")
        s=s.replace('vyapar-app.js?v=20260906-flatblack861','vyapar-app.js?v=20260907-dark869')
        s=s.replace('vyapar-ui.css?v=20260906-flatblack861','vyapar-ui.css?v=20260907-dark869')
        s=re.sub(r"^\s*assert\([^\n]*theme-light[^\n]*\);\n",'',s,flags=re.M)
        s=s.replace('versionCode 8612026',f'versionCode {CODE}')
        s=s.replace('RELEASE_8.6.1.2026.md',f'RELEASE_{VERSION}.md').replace('v8.6.1 release file',f'v{VERSION} release file')
        s=s.replace('VALIDATION_8.6.1.2026.md',f'VALIDATION_{VERSION}.md')
        p.write_text(s,encoding='utf-8')

def copy_bundles_to_web():
    pairs=[
      ('android-app/app/src/main/assets/assets/styles/vyapar-core.css','web/assets/styles/vyapar-core.css'),
      ('android-app/app/src/main/assets/assets/styles/vyapar-ui.css','web/assets/styles/vyapar-ui.css'),
      ('android-app/app/src/main/assets/assets/scripts/vyapar-app.js','web/assets/scripts/vyapar-app.js'),
    ]
    for a,b in pairs:
        shutil.copy2(ROOT/a, ROOT/b)

def validate_forbidden():
    terms=['theme-light','toggleTheme','prefers-color-scheme','MODE_NIGHT_NO','forceDarkAllowed','light mode','Light mode','THEME_LIGHT']
    bases=[ROOT/'web',ROOT/'frontend-source',ROOT/'android-app/app/src/main/assets',ROOT/'android-app/app/src/main/java',ROOT/'android-app/app/src/main/res',ROOT/'tests']
    exts={'.css','.js','.html','.java','.xml','.json','.gradle','.mjs'}
    failures=[]
    for term in terms:
        hits=[]
        for base in bases:
            if not base.exists(): continue
            for p in base.rglob('*'):
                if not p.is_file() or p.suffix.lower() not in exts: continue
                try: t=p.read_text(encoding='utf-8',errors='ignore')
                except Exception: continue
                if term in t: hits.append(str(p.relative_to(ROOT)))
        if hits: failures.append((term,hits))
    if failures:
        for term,hits in failures: print('FORBIDDEN',term,*hits[:20],sep='\n  ')
        raise SystemExit('dark-only validation failed')

mode=sys.argv[1] if len(sys.argv)>1 else 'pre'
if mode=='pre':
    update_versions(); remove_light_only_files(); clean_css_trees(); sync_sources(); clean_css_trees(); update_tests()
elif mode=='post':
    copy_bundles_to_web(); clean_css_trees(); update_tests(); validate_forbidden()
else:
    raise SystemExit('use pre or post')
