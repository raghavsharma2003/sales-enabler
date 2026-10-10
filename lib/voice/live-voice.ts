import { taxilaSpeechPreset, type TaxilaSpeechPresetId, TAXILA_SPEECH_PRESETS } from './taxila-speech';

/** Engine selection is explicit and versioned; neither engine is a fallback. */
export type LiveVoiceProfile = Readonly<
  { version: 1; engine: 'azure-openai-realtime'; preset: 'provider-default' }
  | { version: 1; engine: 'azure-voice-live'; preset: TaxilaSpeechPresetId }
>;

export type AzureVoiceLiveVoice = Readonly<{
  type: 'azure-standard';
  name: typeof TAXILA_SPEECH_PRESETS[number]['voice'];
}>;

export const LIVE_VOICE_PUBLICATION_BLOCKER = 'Azure Voice Live is available for private tests only. Choose the workspace voice to publish this agent.';

export class LiveVoiceValidationError extends Error {
  constructor() {
    super('Invalid live voice configuration.');
    this.name = 'LiveVoiceValidationError';
  }
}

/** Omission is preserved for legacy JSON/hash compatibility; no input coercion. */
export function parseLiveVoiceProfile(value: unknown): LiveVoiceProfile | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LiveVoiceValidationError();
  const candidate = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(candidate);
  if (keys.length !== 3 || keys.some(key => typeof key !== 'string' || !['version', 'engine', 'preset'].includes(key)) || candidate.version !== 1) throw new LiveVoiceValidationError();
  if (candidate.engine === 'azure-openai-realtime' && candidate.preset === 'provider-default') {
    return Object.freeze({ version: 1, engine: 'azure-openai-realtime', preset: 'provider-default' });
  }
  const preset = taxilaSpeechPreset(candidate.preset);
  if (candidate.engine === 'azure-voice-live' && preset) {
    return Object.freeze({ version: 1, engine: 'azure-voice-live', preset: preset.id });
  }
  throw new LiveVoiceValidationError();
}

/** Effective default only; do not insert this into absent legacy snapshots. */
export function resolveLiveVoiceProfile(profile?: LiveVoiceProfile): LiveVoiceProfile {
  return parseLiveVoiceProfile(profile) ?? Object.freeze({ version: 1, engine: 'azure-openai-realtime', preset: 'provider-default' });
}

/** Exact standard HD voice, never the distinct native voice named `diya`. */
export function resolveAzureVoiceLiveVoice(profile?: LiveVoiceProfile): AzureVoiceLiveVoice | undefined {
  const resolved = resolveLiveVoiceProfile(profile);
  if (resolved.engine !== 'azure-voice-live') return undefined;
  return Object.freeze({ type: 'azure-standard', name: taxilaSpeechPreset(resolved.preset)!.voice });
}
