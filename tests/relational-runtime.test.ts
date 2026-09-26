import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRelationalRuntime, honorificShift, momentGate, ruptureRepairShift } from '../lib/voice/relational-runtime';

test('explicit nervous wording is a current-turn cue, while negated, quoted and hypothetical phrases remain excluded', () => {
  for (const text of ['I am nervous about the next step.', 'I feel nervous.', "I'm nervous."]) assert.equal(momentGate(text).moment, 'vulnerable');
  for (const text of ['I am not nervous.', 'I never feel nervous.', 'If I am nervous, what would you say?', 'Imagine I feel nervous.', 'The report says I am nervous.', 'She wrote "I am nervous".', 'He feels nervous.', 'I might feel nervous later.']) assert.equal(momentGate(text).moment, 'none');
  const runtime = compileRelationalRuntime({ entries: [{ id: 'nervous', role: 'user', text: 'I feel nervous.' }] });
  assert.match(runtime.instructions, /do not diagnose or intensify/); assert.equal(runtime.state.concern, undefined);
});

test('one-at-a-time language requests select only explicit allowed language and preserve quote/negation guards', () => {
  const settings = { primaryLanguage: 'English', allowedLanguages: ['English', 'Hindi'] };
  assert.equal(compileRelationalRuntime({ entries: [{ role: 'user', text: 'Please explain one at a time in Hinglish.' }], settings }).state.language, 'Hinglish');
  for (const text of ['Do not explain one at a time in Hinglish.', 'If I say explain one at a time in Hinglish, what happens?', 'The report says "explain one at a time in Hinglish".']) assert.equal(compileRelationalRuntime({ entries: [{ role: 'user', text }], settings }).state.language, 'English');
});
import { compileRelationshipContext } from '../lib/voice/relationship';

