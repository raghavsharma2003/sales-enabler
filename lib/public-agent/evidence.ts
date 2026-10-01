import type { PublicResponseDiagnostic } from './protocol';

export const MAX_PUBLIC_VOICE_EVIDENCE_TURNS = 40;
const MAX_OFFSET_MS = 86_400_000;
const MAX_AUDIO_BYTES = 24_000_000;

type PublicVoiceTurnNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40;
export type PublicVoiceTurnOrdinal = `turn${PublicVoiceTurnNumber}`;
export type PublicVoiceTerminalStatus = 'completed' | 'cancelled' | 'failed' | 'incomplete' | 'unknown';
export type PublicVoiceTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputAudioTokens?: number;
  outputAudioTokens?: number;
};

/** Server transport observations only. These values are not acoustic or user-perceived latency. */
export type PublicVoiceResponseEvidence = {
  turn: PublicVoiceTurnOrdinal;
  requestedAtMs: number;
  providerCreatedAtMs?: number;
  firstServerAudioAtMs?: number;
  terminalAtMs?: number;
  requestedToFirstServerAudioMs?: number;
  status?: PublicVoiceTerminalStatus;
  cancelled: boolean;
  audioBytes: number;
  tokenUsage?: PublicVoiceTokenUsage;
};

export type PublicVoiceEvidence = {
  version: 1;
  serverCaptured: true;
  capture: 'best_effort';
  basis: 'server_transport';
  metric: 'requested_to_first_server_audio_ms';
  turns: PublicVoiceResponseEvidence[];
};

function ordinal(index: number): PublicVoiceTurnOrdinal | undefined {
  return Number.isInteger(index) && index >= 1 && index <= MAX_PUBLIC_VOICE_EVIDENCE_TURNS ? `turn${index}` as PublicVoiceTurnOrdinal : undefined;
}

function usageFrom(summary: PublicResponseDiagnostic): PublicVoiceTokenUsage | undefined {
  const usage = {
    inputTokens: summary.inputTokens,
    outputTokens: summary.outputTokens,
    totalTokens: summary.totalTokens,
    inputAudioTokens: summary.inputAudioTokens,
    outputAudioTokens: summary.outputAudioTokens,
  };
  return Object.values(usage).some(value => value !== undefined) ? usage : undefined;
}

const cloneTurn = (turn: PublicVoiceResponseEvidence): PublicVoiceResponseEvidence => ({
  ...turn,
  ...(turn.tokenUsage ? { tokenUsage: { ...turn.tokenUsage } } : {}),
});

/** Keeps provider correlation outside the persisted DTO. */
export class PublicVoiceEvidenceRecorder {
  private readonly turns = new Map<number, PublicVoiceResponseEvidence>();
  private lastOffsetMs = 0;

  constructor(private readonly startedAt: number, private readonly clock: () => number) {}

  private atMs() {
    const elapsed = Math.floor(this.clock() - this.startedAt);
    if (Number.isFinite(elapsed)) this.lastOffsetMs = Math.min(MAX_OFFSET_MS, Math.max(this.lastOffsetMs, elapsed, 0));
    return this.lastOffsetMs;
  }

  requested(index: number) {
    const turn = ordinal(index);
    if (!turn || this.turns.has(index)) return this.get(index);
    this.turns.set(index, { turn, requestedAtMs: this.atMs(), cancelled: false, audioBytes: 0 });
    return this.get(index);
  }

  providerCreated(index: number) {
    const current = this.turns.get(index);
    if (current && !current.cancelled && current.terminalAtMs === undefined && current.providerCreatedAtMs === undefined) current.providerCreatedAtMs = this.atMs();
    return this.get(index);
  }

  audio(index: number, bytes: number) {
    const current = this.turns.get(index);
    if (!current || current.cancelled || current.terminalAtMs !== undefined || !Number.isSafeInteger(bytes) || bytes <= 0) return { evidence: this.get(index), first: false };
    const first = current.firstServerAudioAtMs === undefined;
    if (first) {
      current.firstServerAudioAtMs = this.atMs();
      current.requestedToFirstServerAudioMs = current.firstServerAudioAtMs - current.requestedAtMs;
    }
    current.audioBytes = Math.min(MAX_AUDIO_BYTES, current.audioBytes + bytes);
    return { evidence: this.get(index), first };
  }

  cancelled(index: number) {
    const current = this.turns.get(index);
    if (current && current.terminalAtMs === undefined) { current.cancelled = true; current.status = 'cancelled'; }
    return this.get(index);
  }

