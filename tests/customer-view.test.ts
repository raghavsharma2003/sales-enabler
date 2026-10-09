import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveCustomer } from '../lib/platform/customer-view';
import type { PlatformRecord, WorkspaceEntity } from '../lib/platform/contracts';
const base: WorkspaceEntity = { id: 'synthetic-customer', createdAt: '', name: 'Imported Person', email: 'imported@example.test', phone: '+919876543210', stage: 'Qualified', notes: 'Imported staff notes', doNotContact: true };
const profile = (data: Record<string, unknown>, status = 'active'): PlatformRecord => ({ id: 'profile', kind: 'customer_profile', status, revision: 1, createdAt: '', updatedAt: '', data: { contactId: base.id, ...data } });
test('imported customer fields populate the effective form without a profile', () => {
  const result = effectiveCustomer(base, []);
  for (const key of ['name', 'email', 'phone', 'stage', 'notes'] as const) assert.equal(result[key], base[key]);
});
test('partial active profiles fall back to imported fields only when nullish', () => {
  const result = effectiveCustomer(base, [profile({ name: 'Reviewed Name', email: null })]);
  assert.equal(result.name, 'Reviewed Name'); assert.equal(result.email, base.email); assert.equal(result.phone, base.phone); assert.equal(result.stage, base.stage); assert.equal(result.notes, base.notes);
});
test('explicitly cleared profile fields remain empty instead of restoring imported values', () => {
  const result = effectiveCustomer(base, [profile({ email: '', phone: '', notes: '', stage: '' })]);
  assert.equal(result.email, ''); assert.equal(result.phone, ''); assert.equal(result.notes, ''); assert.equal(result.stage, '');
});
test('inactive and unrelated profiles do not override an imported customer', () => {
  const result = effectiveCustomer(base, [profile({ email: 'inactive@example.test' }, 'archived'), profile({ contactId: 'other', phone: 'incorrect' })]);
  assert.equal(result.profile, undefined); assert.equal(result.email, base.email); assert.equal(result.phone, base.phone);
});
test('profile permission never hides a base opt-out and table evidence stays separate', () => {
  const result = effectiveCustomer({ ...base, doNotContact: false, optOut: true, reviewedTableSources: [{ sourceArtifactId: 'table', rowNumber: 3 }, null], sourceEvidence: [{ column: 'Notes', value: 'Imported note' }, {}] }, [profile({ doNotContact: false, optOut: false, consent: { email: { granted: true } } })]);
  assert.equal(result.doNotContact, true); assert.deepEqual(result.tableSources, [{ sourceId: 'table', rowNumber: 3 }]); assert.deepEqual(result.sourceEvidence, [{ column: 'Notes', value: 'Imported note' }]);
});
