// Server-side Azure Voice Live session contract. Credentials and raw provider
// payloads must never cross this module's consumers into browser-visible data.
import { createHash } from 'node:crypto';
import type { LiveVoiceProfile } from './live-voice';
import { resolveAzureVoiceLiveVoice } from './live-voice';
import { compileSpeechVocabularyPrompt } from './speech-vocabulary';
import { resolveSpeechDelivery, type SpeechDeliveryDecision, type SpeechDeliveryProfile } from './speech-delivery';
import { voiceToolDefinitions, type VoiceToolName } from './tools/contracts';

export const VOICE_LIVE_API_VERSION = '2026-04-10';
export const VOICE_LIVE_MODEL = 'gpt-realtime-2.1-mini';
/** Observed configuration-only on the approved East US 2 resource, 2026-10-10. */
export const VOICE_LIVE_ACK_MODEL = 'gpt-realtime-2.1-mini-global-standard';
export const VOICE_LIVE_SETUP_TIMEOUT_MS = 15_000;
export const VOICE_LIVE_MAX_DURATION_SECONDS = 600;
export const VOICE_LIVE_OUTPUT_SAMPLE_RATE = 24_000;
/** Configuration-only sequential updates retained the initial rate on the
 * approved resource. Rate is fixed for one Voice Live session. */
export const VOICE_LIVE_DYNAMIC_RATE_SUPPORTED = false;

type VoiceLiveProfile = Extract<LiveVoiceProfile, { engine: 'azure-voice-live' }>;
type VoiceLiveRate = '1' | '0.9';
type RecordValue = Record<string, unknown>;
type VoiceLiveFunctionTool = ReturnType<typeof voiceToolDefinitions>[number] & { type: 'function' };

export type VoiceLiveSession = {
  model: typeof VOICE_LIVE_MODEL;
  modalities: ['text', 'audio'];
  instructions: string;
  voice: { type: 'azure-standard'; name: string; rate: VoiceLiveRate };
  input_audio_sampling_rate: 16_000;
  input_audio_format: 'pcm16';
  output_audio_format: 'pcm16';
  input_audio_transcription: { model: 'gpt-4o-mini-transcribe'; prompt?: string };
  turn_detection: {
    type: 'azure_semantic_vad_multilingual'; threshold: 0.5; prefix_padding_ms: 420;
    silence_duration_ms: 500; speech_duration_ms: 80; remove_filler_words: false;
    create_response: false; interrupt_response: false; auto_truncate: false;
  };
  tools: VoiceLiveFunctionTool[];
  tool_choice: 'auto' | 'none';
  max_response_output_tokens: 2048;
  output_audio_timestamp_types: ['word'];
};
export type VoiceLiveSessionUpdate = { type: 'session.update'; session: VoiceLiveSession };

export type AzureVoiceLiveConfiguration = Readonly<{
  url: string; apiKey: string; apiKeyHeader: 'api-key'; model: typeof VOICE_LIVE_MODEL;
  apiVersion: typeof VOICE_LIVE_API_VERSION; setupTimeoutMs: typeof VOICE_LIVE_SETUP_TIMEOUT_MS;
  maxDurationSeconds: typeof VOICE_LIVE_MAX_DURATION_SECONDS; providerConfigurationDigest: string;
}>;

function record(value: unknown): RecordValue | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
}
function speechRate(value?: SpeechDeliveryProfile | SpeechDeliveryDecision): VoiceLiveRate {
  if (!value) return '1';
  const speed = 'speed' in value ? value.speed : resolveSpeechDelivery(value, []).speed;
  if (speed === 1) return '1';
  if (speed === 0.9) return '0.9';
  throw new Error('Unsupported Voice Live speech rate.');
}