  terminal(index: number, summary: PublicResponseDiagnostic) {
    const current = this.turns.get(index);
    if (!current || current.cancelled || current.terminalAtMs !== undefined) return this.get(index);
    current.terminalAtMs = this.atMs();
    current.status = ['completed', 'cancelled', 'failed', 'incomplete'].includes(summary.status) ? summary.status as PublicVoiceTerminalStatus : 'unknown';
    current.cancelled = current.status === 'cancelled';
    const tokenUsage = usageFrom(summary);
    if (tokenUsage) current.tokenUsage = tokenUsage;
    return this.get(index);
  }

  get(index: number) {
    const current = this.turns.get(index);
    return current ? cloneTurn(current) : undefined;
  }

  snapshot(): PublicVoiceEvidence {
    return {
      version: 1,
      serverCaptured: true,
      capture: 'best_effort',
      basis: 'server_transport',
      metric: 'requested_to_first_server_audio_ms',
      turns: [...this.turns.entries()].sort(([a], [b]) => a - b).slice(0, MAX_PUBLIC_VOICE_EVIDENCE_TURNS).map(([, turn]) => cloneTurn(turn)),
    };
  }
}

function safeOffset(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_OFFSET_MS; }
function safeCount(value: unknown, maximum = 1_000_000) { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum; }

/** Runtime fence for the server-owned persistence projection. Unknown or sensitive fields are rejected. */
export function isPublicVoiceResponseEvidence(value: unknown): value is PublicVoiceResponseEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const turn = value as Record<string, unknown>;
  const match = typeof turn.turn === 'string' ? /^turn([1-9]|[1-3][0-9]|40)$/.exec(turn.turn) : null;
  if (!match || !safeOffset(turn.requestedAtMs) || typeof turn.cancelled !== 'boolean' || !safeCount(turn.audioBytes, MAX_AUDIO_BYTES)) return false;
  for (const key of ['providerCreatedAtMs', 'firstServerAudioAtMs', 'terminalAtMs', 'requestedToFirstServerAudioMs']) if (turn[key] !== undefined && !safeOffset(turn[key])) return false;
  for (const key of ['providerCreatedAtMs', 'firstServerAudioAtMs', 'terminalAtMs']) if (turn[key] !== undefined && Number(turn[key]) < Number(turn.requestedAtMs)) return false;
  if ((turn.firstServerAudioAtMs === undefined) !== (turn.requestedToFirstServerAudioMs === undefined)) return false;
  if (turn.firstServerAudioAtMs !== undefined && turn.requestedToFirstServerAudioMs !== Number(turn.firstServerAudioAtMs) - Number(turn.requestedAtMs)) return false;
  if ((Number(turn.audioBytes) > 0) !== (turn.firstServerAudioAtMs !== undefined)) return false;
  if (turn.status !== undefined && !['completed', 'cancelled', 'failed', 'incomplete', 'unknown'].includes(String(turn.status))) return false;
  if (turn.tokenUsage !== undefined) {
    if (!turn.tokenUsage || typeof turn.tokenUsage !== 'object' || Array.isArray(turn.tokenUsage)) return false;
    const usage = turn.tokenUsage as Record<string, unknown>;
    if (!Object.keys(usage).every(key => ['inputTokens', 'outputTokens', 'totalTokens', 'inputAudioTokens', 'outputAudioTokens'].includes(key))) return false;
    if (!Object.values(usage).every(item => item === undefined || safeCount(item))) return false;
  }
  return Object.keys(turn).every(key => ['turn', 'requestedAtMs', 'providerCreatedAtMs', 'firstServerAudioAtMs', 'terminalAtMs', 'requestedToFirstServerAudioMs', 'status', 'cancelled', 'audioBytes', 'tokenUsage'].includes(key));
}

export function isPublicVoiceEvidence(value: unknown): value is PublicVoiceEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  if (evidence.version !== 1 || evidence.serverCaptured !== true || evidence.capture !== 'best_effort' || evidence.basis !== 'server_transport' || evidence.metric !== 'requested_to_first_server_audio_ms' || !Array.isArray(evidence.turns) || evidence.turns.length > MAX_PUBLIC_VOICE_EVIDENCE_TURNS) return false;
  if (!Object.keys(evidence).every(key => ['version', 'serverCaptured', 'capture', 'basis', 'metric', 'turns'].includes(key))) return false;
  const ordinals = new Set<string>();
  return evidence.turns.every(turn => isPublicVoiceResponseEvidence(turn) && !ordinals.has(turn.turn) && Boolean(ordinals.add(turn.turn)));
}
