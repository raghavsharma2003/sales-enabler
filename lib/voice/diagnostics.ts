export interface VoiceRuntimeDiagnostics {
  /** Elapsed from browser connect() entry to provider ready/data channel open. */
  clientObservedConnectMs?: number;
  /** Receipt of a user transcript or accepted typed turn to first generated output event. */
  clientObservedTurnMs: number[];
  toolCalls: { requested: number; available: number; awaitingReview: number; unavailable: number };
  status: "connecting" | "ready" | "ended";
  /** These are browser event timings, not measured acoustic or end-to-end latency. */
  measurement: "client_observed_events";
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
  return {
    status: raw.status as VoiceRuntimeDiagnostics["status"], measurement: "client_observed_events",
    ...(raw.clientObservedConnectMs === undefined ? {} : { clientObservedConnectMs: raw.clientObservedConnectMs as number }),
    clientObservedTurnMs: [...raw.clientObservedTurnMs],
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
  const emit = () => report?.({ ...snapshot, clientObservedTurnMs: [...snapshot.clientObservedTurnMs], toolCalls: { ...snapshot.toolCalls } });
  emit();
  return {
    start() { if (startedAt === undefined && snapshot.status === "connecting") startedAt = now(); },
    ready() { if (snapshot.status !== "connecting") return; if (startedAt !== undefined) snapshot.clientObservedConnectMs = Math.max(0, Math.round(now() - startedAt)); snapshot.status = "ready"; emit(); },
    userTurnReceived() { if (snapshot.status !== "ready") return; awaitingOutputAt = now(); },
    generatedOutputReceived() { if (awaitingOutputAt === undefined || snapshot.status !== "ready") return; const elapsed = now() - awaitingOutputAt; awaitingOutputAt = undefined; if (elapsed < 1) return; snapshot.clientObservedTurnMs.push(Math.round(elapsed)); if (snapshot.clientObservedTurnMs.length > 20) snapshot.clientObservedTurnMs.shift(); emit(); },
    toolRequested() { if (snapshot.status === "ended") return; snapshot.toolCalls.requested++; emit(); },
    toolResult(status: unknown) { if (snapshot.status === "ended") return; if (status === "available") snapshot.toolCalls.available++; else if (status === "awaiting_review") snapshot.toolCalls.awaitingReview++; else snapshot.toolCalls.unavailable++; emit(); },
    end() { if (snapshot.status === "ended") return; snapshot.status = "ended"; awaitingOutputAt = undefined; emit(); },
    snapshot() { return { ...snapshot, clientObservedTurnMs: [...snapshot.clientObservedTurnMs], toolCalls: { ...snapshot.toolCalls } }; },
  };
}
