import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseAgentConfig } from '../lib/platform/agents';
import { HttpError } from '../lib/server/http';
import {
  parseSpeechDeliveryProfile, normalizeSpeechDeliveryProfile, resolveSpeechDelivery,
  SpeechDeliveryValidationError, type SpeechDeliveryProfile,
} from '../lib/voice/speech-delivery';

const adapting: SpeechDeliveryProfile = { version: 1, pace: 'standard', adaptToRequests: true };
const user = (text: string, id = 'turn-1') => ({ id, role: 'user', text });
const baseline = { speed: 1, pace: 'standard', basis: 'agent_default' };
const draft = () => ({
  name: 'Guide', role: 'Customer advisor', objective: 'Help callers understand their options.',
  disclosure: 'I am an AI assistant.', primaryLanguage: 'Hindi', allowedLanguages: ['Hindi', 'English'],
  responseStyle: 'Use clear language.', memoryScope: 'none', escalation: 'Offer a human colleague when asked.', knowledgeIds: [],
});

test('speech delivery validates the finite profile without coercion and uses a fixed safe error', () => {
  for (const pace of ['standard', 'unhurried'] as const) {
    for (const adaptToRequests of [true, false]) {
      const value = { version: 1 as const, pace, adaptToRequests };
      assert.deepEqual(parseSpeechDeliveryProfile(value), value);
      assert.notEqual(parseSpeechDeliveryProfile(value), value);
      assert.deepEqual(normalizeSpeechDeliveryProfile(value), value);
    }
  }
  const invalid: unknown[] = [null, [], '', true, 1, {}, { ...adapting, version: '1' }, { ...adapting, version: 2 },
    { ...adapting, pace: 'slow' }, { ...adapting, pace: ' standard ' }, { ...adapting, adaptToRequests: 'true' },
    { ...adapting, adaptToRequests: 1 }, { version: 1, pace: 'standard' }, { ...adapting, speed: 0.5 },
    { ...adapting, secret: 'never echo this supplied value' }, { ...adapting, [Symbol('extra')]: 1 }];
  for (const value of invalid) assert.throws(() => parseSpeechDeliveryProfile(value), (error: unknown) =>
    error instanceof SpeechDeliveryValidationError && error.message === 'Invalid speech delivery configuration.');
});

test('old config serialization/hash stays unchanged and absence means standard with adaptation off', () => {
  assert.equal(parseSpeechDeliveryProfile(undefined), undefined);
  const actual = parseAgentConfig(draft());
  const legacy = { ...draft(), systemPrompt: '', openingMessage: '', voiceProfile: 'provider-default', enabledTools: [] };
  assert.deepEqual(actual, legacy);
  assert.equal(Object.hasOwn(actual, 'speechDelivery'), false);
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(digest(actual), digest(legacy));
  assert.deepEqual(resolveSpeechDelivery(undefined, [user('Please speak slowly')]), baseline);
});

test('agent parser retains explicit profiles and maps malformed input and unsupported voice to HTTP 400', () => {
  assert.deepEqual(parseAgentConfig({ ...draft(), speechDelivery: adapting }).speechDelivery, adapting);
  assert.equal(Object.hasOwn(parseAgentConfig({ ...draft(), speechDelivery: undefined }), 'speechDelivery'), false);
  for (const speechDelivery of [null, {}, { ...adapting, speed: 0.9 }]) {
    assert.throws(() => parseAgentConfig({ ...draft(), speechDelivery }), (error: unknown) =>
      error instanceof HttpError && error.status === 400 && error.message === 'Invalid speech delivery configuration.');
  }
  for (const pace of ['standard', 'unhurried'] as const) assert.throws(() =>
    parseAgentConfig({ ...draft(), voiceProfile: 'maya-despina', speechDelivery: { ...adapting, pace, adaptToRequests: false } }),
  (error: unknown) => error instanceof HttpError && error.status === 400);
  assert.equal(parseAgentConfig({ ...draft(), voiceProfile: 'maya-despina' }).speechDelivery, undefined);
});

test('operator pace has exactly two rates and only explicit opt-in enables caller adaptation', () => {
  for (const pace of ['standard', 'unhurried'] as const) {
    assert.deepEqual(resolveSpeechDelivery({ version: 1, pace, adaptToRequests: false }, [user('Speak normally'), user('Speak slowly', 'turn-2')]),
      { speed: pace === 'standard' ? 1 : 0.9, pace, basis: 'agent_default' });
  }
  assert.deepEqual(resolveSpeechDelivery({ ...adapting, pace: 'unhurried' }, []), { speed: 0.9, pace: 'unhurried', basis: 'agent_default' });
});

test('direct English, Hindi and Hinglish slow requests bind the final caller turn', () => {
  for (const text of ['Please speak slower.', 'Could you please slow down a bit?', 'Please, speak more slowly!',
    'Talk at a slower pace', 'I need you to speak slowly', 'थोड़ा धीरे बोलिए।', 'कृपया धीमे बोलो',
    'Aap thoda dheere boliye please', 'thoda slow bolo', 'धीरे धीरे बोलिए']) {
    assert.deepEqual(resolveSpeechDelivery(adapting, [user(text)]), { speed: 0.9, pace: 'unhurried', basis: 'caller_request', sourceTurnId: 'turn-1' }, text);
  }
});

test('explicit normal requests reset a persistent slow request including an unhurried operator default', () => {
  for (const text of ['Speak normally now.', 'Please go back to normal speed', 'Normal speed please',
    'speak at your regular pace', 'normal speed pe bolo', 'normal speed se boliye', 'सामान्य गति से बोलिए।']) {
    assert.deepEqual(resolveSpeechDelivery({ ...adapting, pace: 'unhurried' }, [user('Speak slowly'), user(text, 'reset')]),
      { speed: 1, pace: 'standard', basis: 'caller_request', sourceTurnId: 'reset' }, text);
  }
});

