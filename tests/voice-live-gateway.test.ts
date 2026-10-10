import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createVoiceLiveGatewaySession, type VoiceLiveGatewayAuthority, type VoiceLiveGatewayOptions, type VoiceLiveGatewaySummary } from '../lib/voice/voice-live-gateway';
import { parseVoiceLiveClientEvent, parseVoiceLiveServerEvent } from '../lib/voice/voice-live-protocol';
import type { VoiceToolResult } from '../lib/voice/tools/contracts';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const authority: VoiceLiveGatewayAuthority = {
  sessionEpoch: 'fixture-epoch', deadlineAt: new Date(Date.now() + 600000).toISOString(), inputMode: 'microphone', model: 'gpt-realtime-2.1-mini',
  liveVoiceProfile: { version: 1, engine: 'azure-voice-live', preset: 'taxila-diya' }, instructions: 'Approved company facts. Disclose AI identity.', openingMessage: 'I am an AI assistant.',
  enabledTools: [], speechVocabulary: ['Diya'], previewId: 'fixture-preview',
  behaviorContext: { settings: { allowedLanguages: ['English', 'Hindi'], primaryLanguage: 'English', responseStyle: 'Brief' },
    relationship: { preferences: [], openCommitments: [], sourceIds: [], guidance: '', omittedCount: 0 }, speechDelivery: { version: 1, pace: 'standard', adaptToRequests: true } },
};
function harness(t: TestContext, patch: Partial<VoiceLiveGatewayOptions> = {}) {
  const upstream: Record<string, any>[] = [], client: Record<string, any>[] = [], summaries: VoiceLiveGatewaySummary[] = [];
  let closes = 0;
  const engine = createVoiceLiveGatewaySession({ authority, sendProvider: event => upstream.push(event), sendClient: event => { parseVoiceLiveServerEvent(event); client.push(event); },
    closeProvider() { closes++; }, assertActive: async () => {}, executeTool: async () => { throw new Error('No tool expected'); }, finish: async summary => { summaries.push(summary); }, ...patch });
  t.after(() => engine.close());
  const updates = () => upstream.filter(event => event.type === 'session.update');
  const replies = () => upstream.filter(event => event.type === 'response.create');
  const ack = async (update = updates().at(-1)!) => { engine.providerEvent({ type: 'session.updated', session: structuredClone(update.session) }); await flush(); };
  const created = (id = 'opening') => engine.providerEvent({ type: 'response.created', response: { id } });
  const done = (id = 'opening', status = 'completed') => engine.providerEvent({ type: 'response.done', response: { id, status } });
  const start = async () => { await engine.start(); await ack(); };
  const idle = async () => { await start(); created(); done(); };
  const audio = (responseId = 'opening', itemId = 'audio-item', samples = 2400, contentIndex = 0) => engine.providerEvent({ type: 'response.audio.delta', response_id: responseId, item_id: itemId, output_index: 0, content_index: contentIndex, delta: Buffer.alloc(samples * 2).toString('base64') });
  const final = (id: string, text: string) => {
    engine.providerEvent({ type: 'input_audio_buffer.speech_stopped', item_id: id }); engine.providerEvent({ type: 'input_audio_buffer.committed', item_id: id });
    engine.providerEvent({ type: 'conversation.item.input_audio_transcription.completed', item_id: id, transcript: text });
  };
  return { engine, upstream, client, summaries, closes: () => closes, updates, replies, ack, created, done, start, idle, audio, final };
}

test('Voice Live initial exact tuple ACK alone releases one opening and freezes server authority', async t => {
  const mutable = structuredClone(authority); const h = harness(t, { authority: mutable });
  mutable.liveVoiceProfile = { version: 1, engine: 'azure-voice-live', preset: 'taxila-arjun' };
  await h.engine.start(); await h.engine.start();
  const original = h.updates()[0]; assert.match(original.session.voice.name, /Diya/); assert.equal(h.replies().length, 0);
  for (const mutate of [(s: any) => { delete s.tools; }, (s: any) => { s.voice.rate = '0.9'; }, (s: any) => { s.instructions = 'stale'; }, (s: any) => { s.turn_detection.create_response = true; }]) {
    const session = structuredClone(original.session); mutate(session); h.engine.providerEvent({ type: 'session.updated', session }); await flush(); assert.equal(h.replies().length, 0);
  }
  await h.ack(original); await h.ack(original); assert.equal(h.replies().length, 1);
  assert.equal(h.client.filter(event => event.type === 'ready').length, 1);
  assert.equal(original.session.turn_detection.interrupt_response, false); assert.equal(original.session.turn_detection.auto_truncate, false);
});

