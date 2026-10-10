import assert from 'node:assert/strict';
import test from 'node:test';
import { loadVoiceConfiguration } from '../lib/voice/config-browser';

type Timer = ReturnType<typeof setTimeout>;

test('voice configuration timeout aborts a stalled request and returns a recoverable message', async () => {
  let timeout!: () => void;
  let requestSignal: AbortSignal | null | undefined;
  let cleared = 0;
  const controller = new AbortController();
  const loading = loadVoiceConfiguration('/api/voice/config', {
    signal: controller.signal,
    timeoutMs: 25,
    request: async (_url, init) => {
      requestSignal = init?.signal;
      return new Promise<Response>(() => undefined);
    },
    schedule: callback => { timeout = callback; return 1 as unknown as Timer; },
    cancel: () => { cleared += 1; },
  });
  timeout();
  await assert.rejects(loading, /Voice settings took too long to respond\. Check your connection and try again\./);
  assert.equal(requestSignal?.aborted, true);
  assert.equal(controller.signal.aborted, false, 'the component-owned signal remains reusable until its effect is superseded');
  assert.equal(cleared, 1);
});

test('a superseded request cannot return a late configuration over the current result', async () => {
  const resolvers: Array<(response: Response) => void> = [];
  const requestSignals: AbortSignal[] = [];
  let nextTimer = 0;
  const request = async (_url: RequestInfo | URL, init?: RequestInit) => {
    requestSignals.push(init?.signal as AbortSignal);
    return new Promise<Response>(resolve => { resolvers.push(resolve); });
  };
  const firstController = new AbortController();
  const secondController = new AbortController();
  const timerOptions = {
    timeoutMs: 1_000,
    schedule: (() => ++nextTimer as unknown as Timer),
    cancel: () => undefined,
  };
  const first = loadVoiceConfiguration('/api/voice/config?profile=old', { signal: firstController.signal, request, ...timerOptions });
  const second = loadVoiceConfiguration('/api/voice/config?profile=current', { signal: secondController.signal, request, ...timerOptions });
  firstController.abort();
  await assert.rejects(first, error => error instanceof DOMException && error.name === 'AbortError');
  resolvers[1](Response.json({ configured: true, provider: 'azure', capabilities: {
    browserAudio: true, transcription: true, interruption: true, toolExecution: true, telephony: false, liveHumanTransfer: false,
  } }));
  const current = await second;
  resolvers[0](Response.json({ configured: true, provider: 'openai', capabilities: {
    browserAudio: true, transcription: true, interruption: true, toolExecution: false, telephony: false, liveHumanTransfer: false,
  } }));
  await Promise.resolve();
  assert.equal(current.provider, 'azure');
  assert.equal(requestSignals[0].aborted, true);
  assert.equal(requestSignals[1].aborted, false);
});

test('a synchronous request failure still clears its timeout boundary', async () => {
  let cleared = 0;
  const controller = new AbortController();
  await assert.rejects(loadVoiceConfiguration('/api/voice/config', {
    signal: controller.signal,
    request: (() => { throw new Error('synthetic transport failure'); }) as typeof fetch,
    schedule: () => 1 as unknown as Timer,
    cancel: () => { cleared += 1; },
  }), /Could not load voice settings\. Check your connection and try again\./);
  assert.equal(cleared, 1);
  assert.equal(controller.signal.aborted, false);
});
