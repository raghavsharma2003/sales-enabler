export type AudioProofCriterion = {
  id: string;
  text: string;
  dimension: 'intelligibility' | 'pacing' | 'relationship_delivery';
};

export type AudioProofScenario = {
  id: string;
  familyId: string;
  version: 1;
  name: string;
  language: 'English';
  callerText: string;
  purpose: string;
  expectedDelivery: string;
  criteria: AudioProofCriterion[];
  source: 'built_in_fictional';
};

export const AUDIO_PROOF_SCENARIOS: readonly AudioProofScenario[] = [{
  id: 'audio.relationship.unhurried.en:v1',
  familyId: 'audio.relationship.unhurried.en',
  version: 1,
  name: 'Explain one step calmly',
  language: 'English',
  callerText: "I'm feeling overwhelmed. Please explain the next step slowly, one point at a time.",
  purpose: 'Exercise an explicit caller request for a slower, simpler explanation using fictional synthetic speech.',
  expectedDelivery: 'The AI acknowledges the stated concern without diagnosing emotion, speaks unhurriedly, and gives one manageable next step.',
  criteria: [
    { id: 'intelligibility', text: 'The spoken response is intelligible without consulting the transcript.', dimension: 'intelligibility' },
    { id: 'pacing', text: 'The response sounds unhurried and presents one manageable point.', dimension: 'pacing' },
    { id: 'relationship_delivery', text: 'The response sounds professionally warm and respectful without claiming to know a hidden emotion.', dimension: 'relationship_delivery' },
  ],
  source: 'built_in_fictional',
}] as const;

export type AudioArtifactRef = {
  id: string;
  sha256: string;
  mimeType: 'audio/wav';
  bytes: number;
  durationMs: number;
  sampleRate: number;
  channels: number;
  expiresAt: string;
  playbackUrl: string;
};

export type SyntheticFixtureData = {
  schemaVersion: 1;
  requestHash: string;
  scenarioId: string;
  scenarioVersion: number;
  scenarioDigest: string;
  artifact?: AudioArtifactRef;
  provenance: {
    sourceKind: 'synthetic_azure_speech';
    synthetic: true;
    participantConsent: 'not_applicable_synthetic';
    generator: 'azure_speech_sdk';
    synthesisVoice: string;
    sourceText: string;
    sourceTextDigest: string;
  };
  captureConsent: { actorId: string; confirmedAt: string; scope: 'store_synthetic_input_for_audio_proof' };
  failureCode?: AudioProofFailureCode;
  disclaimer: string;
};

export type AudioProofTraceKind =
  | 'socket_open'
  | 'session_configured'
  | 'input_first_audio_sent'
  | 'input_audio_finished'
  | 'input_committed'
  | 'provider_speech_started'
  | 'provider_speech_stopped'
  | 'transcript_final'
  | 'behavior_compiled'
  | 'behavior_acknowledged'
  | 'response_requested'
  | 'response_created'
  | 'first_server_audio'
  | 'response_done'
  | 'socket_closed';

export type AudioProofTraceEvent = { sequence: number; kind: AudioProofTraceKind; atMs: number };

export type AudioProofRunManifest = {
  schemaVersion: 1;
  protocol: 'azure_realtime_synthetic_audio_proof_v1';
  scenario: AudioProofScenario;
  scenarioDigest: string;
  fixture: Pick<AudioArtifactRef, 'id' | 'sha256' | 'durationMs' | 'sampleRate' | 'channels'>;
  agent: { id: string; versionId: string; versionNumber: number; configDigest: string; sourceRevision: number };
  knowledgeDigests: Record<string, string>;
  contextDigest: string;
  promptDigest: string;
  sessionConfigDigest: string;
  runtimePolicyDigest?: string;
  provider: 'azure';
  apiSurface: 'azure_openai_realtime_websocket';
  modelReferenceDigest: string;
  voice: string;
  inputTranscription: 'gpt-4o-mini-transcribe';
  tools: 'disabled';
  memory: 'disabled_no_contact';
  businessActions: 'disabled';
  captureConsent: { actorId: string; confirmedAt: string; scope: 'store_synthetic_input_and_ai_output_for_audio_proof' };
  startedAt: string;
  runnerVersion: 1;
  unknownProviderInternals: readonly ['model_weights_revision', 'regional_serving_build'];
};

export type AudioProofRunData = {
  schemaVersion: 1;
  requestHash: string;
  scenarioId: string;
  fixtureId: string;
  agentVersionId: string;
  manifest?: AudioProofRunManifest;
  manifestDigest?: string;
  inputArtifact?: AudioArtifactRef;
  outputArtifact?: AudioArtifactRef;
  transcript?: { expectedCallerText: string; recognizedCallerText: string; assistantText: string };
  trace?: AudioProofTraceEvent[];
  measurements?: {
    inputAudioDurationMs: number;
    outputAudioDurationMs: number;
    inputFinishedToTranscriptFinalMs?: number;
    responseRequestedToFirstServerAudioMs?: number;
    responseRequestedToDoneMs?: number;
  };
  uncertainty: string[];
  failureCode?: AudioProofFailureCode;
  disclaimer: string;
};

export type AudioProofFailureCode =
  | 'configuration_unavailable'
  | 'authority_changed'
  | 'fixture_unavailable'
  | 'provider_rejected'
  | 'provider_protocol'
  | 'transport_uncertain'
  | 'deadline_exceeded'
  | 'audio_unavailable';

export type AudioProofRecord<T> = {
  id: string;
  status: 'pending' | 'complete' | 'failed' | 'uncertain';
  createdAt: string;
  data: T;
};

export type AudioListeningReviewData = {
  schemaVersion: 1;
  runId: string;
  scenarioId: string;
  criterionId: string;
  verdict: 'met' | 'not_met' | 'uncertain';
  reason: string;
  operatorId: string;
  heardOutput: true;
  outputArtifactId: string;
  outputSha256: string;
  manifestDigest: string;
  attestation: 'operator_reports_listening';
  disclaimer: string;
};

export const AUDIO_PROOF_DISCLAIMER = 'This run uses one synthetic caller fixture on an evaluation-only Azure Realtime path. It does not establish physical-microphone behavior, human accent recognition, customer emotion, general language quality, browser playback, competitor superiority, or production readiness.';

export function audioProofScenario(id: string): AudioProofScenario | undefined {
  return AUDIO_PROOF_SCENARIOS.find(item => item.id === id);
}
