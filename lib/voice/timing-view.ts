import { normalizeVoiceDiagnostics, type PrivatePreparationDiagnostics } from "./diagnostics";

export type VoiceTimingStageKey =
  | "connectToReady"
  | "turnToFirstOutput"
  | "speechStopToFinalAsr"
  | "finalAsrToGuidanceAck"
  | "guidanceAckToFirstOutput"
  | "responseRequestToFirstOutput";

export interface VoiceTimingSummary {
  sampleCount: number;
  latestMs?: number;
  p50Ms?: number;
  p95Ms?: number;
}

export interface VoiceTimingStage extends VoiceTimingSummary {
  key: VoiceTimingStageKey;
  label: string;
  description: string;
  microphoneOnly: boolean;
}

export interface VoiceTimingView {
  stages: VoiceTimingStage[];
  privatePreparationObserved: boolean;
  speechStarts?: number;
  preAckHits?: number;
  preAckMisses?: number;
  asrDeltasBeforeCommit?: number;
  asrDeltasAfterCommit?: number;
  asrDeltasDuringSpeech?: number;
}

const P50_MIN_SAMPLES = 3;
const P95_MIN_SAMPLES = 20;

function percentile(sorted: number[], proportion: number) {
  const position = (sorted.length - 1) * proportion;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower));
}

export function summarizeVoiceTiming(samples: readonly number[]): VoiceTimingSummary {
  if (!samples.length) return { sampleCount: 0 };
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    sampleCount: samples.length,
    latestMs: samples.at(-1),
    ...(samples.length >= P50_MIN_SAMPLES ? { p50Ms: percentile(sorted, 0.5) } : {}),
    ...(samples.length >= P95_MIN_SAMPLES ? { p95Ms: percentile(sorted, 0.95) } : {}),
  };
}

function stage(
  key: VoiceTimingStageKey,
  label: string,
  description: string,
  samples: readonly number[],
  microphoneOnly = false,
): VoiceTimingStage {
  return { key, label, description, microphoneOnly, ...summarizeVoiceTiming(samples) };
}

/** Builds display-only evidence from the same allowlist used for server persistence. */
export function createVoiceTimingView(value: unknown): VoiceTimingView | undefined {
  const diagnostics = normalizeVoiceDiagnostics(value);
  if (!diagnostics) return undefined;
  const preparation: PrivatePreparationDiagnostics | undefined = diagnostics.privatePreparation;
  return {
    stages: [
      stage(
        "connectToReady",
        "Connect → ready",
        "Browser connect start to the provider ready or data-channel-open event.",
        diagnostics.clientObservedConnectMs === undefined ? [] : [diagnostics.clientObservedConnectMs],
      ),
      stage(
        "turnToFirstOutput",
        "Accepted turn → first output",
        "Accepted typed input or received final transcript to the first generated-output event.",
        diagnostics.clientObservedTurnMs,
      ),
      stage(
        "speechStopToFinalAsr",
        "Speech stop → final ASR",
        "Microphone speech-stop event to the final ASR client event.",
        preparation?.speechStopToFinalAsrMs ?? [],
        true,
      ),
      stage(
        "finalAsrToGuidanceAck",
        "Final ASR → guidance ACK",
        "Remaining wait after final ASR. A 0 ms observation can mean the exact candidate was acknowledged earlier.",
        preparation?.finalAsrToGuidanceAckMs ?? [],
        true,
      ),
      stage(
        "guidanceAckToFirstOutput",
        "Guidance ACK → first output",
        "Literal elapsed interval from the acknowledgement. It can overlap ongoing speech and is not response latency.",
        preparation?.guidanceAckToFirstOutputMs ?? [],
      ),
      stage(
        "responseRequestToFirstOutput",
        "Response request → first output",
        "Response-request event to the first generated-output event, including typed and tool-continuation responses.",
        preparation?.responseRequestToFirstOutputMs ?? [],
      ),
    ],
    privatePreparationObserved: diagnostics.privatePreparation !== undefined,
    ...(preparation ? {
      speechStarts: preparation.speechStarts,
      preAckHits: preparation.preAckHits,
      preAckMisses: preparation.preAckMisses,
      asrDeltasBeforeCommit: preparation.asrDeltasBeforeCommit,
      asrDeltasAfterCommit: preparation.asrDeltasAfterCommit,
      asrDeltasDuringSpeech: preparation.asrDeltasDuringSpeech,
    } : {}),
  };
}
