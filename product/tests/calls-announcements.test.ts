// Operator announcements and carriers' hang-up causes (voice/vpvoice/announce.py, transports.hangup_reason) end a call
// as switched_off / invalid_number / busy / voicemail: the reason code, "not connected" and the retry ladder class.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeReason, NOT_CONNECTED, REASON_CODES } from '../server/modules/calls/taxonomy.ts';
import { retryClass } from '../server/modules/calls/followups.ts';
import { validateRuntimeBatch } from '../server/modules/calls/ingest.ts';
import { RETRY_LADDER } from '../server/modules/campaigns/defaults.ts';

test('switched_off and invalid_number: dial-stage reason codes, not connected, ladder classes', () => {
  assert.equal(codeReason('switched_off', 4, 0), 'DIAL_SWITCHED_OFF');
  assert.equal(codeReason('invalid_number', 4, 0), 'DIAL_OPERATOR_ANNOUNCEMENT');
  for (const code of ['DIAL_SWITCHED_OFF', 'DIAL_OPERATOR_ANNOUNCEMENT']) assert.ok(REASON_CODES.some(r => r.code === code && r.charged === false), code);
  assert.ok(NOT_CONNECTED.has('switched_off') && NOT_CONNECTED.has('invalid_number'));
  assert.equal(retryClass('switched_off', 'DIAL_SWITCHED_OFF'), 'switched_off');
  assert.equal(retryClass('invalid_number', 'DIAL_OPERATOR_ANNOUNCEMENT'), 'invalid');
  assert.equal(retryClass('voicemail', 'CONN_VOICEMAIL'), 'voicemail');
  assert.deepEqual(RETRY_LADDER.invalid.steps, [], 'a number that does not exist is never retried automatically');
});

test('ingest accepts the new end reasons', () => {
  const manifest = { combinationId: 'x', stackId: 'v2-flashlite', agentVersionHash: 'a', components: {}, fallbacksUsed: [], memory: 'none', runtimeVersion: 't' };
  for (const endReason of ['switched_off', 'invalid_number']) {
    const b = { protocol: 1, conversationId: '0b6f6e1a-1c2d-4e5f-8a9b-000000000001',
      events: [{ seq: 1, type: 'call.ended', at: '2026-10-24T05:00:00Z', endReason, durationS: 4, transcript: [], manifest }] };
    assert.doesNotThrow(() => validateRuntimeBatch(b), endReason);
  }
});
