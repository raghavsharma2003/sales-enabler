// "VP" is the internal working name; the product and company are Vyakti. No string a person or the Operator's model can
// read may say VP. This scans every string and template literal in server/** with the TypeScript parser, so comments
// are skipped by construction. Allowed: VP_ environment names (no word boundary before "_"), the 'vp_success' actor
// id (lower case), and server/modules/money/** (its owners fix their own strings).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const server = fileURLToPath(new URL('../server/', import.meta.url));
const SKIP = [join(server, 'modules', 'money')];

function files(dir: string): string[] {
  if (SKIP.some(s => dir.startsWith(s))) return [];
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

/** Every string literal and template-literal piece in a file that mentions VP, with its line. */
export function vpStrings(path: string): string[] {
  const src = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (n: ts.Node) => {
    let text: string | undefined;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text;
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text;
    if (text !== undefined && /\bVP\b/.test(text)) {
      const line = src.getLineAndCharacterOfPosition(n.getStart()).line + 1;
      hits.push(`${relative(server, path)}:${line}: ${JSON.stringify(text.length > 90 ? text.slice(0, 90) + '…' : text)}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  return hits;
}

test('no server string says VP (the product is Vyakti)', () => {
  const hits = files(server).flatMap(vpStrings);
  assert.deepEqual(hits, [], `${hits.length} string(s) still say VP:\n${hits.join('\n')}`);
});

test('the scan sees strings, not comments or env names', () => {
  const p = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'node_modules', '.brand-probe.ts');
  const { writeFileSync, rmSync } = require('node:fs') as typeof import('node:fs');
  writeFileSync(p, "// VP comment\nconst a = process.env.VP_LLM_KEY; const b = 'vp_success'; const c = `Ask VP ${a}`; const d = 'VP said';\n");
  try { assert.deepEqual(vpStrings(p).map(h => h.replace(/^.*?:(\d+): /, '$1: ')), ['2: "Ask VP "', '2: "VP said"']); }
  finally { rmSync(p); }
});
