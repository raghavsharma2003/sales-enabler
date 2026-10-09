import test from 'node:test';
import assert from 'node:assert/strict';
import type { IntakeRow } from '../lib/data-intake/contracts';
import { filteredRows, parseExcludedRows, prepareRows, reviewFingerprint, safeExistingRow } from '../lib/data-intake/workspace-view';
const row = (rowNumber: number, extra: Partial<IntakeRow> = {}): IntakeRow => ({ rowNumber, name: 'Synthetic customer', email: '', phone: '', stage: '', notes: '', doNotContact: false, context: [], evidence: [], issues: [], matches: [], excluded: false, ...extra });
const match = (id: string, reasons: string[]) => ({ id, name: 'Existing synthetic customer', email: 'example@example.test', phone: '', reasons });
test('bulk creation is explicit preparation, keeps previous choices and rejects excluded, applied, issue and matched rows', () => {
  const rows = [row(1), row(2), row(3, { excluded: true }), row(4, { previous: { contactId: 'old', action: 'create' } }), row(5, { issues: ['Duplicate email in source'] }), row(6, { matches: [match('old', ['Exact name'])] })];
  const existing = { 2: { rowNumber: 2, action: 'skip' as const } };
  assert.deepEqual(prepareRows(rows, existing, 'create'), { 1: { rowNumber: 1, action: 'create' }, 2: existing[2] });
  assert.deepEqual(existing, { 2: { rowNumber: 2, action: 'skip' } });
});
test('bulk links require a single exact contact channel and never infer name-only or ambiguous identity', () => {
  const rows = [row(1, { matches: [match('email', ['Exact email'])] }), row(2, { matches: [match('name', ['Exact name'])] }), row(3, { matches: [match('a', ['Exact email']), match('b', ['Exact phone'])] }), row(4, { matches: [match('phone', ['Exact phone'])], doNotContact: true }), row(5, { matches: [match('bad', ['Exact email'])], issues: ['Invalid date'] })];
  assert.deepEqual(prepareRows(rows, {}, 'link'), { 1: { rowNumber: 1, action: 'link', contactId: 'email' }, 4: { rowNumber: 4, action: 'link', contactId: 'phone' } });
  assert.equal(rows[3].doNotContact, true); assert.equal(safeExistingRow(rows[1]), false);
});
test('source exclusions accept later batch rows but reject malformed, out-of-range or partial numbers', () => {
  assert.deepEqual(parseExcludedRows('201, 2, 201\n999', 1000), [2, 201, 999]);
  for (const value of ['0', '1001', '2abc', '1.5', '2-4', '-1']) assert.throws(() => parseExcludedRows(value, 1000));
  assert.deepEqual(parseExcludedRows('', 1000), []);
});
test('exception and undecided filters report separate review subsets', () => {
  const rows = [row(1), row(2, { issues: ['Ambiguous customer match'] }), row(3, { matches: [match('c', ['Exact email'])] })];
  assert.deepEqual(filteredRows(rows, {}, 'exceptions').map(item => item.rowNumber), [2]);
  assert.deepEqual(filteredRows(rows, { 1: { rowNumber: 1, action: 'skip' } }, 'undecided').map(item => item.rowNumber), [2, 3]);
  assert.deepEqual(filteredRows(rows, {}, 'new').map(item => item.rowNumber), [1]);
});
test('dirty fingerprint includes row decisions and phase but ignores exclusion order', () => {
  assert.equal(reviewFingerprint([], [201, 2], {}, null, 'mapping'), reviewFingerprint([], [2, 201], {}, null, 'mapping'));
  assert.notEqual(reviewFingerprint([], [], {}, null, 'review'), reviewFingerprint([], [], { 1: { rowNumber: 1, action: 'skip' } }, null, 'review'));
  assert.notEqual(reviewFingerprint([], [], {}, null, 'review'), reviewFingerprint([], [], {}, null, 'applied'));
});
