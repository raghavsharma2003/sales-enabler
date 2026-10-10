import assert from 'node:assert/strict';
import test from 'node:test';
import { compileTaxilaSpeech, TAXILA_SPEECH_PRESETS } from '../lib/voice/taxila-speech';

test('Taxila preset contracts retain exact pinned HD voices and normal base rate', () => {
  assert.deepEqual(TAXILA_SPEECH_PRESETS.map(p => [p.id, p.voice, p.baseRate]), [
    ['taxila-diya', 'en-IN-Diya:DragonHDLatestNeural', 0], ['taxila-arjun', 'en-IN-Arjun:DragonHDLatestNeural', 0],
  ]);
  for (const preset of TAXILA_SPEECH_PRESETS) {
    const ssml = compileTaxilaSpeech(preset.id, 'Hello.');
    assert.ok(ssml.includes(`name="${preset.voice}"`)); assert.ok(ssml.includes('rate="+0%"')); assert.ok(ssml.includes('xml:lang="en-IN"'));
  }
});

test('compiler preserves source words, brackets, numbers, punctuation and whitespace with XML escaping only', () => {
  const text = '  [softly] 12.5% & "A" <break/> *pause*\nSamjho, हिंदी भाषा, ठीक है। 2026!  ';
  const ssml = compileTaxilaSpeech('taxila-diya', text);
  assert.match(ssml, /<lang xml:lang="hi-IN">हिंदी भाषा, ठीक है।<\/lang>/);
  const body = ssml.split('<prosody rate="+0%">')[1].split('</prosody>')[0];
  const recovered = body.replace(/<lang xml:lang="hi-IN">|<\/lang>/g, '').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  assert.equal(recovered, text);
  assert.equal(ssml.includes('<break/>'), false); assert.equal(ssml.includes('[softly]'), true);
});

test('unknown voice, long input, empty text and malformed XML characters fail without substitution', () => {
  assert.throws(() => compileTaxilaSpeech('swara' as never, 'Hello'), /Unsupported/);
  for (const input of ['', '   ', 'x'.repeat(281), '\0hi', '\uD800', '\uFFFF']) assert.throws(() => compileTaxilaSpeech('taxila-arjun', input));
  assert.ok(compileTaxilaSpeech('taxila-arjun', 'x'.repeat(280)));
});
