import test from 'node:test';
import assert from 'node:assert/strict';
import { connectPublicVoice, PUBLIC_VOICE_MAX_QUEUED_SECONDS, type PublicVoiceEvent } from '../lib/public-agent/browser';

type Sent = Record<string, unknown>;

class FakeSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  startedAt: number | undefined;
  stopped = false;
  throwOnStart = false;
  connect() { return this; }
  start(when?: number) { if (this.throwOnStart) throw new Error('synthetic schedule failure'); this.startedAt = when; }
  stop() { this.stopped = true; }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  now = 0;
  clockStep = 0;
  durationOverride: number | undefined;
  throwOnNextStart = false;
  closed = false;
  reads = 0;
  sources: FakeSource[] = [];
  destination = {} as AudioDestinationNode;
  constructor() { FakeAudioContext.instances.push(this); }
  get currentTime() { const value = this.now; this.now += this.clockStep; this.reads += 1; return value; }
  async resume() {}
  async close() { this.closed = true; }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return { duration: this.durationOverride ?? length / sampleRate, getChannelData: () => data } as unknown as AudioBuffer;
  }
  createBufferSource() {
    const source = new FakeSource(); source.throwOnStart = this.throwOnNextStart; this.throwOnNextStart = false; this.sources.push(source); return source as unknown as AudioBufferSourceNode;
  }
}

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.OPEN;
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Sent[] = [];
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = FakeWebSocket.CLOSED; }
  open() { this.onopen?.(); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}

const pcm = (samples = 2400) => Buffer.alloc(samples * 2).toString('base64');
const audioMessage = (responseId: string, itemId: string, audio = pcm()) => ({ type: 'audio', responseId, itemId, audio });

async function harness() {
  const audioDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const socketDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'WebSocket');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeAudioContext });
  Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: FakeWebSocket });
  FakeAudioContext.instances = []; FakeWebSocket.instances = [];
  const events: PublicVoiceEvent[] = [];
  const client = await connectPublicVoice({ url: 'wss://voice.example.test', token: 'bounded-token', nonce: 'bounded-nonce', microphone: false, onEvent: event => events.push(event) });
  const audio = FakeAudioContext.instances[0], socket = FakeWebSocket.instances[0];
  socket.open(); socket.receive({ type: 'ready' });
  return {
    audio, socket, events, client,
    restore() {
      client.stop();
      if (audioDescriptor) Object.defineProperty(globalThis, 'AudioContext', audioDescriptor); else delete (globalThis as { AudioContext?: unknown }).AudioContext;
      if (socketDescriptor) Object.defineProperty(globalThis, 'WebSocket', socketDescriptor); else delete (globalThis as { WebSocket?: unknown }).WebSocket;
    },
  };
}

test('browser playback uses one clock snapshot and continues after a typed-reply interruption', async () => {
  const h = await harness();
  try {
    h.audio.clockStep = 0.02;
    h.socket.receive(audioMessage('response-1', 'item-1'));
    assert.equal(h.audio.sources.length, 1);
    assert.equal(h.events.some(event => event.type === 'ended'), false);

    h.client.sendText('Continue with the next answer');
    assert.deepEqual(h.socket.sent.slice(-2).map(message => message.type), ['interrupt', 'text']);
    h.socket.receive(audioMessage('response-1', 'late-item'));
    assert.equal(h.audio.sources.length, 1, 'late audio from the interrupted response stays suppressed');
    h.socket.receive(audioMessage('response-2', 'item-2'));

    assert.equal(h.audio.sources.length, 2);
    assert.equal(h.events.some(event => event.type === 'ended'), false);
    assert.equal(h.socket.readyState, FakeWebSocket.OPEN);
  } finally { h.restore(); }
});

test('empty PCM is an inaudible no-op while malformed PCM ends with a bounded diagnostic', async () => {
  const empty = await harness();
  try {
    empty.socket.receive(audioMessage('response-1', 'item-1', ''));
    assert.equal(empty.audio.sources.length, 0);
    assert.equal(empty.events.some(event => event.type === 'ended'), false);
  } finally { empty.restore(); }

  const malformed = await harness();
  try {
    malformed.socket.receive(audioMessage('response-1', 'item-1', Buffer.from([1]).toString('base64')));
    assert.deepEqual(malformed.events.at(-1), { type: 'ended', message: 'Audio playback was interrupted. Please use text chat.', diagnosticCode: 'invalid_pcm' });
    assert.equal(malformed.audio.closed, true);
    assert.equal(malformed.socket.readyState, FakeWebSocket.CLOSED);
  } finally { malformed.restore(); }
});

test('playback failures expose only bounded binding, queue and clock diagnostics', async () => {
  const originalWarn = console.warn, warnings: unknown[][] = [];
  console.warn = (...values: unknown[]) => { warnings.push(values); };
  try {
    for (const failure of ['binding', 'queue', 'clock'] as const) {
      const h = await harness();
      try {
        if (failure === 'binding') h.socket.receive(audioMessage('response-1', '', pcm(1)));
        if (failure === 'queue') {
          h.audio.durationOverride = 23.4;
          h.socket.receive(audioMessage('response-1', 'item-1', pcm(1)));
          h.audio.durationOverride = 0.1;
          h.socket.receive(audioMessage('response-1', 'item-1', pcm(1)));
          assert.equal(h.audio.sources.length, 2, 'a 23.5-second queued reply remains within the browser bound');
          h.audio.durationOverride = PUBLIC_VOICE_MAX_QUEUED_SECONDS - 23;
          h.socket.receive(audioMessage('response-1', 'item-1', pcm(1)));
        }
        if (failure === 'clock') {
          h.audio.throwOnNextStart = true;
          h.socket.receive(audioMessage('response-1', 'item-1', pcm(1)));
        }
        const expected = failure === 'binding' ? 'invalid_binding' : failure === 'queue' ? 'queue_full' : 'clock_schedule';
        const ended = h.events.find(event => event.type === 'ended');
        assert.equal(ended?.diagnosticCode, expected);
        assert.deepEqual(Object.keys(ended || {}).sort(), ['diagnosticCode', 'message', 'type']);
        assert.deepEqual(warnings.at(-1), ['Public voice playback ended', expected]);
      } finally { h.restore(); }
    }
  } finally { console.warn = originalWarn; }
});

test('interrupt reports only elapsed scheduled audio and stop releases playback resources', async () => {
  const h = await harness();
  try {
    h.audio.now = 4;
    h.socket.receive(audioMessage('response-1', 'item-1'));
    h.audio.now = 4.065;
    h.client.interrupt();
    const interruption = h.socket.sent.at(-1);
    assert.deepEqual(interruption, { type: 'interrupt', itemId: 'item-1', playedMs: 50 });
    assert.equal(h.audio.sources[0].stopped, true);

    h.client.stop();
    assert.equal(h.audio.closed, true);
    assert.equal(h.socket.readyState, FakeWebSocket.CLOSED);
  } finally { h.restore(); }
});