/** Resolve one configured Foundry resource origin. No browser or ticket may supply it. */
export function azureVoiceLiveConfiguration(env: Record<string, string | undefined> = process.env): AzureVoiceLiveConfiguration {
  const raw = env.AZURE_VOICE_LIVE_ENDPOINT?.trim() || env.AZURE_FOUNDRY_PROJECT_ENDPOINT?.trim() || '';
  let origin: string;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash ||
        !/^[a-z0-9][a-z0-9.-]*\.(?:services\.ai\.azure\.com|cognitiveservices\.azure\.com)$/i.test(parsed.hostname)) throw new Error();
    origin = parsed.origin;
  } catch { throw new Error('Azure Voice Live endpoint is unavailable.'); }
  const apiKey = env.AZURE_SPEECH_KEY?.trim() || '';
  if (apiKey.length < 20 || apiKey.includes('REPLACE_WITH')) throw new Error('Azure Voice Live credential is unavailable.');
  const url = new URL('/voice-live/realtime', origin);
  url.searchParams.set('api-version', VOICE_LIVE_API_VERSION);
  url.searchParams.set('model', VOICE_LIVE_MODEL);
  const providerConfigurationDigest = createHash('sha256').update(JSON.stringify({ origin, apiVersion: VOICE_LIVE_API_VERSION, model: VOICE_LIVE_MODEL })).digest('hex');
  return Object.freeze({ url: url.toString(), apiKey, apiKeyHeader: 'api-key', model: VOICE_LIVE_MODEL,
    apiVersion: VOICE_LIVE_API_VERSION, setupTimeoutMs: VOICE_LIVE_SETUP_TIMEOUT_MS,
    maxDurationSeconds: VOICE_LIVE_MAX_DURATION_SECONDS, providerConfigurationDigest });
}

/** Compatibility shape for the server-owned WebSocket host. */
export function voiceLiveConnectionConfig(env: Record<string, string | undefined> = process.env) {
  const config = azureVoiceLiveConfiguration(env);
  return Object.freeze({ url: config.url, key: config.apiKey, apiKeyHeader: config.apiKeyHeader,
    model: config.model, apiVersion: config.apiVersion, setupTimeoutMs: config.setupTimeoutMs,
    maxDurationSeconds: config.maxDurationSeconds, providerConfigurationDigest: config.providerConfigurationDigest });
}

/** Instructions are already fully compiled and revision-tagged by the caller. */
export function buildVoiceLiveSession(input: {
  model: string; instructions: string; liveVoiceProfile: VoiceLiveProfile;
  speechDelivery?: SpeechDeliveryProfile | SpeechDeliveryDecision;
  enabledTools?: readonly VoiceToolName[]; speechVocabulary?: readonly string[];
}): VoiceLiveSessionUpdate {
  if (input.model !== VOICE_LIVE_MODEL || typeof input.instructions !== 'string' || !input.instructions.trim() || input.instructions.length > 60_000)
    throw new Error('Invalid Voice Live session configuration.');
  const voice = resolveAzureVoiceLiveVoice(input.liveVoiceProfile);
  if (!voice) throw new Error('Azure Voice Live voice is required.');
  const prompt = compileSpeechVocabularyPrompt(input.speechVocabulary);
  // Provider-neutral declarations intentionally omit transport discriminators.
  // Voice Live's RealtimeFunctionTool requires the literal function type.
  const tools: VoiceLiveFunctionTool[] = voiceToolDefinitions(input.enabledTools).map(tool => ({ type: 'function', ...tool }));
  return {
    type: 'session.update',
    session: {
      model: VOICE_LIVE_MODEL,
      modalities: ['text', 'audio'],
      instructions: input.instructions,
      voice: { ...voice, rate: speechRate(input.speechDelivery) },
      input_audio_sampling_rate: 16_000,
      input_audio_format: 'pcm16', output_audio_format: 'pcm16',
      input_audio_transcription: { model: 'gpt-4o-mini-transcribe', ...(prompt ? { prompt } : {}) },
      turn_detection: { type: 'azure_semantic_vad_multilingual', threshold: 0.5, prefix_padding_ms: 420,
        silence_duration_ms: 500, speech_duration_ms: 80, remove_filler_words: false,
        create_response: false, interrupt_response: false, auto_truncate: false },
      tools, tool_choice: tools.length ? 'auto' : 'none', max_response_output_tokens: 2048,
      output_audio_timestamp_types: ['word'],
    },
  };
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as RecordValue).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
}
function sameModalities(actual: unknown, expected: readonly string[]) {
  return Array.isArray(actual) && actual.length === expected.length && [...actual].sort().every((item, index) => item === [...expected].sort()[index]);
}
function acknowledgedModel(actual: unknown, expected: string) {
  return expected === VOICE_LIVE_MODEL && (actual === VOICE_LIVE_MODEL || actual === VOICE_LIVE_ACK_MODEL);
}
function acknowledgedOptionalPrompt(actual: unknown, expected: string | undefined) {
  // Voice Live normalizes an omitted optional transcription prompt to null.
  // Empty text is not equivalent, and a real vocabulary prompt remains exact.
  return expected === undefined ? actual === undefined || actual === null : actual === expected;
}

