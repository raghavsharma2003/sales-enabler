import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLiveVoiceProfile } from '../lib/voice/live-voice';
import {
  VOICE_LIVE_ACK_MODEL, VOICE_LIVE_API_VERSION, VOICE_LIVE_DYNAMIC_RATE_SUPPORTED, VOICE_LIVE_MODEL, VOICE_LIVE_OUTPUT_SAMPLE_RATE,
  azureVoiceLiveConfiguration, buildVoiceLiveSession, matchesVoiceLiveSessionAck, normalizeVoiceLiveEvent, voiceLiveConnectionConfig, voiceLiveSessionAckMismatchKeys,
} from '../lib/voice/voice-live-session';

function live(preset: 'taxila-diya' | 'taxila-arjun') {
  const profile = parseLiveVoiceProfile({ version: 1, engine: 'azure-voice-live', preset });
  if (!profile || profile.engine !== 'azure-voice-live') throw new Error('Expected Voice Live profile.');
  return profile;
}
const diya = live('taxila-diya'), arjun = live('taxila-arjun');
const build = (profile = diya) => buildVoiceLiveSession({ model: VOICE_LIVE_MODEL, instructions: 'Approved instructions.\n<live_turn_revision>1</live_turn_revision>', liveVoiceProfile: profile });
const clone = <T>(value: T): T => structuredClone(value);

test('provider configuration derives a fixed key-header URL and digest without binding the secret', () => {
  const base = { AZURE_FOUNDRY_PROJECT_ENDPOINT: 'https://sample.services.ai.azure.com/api/projects/project-one', AZURE_SPEECH_KEY: 'k'.repeat(32) };
  const first = azureVoiceLiveConfiguration(base), rotated = azureVoiceLiveConfiguration({ ...base, AZURE_SPEECH_KEY: 'z'.repeat(32) });
  const url = new URL(first.url);
  assert.equal(url.origin, 'https://sample.services.ai.azure.com'); assert.equal(url.pathname, '/voice-live/realtime');
  assert.equal(url.searchParams.get('api-version'), VOICE_LIVE_API_VERSION); assert.equal(url.searchParams.get('model'), VOICE_LIVE_MODEL);
  assert.equal(first.apiKeyHeader, 'api-key'); assert.equal(first.apiKey, 'k'.repeat(32)); assert.equal(first.providerConfigurationDigest, rotated.providerConfigurationDigest);
  assert.equal(voiceLiveConnectionConfig(base).key, first.apiKey); assert.equal(voiceLiveConnectionConfig(base).setupTimeoutMs, 15_000);
  assert.doesNotMatch(first.providerConfigurationDigest, /k|z/);
  assert.throws(() => azureVoiceLiveConfiguration({ AZURE_VOICE_LIVE_ENDPOINT: 'https://example.test', AZURE_SPEECH_KEY: 'k'.repeat(32) }));
});

test('session builder uses exact Taxila standard voices and bounded Voice Live controls', () => {
  const d = build(diya), a = build(arjun);
  assert.deepEqual(d.session.voice, { type: 'azure-standard', name: 'en-IN-Diya:DragonHDLatestNeural', rate: '1' });
  assert.deepEqual(a.session.voice, { type: 'azure-standard', name: 'en-IN-Arjun:DragonHDLatestNeural', rate: '1' });
  assert.equal(JSON.stringify([d, a]).includes('azure-realtime-native'), false);
  assert.deepEqual(d.session.turn_detection, { type: 'azure_semantic_vad_multilingual', threshold: 0.5, prefix_padding_ms: 420, silence_duration_ms: 500, speech_duration_ms: 80, remove_filler_words: false, create_response: false, interrupt_response: false, auto_truncate: false });
  assert.equal(d.session.input_audio_sampling_rate, 16_000); assert.equal(d.session.output_audio_format, 'pcm16'); assert.deepEqual(d.session.output_audio_timestamp_types, ['word']);
});

test('delivery, vocabulary and tools cross only their finite provider fields', () => {
  const event = buildVoiceLiveSession({ model: VOICE_LIVE_MODEL, instructions: 'Approved.', liveVoiceProfile: diya,
    speechDelivery: { speed: 0.9, pace: 'unhurried', basis: 'caller_request', sourceTurnId: 'turn-1' },
    speechVocabulary: ['Taxila', 'तक्षशिला'], enabledTools: ['search_company_knowledge'] });
  assert.equal(event.session.voice.rate, '0.9'); assert.match(event.session.input_audio_transcription.prompt!, /Taxila/);
  assert.deepEqual(event.session.tools.map(tool => tool.name), ['search_company_knowledge']); assert.equal(event.session.tool_choice, 'auto');
  assert.deepEqual(event.session.tools.map(tool => tool.type), ['function']);
  assert.throws(() => buildVoiceLiveSession({ model: 'other', instructions: 'Approved.', liveVoiceProfile: diya }));
});

