import type { ConversationEntry } from './emotional';
import { compileRelationalRuntime, type RelationalRuntimeInput, type RelationalState } from './relational-runtime';
import type { ContinuousSpeechHypothesis } from './continuous-speech-contracts';
export type { ContinuousSpeechHypothesis } from './continuous-speech-contracts';

/** Sample positions refer only to the continuous 16 kHz sidecar stream. Native
 * provider receipt boundaries are correlation hints, not acoustic alignment. */
export type ContinuousUnderstandingSnapshot = {
  revisionCount: number; interimCount: number; sidecarFinalCount: number; discardedCount: number;
  phase: 'listening' | 'tentative' | 'preparing' | 'awaiting_final' | 'paused' | 'ended';
  bound: boolean;
  latest?: Pick<ContinuousSpeechHypothesis, 'text' | 'segmentId' | 'revision' | 'state'>;
  cues?: Pick<RelationalState, 'pace' | 'language' | 'pauseRequested'>;
};
export type ContinuousUnderstandingOptions = {
  getContext(): { entries: readonly ConversationEntry[]; relationship?: RelationalRuntimeInput['relationship']; settings?: RelationalRuntimeInput['settings'] };
  onUpdate(snapshot: ContinuousUnderstandingSnapshot): void;
  /** A stability hint only. This never grants permission to respond. */
  onCandidate?(guidance: string | undefined): void;
};

const MAX_SAMPLES = 16_000 * 600;
const MAX_SEGMENTS = 450;
const MAX_TEXT = 6_000;
type Segment = { revision: number; start: number; end: number; final: boolean; generation?: number };
type Native = { id: string; generation: number; start: number; lower: number; eligible: boolean; stopped: boolean; segment?: number; ambiguous: boolean };

/** Pure, ephemeral preparation. Only the native scheduler may publish final
 * user turns, mutate lasting behavior, execute tools or authorize a response.
 * Two matching compilations are a revision stability hint, never confidence. */
