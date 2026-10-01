import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const extensions = require.extensions as NodeJS.RequireExtensions;
extensions['.css'] = (module) => {
  module.exports = new Proxy({}, { get: (_target, property) => property === '__esModule' ? false : String(property) });
};
const { PublicVoiceEvidence } = require('../components/public-voice-evidence') as typeof import('../components/public-voice-evidence');

const evidence = {
  version: 1 as const,
  serverCaptured: true as const,
  capture: 'best_effort' as const,
  basis: 'server_transport' as const,
  metric: 'requested_to_first_server_audio_ms' as const,
  turns: [{
    turn: 'turn1' as const,
    requestedAtMs: 10,
    providerCreatedAtMs: 14,
    firstServerAudioAtMs: 31,
    terminalAtMs: 58,
    requestedToFirstServerAudioMs: 21,
    status: 'completed' as const,
    cancelRequested: false,
    cancelled: false,
    audioBytes: 480,
    tokenUsage: { totalTokens: 17, outputAudioTokens: 6 },
  }],
};

const render = (source: unknown, value: unknown) => renderToStaticMarkup(createElement(PublicVoiceEvidence, { source, evidence: value }));

test('renders the exact server-transport metric and bounded capture coverage', () => {
  const html = render('public_voice', evidence);
  assert.match(html, /Server voice evidence/);
  assert.match(html, /Request → first server audio/);
  assert.match(html, /21 ms/);
  assert.match(html, /requesting a provider response to accepting its first nonempty audio bytes/);
  assert.match(html, /1 turn of 1 recorded turn/);
  assert.match(html, /Coverage is best-effort and may be partial/);
  assert.match(html, /480 bytes/);
  assert.match(html, /17 total tokens/);
});

test('shows one neutral not-captured state for absent or invalid evidence without echoing payload data', () => {
  const absent = render('public_voice', undefined);
  const invalid = render('public_voice', { ...evidence, providerPayload: 'secret-provider-id' });
  for (const html of [absent, invalid]) {
    assert.match(html, /Server voice evidence not captured/);
    assert.match(html, /Missing measurements are unknown and are not treated as zero/);
  }
  assert.doesNotMatch(invalid, /secret-provider-id|forged|tampered/i);
});

test('an empty best-effort envelope does not turn missing observations into zero-valued metrics', () => {
  const html = render('public_voice', { ...evidence, turns: [] });
  assert.match(html, /No response turns recorded/);
  assert.match(html, /contains no recorded response turns/);
  assert.doesNotMatch(html, /0 requested|0 recorded turn|0 ms|0 tokens/);
});

test('keeps cancellation requests separate from provider-confirmed cancellation', () => {
  const html = render('public_voice', {
    ...evidence,
    turns: [
      { turn: 'turn1', requestedAtMs: 5, cancelRequested: true, cancelRequestedAtMs: 9, cancelled: false, audioBytes: 0 },
      { turn: 'turn2', requestedAtMs: 12, terminalAtMs: 18, status: 'cancelled', cancelRequested: true, cancelRequestedAtMs: 14, cancelled: true, audioBytes: 0 },
    ],
  });
  assert.match(html, /Requested; not provider-confirmed/);
  assert.match(html, /Requested; provider confirmed/);
  assert.match(html, /2 requested · 1 provider-confirmed/);
  assert.match(html, /Provider-reported usage was not captured/);
  assert.doesNotMatch(html, />0 tokens</);
});

test('does not render server voice evidence for non-voice public or browser sessions', () => {
  assert.equal(render('public_chat', evidence), '');
  assert.equal(render('browser_voice', evidence), '');
  assert.equal(render(undefined, evidence), '');
});
