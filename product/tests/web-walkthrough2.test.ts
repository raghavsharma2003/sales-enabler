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
