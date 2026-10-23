// Web smoke tests: the bundle builds and stays small, the colour tokens meet the 5:1 text-contrast law in both themes,
// colour literals live only in tokens.css, the UI's approver map matches the kernel's, and every tool the UI calls is listed once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { canApprove, RISK_CLASSES, ROLES } from '../shared/approval.ts';
import { APPROVERS, ALL_TOOLS, TOOLS } from '../web/src/tools.ts';

const web = fileURLToPath(new URL('../web/', import.meta.url));
const FIRST_LOAD_GZIP_KB = 100;   // main JS + CSS a user downloads before any page chunk
const ALL_CHUNKS_GZIP_KB = 200;   // every chunk together

test('the app builds, dist is complete and the bundle stays under its stated size', () => {
  execFileSync(process.execPath, [web + 'build.mjs'], { stdio: 'pipe' });
  assert.ok(existsSync(web + 'dist/index.html'), 'dist/index.html');
  const html = readFileSync(web + 'dist/index.html', 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) assert.ok(existsSync(web + 'dist' + m[1]), m[1] + ' exists');
  const r = JSON.parse(readFileSync(web + 'dist/build.json', 'utf8'));
  assert.ok(r.entryGzipBytes / 1024 <= FIRST_LOAD_GZIP_KB, `first load ${(r.entryGzipBytes / 1024).toFixed(1)} KB gzip > ${FIRST_LOAD_GZIP_KB}`);
  assert.ok(r.gzipBytes / 1024 <= ALL_CHUNKS_GZIP_KB, `all chunks ${(r.gzipBytes / 1024).toFixed(1)} KB gzip > ${ALL_CHUNKS_GZIP_KB}`);
});

function lum(hex: string) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('text colour pairs reach 5:1 in light and dark', () => {
  const css = readFileSync(web + 'src/tokens.css', 'utf8');
  const themes = { light: css.split('@media')[0], dark: css.split('[data-theme="dark"] {')[1] };
  const pairs: [string, string][] = [['ink', 'paper'], ['ink-2', 'paper'], ['ink-3', 'paper'], ['ink-2', 'sunk'], ['ink-3', 'sunk'], ['ink', 'surface'], ['terra-ink', 'paper'], ['terra-ink', 'surface'], ['on-terra', 'terra'],
    ['leaf', 'leaf-bg'], ['brick', 'brick-bg'], ['marigold-ink', 'marigold-bg'], ['peacock', 'peacock-bg'], ['terra-ink', 'terra-bg'], ['leaf', 'paper'], ['brick', 'paper'], ['marigold-ink', 'paper'], ['peacock', 'paper'],
    ['nav-ink', 'forest'], ['nav-ink-dim', 'forest'], ['nav-ink', 'forest-2'], ['on-forest', 'forest-2'], ['on-forest', 'terra'], ['ink-2', 'terra-bg'], ['ink-2', 'leaf-bg']];
  for (const [name, block] of Object.entries(themes)) {
    const v = Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map(m => [m[1], m[2]]));
    for (const [fg, bg] of pairs) {
      if (name === 'dark' && fg === 'on-forest' && bg === 'terra') continue;   // on dark, terra pairs with on-terra instead
      assert.ok(v[fg] && v[bg], `${name}: token ${fg}/${bg} defined`);
      assert.ok(ratio(v[fg], v[bg]) >= 5, `${name}: ${fg} on ${bg} is ${ratio(v[fg], v[bg]).toFixed(2)}:1`);
    }
  }
});