test('bounded explanation requests accept the proof scenario and plural ASR variant only through explicit slow delivery', () => {
  for (const text of [
    "I'm feeling overwhelmed. Please explain the next step slowly, one point at a time.",
    "I'm feeling overwhelmed. Please explain the next steps slowly, one point at a time.",
    'I am feeling overwhelmed. Please explain it slowly.',
    'I’m feeling overwhelmed. Explain this slowly, one point at a time.',
    'Please explain that slowly', 'Could you explain the next steps slowly?',
  ]) assert.deepEqual(resolveSpeechDelivery(adapting, [user(text)]),
    { speed: 0.9, pace: 'unhurried', basis: 'caller_request', sourceTurnId: 'turn-1' }, text);
  for (const text of [
    "I'm feeling overwhelmed.", 'I am feeling overwhelmed. Please explain the next step.',
    "I'm feeling overwhelmed. Please do not explain the next step slowly, one point at a time.",
    "I'm not feeling overwhelmed. Please explain the next step slowly, one point at a time.",
    'Do not explain this slowly', 'Please explain this slowly, or not',
    'She is feeling overwhelmed. Please explain the next step slowly, one point at a time.',
    'She said please explain the next step slowly, one point at a time.',
    '"Please explain the next step slowly, one point at a time."',
    "I'm feeling overwhelmed. 'Please explain the next step slowly, one point at a time.'",
    'If I feel overwhelmed, please explain the next step slowly, one point at a time.',
    "I'm feeling overwhelmed. If I ask, explain the next step slowly.",
    "I'm feeling overwhelmed. Please explain the next step slowly, said my colleague.",
  ]) assert.deepEqual(resolveSpeechDelivery(adapting, [user(text)]), baseline, text);
});

test('caller choice persists across unrelated turns and assistant requests never alter it', () => {
  const entries = [user('Speak slowly'), { id: 'assistant-1', role: 'assistant', text: 'Speak normally' }, user('What are the next steps?', 'turn-2')];
  assert.deepEqual(resolveSpeechDelivery(adapting, entries), { speed: 0.9, pace: 'unhurried', basis: 'caller_request', sourceTurnId: 'turn-1' });
  for (const role of ['assistant', 'system', 'tool', 'user_partial', 'sidecar', 'USER']) {
    assert.deepEqual(resolveSpeechDelivery(adapting, [{ id: 'not-a-user', role, text: 'Speak slowly' }]), baseline);
  }
});

test('negation, quotation, third parties and hypotheticals do not produce pace authority', () => {
  const ignored = ["Don't speak slowly", 'Do not slow down', 'Never speak slowly', 'Please do not speak normally',
    'धीरे मत बोलो', 'dheere nahi boliye', 'normal speed pe mat bolo', '"Please speak slowly"',
    '“Speak slowly”', "'Speak slowly'", 'He asked you to speak slowly', 'My mother says speak slower',
    'She said: please speak slowly', 'If I ask, speak slowly', 'Could someone ask you to speak slowly?',
    'अगर मैं कहूं तो धीरे बोलो', 'agar main bolun to dheere bolo', 'usne kaha dheere bolo',
    'Speak slowly or normally', 'Speak slowly. Actually do not change your speed', 'Please speak slowly, said my colleague'];
  for (const text of ignored) assert.deepEqual(resolveSpeechDelivery(adapting, [user(text)]), baseline, text);
});

test('emotion, brevity, descriptive comments and unsupported speed requests never map to a rate', () => {
  for (const text of ['I am confused', 'I am stressed', 'Please keep it short', 'Give me a brief answer',
    'I cannot follow', 'Your speech is too fast', 'Be warmer', 'Please whisper', 'Speak faster',
    'Set speed to 0.5', 'Use speed 2', 'I usually speak slowly', 'Speak slowly about my mother']) {
    assert.deepEqual(resolveSpeechDelivery(adapting, [user(text)]), baseline, text);
  }
});

test('recomputed current revisions remove stale authority and duplicate IDs use the last current entry', () => {
  assert.equal(resolveSpeechDelivery(adapting, [user('Speak slowly')]).sourceTurnId, 'turn-1');
  assert.deepEqual(resolveSpeechDelivery(adapting, [user('Do not speak slowly')]), baseline);
  assert.deepEqual(resolveSpeechDelivery(adapting, []), baseline);
  assert.deepEqual(resolveSpeechDelivery(adapting, [user('Speak slowly'), user('What is the cost?')]), baseline);
  assert.deepEqual(resolveSpeechDelivery(adapting, [user('Speak slowly'), { id: 'turn-1', role: 'assistant', text: 'Speak slowly' }]), baseline);
  assert.deepEqual(resolveSpeechDelivery(adapting, [user('Speak slowly'), user('Speak normally', 'turn-2'), user('Speak slowly')]),
    { speed: 0.9, pace: 'unhurried', basis: 'caller_request', sourceTurnId: 'turn-1' });
});

test('the resolver does not mutate frozen input and requires a source-bound nonempty user ID', () => {
  const profile = Object.freeze({ ...adapting });
  const entries = Object.freeze([Object.freeze(user('Speak slowly'))]);
  assert.equal(resolveSpeechDelivery(profile, entries).speed, 0.9);
  assert.deepEqual(resolveSpeechDelivery(profile, [user('Speak slowly', '')]), baseline);
  assert.deepEqual(resolveSpeechDelivery(profile, [user('Speak slowly', '  ')]), baseline);
  assert.deepEqual(resolveSpeechDelivery(profile, [user('Please '.repeat(700) + 'speak slowly')]), baseline);
});
