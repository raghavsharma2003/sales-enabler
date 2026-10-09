export interface PrivatePreparationDiagnostics {
  /** Empty arrays mean no observed sample; all times are client events. */
  speechStopToFinalAsrMs: number[];
  /** Remaining wait after final ASR; zero if the exact candidate was ACKed earlier. */
  finalAsrToGuidanceAckMs: number[];
  /** Starts at the actual ACK, including any overlap with ongoing user speech. */
  guidanceAckToFirstOutputMs: number[];
  responseRequestToFirstOutputMs: number[];
  /** Denominator for observed speech events, not proof of ASR capability. */
  speechStarts: number;
  /** Reused speculative snapshot; its ACK may arrive before or after final ASR. */
  preAckHits: number;
  /** Finalized audio reply needed a fresh instruction update. */
  preAckMisses: number;
  asrDeltasBeforeCommit: number;
  asrDeltasAfterCommit: number;
  asrDeltasDuringSpeech: number;
}

export type PrivatePreparationEvent =
  | { type: "speech_stop_to_final_asr" | "final_asr_to_guidance_ack" | "guidance_ack_to_first_output" | "response_request_to_first_output"; ms: number }
  | { type: "pre_ack"; hit: boolean }
  | { type: "speech_start" }
  | { type: "asr_delta"; beforeCommit: boolean; duringSpeech: boolean };

const stageKeys = ["speechStopToFinalAsrMs", "finalAsrToGuidanceAckMs", "guidanceAckToFirstOutputMs", "responseRequestToFirstOutputMs"] as const;
const countKeys = ["preAckHits", "preAckMisses", "asrDeltasBeforeCommit", "asrDeltasAfterCommit", "asrDeltasDuringSpeech", "speechStarts"] as const;
function copyPreparation(value: PrivatePreparationDiagnostics): PrivatePreparationDiagnostics {
  return { ...value, speechStopToFinalAsrMs: [...value.speechStopToFinalAsrMs], finalAsrToGuidanceAckMs: [...value.finalAsrToGuidanceAckMs], guidanceAckToFirstOutputMs: [...value.guidanceAckToFirstOutputMs], responseRequestToFirstOutputMs: [...value.responseRequestToFirstOutputMs] };
}

export interface VoiceRuntimeDiagnostics {
  /** Elapsed from browser connect() entry to provider ready/data channel open. */
  clientObservedConnectMs?: number;
  /** Receipt of a user transcript or accepted typed turn to first generated output event. */
  clientObservedTurnMs: number[];
  toolCalls: { requested: number; available: number; awaitingReview: number; unavailable: number };
  status: "connecting" | "ready" | "ended";
  /** These are browser event timings, not measured acoustic or end-to-end latency. */
  measurement: "client_observed_events";
  /** Absent means this private preparation instrumentation was not observed. */
  privatePreparation?: PrivatePreparationDiagnostics;
}

/** Accept only bounded client event measurements for server persistence. */
export function normalizeVoiceDiagnostics(value: unknown): VoiceRuntimeDiagnostics | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.measurement !== "client_observed_events" || !["connecting", "ready", "ended"].includes(String(raw.status))) return undefined;
  const validMs = (item: unknown): item is number => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 600_000;
  if (raw.clientObservedConnectMs !== undefined && !validMs(raw.clientObservedConnectMs)) return undefined;
  if (!Array.isArray(raw.clientObservedTurnMs) || raw.clientObservedTurnMs.length > 20 || !raw.clientObservedTurnMs.every(item => validMs(item) && item > 0)) return undefined;
  if (!raw.toolCalls || typeof raw.toolCalls !== "object" || Array.isArray(raw.toolCalls)) return undefined;
  const calls = raw.toolCalls as Record<string, unknown>;
  const validCount = (item: unknown): item is number => Number.isInteger(item) && typeof item === "number" && item >= 0 && item <= 1_000;
  if (![calls.requested, calls.available, calls.awaitingReview, calls.unavailable].every(validCount)) return undefined;
  if (Number(calls.available) + Number(calls.awaitingReview) + Number(calls.unavailable) > Number(calls.requested)) return undefined;
  let privatePreparation: PrivatePreparationDiagnostics | undefined;
  if (raw.privatePreparation !== undefined) {
    if (!raw.privatePreparation || typeof raw.privatePreparation !== "object" || Array.isArray(raw.privatePreparation)) return undefined;
    const value = raw.privatePreparation as Record<string, unknown>;
    if (!stageKeys.every(key => Array.isArray(value[key]) && value[key].length <= 20 && value[key].every(validMs))) return undefined;
    if (!countKeys.every(key => typeof value[key] === "number" && Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 10_000)) return undefined;
    // Allowlist fields: never persist provider IDs, hypotheses or payloads.
    privatePreparation = {
      speechStopToFinalAsrMs: [...value.speechStopToFinalAsrMs as number[]],
      finalAsrToGuidanceAckMs: [...value.finalAsrToGuidanceAckMs as number[]],
      guidanceAckToFirstOutputMs: [...value.guidanceAckToFirstOutputMs as number[]],
      responseRequestToFirstOutputMs: [...value.responseRequestToFirstOutputMs as number[]],
      speechStarts: value.speechStarts as number,
      preAckHits: value.preAckHits as number, preAckMisses: value.preAckMisses as number,
      asrDeltasBeforeCommit: value.asrDeltasBeforeCommit as number, asrDeltasAfterCommit: value.asrDeltasAfterCommit as number,
      asrDeltasDuringSpeech: value.asrDeltasDuringSpeech as number,
    };
  }
  return {
    status: raw.status as VoiceRuntimeDiagnostics["status"], measurement: "client_observed_events",
    ...(raw.clientObservedConnectMs === undefined ? {} : { clientObservedConnectMs: raw.clientObservedConnectMs as number }),
    clientObservedTurnMs: [...raw.clientObservedTurnMs],
    ...(privatePreparation ? { privatePreparation } : {}),
    toolCalls: { requested: calls.requested as number, available: calls.available as number,
      awaitingReview: calls.awaitingReview as number, unavailable: calls.unavailable as number },
  };
}