/** Finite schema labels only. Safe for host diagnostics; never include values. */
export function voiceLiveSessionAckMismatchKeys(expected: VoiceLiveSessionUpdate, raw: unknown): string[] {
  const mismatches: string[] = [];
  const miss = (matches: boolean, key: string) => { if (!matches) mismatches.push(key); };
  const event = record(raw), session = record(event?.session);
  if (event?.type !== 'session.updated') return ['event.type'];
  if (!session) return ['event.session'];
  const wanted = expected.session, voice = record(session.voice), transcription = record(session.input_audio_transcription), vad = record(session.turn_detection);
  if (!voice) mismatches.push('session.voice');
  if (!transcription) mismatches.push('session.input_audio_transcription');
  if (!vad) mismatches.push('session.turn_detection');
  miss(acknowledgedModel(session.model, wanted.model), 'session.model');
  miss(sameModalities(session.modalities, wanted.modalities), 'session.modalities');
  miss(session.instructions === wanted.instructions, 'session.instructions');
  if (voice) {
    miss(voice.type === wanted.voice.type, 'session.voice.type');
    miss(voice.name === wanted.voice.name, 'session.voice.name');
    miss(String(voice.rate) === wanted.voice.rate, 'session.voice.rate');
  }
  miss(session.input_audio_sampling_rate === wanted.input_audio_sampling_rate, 'session.input_audio_sampling_rate');
  miss(session.input_audio_format === wanted.input_audio_format, 'session.input_audio_format');
  miss(session.output_audio_format === wanted.output_audio_format, 'session.output_audio_format');
  if (transcription) {
    miss(transcription.model === wanted.input_audio_transcription.model, 'session.input_audio_transcription.model');
    miss(acknowledgedOptionalPrompt(transcription.prompt, wanted.input_audio_transcription.prompt), 'session.input_audio_transcription.prompt');
  }
  if (vad) for (const [key, value] of Object.entries(wanted.turn_detection)) miss(vad[key] === value, `session.turn_detection.${key}`);
  miss(stable(session.tools) === stable(wanted.tools), 'session.tools');
  miss(session.tool_choice === wanted.tool_choice, 'session.tool_choice');
  miss(session.max_response_output_tokens === wanted.max_response_output_tokens, 'session.max_response_output_tokens');
  miss(stable(session.output_audio_timestamp_types) === stable(wanted.output_audio_timestamp_types), 'session.output_audio_timestamp_types');
  return mismatches;
}

/** Exact safety/configuration projection; provider-owned id/object fields are ignored. */
export function matchesVoiceLiveSessionAck(expected: VoiceLiveSessionUpdate, raw: unknown): boolean {
  return voiceLiveSessionAckMismatchKeys(expected, raw).length === 0;
}

