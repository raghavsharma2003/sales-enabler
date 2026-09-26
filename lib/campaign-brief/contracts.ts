import type { AiTaskResult } from '../ai/task-router';
import type { ReviewColumn, SourceAnchorRef } from '../business/contracts';

export type CampaignBriefSuggestion = {
  outcome: string | null;
  evidenceRequired: string[];
  audienceRationale: string | null;
  questionsToCollect: string[];
  missingContextQuestions: string[];
};

export type CampaignBriefProposal = {
  requestId: string;
  requestHash: string;
  offeringId: string;
  offeringRevision: number;
  offeringDigest: string;
  goal: string;
  contactIds: string[];
  selectedContactCount: number;
  sourceBasis: SourceAnchorRef[];
  suggestion?: CampaignBriefSuggestion;
  reviewColumns?: ReviewColumn[];
  model?: string;
  aiRunId?: string;
  usage?: AiTaskResult['usage'];
  invalidReason?: string;
  priorInvalidReasons?: string[];
  recheckedAt?: string;
  createdBy: string;
};
