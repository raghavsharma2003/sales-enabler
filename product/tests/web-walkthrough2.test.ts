// Second buyer walkthrough (research/2026-10-24/walkthrough/FRICTION.md): the pure pieces behind the web fixes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldRepeats, plainReason } from '../web/src/labels.ts';
import { pageInfo } from '../web/src/tools.ts';
import { formatInr } from '../shared/money.ts';

test('a server setting never reaches a person: telephony off reads as what it means, any other VP_ setting as "not switched on"', () => {
  const t = plainReason('telephony provider is not enabled (search); set VP_TELEPHONY_LIVE=1 with credentials on the server');
  assert.match(t, /^Phone lines are not switched on for this workspace yet/);
  assert.doesNotMatch(t, /VP_|credentials|server/);
  assert.equal(plainReason('needs VP_ANALYSIS_MODEL to be set'), 'This is not switched on for this workspace yet. Your Vyakti administrator can turn it on.');
  const own = 'Give the key a name.';
  assert.equal(plainReason(own), own, 'every other refusal is the server\'s own words, unchanged');
});

test('repeated activity rows fold into one with a count; only neighbours fold, and the newest row of a run is kept', () => {
  const rows = [{ id: 1, s: 'ran a practice call' }, { id: 2, s: 'ran a practice call' }, { id: 3, s: 'ran a practice call' }, { id: 4, s: 'saved a draft' }, { id: 5, s: 'ran a practice call' }];
  assert.deepEqual(foldRepeats(rows, r => r.s).map(({ row, n }) => [row.id, n]), [[1, 3], [4, 1], [5, 1]]);
  assert.deepEqual(foldRepeats([], (r: string) => r), []);
});

test('every page names itself, and campaign chips never assume calls have happened', () => {
  assert.equal(pageInfo('/audiences').label, 'Audiences');
  assert.equal(pageInfo('/contacts/import').label, 'Import contacts');
  assert.equal(pageInfo('/campaigns/new').label, 'New campaign');
  for (const p of ['/campaigns/new', '/campaigns/0b7c1d4e-0000-4000-8000-000000000000']) {
    const chips = pageInfo(p).chips.join(' | ');
    assert.doesNotMatch(chips, /pickup|Pause/i, `${p}: ${chips}`);
  }
});

test('money rounds to the paisa before splitting rupees and paise: ₹1.995 is ₹2.00, never "₹1.100"', () => {
  assert.equal(formatInr(1995, { paise: true }), '₹2.00');
  assert.equal(formatInr(999995, { paise: true }), '₹1,000.00');
  assert.equal(formatInr(10920, { paise: true }), '₹10.92');
  assert.equal(formatInr(5, { paise: true }), '₹0.01');
  assert.equal(formatInr(-1995, { paise: true }), '-₹2.00');
  assert.equal(formatInr(100000), '₹100');
});

test('voice samples: only complete, plain-file entries are used, at their plain address (the server revalidates them)', async () => {
  const { parseSamples } = await import('../web/src/samples.ts');
  const ok = { file: 'v2-flashlite.mp3', durationS: 11.6, text: 'Namaste Asha ji, main Riya bol rahi hoon.', recorded: '2026-10-25' };
  const got = parseSamples({ 'v2-flashlite': ok, a: { ...ok, file: '../secret.mp3' }, b: { ...ok, file: 'x.exe' }, c: { ...ok, text: ' ' }, d: { ...ok, recorded: 'yesterday' }, e: { ...ok, durationS: 0 }, f: null });
  assert.deepEqual(Object.keys(got), ['v2-flashlite']);
  assert.deepEqual(got['v2-flashlite'].sources, [{ src: '/samples/v2-flashlite.mp3', type: 'audio/mpeg' }]);
  assert.equal(parseSamples({ s: { ...ok, durationS: undefined, duration: 9 } }).s.durationS, 9, '"duration" is read as well as "durationS"');
  const voice = parseSamples({ 'v2-mai': { file: 'mai-flash-teo.ogg', durationS: 8.2, text: 'Namaste.', recordedAt: '2026-10-24T09:15:02Z', combinationId: 'x', voice: 'teo', tts: 'mai' } });
  assert.deepEqual(voice['v2-mai'].sources, [{ src: '/samples/mai-flash-teo.ogg', type: 'audio/ogg; codecs=opus' }], 'the renderer\'s shape (Ogg, recordedAt) is read');
  assert.equal(voice['v2-mai'].recorded, '2026-10-24');
  // Several renditions, best first, for Safari: "files" wins over "file"; a bad entry in the list is dropped, not the sample.
  const multi = parseSamples({ s: { ...ok, file: 'old.mp3', files: [{ src: '/samples/a.ogg', type: 'audio/ogg; codecs=opus' }, { src: 'a.m4a' }, { src: '../x.mp3' }, { src: 'a.mp3', type: 'text/html' }] } }).s.sources;
  assert.deepEqual(multi.map(x => [x.src.split('?')[0], x.type]), [['/samples/a.ogg', 'audio/ogg; codecs=opus'], ['/samples/a.m4a', 'audio/mp4'], ['/samples/a.mp3', 'audio/mpeg']]);
  const { playableIn } = await import('../web/src/samples.ts');
  assert.equal(playableIn(multi, t => (t.startsWith('audio/mp4') ? 'maybe' : '')), true, 'Safari: the AAC rendition plays');
  assert.equal(playableIn(multi.slice(0, 1), t => (t.includes('ogg') ? '' : 'probably')), false, 'Ogg only on a browser without Ogg: say it cannot play');
  assert.deepEqual(parseSamples([]), {}); assert.deepEqual(parseSamples(null), {}); assert.deepEqual(parseSamples({}), {}, 'an empty manifest means no samples');
});