test('ACK accepts only the two observed provider normalizations and exact critical tuple', () => {
  const expected = build();
  const ack: any = { type: 'session.updated', session: clone(expected.session) };
  ack.session.model = VOICE_LIVE_ACK_MODEL; ack.session.modalities = ['audio', 'text'];
  assert.equal(matchesVoiceLiveSessionAck(expected, ack), true);
  const nullPrompt = clone(ack); nullPrompt.session.input_audio_transcription.prompt = null;
  assert.equal(matchesVoiceLiveSessionAck(expected, nullPrompt), true, 'provider null is equivalent only to an omitted optional prompt');
  assert.deepEqual(voiceLiveSessionAckMismatchKeys(expected, nullPrompt), []);
  const emptyPrompt = clone(ack); emptyPrompt.session.input_audio_transcription.prompt = '';
  assert.equal(matchesVoiceLiveSessionAck(expected, emptyPrompt), false);
  assert.deepEqual(voiceLiveSessionAckMismatchKeys(expected, emptyPrompt), ['session.input_audio_transcription.prompt']);
  for (const mutate of [
    (value: any) => { value.session.instructions += ' changed'; },
    (value: any) => { value.session.voice.name = 'diya'; },
    (value: any) => { value.session.voice.rate = '0.9'; },
    (value: any) => { value.session.turn_detection.create_response = true; },
    (value: any) => { value.session.input_audio_transcription.model = 'azure-speech'; },
    (value: any) => { value.session.model = 'gpt-realtime-2.1-mini-other'; },
    (value: any) => { value.session.tools = [{ type: 'function', name: 'forged' }]; },
  ]) { const changed = clone(ack); mutate(changed); assert.equal(matchesVoiceLiveSessionAck(expected, changed), false); assert.ok(voiceLiveSessionAckMismatchKeys(expected, changed).length > 0); }
  assert.equal(matchesVoiceLiveSessionAck(expected, { ...ack, type: 'session.created' }), false);
});

test('qualified ACK keeps all function schemas and the bilingual vocabulary prompt exact', () => {
  const expected = buildVoiceLiveSession({ model: VOICE_LIVE_MODEL, instructions: 'Qualified fictional configuration.', liveVoiceProfile: diya,
    enabledTools: ['search_company_knowledge', 'recall_customer_context', 'request_follow_up'],
    speechVocabulary: ['Fictional Aster Project', 'काल्पनिक तक्ष नाम'] });
  const ack: any = { type: 'session.updated', session: clone(expected.session) };
  ack.session.model = VOICE_LIVE_ACK_MODEL; ack.session.modalities = ['audio', 'text'];
  assert.equal(ack.session.tools.length, 3); assert.ok(ack.session.tools.every((tool: any) => tool.type === 'function'));
  assert.equal(matchesVoiceLiveSessionAck(expected, ack), true);
  const missingType = clone(ack); delete missingType.session.tools[0].type;
  assert.equal(matchesVoiceLiveSessionAck(expected, missingType), false);
  const changedPrompt = clone(ack); changedPrompt.session.input_audio_transcription.prompt += ' changed';
  assert.equal(matchesVoiceLiveSessionAck(expected, changedPrompt), false);
});

test('retaining the initial Voice Live rate is not equivalent to a requested between-turn rate change', () => {
  assert.equal(VOICE_LIVE_DYNAMIC_RATE_SUPPORTED, false);
  const expected = buildVoiceLiveSession({ model: VOICE_LIVE_MODEL, instructions: 'Second revision.', liveVoiceProfile: diya,
    speechDelivery: { speed: 0.9, pace: 'unhurried', basis: 'caller_request', sourceTurnId: 'turn-2' }, enabledTools: ['search_company_knowledge'] });
  const retained: any = { type: 'session.updated', session: clone(expected.session) };
  retained.session.model = VOICE_LIVE_ACK_MODEL; retained.session.modalities = ['audio', 'text']; retained.session.input_audio_transcription.prompt = null;
  retained.session.voice.rate = '1';
  assert.deepEqual(voiceLiveSessionAckMismatchKeys(expected, retained), ['session.voice.rate']);
  assert.equal(matchesVoiceLiveSessionAck(expected, retained), false);
});

