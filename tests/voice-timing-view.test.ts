import assert from "node:assert/strict";
import test from "node:test";
import { createVoiceTimingView, summarizeVoiceTiming } from "../lib/voice/timing-view";

const diagnostics = {
  status: "ended",
  measurement: "client_observed_events",
  clientObservedConnectMs: 140,
  clientObservedTurnMs: [400, 300, 500],
  toolCalls: { requested: 0, available: 0, awaitingReview: 0, unavailable: 0 },
  privatePreparation: {
    speechStopToFinalAsrMs: [120, 80, 100],
    finalAsrToGuidanceAckMs: [0, 30, 10],
    guidanceAckToFirstOutputMs: [450],
    responseRequestToFirstOutputMs: [190],
    speechStarts: 2,
    preAckHits: 1,
    preAckMisses: 1,
    asrDeltasBeforeCommit: 3,
    asrDeltasAfterCommit: 2,
    asrDeltasDuringSpeech: 2,
  },
};

test("timing view uses the persistence normalizer and preserves missing evidence", () => {
  const view = createVoiceTimingView(diagnostics);
  assert.ok(view);
  assert.deepEqual(view.stages.find(stage => stage.key === "speechStopToFinalAsr"), {
    key: "speechStopToFinalAsr",
    label: "Speech stop → final ASR",
    description: "Microphone speech-stop event to the final ASR client event.",
    microphoneOnly: true,
    sampleCount: 3,
    latestMs: 100,
    p50Ms: 100,
  });
  assert.equal(view.stages.find(stage => stage.key === "guidanceAckToFirstOutput")?.p50Ms, undefined);
  assert.equal(view.asrDeltasDuringSpeech, 2);
  assert.equal(view.speechStarts, 2);

  const withoutPreparation = createVoiceTimingView({ ...diagnostics, privatePreparation: undefined });
  assert.ok(withoutPreparation);
  assert.equal(withoutPreparation.privatePreparationObserved, false);
  assert.equal(withoutPreparation.stages.find(stage => stage.key === "speechStopToFinalAsr")?.latestMs, undefined);
  assert.equal(withoutPreparation.speechStarts, undefined);
  assert.equal(withoutPreparation.preAckHits, undefined);
});

test("timing view rejects invalid stored evidence and exposes allowlisted fields only", () => {
  assert.equal(createVoiceTimingView({ ...diagnostics, clientObservedTurnMs: [Number.NaN] }), undefined);
  assert.equal(createVoiceTimingView({ ...diagnostics, measurement: "acoustic_latency" }), undefined);
  assert.equal(createVoiceTimingView({ ...diagnostics, privatePreparation: { ...diagnostics.privatePreparation, providerPayload: "private" } })?.privatePreparationObserved, true);
});

test("percentiles appear only with a meaningful bounded sample count", () => {
  assert.deepEqual(summarizeVoiceTiming([]), { sampleCount: 0 });
  assert.deepEqual(summarizeVoiceTiming([9]), { sampleCount: 1, latestMs: 9 });
  assert.deepEqual(summarizeVoiceTiming([30, 10, 20]), { sampleCount: 3, latestMs: 20, p50Ms: 20 });
  const twenty = Array.from({ length: 20 }, (_, index) => (index + 1) * 10);
  assert.deepEqual(summarizeVoiceTiming(twenty), { sampleCount: 20, latestMs: 200, p50Ms: 105, p95Ms: 191 });
});