const boundedId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const boundedText = (value: unknown, maximum: number): value is string => typeof value === 'string' && value.length <= maximum;
const boundedIndex = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 15;
function audioDelta(value: unknown) {
  if (typeof value !== 'string' || value.length < 4 || value.length > 700_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length > 0 && bytes.length <= 500_000 && bytes.length % 2 === 0;
}
function safeCount(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 10_000_000 ? Number(value) : undefined; }

export type CanonicalVoiceLiveEvent = Record<string, unknown> & { type: string };

/** Normalize only events the bounded gateway consumes; unknown payloads vanish. */
export function normalizeVoiceLiveEvent(raw: unknown): CanonicalVoiceLiveEvent | null {
  const event = record(raw); if (!event || typeof event.type !== 'string') return null;
  const type = event.type;
  if (type === 'session.created') return { type };
  if (type === 'session.updated') return record(event.session) ? { type, session: event.session } : null;
  if (type === 'input_audio_buffer.speech_started' || type === 'input_audio_buffer.speech_stopped' || type === 'input_audio_buffer.committed') {
    return boundedId(event.item_id) ? { type, item_id: event.item_id } : null;
  }
  if (type === 'conversation.item.input_audio_transcription.completed') {
    return boundedId(event.item_id) && boundedText(event.transcript, 10_000) && event.transcript.trim() ? { type, item_id: event.item_id, transcript: event.transcript.trim() } : null;
  }
  if (type === 'conversation.item.input_audio_transcription.failed') return boundedId(event.item_id) ? { type, item_id: event.item_id } : null;
  if (type === 'conversation.item.deleted') return boundedId(event.item_id) ? { type, item_id: event.item_id } : null;
  if (type === 'response.created') {
    const response = record(event.response); return response && boundedId(response.id) ? { type, response: { id: response.id } } : null;
  }
  if (type === 'response.done') {
    const response = record(event.response); if (!response || !boundedId(response.id)) return null;
    const status = ['completed', 'cancelled', 'failed', 'incomplete'].includes(String(response.status)) ? response.status : 'unknown';
    const details = record(response.status_details), usage = record(response.usage), input = record(usage?.input_token_details), output = record(usage?.output_token_details);
    return { type, response: { id: response.id, status,
      status_details: { reason: boundedText(details?.reason, 80) ? details?.reason : 'unknown' },
      usage: { input_tokens: safeCount(usage?.input_tokens), output_tokens: safeCount(usage?.output_tokens), total_tokens: safeCount(usage?.total_tokens),
        input_token_details: { audio_tokens: safeCount(input?.audio_tokens) }, output_token_details: { audio_tokens: safeCount(output?.audio_tokens) } } } };
  }
  if (type === 'response.audio.delta') {
    return boundedId(event.response_id) && boundedId(event.item_id) && boundedIndex(event.output_index) && boundedIndex(event.content_index) && audioDelta(event.delta)
      ? { type: 'response.output_audio.delta', response_id: event.response_id, item_id: event.item_id, output_index: event.output_index, content_index: event.content_index, delta: event.delta, sampleRate: VOICE_LIVE_OUTPUT_SAMPLE_RATE } : null;
  }
  if (type === 'response.audio.done') return boundedId(event.response_id) && boundedId(event.item_id) && boundedIndex(event.output_index) && boundedIndex(event.content_index)
    ? { type: 'response.output_audio.done', response_id: event.response_id, item_id: event.item_id, output_index: event.output_index, content_index: event.content_index } : null;
  if (type === 'response.audio_transcript.delta') return boundedId(event.response_id) && boundedId(event.item_id) && boundedIndex(event.output_index) && boundedIndex(event.content_index) && boundedText(event.delta, 10_000)
    ? { type: 'response.output_audio_transcript.delta', response_id: event.response_id, item_id: event.item_id, output_index: event.output_index, content_index: event.content_index, delta: event.delta } : null;
  if (type === 'response.audio_transcript.done') return boundedId(event.response_id) && boundedId(event.item_id) && boundedIndex(event.output_index) && boundedIndex(event.content_index) && boundedText(event.transcript, 10_000)
    ? { type: 'response.output_audio_transcript.done', response_id: event.response_id, item_id: event.item_id, output_index: event.output_index, content_index: event.content_index, transcript: event.transcript } : null;
  if (type === 'response.output_item.added' || type === 'response.output_item.done') {
    const item = record(event.item);
    return boundedId(event.response_id) && boundedIndex(event.output_index) && item?.type === 'message' && boundedId(item.id)
      ? { type, response_id: event.response_id, output_index: event.output_index, item: { id: item.id, type: 'message' } } : null;
  }
  if (type === 'response.function_call_arguments.done') return boundedId(event.response_id) && boundedId(event.call_id) && boundedText(event.name, 100) && boundedText(event.arguments, 12_000)
    ? { type, response_id: event.response_id, call_id: event.call_id, name: event.name, arguments: event.arguments } : null;
  if (type === 'conversation.item.truncated') return boundedId(event.item_id) && boundedIndex(event.content_index) && Number.isSafeInteger(event.audio_end_ms) && Number(event.audio_end_ms) >= 0 && Number(event.audio_end_ms) <= 600_000
    ? { type, item_id: event.item_id, content_index: event.content_index, audio_end_ms: event.audio_end_ms } : null;
  if (type === 'response.audio_timestamp.delta') return boundedId(event.response_id) && boundedId(event.item_id) && boundedIndex(event.output_index) && boundedIndex(event.content_index) && event.timestamp_type === 'word' &&
      Number.isSafeInteger(event.audio_offset_ms) && Number(event.audio_offset_ms) >= 0 && Number.isSafeInteger(event.audio_duration_ms) && Number(event.audio_duration_ms) >= 0 && boundedText(event.text, 500)
    ? { type, response_id: event.response_id, item_id: event.item_id, output_index: event.output_index, content_index: event.content_index, timestamp_type: 'word', audio_offset_ms: event.audio_offset_ms, audio_duration_ms: event.audio_duration_ms, text: event.text } : null;
  if (type === 'response.audio_timestamp.done') return boundedId(event.response_id) && boundedId(event.item_id) ? { type, response_id: event.response_id, item_id: event.item_id } : null;
  if (type === 'error' || type === 'warning') {
    const detail = record(event.error) || record(event.warning) || {};
    const safe = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_.\[\]-]{1,100}$/.test(value) ? value : 'unknown';
    return { type, diagnostic: { code: safe(detail.code), type: safe(detail.type), param: safe(detail.param) } };
  }
  return null;
}