const user = (id: string, text: string) => ({ id, role: 'user', text });
const assistant = (id: string, text: string) => ({ id, role: 'assistant', text });
test('source repair machine requires distinct caller repair signals and regresses immediately', () => {
  const start = { ruptureOpen: false, repairState: 'none' as const };
  assert.equal(ruptureRepairShift(start, true, true)?.repairState, 'open');
  const entries = [user('1', 'You missed my point.'), assistant('2', "I'm sorry, that helps."), user('3', 'What does it cost?')];
  const open = compileRelationalRuntime({ entries });
  assert.equal(open.state.repair_state, 'open');
  assert.equal(open.state.concern?.evidence.entryId, '1');
  entries.push(user('4', 'That helps.'));
  assert.equal(compileRelationalRuntime({ entries }).state.repair_state, 'repairing');
  entries.push(user('5', 'Yes, that is right.'));
  const repaired = compileRelationalRuntime({ entries });
  assert.equal(repaired.state.repair_state, 'repaired');
  assert.equal(repaired.state.rupture_open, false);
  assert.equal(repaired.state.concern, undefined);
  entries.push(user('6', 'You got that wrong.'));
  assert.equal(compileRelationalRuntime({ entries }).state.repair_state, 'open');
});
test('replayed/revised provider IDs do not manufacture repair evidence', () => {
  const entries = [user('1', 'You missed my point.'), user('2', 'That helps.'), user('2', 'That helps.')];
  assert.equal(compileRelationalRuntime({ entries }).state.repair_state, 'repairing');
  entries.push(user('2', 'What are the options?'));
  const corrected = compileRelationalRuntime({ entries });
  assert.equal(corrected.state.repair_state, 'open');
  assert.equal(corrected.events.filter(e => e.dim === 'repair').length, 0);
  assert.deepEqual(corrected, compileRelationalRuntime({ entries }));
});
test('persistent communication preferences affect later ordinary turns with exact citations', () => {
  const entries = [user('1', 'Please speak in Hindi. Please call me Asha. I prefer casual.'), user('2', 'Please keep it brief.'), user('3', 'What is the next step?')];
  const runtime = compileRelationalRuntime({ entries, settings: { allowedLanguages: ['Hindi', 'English'] } });
  assert.equal(runtime.state.language, 'Hindi');
  assert.equal(runtime.state.address, 'Asha');
  assert.equal(runtime.state.formality, 'casual');
  assert.equal(runtime.state.pace, 'brief');
  assert.match(runtime.instructions, /essential point/);
  for (const event of runtime.events) for (const citation of event.citations) {
    assert.equal(entries[citation.entryIndex].text.slice(citation.start, citation.end), citation.text);
    assert.equal(entries[citation.entryIndex].id, citation.entryId);
  }
});
test('pause survives unrelated/assistant turns and explicit continuation resumes', () => {
  const entries = [user('1', 'Please stop.'), assistant('2', 'Go ahead.'), user('3', 'Okay.')];
  assert.equal(compileRelationalRuntime({ entries }).state.pauseRequested, true);
  entries.push(user('4', 'Please continue.'));
  assert.equal(compileRelationalRuntime({ entries }).state.pauseRequested, false);
});
test('quoted, attributed, hypothetical and negated language is not caller state', () => {
  for (const text of ['Say "You missed my point. Please speak in Hindi."', 'If you missed my point, what would you do?', 'My colleague said you missed my point.', 'Do not call me Asha.', 'Do not use Hindi.', 'I am not overwhelmed.']) {
    const runtime = compileRelationalRuntime({ entries: [user('1', text)] });
    assert.equal(runtime.state.repair_state, 'none', text);
    assert.equal(runtime.state.language, 'English', text);
    assert.equal(runtime.state.address, undefined, text);
    assert.equal(runtime.state.pace, 'normal', text);
  }
});
test('upstream honorific hysteresis retains episode/day threshold and instant regression', () => {
  const now = new Date('2026-09-22T00:00:00Z');
  const evidence = [0, 1, 2].map((v) => ({ term: 'tum' as const, episodeId: v, at: `2026-09-${10 + v * 4}T00:00:00Z` }));
  assert.equal(honorificShift('aap', evidence.slice(0, 2), false, null, now), null);
  assert.equal(honorificShift('aap', evidence, false, null, now)?.next, 'tum');
  assert.equal(honorificShift('tum', evidence, true, { term: 'tu', episodeId: 4 }, now)?.next, 'aap');
  assert.equal(honorificShift('aap', evidence.map(v => ({ ...v, at: 'invalid' })), false, null, now), null);
  const entries = [user('1', 'Use tum.'), user('2', 'What is the price?')];
  assert.equal(compileRelationalRuntime({ entries }).state.honorific, 'tum');
  entries.push(user('3', 'You missed my point.'));
  assert.equal(compileRelationalRuntime({ entries }).state.honorific, 'aap');
});
test('approved context initializes state; current-call correction overrides without accepting a memory', () => {
  const relationship = compileRelationshipContext({ contactId: 'contact', allowedLanguages: ['Hindi', 'English'], memories: [{ id: 'memory', contactId: 'contact', status: 'approved', content: 'Prefers Hindi.', createdAt: '2026-09-22T00:00:00Z' }], commitments: [] });
  const initial = compileRelationalRuntime({ entries: [], relationship });
  assert.equal(initial.state.language, 'Hindi');
  assert.deepEqual(initial.events[0].sourceIds, ['memory']);
  const changed = compileRelationalRuntime({ entries: [user('1', 'Please speak in English instead.')], relationship });
  assert.equal(changed.state.language, 'English');
  assert.ok(changed.correctionCandidates.every(c => c.status === 'requires-review'));
  const revoked = compileRelationalRuntime({ entries: [] });
  assert.equal(revoked.state.language, 'English');
  assert.equal(revoked.events.length, 0);
});
test('language limits and code switching cannot infer trust or intimacy', () => {
  const runtime = compileRelationalRuntime({ entries: [user('1', 'Please speak in Hindi.'), user('2', 'Tum mujhe batao kya karna hai?')], settings: { allowedLanguages: ['English'] } });
  assert.equal(runtime.state.language, 'English');
  assert.equal(runtime.state.honorific, 'aap');
  assert.equal('trust' in runtime.state, false);
  assert.equal(compileRelationalRuntime({ entries: [user('1', 'Please use Hindi. Actually, please use English.')] }).state.language, 'English');
});
test('moment and background recall gates use only a real current caller turn', () => {
  assert.deepEqual(momentGate(''), { moment: 'none', pulled: false });
  assert.deepEqual(momentGate('🎉'), { moment: 'none', pulled: false });
  assert.equal(momentGate('Remember when we discussed the appointment?').pulled, true);
  assert.equal(momentGate('Do not remember that.').pulled, false);
  assert.equal(compileRelationalRuntime({ entries: [user('1', 'I got selected!'), user('2', 'What is the price?'), assistant('3', 'Good news!')] }).moment, 'none');
  const relationship = { preferences: [], sourceIds: ['commitment'], guidance: '', omittedCount: 0, openCommitments: [{ id: 'commitment', title: 'Review the documents' }] };
  assert.match(compileRelationalRuntime({ entries: [], relationship }).instructions, /standing background only/);
  assert.match(compileRelationalRuntime({ entries: [user('1', 'Like last time, can we review?')], relationship }).instructions, /explicitly referred/);
});
test('removing the cause removes carried concern; ordinary turns retain useful pacing', () => {
  const entries = [user('1', 'This is too much information.'), user('2', 'What about the fee?')];
  const runtime = compileRelationalRuntime({ entries });
  assert.equal(runtime.state.pace, 'unhurried');
  assert.equal(runtime.state.concern?.evidence.entryId, '1');
  assert.equal(compileRelationalRuntime({ entries: entries.slice(1) }).state.concern, undefined);
  entries.push(user('3', 'Normal pace is fine.'));
  assert.equal(compileRelationalRuntime({ entries }).state.pace, 'normal');
});
