// Every registered tool's input schema is what the Operator sends to the model (operator/loop.ts) and what the catalog
// publishes. Providers validate `pattern` as a portable ECMA-262 regex without flags: Azure OpenAI refused whole
// requests over `^[\p{L}\p{M}\p{N}_]{1,60}$` ("is not a 'regex'"), which blocked 21 of 48 bench tasks
// (research/2026-10-23/benches/README.md, bug 1). This walks every schema and rejects non-portable regex features.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Registry } from '../server/tools.ts';
import { modules } from '../server/modules/index.ts';
import { str, portablePattern } from '../shared/validate.ts';

/** Features a flagless, non-Unicode ECMA-262 engine (or a non-JS one) may not accept. */
const NON_PORTABLE: [RegExp, string][] = [
  [/\\[pP]\{/, 'Unicode property class \\p{…}'],
  [/\(\?<[=!]/, 'lookbehind'],
  [/\(\?<[A-Za-z]/, 'named group'],
  [/\\k</, 'named backreference'],
  [/\\u\{/, 'code point escape \\u{…}'],
  [/\(\?[imsx-]+[:)]/, 'inline flags'],
];

function patterns(v: unknown, path: string, out: { path: string; pattern: string }[] = []) {
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === 'pattern' && typeof x === 'string') out.push({ path, pattern: x });
    else patterns(x, `${path}.${k}`, out);
  }
  return out;
}

test('every tool schema pattern is a portable regex', () => {
  const r = new Registry();
  for (const m of modules) m.register(r);
  const bad: string[] = [];
  for (const t of r.list()) {
    for (const p of patterns(r.get(t.name)!.input.schema, t.name)) {
      for (const [re, why] of NON_PORTABLE) if (re.test(p.pattern)) bad.push(`${p.path}: ${why} in ${p.pattern}`);
      try { new RegExp(p.pattern); } catch { bad.push(`${p.path}: not valid without flags: ${p.pattern}`); }
    }
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('a non-portable pattern stays a server check and is described, not emitted', () => {
  assert.equal(portablePattern(/^[a-z]+$/), true);
  assert.equal(portablePattern(/^[\p{L}_]+$/u), false);
  const v = str({ pattern: /^[\p{L}\p{M}\p{N}_]{1,60}$/u, desc: 'a column key' });
  assert.equal((v.schema as any).pattern, undefined);
  assert.match(String((v.schema as any).description), /a column key/);
  assert.equal(v('नाम_1'), 'नाम_1');
  assert.throws(() => v('has space'), /wrong format/);
  assert.equal((str({ pattern: /^\d{6}$/ }).schema as any).pattern, '^\\d{6}$', 'portable patterns are still emitted');
});
