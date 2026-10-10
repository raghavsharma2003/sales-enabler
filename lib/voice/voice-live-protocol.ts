import type { VoiceBehaviorContext, VoiceEvent } from './contracts';
import { isVoiceToolName, type VoiceToolName } from './tools/contracts';

export const VOICE_LIVE_INPUT_FRAME_BYTES = 640;
export const VOICE_LIVE_INPUT_SAMPLE_RATE = 16000;
export const VOICE_LIVE_OUTPUT_SAMPLE_RATE = 24000;
export const VOICE_LIVE_MAX_CONTROL_BYTES = 32768;
export const VOICE_LIVE_MAX_AUDIO_BYTES = 96000;
export type VoiceLivePlayedItem = { itemId: string; contentIndex: number; playedSamples: number };
export type VoiceLiveClientEvent =
  | { type: 'start'; ticket: string; inputMode: 'text' | 'microphone' }
  | { type: 'text'; text: string; requestId: string }
  | { type: 'played' | 'interrupt'; sessionEpoch: string; responseId: string; items: VoiceLivePlayedItem[] }
  | { type: 'end' };
export type VoiceLiveReadyMetadata = {
  previewId?: string;
  connectionId?: string;
  enabledTools: VoiceToolName[];
  behaviorContext: VoiceBehaviorContext;
};
export type VoiceLiveServerEvent =
  | { type: 'ready'; sessionEpoch: string; metadata: VoiceLiveReadyMetadata }
  | { type: 'audio'; sessionEpoch: string; responseId: string; itemId: string; contentIndex: number; sequence: number; sampleStart: number; sampleCount: number; sampleRate: 24000; audio: string }
  | { type: 'interrupted'; sessionEpoch: string; responseId: string }
  | { type: 'ended'; sessionEpoch: string; reason: string; message?: string }
  | (VoiceEvent & { sessionEpoch: string });

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const integer = (value: unknown, maximum: number): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
const keys = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
function boundedObject(value: unknown, maximum: number): Record<string, unknown> {
  if (!record(value) || new TextEncoder().encode(JSON.stringify(value)).length > maximum) throw new Error('Invalid Voice Live message.');
  return value;
}
function playedItems(value: unknown): value is VoiceLivePlayedItem[] {
  if (!Array.isArray(value) || value.length > 100) return false;
  const seen = new Set<string>();
  return value.every(item => {
    if (!record(item) || !keys(item, ['itemId', 'contentIndex', 'playedSamples']) || !id(item.itemId) || !integer(item.contentIndex, 15) || !integer(item.playedSamples, 14400000)) return false;
    const key = `${item.itemId}:${item.contentIndex}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/** No raw provider events, voice selectors, tool calls or instructions cross this boundary. */
export function parseVoiceLiveClientEvent(value: unknown): VoiceLiveClientEvent {
  const v = boundedObject(value, VOICE_LIVE_MAX_CONTROL_BYTES);
  if (v.type === 'start' && keys(v, ['type', 'ticket', 'inputMode']) && typeof v.ticket === 'string' && /^[A-Za-z0-9_-]{16,2048}$/.test(v.ticket) && ['text', 'microphone'].includes(String(v.inputMode))) return v as VoiceLiveClientEvent;
  if (v.type === 'end' && keys(v, ['type'])) return { type: 'end' };
  if (v.type === 'text' && keys(v, ['type', 'text', 'requestId']) && typeof v.text === 'string' && v.text.trim() && v.text.length <= 4000 && id(v.requestId)) return { type: 'text', text: v.text.trim(), requestId: v.requestId };
  if ((v.type === 'played' || v.type === 'interrupt') && keys(v, ['type', 'sessionEpoch', 'responseId', 'items']) && id(v.sessionEpoch) && id(v.responseId) && playedItems(v.items)) return v as VoiceLiveClientEvent;
  throw new Error('Unsupported Voice Live message.');
}

/** Structural transport validation; only the server compiles behavior authority. */
export function parseVoiceLiveServerEvent(value: unknown): VoiceLiveServerEvent {
  const v = boundedObject(value, 200000);
  if (!id(v.sessionEpoch)) throw new Error('Invalid Voice Live session epoch.');
  if (v.type === 'ready' && record(v.metadata) && Array.isArray(v.metadata.enabledTools) && v.metadata.enabledTools.every(isVoiceToolName) && record(v.metadata.behaviorContext) && record(v.metadata.behaviorContext.settings) && record(v.metadata.behaviorContext.relationship)) return v as VoiceLiveServerEvent;
  if (v.type === 'audio' && id(v.responseId) && id(v.itemId) && integer(v.contentIndex, 15) && integer(v.sequence, 100000) && integer(v.sampleStart, 14400000) && integer(v.sampleCount, VOICE_LIVE_MAX_AUDIO_BYTES / 2) && v.sampleCount > 0 && v.sampleRate === 24000 && typeof v.audio === 'string' && v.audio.length <= 128000 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.audio)) return v as VoiceLiveServerEvent;
  if (v.type === 'interrupted' && id(v.responseId)) return v as VoiceLiveServerEvent;
  if (v.type === 'ended' && typeof v.reason === 'string' && /^[a-z_]{1,50}$/.test(v.reason) && (v.message === undefined || typeof v.message === 'string' && v.message.length <= 500)) return v as VoiceLiveServerEvent;
  if (v.type === 'transcript' && record(v.entry) && id(v.entry.id) && ['user', 'assistant'].includes(String(v.entry.role)) && typeof v.entry.text === 'string' && v.entry.text.length <= 10000) return v as VoiceLiveServerEvent;
  if (v.type === 'item' && id(v.id)) return v as VoiceLiveServerEvent;
  if (v.type === 'activity' && ['listening', 'thinking', 'speaking'].includes(String(v.activity))) return v as VoiceLiveServerEvent;
  if (v.type === 'error' && typeof v.message === 'string' && v.message.length <= 500) return v as VoiceLiveServerEvent;
  if (v.type === 'tool' && id(v.id) && isVoiceToolName(v.name) && ['requested', 'result'].includes(String(v.phase)) && (v.status === undefined || ['available', 'not_available', 'awaiting_review'].includes(String(v.status))) && (v.message === undefined || typeof v.message === 'string' && v.message.length <= 2000)) return v as VoiceLiveServerEvent;
  throw new Error('Invalid Voice Live server message.');
}