export function createVoiceDiagnostics(report?: (snapshot: VoiceRuntimeDiagnostics) => void, now: () => number = () => performance.now()) {
  let startedAt: number | undefined;
  let awaitingOutputAt: number | undefined;
  const snapshot: VoiceRuntimeDiagnostics = {
    status: "connecting", measurement: "client_observed_events", clientObservedTurnMs: [],
    toolCalls: { requested: 0, available: 0, awaitingReview: 0, unavailable: 0 },
  };
  const copy = () => ({ ...snapshot, clientObservedTurnMs: [...snapshot.clientObservedTurnMs], toolCalls: { ...snapshot.toolCalls }, ...(snapshot.privatePreparation ? { privatePreparation: copyPreparation(snapshot.privatePreparation) } : {}) });
  const emit = () => report?.(copy());
  emit();
  return {
    start() { if (startedAt === undefined && snapshot.status === "connecting") startedAt = now(); },
    ready() { if (snapshot.status !== "connecting") return; if (startedAt !== undefined) snapshot.clientObservedConnectMs = Math.max(0, Math.round(now() - startedAt)); snapshot.status = "ready"; emit(); },
    userTurnReceived() { if (snapshot.status !== "ready") return; awaitingOutputAt = now(); },
    generatedOutputReceived() { if (awaitingOutputAt === undefined || snapshot.status !== "ready") return; const elapsed = now() - awaitingOutputAt; awaitingOutputAt = undefined; if (elapsed < 1) return; snapshot.clientObservedTurnMs.push(Math.round(elapsed)); if (snapshot.clientObservedTurnMs.length > 20) snapshot.clientObservedTurnMs.shift(); emit(); },
    toolRequested() { if (snapshot.status === "ended") return; snapshot.toolCalls.requested++; emit(); },
    toolResult(status: unknown) { if (snapshot.status === "ended") return; if (status === "available") snapshot.toolCalls.available++; else if (status === "awaiting_review") snapshot.toolCalls.awaitingReview++; else snapshot.toolCalls.unavailable++; emit(); },
    privatePreparationEvent(event: PrivatePreparationEvent) {
      if (snapshot.status !== "ready") return;
      if ("ms" in event && (!Number.isFinite(event.ms) || event.ms < 0 || event.ms > 600_000)) return;
      const value = snapshot.privatePreparation ??= {
        speechStopToFinalAsrMs: [], finalAsrToGuidanceAckMs: [], guidanceAckToFirstOutputMs: [], responseRequestToFirstOutputMs: [],
        preAckHits: 0, preAckMisses: 0, asrDeltasBeforeCommit: 0, asrDeltasAfterCommit: 0, asrDeltasDuringSpeech: 0, speechStarts: 0,
      };
      if (event.type === "speech_start") value.speechStarts = Math.min(10_000, value.speechStarts + 1);
      else if (event.type === "pre_ack" || event.type === "asr_delta") {
        const key = event.type === "pre_ack" ? (event.hit ? "preAckHits" : "preAckMisses") : (event.beforeCommit ? "asrDeltasBeforeCommit" : "asrDeltasAfterCommit");
        value[key] = Math.min(10_000, value[key] + 1);
        if (event.type === "asr_delta" && event.duringSpeech) value.asrDeltasDuringSpeech = Math.min(10_000, value.asrDeltasDuringSpeech + 1);
      } else {
        const key = event.type === "speech_stop_to_final_asr" ? "speechStopToFinalAsrMs" : event.type === "final_asr_to_guidance_ack" ? "finalAsrToGuidanceAckMs" : event.type === "response_request_to_first_output" ? "responseRequestToFirstOutputMs" : "guidanceAckToFirstOutputMs";
        value[key].push(Math.round(event.ms));
        if (value[key].length > 20) value[key].shift();
      }
      emit();
    },
    end() { if (snapshot.status === "ended") return; snapshot.status = "ended"; awaitingOutputAt = undefined; emit(); },
    snapshot() { return copy(); },
  };
}
