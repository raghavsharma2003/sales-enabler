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
  requestedAtMs?: number;
  providerCreatedAtMs?: number;
  firstServerAudioAtMs?: number;
  terminalAtMs?: number;
  requestedToFirstServerAudioMs?: number;
  status?: PublicVoiceTerminalStatus;
  cancelRequested: boolean;
  cancelRequestedAtMs?: number;
  /** True only when a provider terminal event reports status=cancelled. */
  cancelled: boolean;
  /** Nonempty audio accepted by the gateway before discard; not playback or billable duration. */
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
  private readonly providerCreatedObserved = new Set<number>();
  private readonly firstAudioObserved = new Set<number>();
  private readonly terminalObserved = new Set<number>();
  private readonly cancelRequestedObserved = new Set<number>();
  private lastOffsetMs: number | undefined;

  constructor(private readonly startedAt: number | undefined, private readonly clock: () => number) {}

  private atMs() {
    if (!Number.isFinite(this.startedAt)) return undefined;
    let sample: number;
    try { sample = this.clock(); } catch { return undefined; }
    const elapsed = Math.floor(sample - Number(this.startedAt));
    if (!Number.isFinite(sample) || !Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed > MAX_OFFSET_MS) return undefined;
    this.lastOffsetMs = this.lastOffsetMs === undefined ? elapsed : Math.max(this.lastOffsetMs, elapsed);
    return this.lastOffsetMs;
  }

  requested(index: number) {
    const turn = ordinal(index);
    if (!turn || this.turns.has(index)) return this.get(index);
    const requestedAtMs = this.atMs();
    this.turns.set(index, { turn, ...(requestedAtMs !== undefined ? { requestedAtMs } : {}), cancelRequested: false, cancelled: false, audioBytes: 0 });
    return this.get(index);
  }

  providerCreated(index: number) {
    const current = this.turns.get(index);
    if (current && !this.providerCreatedObserved.has(index) && !this.terminalObserved.has(index)) {
      this.providerCreatedObserved.add(index);
      const atMs = this.atMs(); if (atMs !== undefined) current.providerCreatedAtMs = atMs;
    }
    return this.get(index);
  }

  audio(index: number, bytes: number) {
    const current = this.turns.get(index);
    if (!current || this.terminalObserved.has(index) || !Number.isSafeInteger(bytes) || bytes <= 0) return { evidence: this.get(index), first: false };
    const first = !this.firstAudioObserved.has(index);
    if (first) {
      this.firstAudioObserved.add(index);
      const atMs = this.atMs();
      if (atMs !== undefined) {
        current.firstServerAudioAtMs = atMs;
        if (current.requestedAtMs !== undefined) current.requestedToFirstServerAudioMs = atMs - current.requestedAtMs;
      }
    }
    current.audioBytes = Math.min(MAX_AUDIO_BYTES, current.audioBytes + bytes);
    return { evidence: this.get(index), first };
  }

  cancelRequested(index: number) {
    const current = this.turns.get(index);
    if (current && !this.cancelRequestedObserved.has(index)) {
      this.cancelRequestedObserved.add(index); current.cancelRequested = true;
      const atMs = this.atMs(); if (atMs !== undefined) current.cancelRequestedAtMs = atMs;
    }
    return this.get(index);
  }

  terminal(index: number, summary: PublicResponseDiagnostic) {
    const current = this.turns.get(index);
    if (!current || this.terminalObserved.has(index)) return this.get(index);
    this.terminalObserved.add(index);
    const atMs = this.atMs(); if (atMs !== undefined) current.terminalAtMs = atMs;
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
  if (!match || (turn.requestedAtMs !== undefined && !safeOffset(turn.requestedAtMs)) || typeof turn.cancelRequested !== 'boolean' || typeof turn.cancelled !== 'boolean' || !safeCount(turn.audioBytes, MAX_AUDIO_BYTES)) return false;
  for (const key of ['providerCreatedAtMs', 'firstServerAudioAtMs', 'terminalAtMs', 'requestedToFirstServerAudioMs', 'cancelRequestedAtMs']) if (turn[key] !== undefined && !safeOffset(turn[key])) return false;
  if (turn.requestedAtMs !== undefined) for (const key of ['providerCreatedAtMs', 'firstServerAudioAtMs', 'terminalAtMs', 'cancelRequestedAtMs']) if (turn[key] !== undefined && Number(turn[key]) < Number(turn.requestedAtMs)) return false;
  if (turn.requestedAtMs !== undefined && turn.firstServerAudioAtMs !== undefined) {
    if (turn.requestedToFirstServerAudioMs !== Number(turn.firstServerAudioAtMs) - Number(turn.requestedAtMs)) return false;
  } else if (turn.requestedToFirstServerAudioMs !== undefined) return false;
  if (turn.cancelRequestedAtMs !== undefined && turn.cancelRequested !== true) return false;
  if (turn.status !== undefined && !['completed', 'cancelled', 'failed', 'incomplete', 'unknown'].includes(String(turn.status))) return false;
  if (turn.cancelled !== (turn.status === 'cancelled')) return false;
  if (turn.terminalAtMs !== undefined && turn.status === undefined) return false;
  if (turn.tokenUsage !== undefined) {
    if (turn.status === undefined) return false;
    if (!turn.tokenUsage || typeof turn.tokenUsage !== 'object' || Array.isArray(turn.tokenUsage)) return false;
    const usage = turn.tokenUsage as Record<string, unknown>;
    if (!Object.keys(usage).every(key => ['inputTokens', 'outputTokens', 'totalTokens', 'inputAudioTokens', 'outputAudioTokens'].includes(key))) return false;
    if (!Object.values(usage).every(item => item === undefined || safeCount(item))) return false;
  }
  return Object.keys(turn).every(key => ['turn', 'requestedAtMs', 'providerCreatedAtMs', 'firstServerAudioAtMs', 'terminalAtMs', 'requestedToFirstServerAudioMs', 'status', 'cancelRequested', 'cancelRequestedAtMs', 'cancelled', 'audioBytes', 'tokenUsage'].includes(key));
}

export function isPublicVoiceEvidence(value: unknown): value is PublicVoiceEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const evidence = value as Record<string, unknown>;
  if (evidence.version !== 1 || evidence.serverCaptured !== true || evidence.capture !== 'best_effort' || evidence.basis !== 'server_transport' || evidence.metric !== 'requested_to_first_server_audio_ms' || !Array.isArray(evidence.turns) || evidence.turns.length > MAX_PUBLIC_VOICE_EVIDENCE_TURNS) return false;
  if (!Object.keys(evidence).every(key => ['version', 'serverCaptured', 'capture', 'basis', 'metric', 'turns'].includes(key))) return false;
  const ordinals = new Set<string>();
  return evidence.turns.every(turn => isPublicVoiceResponseEvidence(turn) && !ordinals.has(turn.turn) && Boolean(ordinals.add(turn.turn)));
}