export function createContinuousUnderstanding(options: ContinuousUnderstandingOptions) {
  let closed = false, muted = false, discontinuous = false;
  let epoch: string | undefined, samples = 0, receipt: number | undefined;
  let generation = 0, mutation = 0, previousBoundary = 0, highestSegment = -1;
  let native: Native | undefined;
  let candidate: string | undefined, previousGuidance: string | undefined, streak = 0;
  const segments = new Map<number, Segment>();
  const nativeIds = new Set<string>();
  let state: ContinuousUnderstandingSnapshot = empty();

  function empty(): ContinuousUnderstandingSnapshot {
    return { revisionCount: 0, interimCount: 0, sidecarFinalCount: 0, discardedCount: 0, phase: 'listening', bound: false };
  }
  function clearPreparation() {
    previousGuidance = undefined; streak = 0;
    state.bound = false; state.cues = undefined;
  }
  function emit(nextCandidate: string | undefined) {
    const stamp = mutation;
    if (candidate !== nextCandidate) {
      candidate = nextCandidate;
      options.onCandidate?.(nextCandidate);
    }
    if (mutation !== stamp) return;
    options.onUpdate({ ...state, ...(state.latest ? { latest: { ...state.latest } } : {}), ...(state.cues ? { cues: { ...state.cues } } : {}) });
  }
  function basePhase(): ContinuousUnderstandingSnapshot['phase'] {
    return closed ? 'ended' : muted ? 'paused' : native?.stopped ? 'awaiting_final' : 'listening';
  }
  function discard() {
    state.discardedCount++;
    clearPreparation(); state.latest = undefined; state.phase = basePhase();
    emit(undefined);
  }
  function invalidateTimeline() {
    discontinuous = true;
    if (native) native.eligible = false;
    discard();
  }
  function validId(id: unknown): id is string { return typeof id === 'string' && id.length > 0 && id.length <= 128; }
  function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

  return {
    progress(submittedSamples: number, monotonicReceipt: number) {
      if (closed) return;
      mutation++;
      if (!integer(submittedSamples) || submittedSamples > MAX_SAMPLES || submittedSamples < samples ||
          !Number.isFinite(monotonicReceipt) || monotonicReceipt < 0 || (receipt !== undefined && monotonicReceipt < receipt)) {
        invalidateTimeline(); return;
      }
      samples = submittedSamples; receipt = monotonicReceipt;
    },
    nativeSpeechStarted(itemId: string) {
      if (closed) return;
      mutation++;
      if (!validId(itemId) || nativeIds.has(itemId) || nativeIds.size >= MAX_SEGMENTS) { discard(); return; }
      nativeIds.add(itemId);
      // A start without a preceding stop makes the receipt interval ambiguous.
      if (native && !native.stopped) previousBoundary = samples;
      native = { id: itemId, generation: ++generation, start: samples, lower: previousBoundary,
        eligible: !muted && !discontinuous && receipt !== undefined && samples > 0, stopped: false, ambiguous: false };
      clearPreparation(); state.latest = undefined; state.phase = basePhase(); emit(undefined);
    },
    nativeSpeechStopped(itemId: string) {
      if (closed) return;
      mutation++;
      if (!native || native.id !== itemId || native.stopped) return;
      native.stopped = true; previousBoundary = samples;
      clearPreparation(); state.phase = basePhase(); emit(undefined);
    },
    nativeFinal(itemId: string) {
      if (closed) return;
      mutation++;
      if (!native || native.id !== itemId) return;
      previousBoundary = Math.max(previousBoundary, samples);
      native = undefined;
      clearPreparation(); state.latest = undefined; state.phase = basePhase(); emit(undefined);
    },
    receive(hypothesis: ContinuousSpeechHypothesis) {
      if (closed) return;
      mutation++;
      const h = hypothesis;
      if (!h || h.type !== 'hypothesis' || !validId(h.sessionEpoch) || !integer(h.segmentId) || !integer(h.revision) || h.revision < 1 ||
          !integer(h.audioStartSample) || !integer(h.audioEndSample) || h.audioEndSample <= h.audioStartSample ||
          h.audioEndSample > samples || typeof h.text !== 'string' || !h.text.trim() || h.text.length > MAX_TEXT ||
          (h.state !== 'interim' && h.state !== 'sidecar_final') || (epoch !== undefined && h.sessionEpoch !== epoch) ||
          discontinuous || muted) { discard(); return; }
      epoch ??= h.sessionEpoch;
      const known = segments.get(h.segmentId);
      if (h.segmentId < highestSegment || (!known && segments.size >= MAX_SEGMENTS) ||
          (known && (known.final || h.revision <= known.revision || h.audioStartSample !== known.start || h.audioEndSample < known.end))) {
        discard(); return;
      }
      highestSegment = Math.max(highestSegment, h.segmentId);
      const segment: Segment = { ...known, revision: h.revision, start: h.audioStartSample, end: h.audioEndSample, final: h.state === 'sidecar_final' };
      segments.set(h.segmentId, segment);
      state.revisionCount++;
      if (h.state === 'interim') state.interimCount++; else state.sidecarFinalCount++;
      const previousText = state.latest?.segmentId === h.segmentId ? state.latest.text : undefined;
      // A rewritten prefix may reverse a previously heard intent. Require two
      // fresh matching compilations even when the resulting guidance is equal.
      if (previousText !== undefined && previousText !== h.text && !h.text.startsWith(previousText)) clearPreparation();
      if (known && h.revision !== known.revision + 1) clearPreparation();
      state.latest = { text: h.text, segmentId: h.segmentId, revision: h.revision, state: h.state };
      clearPreparationIfChangedSegment(known, h.segmentId);
      const bound = !!native && native.eligible && !native.stopped && !native.ambiguous &&
        h.audioEndSample > native.start && h.audioStartSample >= native.lower &&
        (segment.generation === undefined || segment.generation === native.generation);
      if (!bound || !native) { clearPreparation(); state.phase = basePhase(); emit(undefined); return; }
      // Two sidecar segments in one native turn may be a split or a crossing.
      // Do not compile the latter segment alone and silently lose earlier words.
      if (native.segment !== undefined && native.segment !== h.segmentId) {
        native.ambiguous = true; clearPreparation(); state.phase = 'tentative'; emit(undefined); return;
      }
      native.segment = h.segmentId; segment.generation = native.generation;
      state.bound = true;
      if (h.state === 'sidecar_final') {
        clearPreparation(); state.bound = true; state.phase = 'awaiting_final'; emit(undefined); return;
      }
      const stamp = mutation;
      // Clone the complete approved context, including final entries. Never
      // append a tentative turn to the owner's live transcript array.
      let input: ReturnType<ContinuousUnderstandingOptions['getContext']>;
      try { input = structuredClone(options.getContext()); }
      catch { if (mutation === stamp) discard(); return; }
      if (mutation !== stamp || closed) return;
      if (input.entries.some(entry => entry.id === native!.id)) { discard(); return; }
      const entries = input.entries.map(entry => ({ ...entry }));
      entries.push({ id: native.id, role: 'user', text: h.text });
      let runtime: ReturnType<typeof compileRelationalRuntime>;
      try { runtime = compileRelationalRuntime({ ...input, entries }); }
      catch { discard(); return; }
      state.cues = { pace: runtime.state.pace, language: runtime.state.language, pauseRequested: runtime.state.pauseRequested };
      streak = previousGuidance === runtime.instructions ? streak + 1 : 1;
      previousGuidance = runtime.instructions;
      state.phase = streak >= 2 ? 'preparing' : 'tentative';
      emit(streak >= 2 ? runtime.instructions : undefined);
    },
    setMuted(value: boolean) {
      if (closed || value === muted) return;
      mutation++; muted = value;
      // Capture may omit muted frames. Until a fresh native start, correlation
      // with a hypothesis spanning the mute transition is unusable.
      previousBoundary = samples;
      if (native) native.eligible = false;
      clearPreparation(); state.latest = undefined; state.phase = basePhase(); emit(undefined);
    },
    reset() {
      if (closed) return;
      mutation++; epoch = undefined; samples = 0; receipt = undefined; generation = 0;
      previousBoundary = 0; highestSegment = -1; native = undefined; discontinuous = false;
      segments.clear(); nativeIds.clear(); state = empty(); state.phase = basePhase(); clearPreparation(); emit(undefined);
    },
    close() {
      if (closed) return;
      mutation++; closed = true; native = undefined; segments.clear(); nativeIds.clear();
      clearPreparation(); state.latest = undefined; state.phase = 'ended'; emit(undefined);
    },
  };

  function clearPreparationIfChangedSegment(known: Segment | undefined, id: number) {
    if (!known || (native?.segment !== undefined && native.segment !== id)) clearPreparation();
  }
}