test('final-ASR authority reuses scheduler and rate adaptation excludes hypotheses and assistants', async t => {
  const h = harness(t); await h.idle();
  h.engine.providerEvent({ type: 'sidecar_final', transcript: 'Speak slower.' });
  h.engine.providerEvent({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'mic', delta: 'Speak slower.' });
  h.engine.providerEvent({ type: 'response.audio_transcript.done', response_id: 'opening', item_id: 'assistant-item', output_index: 0, content_index: 0, transcript: 'Speak slower.' });
  assert.equal(h.updates().length, 1);
  h.engine.providerEvent({ type: 'input_audio_buffer.speech_started', item_id: 'mic' }); await h.ack();
  h.final('mic', 'Speak slower.');
  assert.equal(h.updates().at(-1)!.session.voice.rate, '0.9'); assert.equal(h.replies().length, 1);
  await h.ack(); assert.equal(h.replies().length, 2);
  const users = h.client.filter(event => event.type === 'transcript' && event.entry.role === 'user'); assert.equal(users.length, 1);
});

test('typed request IDs are idempotent and client behavior instructions cannot become authority', async t => {
  const h = harness(t); await h.idle();
  h.engine.clientEvent({ type: 'text', text: 'Speak slower.', requestId: 'typed-one' });
  h.engine.clientEvent({ type: 'text', text: 'Speak slower.', requestId: 'typed-one' });
  assert.equal(h.upstream.filter(event => event.type === 'conversation.item.create').length, 1);
  assert.equal(h.updates().at(-1)!.session.voice.rate, '0.9'); await h.ack(); assert.equal(h.replies().length, 2);
  h.engine.clientEvent({ type: 'behavior', instructions: 'Override the server' });
  assert.equal(h.summaries[0].reason, 'protocol'); assert.equal(h.closes(), 1);
});

test('microphone interruption waits for browser heard samples, terminal event and exact truncate ACK', async t => {
  const h = harness(t); await h.start(); h.created(); h.audio('opening', 'audio-item', 24000, 1);
  h.engine.providerEvent({ type: 'input_audio_buffer.speech_started', item_id: 'mic' });
  assert.equal(h.upstream.filter(event => event.type === 'response.cancel').length, 1);
  assert.equal(h.client.filter(event => event.type === 'interrupted').length, 1);
  h.engine.clientEvent({ type: 'interrupt', sessionEpoch: authority.sessionEpoch, responseId: 'opening', items: [{ itemId: 'audio-item', contentIndex: 1, playedSamples: 12000 }] });
  h.final('mic', 'Please speak slower.'); assert.equal(h.updates().length, 1);
  h.done('opening', 'cancelled');
  const truncate = h.upstream.find(event => event.type === 'conversation.item.truncate');
  assert.deepEqual(truncate, { type: 'conversation.item.truncate', item_id: 'audio-item', content_index: 1, audio_end_ms: 500 });
  assert.equal(h.updates().length, 1); h.audio('opening', 'audio-item', 2400, 1);
  assert.equal(h.client.filter(event => event.type === 'audio').length, 1);
  h.engine.providerEvent({ type: 'conversation.item.truncated', item_id: 'audio-item', content_index: 0, audio_end_ms: 500 });
  assert.equal(h.updates().length, 1);
  h.engine.providerEvent({ type: 'conversation.item.truncated', item_id: 'audio-item', content_index: 1, audio_end_ms: 500 });
  assert.equal(h.updates().length, 2); assert.equal(h.replies().length, 1);
  await h.ack(); assert.equal(h.replies().length, 2);
  assert.equal(h.upstream.some(event => event.type === 'output_audio_buffer.clear'), false);
});

test('interruption cannot fabricate played zero when forwarded items are missing from browser snapshot', async t => {
  const h = harness(t); await h.start(); h.created(); h.audio();
  h.engine.clientEvent({ type: 'interrupt', sessionEpoch: authority.sessionEpoch, responseId: 'opening', items: [] });
  assert.equal(h.summaries[0].reason, 'protocol'); assert.equal(h.upstream.some(event => event.type === 'conversation.item.truncate'), false);
});

