/** User-owned Taxila source, pinned at 00aab4bdcc787050e65703dd4bb428ce3d9b8679.
 * server/voice/voices.js:29–32 (Diya/Arjun, baseRate 0)
 * server/voice/expressive/compile/dhd.js:17–21 (escapeXml, langRuns)
 * server/voice/voice-switch.js:95–100 (en-IN SSML envelope).
 * https://github.com/raghavsharma2003/Taxila/tree/00aab4bdcc787050e65703dd4bb428ce3d9b8679
 * Narrow attributed reuse; no claim about a third-party distribution license.
 */
export const TAXILA_SOURCE_REVISION = '00aab4bdcc787050e65703dd4bb428ce3d9b8679';
export const TAXILA_COMPILER_REVISION = 'taxila-safe-ssml-v1';
export const TAXILA_MAX_TEXT_CHARACTERS = 280;
export const TAXILA_SPEECH_PRESETS = [
  { id: 'taxila-diya', label: 'Diya · Taxila Asha', voice: 'en-IN-Diya:DragonHDLatestNeural', baseRate: 0 },
  { id: 'taxila-arjun', label: 'Arjun · Taxila', voice: 'en-IN-Arjun:DragonHDLatestNeural', baseRate: 0 },
] as const;
export type TaxilaSpeechPresetId = typeof TAXILA_SPEECH_PRESETS[number]['id'];
export function taxilaSpeechPreset(value: unknown) {
  return TAXILA_SPEECH_PRESETS.find(preset => preset.id === value);
}
export function escapeTaxilaXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function compileTaxilaSpeech(presetId: TaxilaSpeechPresetId, text: string): string {
  const preset = taxilaSpeechPreset(presetId);
  if (!preset) throw new Error('Unsupported Taxila speech preset.');
  // Validation rejects malformed XML characters; it never rewrites source words.
  if (typeof text !== 'string' || !text.trim() || text.length > TAXILA_MAX_TEXT_CHARACTERS || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(text) || !text.isWellFormed())
    throw new Error(`Speech text must contain 1–${TAXILA_MAX_TEXT_CHARACTERS} valid characters.`);
  const runs = escapeTaxilaXml(text).replace(/[ऀ-ॣ०-ॿ]+(?:[\s,]+[ऀ-ॣ०-ॿ]+)*[।॥]?/g, run => `<lang xml:lang="hi-IN">${run}</lang>`);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-IN"><voice name="${escapeTaxilaXml(preset.voice)}"><prosody rate="+0%">${runs}</prosody></voice></speak>`;
}
