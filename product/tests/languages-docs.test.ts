// The capability matrix matches the vendor documentation saved on 2026-10-24 (research/2026-10-24/language-lists/):
// lists.json is what each page lists; matrix.json is what VP adopts, with every deviation (removed or added) explained.
// components.ts must equal matrix.json, and matrix.json must stay within the docs plus its explained additions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENTS } from '../shared/components.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'research', '2026-10-24', 'language-lists');
const lists = JSON.parse(readFileSync(join(DIR, 'lists.json'), 'utf8')) as { fetched: string; parts: { part: string; id: string; supported: string[]; sources: string[]; listPublished: boolean }[] };
const matrix = JSON.parse(readFileSync(join(DIR, 'matrix.json'), 'utf8')) as { parts: Record<string, { vp: string[]; docs: string[]; removed: string[]; added: string[]; why: string; sources: string[] }> };
const sorted = (x: readonly string[]) => [...x].sort();

test('every part has a saved docs list and an adopted entry, each page saved with its URL and fetch date', () => {
  const ids = sorted(COMPONENTS.map(c => `${c.part}/${c.id}`));
  assert.deepEqual(sorted(lists.parts.map(p => `${p.part}/${p.id}`)), ids);
  assert.deepEqual(sorted(Object.keys(matrix.parts)), ids);
  assert.equal(lists.fetched, '2026-10-24');
  for (const p of lists.parts) for (const f of p.sources) {
    assert.ok(existsSync(join(DIR, f)), `${p.id}: ${f} is saved`);
    const page = readFileSync(join(DIR, f), 'utf8');
    assert.match(page, /https?:\/\/\S+/, `${f} names its URL`);
    assert.match(page, /2026-10-24/, `${f} names its fetch date`);
  }
});

test('the matrix matches the saved docs: removals and additions are the only differences, and each is explained', () => {
  for (const p of lists.parts) {
    const m = matrix.parts[`${p.part}/${p.id}`];
    assert.deepEqual(sorted(m.docs), sorted(p.supported), `${p.id}: matrix.json copies the docs list`);
    assert.deepEqual(sorted(m.removed), sorted(p.supported.filter(l => !m.vp.includes(l))), `${p.id}: removed is exactly docs minus adopted`);
    assert.deepEqual(sorted(m.added), sorted(m.vp.filter(l => !p.supported.includes(l))), `${p.id}: added is exactly adopted minus docs`);
    if (m.removed.length || m.added.length) assert.ok(m.why.length > 40 && m.why !== 'as the docs list', `${p.id}: a deviation says why`);
  }
});

test('components.ts equals the adopted matrix; Hinglish is offered exactly where Hindi and English are', () => {
  for (const c of COMPONENTS) {
    const m = matrix.parts[`${c.part}/${c.id}`];
    const all = [...c.languages.measured, ...c.languages.stated];
    assert.deepEqual(sorted(all.filter(l => l !== 'hinglish')), sorted(m.vp), `${c.part}/${c.id}`);
    const hinglish = all.includes('hinglish');
    assert.equal(hinglish, all.includes('hi-IN') && all.includes('en-IN'), `${c.part}/${c.id}: Hinglish only with Hindi and English`);
  }
});
