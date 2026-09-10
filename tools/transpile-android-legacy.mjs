import fs from 'node:fs';
import ts from 'typescript';

const target = 'android-app/app/src/main/assets/assets/scripts/vyapar-app.js';
const source = fs.readFileSync(target, 'utf8');
const result = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2017,
    module: ts.ModuleKind.None,
    removeComments: false,
    newLine: ts.NewLineKind.LineFeed
  },
  fileName: 'vyapar-app.js',
  reportDiagnostics: true
});

const errors = (result.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
if (errors.length) {
  throw new Error(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('\n'));
}

fs.writeFileSync(target, result.outputText.replace(/\r\n/g, '\n'), 'utf8');
console.log(`Android 8-compatible JavaScript generated: ${target}`);