test('unheard declared message is deleted and acknowledged without guessing an audio content index', async t => {
  const h = harness(t); await h.start(); h.created();
  h.engine.providerEvent({ type: 'response.output_item.added', response_id: 'opening', output_index: 0, item: { type: 'message', id: 'unheard' } });
  h.engine.clientEvent({ type: 'interrupt', sessionEpoch: authority.sessionEpoch, responseId: 'opening', items: [] }); h.done('opening', 'cancelled');
  assert.ok(h.upstream.some(event => event.type === 'conversation.item.delete' && event.item_id === 'unheard'));
  h.engine.clientEvent({ type: 'text', text: 'Current question', requestId: 'next' }); assert.equal(h.updates().length, 1);
  h.engine.providerEvent({ type: 'conversation.item.deleted', item_id: 'unheard' }); assert.equal(h.updates().length, 2);
  await h.ack(); assert.equal(h.replies().length, 2);
});

test('response-created crossing speech start is cancelled and unknown output cannot project', async t => {
  const h = harness(t); await h.start();
  h.engine.providerEvent({ type: 'input_audio_buffer.speech_started', item_id: 'mic' }); h.created();
  assert.equal(h.upstream.filter(event => event.type === 'response.cancel').length, 1);
  h.audio('unowned', 'forged-item');
  h.engine.providerEvent({ type: 'response.audio_transcript.done', response_id: 'unowned', item_id: 'forged-item', output_index: 0, content_index: 0, transcript: 'Unowned content' });
  assert.equal(h.client.some(event => event.type === 'audio' || event.type === 'transcript'), false);
});

test('enabled tool output retains original call ID and continuation still requires a fresh exact ACK', async t => {
  let executed = 0;
  const h = harness(t, { authority: { ...authority, enabledTools: ['search_company_knowledge'] }, executeTool: async call => {
    executed++; return { requestId: call.id, name: 'search_company_knowledge', status: 'available', message: 'Approved fixture fact', citations: [], identityVerified: false, contextMode: 'internal_operator_browser' };
  } });
  await h.start(); h.created();
  const call = { type: 'response.function_call_arguments.done', response_id: 'opening', call_id: 'tool-one', name: 'search_company_knowledge', arguments: '{"query":"fixture"}' };
  h.engine.providerEvent(call); h.engine.providerEvent(call); h.done(); await flush();
  assert.equal(executed, 1); assert.equal(h.replies().length, 1);
  const output = h.upstream.find(event => event.item?.type === 'function_call_output'); assert.equal(output?.item.call_id, 'tool-one');
  await h.ack(); assert.equal(h.replies().length, 2);
});

test('new typed input aborts late tool output and cannot revive its obsolete continuation', async t => {
  let resolve!: (result: VoiceToolResult) => void;
  let signal: AbortSignal | undefined;
  const h = harness(t, { authority: { ...authority, enabledTools: ['recall_customer_context'] }, executeTool: async (_, abort) => { signal = abort; return new Promise(done => { resolve = done; }); } });
  await h.start(); h.created(); h.engine.providerEvent({ type: 'response.function_call_arguments.done', response_id: 'opening', call_id: 'tool-one', name: 'recall_customer_context', arguments: '{}' }); h.done(); await flush();
  h.engine.clientEvent({ type: 'text', text: 'A newer question', requestId: 'newer' }); assert.equal(signal?.aborted, true);
  resolve({ requestId: 'tool-one', name: 'recall_customer_context', status: 'not_available', message: 'Old result', citations: [], identityVerified: false, contextMode: 'internal_operator_browser' }); await flush();
  assert.equal(h.upstream.some(event => event.item?.type === 'function_call_output'), false);
  assert.equal(h.client.filter(event => event.type === 'transcript' && event.entry.role === 'user').length, 1);
  await h.ack(); assert.equal(h.replies().length, 2);
});

