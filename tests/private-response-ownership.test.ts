import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createPrivateTurnScheduler } from '../lib/voice/private-turn-scheduler';
import { createBrowserVoiceSession } from '../lib/voice/browser-session';
import type { VoiceEvent } from '../lib/voice/contracts';

function harness(t: TestContext) {
  const sent: Record<string, any>[] = [], failures: string[] = [];
  const scheduler = createPrivateTurnScheduler({ instructions: () => 'Approved AI context.', send: event => sent.push(event), onUserTurn() {},
    fail: message => { failures.push(message); scheduler.close(); } });
  t.after(() => scheduler.close());
  const final = (response_id: unknown, item_id = 'item') => scheduler.receive({ type: 'response.output_audio_transcript.done', response_id, item_id, transcript: 'Identical synthetic content.' });
  const ack = () => scheduler.receive({ type: 'session.updated', session: sent.filter(event => event.type === 'session.update').at(-1)!.session });
  const replies = () => sent.filter(event => event.type === 'response.create');
  return { scheduler, final, ack, replies, failures };
}

test('opening issuance is one-shot before, during, and after the accepted response', t => {
  const h = harness(t);
  h.scheduler.opening({ type: 'response.create' }); h.scheduler.opening({ type: 'response.create' });
  h.scheduler.responseCreated('opening'); h.scheduler.opening({ type: 'response.create' });
  h.scheduler.responseDone('opening', false); h.scheduler.opening({ type: 'response.create' });
  assert.equal(h.replies().length, 1); assert.deepEqual(h.failures, []);
  h.scheduler.close(); h.scheduler.opening({ type: 'response.create' }); assert.equal(h.replies().length, 1);
});

test('assistant finals require accepted response ownership, even with matching item and text', t => {
  const h = harness(t); h.scheduler.opening({ type: 'response.create' });
  assert.equal(h.final('opening'), true, 'a final before response.created is not owned');
  h.scheduler.responseCreated('opening');
  assert.equal(h.final('opening'), false);
  for (const id of [undefined, '', 'unknown-history', 1]) assert.equal(h.final(id), true);
  assert.deepEqual(h.failures, [], 'unowned finals do not terminate the legitimate response');
});

for (const status of ['completed', 'cancelled']) test(`owned multi-item finals survive ${status} completion and newer response ordering`, t => {
  const h = harness(t); h.scheduler.opening({ type: 'response.create' }); h.scheduler.responseCreated('opening');
  assert.equal(h.final('opening', 'first-item'), false);
  h.scheduler.responseDone('opening', false, status);
  h.scheduler.sendText('A new question'); h.ack(); h.scheduler.responseCreated('next');
  assert.equal(h.final('opening', 'second-item'), false, 'late items retain their original owned response');
  assert.equal(h.final('next', 'new-item'), false);
  assert.equal(h.final('unknown-history', 'first-item'), true);
  h.scheduler.close(); assert.equal(h.final('opening', 'third-item'), true);
});

test('tool continuation has separate accepted ownership while original late finals remain valid', t => {
  const h = harness(t); h.scheduler.opening({ type: 'response.create' }); h.scheduler.responseCreated('tool-response');
  const generation = h.scheduler.responseDone('tool-response', true)!;
  h.scheduler.toolsDone(generation); h.ack();
  assert.equal(h.final('continuation'), true);
  h.scheduler.responseCreated('continuation');
  assert.equal(h.final('continuation'), false); assert.equal(h.final('tool-response'), false);
  assert.equal(h.replies().length, 2); assert.deepEqual(h.failures, []);
});

test('response ownership history remains bounded and fails before another response is issued', t => {
  const h = harness(t); h.scheduler.opening({ type: 'response.create' }); h.scheduler.responseCreated('response-0'); h.scheduler.responseDone('response-0', false);
  for (let index = 1; index < 450; index++) {
    h.scheduler.sendText('A bounded synthetic question'); h.ack(); h.scheduler.responseCreated(`response-${index}`); h.scheduler.responseDone(`response-${index}`, false);
  }
  assert.equal(h.final('response-0'), false, 'retain old owned IDs instead of evicting their late finals');
  h.scheduler.sendText('One beyond the bounded history'); h.ack();
  assert.equal(h.replies().length, 450); assert.equal(h.failures.length, 1); assert.match(h.failures[0], /response limit/);
  assert.equal(h.final('response-0'), true, 'close clears response ownership');
});

for (const provider of ['azure', 'openai']) test(`${provider} browser opens once and projects only owned assistant finals without text deduplication`, async t => {
  const names = ['window', 'RTCPeerConnection', 'Audio', 'fetch'] as const;
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const sent: Record<string, any>[] = [], events: VoiceEvent[] = [], failures: string[] = [];
  let connected = 0;
  const channel = { readyState: 'connecting', onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null, onclose: null, onerror: null,
    send(raw: string) { sent.push(JSON.parse(raw)); }, close() { this.readyState = 'closed'; } };
  class Peer {
    ontrack = null; onconnectionstatechange = null;
    addTransceiver() {} close() {}
    createDataChannel() { return channel; }
    async createOffer() { return { sdp: 'v=0\r\nm=audio' }; }
    async setLocalDescription() {}
    async setRemoteDescription() { channel.readyState = 'open'; channel.onopen?.(); channel.onopen?.(); }
  }
  const globals = { window: { isSecureContext: true }, RTCPeerConnection: Peer,
    Audio: class { autoplay = false; srcObject = null; pause() {} },
    fetch: async (url: string) => url === '/api/voice/control' ? Response.json({ state: 'closed' }) : Response.json({ provider, transport: 'webrtc', sdp: 'v=0\r\nm=audio', initialInstructions: 'Approved AI context' }) };
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
  const session = createBrowserVoiceSession({ provider, inputMode: 'text', onConnected() { connected++; }, onEvent: event => events.push(event), onFailure: message => failures.push(message) });
  t.after(async () => {
    session.close(); await new Promise<void>(resolve => setImmediate(resolve));
    for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name);
  });
  const emit = (event: object) => channel.onmessage?.({ data: JSON.stringify(event) });
  const final = (response_id: unknown, item_id: string) => emit({ type: 'response.output_audio_transcript.done', response_id, item_id, transcript: 'Identical synthetic content.' });
  const transcripts = () => events.filter((event): event is Extract<VoiceEvent, { type: 'transcript' }> => event.type === 'transcript');
  await session.connect();
  assert.equal(connected, 1); assert.equal(sent.filter(event => event.type === 'response.create').length, 1);
  final('opening', 'item-1'); assert.equal(transcripts().length, 0);
  emit({ type: 'response.created', response: { id: 'opening' } });
  final('opening', 'item-1'); final('unknown-history', 'item-1'); final(undefined, 'item-2');
  assert.equal(transcripts().length, 1);
  emit({ type: 'response.done', response: { id: 'opening', status: 'completed' } });
  channel.onopen?.(); assert.equal(connected, 1); assert.equal(sent.filter(event => event.type === 'response.create').length, 1);
  final('opening', 'item-2');
  assert.equal(transcripts().length, 2); assert.equal(transcripts()[0].entry.text, transcripts()[1].entry.text);
  assert.notEqual(transcripts()[0].entry.id, transcripts()[1].entry.id, 'legitimate identical multi-item output is preserved');
  assert.deepEqual(failures, []);
  session.close(); final('opening', 'item-3'); assert.equal(transcripts().length, 2);
});