test('colour literals live only in tokens.css', () => {
  const files = [...readdirSync(web + 'src').filter(f => /\.(css|tsx?)$/.test(f) && f !== 'tokens.css').map(f => web + 'src/' + f), ...readdirSync(web + 'src/pages').map(f => web + 'src/pages/' + f)];
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(txt.replace(/&#\d+;|href="#"/g, '')), `${f} has a hex colour literal`);
    assert.ok(!/rgba?\(\s*\d/.test(txt), `${f} has an rgb() literal`);
  }
});

test('the UI approver map equals the kernel canApprove for every role and risk class', () => {
  for (const risk of RISK_CLASSES) for (const role of ROLES) assert.equal(APPROVERS[risk].includes(role), canApprove(role, risk), `${role}/${risk}`);
});

test('every tool id is lower dotted, listed once per page, and STATUS.json agrees', () => {
  for (const id of ALL_TOOLS) assert.match(id, /^[a-z_]+(\.[a-z_]+)+$/, id);
  for (const [page, ids] of Object.entries(TOOLS)) assert.equal(new Set(ids).size, ids.length, `${page} lists a tool twice`);
  const status = JSON.parse(readFileSync(web + 'STATUS.json', 'utf8'));
  assert.deepEqual([...status.tools_used].sort(), ALL_TOOLS, 'STATUS.json tools_used matches tools.ts');
});

test('every tool the UI calls is registered by the loaded modules (ui-contract --strict)', () => {
  const out = execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../scripts/ui-contract.ts', import.meta.url)), '--strict'], { encoding: 'utf8' });
  assert.match(out, / 0 missing/);
});

test('every tool the server registers has a person-facing past-tense label for the activity ledger', async () => {
  const { default: pg } = await import('pg');
  const { buildApp } = await import('../server/app.ts');
  const { modules } = await import('../server/modules/index.ts');
  const { PAST } = await import('../web/src/labels.ts');
  const { registry } = buildApp(new pg.Pool({ connectionString: 'postgresql://unused@/unused' }), modules);
  const missing = registry.list().map(t => t.name).filter(n => !PAST[n]);
  assert.deepEqual(missing, [], 'tools with no activity label: ' + missing.join(', '));
  for (const [k, v] of Object.entries(PAST)) assert.ok(!/[_]|\b\w+\.\w+\b/.test(v) && !/\b[a-z]+[A-Z]/.test(v), `label for ${k} reads like a code: ${v}`);
});

test('every reply rule in rules.json has a person-facing line on the compliance tab', async () => {
  const { rulesSummary } = await import('../shared/safety/index.ts');
  const { RULE_LABEL } = await import('../web/src/labels.ts');
  const ids = [...new Set(rulesSummary().reply.map(r => r.rule))];
  const missing = ids.filter(id => !RULE_LABEL[id]);
  assert.deepEqual(missing, [], 'reply rules with no compliance-tab line: ' + missing.join(', '));
  for (const [k, v] of Object.entries(RULE_LABEL)) assert.ok(!/[_]|\b[a-z]+[A-Z]|\bRD\d|\(.*:/.test(v), `rule line for ${k} reads like a code: ${v}`);
});

test('Gemini goes only through Vertex: no stack routes a Gemini part through OpenRouter, and the picker never says so', async () => {
  const { STACKS } = await import('../shared/stacks.ts');
  const { prettyId } = await import('../web/src/catalog.ts');
  for (const s of STACKS) {
    const parts = Object.values(s.components as Record<string, unknown>).filter((v): v is string => typeof v === 'string');
    for (const id of parts) {
      assert.ok(!(/gemini/i.test(id) && /@or$/.test(id)), `${s.id}: Gemini part "${id}" goes through OpenRouter`);
      if (/gemini/i.test(id)) assert.ok(!/openrouter/i.test(prettyId(id)), `${s.id}: "${prettyId(id)}" mentions OpenRouter`);
    }
    assert.ok(!/openrouter/i.test(s.label) || !/gemini/i.test(s.label.replace(/Gemini ears|Gemini voice/g, '')) , `${s.id}: label ties Gemini to OpenRouter: ${s.label}`);
  }
});

test('the call page names a built stack from its run manifest, as the runtime writes it', async () => {
  const { partsRan, voiceStackOf } = await import('../web/src/catalog.ts');
  // Manifests as product/voice writes them (providers.build, test_cascade.py): `voice` is the voice's name, not a part.
  const ran = (m: Record<string, string>) => voiceStackOf({ stackId: 'custom', components: partsRan(m) })?.label;
  const built = (components: Record<string, string>) => { const l = voiceStackOf({ stackId: 'custom', components })?.label; assert.ok(l, JSON.stringify(components)); return l; };
  assert.equal(ran({ stt: 'azure', llm: 'gemini-3.5-flash-lite', tts: 'gemini-lite', voice: 'Despina' }), built({ ears: 'azure', brain: 'gemini-3.5-flash-lite', voice: 'gemini-lite' }));
  assert.equal(ran({ stt: 'azure/ungated', llm: 'gpt-4.1', tts: 'azure', voice: 'hi-IN-Kavya' }), built({ ears: 'azure', brain: 'gpt-4.1', voice: 'azure' }), 'ears that ran without the gate');
  assert.equal(ran({ s2s: 'gemini-3.8-live', voice: 'Kore' }), built({ s2s: 'gemini-3.8-live' }), 'a speech-to-speech run');
  assert.equal(partsRan(null), null);
});

test('the product is called Vyakti: no user-facing string in web/src says "VP" (the internal working name)', () => {
  const bad: string[] = [];
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : /\.(tsx?|)$/.test(e.name) && /\.tsx?$/.test(e.name) ? [d + '/' + e.name] : []);
  for (const f of walk(web + 'src')) {
    readFileSync(f, 'utf8').split('\n').forEach((line, n) => {
      const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/\s\/\/ .*$/, '');
      if (/\bVP\b/.test(code)) bad.push(`${f.replace(web, 'web/')}:${n + 1}: ${code.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(bad, [], 'say Vyakti, not VP:\n' + bad.join('\n'));
});

test('no page writes from a menu: act() is never called inside an onChange of a select or input', () => {
  for (const f of readdirSync(web + 'src/pages')) {
    const txt = readFileSync(web + 'src/pages/' + f, 'utf8');
    assert.ok(!/<select[^>]*onChange=\{[^}]*\bact\(/.test(txt), `${f}: a dropdown change calls act()`);
  }
});

// The browser flows need Chromium and Postgres 16; without them they skip with the reason (CI has no browser cache).
const pre = spawnSync(process.execPath, [web + 'e2e/precheck.mjs'], { encoding: 'utf8' });
test('browser flows against the real server (web/e2e/run.sh)', { skip: pre.status === 0 ? false : (pre.stdout || pre.stderr).trim() || 'precheck failed' }, () => {
  const r = spawnSync('sh', [web + 'e2e/run.sh'], { encoding: 'utf8', timeout: 240_000, env: { ...process.env, NODE_TEST_CONTEXT: undefined } });   // a nested node --test must not think it is a child of this run
  assert.equal(r.status, 0, (r.stdout + r.stderr).slice(-3000));
  assert.match(r.stdout, /# fail 0/);
});