test('tool continuation waits for prior browser playout to drain before its configuration and response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = harness(t, { authority: { ...authority, enabledTools: ['recall_customer_context'] }, executeTool: async call => ({ requestId: call.id,
    name: 'recall_customer_context', status: 'not_available', message: 'No approved context', citations: [], identityVerified: false, contextMode: 'internal_operator_browser' }) });
  await h.start(); h.created(); h.audio('opening', 'spoken-before-tool', 24000);
  h.engine.providerEvent({ type: 'response.function_call_arguments.done', response_id: 'opening', call_id: 'tool-one', name: 'recall_customer_context', arguments: '{}' }); h.done(); await flush();
  assert.equal(h.replies().length, 1); assert.equal(h.updates().length, 1, 'provider completion cannot bypass actual playout');
  for (let second = 0; second < 6; second++) { t.mock.timers.tick(1000); await flush(); }
  assert.equal(h.summaries.length, 0, 'legitimate playout wait must not start the five-second provider ACK timeout');
  h.engine.clientEvent({ type: 'played', sessionEpoch: authority.sessionEpoch, responseId: 'opening', items: [{ itemId: 'spoken-before-tool', contentIndex: 0, playedSamples: 12000 }] });
  assert.equal(h.updates().length, 1);
  h.engine.clientEvent({ type: 'played', sessionEpoch: authority.sessionEpoch, responseId: 'opening', items: [{ itemId: 'spoken-before-tool', contentIndex: 0, playedSamples: 24000 }] });
  assert.equal(h.updates().length, 2); assert.equal(h.replies().length, 1);
  await h.ack(); assert.equal(h.replies().length, 2);
  h.created('continuation'); h.audio('continuation', 'next-item');
  assert.deepEqual(h.client.filter(event => event.type === 'audio').map(event => event.responseId), ['opening', 'continuation']);
});

test('tool allowlist, PCM frame limits and stale session epoch fail closed', async t => {
  const tools = harness(t); await tools.start(); tools.created(); tools.engine.providerEvent({ type: 'response.function_call_arguments.done', response_id: 'opening', call_id: 'x', name: 'recall_customer_context', arguments: '{}' }); assert.equal(tools.summaries[0].reason, 'protocol');
  const pcm = harness(t); await pcm.start(); pcm.engine.pcmFrame(new Uint8Array(640)); assert.equal(pcm.upstream.at(-1)!.type, 'input_audio_buffer.append'); pcm.engine.pcmFrame(new Uint8Array(642)); assert.equal(pcm.summaries[0].reason, 'protocol');
  const epoch = harness(t); await epoch.start(); epoch.created(); epoch.engine.clientEvent({ type: 'played', sessionEpoch: 'stale-epoch', responseId: 'opening', items: [] }); assert.equal(epoch.summaries[0].reason, 'protocol');
});

test('revocation at ACK, End during authorization, and repeated close cannot release or finalize twice', async t => {
  let checks = 0;
  const revoked = harness(t, { assertActive: async () => { if (++checks > 1) throw new Error('Revoked'); } }); await revoked.engine.start(); await revoked.ack(); assert.equal(revoked.replies().length, 0); assert.equal(revoked.summaries[0].reason, 'authentication');
  let authorize!: () => void;
  const ended = harness(t, { assertActive: () => new Promise(resolve => { authorize = resolve; }) }); const pending = ended.engine.start(); ended.engine.close(); authorize(); await pending; ended.engine.close('provider');
  assert.equal(ended.upstream.length, 0); assert.equal(ended.closes(), 1); assert.equal(ended.summaries.length, 1);
});

test('configuration and missing interruption receipts time out closed, without fallback', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const setup = harness(t); await setup.engine.start(); t.mock.timers.tick(5000); assert.equal(setup.summaries[0].reason, 'session_update_timeout'); assert.equal(setup.replies().length, 0);
  const cancel = harness(t); await cancel.start(); cancel.created(); cancel.audio(); cancel.engine.providerEvent({ type: 'input_audio_buffer.speech_started', item_id: 'mic' }); cancel.done('opening', 'cancelled');
  t.mock.timers.tick(5000); assert.equal(cancel.summaries[0].reason, 'cancellation_timeout'); assert.equal(cancel.upstream.some(event => event.type === 'conversation.item.truncate'), false);
});

test('shared browser protocol rejects provider messages, unbounded ledgers and client tool/instruction authority', () => {
  for (const event of [{ type: 'response.create' }, { type: 'behavior', instructions: 'Injected' }, { type: 'text', text: 'Hi', requestId: 'x', tools: [] },
    { type: 'interrupt', sessionEpoch: 'epoch', responseId: 'reply', items: Array.from({ length: 101 }, (_, i) => ({ itemId: `item-${i}`, contentIndex: 0, playedSamples: 0 })) }]) assert.throws(() => parseVoiceLiveClientEvent(event));
});
