import type { Judgment } from '../evaluations/schema';

export type TextRehearsalTurn = { role: 'user' | 'assistant'; text: string };
export type TextRehearsalPreviewTurn = TextRehearsalTurn & { sourceTurnIndex: number };
export type RedactionCategory = 'email' | 'phone' | 'address' | 'person' | 'account' | 'order' | 'application' | 'identifier' | 'location' | 'company' | 'date' | 'other';
export type RedactionFinding = { turnIndex: number; start: number; end: number; category: RedactionCategory; placeholder: string };

export type RegressionCriterion = { id: string; text: string; blocking: boolean };
export type RegressionRubric = {
  name: string;
  language: string;
  expectedOutcome: string;
  criteria: RegressionCriterion[];
};

export type RegressionSourceBinding = {
  sessionId: string;
  transcriptDigest: string;
  selectionDigest: string;
  sourceKind: string;
  agentId: string;
  agentVersionId?: string;
  releaseId?: string;
  previewId?: string;
  prefixStartIndex: number;
  selectedCallerTurnIndex: number;
  selectedTurnCount: number;
};

export type RegressionCaseData = {
  schemaVersion: 1;
  familyId: string;
  version: number;
  agentId: string;
  executionMode: 'text_rehearsal';
  evidenceScope: 'transcript_relationship';
  required: boolean;
  source: RegressionSourceBinding;
  derivative: {
    turns: TextRehearsalTurn[];
    triggerIndex: number;
    digest: string;
  };
  redaction: {
    detectorVersion: 1;
    operatorConfirmed: true;
    placeholders: { turnIndex: number; category: RedactionCategory; placeholder: string }[];
  };
  rubric: RegressionRubric;
  createdBy: string;
  reviewedBy: string;
  reviewedAt: string;
  disclaimer: string;
};

export type RegressionCaseRecord = {
  id: string;
  status: 'approved' | 'superseded';
  createdAt: string;
  data: RegressionCaseData;
};

export type RegressionRunData = {
  schemaVersion: 1;
  attemptSequence: number;
  requestHash: string;
  caseId: string;
  caseVersion: number;
  caseDigest: string;
  rubric: RegressionRubric;
  agentId: string;
  agentVersionId: string;
  agentVersionNumber: number;
  agentConfigDigest: string;
  knowledgeDigests: Record<string, string>;
  runtimeInstructionDigest: string;
  executionMode: 'text_rehearsal';
  evidenceScope: 'transcript_relationship';
  transcript: TextRehearsalTurn[];
  responseAiRunId?: string;
  evaluationAiRunId?: string;
  responseModel?: string;
  evaluationModel?: string;
  usage?: { inputTokens: number; outputTokens: number };
  rawEvaluationText?: string;
  judgments: Judgment[];
  invalidReason?: string;
  disclaimer: string;
};

export type RegressionRunRecord = {
  id: string;
  status: 'pending' | 'complete' | 'invalid' | 'uncertain';
  createdAt: string;
  data: RegressionRunData;
};

export type RegressionReviewData = {
  sequence: number;
  runId: string;
  criterionId: string;
  verdict: Judgment['verdict'];
  reason: string;
  operatorId: string;
  caseId: string;
  caseVersion: number;
  caseDigest: string;
  agentVersionId: string;
  responseDigest: string;
  rawVerdict: Judgment['verdict'];
  rawRationale: string;
};

export type RegressionReviewRecord = {
  id: string;
  status: 'recorded';
  createdAt: string;
  data: RegressionReviewData;
};

export type RegressionSuiteCaseResult = {
  caseId: string;
  caseVersion: number;
  caseDigest: string;
  runId?: string;
  status: 'missing' | 'pending' | 'invalid' | 'uncertain' | 'stale' | 'review_needed' | 'failed' | 'passed';
  blockingCriteria: number;
  reviewedBlockingCriteria: number;
};

export type RegressionSuiteCheck = {
  executionMode: 'text_rehearsal';
  evidenceScope: 'transcript_relationship';
  agentId: string;
  agentVersionId: string;
  caseSetDigest: string;
  requiredCases: number;
  passing: boolean;
  cases: RegressionSuiteCaseResult[];
  disclaimer: string;
};

/** References only: never copy customer text, model output or review reasons into a release. */
export type RegressionReleaseEvidence = {
  mode: 'configuration_only' | 'reviewed_text_regression';
  caseSetDigest: string;
  agentConfigDigest: string;
  knowledgeDigests: Record<string, string>;
  cases: { caseId: string; caseVersion: number; caseDigest: string; runId: string; runtimeInstructionDigest: string; reviewIds: string[] }[];
};

export type ReleaseReviewPacket = {
  schemaVersion: 1;
  operation: 'publish' | 'rollback';
  agentId: string;
  agentVersionId: string;
  agentVersionNumber: number;
  latestVersionId: string | null;
  currentReleaseId: string | null;
  testRunId: string | null;
  configurationPassed: boolean;
  mode: RegressionReleaseEvidence['mode'];
  suite: RegressionSuiteCheck;
  blockers: string[];
  publishable: boolean;
  reviewPacketDigest: string;
  disclaimer: string;
};

export type RegressionCasePreviewInput = {
  sourceSessionId: string;
  selectedCallerTurnIndex: number;
  prefixStartIndex?: number;
};
export type RegressionCasePreview = {
  source: RegressionSourceBinding;
  sourceTurns: TextRehearsalPreviewTurn[];
  suggestedDerivative: TextRehearsalTurn[];
  findings: RedactionFinding[];
  limits: { maxTurns: number; maxTurnCharacters: number; maxTotalCharacters: number };
  notice: string;
};

export type RegressionCaseWriteInput = {
  sourceSessionId: string;
  sourceTranscriptDigest: string;
  selectedCallerTurnIndex: number;
  prefixStartIndex?: number;
  turns: TextRehearsalTurn[];
  name: string;
  language: string;
  expectedOutcome: string;
  criteria: { text: string; blocking: boolean }[];
  required: boolean;
  redactionConfirmed: true;
};
export type RegressionCaseReviseInput = RegressionCaseWriteInput & { previousCaseId: string };
export type RegressionRunInput = { requestId: string; caseId: string; agentVersionId: string };
export type RegressionReviewInput = { runId: string; criterionId: string; verdict: Judgment['verdict']; reason: string };
export type RegressionSuiteInput = { agentVersionId: string };

export type RegressionAction = 'case.preview' | 'case.create' | 'case.revise' | 'run.start' | 'review.create' | 'suite.check';
export type RegressionListResponse = { cases: RegressionCaseRecord[]; runs: RegressionRunRecord[]; reviews: RegressionReviewRecord[] };
export type RegressionActionResponse =
  | { preview: RegressionCasePreview }
  | { case: RegressionCaseRecord }
  | { run: RegressionRunRecord }
  | { review: RegressionReviewRecord }
  | { suite: RegressionSuiteCheck };

export const TEXT_REHEARSAL_DISCLAIMER = 'Text rehearsal is a surrogate text simulation. It does not measure Realtime audio, pronunciation, prosody, latency, interruption handling, microphone behavior, or voice quality.';