test('normalizer maps bounded audio/transcript/ASR/tool and terminal events', () => {
  const pcm = Buffer.alloc(320).toString('base64');
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'response.audio.delta', response_id: 'resp_1', item_id: 'item_1', output_index: 0, content_index: 0, delta: pcm }),
    { type: 'response.output_audio.delta', response_id: 'resp_1', item_id: 'item_1', output_index: 0, content_index: 0, delta: pcm, sampleRate: VOICE_LIVE_OUTPUT_SAMPLE_RATE });
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'response.audio.done', response_id: 'resp_1', item_id: 'item_1', output_index: 0, content_index: 0 }),
    { type: 'response.output_audio.done', response_id: 'resp_1', item_id: 'item_1', output_index: 0, content_index: 0 });
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'response.audio_transcript.done', response_id: 'resp_1', item_id: 'item_1', output_index: 0, content_index: 0, transcript: 'assistant final' }),
    { type: 'response.output_audio_transcript.done', response_id: 'resp_1', item_id: 'item_1', output_index: 0, content_index: 0, transcript: 'assistant final' });
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'item_1', transcript: '  final text  ' }),
    { type: 'conversation.item.input_audio_transcription.completed', item_id: 'item_1', transcript: 'final text' });
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'response.function_call_arguments.done', response_id: 'resp_1', call_id: 'call_1', name: 'search_company_knowledge', arguments: '{}' }),
    { type: 'response.function_call_arguments.done', response_id: 'resp_1', call_id: 'call_1', name: 'search_company_knowledge', arguments: '{}' });
  const done: any = normalizeVoiceLiveEvent({ type: 'response.done', response: { id: 'resp_1', status: 'completed', status_details: { reason: 'none', private: 'drop' }, usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5, input_token_details: { audio_tokens: 1 }, output_token_details: { audio_tokens: 2 } }, private: 'drop' } });
  assert.equal(done.response.usage.total_tokens, 5); assert.equal(JSON.stringify(done).includes('private'), false);
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'response.output_item.added', response_id: 'resp_1', output_index: 0, item: { id: 'item_1', type: 'message', private: 'drop' } }),
    { type: 'response.output_item.added', response_id: 'resp_1', output_index: 0, item: { id: 'item_1', type: 'message' } });
  assert.equal(normalizeVoiceLiveEvent({ type: 'response.output_item.added', response_id: 'resp_1', output_index: 16, item: { id: 'item_1', type: 'message' } }), null);
  assert.equal(normalizeVoiceLiveEvent({ type: 'response.audio.delta', response_id: 'resp_1', item_id: 'item_1', output_index: 0, content_index: 0, delta: 'not base64' }), null);
  assert.equal(normalizeVoiceLiveEvent({ type: 'response.audio.delta', response_id: 'resp_1', item_id: 'item_1', output_index: 0, content_index: 16, delta: pcm }), null);
  assert.equal(normalizeVoiceLiveEvent({ type: 'unknown.provider.event', secret: 'drop' }), null);
});

test('normalizer retains safe ACKs, VAD, timestamps, truncation and redacted errors', () => {
  const expected = build(), updated = normalizeVoiceLiveEvent({ type: 'session.updated', session: expected.session });
  assert.equal(matchesVoiceLiveSessionAck(expected, updated), true);
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'input_audio_buffer.speech_started', item_id: 'item_1', private: 'drop' }), { type: 'input_audio_buffer.speech_started', item_id: 'item_1' });
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'response.audio_timestamp.delta', response_id: 'resp_1', item_id: 'item_1', output_index: 0, content_index: 0, timestamp_type: 'word', audio_offset_ms: 10, audio_duration_ms: 20, text: 'word' }),
    { type: 'response.audio_timestamp.delta', response_id: 'resp_1', item_id: 'item_1', output_index: 0, content_index: 0, timestamp_type: 'word', audio_offset_ms: 10, audio_duration_ms: 20, text: 'word' });
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'conversation.item.truncated', item_id: 'item_1', content_index: 0, audio_end_ms: 120 }), { type: 'conversation.item.truncated', item_id: 'item_1', content_index: 0, audio_end_ms: 120 });
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'conversation.item.deleted', item_id: 'item_1', private: 'drop' }), { type: 'conversation.item.deleted', item_id: 'item_1' });
  assert.deepEqual(normalizeVoiceLiveEvent({ type: 'error', error: { code: 'invalid_value', type: 'invalid_request_error', param: 'session.voice', message: 'private details' } }),
    { type: 'error', diagnostic: { code: 'invalid_value', type: 'invalid_request_error', param: 'session.voice' } });
});
