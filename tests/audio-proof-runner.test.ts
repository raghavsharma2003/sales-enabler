import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { pcm24ToWave, runAzureRealtimeAudioProof } from '../lib/evaluations/audio-runner';

class FakeSocket extends EventEmitter {
  events: Record<string, unknown>[] = [];
  appends = 0;
  constructor() { super(); queueMicrotask(() => this.emit('open')); }
  send(raw: string) {
    const event = JSON.parse(raw) as Record<string, any>; this.events.push(event);
    if (event.type === 'session.update' && !this.events.some(item => item.type === 'input_audio_buffer.append')) {
      queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({ type: 'session.updated' })), false));
    } else if (event.type === 'input_audio_buffer.append') {
      this.appends++;
      if (this.appends === 13) queueMicrotask(() => {
        for (const providerEvent of [
          { type: 'input_audio_buffer.speech_started' }, { type: 'input_audio_buffer.speech_stopped' }, { type: 'input_audio_buffer.committed' },
          { type: 'conversation.item.input_audio_transcription.completed', transcript: "I'm feeling overwhelmed. Please explain the next step slowly, one point at a time." },
        ]) this.emit('message', Buffer.from(JSON.stringify(providerEvent)), false);
      });
    } else if (event.type === 'session.update') {
      queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({ type: 'session.updated' })), false));
    } else if (event.type === 'response.create') {
      queueMicrotask(() => {
        for (const providerEvent of [
          { type: 'response.created' },
          { type: 'response.output_audio.delta', delta: Buffer.alloc(4_800, 2).toString('base64') },
          { type: 'response.output_audio_transcript.done', transcript: 'I can help. Start with one small step.' },
          { type: 'response.done', response: { status: 'completed' } },
        ]) this.emit('message', Buffer.from(JSON.stringify(providerEvent)), false);
      });
    }
  }
  close() { queueMicrotask(() => this.emit('close')); }
  terminate() { queueMicrotask(() => this.emit('close')); }
}

class MidCloseSocket extends EventEmitter {
  events: Record<string, unknown>[] = [];
  appends = 0;
  sendsAfterClose = 0;
  closed = false;
  constructor() { super(); queueMicrotask(() => this.emit('open')); }
  send(raw: string) {
    if (this.closed) { this.sendsAfterClose++; throw new Error('send after close'); }
    const event = JSON.parse(raw) as Record<string, unknown>; this.events.push(event);
    if (event.type === 'session.update') queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({ type: 'session.updated' })), false));
    if (event.type === 'input_audio_buffer.append') {
      this.appends++;
      if (this.appends === 1) queueMicrotask(() => {
        this.closed = true;
        this.emit('close');
        // Late provider callbacks must be ignored and cannot restart output.
        this.emit('message', Buffer.from(JSON.stringify({ type: 'session.updated' })), false);
        this.emit('message', Buffer.from(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'late transcript' })), false);
        this.emit('close');
      });
    }
  }
  close() { if (!this.closed) { this.closed = true; queueMicrotask(() => this.emit('close')); } }
  terminate() { this.close(); }
}

test('bounded runner uses one socket, exact shared session, synthetic ASR and captured output', async () => {
  let sockets = 0, clock = 0; let fake: FakeSocket | undefined;
  const session = { type: 'realtime', model: 'slot', instructions: 'base instructions', output_modalities: ['audio'], audio: { input: { transcription: { model: 'gpt-4o-mini-transcribe' }, turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: false, interrupt_response: true } }, output: { voice: 'marin' } }, tools: [] };
  const result = await runAzureRealtimeAudioProof({ wave: pcm24ToWave(Buffer.alloc(12_000, 1)), session, settings: { primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Warm' },
    expectedCallerText: 'fixture', endpoint: 'https://fictional.openai.azure.com', apiKey: 'fake', model: 'slot' }, {
    socket: () => { sockets++; return fake = new FakeSocket() as never; }, wait: async () => undefined, now: () => clock += 10,
  });
  assert.equal(sockets, 1); assert.equal(result.status, 'complete'); assert.equal(result.recognizedCallerText.includes('overwhelmed'), true);
  assert.equal(result.outputWave?.subarray(0, 4).toString(), 'RIFF'); assert.equal(result.outputDurationMs, 100);
  assert.equal(fake?.events.filter(event => event.type === 'response.create').length, 1);
  assert.equal(fake?.events.some(event => event.type === 'input_audio_buffer.commit'), false, 'server VAD owns commit as in the live route');
  const updates = fake?.events.filter(event => event.type === 'session.update') as Array<Record<string, any>>;
  assert.deepEqual(updates[0].session.tools, []); assert.match(updates[1].session.instructions, /CURRENT-CALL RELATIONAL BEHAVIOR/);
  assert.match(updates[1].session.instructions, /No tools, memory writes, business actions/);
  assert.equal(result.trace.some(item => item.kind === 'first_server_audio'), true);
  assert.equal(result.runtimePolicyDigest?.length, 64);
});

test('mid-stream socket close cancels paced input and ignores late callbacks', async () => {
  let fake: MidCloseSocket | undefined, clock = 0;
  const session = { type: 'realtime', model: 'slot', instructions: 'base instructions', output_modalities: ['audio'], audio: { input: { transcription: { model: 'gpt-4o-mini-transcribe' }, turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: false, interrupt_response: true } }, output: { voice: 'marin' } }, tools: [] };
  const result = await runAzureRealtimeAudioProof({ wave: pcm24ToWave(Buffer.alloc(12_000, 1)), session, settings: { primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Warm' },
    expectedCallerText: 'fixture', endpoint: 'https://fictional.openai.azure.com', apiKey: 'fake', model: 'slot' }, {
    socket: () => fake = new MidCloseSocket() as never,
    wait: async () => { await Promise.resolve(); },
    now: () => clock += 10,
  });
  assert.equal(result.status, 'uncertain'); assert.equal(result.providerClosed, true);
  assert.equal(fake?.appends, 1); assert.equal(fake?.sendsAfterClose, 0);
  assert.equal(fake?.events.some(event => event.type === 'response.create'), false);
  assert.equal(result.trace.filter(item => item.kind === 'socket_closed').length, 1);
  assert.equal(result.trace.some(item => item.kind === 'input_audio_finished'), false);
});
